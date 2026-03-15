import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth as authAPI } from '../services/api.js'
import SEOHead from '../components/SEOHead'

const PLAN_LABELS = {
    starter: 'Starter — Free',
    professional: 'Professional — $49/mo',
    enterprise: 'Enterprise — $199/mo',
}

export default function Auth() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { login, register, isAuthenticated, loading: authLoading, loginWithToken } = useAuth()
    const [isLogin, setIsLogin] = useState(true)
    const [loading, setLoading] = useState(false)
    const [isSocialLoading, setIsSocialLoading] = useState(false)
    const [error, setError] = useState('')
    const [form, setForm] = useState({ name: '', email: '', password: '', company: '' })
    const pollingRef = useRef(null)

    const redirect = searchParams.get('redirect') || '/dashboard'
    const plan = searchParams.get('plan')
    const scanUrl = searchParams.get('scanUrl')
    const emailParam = searchParams.get('email')
    const modeParam = searchParams.get('mode')
    const isSignupPath = window.location.pathname === '/signup'

    // Initial setup from URL parameters
    useEffect(() => {
        if (isSignupPath || modeParam === 'signup') {
            setIsLogin(false)
        }
        if (emailParam) {
            setForm(prev => ({ ...prev, email: emailParam }))
        }
    }, [isSignupPath, modeParam, emailParam])

    // If already authenticated, redirect immediately
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            let dest = redirect
            if (scanUrl) {
                dest = `/onboarding?scanUrl=${encodeURIComponent(scanUrl)}`
            }
            navigate(dest, { replace: true })
        }
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current)
        }
    }, [isAuthenticated, authLoading, navigate, redirect, scanUrl])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError('')
        try {
            if (isLogin) {
                await login(form.email, form.password)
            } else {
                await register(form.name, form.email, form.password, form.company)
            }
            // After auth, redirect to intended destination
            let dest = redirect
            if (scanUrl) {
                dest = `/onboarding?scanUrl=${encodeURIComponent(scanUrl)}`
            }
            navigate(dest, { replace: true })
        } catch (err) {
            setError(err.message || 'Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

    const handleGoogleLogin = async () => {
        try {
            setError('');
            setIsSocialLoading(true);

            // 1. Get the auth URL from backend
            const { authUrl } = await authAPI.google();

            // 2. Open popup
            const width = 500;
            const height = 600;
            const left = window.screen.width / 2 - width / 2;
            const top = window.screen.height / 2 - height / 2;

            const popup = window.open(
                authUrl,
                'google-auth',
                `width=${width},height=${height},left=${left},top=${top}`
            );

            if (!popup) {
                throw new Error('Popup blocked! Please allow popups for this site.');
            }

            // 3. Listen for message from popup
            const handleMessage = (event) => {
                // Allow messages from same site (including api subdomain)
                const isSameSite = event.origin === window.location.origin ||
                    event.origin.includes('mantram.ai') ||
                    event.origin.includes('localhost');

                if (!isSameSite) return;

                if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                    const { token, user, error: authError } = event.data;

                    if (authError) {
                        setError(authError);
                        setIsSocialLoading(false);
                    } else if (token && user) {
                        if (pollingRef.current) clearInterval(pollingRef.current);
                        loginWithToken(token, user);
                    }
                    window.removeEventListener('message', handleMessage);
                }
            };

            window.addEventListener('message', handleMessage);

            // 4. Poll for popup closure
            pollingRef.current = setInterval(() => {
                if (!popup) {
                    clearInterval(pollingRef.current);
                    return;
                }
                try {
                    // Accessing .closed can trigger a console error if the popup is on a strict origin
                    // even inside a try-catch. We'll just ignore it if it fails.
                    if (popup.closed) {
                        clearInterval(pollingRef.current);
                        setTimeout(() => setIsSocialLoading(false), 500);
                    }
                } catch (e) {
                    // cross-origin access to .closed is sometimes blocked by COOP
                }
            }, 500);

        } catch (err) {
            console.error('Google login error:', err);
            setError(err.message || 'Failed to initiate Google login');
            setIsSocialLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative" style={{ background: '#0a0c16' }}>
            <SEOHead
                title={isLogin ? 'Sign In — Mantram AI' : 'Create Account — Mantram AI'}
                description="Sign in or create your Mantram AI account to access 12 AI-powered marketing studios — Content, Creative, Video, Ads, SEO, D2C, Conversations, Brainstorm & more."
                canonical="/auth"
                noIndex={true}
            />
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[20%] w-[40%] h-[40%] bg-primary/15 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[10%] w-[30%] h-[30%] bg-purple-500/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-xl overflow-hidden">
                            <img src="/mantram-logo.png" alt="Mantram AI" className="size-10" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-white tracking-tight">Mantram AI</h1>
                    </div>
                    <p className="text-slate-400 text-sm">
                        {isLogin ? 'Welcome back. Sign in to continue.' : 'Create your account to get started.'}
                    </p>

                    {/* Plan context banner */}
                    {plan && PLAN_LABELS[plan] && (
                        <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                            <span className="material-symbols-outlined text-sm">verified</span>
                            {isLogin ? 'Sign in' : 'Sign up'} for {PLAN_LABELS[plan]}
                        </div>
                    )}

                    {/* Scan URL context */}
                    {scanUrl && (
                        <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                            <span className="material-symbols-outlined text-sm">language</span>
                            {isLogin ? 'Sign in' : 'Sign up'} to scan {scanUrl}
                        </div>
                    )}
                </div>

                {/* Auth Card */}
                <div className="glass-panel rounded-2xl p-8">
                    {/* Tabs */}
                    <div className="flex rounded-xl bg-white/[0.04] p-1 mb-6">
                        <button onClick={() => { setIsLogin(true); setError('') }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${isLogin ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'
                                }`}>
                            Sign In
                        </button>
                        <button onClick={() => { setIsLogin(false); setError('') }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${!isLogin ? 'bg-primary text-white shadow-lg' : 'text-slate-400 hover:text-white'
                                }`}>
                            Sign Up
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <>
                                <div>
                                    <label className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-1.5 block">Full Name</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">person</span>
                                        <input
                                            type="text" 
                                            name="name"
                                            id="auth-name"
                                            value={form.name} 
                                            onChange={e => update('name', e.target.value)}
                                            placeholder="John Doe" 
                                            required
                                            className="input-glass w-full pl-10 py-3"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-1.5 block">Company</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">business</span>
                                        <input
                                            type="text" 
                                            name="company"
                                            id="auth-company"
                                            value={form.company} 
                                            onChange={e => update('company', e.target.value)}
                                            placeholder="Your Company (optional)"
                                            className="input-glass w-full pl-10 py-3"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-1.5 block">Email</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">mail</span>
                                <input
                                    type="email" 
                                    name="email"
                                    id="auth-email"
                                    value={form.email} 
                                    onChange={e => update('email', e.target.value)}
                                    placeholder="you@company.com" 
                                    required 
                                    autoFocus
                                    className="input-glass w-full pl-10 py-3"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm text-slate-500 font-bold uppercase tracking-widest mb-1.5 block">Password</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-lg">lock</span>
                                <input
                                    type="password" 
                                    name="password"
                                    id="auth-password"
                                    value={form.password} 
                                    onChange={e => update('password', e.target.value)}
                                    placeholder="••••••••" 
                                    required 
                                    minLength={6}
                                    className="input-glass w-full pl-10 py-3"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">error</span> {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-50">
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                    {isLogin ? 'Signing in...' : 'Creating account...'}
                                </span>
                            ) : (
                                isLogin ? 'Sign In' : 'Create Account'
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-white/[0.08]" />
                        <span className="text-xs text-slate-600">or</span>
                        <div className="flex-1 h-px bg-white/[0.08]" />
                    </div>

                    {/* Google OAuth */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading || isSocialLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm font-medium hover:bg-white/[0.06] transition-all cursor-pointer disabled:opacity-50"
                    >
                        {isSocialLoading ? (
                            <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                        )}
                        Continue with Google
                    </button>
                </div>

                {/* Back to home */}
                <div className="text-center mt-6">
                    <button onClick={() => navigate('/')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors cursor-pointer">
                        ← Back to Home
                    </button>
                </div>
            </div>
        </div>
    )
}

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { auth as authAPI, API_BASE } from '../services/api.js'
import SEOHead from '../components/SEOHead'

const PLAN_LABELS = {
    starter: 'Starter — Free',
    professional: 'Professional — $49/mo',
    enterprise: 'Enterprise — $199/mo',
}

export default function Auth() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { login, register, isAuthenticated, loading: authLoading, loginWithToken, user } = useAuth()
    const [isLogin, setIsLogin] = useState(true)
    const [loading, setLoading] = useState(false)
    const [isSocialLoading, setIsSocialLoading] = useState(false)
    const [error, setError] = useState('')
    const [form, setForm] = useState({ name: '', email: '', password: '', company: '' })
    const [showPassword, setShowPassword] = useState(false)
    const [showForgot, setShowForgot] = useState(false)
    const [forgotEmail, setForgotEmail] = useState('')
    const [forgotMessage, setForgotMessage] = useState('')
    const [successMessage, setSuccessMessage] = useState('')
    const [forgotLoading, setForgotLoading] = useState(false)
    const pollingRef = useRef(null)

    const redirect = searchParams.get('redirect') || '/templates'
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

    // Handle Google Redirect Callback
    useEffect(() => {
        const token = searchParams.get('token');
        const userData = searchParams.get('user');
        const loginError = searchParams.get('error');

        if (loginError) {
            setError(decodeURIComponent(loginError));
            // Cleanup URL
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('error');
            navigate(`${window.location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`, { replace: true });
        } else if (token && userData) {
            try {
                const user = JSON.parse(decodeURIComponent(userData));
                loginWithToken(token, user);
                // Redirection to dashboard is handled by the "isAuthenticated" useEffect below
            } catch (e) {
                console.error('Failed to parse user data from redirect:', e);
                setError('Authentication failed. Please try again.');
            }
        }
    }, [searchParams, loginWithToken, navigate]);

    // If already authenticated, redirect immediately
    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            if (pollingRef.current) clearInterval(pollingRef.current)
            let dest = redirect
            
            if (dest === '/templates' || dest === '/dashboard') {
                const hasBrand = (user?.brandCount ?? 0) > 0;
                const hasPendingBrand = !!localStorage.getItem('mantram_pending_brand');
                if (!hasBrand && !hasPendingBrand) {
                    dest = '/onboarding';
                }
            }

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
        setSuccessMessage('')
        try {
            let res;
            if (isLogin) {
                res = await login(form.email, form.password)
            } else {
                // Check for pending website in localStorage or URL
                let initialWebsite = scanUrl || ''
                if (!initialWebsite) {
                    try {
                        const pending = JSON.parse(localStorage.getItem('mantram_pending_brand') || '{}')
                        initialWebsite = pending.website || ''
                    } catch (e) {}
                }
                res = await register(form.name, form.email, form.password, form.company, initialWebsite)
                if (!res.token) {
                    setIsLogin(true);
                    setForm(prev => ({ ...prev, password: '' }));
                    setSuccessMessage('Access request received! We will notify you via email once your account is approved.');
                    return;
                }
            }            // After auth, redirect to intended destination
            let dest = redirect;
            
            // Logic for "New user vs Older user" redirection
            // If the destination is the default dashboard...
            if (dest === '/templates' || dest === '/dashboard') {
                const hasBrand = (res?.user?.brandCount ?? 0) > 0;
                const hasPendingBrand = !!localStorage.getItem('mantram_pending_brand');
                if (!hasBrand && !hasPendingBrand) {
                    dest = '/onboarding';
                }
            }

            if (scanUrl) {
                dest = `/onboarding?scanUrl=${encodeURIComponent(scanUrl)}`
            }
            navigate(dest, { replace: true })

        } catch (err) {
            if (err.code === 'USER_NOT_FOUND' || err.message?.includes('not found')) {
                setIsLogin(false);
                setError('Account not found. Let\'s create one for you!');
            } else {
                setError(err.message || 'Something went wrong');
            }
        } finally {
            setLoading(false)
        }
    }

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }))

    const handleForgotPassword = async (e) => {
        e.preventDefault()
        if (!forgotEmail.trim()) return setError('Enter your email address')
        setForgotLoading(true)
        setError('')
        setForgotMessage('')
        try {
            const res = await authAPI.forgotPassword(forgotEmail.trim())
            setForgotMessage(res.message || 'If an account exists, a reset link has been sent.')
        } catch (err) {
            setError(err.message || 'Failed to send reset email')
        } finally {
            setForgotLoading(false)
        }
    }

    const handleGoogleLogin = () => {
        setError('');
        setIsSocialLoading(true);
        // Redirect to backend with flow=redirect
        // This avoids COOP/popup issues in modern browsers
        window.location.href = `${API_BASE}/auth/google?flow=redirect`;
    };

    const handleFacebookLogin = () => {
        setError('');
        setIsSocialLoading(true);
        window.location.href = `${API_BASE}/auth/facebook?flow=redirect`;
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
                <div className="absolute bottom-[-10%] right-[10%] w-[30%] h-[30%] bg-[#FF4D00]/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-md px-6">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-xl overflow-hidden">
                            <img src="/mantram-logo.png" alt="Mantram AI" className="size-10" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-[var(--sys-text)] tracking-tight">Mantram AI</h1>
                    </div>
                    <p className="text-[var(--sys-text-muted)] text-sm">
                        {isLogin ? 'Welcome back. Sign in to continue.' : 'Apply for early access to Mantram AI.'}
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
                        <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-xs font-bold">
                            <span className="material-symbols-outlined text-sm">language</span>
                            {isLogin ? 'Sign in' : 'Sign up'} to scan {scanUrl}
                        </div>
                    )}
                </div>

                {/* Auth Card */}
                <div className="glass-panel rounded-2xl p-8 relative overflow-hidden">
                    {/* Tabs */}
                    <div className="flex rounded-xl bg-[var(--sys-surface)] p-1 mb-6">
                        <button onClick={() => { setIsLogin(true); setError('') }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${isLogin ? 'bg-primary text-white shadow-lg' : 'text-[var(--sys-text-muted)] hover:text-white'
                                }`}>
                            Sign In
                        </button>
                        <button onClick={() => { setIsLogin(false); setError(''); setSuccessMessage(''); }}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${!isLogin ? 'bg-primary text-white shadow-lg' : 'text-[var(--sys-text-muted)] hover:text-white'
                                }`}>
                            Request Access
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <>
                                <div>
                                    <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">Full Name</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">person</span>
                                        <input
                                            type="text" 
                                            name="name"
                                            id="auth-name"
                                            value={form.name} 
                                            onChange={e => update('name', e.target.value)}
                                            placeholder="John Doe" 
                                            required
                                            className="input-glass w-full py-3"
                                            style={{ paddingLeft: '2.75rem' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">Company</label>
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">business</span>
                                        <input
                                            type="text" 
                                            name="company"
                                            id="auth-company"
                                            value={form.company} 
                                            onChange={e => update('company', e.target.value)}
                                            placeholder="Your Company (optional)"
                                            className="input-glass w-full py-3"
                                            style={{ paddingLeft: '2.75rem' }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">Email</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">mail</span>
                                <input
                                    type="email" 
                                    name="email"
                                    id="auth-email"
                                    value={form.email} 
                                    onChange={e => update('email', e.target.value)}
                                    placeholder="you@company.com" 
                                    required 
                                    autoFocus
                                    autoComplete="username"
                                    className="input-glass w-full py-3"
                                    style={{ paddingLeft: '2.75rem' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">Password</label>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">lock</span>
                                <input
                                    type={showPassword ? 'text' : 'password'} 
                                    name="password"
                                    id="auth-password"
                                    value={form.password} 
                                    onChange={e => update('password', e.target.value)}
                                    placeholder="••••••••" 
                                    required 
                                    minLength={6}
                                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    className="input-glass w-full pr-10 py-3"
                                    style={{ paddingLeft: '2.75rem' }}
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer"
                                    tabIndex={-1}>
                                    <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>
                            {isLogin && (
                                <button type="button" onClick={() => { setShowForgot(true); setForgotEmail(form.email); setError(''); setForgotMessage('') }}
                                    className="text-xs text-primary/70 hover:text-primary mt-2 cursor-pointer transition-colors">
                                    Forgot Password?
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-sm flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg">error</span> {error}
                            </div>
                        )}
                        {successMessage && (
                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm flex items-start gap-2">
                                <span className="material-symbols-outlined text-lg shrink-0">check_circle</span> 
                                <span>{successMessage}</span>
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
                                isLogin ? 'Sign In' : 'Request Access'
                            )}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-[var(--sys-surface)]" />
                        <span className="text-xs text-[var(--sys-text-muted)]">or</span>
                        <div className="flex-1 h-px bg-[var(--sys-surface)]" />
                    </div>

                    {/* Google OAuth */}
                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading || isSocialLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm font-medium hover:bg-[var(--sys-surface)] transition-all cursor-pointer disabled:opacity-50"
                    >
                        {isSocialLoading ? (
                            <div className="size-5 border border-[var(--sys-border)] border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="size-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
                        )}
                        Continue with Google
                    </button>

                    {/* Facebook OAuth */}
                    <button
                        type="button"
                        onClick={handleFacebookLogin}
                        disabled={loading || isSocialLoading}
                        className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm font-medium hover:bg-[var(--sys-surface)] transition-all cursor-pointer disabled:opacity-50 mt-2"
                    >
                        {isSocialLoading ? (
                            <div className="size-5 border border-[var(--sys-border)] border-t-white rounded-full animate-spin" />
                        ) : (
                            <svg className="size-5" viewBox="0 0 24 24"><path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                        )}
                        Continue with Facebook
                    </button>

                    {/* Forgot Password Overlay */}
                    {showForgot && (
                        <div className="absolute inset-0 bg-[#0a0c16]/95 rounded-2xl flex flex-col items-center justify-center p-8 z-20">
                            <span className="material-symbols-outlined text-4xl text-primary mb-4">lock_reset</span>
                            <h3 className="text-[var(--sys-text)] text-lg font-bold mb-2">Reset Password</h3>
                            <p className="text-[var(--sys-text-muted)] text-xs text-center mb-6">Enter your email and we'll send a link to reset your password.</p>
                            
                            {forgotMessage && (
                                <div className="w-full p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-sm mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">check_circle</span> {forgotMessage}
                                </div>
                            )}
                            {error && (
                                <div className="w-full p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-sm mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">error</span> {error}
                                </div>
                            )}

                            <form onSubmit={handleForgotPassword} className="w-full space-y-4">
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">mail</span>
                                    <input
                                        type="email"
                                        id="forgot-email"
                                        value={forgotEmail}
                                        onChange={e => setForgotEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        required
                                        autoFocus
                                        className="input-glass w-full py-3"
                                        style={{ paddingLeft: '2.75rem' }}
                                    />
                                </div>
                                <button type="submit" disabled={forgotLoading}
                                    className="btn-primary w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                                    {forgotLoading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                            Sending...
                                        </span>
                                    ) : 'Send Reset Link'}
                                </button>
                            </form>

                            <button onClick={() => { setShowForgot(false); setError(''); setForgotMessage('') }}
                                className="mt-4 text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer">
                                ← Back to Sign In
                            </button>
                        </div>
                    )}
                </div>

                {/* Back to home */}
                <div className="text-center mt-6">
                    <button onClick={() => navigate('/')} className="text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer">
                        ← Back to Home
                    </button>
                </div>
            </div>
        </div>
    )
}

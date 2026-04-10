import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { auth as authAPI } from '../services/api.js'
import SEOHead from '../components/SEOHead'

export default function ResetPassword() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (password.length < 6) return setError('Password must be at least 6 characters')
        if (password !== confirmPassword) return setError('Passwords do not match')
        
        setLoading(true)
        setError('')
        try {
            const res = await authAPI.resetPassword(token, password)
            setSuccess(res.message || 'Password reset successfully!')
            setTimeout(() => navigate('/login'), 3000)
        } catch (err) {
            setError(err.message || 'Failed to reset password')
        } finally {
            setLoading(false)
        }
    }

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c16' }}>
                <div className="text-center">
                    <span className="material-symbols-outlined text-5xl text-primary mb-4 block">error</span>
                    <h2 className="text-[var(--sys-text)] text-xl font-bold mb-2">Invalid Reset Link</h2>
                    <p className="text-[var(--sys-text-muted)] text-sm mb-6">This password reset link is invalid or missing a token.</p>
                    <button onClick={() => navigate('/login')} className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold">
                        Go to Login
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center relative" style={{ background: '#0a0c16' }}>
            <SEOHead title="Reset Password — Mantram AI" description="Set a new password for your Mantram AI account." noIndex={true} />
            
            {/* Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-20%] left-[20%] w-[40%] h-[40%] bg-primary/15 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[10%] w-[30%] h-[30%] bg-[#FF4D00]/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 w-full max-w-md px-6">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-3 mb-4">
                        <div className="size-10 rounded-xl overflow-hidden">
                            <img src="/mantram-logo.png" alt="Mantram AI" className="size-10" />
                        </div>
                        <h1 className="text-2xl font-extrabold text-[var(--sys-text)] tracking-tight">Mantram AI</h1>
                    </div>
                    <p className="text-[var(--sys-text-muted)] text-sm">Set your new password below.</p>
                </div>

                <div className="glass-panel rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="material-symbols-outlined text-3xl text-primary">lock_reset</span>
                        <div>
                            <h2 className="text-[var(--sys-text)] text-lg font-bold">New Password</h2>
                            <p className="text-[var(--sys-text-muted)] text-xs">Enter and confirm your new password.</p>
                        </div>
                    </div>

                    {success ? (
                        <div className="text-center py-6">
                            <span className="material-symbols-outlined text-5xl text-primary mb-4 block">check_circle</span>
                            <h3 className="text-[var(--sys-text)] font-bold mb-2">{success}</h3>
                            <p className="text-[var(--sys-text-muted)] text-sm">Redirecting to login...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">New Password</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">lock</span>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="reset-password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        autoFocus
                                        className="input-glass w-full pl-10 pr-10 py-3"
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer"
                                        tabIndex={-1}>
                                        <span className="material-symbols-outlined text-lg">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="text-sm text-[var(--sys-text-muted)] font-bold uppercase tracking-widest mb-1.5 block">Confirm Password</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">lock</span>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="reset-confirm-password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        minLength={6}
                                        className="input-glass w-full pl-10 py-3"
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg">error</span> {error}
                                </div>
                            )}

                            <button type="submit" disabled={loading}
                                className="btn-primary w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-50">
                                {loading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                        Resetting...
                                    </span>
                                ) : 'Reset Password'}
                            </button>
                        </form>
                    )}
                </div>

                <div className="text-center mt-6">
                    <button onClick={() => navigate('/login')} className="text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer">
                        ← Back to Login
                    </button>
                </div>
            </div>
        </div>
    )
}

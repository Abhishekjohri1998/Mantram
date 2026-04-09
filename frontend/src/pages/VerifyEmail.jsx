import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { auth as authAPI } from '../services/api';
import SEOHead from '../components/SEOHead';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');
    
    const [status, setStatus] = useState('verifying'); // verifying, success, error
    const [message, setMessage] = useState('');
    const [resending, setResending] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Missing verification token. Please check your link.');
            return;
        }

        const verify = async () => {
            try {
                const response = await authAPI.verifyEmail(token);
                if (response.success) {
                    setStatus('success');
                    setMessage(response.message || 'Email verified successfully!');
                } else {
                    setStatus('error');
                    setMessage(response.error || 'Verification failed.');
                }
            } catch (err) {
                setStatus('error');
                setMessage(err.message || 'Something went wrong during verification.');
            }
        };

        verify();
    }, [token]);

    const handleResend = async () => {
        // Since we don't have the email from the token here easily without a separate API check,
        // we might just direct them to login where they can request a resend if needed,
        // or we could add an email input if it's an error.
        // For now, let's keep it simple and direct to Auth.
        navigate('/login?mode=login&error=verification_failed');
    };

    return (
        <div className="min-h-screen bg-[#08080C] flex items-center justify-center p-6 relative overflow-hidden">
            <SEOHead title="Verify Email | Mantram AI" />
            
            {/* Background Aesthetics */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#FF4D00]/10 rounded-full blur-[120px] animate-pulse delay-700" />
            
            <div className="w-full max-w-md relative z-10 text-center">
                <div className="glass-panel p-10 rounded-[32px] border border-[var(--sys-border)] shadow-2xl ">
                    <div className="mb-8">
                        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] mb-6 group">
                            {status === 'verifying' && (
                                <span className="material-symbols-outlined text-4xl text-primary animate-spin">sync</span>
                            )}
                            {status === 'success' && (
                                <span className="material-symbols-outlined text-4xl text-primary group-hover:scale-110 transition-transform">verified_user</span>
                            )}
                            {status === 'error' && (
                                <span className="material-symbols-outlined text-4xl text-primary group-hover:scale-110 transition-transform">error</span>
                            )}
                        </div>
                        
                        <h1 className="text-3xl font-extrabold text-[var(--sys-text)] mb-3">
                            {status === 'verifying' && 'Verifying Your Account'}
                            {status === 'success' && 'Account Verified!'}
                            {status === 'error' && 'Verification Issue'}
                        </h1>
                        <p className="text-[var(--sys-text-muted)] leading-relaxed px-4">
                            {status === 'verifying' && 'Please wait while we secure your access to Mantram AI...'}
                            {status === 'success' && 'Great news! Your email has been confirmed. You now have full access to our AI agents.'}
                            {status === 'error' && message}
                        </p>
                    </div>

                    {status === 'success' && (
                        <Link 
                            to="/dashboard"
                            className="w-full py-4 px-6 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold text-lg hover:shadow-[0_0_30px_rgba(99,102,241,0.4)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 group"
                        >
                            Get Started Now
                            <span className="material-symbols-outlined text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
                        </Link>
                    )}

                    {status === 'error' && (
                        <div className="space-y-4">
                            <button 
                                onClick={handleResend}
                                className="w-full py-4 px-6 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] font-bold hover:bg-[var(--sys-surface)] transition-all"
                            >
                                Back to Login
                            </button>
                            <Link to="/" className="block text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors">
                                Return to Home
                            </Link>
                        </div>
                    )}
                </div>
                
                <p className="mt-8 text-xs text-[var(--sys-text-muted)] font-medium">
                    &copy; 2024 Mantram AI. Secure AI for modern brands.
                </p>
            </div>
        </div>
    );
}

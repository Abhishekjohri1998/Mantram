/**
 * JoinTeam — Invite acceptance page
 * 
 * Public page (no auth required) that validates an invite token,
 * shows invite details, and lets the user accept the invitation.
 * - Existing users: just click "Accept" (auto-joins them)
 * - New users: must set a name + password to create their account
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SEOHead from '../components/SEOHead';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function JoinTeam() {
    const { token } = useParams();
    const navigate = useNavigate();

    const [invite, setInvite] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [accepting, setAccepting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Form fields for new users
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Validate the invite token on mount
    useEffect(() => {
        async function validateInvite() {
            try {
                const res = await fetch(`${API}/team/invite/${token}`);
                const data = await res.json();
                if (!res.ok) {
                    setError(data.error || 'Invalid invitation');
                    return;
                }
                setInvite(data.invite);
                if (data.invite.name) setName(data.invite.name);
            } catch {
                setError('Unable to validate invitation. Please try again.');
            } finally {
                setLoading(false);
            }
        }
        if (token) validateInvite();
    }, [token]);

    async function handleAccept(e) {
        e.preventDefault();
        if (!invite.existingUser && password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (!invite.existingUser && password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        setAccepting(true);
        setError('');
        try {
            const res = await fetch(`${API}/team/accept-invite/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name || undefined,
                    password: invite.existingUser ? undefined : password,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Failed to accept invitation');
                return;
            }
            setSuccess(true);
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setAccepting(false);
        }
    }

    // Studio access pills
    const studioLabels = {
        contentStudio: { name: 'Content Studio', icon: 'edit_note' },
        creativeStudio: { name: 'Creative Studio', icon: 'palette' },
        seoStudio: { name: 'SEO Studio', icon: 'search' },
        brainstormStudio: { name: 'Brainstorm Studio', icon: 'psychology' },
        videoStudio: { name: 'Video Studio', icon: 'videocam' },
        socialMediaStudio: { name: 'Social Media Studio', icon: 'share' },
        conversationStudio: { name: 'Conversation Studio', icon: 'forum' },
        adStudio: { name: 'Performance Studio', icon: 'ads_click' },
        funnelStudio: { name: 'Funnel Studio', icon: 'filter_alt' },
        d2cAnalytics: { name: 'D2C Studio', icon: 'storefront' },
        skillsHub: { name: 'Skills Hub', icon: 'auto_awesome' },
    };

    const grantedStudios = invite?.studioAccess
        ? Object.entries(invite.studioAccess).filter(([, v]) => v).map(([k]) => studioLabels[k]).filter(Boolean)
        : [];

    // ─── Loading ───
    if (loading) {
        return (
            <div style={styles.page}>
                <SEOHead title="Join Team — Mantram AI" />
                <div style={styles.card}>
                    <div style={styles.spinner} />
                    <p style={{ color: '#94a3b8', marginTop: 16 }}>Validating your invitation...</p>
                </div>
            </div>
        );
    }

    // ─── Error (invalid / expired) ───
    if (error && !invite) {
        return (
            <div style={styles.page}>
                <SEOHead title="Invitation Error — Mantram AI" />
                <div style={styles.card}>
                    <div style={{ ...styles.iconCircle, background: 'rgba(239,68,68,0.15)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#ef4444' }}>error</span>
                    </div>
                    <h1 style={styles.heading}>Invitation Error</h1>
                    <p style={styles.errorText}>{error}</p>
                    <button style={styles.primaryBtn} onClick={() => navigate('/auth')}>Go to Sign In</button>
                </div>
            </div>
        );
    }

    // ─── Success ───
    if (success) {
        return (
            <div style={styles.page}>
                <SEOHead title="Welcome to the Team! — Mantram AI" />
                <div style={styles.card}>
                    <div style={{ ...styles.iconCircle, background: 'rgba(34,197,94,0.15)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#22c55e' }}>check_circle</span>
                    </div>
                    <h1 style={styles.heading}>Welcome to the Team! 🎉</h1>
                    <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 24 }}>
                        You've successfully joined {invite.teamName}. Sign in to get started.
                    </p>
                    <button style={styles.primaryBtn} onClick={() => navigate('/auth')}>Sign In Now</button>
                </div>
            </div>
        );
    }

    // ─── Accept Form ───
    return (
        <div style={styles.page}>
            <SEOHead title={`Join ${invite.teamName} — Mantram AI`} />
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.iconCircle}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#818cf8' }}>group_add</span>
                </div>
                <h1 style={styles.heading}>You're Invited!</h1>
                <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 8 }}>
                    <strong style={{ color: '#fff' }}>{invite.invitedBy?.name || 'A team member'}</strong> has invited you to join <strong style={{ color: '#818cf8' }}>{invite.teamName}</strong> on Mantram AI.
                </p>

                {/* Role badge */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                    <span style={styles.badge}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>badge</span>
                        Role: {invite.role}
                    </span>
                </div>

                {/* Personal message */}
                {invite.message && (
                    <div style={styles.messageBox}>
                        <p style={{ margin: 0, fontStyle: 'italic', color: '#cbd5e1', fontSize: 14 }}>"{invite.message}"</p>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>— {invite.invitedBy?.name}</p>
                    </div>
                )}

                {/* Studio access */}
                {grantedStudios.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Studio Access Granted</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                            {grantedStudios.map((s, i) => (
                                <span key={i} style={styles.studioPill}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{s.icon}</span>
                                    {s.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Accept form */}
                <form onSubmit={handleAccept}>
                    {invite.existingUser ? (
                        <p style={{ color: '#a5b4fc', fontSize: 14, marginBottom: 16, padding: '10px 16px', background: 'rgba(99,102,241,0.1)', borderRadius: 10  }}>
                            ✓ Account found for <strong>{invite.email}</strong>. Your account will be linked to this team.
                        </p>
                    ) : (
                        <>
                            <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
                                Create your account to get started:
                            </p>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Your Name</label>
                                <input
                                    style={styles.input}
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Enter your name"
                                    required
                                />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Email</label>
                                <input style={{ ...styles.input, opacity: 0.6 }} type="email" value={invite.email} disabled />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Password</label>
                                <input
                                    style={styles.input}
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Min 6 characters"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Confirm Password</label>
                                <input
                                    style={styles.input}
                                    type="password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Confirm your password"
                                    required
                                />
                            </div>
                        </>
                    )}

                    {error && <p style={{ ...styles.errorText, marginBottom: 12 }}>{error}</p>}

                    <button type="submit" style={styles.primaryBtn} disabled={accepting}>
                        {accepting ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={styles.smallSpinner} /> Joining...
                            </span>
                        ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>group_add</span>
                                Accept & Join Team
                            </span>
                        )}
                    </button>
                </form>

                <p style={{ color: '#475569', fontSize: 11, marginTop: 20, textAlign: 'center' }}>
                    By joining, you agree to Mantram AI's Terms of Service and Privacy Policy.
                </p>
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--sys-primary)',
        padding: 24,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
    },
    card: {
        width: '100%',
        maxWidth: 480,
        background: 'rgba(15, 15, 35, 0.8)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99, 102, 241, 0.15)',
        borderRadius: 20,
        padding: '40px 32px',
        textAlign: 'center',
    },
    iconCircle: {
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: 'rgba(99, 102, 241, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 16px',
    },
    heading: {
        fontSize: 24,
        fontWeight: 800,
        color: '#fff',
        margin: '0 0 8px',
    },
    errorText: {
        color: '#ef4444',
        fontSize: 14,
    },
    primaryBtn: {
        width: '100%',
        padding: '14px 24px',
        background: 'var(--sys-primary)',
        color: '#fff',
        border: 'none',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: 700,
        cursor: 'pointer',
        letterSpacing: 0.5,
        transition: 'opacity 0.2s',
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 12px',
        background: 'rgba(99, 102, 241, 0.15)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: 20,
        fontSize: 12,
        color: '#a5b4fc',
        textTransform: 'capitalize',
    },
    messageBox: {
        padding: '12px 16px',
        background: 'rgba(99, 102, 241, 0.08)',
        borderLeft: '3px solid #6366f1',
        borderRadius: '0 10px 10px 0',
        marginBottom: 20,
        textAlign: 'left',
    },
    studioPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        background: 'rgba(34, 197, 94, 0.1)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: 8,
        fontSize: 11,
        color: '#86efac',
    },
    inputGroup: {
        marginBottom: 14,
        textAlign: 'left',
    },
    label: {
        display: 'block',
        fontSize: 12,
        fontWeight: 600,
        color: '#94a3b8',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        width: '100%',
        padding: '12px 14px',
        background: 'rgba(30, 30, 60, 0.6)',
        border: '1px solid rgba(99, 102, 241, 0.2)',
        borderRadius: 10,
        color: '#e2e8f0',
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.2s',
    },
    spinner: {
        width: 40,
        height: 40,
        border: '3px solid rgba(99, 102, 241, 0.2)',
        borderTopColor: '#6366f1',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto',
    },
    smallSpinner: {
        display: 'inline-block',
        width: 16,
        height: 16,
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    },
};

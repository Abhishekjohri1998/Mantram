import { useSeoTasks } from '../../context/SeoTaskContext'

/* ══════════════════════════════════════════════════════════════════════════
   SEO TASK TOAST — Notifications + Floating Task Bar
   ══════════════════════════════════════════════════════════════════════════ */

const TOAST_STYLES = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', icon: 'check_circle', iconColor: '#34d399', text: '#6ee7b7' },
    error:   { bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.25)',  icon: 'error',        iconColor: '#fb7185', text: '#fda4af' },
    warning: { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)', icon: 'warning',      iconColor: '#fbbf24', text: '#fde68a' },
    limit:   { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.25)', icon: 'hourglass_top',iconColor: '#fbbf24', text: '#fde68a' },
}

export default function SeoTaskToast() {
    const ctx = useSeoTasks()
    if (!ctx) return null
    const { toasts, dismissToast, runningTasks, onNavigate } = ctx

    const handleToastClick = (toast) => {
        if (toast.taskKey && toast.type === 'success' && onNavigate) {
            onNavigate(toast.taskKey)
        }
        dismissToast(toast.id)
    }

    return (
        <>
            {/* ── Toast Stack (bottom-right) ── */}
            {toasts.length > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: runningTasks.length > 0 ? 72 : 24,
                    right: 24,
                    zIndex: 9999,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxWidth: 380,
                    pointerEvents: 'auto',
                }}>
                    {toasts.map(toast => {
                        const s = TOAST_STYLES[toast.type] || TOAST_STYLES.success
                        return (
                            <div key={toast.id}
                                onClick={() => handleToastClick(toast)}
                                className="seo-toast-enter"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '12px 16px', borderRadius: 14,
                                    background: s.bg, border: `1px solid ${s.border}`,
                                    backdropFilter: 'blur(16px)',
                                    cursor: toast.type === 'success' ? 'pointer' : 'default',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                    animation: 'seoToastSlideIn 0.35s cubic-bezier(0.16,1,0.3,1)',
                                }}>
                                <span className="material-symbols-outlined" style={{ color: s.iconColor, fontSize: 20 }}>{s.icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ color: s.text, fontSize: 13, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{toast.message}</p>
                                    {toast.type === 'success' && (
                                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0', fontWeight: 600 }}>Click to view results</p>
                                    )}
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); dismissToast(toast.id) }}
                                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 2, lineHeight: 1 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Floating Task Bar (bottom-center) ── */}
            {runningTasks.length > 0 && (
                <div style={{
                    position: 'fixed',
                    bottom: 16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 9998,
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 20px',
                    borderRadius: 16,
                    background: 'rgba(15,17,30,0.92)',
                    border: '1px solid rgba(99,102,241,0.2)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(99,102,241,0.08)',
                    animation: 'seoToastSlideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
                }}>
                    {/* Spinner */}
                    <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: '2px solid rgba(99,102,241,0.15)',
                        borderTopColor: '#818cf8',
                        animation: 'spin 0.8s linear infinite',
                    }} />

                    {/* Count */}
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#c7d2fe' }}>
                        {runningTasks.length} task{runningTasks.length > 1 ? 's' : ''} running
                    </span>

                    {/* Divider */}
                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

                    {/* Task names */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {runningTasks.map(t => (
                            <span key={t.key}
                                onClick={() => onNavigate?.(t.key)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700,
                                    color: '#a5b4fc',
                                    padding: '3px 8px',
                                    borderRadius: 8,
                                    background: 'rgba(99,102,241,0.1)',
                                    border: '1px solid rgba(99,102,241,0.15)',
                                    cursor: 'pointer',
                                    transition: 'background 0.2s',
                                }}
                                onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.2)'}
                                onMouseLeave={e => e.target.style.background = 'rgba(99,102,241,0.1)'}
                            >
                                {t.label}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Keyframe animations ── */}
            <style>{`
                @keyframes seoToastSlideIn {
                    0% { opacity: 0; transform: translateX(40px) scale(0.95); }
                    100% { opacity: 1; transform: translateX(0) scale(1); }
                }
                @keyframes seoToastSlideUp {
                    0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    100% { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>
        </>
    )
}

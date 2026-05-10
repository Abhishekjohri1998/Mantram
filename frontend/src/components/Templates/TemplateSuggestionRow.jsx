import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const TMPL_ROW_API = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '')

export default function TemplateSuggestionRow({ brandId, onSelect, section = 'ai_create' }) {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'superadmin';
    const [templates, setTemplates] = useState([])
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        const token = localStorage.getItem('mantram_token')
        const qs = brandId ? `?brandId=${brandId}` : ''
        fetch(`${TMPL_ROW_API}/templates/by-section/${section}${qs}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (!cancelled && d?.success) setTemplates((d.templates || []).slice(0, 18)) })
        .catch(() => {}) // silent failure — never crash the page
        .finally(() => { if (!cancelled) setLoaded(true) })
        return () => { cancelled = true }
    }, [brandId, section])

    // Empty state for superadmin
    if (loaded && templates.length === 0 && isSuperAdmin) {
        return (
            <div style={{
                padding: '32px 16px',
                border: '1.5px dashed var(--color-border-tertiary)',
                borderRadius: '12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center',
                gap: 8,
                margin: '16px',
            }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24, opacity: 0.4, color: 'var(--color-text-secondary)' }}>dashboard_customize</span>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    No templates for this section yet
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                    Create and publish templates in the Super Admin Image Studio.
                </div>
                <button
                    onClick={() => window.location.href = '/superadmin/image-studio'}
                    style={{
                        background: '#E84118', color: '#fff', fontSize: 12, fontWeight: 600,
                        padding: '6px 14px', borderRadius: '8px', cursor: 'pointer',
                        border: 'none', display: 'flex', alignItems: 'center', gap: 4
                    }}
                >
                    Open Image Studio &rarr;
                </button>
            </div>
        )
    }

    // Zero layout shift / regular user empty state
    if (loaded && templates.length === 0) return null

    return (
        <div style={{
            padding: '16px 0',
            borderBottom: '1px solid var(--color-border-tertiary)',
            minHeight: '170px',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingLeft: 16,
                paddingRight: 16,
                marginBottom: 12,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 3, height: 14, background: '#E84118', borderRadius: 2 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
                        Start from a template
                    </span>
                    {loaded && templates.length > 0 && (
                        <span style={{ 
                            fontSize: 11, background: 'var(--color-background-secondary)', 
                            border: '1px solid var(--color-border-tertiary)', 
                            padding: '2px 8px', borderRadius: 12, color: 'var(--color-text-secondary)' 
                        }}>
                            {templates.length} ready
                        </span>
                    )}
                </div>
                <button 
                    onClick={() => onSelect(null)}
                    style={{ background: 'transparent', border: 'none', color: '#E84118', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                    See all &rarr;
                </button>
            </div>

            {/* Fixed-height scroll container */}
            <div style={{
                display: 'flex',
                gap: 12,
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 8,
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
                alignItems: 'stretch',
            }}
            className="hide-scrollbar"
            >
                <style dangerouslySetInnerHTML={{__html: `
                    .t-shimmer {
                        background: linear-gradient(90deg, var(--color-background-secondary) 25%, var(--color-background-primary) 50%, var(--color-background-secondary) 75%);
                        background-size: 200% 100%;
                        animation: shimmer 1.5s infinite;
                    }
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                    .hide-scrollbar::-webkit-scrollbar { display: none; }
                `}} />

                {!loaded ? (
                    /* Shimmer state */
                    [1, 2, 3, 4, 5].map(i => (
                        <div key={`shimmer-${i}`} style={{
                            flex: '0 0 auto',
                            width: 120,
                            borderRadius: 12,
                            border: '1.5px solid var(--color-border-tertiary)',
                            background: 'var(--color-background-primary)',
                            padding: 6,
                            display: 'flex', flexDirection: 'column'
                        }}>
                            <div className="t-shimmer" style={{ width: '100%', aspectRatio: '4/5', borderRadius: 8, marginBottom: 8 }} />
                            <div className="t-shimmer" style={{ height: 12, width: '80%', borderRadius: 4, marginBottom: 4 }} />
                            <div className="t-shimmer" style={{ height: 10, width: '50%', borderRadius: 4 }} />
                        </div>
                    ))
                ) : (
                    <>
                        {templates.map(t => {
                            const isNew = t.isNew || (new Date() - new Date(t.createdAt)) < 7 * 24 * 60 * 60 * 1000;
                            const rawRatio = t.generationParams?.aspectRatio || t.savedVideoSettings?.format || t.defaultSettings?.aspectRatio || '4:5';
                            const parsedRatio = rawRatio.replace(':', '/');
                            return (
                            <button
                                key={t._id}
                                title={t.name}
                                onClick={() => onSelect(t)}
                                style={{
                                    flex: '0 0 auto',
                                    borderRadius: 12,
                                    border: '1.5px solid var(--color-border-tertiary)',
                                    background: 'var(--color-background-primary)',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'transform 0.2s, border-color 0.2s',
                                    padding: 6,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    textAlign: 'left',
                                }}
                                onMouseEnter={e => { 
                                    e.currentTarget.style.transform = 'translateY(-2px)'; 
                                    e.currentTarget.style.borderColor = '#E84118';
                                    const overlay = e.currentTarget.querySelector('.t-hover-overlay');
                                    if(overlay) overlay.style.opacity = '1';
                                }}
                                onMouseLeave={e => { 
                                    e.currentTarget.style.transform = ''; 
                                    e.currentTarget.style.borderColor = 'var(--color-border-tertiary)';
                                    const overlay = e.currentTarget.querySelector('.t-hover-overlay');
                                    if(overlay) overlay.style.opacity = '0';
                                }}
                                className="group"
                            >
                                <div style={{ 
                                    height: 135,
                                    aspectRatio: parsedRatio,
                                    borderRadius: 8, 
                                    overflow: 'hidden', 
                                    position: 'relative',
                                    marginBottom: 8,
                                    background: 'var(--color-background-secondary)'
                                }}>
                                    {t.previewUrl ? (
                                        <img
                                            src={t.previewUrl}
                                            alt={t.name}
                                            loading="lazy"
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('t-shimmer'); }}
                                        />
                                    ) : (
                                        <div className="t-shimmer" style={{ width: '100%', height: '100%' }} />
                                    )}

                                    {/* Badges */}
                                    {t.isMantramExclusive ? (
                                        <div style={{
                                            position: 'absolute', top: 6, left: 6,
                                            background: 'rgba(232,65,24,0.9)', color: '#fff',
                                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                            padding: '2px 7px', borderRadius: 20, zIndex: 10
                                        }}>Exclusive</div>
                                    ) : isNew ? (
                                        <div style={{
                                            position: 'absolute', top: 6, left: 6,
                                            background: 'rgba(0,212,170,0.9)', color: '#fff',
                                            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                            padding: '2px 7px', borderRadius: 20, zIndex: 10
                                        }}>New</div>
                                    ) : null}

                                    {/* Hover Overlay */}
                                    <div 
                                    className="t-hover-overlay"
                                    style={{
                                        position: 'absolute', inset: 0,
                                        background: 'rgba(0,0,0,0.35)',
                                        display: 'flex', alignItems: 'flex-end', padding: 8,
                                        opacity: 0, transition: 'opacity 0.2s'
                                    }}
                                    >
                                        <div style={{
                                            width: '100%', background: '#E84118', color: '#fff',
                                            fontSize: 11, fontWeight: 600, textAlign: 'center',
                                            padding: '7px 0', borderRadius: 8
                                        }}>
                                            Use template
                                        </div>
                                    </div>
                                </div>
                                <div style={{ padding: '0 2px', width: '100%' }}>
                                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                        {t.name}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {t.categoryId?.name || section}
                                    </div>
                                </div>
                            </button>
                            );
                        })}

                        {/* Add Template card for superadmin */}
                        {isSuperAdmin && (
                            <button
                                onClick={() => window.location.href = '/superadmin/image-studio'}
                                style={{
                                    flex: '0 0 120px',
                                    width: 120,
                                    borderRadius: 12,
                                    border: '1.5px dashed var(--color-border-tertiary)',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    gap: 8,
                                    transition: 'all 0.2s',
                                    color: 'var(--color-text-secondary)'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#E84118'; e.currentTarget.style.borderColor = '#E84118' }}
                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-tertiary)' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'inherit' }}>add_circle</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'inherit' }}>New Template</span>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, creatives as creativesAPI, agents } from '../services/api'

export default function Nexus() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()
    const [aiHealth, setAiHealth] = useState(null)
    const [contentCount, setContentCount] = useState(0)
    const [creativeCount, setCreativeCount] = useState(0)
    const [error, setError] = useState(null)

    useEffect(() => {
        agents.health()
            .then(setAiHealth)
            .catch(err => setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            }))

        contentAPI.list({ limit: 1 })
            .then(d => setContentCount(d.total || 0))
            .catch(err => setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            }))

        creativesAPI.list({ limit: 1 })
            .then(d => setCreativeCount(d.total || 0))
            .catch(err => setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            }))
    }, [])

    const brand = activeBrand
    const dna = brand?.dna || {}
    const voice = dna.voice || {}

    return (
        <DashboardLayout title="Nexus" subtitle="Cross-studio intelligence hub">
            <SEOHead title="Nexus — Mantram AI" noIndex={true} />

            {error && (
                <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 animate-fade-in ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'}`}>
                    <span className="material-symbols-outlined">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {!brand ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <span className="material-symbols-outlined text-6xl text-[var(--sys-text-muted)]">hub</span>
                    <h3 className="text-xl font-bold text-[var(--sys-text)]">No Brand Selected</h3>
                    <p className="text-[var(--sys-text-muted)] text-sm">Create a brand via onboarding to see your Nexus.</p>
                    <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm mt-2">Create Brand</button>
                </div>
            ) : (
                <>
                    {/* Brand Hero */}
                    <div className="glass-panel rounded-2xl p-8 mb-6 animate-fade-in relative overflow-hidden">
                        {dna.colors?.[0] && (
                            <div className="absolute inset-0 opacity-10" style={{ background: `var(--sys-primary)` }} />
                        )}
                        <div className="relative z-10 flex items-center gap-6">
                            <div className="size-20 rounded-2xl flex items-center justify-center text-3xl font-black text-[var(--sys-text)] shrink-0"
                                style={{ background: dna.colors?.[0]?.hex || '#2B4BEE' }}>
                                {brand.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-2xl font-extrabold text-[var(--sys-text)]">{brand.name}</h3>
                                {voice.personality && <p className="text-primary text-sm font-bold mt-0.5">{voice.personality}</p>}
                                {dna.brandDescription && <p className="text-sm text-[var(--sys-text-muted)] mt-1 max-w-2xl">{dna.brandDescription}</p>}
                            </div>
                            <button onClick={() => navigate('/brand-dna')} className="btn-glass px-4 py-2 rounded-xl text-sm text-[var(--sys-text)] border border-[var(--sys-border)] hover:border-primary/30 cursor-pointer shrink-0">
                                <span className="material-symbols-outlined text-sm">fingerprint</span> View DNA
                            </button>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        {[
                            { label: 'Content', value: contentCount, icon: 'article', color: 'text-primary' },
                            { label: 'Creatives', value: creativeCount, icon: 'image', color: 'text-[#FF4D00]' },
                            { label: 'AI Learnings', value: brand.aiContext?.totalFeedback || 0, icon: 'psychology', color: 'text-primary' },
                            { label: 'Brand Score', value: brand.aiContext?.avgRating ? `${(brand.aiContext.avgRating * 100).toFixed(0)}%` : '—', icon: 'trending_up', color: 'text-primary' },
                        ].map((s, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                                <span className={`material-symbols-outlined text-xl ${s.color} mb-2 block`}>{s.icon}</span>
                                <p className="text-2xl font-extrabold text-[var(--sys-text)]">{s.value}</p>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Actions + Info Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Create */}
                        <div className="col-span-12 lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                { icon: 'edit_note', label: 'Create Content', desc: 'Generate brand-aligned text', path: '/content-studio', color: 'from-primary/20 to-primary/5' },
                                { icon: 'brush', label: 'Create Visual', desc: 'Generate brand visuals', path: '/creative-studio', color: 'from-[#FF4D00]/20 to-[#FF7A00]/5' },
                                { icon: 'analytics', label: 'Analytics', desc: 'Content performance', path: '/analytics', color: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
                                { icon: 'language', label: 'Re-scan Website', desc: 'Update brand DNA', path: '/onboarding', color: 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' },
                            ].map((a, i) => (
                                <button key={i} onClick={() => navigate(a.path)}
                                    className={`glass-panel rounded-2xl p-6 text-left hover:scale-[1.02] transition-all cursor-pointer animate-fade-in bg-gradient-to-br ${a.color}`}
                                    style={{ animationDelay: `${i * 80 + 200}ms` }}>
                                    <span className="material-symbols-outlined text-3xl text-[var(--sys-text)] mb-3 block">{a.icon}</span>
                                    <p className="text-[var(--sys-text)] font-bold">{a.label}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)] mt-1">{a.desc}</p>
                                </button>
                            ))}
                        </div>

                        {/* Right Panel */}
                        <div className="col-span-12 lg:col-span-4 space-y-6">
                            {/* Voice Preview */}
                            {voice.personality && (
                                <div className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: '400ms' }}>
                                    <h3 className="font-bold text-[var(--sys-text)] text-sm flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-primary text-lg">record_voice_over</span> Voice
                                    </h3>
                                    <div className="space-y-2">
                                        {[
                                            { label: 'Tone', value: voice.tone },
                                            { label: 'Warmth', value: voice.warmth },
                                            { label: 'Formality', value: voice.formality },
                                        ].filter(v => v.value).map((v, i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <span className="text-sm text-[var(--sys-text-muted)] w-14">{v.label}</span>
                                                <div className="progress-bar flex-1"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                                <span className="text-sm text-[var(--sys-text-muted)] w-6 text-right">{v.value}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* AI Status */}
                            <div className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: '480ms' }}>
                                <h3 className="font-bold text-[var(--sys-text)] text-sm flex items-center gap-2 mb-3">
                                    <span className="material-symbols-outlined text-primary text-lg">check_circle</span> AI Engine
                                </h3>
                                {aiHealth ? (
                                    <div className="space-y-2">
                                        {aiHealth.providers?.map((p, i) => (
                                            <div key={i} className="flex items-center justify-between">
                                                <span className="text-sm text-[var(--sys-text-muted)] capitalize">{p.name}</span>
                                                <span className={`w-2 h-2 rounded-full ${p.available ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`} />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-[var(--sys-text-muted)]">Checking AI status...</p>
                                )}
                            </div>

                            {/* Brand Colors */}
                            {dna.colors?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: '560ms' }}>
                                    <h3 className="font-bold text-[var(--sys-text)] text-sm flex items-center gap-2 mb-3">
                                        <span className="material-symbols-outlined text-primary text-lg">palette</span> Colors
                                    </h3>
                                    <div className="flex gap-2">
                                        {dna.colors.map((c, i) => (
                                            <div key={i} className="w-10 h-10 rounded-lg" style={{ background: c.hex }} title={c.name} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </DashboardLayout>
    )
}

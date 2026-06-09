import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { seoStudio as seoAPI } from '../../services/api'

// ── Model brand colors ────────────────────────────────────────────────────────
const MODEL_META = {
    ChatGPT:   { color: '#10a37f', icon: '🤖', shortName: 'ChatGPT' },
    Gemini:    { color: '#4285f4', icon: '✨', shortName: 'Gemini' },
    Claude:    { color: '#d97706', icon: '🧠', shortName: 'Claude' },
    Grok:      { color: '#a855f7', icon: '⚡', shortName: 'Grok' },
    Perplexity:{ color: '#20b8cd', icon: '🔍', shortName: 'Perplexity' },
}
const getModelMeta = (name) => MODEL_META[name] || { color: '#6366f1', icon: '🤖', shortName: name }

// ── Helpers ───────────────────────────────────────────────────────────────────
const positionBadge = (pos) => {
    if (!pos) return null
    const map = { Leader: '#10b981', Challenger: '#f59e0b', Niche: '#6366f1' }
    const color = map[pos] || '#6366f1'
    return (
        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
            {pos}
        </span>
    )
}

const DeltaBadge = ({ delta }) => {
    if (delta === null || delta === undefined) return null
    const d = Math.round(delta)
    if (d === 0) return <span className="text-[10px] text-[var(--sys-text-muted)]">—</span>
    return (
        <span className={`text-[10px] font-bold ${d > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {d > 0 ? `▲+${d}` : `▼${d}`}
        </span>
    )
}

// ── Mini horizontal bar ───────────────────────────────────────────────────────
function MentionBar({ rate = 0, color = '#6366f1' }) {
    return (
        <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(rate, 100)}%`, background: color }}
                />
            </div>
            <span className="text-xs font-black tabular-nums" style={{ color, minWidth: 32, textAlign: 'right' }}>
                {rate}%
            </span>
        </div>
    )
}

// ── Simple SVG line chart (no deps) ──────────────────────────────────────────
function TrendLine({ data = [], color = '#6366f1', height = 40, width = 120 }) {
    if (!data || data.length < 2) return <span className="text-[10px] text-[var(--sys-text-muted)]">Not enough data</span>
    const vals = data.map(d => d.mentionRate || d.score || 0)
    const min = Math.min(...vals)
    const max = Math.max(...vals) || 1
    const range = max - min || 1
    const pts = vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * width
        const y = height - ((v - min) / range) * height
        return `${x},${y}`
    }).join(' ')
    return (
        <svg width={width} height={height} style={{ overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts.split(' ').at(-1).split(',')[0]} cy={pts.split(' ').at(-1).split(',')[1]} r="3" fill={color} />
        </svg>
    )
}

// ── Sentiment Pill ────────────────────────────────────────────────────────────
function SentimentPill({ dist = {} }) {
    const total = (dist.positive || 0) + (dist.neutral || 0) + (dist.negative || 0) || 1
    const pos = Math.round(((dist.positive || 0) / total) * 100)
    const neu = Math.round(((dist.neutral || 0) / total) * 100)
    const neg = 100 - pos - neu
    return (
        <div className="flex rounded-full overflow-hidden h-2 w-full gap-px">
            {pos > 0 && <div style={{ width: `${pos}%`, background: '#10b981' }} title={`Positive: ${pos}%`} />}
            {neu > 0 && <div style={{ width: `${neu}%`, background: '#f59e0b' }} title={`Neutral: ${neu}%`} />}
            {neg > 0 && <div style={{ width: `${neg}%`, background: '#f43f5e' }} title={`Negative: ${neg}%`} />}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// GEO PANEL — Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function GeoPanel({ brand, onRunProbe, loading: probeLoading, probeResult }) {
    const navigate = useNavigate()
    const [history, setHistory] = useState([])
    const [trend, setTrend] = useState(null)
    const [modelTimeline, setModelTimeline] = useState({})
    const [scoreTimeline, setScoreTimeline] = useState([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [llmsTxt, setLlmsTxt] = useState(null)
    const [llmsLoading, setLlmsLoading] = useState(false)
    const [llmsCopied, setLlmsCopied] = useState(false)
    const [activeSection, setActiveSection] = useState('scorecard') // scorecard | gaps | snippets | drift | history | llms

    // The most recent saved probe data to display
    const displayData = probeResult || (history.length > 0 ? history[0] : null)

    // ── Load geo history on mount / brand change ──────────────────────────────
    const loadHistory = useCallback(async () => {
        if (!brand?._id) return
        setHistoryLoading(true)
        try {
            const d = await seoAPI.geoHistory(brand._id, 20)
            if (d.success) {
                setHistory(d.history || [])
                setTrend(d.trend || null)
                setModelTimeline(d.modelTimeline || {})
                setScoreTimeline(d.scoreTimeline || [])
            }
        } catch { /* silent */ }
        finally { setHistoryLoading(false) }
    }, [brand?._id])

    useEffect(() => { loadHistory() }, [loadHistory])

    // Refresh history when a new probe comes in
    useEffect(() => {
        if (probeResult) loadHistory()
    }, [probeResult, loadHistory])

    const generateLlmsTxt = async () => {
        setLlmsLoading(true)
        try {
            const d = await seoAPI.generateLlmsTxt({ brandId: brand?._id, url: brand?.website })
            if (d.success) setLlmsTxt(d)
        } catch { }
        finally { setLlmsLoading(false) }
    }

    const copyLlms = () => {
        if (!llmsTxt?.llmsTxt) return
        navigator.clipboard.writeText(llmsTxt.llmsTxt)
        setLlmsCopied(true)
        setTimeout(() => setLlmsCopied(false), 2000)
    }

    const downloadLlms = () => {
        if (!llmsTxt?.llmsTxt) return
        const blob = new Blob([llmsTxt.llmsTxt], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = 'llms.txt'
        a.click()
    }

    // ── Derive display state from the most recent probe ───────────────────────
    const probeData = probeResult?.geoProbe || (history[0] ? {
        mentionRate: history[0].mentionRate,
        score: history[0].score,
        modelBreakdown: history[0].modelBreakdown,
        sentimentDistribution: history[0].sentimentDistribution,
        competitivePosition: history[0].competitivePosition,
        contentGaps: [],
        topSnippets: [],
        citationDrift: null,
        modelsUsed: history[0].modelsUsed || [],
    } : null)

    const hasData = !!probeData

    const NAV_TABS = [
        { id: 'scorecard', label: 'LLM Scorecard', icon: 'bar_chart' },
        { id: 'gaps',      label: 'Content Gaps',   icon: 'content_paste_search' },
        { id: 'snippets',  label: 'AI Snippets',    icon: 'format_quote' },
        { id: 'drift',     label: 'Citation Drift', icon: 'sync_problem' },
        { id: 'history',   label: 'Trend Chart',    icon: 'show_chart' },
        { id: 'llms',      label: 'llms.txt',       icon: 'description' },
    ]

    return (
        <div className="flex flex-col gap-6 animate-fade-in">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-[#6366f1]" style={{ fontSize: 20 }}>travel_explore</span>
                        <h2 className="text-base font-black text-[var(--sys-text)]">GEO — Generative Engine Optimization</h2>
                    </div>
                    <p className="text-xs text-[var(--sys-text-muted)]">
                        Real-time brand visibility across 5 AI engines — ChatGPT, Gemini, Claude, Grok, Perplexity
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {hasData && trend && (
                        <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                            <span className="text-[var(--sys-text-muted)]">Score</span>
                            <span className="font-black text-[var(--sys-text)]">{probeData.score || probeData.mentionRate}</span>
                            <DeltaBadge delta={trend.scoreDelta} />
                        </div>
                    )}
                    <button
                        onClick={onRunProbe}
                        disabled={probeLoading}
                        id="geo-run-probe-btn"
                        className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 cursor-pointer"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                        <span className={`material-symbols-outlined text-sm ${probeLoading ? 'animate-spin' : ''}`}>
                            {probeLoading ? 'progress_activity' : 'radar'}
                        </span>
                        {probeLoading ? 'Probing LLMs…' : hasData ? 'Run New Probe' : 'Run First Probe'}
                    </button>
                </div>
            </div>

            {/* ── Overall Score Bar (always visible when data exists) ── */}
            {hasData && (
                <div className="glass-panel rounded-2xl p-4" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                    <div className="flex flex-wrap items-center gap-4 justify-between">
                        <div className="flex items-center gap-4">
                            {/* Big score */}
                            <div className="text-center">
                                <div className="text-3xl font-black" style={{ color: '#6366f1' }}>
                                    {probeData.score || probeData.mentionRate}
                                </div>
                                <div className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mt-0.5">GEO Score</div>
                            </div>
                            <div className="w-px h-10 bg-white/[0.08]" />
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-bold text-[var(--sys-text)]">
                                        {probeData.mentionRate}% mention rate
                                    </span>
                                    {positionBadge(probeData.competitivePosition)}
                                </div>
                                <SentimentPill dist={probeData.sentimentDistribution} />
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-emerald-400">■ Positive</span>
                                    <span className="text-[10px] text-amber-400">■ Neutral</span>
                                    <span className="text-[10px] text-rose-400">■ Negative</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {(probeData.modelsUsed || []).map(m => {
                                const meta = getModelMeta(m)
                                const rate = probeData.modelBreakdown?.[m]?.mentionRate ?? '?'
                                return (
                                    <div key={m} className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl" style={{ background: `${meta.color}12`, border: `1px solid ${meta.color}25` }}>
                                        <span className="text-base">{meta.icon}</span>
                                        <span className="text-[10px] font-bold" style={{ color: meta.color }}>{meta.shortName}</span>
                                        <span className="text-sm font-black text-[var(--sys-text)]">{rate}%</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Empty state ── */}
            {!hasData && !probeLoading && (
                <div className="glass-panel rounded-2xl p-10 flex flex-col items-center gap-4 text-center" style={{ border: '1px solid rgba(99,102,241,0.12)' }}>
                    <div className="size-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.12)' }}>
                        <span className="material-symbols-outlined text-3xl text-[#6366f1]">travel_explore</span>
                    </div>
                    <div>
                        <p className="font-bold text-[var(--sys-text)] mb-1">No GEO data yet</p>
                        <p className="text-sm text-[var(--sys-text-muted)] max-w-md">
                            Run your first GEO probe to see how ChatGPT, Gemini, Claude, Grok, and Perplexity respond to questions in your industry — and whether they mention your brand.
                        </p>
                    </div>
                    <button
                        onClick={onRunProbe}
                        className="mt-2 px-6 py-2.5 rounded-xl font-bold text-white text-sm cursor-pointer hover:opacity-90 transition-all"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                    >
                        Run GEO Probe Now
                    </button>
                </div>
            )}

            {/* ── Loading shimmer ── */}
            {probeLoading && !hasData && (
                <div className="glass-panel rounded-2xl p-6 animate-pulse space-y-4" style={{ border: '1px solid rgba(99,102,241,0.12)' }}>
                    <div className="h-4 w-48 rounded bg-[var(--sys-border)]" />
                    <div className="grid grid-cols-5 gap-3">
                        {[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl bg-[var(--sys-border)]" />)}
                    </div>
                    <div className="h-3 w-full rounded bg-[var(--sys-border)]" />
                    <div className="h-3 w-3/4 rounded bg-[var(--sys-border)]" />
                </div>
            )}

            {/* ── Detail Tabs (only if data exists) ── */}
            {hasData && (
                <>
                    {/* Nav */}
                    <div className="flex flex-wrap gap-1.5">
                        {NAV_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveSection(tab.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    activeSection === tab.id
                                        ? 'bg-[#6366f1] text-white'
                                        : 'bg-white/[0.04] text-[var(--sys-text-muted)] hover:bg-white/[0.07]'
                                }`}
                            >
                                <span className="material-symbols-outlined text-xs">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* ── SECTION: LLM Scorecard ── */}
                    {activeSection === 'scorecard' && (
                        <div className="space-y-2 animate-fade-in">
                            <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">Per-Model Visibility</p>
                            {(probeData.modelsUsed || Object.keys(probeData.modelBreakdown || {})).map(modelName => {
                                const meta = getModelMeta(modelName)
                                const data = probeData.modelBreakdown?.[modelName] || {}
                                const rate = data.mentionRate || 0
                                const status = rate >= 50 ? 'Visible' : rate >= 20 ? 'Partial' : 'Invisible'
                                const statusColor = rate >= 50 ? '#10b981' : rate >= 20 ? '#f59e0b' : '#f43f5e'
                                const prevData = trend?.perModelDelta?.[modelName]
                                const trendLine = modelTimeline[modelName] || []

                                return (
                                    <div key={modelName} className="glass-panel rounded-xl px-4 py-3" style={{ border: `1px solid ${meta.color}18` }}>
                                        <div className="flex items-center gap-3">
                                            <div className="size-9 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ background: `${meta.color}15` }}>
                                                {meta.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                    <span className="text-sm font-black text-[var(--sys-text)]">{modelName}</span>
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${statusColor}15`, color: statusColor }}>{status}</span>
                                                    {prevData && <DeltaBadge delta={prevData.delta} />}
                                                </div>
                                                <MentionBar rate={rate} color={meta.color} />
                                            </div>
                                            <div className="hidden sm:block shrink-0">
                                                <TrendLine data={trendLine} color={meta.color} height={32} width={80} />
                                            </div>
                                        </div>
                                        {data.topCitation && (
                                            <div className="mt-2 px-2 py-1.5 rounded-lg text-[11px] text-[var(--sys-text-muted)] italic" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                "{data.topCitation.substring(0, 120)}{data.topCitation.length > 120 ? '…' : ''}"
                                            </div>
                                        )}
                                    </div>
                                )
                            })}

                            {/* Trend summary */}
                            {trend && (
                                <div className="grid grid-cols-3 gap-3 mt-4">
                                    {[
                                        { label: 'Score Δ', value: `${trend.scoreDelta > 0 ? '+' : ''}${trend.scoreDelta}`, color: trend.scoreDelta >= 0 ? '#10b981' : '#f43f5e' },
                                        { label: 'Mention Δ', value: `${trend.mentionRateDelta > 0 ? '+' : ''}${trend.mentionRateDelta}%`, color: trend.mentionRateDelta >= 0 ? '#10b981' : '#f43f5e' },
                                        { label: 'Position', value: trend.positionChange || 'Stable', color: '#6366f1' },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} className="glass-panel rounded-xl p-3 text-center" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="text-sm font-black" style={{ color }}>{value}</div>
                                            <div className="text-[10px] text-[var(--sys-text-muted)] mt-0.5">{label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── SECTION: Content Gaps ── */}
                    {activeSection === 'gaps' && (
                        <div className="space-y-3 animate-fade-in">
                            <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">
                                Queries Where Competitors Are Cited But NOT You
                            </p>
                            {(probeResult?.geoProbe?.contentGaps || probeResult?.contentGaps || []).length === 0 ? (
                                <div className="glass-panel rounded-xl p-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span className="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
                                    <p className="text-sm font-bold text-emerald-400 mt-2">No gaps detected!</p>
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-1">Your brand is mentioned across all probed queries. Run a new probe to refresh.</p>
                                </div>
                            ) : (
                                (probeResult?.geoProbe?.contentGaps || probeResult?.contentGaps || []).map((gap, i) => (
                                    <div key={i} className="glass-panel rounded-xl p-4 space-y-2" style={{ border: '1px solid rgba(244,63,94,0.15)' }}>
                                        <div className="flex items-start gap-2">
                                            <span className="material-symbols-outlined text-rose-400 text-sm mt-0.5 shrink-0">priority_high</span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-[var(--sys-text)]">"{gap.prompt}"</p>
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    <span className="text-[10px] text-[var(--sys-text-muted)]">Missing on:</span>
                                                    {(gap.models || []).map(m => {
                                                        const meta = getModelMeta(m)
                                                        return (
                                                            <span key={m} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${meta.color}15`, color: meta.color }}>
                                                                {meta.icon} {m}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
                                                {gap.competitorsFound?.length > 0 && (
                                                    <p className="text-[11px] text-[var(--sys-text-muted)] mt-1">
                                                        Competitors cited instead: {gap.competitorsFound.join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {/* CTA row */}
                                        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/[0.04]">
                                            <button
                                                onClick={() => navigate(`/content-studio?brief=${encodeURIComponent(gap.prompt)}`)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white cursor-pointer hover:opacity-90 transition-all"
                                                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                            >
                                                <span className="material-symbols-outlined text-xs">edit_note</span>
                                                Create Content
                                            </button>
                                            <button
                                                onClick={() => navigate(`/seo-studio`)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-[var(--sys-text-muted)] cursor-pointer hover:bg-white/[0.05] transition-all border border-white/[0.08]"
                                            >
                                                <span className="material-symbols-outlined text-xs">key</span>
                                                Check Keywords
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}

                            {/* Content recommendations from AI analysis */}
                            {(probeResult?.contentToCreate || []).length > 0 && (
                                <div className="mt-2">
                                    <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2">AI-Recommended Content</p>
                                    {(probeResult.contentToCreate || []).map((c, i) => (
                                        <div key={i} className="glass-panel rounded-xl p-3 mb-2 flex items-start gap-3" style={{ border: '1px solid rgba(99,102,241,0.12)' }}>
                                            <div className="size-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.15)' }}>
                                                <span className="material-symbols-outlined text-[#6366f1] text-sm">
                                                    {c.format === 'blog' ? 'article' : c.format === 'faq' ? 'quiz' : c.format === 'guide' ? 'menu_book' : 'description'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-[var(--sys-text)]">{c.title}</p>
                                                <p className="text-[11px] text-[var(--sys-text-muted)] mt-0.5">{c.purpose}</p>
                                                {c.estimatedImpact && (
                                                    <span className="text-[10px] font-bold text-emerald-400 mt-1 inline-block">{c.estimatedImpact}</span>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => navigate(`/content-studio?brief=${encodeURIComponent(c.title)}`)}
                                                className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold text-white cursor-pointer hover:opacity-90 transition-all"
                                                style={{ background: 'rgba(99,102,241,0.7)' }}
                                            >
                                                Create →
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── SECTION: AI Snippets ── */}
                    {activeSection === 'snippets' && (
                        <div className="space-y-3 animate-fade-in">
                            <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">
                                Verbatim Excerpts Where Your Brand Was Cited
                            </p>
                            {(probeResult?.geoProbe?.topSnippets || []).length === 0 ? (
                                <div className="glass-panel rounded-xl p-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <p className="text-sm text-[var(--sys-text-muted)]">No snippets available. Run AI Visibility or LLM Probe to collect real responses.</p>
                                </div>
                            ) : (
                                (probeResult?.geoProbe?.topSnippets || []).map((s, i) => {
                                    const meta = getModelMeta(s.model)
                                    return (
                                        <div key={i} className="glass-panel rounded-xl p-4" style={{ border: `1px solid ${meta.color}18` }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-base">{meta.icon}</span>
                                                <span className="text-xs font-bold" style={{ color: meta.color }}>{s.model}</span>
                                                {s.sentiment && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                        s.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' :
                                                        s.sentiment === 'negative' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                                                    }`}>{s.sentiment}</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-[var(--sys-text-muted)] italic leading-relaxed">"{s.snippet}"</p>
                                            {s.prompt && (
                                                <p className="text-[10px] text-[var(--sys-text-muted)]/60 mt-2">Query: "{s.prompt}"</p>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}

                    {/* ── SECTION: Citation Drift ── */}
                    {activeSection === 'drift' && (
                        <div className="space-y-3 animate-fade-in">
                            <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">
                                Citation Changes Since Last Probe
                            </p>
                            {!probeResult?.geoProbe?.citationDrift ? (
                                <div className="glass-panel rounded-xl p-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <p className="text-sm text-[var(--sys-text-muted)]">
                                        Citation drift requires at least 2 probes. Run a new probe to compare against your baseline.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="glass-panel rounded-xl p-4" style={{ border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2">New Citations Gained</p>
                                            {(probeResult.geoProbe.citationDrift?.newCitations || []).length === 0 ? (
                                                <p className="text-xs text-[var(--sys-text-muted)]">None</p>
                                            ) : (
                                                (probeResult.geoProbe.citationDrift.newCitations || []).map((c, i) => (
                                                    <p key={i} className="text-xs text-emerald-400 flex items-center gap-1"><span>+</span>{c}</p>
                                                ))
                                            )}
                                        </div>
                                        <div className="glass-panel rounded-xl p-4" style={{ border: '1px solid rgba(244,63,94,0.2)' }}>
                                            <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-2">Citations Lost</p>
                                            {(probeResult.geoProbe.citationDrift?.lostCitations || []).length === 0 ? (
                                                <p className="text-xs text-[var(--sys-text-muted)]">None — stable!</p>
                                            ) : (
                                                (probeResult.geoProbe.citationDrift.lostCitations || []).map((c, i) => (
                                                    <p key={i} className="text-xs text-rose-400 flex items-center gap-1"><span>−</span>{c}</p>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                    <div className="glass-panel rounded-xl p-3 flex items-center gap-3" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm">info</span>
                                        <p className="text-xs text-[var(--sys-text-muted)]">
                                            Drift score: <strong className="text-[var(--sys-text)]">{probeResult.geoProbe.citationDrift.driftRate || probeResult.geoProbe.citationDrift.driftScore || 0}%</strong> change.
                                            Run probes weekly to track citation stability.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── SECTION: History / Trend ── */}
                    {activeSection === 'history' && (
                        <div className="space-y-4 animate-fade-in">
                            <p className="text-[11px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">
                                GEO Score Over Time ({scoreTimeline.length} probe{scoreTimeline.length !== 1 ? 's' : ''})
                            </p>
                            {scoreTimeline.length < 2 ? (
                                <div className="glass-panel rounded-xl p-6 text-center" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <p className="text-sm text-[var(--sys-text-muted)]">Need at least 2 probes to show a trend. Run probes regularly to track progress.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Overall trend */}
                                    <div className="glass-panel rounded-xl p-4" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                                        <p className="text-xs font-bold text-[var(--sys-text)] mb-3">Overall GEO Score</p>
                                        <TrendLine data={scoreTimeline} color="#6366f1" height={60} width={Math.min(400, (typeof window !== 'undefined' ? window.innerWidth : 500) - 100)} />
                                        <div className="flex justify-between text-[10px] text-[var(--sys-text-muted)] mt-2">
                                            <span>{scoreTimeline[0]?.date}</span>
                                            <span>{scoreTimeline.at(-1)?.date}</span>
                                        </div>
                                    </div>

                                    {/* Per-model trends */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {Object.entries(modelTimeline).map(([modelName, timeline]) => {
                                            const meta = getModelMeta(modelName)
                                            return (
                                                <div key={modelName} className="glass-panel rounded-xl p-3" style={{ border: `1px solid ${meta.color}15` }}>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span>{meta.icon}</span>
                                                        <span className="text-xs font-bold" style={{ color: meta.color }}>{modelName}</span>
                                                        {trend?.perModelDelta?.[modelName] && (
                                                            <DeltaBadge delta={trend.perModelDelta[modelName].delta} />
                                                        )}
                                                    </div>
                                                    <TrendLine data={timeline} color={meta.color} height={40} width={160} />
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/* History table */}
                                    <div className="glass-panel rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-white/[0.06]">
                                                    <th className="text-left px-4 py-2 text-[var(--sys-text-muted)] font-bold">Date</th>
                                                    <th className="text-right px-3 py-2 text-[var(--sys-text-muted)] font-bold">Score</th>
                                                    <th className="text-right px-3 py-2 text-[var(--sys-text-muted)] font-bold">Mention %</th>
                                                    <th className="text-center px-3 py-2 text-[var(--sys-text-muted)] font-bold">Position</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...history].slice(0, 10).map((h, i) => (
                                                    <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-4 py-2 text-[var(--sys-text-muted)]">{new Date(h.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                                                        <td className="px-3 py-2 text-right font-black text-[var(--sys-text)]">{h.score}</td>
                                                        <td className="px-3 py-2 text-right text-[var(--sys-text)]">{h.mentionRate}%</td>
                                                        <td className="px-3 py-2 text-center">{positionBadge(h.competitivePosition)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* ── SECTION: llms.txt ── */}
                    {activeSection === 'llms' && (
                        <div className="space-y-4 animate-fade-in">
                            <div className="glass-panel rounded-xl p-4" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                                <div className="flex items-start gap-3">
                                    <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(99,102,241,0.15)' }}>
                                        <span className="material-symbols-outlined text-[#6366f1]">description</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-[var(--sys-text)] mb-1">What is llms.txt?</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed">
                                            A simple text file at <code className="text-[#6366f1] bg-[#6366f1]/10 px-1 rounded">/llms.txt</code> on your website that tells AI engines (ChatGPT, Perplexity, Claude) exactly what your brand does, your products, and key facts — in a clean format they can reliably ingest. Think of it as your brand's resume for AI.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {!llmsTxt ? (
                                <button
                                    onClick={generateLlmsTxt}
                                    disabled={llmsLoading}
                                    id="geo-generate-llms-txt-btn"
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50"
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                                >
                                    <span className={`material-symbols-outlined text-sm ${llmsLoading ? 'animate-spin' : ''}`}>
                                        {llmsLoading ? 'progress_activity' : 'auto_awesome'}
                                    </span>
                                    {llmsLoading ? 'Generating llms.txt…' : 'Generate My llms.txt'}
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10">Ready</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{llmsTxt.lineCount} lines · {llmsTxt.charCount} chars</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={copyLlms} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text-muted)] hover:bg-white/[0.05] border border-white/[0.08] cursor-pointer transition-all">
                                                <span className="material-symbols-outlined text-xs">{llmsCopied ? 'check' : 'content_copy'}</span>
                                                {llmsCopied ? 'Copied!' : 'Copy'}
                                            </button>
                                            <button onClick={downloadLlms} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text-muted)] hover:bg-white/[0.05] border border-white/[0.08] cursor-pointer transition-all">
                                                <span className="material-symbols-outlined text-xs">download</span>
                                                Download
                                            </button>
                                            <button onClick={generateLlmsTxt} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--sys-text-muted)] hover:bg-white/[0.05] border border-white/[0.08] cursor-pointer transition-all">
                                                <span className="material-symbols-outlined text-xs">refresh</span>
                                                Regenerate
                                            </button>
                                        </div>
                                    </div>

                                    {/* Preview */}
                                    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                            <span className="text-[11px] font-bold text-[var(--sys-text-muted)]">llms.txt</span>
                                            <span className="text-[10px] text-[var(--sys-text-muted)/60]">{brand?.website?.replace(/^https?:\/\//, '')}/llms.txt</span>
                                        </div>
                                        <pre className="px-4 py-3 text-[11px] text-[var(--sys-text-muted)] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                                            {llmsTxt.llmsTxt}
                                        </pre>
                                    </div>

                                    {/* Instructions */}
                                    <div className="glass-panel rounded-xl p-3 flex items-start gap-3" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                                        <span className="material-symbols-outlined text-[#6366f1] text-sm shrink-0 mt-0.5">info</span>
                                        <div>
                                            <p className="text-xs font-bold text-[var(--sys-text)] mb-0.5">How to deploy</p>
                                            <p className="text-[11px] text-[var(--sys-text-muted)] leading-relaxed">{llmsTxt.instructions}</p>
                                            <p className="text-[11px] text-[var(--sys-text-muted)] mt-2 leading-relaxed opacity-70">{llmsTxt.tip}</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

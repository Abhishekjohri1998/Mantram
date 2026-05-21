/**
 * Brand Kit Studio — Main Tab Component
 *
 * Sub-tabs:
 *   🎨 Identity     — Logo, Icon Mark, Favicon
 *   🗂️ Stationery   — Business Card, Letterhead, Email Sig
 *   📖 Brand Guide  — Interactive hosted brand guide
 *   🚀 Collection   — New product range / campaign launch pack
 *
 * Each sub-tab shows:
 *   - Brief input form
 *   - Generate button
 *   - Past generated assets gallery
 *   - Art Director intelligence card (after generation)
 */

import { useState, useEffect, useCallback } from 'react'
import { brandKitApi } from '../../services/brandKitApi'
import AssetCard from './AssetCard'

// ── Sub-tab definitions ───────────────────────────────────────────────────────
const SUB_TABS = [
    { id: 'identity',   icon: 'fingerprint',   label: 'Identity',     credits: 20, desc: 'Logo, Icon Mark, Favicon' },
    { id: 'stationery', icon: 'style',          label: 'Stationery',   credits: 25, desc: 'Business Card, Letterhead, Email Sig' },
    { id: 'guide',      icon: 'menu_book',      label: 'Brand Guide',  credits: 15, desc: 'Interactive style guide' },
    { id: 'collection', icon: 'rocket_launch',  label: 'Collection',   credits: 30, desc: 'Product launch pack' },
]

const COLLECTION_TYPES = [
    { value: 'new-product',   label: 'New Product Launch',    icon: '✨' },
    { value: 'new-category',  label: 'New Category / Range',  icon: '📦' },
    { value: 'seasonal',      label: 'Seasonal Collection',   icon: '🌸' },
    { value: 'limited-edition', label: 'Limited Edition Drop', icon: '🔥' },
]

// ── Art Director Intelligence Card ────────────────────────────────────────────
function ArtDirectorCard({ strategy }) {
    if (!strategy?.brandArchetype) return null
    return (
        <div className="glass-panel rounded-2xl p-5 border border-primary/20 bg-primary/5 animate-fade-in">
            <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-lg">psychology</span>
                <h4 className="text-sm font-bold text-[var(--sys-text)]">Art Director Intelligence</h4>
                <span className="ml-auto px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">AI Analysis</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                    { label: 'Brand Archetype', value: strategy.brandArchetype, icon: 'category' },
                    { label: 'Design Movement', value: strategy.designMovement, icon: 'brush' },
                    { label: '2026 Trend', value: strategy.trend2026 || strategy.designMovement, icon: 'trending_up' },
                    { label: 'Mood', value: (strategy.moodKeywords || []).slice(0, 3).join(', '), icon: 'mood' },
                ].map(({ label, value, icon }) => (
                    <div key={label} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="material-symbols-outlined text-primary text-xs">{icon}</span>
                            <span className="text-xs text-[var(--sys-text-muted)] uppercase tracking-wider">{label}</span>
                        </div>
                        <p className="text-sm font-semibold text-[var(--sys-text)] leading-snug">{value || '—'}</p>
                    </div>
                ))}
            </div>
            {strategy.artDirectorNotes && (
                <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-wider mb-1">Art Director Notes</p>
                    <p className="text-sm text-[var(--sys-text)] leading-relaxed">{strategy.artDirectorNotes}</p>
                </div>
            )}
        </div>
    )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyAssets({ type, onGenerate }) {
    const msgs = {
        identity:   { icon: 'fingerprint', text: 'No identity assets yet. Generate your logo, icon mark, and favicon.' },
        stationery: { icon: 'style',        text: 'No stationery yet. Create business cards, letterhead, and email signature.' },
        guide:      { icon: 'menu_book',    text: 'No brand guide yet. Generate your interactive style guide.' },
        collection: { icon: 'rocket_launch', text: 'No collections yet. Launch a new product or campaign.' },
    }
    const m = msgs[type] || msgs.identity
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <span className="material-symbols-outlined text-5xl text-[var(--sys-text-muted)] opacity-30">{m.icon}</span>
            <p className="text-sm text-[var(--sys-text-muted)] max-w-xs">{m.text}</p>
        </div>
    )
}

// ── Loading Overlay ───────────────────────────────────────────────────────────
function GeneratingOverlay({ type }) {
    const labels = {
        identity: ['Reading brand DNA...', 'Determining archetype & design movement...', 'Crafting image prompts...', 'Generating logo variants...', 'Uploading assets...'],
        stationery: ['Analyzing brand personality...', 'Designing layout compositions...', 'Generating business card...', 'Creating letterhead...', 'Writing email signature...'],
        guide: ['Deep brand analysis...', 'Writing color system rules...', 'Composing typography guide...', 'Building voice guidelines...', 'Assembling interactive guide...'],
        collection: ['Researching 2026 trends...', 'Building campaign concept...', 'Writing launch copy...', 'Generating hero visuals...', 'Creating campaign pack...'],
    }
    const steps = labels[type] || labels.identity
    const [step, setStep] = useState(0)
    useEffect(() => {
        const t = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 5000)
        return () => clearInterval(t)
    }, [steps.length])

    return (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[var(--sys-bg)]/90 backdrop-blur-sm rounded-2xl gap-6">
            <div className="relative w-20 h-20">
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-4xl animate-pulse">auto_awesome</span>
                </div>
                <div className="absolute inset-0 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
            </div>
            <div className="text-center max-w-xs">
                <p className="text-base font-bold text-[var(--sys-text)] mb-1">Generating...</p>
                <p className="text-sm text-primary animate-pulse">{steps[step]}</p>
                <p className="text-xs text-[var(--sys-text-muted)] mt-3">This takes 1–3 minutes. Please don't close this tab.</p>
            </div>
            <div className="flex gap-2">
                {steps.map((_, i) => (
                    <div key={i} className={`h-1.5 rounded-full transition-all duration-700 ${i <= step ? 'bg-primary w-6' : 'bg-[var(--sys-border)] w-3'}`} />
                ))}
            </div>
        </div>
    )
}

// ── Copy Display for Collection ───────────────────────────────────────────────
function CollectionCopyPanel({ copy }) {
    const [copyOpen, setCopyOpen] = useState(false)
    if (!copy?.tagline) return null
    return (
        <div className="glass-panel rounded-2xl border border-[var(--sys-border)] overflow-hidden">
            <button onClick={() => setCopyOpen(o => !o)}
                className="w-full flex items-center justify-between p-5 text-left cursor-pointer hover:bg-[var(--sys-surface)] transition-colors">
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">edit_note</span>
                    <h4 className="text-sm font-bold text-[var(--sys-text)]">Campaign Copy Pack</h4>
                    <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">Claude</span>
                </div>
                <span className="material-symbols-outlined text-[var(--sys-text-muted)]">{copyOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {copyOpen && (
                <div className="border-t border-[var(--sys-border)] p-5 space-y-4">
                    {[
                        { label: 'Campaign Name', value: copy.campaignName },
                        { label: 'Tagline', value: copy.tagline, big: true },
                        { label: 'Hero Headline', value: copy.heroHeadline },
                        { label: 'Hero Subcopy', value: copy.heroSubcopy },
                        { label: 'CTA Text', value: copy.ctaText },
                        { label: 'Instagram Caption', value: copy.instagramCaption, pre: true },
                        { label: 'WhatsApp Blast', value: copy.whatsappBlast },
                        { label: 'Email Subject', value: copy.launchEmailSubject },
                    ].filter(i => i.value).map(({ label, value, big, pre }) => (
                        <div key={label}>
                            <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-wider mb-1">{label}</p>
                            <div className="flex items-start gap-2">
                                <p className={`flex-1 text-[var(--sys-text)] ${big ? 'text-xl font-bold' : 'text-sm'} ${pre ? 'whitespace-pre-wrap' : ''}`}>{value}</p>
                                <button onClick={() => navigator.clipboard.writeText(value)}
                                    className="flex-shrink-0 text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">content_copy</span>
                                </button>
                            </div>
                        </div>
                    ))}
                    {copy.socialCaptions?.length > 0 && (
                        <div>
                            <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">5 Social Captions</p>
                            <div className="space-y-2">
                                {copy.socialCaptions.map((cap, i) => (
                                    <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                        <span className="text-xs text-primary font-bold mt-0.5 shrink-0">#{i + 1}</span>
                                        <p className="text-sm text-[var(--sys-text)] flex-1">{cap}</p>
                                        <button onClick={() => navigator.clipboard.writeText(cap)}
                                            className="shrink-0 text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">content_copy</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function BrandKitStudio({ brand }) {
    const [activeTab, setActiveTab] = useState('identity')
    const [assets, setAssets] = useState({}) // { identity: [], stationery: [], guide: [], collection: [] }
    const [lastStrategy, setLastStrategy] = useState({})
    const [lastCopy, setLastCopy] = useState(null)
    const [loading, setLoading] = useState(false)
    const [loadingAssets, setLoadingAssets] = useState(true)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    // Form state
    const [brief, setBrief] = useState('')
    const [collectionType, setCollectionType] = useState('new-product')
    const [scopeLabel, setScopeLabel] = useState('')
    const [contactDetails, setContactDetails] = useState({ name: '', title: '', email: '', phone: '', website: '' })

    // Load existing assets from DB
    const loadAssets = useCallback(async () => {
        if (!brand?._id) return
        setLoadingAssets(true)
        try {
            const res = await brandKitApi.listAssets({ brandId: brand._id, limit: 50 })
            // Group by assetType
            const grouped = {}
            for (const a of res.assets || []) {
                if (!grouped[a.assetType]) grouped[a.assetType] = []
                grouped[a.assetType].push(a)
            }
            setAssets(grouped)
        } catch (e) {
            console.error('Failed to load brand kit assets:', e)
        } finally {
            setLoadingAssets(false)
        }
    }, [brand?._id])

    useEffect(() => { loadAssets() }, [loadAssets])

    const handleDelete = async (tabType, asset) => {
        try {
            await brandKitApi.deleteAsset(asset._id)
            setAssets(prev => ({
                ...prev,
                [tabType]: (prev[tabType] || []).filter(a => a._id !== asset._id),
            }))
        } catch (e) {
            setError(e.message)
        }
    }

    const generate = async () => {
        if (!brand?._id) {
            setError('No brand selected. Please select or create a brand first.')
            return
        }
        setError('')
        setSuccess('')
        setLoading(true)

        try {
            let result
            const basePayload = { brandId: brand._id, brief: brief || undefined }

            if (activeTab === 'identity') {
                result = await brandKitApi.generateIdentity(basePayload)
            } else if (activeTab === 'stationery') {
                result = await brandKitApi.generateStationery({ ...basePayload, contactDetails })
            } else if (activeTab === 'guide') {
                result = await brandKitApi.generateGuide(basePayload)
            } else if (activeTab === 'collection') {
                result = await brandKitApi.generateCollection({
                    ...basePayload,
                    brief: brief || scopeLabel || `${collectionType} launch`,
                    collectionType,
                    scopeLabel: scopeLabel || 'New Collection',
                    scope: 'campaign',
                })
            }

            if (result?.asset) {
                setAssets(prev => ({
                    ...prev,
                    [activeTab]: [result.asset, ...(prev[activeTab] || [])],
                }))
            }
            if (result?.artStrategy) setLastStrategy(prev => ({ ...prev, [activeTab]: result.artStrategy }))
            if (result?.copy) setLastCopy(result.copy)
            setSuccess('Generated successfully!')
            setBrief('')
        } catch (e) {
            setError(e.message || 'Generation failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    const tabAssets = assets[activeTab] || []
    const currentStrategy = lastStrategy[activeTab]
    const currentTab = SUB_TABS.find(t => t.id === activeTab)

    return (
        <div className="col-span-12 space-y-6">

            {/* ── Sub-tab Navigation ── */}
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit">
                {SUB_TABS.map(tab => (
                    <button key={tab.id}
                        onClick={() => { setActiveTab(tab.id); setError(''); setSuccess('') }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                        <span className="material-symbols-outlined text-[1.1rem]">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Brief / Config Panel ── */}
            <div className="glass-panel rounded-2xl p-6 border border-[var(--sys-border)] relative overflow-hidden">
                {loading && <GeneratingOverlay type={activeTab} />}

                <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="material-symbols-outlined text-primary">{currentTab?.icon}</span>
                            <h3 className="font-bold text-[var(--sys-text)]">{currentTab?.label}</h3>
                            <span className="text-xs text-[var(--sys-text-muted)]">— {currentTab?.desc}</span>
                        </div>
                        <p className="text-xs text-[var(--sys-text-muted)] mb-4">
                            {currentTab?.credits} credits · Powered by Claude Sonnet + Gemini Flash
                        </p>

                        {/* Brief input */}
                        {activeTab !== 'collection' ? (
                            <textarea
                                className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                placeholder={
                                    activeTab === 'identity' ? 'Optional: Any specific direction for the logo? (e.g. "modern wordmark with abstract geometric mark, earthy tones")'
                                    : activeTab === 'stationery' ? 'Optional: Any specific stationery preferences? (e.g. "minimal white with gold foil, landscape business card")'
                                    : 'Optional: Specific focus for the brand guide? (e.g. "emphasize sustainability messaging")'
                                }
                                rows={2}
                                value={brief}
                                onChange={e => setBrief(e.target.value)}
                                disabled={loading}
                            />
                        ) : (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {COLLECTION_TYPES.map(ct => (
                                        <button key={ct.value}
                                            onClick={() => setCollectionType(ct.value)}
                                            disabled={loading}
                                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center text-xs font-medium transition-all cursor-pointer ${collectionType === ct.value ? 'border-primary bg-primary/10 text-[var(--sys-text)]' : 'border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                            <span className="text-xl">{ct.icon}</span>
                                            {ct.label}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="Collection name or brief (e.g. 'Summer Glow 2026', 'AirFlow Pro launch')"
                                    value={scopeLabel}
                                    onChange={e => setScopeLabel(e.target.value)}
                                    disabled={loading}
                                />
                                <textarea
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                    placeholder="Describe the product, vibe, and launch goals..."
                                    rows={2}
                                    value={brief}
                                    onChange={e => setBrief(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        )}

                        {/* Stationery contact fields */}
                        {activeTab === 'stationery' && (
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                {[
                                    { key: 'name', placeholder: 'Your Name' },
                                    { key: 'title', placeholder: 'Title (Founder / CEO)' },
                                    { key: 'email', placeholder: 'Email' },
                                    { key: 'phone', placeholder: 'Phone' },
                                ].map(({ key, placeholder }) => (
                                    <input key={key}
                                        className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                        placeholder={placeholder}
                                        value={contactDetails[key] || ''}
                                        onChange={e => setContactDetails(d => ({ ...d, [key]: e.target.value }))}
                                        disabled={loading}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={generate}
                        disabled={loading}
                        className="btn-primary px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap self-start mt-8">
                        <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>
                            {loading ? 'progress_activity' : 'auto_awesome'}
                        </span>
                        {loading ? 'Generating...' : `Generate ${currentTab?.label}`}
                    </button>
                </div>

                {/* Status messages */}
                {error && (
                    <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary">
                        <span className="material-symbols-outlined text-sm">error</span>{error}
                    </div>
                )}
                {success && (
                    <div className="flex items-center gap-2 mt-4 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm text-primary">
                        <span className="material-symbols-outlined text-sm">check_circle</span>{success}
                    </div>
                )}
            </div>

            {/* ── Art Director Intelligence Card ── */}
            {currentStrategy && <ArtDirectorCard strategy={currentStrategy} />}

            {/* ── Collection Copy Panel ── */}
            {activeTab === 'collection' && lastCopy && <CollectionCopyPanel copy={lastCopy} />}

            {/* ── Assets Gallery ── */}
            <div className="glass-panel rounded-2xl p-6 border border-[var(--sys-border)]">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">{currentTab?.icon}</span>
                        Generated {currentTab?.label}
                        {tabAssets.length > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">{tabAssets.length}</span>
                        )}
                    </h3>
                    {tabAssets.length > 0 && (
                        <button onClick={loadAssets} className="text-xs text-[var(--sys-text-muted)] hover:text-primary transition-colors flex items-center gap-1 cursor-pointer">
                            <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                        </button>
                    )}
                </div>

                {loadingAssets ? (
                    <div className="flex items-center justify-center py-10 text-[var(--sys-text-muted)]">
                        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...
                    </div>
                ) : tabAssets.length === 0 ? (
                    <EmptyAssets type={activeTab} />
                ) : (
                    <div className="space-y-6">
                        {tabAssets.map((savedAsset, idx) => (
                            <div key={savedAsset._id || idx} className="animate-fade-in">
                                {/* Kit header */}
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs text-[var(--sys-text-muted)]">
                                        {new Date(savedAsset.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                    {savedAsset.artDirectorIntelligence?.brandArchetype && (
                                        <span className="px-2 py-0.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text-muted)]">
                                            {savedAsset.artDirectorIntelligence.brandArchetype} · {savedAsset.artDirectorIntelligence.designMovement}
                                        </span>
                                    )}
                                </div>

                                {/* Asset cards grid */}
                                <div className={`grid gap-4 ${activeTab === 'guide' ? 'grid-cols-1' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                                    {(savedAsset.assets || []).map((asset, ai) => (
                                        <AssetCard
                                            key={ai}
                                            asset={asset}
                                            onDelete={() => handleDelete(activeTab, savedAsset)}
                                            compact={activeTab === 'guide'}
                                        />
                                    ))}

                                    {/* Guide hosted link card */}
                                    {activeTab === 'guide' && savedAsset.assets?.[0]?.hostedUrl && (
                                        <a href={savedAsset.assets[0].hostedUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all group">
                                            <span className="material-symbols-outlined text-primary text-2xl">open_in_new</span>
                                            <div>
                                                <p className="text-sm font-bold text-[var(--sys-text)]">View Brand Guide</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">Interactive hosted guide</p>
                                            </div>
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

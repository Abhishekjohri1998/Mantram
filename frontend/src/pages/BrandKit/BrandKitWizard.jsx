/**
 * BrandKitWizard — Zero-brand all-in-one wizard modal
 *
 * 3-step flow:
 *   Step 1: Brand Brief (name, what you sell, audience)
 *   Step 2: Style Preferences (personality, price point, country)
 *            + Logo Upload + Collateral brief
 *   Step 3: Generating... (animated progress)
 */

import { useState, useRef } from 'react'
import { brandKitApi } from '../../services/brandKitApi'

const PERSONALITIES = [
    { value: 'bold-playful', label: 'Bold & Playful', icon: '🎨' },
    { value: 'premium-luxury', label: 'Premium & Luxe', icon: '💎' },
    { value: 'clean-minimal', label: 'Clean & Minimal', icon: '⬜' },
    { value: 'warm-human', label: 'Warm & Human', icon: '🤝' },
    { value: 'edgy-disruptive', label: 'Edgy & Disruptive', icon: '⚡' },
    { value: 'natural-organic', label: 'Natural & Organic', icon: '🌿' },
]

const PRICE_POINTS = [
    { value: 'budget', label: 'Value / Budget' },
    { value: 'mid', label: 'Mid Range' },
    { value: 'mid-premium', label: 'Mid Premium' },
    { value: 'premium', label: 'Premium' },
    { value: 'luxury', label: 'Luxury' },
]

const GENERATION_STEPS = [
    { icon: 'psychology', text: 'Analyzing brand archetype & 2026 design trends...' },
    { icon: 'palette', text: 'Art Director building visual strategy...' },
    { icon: 'auto_awesome', text: 'Crafting GPT-Image-2 identity system prompts...' },
    { icon: 'image', text: 'Generating identity system boards & collateral...' },
    { icon: 'style', text: 'Designing stationery kit...' },
    { icon: 'article', text: 'Writing brand guide...' },
    { icon: 'check_circle', text: 'Finalizing brand kit...' },
]

export default function BrandKitWizard({ onClose, onComplete }) {
    const [step, setStep] = useState(1)
    const [generating, setGenerating] = useState(false)
    const [genStep, setGenStep] = useState(0)
    const [error, setError] = useState('')

    // Logo state
    const [hasExistingLogo, setHasExistingLogo] = useState(false)
    const [existingLogoUrl, setExistingLogoUrl] = useState('')
    const [logoUploadMode, setLogoUploadMode] = useState('url') // 'url' | 'file'
    const [logoUploading, setLogoUploading] = useState(false)
    const logoFileRef = useRef(null)

    const [form, setForm] = useState({
        name: '',
        products: '',
        targetAudience: '',
        personality: '',
        pricePoint: 'mid-premium',
        country: 'India',
        vision: '',
        contactName: '',
        contactTitle: '',
        collateralBrief: '',
    })

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
    const canStep1 = form.name.trim() && form.products.trim()
    const canStep2 = form.personality

    const handleGenerate = async () => {
        setGenerating(true)
        setError('')
        setStep(3)

        // Animate generation steps
        let stepIdx = 0
        const stepInterval = setInterval(() => {
            stepIdx++
            if (stepIdx < GENERATION_STEPS.length) setGenStep(stepIdx)
        }, 5000)

        try {
            const result = await brandKitApi.runWizard({
                briefBrand: {
                    name: form.name,
                    products: form.products,
                    targetAudience: form.targetAudience || 'Urban professionals 25-40',
                    personality: form.personality,
                    pricePoint: form.pricePoint,
                    country: form.country,
                    vision: form.vision,
                },
                contactDetails: {
                    name: form.contactName || form.name,
                    title: form.contactTitle || 'Founder',
                    company: form.name,
                },
                existingLogoUrl: hasExistingLogo && existingLogoUrl ? existingLogoUrl : undefined,
                collateralBrief: form.collateralBrief || undefined,
            })
            clearInterval(stepInterval)
            onComplete?.(result)
        } catch (err) {
            clearInterval(stepInterval)
            setError(err.message || 'Generation failed. Please try again.')
            setStep(2)
            setGenerating(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={!generating ? onClose : undefined} />

            <div className="relative w-full max-w-xl rounded-2xl border border-[var(--sys-border)] overflow-hidden animate-fade-in"
                style={{ background: 'rgba(15,15,25,0.98)' }}>

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[var(--sys-border)]">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-[var(--sys-text)]">Brand Kit Wizard</h3>
                            <p className="text-xs text-[var(--sys-text-muted)]">AI generates your complete brand identity system</p>
                        </div>
                    </div>
                    {!generating && (
                        <button onClick={onClose} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>

                {/* Step Indicators */}
                {step < 3 && (
                    <div className="flex items-center gap-0 px-6 pt-5">
                        {[1, 2].map(s => (
                            <div key={s} className="flex items-center gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-primary text-white' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                    {s}
                                </div>
                                {s < 2 && <div className={`h-px w-16 transition-all ${step > s ? 'bg-primary' : 'bg-[var(--sys-border)]'}`} />}
                            </div>
                        ))}
                        <p className="ml-4 text-xs text-[var(--sys-text-muted)]">
                            {step === 1 ? 'Brand Brief' : 'Style & Identity'}
                        </p>
                    </div>
                )}

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">

                    {/* ── Step 1: Brand Brief ── */}
                    {step === 1 && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Brand Name *</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="e.g. Amara, Zest, Folio..."
                                    value={form.name}
                                    onChange={e => set('name', e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">What do you sell? *</label>
                                <textarea
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                    placeholder="e.g. Artisanal skincare products for sensitive skin. Handcrafted with natural ingredients..."
                                    rows={3}
                                    value={form.products}
                                    onChange={e => set('products', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Target Audience</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="e.g. Women 25-40, urban, health-conscious"
                                    value={form.targetAudience}
                                    onChange={e => set('targetAudience', e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Founder Vision (optional)</label>
                                <input
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                    placeholder="e.g. Clean beauty that doesn't compromise on results"
                                    value={form.vision}
                                    onChange={e => set('vision', e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    {/* ── Step 2: Style + Identity ── */}
                    {step === 2 && (
                        <>
                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-3 uppercase tracking-wider">Brand Personality *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PERSONALITIES.map(p => (
                                        <button key={p.value}
                                            onClick={() => set('personality', p.value)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all cursor-pointer ${form.personality === p.value ? 'border-primary bg-primary/10 text-[var(--sys-text)]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                            <span className="text-xl">{p.icon}</span>
                                            <span className="text-sm font-medium">{p.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-2 uppercase tracking-wider">Price Point</label>
                                <div className="flex gap-2 flex-wrap">
                                    {PRICE_POINTS.map(p => (
                                        <button key={p.value}
                                            onClick={() => set('pricePoint', p.value)}
                                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${form.pricePoint === p.value ? 'border-primary bg-primary/10 text-primary' : 'border-[var(--sys-border)] bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:border-primary/30'}`}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Country / Market</label>
                                <select
                                    className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                    value={form.country}
                                    onChange={e => set('country', e.target.value)}>
                                    {['India', 'US', 'UK', 'UAE', 'Singapore', 'Australia', 'Canada', 'Global'].map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Your Name (for stationery)</label>
                                    <input className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                        placeholder="Full Name" value={form.contactName} onChange={e => set('contactName', e.target.value)} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">Title</label>
                                    <input className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                        placeholder="Founder / CEO" value={form.contactTitle} onChange={e => set('contactTitle', e.target.value)} />
                                </div>
                            </div>

                            {/* ── Existing Logo Section ── */}
                            <div className="space-y-3 pt-1">
                                <div className="h-px bg-[var(--sys-border)]" />
                                <p className="text-xs font-bold text-[var(--sys-text)] uppercase tracking-wider">Identity Setup</p>

                                {/* Toggle */}
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <span className="material-symbols-outlined text-primary text-base">image_search</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-xs font-semibold text-[var(--sys-text)]">Do you have an existing logo?</p>
                                        <p className="text-xs text-[var(--sys-text-muted)]">We'll build the full identity system around it</p>
                                    </div>
                                    <button
                                        onClick={() => { setHasExistingLogo(v => !v); setExistingLogoUrl('') }}
                                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${hasExistingLogo ? 'bg-primary' : 'bg-[var(--sys-border)]'}`}>
                                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${hasExistingLogo ? 'left-5' : 'left-0.5'}`} />
                                    </button>
                                </div>

                                {/* No logo banner */}
                                {!hasExistingLogo && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15">
                                        <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                                        <p className="text-xs text-[var(--sys-text-muted)]">AI will design a new logo + full identity system from your brand brief</p>
                                    </div>
                                )}

                                {/* Logo upload UI */}
                                {hasExistingLogo && (
                                    <div className="space-y-2">
                                        {/* Mode toggle */}
                                        <div className="flex gap-1 p-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit">
                                            {[['url', 'link', 'Paste URL'], ['file', 'upload', 'Upload File']].map(([mode, icon, label]) => (
                                                <button key={mode}
                                                    onClick={() => setLogoUploadMode(mode)}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${logoUploadMode === mode ? 'bg-primary text-white' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                                    <span className="material-symbols-outlined text-sm">{icon}</span>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>

                                        {logoUploadMode === 'url' ? (
                                            <input
                                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                                placeholder="Paste your logo URL (S3, Cloudinary, Google Drive...)"
                                                value={existingLogoUrl}
                                                onChange={e => setExistingLogoUrl(e.target.value)}
                                            />
                                        ) : (
                                            <div
                                                onClick={() => logoFileRef.current?.click()}
                                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                                                    existingLogoUrl ? 'border-primary/50 bg-primary/5' : 'border-[var(--sys-border)] hover:border-primary/30'
                                                }`}>
                                                {logoUploading ? (
                                                    <span className="material-symbols-outlined text-primary animate-spin text-xl">progress_activity</span>
                                                ) : existingLogoUrl ? (
                                                    <img src={existingLogoUrl} alt="logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-2xl">add_photo_alternate</span>
                                                )}
                                                <div>
                                                    <p className="text-sm text-[var(--sys-text)] font-medium">
                                                        {existingLogoUrl ? 'Logo uploaded ✓' : 'Click to upload logo'}
                                                    </p>
                                                    <p className="text-xs text-[var(--sys-text-muted)]">PNG, SVG, JPG — transparent background preferred</p>
                                                </div>
                                                <input
                                                    ref={logoFileRef}
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0]
                                                        if (!file) return
                                                        setLogoUploading(true)
                                                        const reader = new FileReader()
                                                        reader.onload = (ev) => {
                                                            setExistingLogoUrl(ev.target.result)
                                                            setLogoUploading(false)
                                                        }
                                                        reader.readAsDataURL(file)
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Collateral Brief */}
                                <div>
                                    <label className="block text-xs font-medium text-[var(--sys-text-muted)] mb-1.5 uppercase tracking-wider">
                                        Real-world Collateral (optional)
                                    </label>
                                    <input
                                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:outline-none focus:border-primary/50 transition-colors"
                                        placeholder="e.g. product packaging, coffee cup, tote bag, phone case, shopping bag"
                                        value={form.collateralBrief}
                                        onChange={e => set('collateralBrief', e.target.value)}
                                    />
                                    <p className="text-xs text-[var(--sys-text-muted)] mt-1">These will appear in your identity mockup visuals</p>
                                </div>
                            </div>

                            {error && <p className="text-sm text-primary bg-primary/10 rounded-xl px-4 py-2">{error}</p>}
                        </>
                    )}

                    {/* ── Step 3: Generating ── */}
                    {step === 3 && (
                        <div className="py-8 space-y-8">
                            <div className="text-center">
                                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 relative">
                                    <span className="material-symbols-outlined text-primary text-4xl animate-pulse">auto_awesome</span>
                                    <div className="absolute inset-0 rounded-2xl border-2 border-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
                                </div>
                                <h4 className="text-xl font-bold text-[var(--sys-text)] mb-2">Building your brand system...</h4>
                                <p className="text-sm text-[var(--sys-text-muted)]">
                                    {hasExistingLogo
                                        ? 'Art Director + GPT-Image-2 extending your logo into a full identity system.'
                                        : 'Art Director + GPT-Image-2 designing your complete identity from scratch.'}
                                    {' '}This takes ~3 minutes.
                                </p>
                            </div>

                            {/* Steps progress */}
                            <div className="space-y-3">
                                {GENERATION_STEPS.map((s, i) => (
                                    <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${i <= genStep ? 'bg-primary/5 border border-primary/20' : 'opacity-30'}`}>
                                        <span className={`material-symbols-outlined text-sm ${i < genStep ? 'text-primary' : i === genStep ? 'text-primary animate-pulse' : 'text-[var(--sys-text-muted)]'}`}>
                                            {i < genStep ? 'check_circle' : s.icon}
                                        </span>
                                        <span className="text-sm text-[var(--sys-text)]">{s.text}</span>
                                        {i === genStep && <div className="ml-auto flex gap-1">
                                            {[0, 1, 2].map(d => <div key={d} className="w-1 h-1 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${d * 150}ms` }} />)}
                                        </div>}
                                    </div>
                                ))}
                            </div>
                            <p className="text-center text-xs text-[var(--sys-text-muted)]">60 credits will be deducted on completion</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step < 3 && (
                    <div className="flex items-center justify-between p-6 border-t border-[var(--sys-border)]">
                        <div className="text-xs text-[var(--sys-text-muted)]">
                            {step === 2 && <span>🎨 60 credits — Identity System + Stationery + Brand Guide</span>}
                        </div>
                        <div className="flex gap-3">
                            {step === 2 && (
                                <button onClick={() => setStep(1)}
                                    className="px-4 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                                    Back
                                </button>
                            )}
                            {step === 1 && (
                                <button onClick={() => setStep(2)} disabled={!canStep1}
                                    className="btn-primary px-6 py-2 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50">
                                    Next →
                                </button>
                            )}
                            {step === 2 && (
                                <button onClick={handleGenerate} disabled={!canStep2}
                                    className="btn-primary px-6 py-2 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                    Generate Brand Kit
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

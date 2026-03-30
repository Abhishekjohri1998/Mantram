import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { agents, brands as brandsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import VoiceInput from '../components/VoiceInput'
import { COUNTRIES } from '../data/calendarData'
import SEOHead from '../components/SEOHead'

// ============= Step Progress Indicator =============
function ProgressIndicator({ step, total }) {
    return (
        <div className="flex items-center gap-2 mb-8">
            {Array.from({ length: total }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${i < step ? 'bg-primary text-white shadow-lg shadow-primary/30' :
                        i === step ? 'bg-primary/20 text-primary border-2 border-primary' :
                            'bg-white/[0.05] text-slate-600 border border-white/[0.08]'
                        }`}>
                        {i < step ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
                    </div>
                    {i < total - 1 && (
                        <div className={`w-12 h-0.5 transition-all duration-500 ${i < step ? 'bg-primary' : 'bg-white/[0.08]'}`} />
                    )}
                </div>
            ))}
        </div>
    )
}

// ============= Step 1: Choose Path =============
function ChoosePath({ onSelect }) {
    const paths = [
        { id: 'website', icon: 'language', title: 'Scan My Website', desc: 'We\'ll analyze your website and extract everything — logo, colors, fonts, voice, content style.', badge: 'RECOMMENDED' },
        { id: 'upload', icon: 'upload_file', title: 'Upload Brand Assets', desc: 'Upload your logo, brand guidelines, or any brand-related documents and images.' },
        { id: 'brainstorm', icon: 'psychology', title: 'AI Brainstorming', desc: 'Don\'t have existing brand assets? Let AI help you build a brand identity from scratch.' },
    ]
    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <h2 className="text-3xl font-extrabold text-center mb-2 tracking-tight">How should we learn <span className="text-primary">about your brand?</span></h2>
            <p className="text-slate-400 text-center mb-10">Choose how you'd like to build your brand knowledge bank.</p>
            <div className="grid gap-4">
                {paths.map(p => (
                    <button key={p.id} onClick={() => onSelect(p.id)}
                        className="glass-panel rounded-2xl p-6 flex items-center gap-5 hover:bg-white/[0.05] hover:border-primary/30 transition-all cursor-pointer text-left group">
                        <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                            <span className="material-symbols-outlined text-3xl">{p.icon}</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-white">{p.title}</h3>
                                {p.badge && <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{p.badge}</span>}
                            </div>
                            <p className="text-sm text-slate-400 mt-1">{p.desc}</p>
                        </div>
                        <span className="material-symbols-outlined text-slate-600 group-hover:text-primary transition-colors">arrow_forward</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

// ============= Step 2a: Website Scan =============
function WebsiteScan({ onComplete, onBack, initialUrl = '' }) {
    const [url, setUrl] = useState(initialUrl)
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentStep, setCurrentStep] = useState('')
    const [stepIndex, setStepIndex] = useState(0)
    const [error, setError] = useState(null)

    const steps = [
        { label: 'Connecting to website', icon: 'language', duration: 800 },
        { label: 'Extracting page structure', icon: 'code', duration: 1000 },
        { label: 'Taking website screenshot', icon: 'screenshot_monitor', duration: 1200 },
        { label: 'AI Vision — identifying logo', icon: 'visibility', duration: 1500 },
        { label: 'AI Vision — detecting brand colors', icon: 'palette', duration: 1200 },
        { label: 'Detecting typography', icon: 'text_fields', duration: 800 },
        { label: 'Collecting homepage images', icon: 'photo_library', duration: 1000 },
        { label: 'Scanning social media profiles', icon: 'share', duration: 1500 },
        { label: 'Analyzing brand voice & tone', icon: 'record_voice_over', duration: 2000 },
        { label: 'Building your Brand DNA', icon: 'fingerprint', duration: 1200 },
    ]

    const handleScan = async () => {
        if (!url.trim()) return
        setScanning(true)
        setError(null)
        setStepIndex(0)

        // Animate progress steps while the real API call runs
        let idx = 0
        const interval = setInterval(() => {
            if (idx < steps.length) {
                setCurrentStep(steps[idx].label)
                setStepIndex(idx)
                setProgress(Math.round(((idx + 1) / steps.length) * 90))
                idx++
            }
        }, 1400)

        try {
            const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
            const data = await agents.scanWebsite(normalizedUrl)
            clearInterval(interval)
            setProgress(100)
            setCurrentStep('Brand DNA extracted successfully!')
            setStepIndex(steps.length)
            setTimeout(() => onComplete(data.brand), 800)
        } catch (err) {
            clearInterval(interval)
            setScanning(false)
            setError({
                message: err.message || 'Failed to scan website. Please check the URL and try again.',
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            {!scanning ? (
                /* ── Pre-Scan: Enter URL ── */
                <div className="text-center">
                    <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-8 hover:text-white transition-colors cursor-pointer mx-auto">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>

                    <div className="glass-panel rounded-3xl p-10 max-w-lg mx-auto relative overflow-hidden">
                        {/* Subtle glow */}
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] to-emerald-500/[0.02] pointer-events-none" />
                        <div className="relative">
                            <h2 className="text-3xl font-extrabold mb-2 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Enter your website
                            </h2>
                            <p className="text-slate-400 text-sm mb-8">We'll analyze your business and generate your Business DNA</p>

                            <div className="relative mb-4">
                                <input
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                                    placeholder="www.example.com"
                                    className="w-full py-4 px-5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white text-lg placeholder-slate-600 focus:outline-none focus:border-primary/40 focus:bg-white/[0.06] transition-all"
                                    autoFocus
                                />
                            </div>

                            <button onClick={handleScan} disabled={!url.trim()}
                                className="w-full py-4 rounded-2xl text-lg font-bold transition-all cursor-pointer disabled:opacity-20"
                                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                Continue
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className={`mt-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} text-sm flex items-center gap-2 max-w-lg mx-auto`}>
                            <span className="material-symbols-outlined text-lg">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            <div className="flex-1 text-left">
                                {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                                {error.message}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* ── Scanning: Pomelli-style Loading ── */
                <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
                    {/* Glow background */}
                    <div className="fixed inset-0 pointer-events-none" style={{
                        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(var(--primary-rgb, 43, 75, 238), 0.08) 0%, transparent 70%)',
                    }} />

                    <div className="glass-panel rounded-3xl p-10 max-w-lg w-full text-center relative overflow-hidden">
                        {/* Animated glow border */}
                        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
                            background: 'linear-gradient(135deg, rgba(var(--primary-rgb, 43, 75, 238), 0.1), transparent 40%, transparent 60%, rgba(16, 185, 129, 0.08))',
                        }} />

                        <div className="relative">
                            <h2 className="text-3xl font-extrabold mb-3 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Generating your Business<br />DNA
                            </h2>
                            <p className="text-slate-400 text-sm mb-8">
                                We're researching and analyzing your business.<br />
                                It will take several minutes. Feel free to come back later.
                            </p>

                            {/* Current Step Badge */}
                            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl mb-6 transition-all duration-500"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="material-symbols-outlined text-primary text-sm animate-pulse">
                                    {stepIndex < steps.length ? steps[stepIndex]?.icon : 'check_circle'}
                                </span>
                                <span className="text-sm text-slate-300 font-medium">{currentStep}</span>
                            </div>

                            {/* Website URL chip */}
                            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl mx-auto mb-8"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span className="material-symbols-outlined text-slate-500 text-sm">link</span>
                                <span className="text-sm text-white font-medium">{url.startsWith('http') ? url : `https://${url}`}</span>
                            </div>

                            {/* Progress indicator */}
                            <div className="flex items-center justify-center gap-2 text-sm">
                                <div className="relative size-5">
                                    <svg className="size-5 -rotate-90" viewBox="0 0 20 20">
                                        <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                                        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--primary, #2B4BEE)" strokeWidth="2"
                                            strokeDasharray={`${progress * 0.5} 50`}
                                            className="transition-all duration-700" />
                                    </svg>
                                </div>
                                <span className="text-primary text-sm">About {Math.max(1, 5 - Math.floor(progress / 20))} minutes left</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============= Step 2b: File Upload =============
function FileUpload({ onComplete, onBack }) {
    const [files, setFiles] = useState([])
    const [brandName, setBrandName] = useState('')
    const [industry, setIndustry] = useState('')
    const [website, setWebsite] = useState('')
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState(null)

    const handleDrop = (e) => {
        e.preventDefault()
        const dropped = Array.from(e.dataTransfer?.files || e.target.files || [])
        setFiles(prev => [...prev, ...dropped])
    }

    const handleCreate = async () => {
        if (!brandName.trim()) return
        setUploading(true)
        setError(null)
        try {
            const normalizedWebsite = website.trim() ? (website.startsWith('http') ? website : `https://${website}`) : ''
            const data = await brandsAPI.create({
                name: brandName,
                website: normalizedWebsite,
                onboardingMethod: 'upload',
                dna: {
                    industry,
                    country,
                    brandDescription: `Brand created via file upload with ${files.length} assets.`,
                },
            })
            onComplete(data.brand)

        } catch (err) {
            setUploading(false)
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h2 className="text-3xl font-extrabold mb-2">Upload Brand <span className="text-primary">Assets</span></h2>
            <p className="text-slate-400 mb-8">Upload your logo, brand guidelines, or any brand-related content.</p>

            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Brand Name *" className="input-glass w-full py-3 text-lg" autoFocus />
                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website (e.g., example.com)" className="input-glass w-full py-3 text-lg" />
                </div>
                <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Industry (e.g., Technology, Fashion, Food)" className="input-glass w-full py-3" />


                {/* Country Picker */}
                <div>
                    <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">Target Country *</label>
                    <div className="flex flex-wrap gap-2">
                        {COUNTRIES.map(c => (
                            <button key={c.id} onClick={() => setCountry(c.id)} type="button"
                                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                    ${country === c.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                <span className="text-sm">{c.flag}</span> {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                    className="border-2 border-dashed border-white/[0.1] rounded-2xl p-12 text-center hover:border-primary/40 transition-colors">
                    <span className="material-symbols-outlined text-4xl text-slate-600 mb-4 block">cloud_upload</span>
                    <p className="text-slate-400 mb-2">Drag & drop files here, or</p>
                    <label className="btn-primary py-2 px-6 rounded-xl cursor-pointer inline-block">
                        Browse Files
                        <input type="file" multiple className="hidden" onChange={handleDrop} accept="image/*,.pdf,.doc,.docx" />
                    </label>
                    <p className="text-xs text-slate-600 mt-3">Logo, brand guidelines, content samples, images</p>
                </div>

                {files.length > 0 && (
                    <div className="space-y-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                <span className="material-symbols-outlined text-primary text-lg">description</span>
                                <span className="text-sm text-white flex-1">{f.name}</span>
                                <span className="text-sm text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
                                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                    className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className={`p-4 rounded-xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} text-sm flex items-center gap-2`}>
                        <span className="material-symbols-outlined text-lg">
                            {error.isProviderError ? 'warning' : 'error'}
                        </span>
                        <div className="flex-1">
                            {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                            {error.message}
                        </div>
                    </div>
                )}

                <button onClick={handleCreate} disabled={!brandName.trim() || uploading}
                    className="btn-primary w-full py-4 rounded-xl text-lg disabled:opacity-30">
                    {uploading ? 'Creating Brand...' : 'Create Brand Profile'}
                </button>
            </div>
        </div>
    )
}

// ============= Step 2c: AI Brainstorm =============
function Brainstorm({ onComplete, onBack }) {
    const [step, setStep] = useState(0)
    const [brandName, setBrandName] = useState('')
    const [website, setWebsite] = useState('')
    const [industry, setIndustry] = useState('')
    const [country, setCountry] = useState('India')
    const [description, setDescription] = useState('')
    const [targetAudience, setTargetAudience] = useState('')
    const [keywords, setKeywords] = useState([])

    const [keywordInput, setKeywordInput] = useState('')
    const [personality, setPersonality] = useState('')
    const [hasLogo, setHasLogo] = useState(null)
    const [logoKeywords, setLogoKeywords] = useState('')
    const [generatingLogo, setGeneratingLogo] = useState(false)
    const [generatedLogo, setGeneratedLogo] = useState(null)
    const [generating, setGenerating] = useState(false)
    const [suggestion, setSuggestion] = useState(null)
    const [error, setError] = useState(null)

    const industries = ['Technology', 'Fashion & Apparel', 'Food & Beverage', 'Health & Wellness', 'Finance', 'Education', 'Real Estate', 'E-commerce', 'SaaS', 'Entertainment', 'Travel', 'Automotive', 'Beauty', 'Sports & Fitness', 'Home & Living', 'Pet Care', 'Kids & Baby', 'Agriculture', 'Other']

    const personalityOptions = [
        { id: 'bold', icon: 'bolt', label: 'Bold & Energetic' },
        { id: 'elegant', icon: 'diamond', label: 'Elegant & Premium' },
        { id: 'friendly', icon: 'mood', label: 'Friendly & Warm' },
        { id: 'professional', icon: 'business', label: 'Professional & Corporate' },
        { id: 'playful', icon: 'celebration', label: 'Playful & Fun' },
        { id: 'minimal', icon: 'format_shapes', label: 'Minimal & Clean' },
        { id: 'innovative', icon: 'rocket_launch', label: 'Innovative & Tech' },
        { id: 'earthy', icon: 'eco', label: 'Natural & Organic' },
    ]

    const addKeyword = () => {
        if (keywordInput.trim() && !keywords.includes(keywordInput.trim())) {
            setKeywords([...keywords, keywordInput.trim()])
            setKeywordInput('')
        }
    }

    const suggestedKeywords = {
        'Technology': ['innovative', 'smart', 'future', 'digital', 'AI-powered', 'cutting-edge'],
        'Fashion & Apparel': ['trendy', 'sustainable', 'premium', 'streetwear', 'luxury', 'modern'],
        'Food & Beverage': ['organic', 'fresh', 'authentic', 'homemade', 'artisan', 'healthy'],
        'Health & Wellness': ['holistic', 'natural', 'mindful', 'balance', 'vitality', 'clean'],
        'E-commerce': ['fast shipping', 'best price', 'curated', 'trusted', 'quality', 'deals'],
        'Beauty': ['glow', 'radiance', 'natural beauty', 'skincare', 'luxury', 'clean beauty'],
    }

    const handleGenerateLogo = async () => {
        setGeneratingLogo(true)
        try {
            const data = await agents.generateLogo({
                brandName,
                industry,
                keywords: [...keywords, logoKeywords].filter(Boolean).join(', '),
                personality,
            })
            setGeneratedLogo(data.logoUrl)
        } catch (err) {
            // Fallback to creative generation
            try {
                const { creatives: creativesAPI } = await import('../services/api')
                alert('Logo generation is being processed...')
            } catch { }
            setError({
                message: err.message || 'Logo generation failed',
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally {
            setGeneratingLogo(false)
        }
    }

    const handleBrainstorm = async () => {
        setGenerating(true)
        setError('')
        try {
            const data = await agents.brainstorm({
                industry,
                keywords: keywords.join(', '),
                description: `Brand name: ${brandName}. ${description}. Target audience: ${targetAudience}. Brand personality: ${personality}.`,
                brandName,
                personality,
                targetAudience,
            })
            setSuggestion({ ...data.brandSuggestion, name: brandName })
            setStep(3)
        } catch (err) {
            setError({
                message: err.message || 'AI brainstorming failed.',
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally {
            setGenerating(false)
        }
    }

    const handleAccept = async () => {
        if (!suggestion) return
        setGenerating(true)
        setError('')
        try {
            const brandData = {
                ...suggestion,
                name: brandName,
                website: website.trim() ? (website.startsWith('http') ? website : `https://${website}`) : '',
                industry,
                country,
                logoUrl: generatedLogo || '',
            }

            const data = await agents.saveBrainstorm(brandData)
            onComplete(data.brand)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
            setGenerating(false)
        }
    }

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <button onClick={step > 0 ? () => setStep(step - 1) : onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h2 className="text-3xl font-extrabold mb-2">Build Your <span className="text-primary">Brand</span></h2>
            <p className="text-slate-400 mb-6">Let's create your brand identity step by step.</p>

            {/* Mini Progress */}
            <div className="flex gap-2 mb-8">
                {['Brand Info', 'Story & Audience', 'Style & Logo', 'Preview'].map((s, i) => (
                    <div key={i} className="flex-1">
                        <div className={`h-1 rounded-full transition-all ${i <= step ? 'bg-primary' : 'bg-white/[0.08]'}`} />
                        <p className={`text-xs mt-1 ${i <= step ? 'text-primary' : 'text-slate-600'}`}>{s}</p>
                    </div>
                ))}
            </div>

            {/* Step 0: Brand Name & Industry */}
            {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">What's your brand name? *</label>
                            <input value={brandName} onChange={e => setBrandName(e.target.value)}
                                placeholder="e.g., Nike, Apple, Zara" className="input-glass w-full py-4 text-lg" autoFocus />
                            <p className="text-xs text-slate-600 mt-1">This is what customers will know you as</p>
                        </div>
                        <div>
                            <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">Website (Optional)</label>
                            <input value={website} onChange={e => setWebsite(e.target.value)}
                                placeholder="e.g., example.com" className="input-glass w-full py-4 text-lg" />
                            <p className="text-xs text-slate-600 mt-1">Used for SEO and performance analysis</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">Industry *</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {industries.map(i => (
                                <button key={i} onClick={() => setIndustry(i)}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${industry === i ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                    {i}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Country */}
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">public</span>
                            Target Country *
                        </label>
                        <p className="text-xs text-slate-600 mb-2">This determines the cultural calendar, festivals, and language options for your brand</p>
                        <div className="flex flex-wrap gap-2">
                            {COUNTRIES.map(c => (
                                <button key={c.id} onClick={() => setCountry(c.id)} type="button"
                                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                        ${country === c.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.06] border border-white/[0.06]'}`}>
                                    <span className="text-sm">{c.flag}</span> {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setStep(1)} disabled={!brandName.trim() || !industry}
                        className="btn-primary w-full py-4 rounded-xl text-lg disabled:opacity-30">
                        Continue <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                    </button>
                </div>
            )}

            {/* Step 1: Story & Audience */}
            {step === 1 && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">What does {brandName} do?</label>
                        <div className="relative">
                            <textarea value={description} onChange={e => setDescription(e.target.value)}
                                placeholder={`Tell us about ${brandName} — what products/services do you offer? What makes you unique? Type or speak in any language 🎤`}
                                className="input-glass w-full py-3 pr-14 resize-none" rows={4} />
                            <div className="absolute right-3 top-3">
                                <VoiceInput
                                    onResult={(text) => setDescription(prev => prev ? prev + ' ' + text : text)}
                                    size="small"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">Who is your target audience?</label>
                        <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                            placeholder="e.g., Young professionals aged 25-35, tech-savvy millennials"
                            className="input-glass w-full py-3" />
                    </div>
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">Brand Keywords</label>
                        <div className="flex gap-2 mb-2">
                            <input value={keywordInput} onChange={e => setKeywordInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
                                placeholder="Type a keyword and press Enter" className="input-glass flex-1 py-2.5" />
                            <button onClick={addKeyword} className="btn-primary px-4 rounded-xl text-sm">Add</button>
                        </div>
                        {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                                {keywords.map((k, i) => (
                                    <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs flex items-center gap-1">
                                        {k}
                                        <button onClick={() => setKeywords(keywords.filter((_, j) => j !== i))} className="material-symbols-outlined text-xs hover:text-white cursor-pointer">close</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {suggestedKeywords[industry] && (
                            <div>
                                <p className="text-xs text-slate-600 mb-1">Suggested for {industry}:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestedKeywords[industry].filter(k => !keywords.includes(k)).map(k => (
                                        <button key={k} onClick={() => setKeywords([...keywords, k])}
                                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-400 text-xs hover:bg-primary/10 hover:text-primary transition-all cursor-pointer border border-white/[0.06]">
                                            + {k}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <button onClick={() => setStep(2)} className="btn-primary w-full py-4 rounded-xl text-lg">
                        Continue <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
                    </button>
                </div>
            )}

            {/* Step 2: Style & Logo */}
            {step === 2 && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3 block">Brand Personality</label>
                        <div className="grid grid-cols-2 gap-2">
                            {personalityOptions.map(p => (
                                <button key={p.id} onClick={() => setPersonality(p.id)}
                                    className={`flex items-center gap-3 p-3.5 rounded-xl transition-all cursor-pointer ${personality === p.id ? 'bg-primary/20 border border-primary/30 text-white' : 'bg-white/[0.03] border border-white/[0.06] text-slate-400 hover:bg-white/[0.05]'}`}>
                                    <span className="material-symbols-outlined text-lg">{p.icon}</span>
                                    <span className="text-sm font-medium">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-5">
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-3 block">Do you have a logo?</label>
                        <div className="flex gap-3 mb-4">
                            <button onClick={() => setHasLogo(true)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${hasLogo === true ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'}`}>
                                ✅ Yes, I have one
                            </button>
                            <button onClick={() => setHasLogo(false)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${hasLogo === false ? 'bg-primary text-white' : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'}`}>
                                🎨 Generate one for me
                            </button>
                        </div>

                        {hasLogo === false && (
                            <div className="space-y-3 animate-fade-in">
                                <div>
                                    <label className="text-sm text-slate-500 mb-1 block">Describe your ideal logo</label>
                                    <input value={logoKeywords} onChange={e => setLogoKeywords(e.target.value)}
                                        placeholder={`e.g., minimalist ${brandName} wordmark, geometric icon, abstract symbol`}
                                        className="input-glass w-full py-2.5 text-sm" />
                                </div>
                                <button onClick={handleGenerateLogo} disabled={generatingLogo || !logoKeywords.trim()}
                                    className="btn-primary w-full py-3 rounded-xl text-sm disabled:opacity-30">
                                    {generatingLogo ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                            Generating logo with AI...
                                        </span>
                                    ) : '🎨 Generate Logo'}
                                </button>
                                {generatedLogo && (
                                    <div className="mt-3 text-center animate-fade-in">
                                        <img src={generatedLogo} alt="Generated logo" className="w-32 h-32 object-contain mx-auto rounded-xl border border-white/[0.1] bg-white p-2" />
                                        <p className="text-sm text-slate-500 mt-2">AI-generated logo preview</p>
                                        <button onClick={handleGenerateLogo} disabled={generatingLogo}
                                            className="text-sm text-primary hover:text-primary-light mt-1 cursor-pointer">
                                            🔄 Regenerate
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {hasLogo === true && (
                            <p className="text.xs text-slate-500 animate-fade-in">
                                Great! You can upload your logo later from your Brand DNA page.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className={`p-4 rounded-xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'} text-sm flex items-center gap-2`}>
                            <span className="material-symbols-outlined text-lg">
                                {error.isProviderError ? 'warning' : 'error'}
                            </span>
                            <div className="flex-1">
                                {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                                {error.message}
                            </div>
                        </div>
                    )}

                    <button onClick={handleBrainstorm} disabled={!personality || generating}
                        className="btn-primary w-full py-4 rounded-xl text-lg disabled:opacity-30">
                        {generating ? (
                            <span className="flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                AI is building your brand...
                            </span>
                        ) : (
                            <span className="flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined">auto_awesome</span>
                                Generate Brand Identity
                            </span>
                        )}
                    </button>
                </div>
            )}

            {/* Step 3: Preview */}
            {step === 3 && suggestion && (
                <div className="space-y-6 animate-fade-in">
                    <div className="glass-panel rounded-2xl p-6">
                        <div className="flex items-center gap-4 mb-5">
                            {generatedLogo && (
                                <img src={generatedLogo} alt="Logo" className="w-16 h-16 rounded-xl border border-white/[0.1] bg-white p-1 object-contain" />
                            )}
                            <div>
                                <h3 className="text-2xl font-extrabold text-white">{brandName}</h3>
                                {suggestion.tagline && <p className="text-primary italic">"{suggestion.tagline}"</p>}
                            </div>
                        </div>
                        {suggestion.personality && (
                            <div className="mb-4">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-1">Personality</p>
                                <p className="text-white">{suggestion.personality}</p>
                            </div>
                        )}
                        {suggestion.voiceDescription && (
                            <div className="mb-4">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-1">Brand Voice</p>
                                <p className="text-slate-300">{suggestion.voiceDescription}</p>
                            </div>
                        )}
                        {suggestion.colorSuggestions?.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Brand Colors</p>
                                <div className="flex gap-3">
                                    {suggestion.colorSuggestions.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-12 h-12 rounded-xl border border-white/[0.1]" style={{ background: c.hex }} />
                                            <p className="text-sm text-slate-500 mt-1">{c.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {suggestion.keyPhrases?.length > 0 && (
                            <div>
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Key Phrases</p>
                                <div className="flex flex-wrap gap-2">
                                    {suggestion.keyPhrases.map((p, i) => (
                                        <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button onClick={() => { setSuggestion(null); setStep(2) }} disabled={generating} className="btn-ghost flex-1 py-3 rounded-xl border border-white/[0.1] cursor-pointer">
                            <span className="material-symbols-outlined text-sm">refresh</span> Regenerate
                        </button>
                        <button onClick={handleAccept} disabled={generating} className="btn-primary flex-1 py-3 rounded-xl">
                            {generating ? 'Saving...' : '✓ Accept & Create Brand'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============= Step 3: Review Brand DNA =============
function ReviewBrand({ brand, onFinish }) {
    const dna = brand?.dna || {}
    const voice = dna.voice || {}
    const brandImages = dna.brandImages || dna.bannerImages || []
    const socialLinks = dna.socialLinks || {}
    const socialVoice = dna.socialVoice || {}
    const contentStyle = dna.contentStyle || {}
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    const handleSave = () => {
        setSaving(true)
        setTimeout(() => {
            setSaving(false)
            setSaved(true)
            setTimeout(() => onFinish(), 1200)
        }, 600)
    }

    // Count how many intelligence features were detected
    const socialPlatforms = Object.entries(socialLinks).filter(([, v]) => v).length
    const totalImages = brandImages.length
    const hasVision = dna.logo?.metadata?.source === 'ai-vision'
    const hasVoice = !!voice.personality

    // Social platform config
    const platformConfig = {
        instagram: { icon: '📸', label: 'Instagram', color: '#E1306C' },
        facebook: { icon: '📘', label: 'Facebook', color: '#1877F2' },
        twitter: { icon: '🐦', label: 'Twitter / X', color: '#1DA1F2' },
        linkedin: { icon: '💼', label: 'LinkedIn', color: '#0A66C2' },
        youtube: { icon: '▶️', label: 'YouTube', color: '#FF0000' },
        pinterest: { icon: '📌', label: 'Pinterest', color: '#E60023' },
    }

    if (saved) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
                <div className="size-24 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6 animate-[pulse_1s_ease-in-out]">
                    <span className="material-symbols-outlined text-emerald-400 text-5xl">check_circle</span>
                </div>
                <h2 className="text-3xl font-extrabold text-white mb-2">Brand DNA Saved!</h2>
                <p className="text-slate-400 text-sm">Taking you to your dashboard...</p>
            </div>
        )
    }

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            {/* ── Header ── */}
            <div className="text-center mb-6">
                <span className="material-symbols-outlined text-primary text-3xl mb-2 block">fingerprint</span>
                <h2 className="text-3xl font-extrabold tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                    Your Business DNA
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                    We've analyzed your brand across {socialPlatforms > 0 ? `${socialPlatforms} social platforms, ` : ''}
                    {totalImages} images{hasVision ? ', and AI Vision' : ''}. Here's what we found.
                </p>
            </div>

            {/* ── Intelligence Summary Chips ── */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
                {hasVision && (
                    <span className="px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">visibility</span> AI Vision Active
                    </span>
                )}
                {socialPlatforms > 0 && (
                    <span className="px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">share</span> {socialPlatforms} Social Profiles
                    </span>
                )}
                {hasVoice && (
                    <span className="px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">record_voice_over</span> Voice Analyzed
                    </span>
                )}
                <span className="px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">photo_library</span> {totalImages} Images
                </span>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION A — Website Snapshot (from AI Vision) */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {dna.websiteSnapshot && (
                <div className="mb-6 glass-panel rounded-2xl p-4 border border-primary/20">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-lg">screenshot_monitor</span>
                            <p className="text-sm text-slate-400 uppercase tracking-widest">Website Snapshot</p>
                        </div>
                        {dna.logo?.metadata?.confidence && (
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                    dna.logo.metadata.confidence === 'high' ? 'bg-emerald-400' :
                                    dna.logo.metadata.confidence === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                                }`} />
                                <p className="text-xs text-slate-500">
                                    {dna.logo.metadata.confidence} confidence
                                    {dna.logo.metadata.source === 'ai-vision' && ' · AI Vision'}
                                </p>
                            </div>
                        )}
                    </div>
                    <img src={dna.websiteSnapshot} alt="Website screenshot"
                        className="w-full rounded-xl border border-white/[0.08] shadow-lg" />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION B — Brand Identity */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div className="glass-panel rounded-3xl p-8 relative overflow-hidden mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* ═══ LEFT: Identity ═══ */}
                    <div className="space-y-5">
                        {/* Brand Name + URL + Tagline */}
                        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <h3 className="text-2xl font-extrabold text-white mb-1">{brand.name}</h3>
                            {dna.tagline && (
                                <p className="text-sm text-primary italic mb-2">"{dna.tagline}"</p>
                            )}
                            {brand.website && (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <span className="material-symbols-outlined text-sm">link</span>
                                    <a href={brand.website} target="_blank" rel="noopener" className="hover:text-primary transition-colors">{brand.website}</a>
                                </div>
                            )}
                            {dna.industry && (
                                <span className="inline-block mt-2 px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                                    {dna.industry}
                                </span>
                            )}
                        </div>

                        {/* Logo + Fonts side by side */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center justify-center min-h-[100px]">
                                {dna.logo?.url ? (
                                    <>
                                        <img src={dna.logo.url} alt="Brand Logo" className="max-w-full max-h-16 object-contain"
                                            onError={e => e.target.style.display = 'none'} />
                                        {dna.logo.metadata?.source === 'ai-vision' && (
                                            <span className="text-[10px] text-emerald-400/60 mt-2 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[10px]">visibility</span> AI detected
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-4xl font-black" style={{ color: dna.colors?.[0]?.hex || '#2B4BEE' }}>
                                        {brand.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Fonts</p>
                                <p className="text-2xl text-white font-bold" style={{ fontFamily: dna.fonts?.heading?.family || 'Inter' }}>Aa</p>
                                <p className="text-sm text-slate-400 mt-1">{dna.fonts?.heading?.family || 'Inter'}</p>
                                {dna.fonts?.body?.family && dna.fonts.body.family !== dna.fonts?.heading?.family && (
                                    <p className="text-sm text-slate-500 mt-0.5">{dna.fonts.body.family}</p>
                                )}
                            </div>
                        </div>

                        {/* Colors */}
                        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <p className="text-sm text-slate-500 uppercase tracking-widest mb-3">Brand Colors</p>
                            {dna.colors?.length > 0 ? (
                                <div className="flex gap-4 flex-wrap">
                                    {dna.colors.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-14 h-14 rounded-full border-2 border-white/[0.1] shadow-lg"
                                                style={{ background: c.hex }} />
                                            <p className="text-[10px] text-slate-500 font-mono mt-1.5">{c.hex?.toLowerCase()}</p>
                                            {c.name && <p className="text-[10px] text-slate-600">{c.name}</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-600 text-sm">No colors detected</p>
                            )}
                        </div>
                    </div>

                    {/* ═══ RIGHT: Images ═══ */}
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest mb-3">Images</p>
                        {brandImages.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                <div className="rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/30 flex flex-col items-center justify-center py-6 cursor-pointer transition-colors bg-white/[0.02] aspect-square">
                                    <span className="material-symbols-outlined text-xl text-slate-600 mb-1">cloud_upload</span>
                                    <span className="text-sm text-slate-500">Upload</span>
                                </div>
                                {brandImages.map((img, i) => (
                                    <div key={i} className="rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.06] group aspect-square">
                                        <img src={img.url} alt={img.alt || `Image ${i + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={e => e.target.parentElement.style.display = 'none'} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full rounded-xl border-2 border-dashed border-white/[0.08] py-12">
                                <span className="material-symbols-outlined text-3xl text-slate-600 mb-2">photo_library</span>
                                <p className="text-slate-500 text-sm">No images found</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION C — Social Media Intelligence */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {socialPlatforms > 0 && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">share</span> Social Media Intelligence
                        <span className="text-xs font-normal text-slate-500 ml-auto">{socialPlatforms} platforms detected</span>
                    </h3>

                    {/* Social Link Pills */}
                    <div className="flex flex-wrap gap-2 mb-5">
                        {Object.entries(socialLinks).filter(([, url]) => url).map(([platform, url]) => {
                            const cfg = platformConfig[platform] || { icon: '🔗', label: platform, color: '#888' }
                            return (
                                <a key={platform} href={url} target="_blank" rel="noopener"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all hover:scale-105"
                                    style={{ borderColor: cfg.color + '30', background: cfg.color + '10' }}>
                                    <span>{cfg.icon}</span>
                                    <span className="text-xs font-medium text-white">{cfg.label}</span>
                                    <span className="material-symbols-outlined text-xs text-slate-500">open_in_new</span>
                                </a>
                            )
                        })}
                    </div>

                    {/* Social Voice Analysis */}
                    {(socialVoice.captionStyle || socialVoice.toneInsight) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {socialVoice.captionStyle && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">edit_note</span> Caption Style
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.captionStyle}</p>
                                </div>
                            )}
                            {socialVoice.toneInsight && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">psychology</span> Tone Insight
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.toneInsight}</p>
                                </div>
                            )}
                            {socialVoice.hashtagStrategy && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">tag</span> Hashtag Strategy
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.hashtagStrategy}</p>
                                </div>
                            )}
                            {socialVoice.emojiUsage && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">mood</span> Emoji Usage
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.emojiUsage}</p>
                                </div>
                            )}
                            {socialVoice.ctaStyle && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">ads_click</span> CTA Patterns
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.ctaStyle}</p>
                                </div>
                            )}
                            {socialVoice.postingPatterns && (
                                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">schedule</span> Posting Patterns
                                    </p>
                                    <p className="text-sm text-slate-300">{socialVoice.postingPatterns}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sample Captions */}
                    {socialVoice.sampleCaptions?.length > 0 && (
                        <div>
                            <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Sample Captions from Social</p>
                            <div className="space-y-2">
                                {socialVoice.sampleCaptions.slice(0, 3).map((cap, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-sm text-slate-400 italic">
                                        "{cap}"
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION D — Voice & Content Style */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {voice.personality && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">record_voice_over</span> Brand Voice & Tone
                    </h3>
                    <p className="text-lg text-primary font-bold mb-2">{voice.personality}</p>
                    {voice.description && <p className="text-sm text-slate-300 mb-4">{voice.description}</p>}

                    {/* Voice Sliders */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                        {[
                            { label: 'Tone', value: voice.tone },
                            { label: 'Clarity', value: voice.clarity },
                            { label: 'Warmth', value: voice.warmth },
                            { label: 'Formality', value: voice.formality },
                            { label: 'Wit', value: voice.wit },
                        ].filter(v => v.value !== undefined).map((v, i) => (
                            <div key={i}>
                                <p className="text-sm text-slate-500 mb-1">{v.label}</p>
                                <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                <p className="text-xs text-right text-slate-500 mt-0.5">{v.value}%</p>
                            </div>
                        ))}
                    </div>

                    {/* Keywords */}
                    {voice.keywords?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {voice.keywords.map((k, i) => (
                                <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs">{k}</span>
                            ))}
                        </div>
                    )}

                    {/* Photography + Writing Style */}
                    {(dna.photographyStyle || contentStyle.writingStyle || contentStyle.ctaStyle) && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.06]">
                            {dna.photographyStyle && (
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Photography</p>
                                    <p className="text-sm text-slate-300">{dna.photographyStyle}</p>
                                </div>
                            )}
                            {contentStyle.writingStyle && (
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Writing Style</p>
                                    <p className="text-sm text-slate-300">{contentStyle.writingStyle}</p>
                                </div>
                            )}
                            {contentStyle.ctaStyle && (
                                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">CTA Style</p>
                                    <p className="text-sm text-slate-300">{contentStyle.ctaStyle}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content Style Do's / Don'ts */}
            {(contentStyle.dos?.length > 0 || contentStyle.donts?.length > 0) && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">edit_note</span> Content Style Guide
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {contentStyle.dos?.length > 0 && (
                            <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">check_circle</span> Do's
                                </p>
                                <ul className="space-y-1.5">
                                    {contentStyle.dos.map((d, i) => (
                                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                            <span className="text-emerald-400 mt-0.5">✓</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {contentStyle.donts?.length > 0 && (
                            <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/10">
                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">cancel</span> Don'ts
                                </p>
                                <ul className="space-y-1.5">
                                    {contentStyle.donts.map((d, i) => (
                                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                            <span className="text-red-400 mt-0.5">✗</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Content preferences row */}
                    <div className="flex flex-wrap gap-3 mt-4">
                        {contentStyle.emojiUsage && contentStyle.emojiUsage !== 'minimal' && (
                            <span className="px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-400">
                                Emoji: {contentStyle.emojiUsage}
                            </span>
                        )}
                        {contentStyle.hashtagStyle && contentStyle.hashtagStyle !== 'minimal' && (
                            <span className="px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-400">
                                Hashtags: {contentStyle.hashtagStyle}
                            </span>
                        )}
                        {contentStyle.captionLengthPreference && (
                            <span className="px-3 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-slate-400">
                                Caption length: {contentStyle.captionLengthPreference}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* STICKY BOTTOM BAR — Save & Navigate */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div className="sticky bottom-0 left-0 right-0 z-20 mt-8">
                <div className="glass-panel rounded-2xl p-5 border border-primary/20 flex items-center justify-between gap-4"
                    style={{ backdropFilter: 'blur(20px)', background: 'rgba(10, 12, 22, 0.9)' }}>
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-emerald-400">verified</span>
                        <div>
                            <p className="text-sm font-bold text-white">Brand DNA extracted successfully</p>
                            <p className="text-xs text-slate-500">
                                {hasVision ? 'AI Vision' : 'Scanner'} detected {dna.colors?.length || 0} colors,
                                {totalImages} images{socialPlatforms > 0 ? `, ${socialPlatforms} social profiles` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving}
                            className="py-3 px-8 rounded-2xl text-sm font-bold cursor-pointer transition-all bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/30">
                            {saving ? (
                                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                            ) : (
                                <span className="material-symbols-outlined text-sm">rocket_launch</span>
                            )}
                            {saving ? 'Saving...' : 'Save & Go to Dashboard'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ============= Main Onboarding Component =============
export default function BrandOnboarding() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { isAuthenticated, user, loading: authLoading, refreshUser } = useAuth()
    const { addBrand } = useBrand()
    const [step, setStep] = useState(0) // 0=choose, 1=path, 2=review
    const [path, setPath] = useState(null)
    const [brand, setBrand] = useState(null)
    const [brandCount, setBrandCount] = useState(0)
    const [loadingCount, setLoadingCount] = useState(true)
    const scanUrlParam = searchParams.get('scanUrl') || ''

    // Safety Guard: If user already has brands, redirect to dashboard
    // This ensures invited members or existing owners don't stay on onboarding.
    useEffect(() => {
        if (!authLoading && user) {
            const hasBrands = (user.brandCount ?? 0) > 0;
            if (hasBrands) {
                navigate('/dashboard', { replace: true });
            } else {
                setLoadingCount(false);
            }
        } else if (!authLoading && !isAuthenticated) {
            setLoadingCount(false);
        }
    }, [user, authLoading, isAuthenticated, navigate]);

    // Brand limits are removed for all users
    const maxBrands = Infinity
    const atLimit = false

    // If scanUrl param is present, auto-navigate to website scan step
    useEffect(() => {
        if (scanUrlParam && step === 0) {
            setPath('website')
            setStep(1)
        }
    }, [scanUrlParam])

    const handlePathSelect = (pathId) => {
        setPath(pathId)
        setStep(1)
    }

    const handleBrandCreated = (brandData) => {
        setBrand(brandData)
        // If brand is a real DB record, add it immediately
        if (brandData._id && brandData._id !== 'preview') {
            addBrand(brandData);
            // Sync user profile to update brandCount immediately
            if (typeof refreshUser === 'function') {
                refreshUser();
            }
        } else {
            // Preview brand — save to localStorage for later persistence
            localStorage.setItem('mantram_pending_brand', JSON.stringify(brandData))
        }
        setStep(2)
    }

    const handleFinish = () => {
        if (!isAuthenticated) {
            // User needs to login/register first, then the pending brand will be saved
            navigate('/auth?redirect=dashboard&pending=brand')
        } else {
            navigate('/nexus')
        }
    }

    const totalSteps = 3

    if (authLoading || loadingCount) return null;

    if (atLimit) {
        return (
            <div className="min-h-screen relative" style={{ background: '#0a0c16' }}>
                <SEOHead title="Limit Reached — Mantram AI" noIndex={true} />
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/15 blur-[120px] rounded-full" />
                </div>
                <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[80vh] text-center animate-fade-in">
                    <div className="size-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-amber-500">diamond</span>
                    </div>
                    <h2 className="text-3xl font-extrabold text-white mb-3">Plan Limit Reached</h2>
                    <p className="text-slate-400 mb-8 max-w-md">
                        Your current <strong>{user?.planDetails?.name || 'Starter'}</strong> plan allows up to {maxBrands} brand{maxBrands !== 1 ? 's' : ''}. 
                        Upgrade your plan to add more brands to your portfolio.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button onClick={() => navigate('/credits')}
                            className="bg-primary text-white py-3 px-8 rounded-xl text-sm font-bold cursor-pointer hover:bg-primary-light transition-all shadow-lg shadow-primary/20">
                            View Upgrade Plans
                        </button>
                        <button onClick={() => navigate('/brands')}
                            className="bg-white/[0.04] border border-white/[0.08] px-8 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all cursor-pointer">
                            Manage Existing Brands
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen relative" style={{ background: '#0a0c16' }}>
            <SEOHead
                title="Brand Setup — Mantram AI"
                description="Set up your brand DNA on Mantram AI. Extract brand identity from your website in 60 seconds — logo, colors, typography, voice & visual style."
                canonical="/onboarding"
                noIndex={true}
            />
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/15 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] bg-primary/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="size-8 flex items-center justify-center bg-primary/10 rounded-lg">
                            <span className="material-symbols-outlined text-primary text-2xl">auto_awesome</span>
                        </div>
                        <h1 className="text-xl font-extrabold text-white tracking-tight">Mantram AI</h1>
                    </div>
                    <button onClick={() => navigate('/')} className="text-slate-500 text-sm hover:text-white transition-colors cursor-pointer">
                        ← Back to Home
                    </button>
                </div>

                <ProgressIndicator step={step} total={totalSteps} />

                {step === 0 && <ChoosePath onSelect={handlePathSelect} />}
                {step === 1 && path === 'website' && <WebsiteScan onComplete={handleBrandCreated} onBack={() => setStep(0)} initialUrl={scanUrlParam} />}
                {step === 1 && path === 'upload' && <FileUpload onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 1 && path === 'brainstorm' && <Brainstorm onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 2 && <ReviewBrand brand={brand} onFinish={handleFinish} />}
            </div>
        </div>
    )
}

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
    const [error, setError] = useState('')

    const steps = [
        { label: 'Analyzing your website', icon: 'language', duration: 1200 },
        { label: 'Extracting brand logo', icon: 'image', duration: 1000 },
        { label: 'Determining your visual aesthetic', icon: 'palette', duration: 1200 },
        { label: 'Detecting typography', icon: 'text_fields', duration: 800 },
        { label: 'Collecting homepage images', icon: 'photo_library', duration: 1500 },
        { label: 'Analyzing brand voice & tone', icon: 'record_voice_over', duration: 2000 },
        { label: 'Building your Brand DNA', icon: 'fingerprint', duration: 1500 },
    ]

    const handleScan = async () => {
        if (!url.trim()) return
        setScanning(true)
        setError('')
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
            setError(err.message || 'Failed to scan website. Please check the URL and try again.')
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
                        <div className="mt-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2 max-w-lg mx-auto">
                            <span className="material-symbols-outlined text-lg">error</span> {error}
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
    const [country, setCountry] = useState('India')
    const [uploading, setUploading] = useState(false)

    const handleDrop = (e) => {
        e.preventDefault()
        const dropped = Array.from(e.dataTransfer?.files || e.target.files || [])
        setFiles(prev => [...prev, ...dropped])
    }

    const handleCreate = async () => {
        if (!brandName.trim()) return
        setUploading(true)
        try {
            const data = await brandsAPI.create({
                name: brandName,
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
            alert(err.message)
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
                <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Brand Name *" className="input-glass w-full py-3 text-lg" autoFocus />
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
    const [error, setError] = useState('')

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
            setError(err.message || 'Logo generation failed')
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
            setError(err.message || 'AI brainstorming failed.')
        } finally {
            setGenerating(false)
        }
    }

    const handleAccept = async () => {
        if (!suggestion) return
        setGenerating(true)
        try {
            const brandData = {
                ...suggestion,
                name: brandName,
                industry,
                country,
                logoUrl: generatedLogo || '',
            }
            const data = await agents.saveBrainstorm(brandData)
            onComplete(data.brand)
        } catch (err) {
            alert(err.message)
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
                    <div>
                        <label className="text-sm text-slate-500 uppercase tracking-widest font-bold mb-2 block">What's your brand name? *</label>
                        <input value={brandName} onChange={e => setBrandName(e.target.value)}
                            placeholder="e.g., Nike, Apple, Zara" className="input-glass w-full py-4 text-lg" autoFocus />
                        <p className="text-xs text-slate-600 mt-1">This is what customers will know you as</p>
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
                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                            <span className="material-symbols-outlined text-sm align-middle mr-1">error</span> {error}
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

    return (
        <div className="max-w-5xl mx-auto animate-fade-in">
            {/* ── Pomelli-style header ── */}
            <div className="text-center mb-8">
                <span className="material-symbols-outlined text-primary text-3xl mb-2 block">fingerprint</span>
                <h2 className="text-3xl font-extrabold tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                    Your Business DNA
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                    Here is a snapshot of your business that we'll use to create social media campaigns.<br />
                    Feel free to edit at anytime.
                </p>
            </div>

            {/* ── 2-column layout: Brand Info (left) + Images (right) ── */}
            <div className="glass-panel rounded-3xl p-8 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* ═══ LEFT COLUMN: Brand Identity ═══ */}
                    <div className="space-y-6">
                        {/* Brand Name + URL */}
                        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <h3 className="text-2xl font-extrabold text-white mb-1">{brand.name}</h3>
                            {brand.website && (
                                <div className="flex items-center gap-2 text-sm text-slate-400">
                                    <span className="material-symbols-outlined text-sm">link</span>
                                    {brand.website}
                                </div>
                            )}
                        </div>

                        {/* Logo + Fonts side by side */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Logo */}
                            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center min-h-[100px]">
                                {dna.logo?.url ? (
                                    <img src={dna.logo.url} alt="Brand Logo" className="max-w-full max-h-20 object-contain"
                                        onError={e => e.target.style.display = 'none'} />
                                ) : (
                                    <div className="text-4xl font-black text-white"
                                        style={{ color: dna.colors?.[0]?.hex || '#2B4BEE' }}>
                                        {brand.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {/* Fonts */}
                            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                                <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Fonts</p>
                                <p className="text-2xl text-white font-bold"
                                    style={{ fontFamily: dna.fonts?.heading?.family || 'Inter' }}>
                                    Aa
                                </p>
                                <p className="text-sm text-slate-400 mt-1">{dna.fonts?.heading?.family || 'Inter'}</p>
                                {dna.fonts?.body?.family && dna.fonts.body.family !== dna.fonts?.heading?.family && (
                                    <p className="text-sm text-slate-500 mt-0.5">{dna.fonts.body.family}</p>
                                )}
                            </div>
                        </div>

                        {/* Colors */}
                        <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                            <p className="text-sm text-slate-500 uppercase tracking-widest mb-3">Colors</p>
                            {dna.colors?.length > 0 ? (
                                <div className="flex gap-5 flex-wrap">
                                    {dna.colors.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-16 h-16 rounded-full border-2 border-white/[0.1] shadow-lg"
                                                style={{ background: c.hex }} />
                                            <p className="text-sm text-slate-500 font-mono mt-2">{c.hex?.toLowerCase()}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-600 text-sm">No colors detected</p>
                            )}
                        </div>
                    </div>

                    {/* ═══ RIGHT COLUMN: Images ═══ */}
                    <div>
                        <p className="text-sm text-slate-500 uppercase tracking-widest mb-3">Images</p>
                        {brandImages.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                                {/* Upload placeholder */}
                                <div className="rounded-xl border-2 border-dashed border-white/[0.08] hover:border-primary/30 flex flex-col items-center justify-center py-6 cursor-pointer transition-colors bg-white/[0.02] aspect-square">
                                    <span className="material-symbols-outlined text-xl text-slate-600 mb-1">cloud_upload</span>
                                    <span className="text-sm text-slate-500">Upload Images</span>
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
                                <p className="text-slate-600 text-xs">Upload images to use in campaigns</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/[0.06]">
                    <p className="text-sm text-slate-500">
                        Next we'll use your Business DNA to generate social media campaigns
                    </p>
                    <button onClick={onFinish}
                        className="py-3 px-8 rounded-2xl text-sm font-bold cursor-pointer transition-all"
                        style={{ background: dna.colors?.[1]?.hex || dna.colors?.[0]?.hex || '#BBF00A', color: '#000' }}>
                        Looks good
                    </button>
                </div>
            </div>

            {/* ── Voice & Content Style (collapsible detail below) ── */}
            {voice.personality && (
                <div className="glass-panel rounded-2xl p-6 mt-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">record_voice_over</span> Voice & Tone
                    </h3>
                    <p className="text-lg text-primary font-bold mb-2">{voice.personality}</p>
                    {voice.description && <p className="text-sm text-slate-300 mb-4">{voice.description}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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
                    {voice.keywords?.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {voice.keywords.map((k, i) => (
                                <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs">{k}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Content Style — collapsed */}
            {dna.contentStyle && (dna.contentStyle.dos?.length > 0 || dna.contentStyle.donts?.length > 0) && (
                <div className="glass-panel rounded-2xl p-6 mt-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">edit_note</span> Content Style Guide
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {dna.contentStyle.dos?.length > 0 && (
                            <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">check_circle</span> Do's
                                </p>
                                <ul className="space-y-1.5">
                                    {dna.contentStyle.dos.map((d, i) => (
                                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                            <span className="text-emerald-400 mt-0.5">✓</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {dna.contentStyle.donts?.length > 0 && (
                            <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/10">
                                <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">cancel</span> Don'ts
                                </p>
                                <ul className="space-y-1.5">
                                    {dna.contentStyle.donts.map((d, i) => (
                                        <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                            <span className="text-red-400 mt-0.5">✗</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

// ============= Main Onboarding Component =============
export default function BrandOnboarding() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { isAuthenticated } = useAuth()
    const { addBrand } = useBrand()
    const [step, setStep] = useState(0) // 0=choose, 1=path, 2=review
    const [path, setPath] = useState(null)
    const [brand, setBrand] = useState(null)
    const scanUrlParam = searchParams.get('scanUrl') || ''

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
            addBrand(brandData)
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

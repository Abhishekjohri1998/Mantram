import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { agents, brands as brandsAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'
import { useAuth } from '../context/AuthContext'
import VoiceInput from '../components/VoiceInput'
import { COUNTRIES } from '../data/calendarData'

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
                                {p.badge && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{p.badge}</span>}
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
function WebsiteScan({ onComplete, onBack }) {
    const [url, setUrl] = useState('')
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentStep, setCurrentStep] = useState('')
    const [error, setError] = useState('')

    const steps = [
        { label: 'Connecting to website...', duration: 800 },
        { label: 'Extracting logo and images...', duration: 1200 },
        { label: 'Analyzing color palette...', duration: 1000 },
        { label: 'Detecting typography...', duration: 800 },
        { label: 'Reading content samples...', duration: 1000 },
        { label: 'AI analyzing brand voice & tone...', duration: 2000 },
    ]

    const handleScan = async () => {
        if (!url.trim()) return
        setScanning(true)
        setError('')

        // Animate progress steps while the real API call runs
        let stepIndex = 0
        const interval = setInterval(() => {
            if (stepIndex < steps.length) {
                setCurrentStep(steps[stepIndex].label)
                setProgress(Math.round(((stepIndex + 1) / steps.length) * 90))
                stepIndex++
            }
        }, 1200)

        try {
            const normalizedUrl = url.startsWith('http') ? url : `https://${url}`
            const data = await agents.scanWebsite(normalizedUrl)
            clearInterval(interval)
            setProgress(100)
            setCurrentStep('Brand DNA extracted successfully!')
            setTimeout(() => onComplete(data.brand), 800)
        } catch (err) {
            clearInterval(interval)
            setScanning(false)
            setError(err.message || 'Failed to scan website. Please check the URL and try again.')
        }
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <button onClick={onBack} className="text-slate-500 text-sm flex items-center gap-1 mb-6 hover:text-white transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h2 className="text-3xl font-extrabold mb-2">Scan Your <span className="text-primary">Website</span></h2>
            <p className="text-slate-400 mb-8">Enter your website URL and our AI will analyze everything about your brand.</p>

            {!scanning ? (
                <div>
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">language</span>
                            <input
                                value={url}
                                onChange={e => setUrl(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleScan()}
                                placeholder="Enter your website URL (e.g., example.com)"
                                className="input-glass w-full pl-12 py-4 text-lg"
                                autoFocus
                            />
                        </div>
                        <button onClick={handleScan} disabled={!url.trim()} className="btn-primary py-4 px-8 rounded-xl text-lg disabled:opacity-30">
                            <span className="material-symbols-outlined">radar</span> Scan
                        </button>
                    </div>
                    {error && (
                        <div className="mt-4 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">error</span> {error}
                        </div>
                    )}
                    <div className="mt-6 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                        <p className="text-xs text-slate-500 mb-2">🔍 What we analyze:</p>
                        <div className="flex flex-wrap gap-2">
                            {['Logo', 'Color Palette', 'Typography', 'Voice & Tone', 'Content Style', 'Brand Keywords'].map(item => (
                                <span key={item} className="px-2 py-1 rounded-lg bg-white/[0.04] text-xs text-slate-400">{item}</span>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="glass-panel rounded-2xl p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                            <span className="material-symbols-outlined text-primary">radar</span>
                        </div>
                        <div>
                            <p className="text-white font-bold">Scanning: {url}</p>
                            <p className="text-sm text-primary">{currentStep}</p>
                        </div>
                    </div>
                    <div className="progress-bar mb-4">
                        <div className="progress-bar-fill transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 text-right">{progress}%</p>
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
                    <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">Target Country *</label>
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
                                <span className="text-xs text-slate-500">{(f.size / 1024).toFixed(0)} KB</span>
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
                        <p className={`text-[10px] mt-1 ${i <= step ? 'text-primary' : 'text-slate-600'}`}>{s}</p>
                    </div>
                ))}
            </div>

            {/* Step 0: Brand Name & Industry */}
            {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">What's your brand name? *</label>
                        <input value={brandName} onChange={e => setBrandName(e.target.value)}
                            placeholder="e.g., Nike, Apple, Zara" className="input-glass w-full py-4 text-lg" autoFocus />
                        <p className="text-[10px] text-slate-600 mt-1">This is what customers will know you as</p>
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">Industry *</label>
                        <div className="grid grid-cols-3 gap-2">
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
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">public</span>
                            Target Country *
                        </label>
                        <p className="text-[10px] text-slate-600 mb-2">This determines the cultural calendar, festivals, and language options for your brand</p>
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
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">What does {brandName} do?</label>
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
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">Who is your target audience?</label>
                        <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                            placeholder="e.g., Young professionals aged 25-35, tech-savvy millennials"
                            className="input-glass w-full py-3" />
                    </div>
                    <div>
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 block">Brand Keywords</label>
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
                                <p className="text-[10px] text-slate-600 mb-1">Suggested for {industry}:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestedKeywords[industry].filter(k => !keywords.includes(k)).map(k => (
                                        <button key={k} onClick={() => setKeywords([...keywords, k])}
                                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] text-slate-400 text-[10px] hover:bg-primary/10 hover:text-primary transition-all cursor-pointer border border-white/[0.06]">
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
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-3 block">Brand Personality</label>
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
                        <label className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-3 block">Do you have a logo?</label>
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
                                    <label className="text-xs text-slate-500 mb-1 block">Describe your ideal logo</label>
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
                                        <p className="text-[10px] text-slate-500 mt-2">AI-generated logo preview</p>
                                        <button onClick={handleGenerateLogo} disabled={generatingLogo}
                                            className="text-xs text-primary hover:text-primary-light mt-1 cursor-pointer">
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
                                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Personality</p>
                                <p className="text-white">{suggestion.personality}</p>
                            </div>
                        )}
                        {suggestion.voiceDescription && (
                            <div className="mb-4">
                                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Brand Voice</p>
                                <p className="text-slate-300">{suggestion.voiceDescription}</p>
                            </div>
                        )}
                        {suggestion.colorSuggestions?.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Brand Colors</p>
                                <div className="flex gap-3">
                                    {suggestion.colorSuggestions.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-12 h-12 rounded-xl border border-white/[0.1]" style={{ background: c.hex }} />
                                            <p className="text-[10px] text-slate-500 mt-1">{c.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {suggestion.keyPhrases?.length > 0 && (
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-widest mb-2">Key Phrases</p>
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

    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-400/10 text-emerald-400 text-sm font-bold mb-4">
                    <span className="material-symbols-outlined">check_circle</span> Brand DNA Extracted
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight">Your Brand <span className="text-primary">Knowledge Bank</span></h2>
                <p className="text-slate-400 mt-2">This is what our AI learned about your brand. All future content will be generated using this DNA.</p>
            </div>

            <div className="space-y-6">
                {/* Brand Identity + Logo */}
                <div className="glass-panel rounded-2xl p-6">
                    <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">storefront</span> Brand Identity
                    </h3>
                    <div className="flex items-start gap-6">
                        {/* Logo */}
                        {dna.logo?.url && (
                            <div className="shrink-0">
                                <div className="w-24 h-24 rounded-xl bg-white/[0.05] border border-white/[0.1] overflow-hidden flex items-center justify-center p-2">
                                    <img src={dna.logo.url} alt="Brand Logo" className="max-w-full max-h-full object-contain" onError={e => e.target.style.display = 'none'} />
                                </div>
                                <p className="text-[10px] text-slate-600 text-center mt-1">Logo</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <div><p className="text-xs text-slate-500">Name</p><p className="text-white font-medium">{brand.name}</p></div>
                            {brand.website && <div><p className="text-xs text-slate-500">Website</p><p className="text-white font-medium">{brand.website}</p></div>}
                            {dna.industry && <div><p className="text-xs text-slate-500">Industry</p><p className="text-white font-medium">{dna.industry}</p></div>}
                            {dna.targetAudience && <div><p className="text-xs text-slate-500">Target Audience</p><p className="text-white font-medium">{dna.targetAudience}</p></div>}
                            <div><p className="text-xs text-slate-500">Method</p><p className="text-white font-medium capitalize">{brand.onboardingMethod}</p></div>
                        </div>
                    </div>
                    {/* Additional logos */}
                    {dna.logo?.allLogos?.length > 1 && (
                        <div className="mt-4 pt-4 border-t border-white/[0.06]">
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">All logos detected</p>
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {dna.logo.allLogos.map((l, i) => (
                                    <div key={i} className="shrink-0 w-14 h-14 rounded-lg bg-white/[0.04] border border-white/[0.08] overflow-hidden flex items-center justify-center p-1">
                                        <img src={l.url} alt={`Logo ${i + 1}`} className="max-w-full max-h-full object-contain" onError={e => e.target.style.display = 'none'} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Colors */}
                {dna.colors?.length > 0 && (
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">palette</span> Color Palette
                        </h3>
                        <div className="flex gap-4">
                            {dna.colors.map((c, i) => (
                                <div key={i} className="text-center">
                                    <div className="w-16 h-16 rounded-xl border border-white/[0.1]" style={{ background: c.hex }} />
                                    <p className="text-xs text-slate-400 mt-2">{c.name}</p>
                                    <p className="text-[10px] text-slate-600 font-mono">{c.hex}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Voice & Tone */}
                {voice.personality && (
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">record_voice_over</span> Voice & Tone
                        </h3>
                        <p className="text-lg text-primary font-bold mb-2">{voice.personality}</p>
                        {voice.description && <p className="text-sm text-slate-300 mb-4">{voice.description}</p>}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                { label: 'Tone', value: voice.tone },
                                { label: 'Clarity', value: voice.clarity },
                                { label: 'Warmth', value: voice.warmth },
                                { label: 'Formality', value: voice.formality },
                                { label: 'Wit', value: voice.wit },
                            ].filter(v => v.value !== undefined).map((v, i) => (
                                <div key={i}>
                                    <p className="text-[10px] text-slate-500 mb-1">{v.label}</p>
                                    <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                    <p className="text-[10px] text-right text-slate-500 mt-0.5">{v.value}%</p>
                                </div>
                            ))}
                        </div>
                        {voice.sampleQuote && (
                            <p className="mt-4 p-3 rounded-xl bg-primary/5 border-l-2 border-primary text-sm text-slate-300 italic">
                                "{voice.sampleQuote}"
                            </p>
                        )}
                        {voice.keywords?.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {voice.keywords.map((k, i) => (
                                    <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs">{k}</span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Content Style Guide */}
                {dna.contentStyle && (
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">edit_note</span> Content Style Guide
                        </h3>

                        {dna.contentStyle.writingStyle && (
                            <p className="text-sm text-slate-300 mb-4 p-3 rounded-xl bg-primary/5 border-l-2 border-primary">
                                {dna.contentStyle.writingStyle}
                            </p>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* Dos */}
                            {dna.contentStyle.dos?.length > 0 && (
                                <div className="bg-emerald-500/5 rounded-xl p-4 border border-emerald-500/10">
                                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">check_circle</span> Do's
                                    </p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.dos.map((d, i) => (
                                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                                <span className="text-emerald-400 mt-0.5">✓</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {/* Donts */}
                            {dna.contentStyle.donts?.length > 0 && (
                                <div className="bg-red-500/5 rounded-xl p-4 border border-red-500/10">
                                    <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">cancel</span> Don'ts
                                    </p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.donts.map((d, i) => (
                                            <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                                                <span className="text-red-400 mt-0.5">✗</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Key Phrases */}
                        {dna.contentStyle.keyPhrases?.length > 0 && (
                            <div className="mb-4">
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Key Phrases & Power Words</p>
                                <div className="flex flex-wrap gap-2">
                                    {dna.contentStyle.keyPhrases.map((p, i) => (
                                        <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs border border-primary/20">"{p}"</span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Style Tags */}
                        <div className="flex flex-wrap gap-3 text-[10px]">
                            {dna.contentStyle.ctaStyle && (
                                <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                                    <span className="text-slate-500">CTA Style:</span>{' '}
                                    <span className="text-white font-medium">{dna.contentStyle.ctaStyle}</span>
                                </div>
                            )}
                            {dna.contentStyle.emojiUsage && (
                                <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                                    <span className="text-slate-500">Emoji:</span>{' '}
                                    <span className="text-white font-medium capitalize">{dna.contentStyle.emojiUsage}</span>
                                </div>
                            )}
                            {dna.contentStyle.hashtagStyle && (
                                <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                                    <span className="text-slate-500">Hashtags:</span>{' '}
                                    <span className="text-white font-medium capitalize">{dna.contentStyle.hashtagStyle}</span>
                                </div>
                            )}
                            {dna.contentStyle.sentenceLength && (
                                <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                                    <span className="text-slate-500">Sentence Length:</span>{' '}
                                    <span className="text-white font-medium capitalize">{dna.contentStyle.sentenceLength}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Banner / Hero Images */}
                {dna.bannerImages?.length > 0 && (
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">image</span> Brand Imagery
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {dna.bannerImages.map((img, i) => (
                                <div key={i} className="rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
                                    <img src={img.url} alt={`Brand image ${i + 1}`} className="w-full h-32 object-cover"
                                        onError={e => e.target.parentElement.style.display = 'none'} />
                                    <p className="text-[10px] text-slate-500 text-center py-1 capitalize">{img.source}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <button onClick={onFinish} className="btn-primary w-full py-4 rounded-xl text-lg">
                    <span className="material-symbols-outlined">rocket_launch</span>
                    Launch Brand Dashboard
                </button>
            </div>
        </div>
    )
}

// ============= Main Onboarding Component =============
export default function BrandOnboarding() {
    const navigate = useNavigate()
    const { isAuthenticated } = useAuth()
    const { addBrand } = useBrand()
    const [step, setStep] = useState(0) // 0=choose, 1=path, 2=review
    const [path, setPath] = useState(null)
    const [brand, setBrand] = useState(null)

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
                {step === 1 && path === 'website' && <WebsiteScan onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 1 && path === 'upload' && <FileUpload onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 1 && path === 'brainstorm' && <Brainstorm onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 2 && <ReviewBrand brand={brand} onFinish={handleFinish} />}
            </div>
        </div>
    )
}

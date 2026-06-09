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
                    <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${i < step ? 'bg-primary text-white shadow-none' :
                        i === step ? 'bg-primary/20 text-primary border border-primary' :
                            'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'
                        }`}>
                        {i < step ? <span className="material-symbols-outlined text-sm">check</span> : i + 1}
                    </div>
                    {i < total - 1 && (
                        <div className={`w-12 h-0.5 transition-all duration-500 ${i < step ? 'bg-primary' : 'bg-[var(--sys-surface)]'}`} />
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
        { id: 'local', icon: 'storefront', title: 'Search Local Business', desc: 'Find your business on Google Maps. We\'ll extract brand details from public listings and reviews.' },
        { id: 'upload', icon: 'upload_file', title: 'Upload Brand Assets', desc: 'Upload your logo, brand guidelines, or any brand-related documents and images.' },
        { id: 'brainstorm', icon: 'psychology', title: 'AI Brainstorming', desc: 'Don\'t have existing brand assets? Let AI help you build a brand identity from scratch.' },
    ]
    return (
        <div className="max-w-3xl mx-auto animate-fade-in">
            <h2 className="text-3xl font-extrabold text-center mb-2 tracking-tight">How should we learn <span className="text-primary">about your brand?</span></h2>
            <p className="text-[var(--sys-text-muted)] text-center mb-10">Choose how you'd like to build your brand knowledge bank.</p>
            <div className="grid gap-4">
                {paths.map(p => (
                    <button key={p.id} onClick={() => onSelect(p.id)}
                        className="glass-panel rounded-2xl p-6 flex items-center gap-5 hover:bg-[var(--sys-surface)] hover:border-primary/30 transition-all cursor-pointer text-left group">
                        <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform shrink-0">
                            <span className="material-symbols-outlined text-3xl">{p.icon}</span>
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-[var(--sys-text)]">{p.title}</h3>
                                {p.badge && <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">{p.badge}</span>}
                            </div>
                            <p className="text-sm text-[var(--sys-text-muted)] mt-1">{p.desc}</p>
                        </div>
                        <span className="material-symbols-outlined text-[var(--sys-text-muted)] group-hover:text-primary transition-colors">arrow_forward</span>
                    </button>
                ))}
            </div>
        </div>
    )
}

// ============= Step 2a: Website Scan (SSE Real-Time Progress) =============
function WebsiteScan({ onComplete, onBack, initialUrl = '' }) {
    const [url, setUrl] = useState(initialUrl)
    const [scanning, setScanning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [currentStep, setCurrentStep] = useState('')
    const [completedPhases, setCompletedPhases] = useState([])
    const [error, setError] = useState(null)

    // Phase display map — maps backend phase names to user-friendly labels + icons
    const PHASE_DISPLAY = {
        init: { icon: 'language', label: 'Connecting to website' },
        extract: { icon: 'code', label: 'Extracting page structure' },
        parallel: { icon: 'auto_awesome', label: 'AI Vision + Social + Sub-pages' },
        voice: { icon: 'record_voice_over', label: 'Analyzing brand voice & tone' },
        competitors: { icon: 'monitoring', label: 'Discovering competitors & market' },
        complete: { icon: 'check_circle', label: 'Brand DNA built!' },
    }

    const handleScan = async () => {
        if (!url.trim()) return
        setScanning(true)
        setError(null)
        setProgress(0)
        setCurrentStep('Connecting...')
        setCompletedPhases([])

        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`

        try {
            // Try SSE streaming first
            const streamUrl = agents.getScanStreamUrl(normalizedUrl)
            const eventSource = new EventSource(streamUrl)
            let lastPhase = ''

            eventSource.addEventListener('progress', (e) => {
                try {
                    const data = JSON.parse(e.data)
                    const display = PHASE_DISPLAY[data.phase] || { icon: 'autorenew', label: data.phase }
                    setCurrentStep(data.message)
                    setProgress(data.percent || 0)

                    // Track completed phases for the checklist
                    if (data.phase !== lastPhase && lastPhase) {
                        const prev = PHASE_DISPLAY[lastPhase]
                        if (prev) {
                            setCompletedPhases(p => {
                                const exists = p.some(x => x.phase === lastPhase)
                                return exists ? p : [...p, { phase: lastPhase, label: prev.label, icon: prev.icon }]
                            })
                        }
                    }
                    lastPhase = data.phase
                } catch { /* ignore malformed */ }
            })

            eventSource.addEventListener('complete', (e) => {
                eventSource.close()
                try {
                    const data = JSON.parse(e.data)
                    setProgress(100)
                    setCurrentStep('Brand DNA built successfully!')
                    // Add final phase
                    setCompletedPhases(p => [...p, { phase: 'complete', label: 'Brand DNA built!', icon: 'check_circle' }])
                    setTimeout(() => onComplete(data.brand), 800)
                } catch (err) {
                    setScanning(false)
                    setError({ message: 'Failed to parse scan results.' })
                }
            })

            eventSource.addEventListener('error', (e) => {
                eventSource.close()
                // If SSE event with error data
                if (e.data) {
                    try {
                        const data = JSON.parse(e.data)
                        setScanning(false)
                        setError({ message: data.error || 'Scan failed' })
                        return
                    } catch { /* fall through */ }
                }
                // SSE connection error — fall back to POST
                console.warn('SSE connection failed, falling back to POST...')
                fallbackToPost(normalizedUrl)
            })

            eventSource.onerror = (e) => {
                // Only handle if not already closed via our event listeners
                if (eventSource.readyState === EventSource.CLOSED) return
                eventSource.close()
                console.warn('SSE onerror, falling back to POST...')
                fallbackToPost(normalizedUrl)
            }
        } catch (err) {
            // SSE not supported or URL construction failed — fall back
            fallbackToPost(normalizedUrl)
        }
    }

    // Fallback: use the regular POST API if SSE fails
    const fallbackToPost = async (normalizedUrl) => {
        setCurrentStep('Scanning website...')
        setProgress(30)
        try {
            const data = await agents.scanWebsite(normalizedUrl)
            setProgress(100)
            setCurrentStep('Brand DNA extracted successfully!')
            setTimeout(() => onComplete(data.brand), 800)
        } catch (err) {
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
                    <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-8 hover:text-[var(--sys-text)] transition-colors cursor-pointer mx-auto">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>

                    <div className="glass-panel rounded-3xl p-10 max-w-lg mx-auto relative overflow-hidden">
                        {/* Subtle glow */}
                        <div className="absolute inset-0 bg-[var(--sys-surface)] border border-[var(--sys-border)] pointer-events-none" />
                        <div className="relative">
                            <h2 className="text-3xl font-extrabold mb-2 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Enter your website
                            </h2>
                            <p className="text-[var(--sys-text-muted)] text-sm mb-8">We'll analyze your business and generate your Business DNA</p>

                            <div className="relative mb-4">
                                <input
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleScan()}
                                    placeholder="www.example.com"
                                    className="w-full py-4 px-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-lg placeholder-slate-600 focus:outline-none focus:border-primary/40 focus:bg-[var(--sys-surface)] transition-all"
                                    autoFocus
                                />
                            </div>

                            <button onClick={handleScan} disabled={!url.trim()}
                                className="btn-primary w-full py-4 rounded-2xl text-lg disabled:opacity-30">
                                Continue
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className={`mt-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-orange-500' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-orange-500'} text-sm flex items-center gap-2 max-w-lg mx-auto`}>
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
                /* ── Scanning: Real-Time SSE Progress ── */
                <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
                    {/* Glow background */}
                    <div className="fixed inset-0 pointer-events-none" style={{
                        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(var(--primary-rgb, 255, 77, 0), 0.08) 0%, transparent 70%)',
                    }} />

                    <div className="glass-panel rounded-3xl p-10 max-w-lg w-full text-center relative overflow-hidden">
                        {/* Animated glow border */}
                        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
                            background: 'linear-gradient(to right, rgba(255, 77, 0, 0.1), transparent 40%, transparent 60%, rgba(255, 77, 0, 0.08))',
                        }} />

                        <div className="relative">
                            <h2 className="text-3xl font-extrabold mb-3 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Generating your Business<br />DNA
                            </h2>
                            <p className="text-[var(--sys-text-muted)] text-sm mb-6">
                                AI is researching and analyzing your business in real-time.
                            </p>

                            {/* Current Step Badge */}
                            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl mb-4 transition-all duration-500"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <span className="material-symbols-outlined text-primary text-sm animate-pulse">
                                    {progress >= 100 ? 'check_circle' : 'autorenew'}
                                </span>
                                <span className="text-sm text-[var(--sys-text-muted)] font-medium">{currentStep}</span>
                            </div>

                            {/* Completed Phases Checklist */}
                            {completedPhases.length > 0 && (
                                <div className="text-left space-y-2 mb-6 px-4">
                                    {completedPhases.map((p, i) => (
                                        <div key={p.phase} className="flex items-center gap-2 animate-fade-in" style={{ animationDelay: `${i * 100}ms` }}>
                                            <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{p.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Website URL chip */}
                            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl mx-auto mb-6"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm">link</span>
                                <span className="text-sm text-[var(--sys-text)] font-medium">{url.startsWith('http') ? url : `https://${url}`}</span>
                            </div>

                            {/* Progress Bar */}
                            <div className="w-full h-2 bg-[var(--sys-surface)] rounded-full overflow-hidden mb-3 border border-[var(--sys-border)]">
                                <div className="h-full bg-primary rounded-full transition-all duration-700 ease-out relative"
                                    style={{ width: `${Math.max(progress, 2)}%`, background: 'linear-gradient(90deg, var(--primary), #ff9040)' }}>
                                    {progress < 100 && (
                                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                    )}
                                </div>
                            </div>

                            {/* Progress indicator */}
                            <div className="flex items-center justify-center gap-2 text-sm">
                                <span className="text-primary text-sm font-medium">{progress}%</span>
                                {progress < 100 && (
                                    <span className="text-[var(--sys-text-muted)] text-xs">
                                        {progress < 30 ? '• Extracting website data' :
                                         progress < 50 ? '• Running AI analysis' :
                                         progress < 70 ? '• Analyzing brand voice' :
                                         progress < 90 ? '• Gathering intelligence' :
                                         '• Finalizing DNA'}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============= Step 2a-2: Local Business Search =============
function LocalBusinessScan({ onComplete, onBack }) {
    const [businessName, setBusinessName] = useState('')
    const [location, setLocation] = useState('')
    const [scanning, setScanning] = useState(false)
    const [currentStep, setCurrentStep] = useState('')
    const [progress, setProgress] = useState(0)
    const [error, setError] = useState(null)
    const [discoveryData, setDiscoveryData] = useState(null) // Live discovery chips
    const [completedSteps, setCompletedSteps] = useState([]) // Log of completed steps

    const handleSearch = async () => {
        if (!businessName.trim() || !location.trim()) return
        
        setScanning(true)
        setError(null)
        setProgress(0)
        setCurrentStep('Initializing scan...')
        setDiscoveryData(null)
        setCompletedSteps([])
        
        try {
            const streamUrl = agents.getLocalScanStreamUrl(businessName.trim(), location.trim())
            const response = await fetch(streamUrl)

            if (!response.ok) {
                const errData = await response.json().catch(() => ({ error: 'Connection failed' }))
                throw new Error(errData.error || `Server error: ${response.status}`)
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let finalBrand = null
            let currentEventType = null  // Persists across read chunks — critical for large payloads

            const processLine = (line) => {
                if (line.startsWith('event: ')) {
                    currentEventType = line.slice(7).trim()
                    return
                }
                if (!line.startsWith('data: ')) return
                const raw = line.slice(6).trim()
                if (!raw) return

                try {
                    const evt = JSON.parse(raw)

                    if (currentEventType === 'progress') {
                        setCurrentStep(evt.message)
                        if (evt.percent != null) setProgress(evt.percent)
                        // Track completed major steps for the log
                        if (evt.step && (evt.step.endsWith('-done') || evt.step === 'merge' || evt.step === 'saving')) {
                            setCompletedSteps(prev => {
                                const exists = prev.some(s => s.step === evt.step)
                                return exists ? prev : [...prev, { step: evt.step, message: evt.message, time: new Date() }]
                            })
                        }
                    } else if (currentEventType === 'discovery') {
                        setDiscoveryData(evt)
                    } else if (currentEventType === 'complete') {
                        finalBrand = evt.brand
                    } else if (currentEventType === 'error') {
                        throw new Error(evt.error)
                    }
                } catch (parseErr) {
                    if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
                }
            }

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''
                for (const line of lines) {
                    processLine(line)
                }
            }

            // Flush remaining buffer
            buffer += decoder.decode()
            if (buffer.trim()) {
                const lines = buffer.split('\n')
                for (const line of lines) {
                    processLine(line)
                }
            }

            if (finalBrand) {
                setCurrentStep('Brand DNA built successfully!')
                setProgress(100)
                setTimeout(() => onComplete(finalBrand), 800)
            } else {
                throw new Error('Scan completed but no brand data was received. Please try again.')
            }
        } catch (err) {
            setScanning(false)
            setProgress(0)
            setError({
                message: err.message || 'Failed to find or analyze local business. Please try again.',
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            {!scanning ? (
                <div className="text-center">
                    <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-8 hover:text-[var(--sys-text)] transition-colors cursor-pointer mx-auto">
                        <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                    </button>

                    <div className="glass-panel rounded-3xl p-10 max-w-lg mx-auto relative overflow-hidden">
                        <div className="absolute inset-0 bg-[var(--sys-surface)] border border-[var(--sys-border)] pointer-events-none" />
                        <div className="relative">
                            <h2 className="text-3xl font-extrabold mb-2 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Locate your business
                            </h2>
                            <p className="text-[var(--sys-text-muted)] text-sm mb-8">Enter your shop or local business details to extract data from public listings.</p>

                            <div className="space-y-4 mb-6 text-left">
                                <div>
                                    <label className="text-xs uppercase tracking-widest font-bold text-[var(--sys-text-muted)] block mb-1">Business Name</label>
                                    <input
                                        value={businessName}
                                        onChange={e => setBusinessName(e.target.value)}
                                        placeholder="e.g., Aosa Coffee"
                                        className="w-full py-4 px-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-lg placeholder-slate-600 focus:outline-none focus:border-primary/40 focus:bg-[var(--sys-surface)] transition-all"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase tracking-widest font-bold text-[var(--sys-text-muted)] block mb-1">City / Location</label>
                                    <input
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                        placeholder="e.g., Udaipur, Rajasthan"
                                        className="w-full py-4 px-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-lg placeholder-slate-600 focus:outline-none focus:border-primary/40 focus:bg-[var(--sys-surface)] transition-all"
                                    />
                                </div>
                            </div>

                            <button onClick={handleSearch} disabled={!businessName.trim() || !location.trim()}
                                className="btn-primary w-full py-4 rounded-2xl text-lg disabled:opacity-30">
                                Search & Add Business
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mt-6 p-4 rounded-xl border bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-orange-500 text-sm flex items-center gap-2 max-w-lg mx-auto">
                            <span className="material-symbols-outlined text-lg">error</span>
                            <div className="flex-1 text-left">{error.message}</div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in">
                    <div className="fixed inset-0 pointer-events-none" style={{
                        background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(var(--primary-rgb, 255, 77, 0), 0.08) 0%, transparent 70%)',
                    }} />

                    <div className="glass-panel rounded-3xl p-10 max-w-lg w-full text-center relative overflow-hidden">
                        <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
                            background: 'linear-gradient(to right, rgba(255, 77, 0, 0.1), transparent 40%, transparent 60%, rgba(255, 77, 0, 0.08))',
                        }} />

                        <div className="relative">
                            <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-3xl mx-auto mb-4 animate-pulse">
                                <span className="material-symbols-outlined">map</span>
                            </div>
                            <h2 className="text-3xl font-extrabold mb-3 tracking-tight" style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif' }}>
                                Locating {businessName}
                            </h2>
                            
                            {/* Progress Bar */}
                            <div className="w-full h-2 bg-[var(--sys-surface)] rounded-full overflow-hidden mb-4 border border-[var(--sys-border)]">
                                <div className="h-full rounded-full transition-all duration-700 ease-out relative"
                                    style={{ width: `${Math.max(progress, 2)}%`, background: 'linear-gradient(90deg, var(--primary), #ff9040)' }}>
                                    {progress < 100 && (
                                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                    )}
                                </div>
                            </div>

                            {/* Current step */}
                            <div className="inline-flex flex-col gap-2 p-4 rounded-2xl mb-4 transition-all duration-500 w-full"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div className="flex items-center justify-center gap-2 text-primary font-medium text-sm">
                                    {progress < 100 ? (
                                        <span className="material-symbols-outlined text-sm animate-spin">autorenew</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-sm text-green-400">check_circle</span>
                                    )}
                                    {currentStep}
                                </div>
                                <div className="flex items-center justify-center gap-3 text-xs text-[var(--sys-text-muted)]">
                                    <span className="flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[10px]">location_on</span>
                                        {location}
                                    </span>
                                    <span className="text-primary font-bold">{progress}%</span>
                                </div>
                            </div>

                            {/* Discovery Chips — appear live as data arrives */}
                            {discoveryData && (
                                <div className="flex flex-wrap justify-center gap-2 mb-4 animate-fade-in">
                                    {discoveryData.rating && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(250, 204, 21, 0.15)', color: '#facc15', border: '1px solid rgba(250, 204, 21, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">star</span>
                                            {discoveryData.rating}{discoveryData.reviewCount ? ` (${discoveryData.reviewCount})` : ''}
                                        </span>
                                    )}
                                    {discoveryData.website && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">language</span>
                                            Website found
                                        </span>
                                    )}
                                    {!discoveryData.website && discoveryData.rating && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(251, 146, 60, 0.15)', color: '#fb923c', border: '1px solid rgba(251, 146, 60, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">public_off</span>
                                            No website — AI synthesis
                                        </span>
                                    )}
                                    {discoveryData.socialCount > 0 && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#a78bfa', border: '1px solid rgba(147, 51, 234, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">share</span>
                                            {discoveryData.socialCount} social
                                        </span>
                                    )}
                                    {discoveryData.category && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">category</span>
                                            {discoveryData.category}
                                        </span>
                                    )}
                                    {discoveryData.address && (
                                        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                            <span className="material-symbols-outlined text-xs">pin_drop</span>
                                            Address found
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Completed steps log */}
                            {completedSteps.length > 0 && (
                                <div className="mt-3 max-h-28 overflow-y-auto text-left space-y-1 px-2" style={{ scrollBehavior: 'smooth' }}>
                                    {completedSteps.map((s, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs text-[var(--sys-text-muted)] animate-fade-in">
                                            <span className="text-green-500 text-[10px]">✓</span>
                                            <span className="opacity-70">{s.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
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
    const [country, setCountry] = useState('India')
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
            <button onClick={onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h2 className="text-3xl font-extrabold mb-2">Upload Brand <span className="text-primary">Assets</span></h2>
            <p className="text-[var(--sys-text-muted)] mb-8">Upload your logo, brand guidelines, or any brand-related content.</p>

            <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Brand Name *" className="input-glass w-full py-3 text-lg" autoFocus />
                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website (e.g., example.com)" className="input-glass w-full py-3 text-lg" />
                </div>
                <input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Industry (e.g., Technology, Fashion, Food)" className="input-glass w-full py-3" />


                {/* Country Picker */}
                <div>
                    <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">Target Country *</label>
                    <div className="flex flex-wrap gap-2">
                        {COUNTRIES.map(c => (
                            <button key={c.id} onClick={() => setCountry(c.id)} type="button"
                                className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                    ${country === c.id ? 'bg-primary text-white shadow-none' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
                                <span className="text-sm">{c.flag}</span> {c.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                    className="border border-dashed border-[var(--sys-border)] rounded-2xl p-12 text-center hover:border-primary/40 transition-colors">
                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-4 block">cloud_upload</span>
                    <p className="text-[var(--sys-text-muted)] mb-2">Drag & drop files here, or</p>
                    <label className="btn-primary py-2 px-6 rounded-xl cursor-pointer inline-block">
                        Browse Files
                        <input type="file" multiple className="hidden" onChange={handleDrop} accept="image/*,.pdf,.doc,.docx" />
                    </label>
                    <p className="text-xs text-[var(--sys-text-muted)] mt-3">Logo, brand guidelines, content samples, images</p>
                </div>

                {files.length > 0 && (
                    <div className="space-y-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <span className="material-symbols-outlined text-primary text-lg">description</span>
                                <span className="text-sm text-[var(--sys-text)] flex-1">{f.name}</span>
                                <span className="text-sm text-[var(--sys-text-muted)]">{(f.size / 1024).toFixed(0)} KB</span>
                                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                                    className="text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {error && (
                    <div className={`p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
            <button onClick={step > 0 ? () => setStep(step - 1) : onBack} className="text-[var(--sys-text-muted)] text-sm flex items-center gap-1 mb-6 hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-sm">arrow_back</span> Back
            </button>
            <h2 className="text-3xl font-extrabold mb-2">Build Your <span className="text-primary">Brand</span></h2>
            <p className="text-[var(--sys-text-muted)] mb-6">Let's create your brand identity step by step.</p>

            {/* Mini Progress */}
            <div className="flex gap-2 mb-8">
                {['Brand Info', 'Story & Audience', 'Style & Logo', 'Preview'].map((s, i) => (
                    <div key={i} className="flex-1">
                        <div className={`h-1 rounded-full transition-all ${i <= step ? 'bg-primary' : 'bg-[var(--sys-surface)]'}`} />
                        <p className={`text-xs mt-1 ${i <= step ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{s}</p>
                    </div>
                ))}
            </div>

            {/* Step 0: Brand Name & Industry */}
            {step === 0 && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">What's your brand name? *</label>
                            <input value={brandName} onChange={e => setBrandName(e.target.value)}
                                placeholder="e.g., Nike, Apple, Zara" className="input-glass w-full py-4 text-lg" autoFocus />
                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">This is what customers will know you as</p>
                        </div>
                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">Website (Optional)</label>
                            <input value={website} onChange={e => setWebsite(e.target.value)}
                                placeholder="e.g., example.com" className="input-glass w-full py-4 text-lg" />
                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Used for SEO and performance analysis</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">Industry *</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {industries.map(i => (
                                <button key={i} onClick={() => setIndustry(i)}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${industry === i ? 'bg-primary text-white shadow-none' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
                                    {i}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Country */}
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">public</span>
                            Target Country *
                        </label>
                        <p className="text-xs text-[var(--sys-text-muted)] mb-2">This determines the cultural calendar, festivals, and language options for your brand</p>
                        <div className="flex flex-wrap gap-2">
                            {COUNTRIES.map(c => (
                                <button key={c.id} onClick={() => setCountry(c.id)} type="button"
                                    className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5
                                        ${country === c.id ? 'bg-primary text-white shadow-none' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
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
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">What does {brandName} do?</label>
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
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">Who is your target audience?</label>
                        <input value={targetAudience} onChange={e => setTargetAudience(e.target.value)}
                            placeholder="e.g., Young professionals aged 25-35, tech-savvy millennials"
                            className="input-glass w-full py-3" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 block">Brand Keywords</label>
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
                                        <button onClick={() => setKeywords(keywords.filter((_, j) => j !== i))} className="material-symbols-outlined text-xs hover:text-[var(--sys-text)] cursor-pointer">close</button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {suggestedKeywords[industry] && (
                            <div>
                                <p className="text-xs text-[var(--sys-text-muted)] mb-1">Suggested for {industry}:</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {suggestedKeywords[industry].filter(k => !keywords.includes(k)).map(k => (
                                        <button key={k} onClick={() => setKeywords([...keywords, k])}
                                            className="px-2.5 py-1 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs hover:bg-primary/10 hover:text-primary transition-all cursor-pointer border border-[var(--sys-border)]">
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
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-3 block">Brand Personality</label>
                        <div className="grid grid-cols-2 gap-2">
                            {personalityOptions.map(p => (
                                <button key={p.id} onClick={() => setPersonality(p.id)}
                                    className={`flex items-center gap-3 p-3.5 rounded-xl transition-all cursor-pointer ${personality === p.id ? 'bg-primary/20 border border-primary/30 text-white' : 'bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                                    <span className="material-symbols-outlined text-lg">{p.icon}</span>
                                    <span className="text-sm font-medium">{p.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-5">
                        <label className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-3 block">Do you have a logo?</label>
                        <div className="flex gap-3 mb-4">
                            <button onClick={() => setHasLogo(true)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${hasLogo === true ? 'bg-primary text-white' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                ✅ Yes, I have one
                            </button>
                            <button onClick={() => setHasLogo(false)} className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${hasLogo === false ? 'bg-primary text-white' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                🎨 Generate one for me
                            </button>
                        </div>

                        {hasLogo === false && (
                            <div className="space-y-3 animate-fade-in">
                                <div>
                                    <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Describe your ideal logo</label>
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
                                        <img src={generatedLogo} alt="Generated logo" className="w-32 h-32 object-contain mx-auto rounded-xl border border-[var(--sys-border)] bg-white p-2" />
                                        <p className="text-sm text-[var(--sys-text-muted)] mt-2">AI-generated logo preview</p>
                                        <button onClick={handleGenerateLogo} disabled={generatingLogo}
                                            className="text-sm text-primary hover:text-primary-light mt-1 cursor-pointer">
                                            🔄 Regenerate
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {hasLogo === true && (
                            <p className="text.xs text-[var(--sys-text-muted)] animate-fade-in">
                                Great! You can upload your logo later from your Brand DNA page.
                            </p>
                        )}
                    </div>

                    {error && (
                        <div className={`p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
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
                                <img src={generatedLogo} alt="Logo" className="w-16 h-16 rounded-xl border border-[var(--sys-border)] bg-white p-1 object-contain" />
                            )}
                            <div>
                                <h3 className="text-2xl font-extrabold text-[var(--sys-text)]">{brandName}</h3>
                                {suggestion.tagline && <p className="text-primary italic">"{suggestion.tagline}"</p>}
                            </div>
                        </div>
                        {suggestion.personality && (
                            <div className="mb-4">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">Personality</p>
                                <p className="text-[var(--sys-text)]">{suggestion.personality}</p>
                            </div>
                        )}
                        {suggestion.voiceDescription && (
                            <div className="mb-4">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">Brand Voice</p>
                                <p className="text-[var(--sys-text-muted)]">{suggestion.voiceDescription}</p>
                            </div>
                        )}
                        {suggestion.colorSuggestions?.length > 0 && (
                            <div className="mb-4">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-2">Brand Colors</p>
                                <div className="flex gap-3">
                                    {suggestion.colorSuggestions.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-12 h-12 rounded-xl border border-[var(--sys-border)]" style={{ background: c.hex }} />
                                            <p className="text-sm text-[var(--sys-text-muted)] mt-1">{c.name}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {suggestion.keyPhrases?.length > 0 && (
                            <div>
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-2">Key Phrases</p>
                                <div className="flex flex-wrap gap-2">
                                    {suggestion.keyPhrases.map((p, i) => (
                                        <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button onClick={() => { setSuggestion(null); setStep(2) }} disabled={generating} className="btn-ghost flex-1 py-3 rounded-xl border border-[var(--sys-border)] cursor-pointer">
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

    // Phase 4 Agentic Data
    const competitiveIntel = dna.competitiveIntel || brand.competitiveIntel || {}
    const publicSentiment = dna.publicSentiment || brand.publicSentiment || {}
    const platformVoice = dna.platformVoice || brand.platformVoice || {}

    const hasCompetitors = (competitiveIntel.competitors?.length || 0) > 0;
    const hasSentiment = !!publicSentiment.overallSentiment && publicSentiment.overallSentiment !== 'unknown';
    const hasPlatformVoice = Object.values(platformVoice).some(v => v?.tone);
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
                <div className="size-24 rounded-full bg-[var(--sys-primary-dim)] flex items-center justify-center mb-6 animate-[pulse_1s_ease-in-out]">
                    <span className="material-symbols-outlined text-primary text-5xl">check_circle</span>
                </div>
                <h2 className="text-3xl font-extrabold text-[var(--sys-text)] mb-2">Brand DNA Saved!</h2>
                <p className="text-[var(--sys-text-muted)] text-sm">Taking you to your dashboard...</p>
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
                <p className="text-[var(--sys-text-muted)] text-sm mt-2">
                    We've analyzed your brand across {socialPlatforms > 0 ? `${socialPlatforms} social platforms, ` : ''}
                    {totalImages} images{hasVision ? ', and AI Vision' : ''}. Here's what we found.
                </p>
            </div>

            {/* ── Intelligence Summary Chips ── */}
            <div className="flex flex-wrap gap-2 justify-center mb-8">
                {hasVision && (
                    <span className="px-3 py-1.5 rounded-full bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">visibility</span> AI Vision Active
                    </span>
                )}
                {socialPlatforms > 0 && (
                    <span className="px-3 py-1.5 rounded-full bg-[#FF4D00]/10 border border-[#FF4D00]/20 text-[#FF4D00] text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">share</span> {socialPlatforms} Social Profiles
                    </span>
                )}
                {hasVoice && (
                    <span className="px-3 py-1.5 rounded-full bg-[#FF4D00]/10 border border-[#FF4D00]/20 text-[#FF4D00] text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">record_voice_over</span> Voice Analyzed
                    </span>
                )}
                {hasCompetitors && (
                    <span className="px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-500 text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">monitoring</span> {competitiveIntel.competitors.length} Competitors
                    </span>
                )}
                {hasSentiment && (
                    <span className="px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-xs font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">reviews</span> Sentiment Analyzed
                    </span>
                )}
                <span className="px-3 py-1.5 rounded-full bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-xs font-medium flex items-center gap-1.5">
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
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest">Website Snapshot</p>
                        </div>
                        {dna.logo?.metadata?.confidence && (
                            <div className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${
                                    dna.logo.metadata.confidence === 'high' ? 'bg-[var(--sys-surface)]' :
                                    dna.logo.metadata.confidence === 'medium' ? 'bg-yellow-400' : 'bg-[var(--sys-surface)]'
                                }`} />
                                <p className="text-xs text-[var(--sys-text-muted)]">
                                    {dna.logo.metadata.confidence} confidence
                                    {dna.logo.metadata.source === 'ai-vision' && ' · AI Vision'}
                                </p>
                            </div>
                        )}
                    </div>
                    <img src={dna.websiteSnapshot} alt="Website screenshot"
                        className="w-full rounded-xl border border-[var(--sys-border)] shadow-lg" />
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION B — Brand Identity */}
            {/* ══════════════════════════════════════════════════════════════ */}
            <div className="glass-panel rounded-3xl p-8 relative overflow-hidden mb-6">
                <div className="absolute inset-0 bg-[var(--sys-surface)] border border-[var(--sys-border)] pointer-events-none" />
                <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* ═══ LEFT: Identity ═══ */}
                    <div className="space-y-5">
                        {/* Brand Name + URL + Tagline */}
                        <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            <h3 className="text-2xl font-extrabold text-[var(--sys-text)] mb-1">{brand.name}</h3>
                            {dna.tagline && (
                                <p className="text-sm text-primary italic mb-2">"{dna.tagline}"</p>
                            )}
                            {brand.website && (
                                <div className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)]">
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
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex flex-col items-center justify-center min-h-[100px]">
                                {dna.logo?.url ? (
                                    <>
                                        <img src={dna.logo.url} alt="Brand Logo" className="max-w-full max-h-16 object-contain"
                                            onError={e => e.target.style.display = 'none'} />
                                        {dna.logo.metadata?.source === 'ai-vision' && (
                                            <span className="text-[10px] text-primary/60 mt-2 flex items-center gap-1">
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
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-2">Fonts</p>
                                <p className="text-2xl text-[var(--sys-text)] font-bold" style={{ fontFamily: dna.fonts?.heading?.family || 'Inter' }}>Aa</p>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">{dna.fonts?.heading?.family || 'Inter'}</p>
                                {dna.fonts?.body?.family && dna.fonts.body.family !== dna.fonts?.heading?.family && (
                                    <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">{dna.fonts.body.family}</p>
                                )}
                            </div>
                        </div>

                        {/* Colors */}
                        <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-3">Brand Colors</p>
                            {dna.colors?.length > 0 ? (
                                <div className="flex gap-4 flex-wrap">
                                    {dna.colors.map((c, i) => (
                                        <div key={i} className="text-center">
                                            <div className="w-14 h-14 rounded-full border border-[var(--sys-border)] shadow-lg"
                                                style={{ background: c.hex }} />
                                            <p className="text-[10px] text-[var(--sys-text-muted)] font-mono mt-1.5">{c.hex?.toLowerCase()}</p>
                                            {c.name && <p className="text-[10px] text-[var(--sys-text-muted)]">{c.name}</p>}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[var(--sys-text-muted)] text-sm">No colors detected</p>
                            )}
                        </div>
                    </div>

                    {/* ═══ RIGHT: Description & Overview ═══ */}
                    <div className="space-y-5">
                        {/* Brand Description */}
                        {dna.brandDescription && (
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm text-primary">description</span> About
                                </p>
                                <p className="text-sm text-[var(--sys-text)] leading-relaxed">{dna.brandDescription}</p>
                            </div>
                        )}

                        {/* Target Audience */}
                        {dna.targetAudience && (
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm text-primary">group</span> Target Audience
                                </p>
                                <p className="text-sm text-[var(--sys-text)] leading-relaxed">{dna.targetAudience}</p>
                            </div>
                        )}

                        {/* Photography Style */}
                        {dna.photographyStyle && (
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm text-primary">photo_camera</span> Photography Style
                                </p>
                                <p className="text-sm text-[var(--sys-text)] capitalize">{dna.photographyStyle}</p>
                            </div>
                        )}

                        {/* Brand Images Preview (inline) */}
                        {brandImages.length > 0 && (
                            <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-3 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm text-primary">photo_library</span> Discovered Images
                                    <span className="ml-auto text-[10px] font-normal">{brandImages.length} found</span>
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    {brandImages.filter(img => img.url).slice(0, 6).map((img, i) => (
                                        <div key={i} className="aspect-square rounded-lg overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-bg)]">
                                            <img src={img.url} alt={img.alt || `Image ${i+1}`}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={e => { e.target.style.display = 'none'; e.target.parentElement.style.display = 'none'; }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION B.1 — Local Business Details (Google Maps data) */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {dna.localBusiness && (dna.localBusiness.address || dna.localBusiness.rating || dna.localBusiness.phone) && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">location_on</span> Business Details
                        {dna.localBusiness.googleMapsUrl && (
                            <a href={dna.localBusiness.googleMapsUrl} target="_blank" rel="noopener"
                                className="ml-auto text-xs text-primary hover:underline flex items-center gap-1">
                                View on Google Maps <span className="material-symbols-outlined text-xs">open_in_new</span>
                            </a>
                        )}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {dna.localBusiness.rating && (
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-center">
                                <p className="text-2xl font-extrabold text-[var(--sys-text)]">⭐ {dna.localBusiness.rating}</p>
                                {dna.localBusiness.reviewCount && (
                                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-1">{dna.localBusiness.reviewCount} reviews</p>
                                )}
                            </div>
                        )}
                        {dna.localBusiness.category && (
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-center flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-lg mb-1">storefront</span>
                                <p className="text-xs text-[var(--sys-text-muted)]">{dna.localBusiness.category}</p>
                            </div>
                        )}
                        {dna.localBusiness.priceRange && (
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-center flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-lg mb-1">payments</span>
                                <p className="text-xs text-[var(--sys-text-muted)]">{dna.localBusiness.priceRange}</p>
                            </div>
                        )}
                        {dna.localBusiness.hours && (
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-center flex flex-col items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-lg mb-1">schedule</span>
                                <p className="text-[10px] text-[var(--sys-text-muted)] leading-tight">{dna.localBusiness.hours}</p>
                            </div>
                        )}
                    </div>
                    {(dna.localBusiness.address || dna.localBusiness.phone) && (
                        <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-[var(--sys-border)]">
                            {dna.localBusiness.address && (
                                <p className="text-xs text-[var(--sys-text-muted)] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-xs text-primary">pin_drop</span>
                                    {dna.localBusiness.address}
                                </p>
                            )}
                            {dna.localBusiness.phone && (
                                <p className="text-xs text-[var(--sys-text-muted)] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-xs text-primary">call</span>
                                    {dna.localBusiness.phone}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION B.1b — Brand Images Gallery */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {brandImages.length > 0 && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">photo_library</span> Brand Images
                        <span className="text-xs font-normal text-[var(--sys-text-muted)] ml-auto">{brandImages.length} images found</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {brandImages.filter(img => img.url && !img.url.startsWith('data:')).slice(0, 12).map((img, i) => (
                            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                <img
                                    src={img.url}
                                    alt={img.alt || `Brand image ${i + 1}`}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    loading="lazy"
                                    onError={e => { e.target.style.display = 'none'; e.target.parentElement.classList.add('hidden'); }}
                                />
                                {img.source && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="text-[10px] text-white/80 truncate">{img.source}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION B.2 — Strategy & Positioning */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {(dna.companyOverview || dna.uniqueSellingPoints?.length > 0 || dna.servicesOffered?.length > 0 || dna.missionStatement || dna.brandValues?.length > 0) && (
                <div className="glass-panel rounded-3xl p-8 mb-6 overflow-hidden">
                    <h3 className="text-2xl font-extrabold text-[var(--sys-text)] tracking-tight mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">lightbulb</span> Strategy & Positioning
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            {dna.companyOverview && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">business</span> Company Overview
                                    </p>
                                    <p className="text-sm text-[var(--sys-text)] leading-relaxed">{dna.companyOverview}</p>
                                </div>
                            )}
                            
                            {dna.missionStatement && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">track_changes</span> Mission Statement
                                    </p>
                                    <p className="text-sm italic text-[var(--sys-text)] leading-relaxed">"{dna.missionStatement}"</p>
                                </div>
                            )}

                            {dna.targetAudience && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">group</span> Target Audience
                                    </p>
                                    <p className="text-sm text-[var(--sys-text)] leading-relaxed">{dna.targetAudience}</p>
                                </div>
                            )}

                            {dna.brandValues?.length > 0 && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">volunteer_activism</span> Core Values
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {dna.brandValues.map((val, i) => (
                                            <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold">{val}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            {dna.uniqueSellingPoints?.length > 0 && (
                                <div className="p-4 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-3 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">stars</span> Unique Selling Points
                                    </p>
                                    <ul className="space-y-2">
                                        {dna.uniqueSellingPoints.map((usp, i) => (
                                            <li key={i} className="text-sm text-[var(--sys-text)] flex items-start gap-2">
                                                <span className="text-primary mt-0.5">•</span> <span>{usp}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {dna.servicesOffered?.length > 0 && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-3 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">category</span> Services / Products
                                    </p>
                                    <ul className="space-y-1.5">
                                        {dna.servicesOffered.map((srv, i) => (
                                            <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-2">
                                                <span className="text-[var(--sys-border)] mt-0.5">—</span> <span>{srv}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION C — Social Media Intelligence */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {socialPlatforms > 0 && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">share</span> Social Media Intelligence
                        <span className="text-xs font-normal text-[var(--sys-text-muted)] ml-auto">{socialPlatforms} platforms detected</span>
                    </h3>

                    {/* Social Link Pills */}
                    <div className="flex flex-wrap gap-2 mb-5">
                        {Object.entries(socialLinks).filter(([, url]) => url).map(([platform, url]) => {
                            const cfg = platformConfig[platform] || { icon: 'link', label: platform, color: '#888' }
                            return (
                                <a key={platform} href={url} target="_blank" rel="noopener"
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all hover:scale-105"
                                    style={{ borderColor: cfg.color + '30', background: cfg.color + '10' }}>
                                    <span>{cfg.icon}</span>
                                    <span className="text-xs font-medium text-[var(--sys-text)]">{cfg.label}</span>
                                    <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]">open_in_new</span>
                                </a>
                            )
                        })}
                    </div>

                    {/* Social Voice Analysis */}
                    {(socialVoice.captionStyle || socialVoice.toneInsight) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {socialVoice.captionStyle && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">edit_note</span> Caption Style
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.captionStyle}</p>
                                </div>
                            )}
                            {socialVoice.toneInsight && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">psychology</span> Tone Insight
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.toneInsight}</p>
                                </div>
                            )}
                            {socialVoice.hashtagStrategy && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">tag</span> Hashtag Strategy
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.hashtagStrategy}</p>
                                </div>
                            )}
                            {socialVoice.emojiUsage && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">mood</span> Emoji Usage
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.emojiUsage}</p>
                                </div>
                            )}
                            {socialVoice.ctaStyle && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">ads_click</span> CTA Patterns
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.ctaStyle}</p>
                                </div>
                            )}
                            {socialVoice.postingPatterns && (
                                <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">schedule</span> Posting Patterns
                                    </p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{socialVoice.postingPatterns}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Sample Captions */}
                    {socialVoice.sampleCaptions?.length > 0 && (
                        <div>
                            <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-2">Sample Captions from Social</p>
                            <div className="space-y-2">
                                {socialVoice.sampleCaptions.slice(0, 3).map((cap, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text-muted)] italic">
                                        "{cap}"
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Platform-Specific Voice Profiles */}
                    {hasPlatformVoice && (
                        <div className="mt-8 pt-6 border-t border-[var(--sys-border)]">
                            <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">smart_toy</span> Agentic Platform Profiles
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Object.entries(platformVoice).filter(([, v]) => v?.tone).map(([platform, profile]) => {
                                    const cfg = platformConfig[platform] || { icon: 'link', label: platform, color: '#888' }
                                    return (
                                        <div key={platform} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span>{cfg.icon}</span>
                                                <h4 className="font-bold text-[var(--sys-text)] capitalize">{platform}</h4>
                                            </div>
                                            <div className="space-y-2">
                                                {profile.tone && (
                                                    <p className="text-xs text-[var(--sys-text-muted)]"><span className="font-semibold text-[var(--sys-text)]">Tone:</span> {profile.tone}</p>
                                                )}
                                                {profile.captionStyle && (
                                                    <p className="text-xs text-[var(--sys-text-muted)]"><span className="font-semibold text-[var(--sys-text)]">Style:</span> {profile.captionStyle}</p>
                                                )}
                                                {profile.contentThemes?.length > 0 && (
                                                    <div className="pt-1">
                                                        <span className="text-[10px] uppercase font-bold text-[var(--sys-text-muted)] mb-1 block">Themes</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {profile.contentThemes.slice(0, 3).map((theme, i) => (
                                                                <span key={i} className="px-2 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary text-[10px]">{theme}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
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
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">record_voice_over</span> Brand Voice & Tone
                    </h3>
                    <p className="text-lg text-primary font-bold mb-2">{voice.personality}</p>
                    {voice.description && <p className="text-sm text-[var(--sys-text-muted)] mb-4">{voice.description}</p>}

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
                                <p className="text-sm text-[var(--sys-text-muted)] mb-1">{v.label}</p>
                                <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                <p className="text-xs text-right text-[var(--sys-text-muted)] mt-0.5">{v.value}%</p>
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
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--sys-border)]">
                            {dna.photographyStyle && (
                                <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">Photography</p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{dna.photographyStyle}</p>
                                </div>
                            )}
                            {contentStyle.writingStyle && (
                                <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">Writing Style</p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{contentStyle.writingStyle}</p>
                                </div>
                            )}
                            {contentStyle.ctaStyle && (
                                <div className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">CTA Style</p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">{contentStyle.ctaStyle}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content Style Do's / Don'ts */}
            {(contentStyle.dos?.length > 0 || contentStyle.donts?.length > 0) && (
                <div className="glass-panel rounded-2xl p-6 mb-6">
                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                        <span className="material-symbols-outlined text-primary">edit_note</span> Content Style Guide
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {contentStyle.dos?.length > 0 && (
                            <div className="bg-[var(--sys-primary-dim)] rounded-xl p-4 border border-[var(--sys-border)]">
                                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">check_circle</span> Do's
                                </p>
                                <ul className="space-y-1.5">
                                    {contentStyle.dos.map((d, i) => (
                                        <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-2">
                                            <span className="text-primary mt-0.5">✓</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {contentStyle.donts?.length > 0 && (
                            <div className="bg-[var(--sys-primary-dim)] rounded-xl p-4 border border-[var(--sys-border)]">
                                <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">cancel</span> Don'ts
                                </p>
                                <ul className="space-y-1.5">
                                    {contentStyle.donts.map((d, i) => (
                                        <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-2">
                                            <span className="text-primary mt-0.5">✗</span> {d}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Content preferences row */}
                    <div className="flex flex-wrap gap-3 mt-4">
                        {contentStyle.emojiUsage && contentStyle.emojiUsage !== 'minimal' && (
                            <span className="px-3 py-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text-muted)]">
                                Emoji: {contentStyle.emojiUsage}
                            </span>
                        )}
                        {contentStyle.hashtagStyle && contentStyle.hashtagStyle !== 'minimal' && (
                            <span className="px-3 py-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text-muted)]">
                                Hashtags: {contentStyle.hashtagStyle}
                            </span>
                        )}
                        {contentStyle.captionLengthPreference && (
                            <span className="px-3 py-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text-muted)]">
                                Caption length: {contentStyle.captionLengthPreference}
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* SECTION E — Brand Intelligence (Competitors & Sentiment) */}
            {/* ══════════════════════════════════════════════════════════════ */}
            {(hasCompetitors || hasSentiment || hasPlatformVoice) && (
                <div className="glass-panel rounded-3xl p-8 mb-6">
                    <h3 className="text-2xl font-extrabold text-[var(--sys-text)] tracking-tight mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">analytics</span> Market Intelligence
                    </h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Competitors */}
                        {hasCompetitors && (
                            <div>
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-4">Competitors Discovered</p>
                                <div className="space-y-3">
                                    {competitiveIntel.competitors.map((comp, i) => (
                                        <div key={i} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <h4 className="font-bold text-[var(--sys-text)]">{comp.name}</h4>
                                            </div>
                                            {comp.strengths && (
                                                <p className="text-xs text-[var(--sys-text-muted)] mb-1">
                                                    <span className="font-semibold text-green-500">Strength:</span> {comp.strengths}
                                                </p>
                                            )}
                                            {comp.weaknesses && (
                                                <p className="text-xs text-[var(--sys-text-muted)]">
                                                    <span className="font-semibold text-orange-500">Weakness:</span> {comp.weaknesses}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {competitiveIntel.differentiators?.length > 0 && (
                                    <div className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
                                        <p className="text-xs font-bold text-primary mb-2">Key Differentiators vs Competition</p>
                                        <ul className="space-y-1">
                                            {competitiveIntel.differentiators.map((diff, i) => (
                                                <li key={i} className="text-xs text-[var(--sys-text-muted)] flex items-start gap-2">
                                                    <span className="text-primary mt-0.5">•</span> {diff}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sentiment */}
                        {hasSentiment && (
                            <div>
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-4">Public Sentiment</p>
                                <div className="p-5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] h-full flex flex-col">
                                    <div className="flex items-center gap-4 mb-5">
                                        <div className={`p-3 rounded-xl flex items-center justify-center ${
                                            publicSentiment.overallSentiment === 'positive' ? 'bg-green-500/10 text-green-500' :
                                            publicSentiment.overallSentiment === 'mixed' ? 'bg-yellow-500/10 text-yellow-500' :
                                            'bg-red-500/10 text-red-500'
                                        }`}>
                                            <span className="material-symbols-outlined text-3xl">
                                                {publicSentiment.overallSentiment === 'positive' ? 'sentiment_very_satisfied' :
                                                 publicSentiment.overallSentiment === 'mixed' ? 'sentiment_neutral' : 'sentiment_dissatisfied'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-sm text-[var(--sys-text-muted)]">Overall Sentiment</p>
                                            <p className="text-xl font-bold text-[var(--sys-text)] capitalize">{publicSentiment.overallSentiment}</p>
                                            {publicSentiment.rating && <p className="text-xs text-[var(--sys-text-muted)] mt-0.5">Rating: <span className="font-semibold">{publicSentiment.rating}</span></p>}
                                        </div>
                                    </div>
                                    
                                    {publicSentiment.sentimentSummary && (
                                        <p className="text-sm text-[var(--sys-text-muted)] italic mb-4">
                                            "{publicSentiment.sentimentSummary}"
                                        </p>
                                    )}

                                    <div className="grid grid-cols-2 gap-4 mt-auto">
                                        {publicSentiment.reviewHighlights?.length > 0 && (
                                            <div>
                                                <p className="text-xs font-bold text-green-500 mb-2">Customers Love</p>
                                                <ul className="space-y-1">
                                                    {publicSentiment.reviewHighlights.map((hl, i) => (
                                                        <li key={i} className="text-[11px] text-[var(--sys-text-muted)] line-clamp-2">{hl}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {publicSentiment.reviewConcerns?.length > 0 && (
                                            <div>
                                                <p className="text-xs font-bold text-orange-500 mb-2">Common Concerns</p>
                                                <ul className="space-y-1">
                                                    {publicSentiment.reviewConcerns.map((rc, i) => (
                                                        <li key={i} className="text-[11px] text-[var(--sys-text-muted)] line-clamp-2">{rc}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
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
                        <span className="material-symbols-outlined text-primary">verified</span>
                        <div>
                            <p className="text-sm font-bold text-[var(--sys-text)]">Brand DNA extracted successfully</p>
                            <p className="text-xs text-[var(--sys-text-muted)]">
                                {hasVision ? 'AI Vision' : 'Scanner'} detected {dna.colors?.length || 0} colors,
                                {totalImages} images{socialPlatforms > 0 ? `, ${socialPlatforms} social profiles` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving}
                            className="py-3 px-8 rounded-2xl text-sm font-bold cursor-pointer transition-all bg-primary text-white hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2 shadow-none">
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

    // Role-based Access Control: Only Managers and above can create brands
    // "Member" role is restricted from this page.
    useEffect(() => {
        if (!authLoading && user && user.role === 'member') {
            console.warn('Access denied: Members cannot create brands.');
            navigate('/dashboard');
        }
    }, [user, authLoading, navigate]);

    // Safety Guard: Allow users to stay on onboarding if they explicitly nav here
    // ProtectedRoute.jsx handles forcing 0-brand users to onboarding.
    useEffect(() => {
        if (!authLoading) {
            setLoadingCount(false);
        }
    }, [authLoading]);

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
            navigate('/dashboard')
        }
    }

    const totalSteps = 3

    if (authLoading || loadingCount) return null;

    if (atLimit) {
        return (
            <div className="min-h-screen relative" style={{ background: 'var(--sys-bg)' }}>
                <SEOHead title="Limit Reached — Mantram AI" noIndex={true} />
                <div className="fixed inset-0 pointer-events-none z-0">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/15 blur-[120px] rounded-full" />
                </div>
                <div className="relative z-10 max-w-4xl mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[80vh] text-center animate-fade-in">
                    <div className="size-20 rounded-2xl bg-[var(--sys-primary-dim)] flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-primary">diamond</span>
                    </div>
                    <h2 className="text-3xl font-extrabold text-[var(--sys-text)] mb-3">Plan Limit Reached</h2>
                    <p className="text-[var(--sys-text-muted)] mb-8 max-w-md">
                        Your current <strong>{user?.planDetails?.name || 'Starter'}</strong> plan allows up to {maxBrands} brand{maxBrands !== 1 ? 's' : ''}. 
                        Upgrade your plan to add more brands to your portfolio.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button onClick={() => navigate('/credits')}
                            className="bg-primary text-white py-3 px-8 rounded-xl text-sm font-bold cursor-pointer hover:bg-primary-light transition-all shadow-none">
                            View Upgrade Plans
                        </button>
                        <button onClick={() => navigate('/brands')}
                            className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-8 py-3 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">
                            Manage Existing Brands
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen relative" style={{ background: 'var(--sys-bg)' }}>
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
                        <h1 className="text-xl font-extrabold text-[var(--sys-text)] tracking-tight">Mantram AI</h1>
                    </div>
                    <button onClick={() => navigate('/')} className="text-[var(--sys-text-muted)] text-sm hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                        ← Back to Home
                    </button>
                </div>

                <ProgressIndicator step={step} total={totalSteps} />

                {step === 0 && <ChoosePath onSelect={handlePathSelect} />}
                {step === 1 && path === 'website' && <WebsiteScan onComplete={handleBrandCreated} onBack={() => setStep(0)} initialUrl={scanUrlParam} />}
                {step === 1 && path === 'local' && <LocalBusinessScan onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 1 && path === 'upload' && <FileUpload onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 1 && path === 'brainstorm' && <Brainstorm onComplete={handleBrandCreated} onBack={() => setStep(0)} />}
                {step === 2 && <ReviewBrand brand={brand} onFinish={handleFinish} />}
            </div>
        </div>
    )
}

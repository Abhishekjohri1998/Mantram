import { useState, useEffect, useRef, useCallback } from 'react'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import DashboardLayout from '../components/DashboardLayout'
import { skills as skillsAPI, creatives as creativesAPI } from '../services/api'

// ── Size Presets ──
const SIZE_PRESETS = [
    { label: 'Instagram Post', value: '1080x1080', icon: 'photo_camera', w: 1080, h: 1080 },
    { label: 'Instagram Story', value: '1080x1920', icon: 'smartphone', w: 1080, h: 1920 },
    { label: 'Facebook Post', value: '1200x630', icon: 'share', w: 1200, h: 630 },
    { label: 'YouTube Thumbnail', value: '1280x720', icon: 'smart_display', w: 1280, h: 720 },
    { label: 'Twitter/X Post', value: '1200x675', icon: 'tag', w: 1200, h: 675 },
    { label: 'LinkedIn Post', value: '1200x627', icon: 'work', w: 1200, h: 627 },
    { label: 'Film Poster (2:3)', value: '2000x3000', icon: 'movie', w: 2000, h: 3000 },
    { label: 'Film Poster (27×40)', value: '2700x4000', icon: 'theaters', w: 2700, h: 4000 },
    { label: 'A4 Portrait', value: '2480x3508', icon: 'description', w: 2480, h: 3508 },
    { label: 'A4 Landscape', value: '3508x2480', icon: 'landscape', w: 3508, h: 2480 },
    { label: 'HD (16:9)', value: '1920x1080', icon: 'monitor', w: 1920, h: 1080 },
    { label: '4K', value: '3840x2160', icon: 'monitor', w: 3840, h: 2160 },
    { label: 'Square Banner', value: '1200x1200', icon: 'crop_square', w: 1200, h: 1200 },
    { label: 'Web Banner', value: '1920x600', icon: 'web', w: 1920, h: 600 },
    { label: 'Custom', value: 'custom', icon: 'tune', w: null, h: null },
];

// ── Constants ──
const CATEGORIES = [
    { id: 'all', label: 'All Skills', icon: 'apps' },
    { id: 'content', label: 'Content', icon: 'edit_note' },
    { id: 'creative', label: 'Creative', icon: 'brush' },
    { id: 'seo', label: 'SEO', icon: 'travel_explore' },
    { id: 'social', label: 'Social', icon: 'share' },
    { id: 'performance', label: 'Performance', icon: 'trending_up' },
    { id: 'general', label: 'General', icon: 'category' },
]

const COLOR_MAP = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', ring: 'ring-emerald-500/30' },
    blue: { bg: 'bg-[#FF4D00]/10', text: 'text-[#FF4D00]', border: 'border-[#FF4D00]/20', ring: 'ring-[#FF4D00]/30' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', ring: 'ring-amber-500/30' },
    violet: { bg: 'bg-[#FF4D00]/10', text: 'text-[#FF4D00]', border: 'border-[#FF4D00]/20', ring: 'ring-[#FF4D00]/30' },
    rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20', ring: 'ring-rose-500/30' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', ring: 'ring-cyan-500/30' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', ring: 'ring-orange-500/30' },
    teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20', ring: 'ring-teal-500/30' },
}

function getColors(color) { return COLOR_MAP[color] || COLOR_MAP.violet }

// ── Format text: strip markdown **bold** → <strong>, handle newlines ──
function FormatText({ text }) {
    if (typeof text !== 'string') return <span>{String(text)}</span>
    const parts = text.split(/\*\*(.*?)\*\*/g)
    return (
        <span>
            {parts.map((part, i) =>
                i % 2 === 1 ? <strong key={i} className="text-white font-bold">{part}</strong> : part
            )}
        </span>
    )
}

// ── Pretty key label: camelCase → Title Case ──
function prettyKey(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, c => c.toUpperCase())
        .trim()
}

// ── Recursive value renderer ──
function RenderValue({ value, depth = 0 }) {
    if (value === null || value === undefined) return null

    // String
    if (typeof value === 'string') {
        return <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed"><FormatText text={value} /></p>
    }

    // Number / Boolean
    if (typeof value === 'number' || typeof value === 'boolean') {
        return <span className="text-sm text-white font-bold">{String(value)}</span>
    }

    // Array
    if (Array.isArray(value)) {
        if (value.length === 0) return <p className="text-xs text-slate-600 italic">Empty</p>

        // Array of strings → bulleted list
        if (value.every(v => typeof v === 'string')) {
            return (
                <ul className="space-y-1.5 ml-1">
                    {value.map((item, i) => (
                        <li key={i} className="flex gap-2 text-sm text-slate-300">
                            <span className="text-primary font-bold shrink-0">{i + 1}.</span>
                            <span className="leading-relaxed"><FormatText text={item} /></span>
                        </li>
                    ))}
                </ul>
            )
        }

        // Array of objects → cards
        return (
            <div className="space-y-3">
                {value.map((item, i) => (
                    <div key={i} className={`p-3 rounded-xl ${depth === 0 ? 'bg-white/[0.02] border border-white/[0.06]' : 'bg-white/[0.015] border border-white/[0.04]'}`}>
                        {typeof item === 'object' && item !== null ? (
                            <div className="space-y-2">
                                {Object.entries(item).map(([k, v]) => (
                                    <div key={k}>
                                        <span className="text-[11px] text-primary/70 font-bold uppercase">{prettyKey(k)}</span>
                                        <div className="mt-0.5"><RenderValue value={v} depth={depth + 1} /></div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <RenderValue value={item} depth={depth + 1} />
                        )}
                    </div>
                ))}
            </div>
        )
    }

    // Object
    if (typeof value === 'object') {
        return (
            <div className={`space-y-2 ${depth > 0 ? 'pl-2 border-l-2 border-white/[0.06]' : ''}`}>
                {Object.entries(value).map(([k, v]) => (
                    <div key={k}>
                        <span className="text-[11px] text-slate-500 font-bold uppercase">{prettyKey(k)}</span>
                        <div className="mt-0.5"><RenderValue value={v} depth={depth + 1} /></div>
                    </div>
                ))}
            </div>
        )
    }

    return <p className="text-sm text-slate-300">{String(value)}</p>
}

// ── Result Renderer component ──
function ResultRenderer({ output, outputFormat }) {
    if (!output) return null

    // Markdown or HTML: render as text
    if (outputFormat === 'markdown' || outputFormat === 'html') {
        const content = typeof output === 'object' ? (output.content || JSON.stringify(output, null, 2)) : String(output)
        return (
            <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                <FormatText text={content} />
            </div>
        )
    }

    // Raw string (fallback if JSON parse failed)
    if (typeof output === 'string') {
        return <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap"><FormatText text={output} /></div>
    }

    // If there's a 'raw' key, it means JSON parse failed
    if (output.raw) {
        return <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap"><FormatText text={output.raw} /></div>
    }

    // Structured JSON: render each top-level key as a section
    return (
        <div className="space-y-4">
            {Object.entries(output).map(([key, value]) => (
                <div key={key} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <h4 className="text-xs text-primary font-bold uppercase mb-3 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        {prettyKey(key)}
                    </h4>
                    <RenderValue value={value} />
                </div>
            ))}
        </div>
    )
}

// ── Main Component ──
export default function SkillsHub() {
    const { activeBrand } = useBrand()

    // View management
    const [view, setView] = useState('browse')     // browse | run | build | history | help
    const [selectedSkill, setSelectedSkill] = useState(null)
    const [activeCategory, setActiveCategory] = useState('all')

    // Data
    const [skillsList, setSkillsList] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Run state
    const [inputs, setInputs] = useState({})
    const [executing, setExecuting] = useState(false)
    const [executingStage, setExecutingStage] = useState('')
    const [result, setResult] = useState(null)
    const [rating, setRating] = useState(0)

    // Build state
    const [buildForm, setBuildForm] = useState({ name: '', description: '', instructions: '', category: 'general', tags: '', icon: 'auto_awesome', color: 'violet', temperature: 0.7, outputFormat: 'structured', inputFields: [] })
    const [aiPrompt, setAiPrompt] = useState('')
    const [generating, setGenerating] = useState(false)
    const [enhancingInstructions, setEnhancingInstructions] = useState(false)

    // Active skills state (Model A)
    const [activeSkillIds, setActiveSkillIds] = useState(new Set())
    const [activeSkillsMax, setActiveSkillsMax] = useState(5)
    const [togglingSkill, setTogglingSkill] = useState(null)

    // Image library state (for image_library field type)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [libraryOpen, setLibraryOpen] = useState(null) // field name of the open picker
    const fileInputRefs = useRef({})

    // Execution history state (Model B)
    const [executions, setExecutions] = useState([])
    const [executionsTotal, setExecutionsTotal] = useState(0)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [routing, setRouting] = useState(null) // executionId being routed
    const [routeSuccess, setRouteSuccess] = useState(null)

    // Load skills + active skills
    useEffect(() => {
        loadSkills()
        loadActiveSkills()
    }, [])

    const loadSkills = async () => {
        setLoading(true)
        try {
            const data = await skillsAPI.list()
            if (data.success) setSkillsList(data.skills || [])
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
        finally { setLoading(false) }
    }

    const loadActiveSkills = async () => {
        try {
            const data = await skillsAPI.getActive()
            if (data.success) {
                setActiveSkillIds(new Set((data.skills || []).map(s => s._id)))
                setActiveSkillsMax(data.max || 5)
            }
        } catch { /* silent */ }
    }

    const toggleSkillActive = async (skillId, e) => {
        e?.stopPropagation()
        setTogglingSkill(skillId)
        try {
            const isActive = activeSkillIds.has(skillId)
            const data = isActive
                ? await skillsAPI.deactivate(skillId)
                : await skillsAPI.activate(skillId)
            if (data.success) {
                const next = new Set(activeSkillIds)
                isActive ? next.delete(skillId) : next.add(skillId)
                setActiveSkillIds(next)
            } else {
                setError({ message: data.error || 'Failed to toggle skill', isProviderError: false })
            }
        } catch (e) { setError({ message: e.message, isProviderError: false }) }
        finally { setTogglingSkill(null) }
    }

    const loadExecutionHistory = async () => {
        setLoadingHistory(true)
        try {
            const data = await skillsAPI.listExecutions({ brandId: activeBrand?._id, limit: 20 })
            if (data.success) {
                setExecutions(data.executions || [])
                setExecutionsTotal(data.total || 0)
            }
        } catch { /* silent */ }
        finally { setLoadingHistory(false) }
    }

    const routeToContentStudio = async (executionId) => {
        setRouting(executionId)
        setRouteSuccess(null)
        try {
            const data = await skillsAPI.routeExecution(executionId, { destination: 'content_studio' })
            if (data.success) {
                setRouteSuccess({ executionId, message: data.message, itemCount: data.itemCount })
            } else {
                setError({ message: data.error || 'Routing failed', isProviderError: false })
            }
        } catch (e) { setError({ message: e.message, isProviderError: false }) }
        finally { setRouting(null) }
    }

    // ── Load creative library for image_library fields ──
    const loadLibraryImages = useCallback(async () => {
        if (libraryImages.length > 0) return // already loaded
        setLibraryLoading(true)
        try {
            const data = await creativesAPI.list({ brandId: activeBrand?._id, limit: 50 })
            if (data.success || data.creatives) {
                setLibraryImages((data.creatives || []).filter(c => c.imageUrl))
            }
        } catch { /* silent */ }
        finally { setLibraryLoading(false) }
    }, [activeBrand?._id, libraryImages.length])

    // ── Handle image file upload + convert to base64 ──
    const handleImageUpload = (fieldName, file) => {
        if (!file) return
        const reader = new FileReader()
        reader.onload = (e) => {
            setInputs(prev => ({ ...prev, [fieldName]: e.target.result }))
        }
        reader.readAsDataURL(file)
    }

    const filtered = activeCategory === 'all' ? skillsList : skillsList.filter(s => s.category === activeCategory)

    // ── Open skill for execution ──
    const openSkill = async (skill) => {
        try {
            const data = await skillsAPI.get(skill._id)
            if (data.success) {
                setSelectedSkill(data.skill)
                setInputs({})
                setResult(null)
                setRating(0)
                setView('run')
            }
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
    }

    // ── Execute skill ──
    const executeSkill = async () => {
        if (!selectedSkill) return
        setExecuting(true); setResult(null); setError('')
        const stages = ['Understanding your inputs...', 'Loading brand context...', 'Applying skill instructions...', 'Generating output...', 'Polishing results...']
        let idx = 0; setExecutingStage(stages[0])
        const interval = setInterval(() => { idx = Math.min(idx + 1, stages.length - 1); setExecutingStage(stages[idx]) }, 3000)

        try {
            const data = await skillsAPI.execute(selectedSkill._id, {
                inputs,
                brandId: activeBrand?._id,
            })
            if (data.success) setResult(data)
            else setError(data.error || 'Execution failed')
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
        finally { clearInterval(interval); setExecuting(false) }
    }

    // ── Rate skill ──
    const rateSkill = async (score) => {
        setRating(score)
        try { await skillsAPI.rate(selectedSkill._id, { rating: score }) } catch { }
    }

    // ── Clone skill ──
    const cloneSkill = async (skillId) => {
        try {
            const data = await skillsAPI.clone(skillId)
            if (data.success) { loadSkills(); setError('') }
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
    }

    // ── Delete skill ──
    const deleteSkill = async (skillId) => {
        try {
            await skillsAPI.delete(skillId)
            loadSkills()
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
    }

    // ── Create skill ──
    const createSkill = async () => {
        const { name, description, instructions, category, tags, icon, color, temperature, outputFormat, inputFields } = buildForm
        if (!name.trim() || !description.trim() || !instructions.trim()) { setError({ message: 'Name, description, and instructions are required', isProviderError: false }); return }
        setLoading(true); setError('')
        try {
            const data = await skillsAPI.create({
                name, description, instructions, category,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                icon, color, temperature: parseFloat(temperature) || 0.7,
                outputFormat, inputFields,
            })
            if (data.success) { loadSkills(); setView('browse'); setBuildForm({ name: '', description: '', instructions: '', category: 'general', tags: '', icon: 'auto_awesome', color: 'violet', temperature: 0.7, outputFormat: 'structured', inputFields: [] }) }
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
        finally { setLoading(false) }
    }

    // ── AI Generate skill ──
    const generateSkill = async () => {
        if (!aiPrompt.trim()) return
        setGenerating(true); setError('')
        try {
            const data = await skillsAPI.generate({ prompt: aiPrompt.trim() })
            if (data.success && data.generated) {
                const g = data.generated
                setBuildForm({
                    name: g.name || '', description: g.description || '', instructions: g.instructions || '',
                    category: g.category || 'general', tags: (g.tags || []).join(', '),
                    icon: g.icon || 'auto_awesome', color: g.color || 'violet',
                    temperature: g.temperature || 0.7, outputFormat: g.outputFormat || 'structured',
                    inputFields: g.inputFields || [],
                })
                setAiPrompt('')
            }
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
        finally { setGenerating(false) }
    }

    const goHome = () => { setView('browse'); setSelectedSkill(null); setResult(null); setError(''); setRouteSuccess(null) }
    const openHistory = () => { setView('history'); loadExecutionHistory() }

    // ── Enhance instructions with AI ──
    const enhanceInstructions = async () => {
        if (!buildForm.instructions.trim()) { setError({ message: 'Write some rough instructions first, then enhance', isProviderError: false }); return }
        setEnhancingInstructions(true); setError('')
        try {
            const data = await skillsAPI.enhanceInstructions({
                instructions: buildForm.instructions,
                skillName: buildForm.name,
                skillDescription: buildForm.description,
            })
            if (data.success && data.enhanced) {
                setBuildForm({ ...buildForm, instructions: data.enhanced })
            } else { setError({ message: data.error || 'Enhancement failed', isProviderError: false }) }
        } catch (e) { setError({ message: e.message, isProviderError: e.isProviderError, provider: e.provider }) }
        finally { setEnhancingInstructions(false) }
    }

    // ── RENDER ──
    return (
        <DashboardLayout title="Skills Hub" subtitle="Reusable AI Marketing Skills">
            <SEOHead title="Skills Hub — Mantram AI" noIndex={true} />

            {/* ── Standardized Studio Tab Bar ── */}
            <div className="studio-tab-bar">
                <div className="studio-tab-row">
                    {[
                        { id: 'browse', icon: 'auto_awesome', label: 'Skills Library' },
                        { id: 'build', icon: 'add_circle', label: 'Create Skill' },
                        { id: 'history', icon: 'history', label: 'Run History' },
                        { id: 'help', icon: 'menu_book', label: 'Guide' },
                    ].map(tab => (
                        <button key={tab.id}
                            onClick={() => {
                                setView(tab.id)
                                if (tab.id === 'history') { loadExecutionHistory() }
                            }}
                            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 cursor-pointer ${view === tab.id ? 'studio-nav-pill text-white font-bold' : 'studio-nav-tab-inactive'}`}>
                            <span className={`material-symbols-outlined ${view === tab.id ? 'text-lg' : 'text-base opacity-70'}`}>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    ))}
                    {activeSkillIds.size > 0 && (
                        <span className="ml-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF4D00]/10 border border-[#FF4D00]/20 text-[11px] font-bold text-[#FF7A00]">
                            <span className="material-symbols-outlined text-xs">bolt</span>
                            {activeSkillIds.size}/{activeSkillsMax} Active
                        </span>
                    )}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className={`p-4 rounded-2xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'} text-sm mb-4 mx-2 flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-base">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError('')} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

                {/* ═══ BROWSE VIEW ═══ */}
                {view === 'browse' && (
                    <div className="animate-fade-in">
                        {/* Header Bar */}
                        <div className="glass-panel rounded-2xl p-5 mb-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                                        AI Skills Library
                                    </h2>
                                    <p className="text-xs text-slate-500 mt-0.5">{skillsList.length} skills available • Click to run, ⚡ to activate as persistent instruction</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={openHistory}
                                        className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 text-xs font-bold hover:bg-white/[0.08] cursor-pointer transition-all flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">history</span> History
                                    </button>
                                    <button onClick={() => setView('help')}
                                        className="px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400 text-xs font-bold hover:bg-white/[0.08] cursor-pointer transition-all flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">menu_book</span> Guide
                                    </button>
                                    <button onClick={() => setView('build')}
                                        className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 cursor-pointer transition-all flex items-center gap-2">
                                        <span className="material-symbols-outlined text-sm">add</span> Create Skill
                                    </button>
                                </div>
                            </div>

                            {/* Active Skills Banner */}
                            {activeSkillIds.size > 0 && (
                                <div className="mt-4 p-3 rounded-xl bg-[#FF4D00]/5 border border-[#FF4D00]/15">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="material-symbols-outlined text-[#FF4D00] text-sm">bolt</span>
                                        <span className="text-xs font-bold text-[#FF7A00]">{activeSkillIds.size}/{activeSkillsMax} Active Skills</span>
                                        <span className="text-[10px] text-slate-500">— Instructions injected into every Fidato conversation</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {skillsList.filter(s => activeSkillIds.has(s._id)).map(s => {
                                            const c = getColors(s.color)
                                            return (
                                                <button key={s._id} onClick={(e) => toggleSkillActive(s._id, e)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${c.bg} ${c.text} text-[11px] font-bold hover:opacity-80 cursor-pointer transition-all group`}>
                                                    <span className="material-symbols-outlined text-xs">{s.icon}</span>
                                                    {s.name}
                                                    <span className="material-symbols-outlined text-xs opacity-0 group-hover:opacity-100 transition-opacity">close</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Category Tabs */}
                        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                            {CATEGORIES.map(cat => (
                                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${activeCategory === cat.id
                                        ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                                        : 'bg-white/[0.03] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                                        }`}>
                                    <span className="material-symbols-outlined text-sm">{cat.icon}</span>
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Skills Grid */}
                        {loading ? (
                            <div className="text-center py-20">
                                <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
                                <p className="text-sm text-slate-500 mt-3">Loading skills...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-slate-600 text-5xl block mb-3">auto_awesome</span>
                                <h3 className="text-lg font-bold text-white mb-2">No Skills Found</h3>
                                <p className="text-sm text-slate-400 mb-4">Create your first custom skill or wait for the library to load.</p>
                                <button onClick={() => setView('build')} className="btn-primary py-2.5 px-6 rounded-xl text-sm cursor-pointer">Create Skill</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filtered.map(skill => {
                                    const c = getColors(skill.color)
                                    return (
                                        <div key={skill._id}
                                            className={`glass-panel rounded-2xl p-5 hover:bg-white/[0.04] transition-all group cursor-pointer border border-white/[0.06] hover:${c.border}`}
                                            onClick={() => openSkill(skill)}>
                                            <div className="flex items-start gap-3 mb-3">
                                                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                                    <span className={`material-symbols-outlined ${c.text} text-xl`}>{skill.icon || 'auto_awesome'}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="text-sm font-bold text-white truncate">{skill.name}</h3>
                                                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{skill.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.bg} ${c.text} font-bold uppercase`}>{skill.category}</span>
                                                    {skill.isPrebuilt && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">BUILT-IN</span>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {skill.usageCount > 0 && <span className="flex items-center gap-0.5 text-[10px] text-slate-600"><span className="material-symbols-outlined text-xs">play_arrow</span>{skill.usageCount}</span>}
                                                    {skill.avgRating > 0 && <span className="flex items-center gap-0.5 text-[10px] text-slate-600"><span className="material-symbols-outlined text-xs text-amber-400">star</span>{skill.avgRating.toFixed(1)}</span>}
                                                    {/* Activate Toggle */}
                                                    <button
                                                        onClick={(e) => toggleSkillActive(skill._id, e)}
                                                        disabled={togglingSkill === skill._id}
                                                        title={activeSkillIds.has(skill._id) ? 'Deactivate (remove from persistent instructions)' : 'Activate (inject into Fidato as persistent instruction)'}
                                                        className={`size-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                                                            activeSkillIds.has(skill._id)
                                                                ? 'bg-[#FF4D00]/20 text-[#FF4D00] ring-1 ring-[#FF4D00]/30'
                                                                : 'bg-white/[0.04] text-slate-600 hover:text-[#FF4D00] hover:bg-[#FF4D00]/10'
                                                        }`}>
                                                        {togglingSkill === skill._id
                                                            ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                                                            : <span className="material-symbols-outlined text-xs">bolt</span>}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ HELP VIEW ═══ */}
                {view === 'help' && (
                    <div className="animate-fade-in">
                        <SkillsHelpView onBack={goHome} />
                    </div>
                )}

                {/* ═══ RUN SKILL VIEW ═══ */}
                {view === 'run' && selectedSkill && (
                    <div className="animate-fade-in">
                        <button onClick={goHome} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-6 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Skills
                        </button>

                        {/* Skill Header */}
                        {(() => {
                            const c = getColors(selectedSkill.color); return (
                                <div className="glass-panel rounded-2xl p-6 mb-6">
                                    <div className="flex items-start gap-4">
                                        <div className={`w-14 h-14 rounded-2xl ${c.bg} flex items-center justify-center`}>
                                            <span className={`material-symbols-outlined ${c.text} text-3xl`}>{selectedSkill.icon}</span>
                                        </div>
                                        <div className="flex-1">
                                            <h2 className="text-xl font-black text-white">{selectedSkill.name}</h2>
                                            <p className="text-sm text-slate-400 mt-1">{selectedSkill.description}</p>
                                            <div className="flex items-center gap-3 mt-3">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${c.bg} ${c.text} font-bold uppercase`}>{selectedSkill.category}</span>
                                                {selectedSkill.tags?.map((t, i) => <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-slate-500">{t}</span>)}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => cloneSkill(selectedSkill._id)} className="px-3 py-1.5 rounded-lg bg-white/5 text-xs text-slate-400 hover:bg-primary/10 hover:text-primary cursor-pointer transition-all flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">content_copy</span> Clone
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {/* Input Form */}
                        {!result && !executing && (
                            <div className="glass-panel rounded-2xl p-6 mb-6">
                                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-sm">input</span> Inputs
                                </h3>

                                {activeBrand && (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-4">
                                        <span className="material-symbols-outlined text-primary text-sm">domain</span>
                                        <span className="text-xs text-slate-300">Running with brand: <strong className="text-white">{activeBrand.name}</strong></span>
                                    </div>
                                )}

                                {selectedSkill.inputFields?.length > 0 ? (
                                    <div className="space-y-4">
                                        {selectedSkill.inputFields.map((field, i) => (
                                            <div key={i}>
                                                <label className="text-xs text-slate-400 font-bold mb-1.5 block">
                                                    {field.label} {field.required && <span className="text-rose-400">*</span>}
                                                </label>

                                                {/* ── Textarea ── */}
                                                {field.type === 'textarea' ? (
                                                    <textarea value={inputs[field.name] || ''} onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
                                                        placeholder={field.placeholder} rows={3}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none resize-none" />

                                                /* ── Select ── */
                                                ) : field.type === 'select' ? (
                                                    <select value={inputs[field.name] || ''} onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                                        <option value="">{field.placeholder || 'Select...'}</option>
                                                        {field.options?.map((opt, j) => <option key={j} value={opt}>{opt}</option>)}
                                                    </select>

                                                /* ── Image Upload ── */
                                                ) : field.type === 'image_upload' ? (
                                                    <div>
                                                        {inputs[field.name] ? (
                                                            <div className="relative group">
                                                                <img src={inputs[field.name]} alt={field.label}
                                                                    className="w-full max-h-48 object-contain rounded-xl border border-white/10 bg-white/[0.02]" />
                                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                                                                    <button onClick={() => setInputs({ ...inputs, [field.name]: '' })}
                                                                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer hover:bg-rose-500/30 transition-all">
                                                                        Remove
                                                                    </button>
                                                                    <button onClick={() => fileInputRefs.current[field.name]?.click()}
                                                                        className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold cursor-pointer hover:bg-white/20 transition-all">
                                                                        Replace
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                onClick={() => fileInputRefs.current[field.name]?.click()}
                                                                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary', 'bg-primary/5') }}
                                                                onDragLeave={(e) => { e.currentTarget.classList.remove('border-primary', 'bg-primary/5') }}
                                                                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary', 'bg-primary/5'); handleImageUpload(field.name, e.dataTransfer.files[0]) }}
                                                                className="w-full py-8 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-all">
                                                                <span className="material-symbols-outlined text-3xl text-slate-500">cloud_upload</span>
                                                                <p className="text-xs text-slate-400 font-medium">Click or drag & drop image</p>
                                                                <p className="text-[10px] text-slate-600">PNG, JPG, WEBP up to 10MB</p>
                                                            </div>
                                                        )}
                                                        <input
                                                            ref={el => fileInputRefs.current[field.name] = el}
                                                            type="file" accept="image/*" className="hidden"
                                                            onChange={(e) => handleImageUpload(field.name, e.target.files[0])} />
                                                    </div>

                                                /* ── Image Library (pick from Creative Studio) ── */
                                                ) : field.type === 'image_library' ? (
                                                    <div>
                                                        {inputs[field.name] ? (
                                                            <div className="relative group">
                                                                <img src={inputs[field.name]} alt={field.label}
                                                                    className="w-full max-h-48 object-contain rounded-xl border border-white/10 bg-white/[0.02]" />
                                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-3">
                                                                    <button onClick={() => setInputs({ ...inputs, [field.name]: '' })}
                                                                        className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 text-xs font-bold cursor-pointer hover:bg-rose-500/30 transition-all">
                                                                        Remove
                                                                    </button>
                                                                    <button onClick={() => { setLibraryOpen(field.name); loadLibraryImages() }}
                                                                        className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-bold cursor-pointer hover:bg-white/20 transition-all">
                                                                        Change
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => { setLibraryOpen(field.name); loadLibraryImages() }}
                                                                className="w-full py-6 rounded-xl border-2 border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#FF4D00]/40 hover:bg-[#FF4D00]/5 transition-all">
                                                                <span className="material-symbols-outlined text-3xl text-[#FF4D00]">photo_library</span>
                                                                <p className="text-xs text-slate-400 font-medium">Select from Creative Library</p>
                                                                <p className="text-[10px] text-slate-600">Choose from your generated images</p>
                                                            </button>
                                                        )}

                                                        {/* ── Library Picker Modal ── */}
                                                        {libraryOpen === field.name && (
                                                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setLibraryOpen(null)}>
                                                                <div className="bg-[#0c0e1a] rounded-2xl border border-white/10 w-full max-w-2xl max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                                                                    <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                                                                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                                                            <span className="material-symbols-outlined text-[#FF4D00] text-lg">photo_library</span>
                                                                            Select Image — {field.label}
                                                                        </h3>
                                                                        <button onClick={() => setLibraryOpen(null)} className="text-slate-500 hover:text-white cursor-pointer transition-all">
                                                                            <span className="material-symbols-outlined">close</span>
                                                                        </button>
                                                                    </div>
                                                                    <div className="p-5 overflow-y-auto max-h-[60vh]">
                                                                        {libraryLoading ? (
                                                                            <div className="flex items-center justify-center py-12">
                                                                                <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
                                                                            </div>
                                                                        ) : libraryImages.length === 0 ? (
                                                                            <div className="text-center py-12">
                                                                                <span className="material-symbols-outlined text-slate-600 text-4xl block mb-2">image_not_supported</span>
                                                                                <p className="text-sm text-slate-400">No images in library yet.</p>
                                                                                <p className="text-xs text-slate-600 mt-1">Generate images in Creative Studio first.</p>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                                                                {libraryImages.map((img) => (
                                                                                    <button key={img._id}
                                                                                        onClick={() => { setInputs(prev => ({ ...prev, [field.name]: img.imageUrl })); setLibraryOpen(null) }}
                                                                                        className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer aspect-square ${
                                                                                            inputs[field.name] === img.imageUrl
                                                                                                ? 'border-primary ring-2 ring-primary/30'
                                                                                                : 'border-white/[0.06] hover:border-primary/40'
                                                                                        }`}>
                                                                                        <img src={img.imageUrl} alt={img.prompt?.slice(0, 30) || 'Creative'}
                                                                                            className="w-full h-full object-cover" loading="lazy" />
                                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                                                                                            <p className="text-[10px] text-white font-medium line-clamp-2">{img.prompt?.slice(0, 60) || 'Untitled'}</p>
                                                                                        </div>
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {/* Upload alternative */}
                                                                    <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
                                                                        <p className="text-[11px] text-slate-500">Or upload directly:</p>
                                                                        <label className="px-4 py-2 rounded-lg bg-white/5 text-xs text-slate-300 font-bold hover:bg-white/10 cursor-pointer transition-all flex items-center gap-1.5">
                                                                            <span className="material-symbols-outlined text-sm">cloud_upload</span> Upload Image
                                                                            <input type="file" accept="image/*" className="hidden"
                                                                                onChange={(e) => { handleImageUpload(field.name, e.target.files[0]); setLibraryOpen(null) }} />
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                /* ── Size Selector ── */
                                                ) : field.type === 'size_select' ? (
                                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                        {SIZE_PRESETS.map(sz => {
                                                            const isSelected = inputs[field.name] === sz.value
                                                            return (
                                                                <button key={sz.value}
                                                                    onClick={() => setInputs({ ...inputs, [field.name]: sz.value })}
                                                                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer ${
                                                                        isSelected
                                                                            ? 'border-primary bg-primary/10 ring-1 ring-primary/20'
                                                                            : 'border-white/[0.06] bg-white/[0.02] hover:border-primary/30 hover:bg-primary/5'
                                                                    }`}>
                                                                    <span className={`material-symbols-outlined text-lg ${isSelected ? 'text-primary' : 'text-slate-500'}`}>{sz.icon}</span>
                                                                    <span className={`text-[11px] font-bold ${isSelected ? 'text-white' : 'text-slate-400'}`}>{sz.label}</span>
                                                                    {sz.w && <span className="text-[9px] text-slate-600">{sz.w}×{sz.h}</span>}
                                                                </button>
                                                            )
                                                        })}
                                                        {inputs[field.name] === 'custom' && (
                                                            <div className="col-span-full flex gap-2 mt-2">
                                                                <input type="number" placeholder="Width" value={inputs[`${field.name}_w`] || ''}
                                                                    onChange={e => setInputs({ ...inputs, [`${field.name}_w`]: e.target.value })}
                                                                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none" />
                                                                <span className="text-slate-500 self-center text-xs">×</span>
                                                                <input type="number" placeholder="Height" value={inputs[`${field.name}_h`] || ''}
                                                                    onChange={e => setInputs({ ...inputs, [`${field.name}_h`]: e.target.value })}
                                                                    className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none" />
                                                            </div>
                                                        )}
                                                    </div>

                                                /* ── Default: text/number/url ── */
                                                ) : (
                                                    <input type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
                                                        value={inputs[field.name] || ''} onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
                                                        placeholder={field.placeholder}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500">This skill doesn't require any inputs — it uses your brand context.</p>
                                )}

                                <button onClick={executeSkill}
                                    className="mt-6 w-full py-3 px-6 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-light cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                                    <span className="material-symbols-outlined text-sm">play_arrow</span> Run Skill
                                </button>
                            </div>
                        )}

                        {/* Loading */}
                        {executing && (
                            <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
                                <div className="w-20 h-20 rounded-full border-4 border-white/5 flex items-center justify-center mb-6">
                                    <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                                </div>
                                <h3 className="text-base font-bold text-white mb-2">Running {selectedSkill.name}...</h3>
                                <p className="text-sm text-primary animate-pulse">{executingStage}</p>
                            </div>
                        )}

                        {/* Result */}
                        {result && !executing && (
                            <div className="glass-panel rounded-2xl p-6 animate-fade-in">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span> Result
                                    </h3>
                                    <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-500 mr-2">Rate:</span>
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button key={s} onClick={() => rateSkill(s)}
                                                className={`cursor-pointer transition-all ${s <= rating ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}>
                                                <span className="material-symbols-outlined text-lg">{s <= rating ? 'star' : 'star_border'}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Route Success Banner */}
                                {routeSuccess && routeSuccess.executionId === result.executionId && (
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-4 animate-fade-in">
                                        <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                                        <span className="text-xs text-emerald-300 font-bold">{routeSuccess.message}</span>
                                        <a href="/content-studio" className="ml-auto text-xs text-emerald-400 hover:underline font-bold">Open Content Studio →</a>
                                    </div>
                                )}

                                {/* Render output */}
                                <ResultRenderer output={result.output} outputFormat={result.outputFormat} />

                                {/* Actions — Output Routing (Model B) */}
                                <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-white/[0.06]">
                                    {/* Primary: Route to Content Studio */}
                                    {result.executionId && (
                                        <button
                                            onClick={() => routeToContentStudio(result.executionId)}
                                            disabled={routing === result.executionId || (routeSuccess && routeSuccess.executionId === result.executionId)}
                                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary/15 to-[#FF7A00]/10 border border-primary/20 text-primary text-sm font-bold hover:from-primary/25 hover:to-[#FF7A00]/20 cursor-pointer transition-all flex items-center gap-2 disabled:opacity-40">
                                            {routing === result.executionId
                                                ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Saving...</>
                                                : (routeSuccess && routeSuccess.executionId === result.executionId)
                                                    ? <><span className="material-symbols-outlined text-sm">check</span> Saved to Content Studio</>
                                                    : <><span className="material-symbols-outlined text-sm">inbox</span> Save to Content Studio</>}
                                        </button>
                                    )}
                                    <button onClick={() => { setResult(null); setInputs({}); setRouteSuccess(null) }}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-primary/10 hover:text-primary cursor-pointer transition-all font-bold">
                                        Run Again
                                    </button>
                                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(result.output, null, 2)) }}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 cursor-pointer transition-all font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">content_copy</span> Copy
                                    </button>
                                    <button onClick={goHome}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer transition-all font-bold">
                                        Back
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}


                {/* ═══ EXECUTION HISTORY VIEW ═══ */}
                {view === 'history' && (
                    <div className="animate-fade-in">
                        <button onClick={goHome} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-6 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Skills
                        </button>

                        <div className="glass-panel rounded-2xl p-5 mb-6">
                            <h2 className="text-lg font-black text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">history</span>
                                Execution History
                            </h2>
                            <p className="text-xs text-slate-500 mt-0.5">{executionsTotal} total executions{activeBrand ? ` for ${activeBrand.name}` : ''}</p>
                        </div>

                        {loadingHistory ? (
                            <div className="text-center py-20">
                                <span className="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
                                <p className="text-sm text-slate-500 mt-3">Loading history...</p>
                            </div>
                        ) : executions.length === 0 ? (
                            <div className="text-center py-20 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-slate-600 text-5xl block mb-3">history</span>
                                <h3 className="text-lg font-bold text-white mb-2">No Executions Yet</h3>
                                <p className="text-sm text-slate-400">Run some skills to see their history here.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {executions.map(exec => {
                                    const c = getColors(exec.skillColor)
                                    const date = new Date(exec.createdAt)
                                    const isRouted = exec.routedTo?.some(r => r.destination === 'content_studio')
                                    return (
                                        <div key={exec._id} className="glass-panel rounded-2xl p-4">
                                            <div className="flex items-start gap-3">
                                                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                                                    <span className={`material-symbols-outlined ${c.text} text-lg`}>{exec.skillIcon || 'auto_awesome'}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-bold text-white">{exec.skillName}</h4>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} font-bold uppercase`}>{exec.skillCategory}</span>
                                                        {isRouted && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold">ROUTED</span>}
                                                    </div>
                                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                                        {date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                        {exec.rating && <span className="ml-2">{'star'.repeat(exec.rating)}</span>}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    {!isRouted && (
                                                        <button
                                                            onClick={() => routeToContentStudio(exec._id)}
                                                            disabled={routing === exec._id}
                                                            className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-bold hover:bg-primary/20 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-40">
                                                            {routing === exec._id
                                                                ? <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                                                                : <span className="material-symbols-outlined text-xs">inbox</span>}
                                                            Save to Studio
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => { navigator.clipboard.writeText(JSON.stringify(exec.output, null, 2)) }}
                                                        className="px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-500 text-[11px] font-bold hover:bg-white/10 hover:text-white cursor-pointer transition-all flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">content_copy</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Collapsed output preview */}
                                            {exec.output && (
                                                <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] max-h-32 overflow-y-auto">
                                                    <p className="text-[11px] text-slate-500 font-mono whitespace-pre-wrap line-clamp-5">
                                                        {typeof exec.output === 'string' ? exec.output.slice(0, 500) : JSON.stringify(exec.output, null, 2).slice(0, 500)}...
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══ BUILD SKILL VIEW ═══ */}
                {view === 'build' && (
                    <div className="animate-fade-in">
                        <button onClick={goHome} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-6 cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Back to Skills
                        </button>

                        <div className="glass-panel rounded-2xl p-6 mb-6">
                            <h2 className="text-lg font-black text-white mb-1 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-xl">build</span> Create a New Skill
                            </h2>
                            <p className="text-xs text-slate-500">Build a reusable AI skill for your marketing workflows</p>
                        </div>

                        {/* AI Generator */}
                        <div className="glass-panel rounded-2xl p-5 mb-6">
                            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#FF4D00] text-sm">psychology</span> AI Skill Generator
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] font-bold">BETA</span>
                            </h3>
                            <div className="flex gap-2">
                                <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && generateSkill()}
                                    placeholder='Describe the skill, e.g. "Create a skill for generating WhatsApp broadcast messages with Hinglish tone"'
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                <button onClick={generateSkill} disabled={generating || !aiPrompt.trim()}
                                    className="px-4 py-3 rounded-xl bg-[#FF4D00]/10 text-[#FF4D00] text-xs font-bold hover:bg-[#FF4D00]/20 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-30">
                                    {generating ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">auto_awesome</span>}
                                    Generate
                                </button>
                            </div>
                        </div>

                        {/* Manual Form */}
                        <div className="glass-panel rounded-2xl p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 font-bold mb-1.5 block">Skill Name *</label>
                                    <input type="text" value={buildForm.name} onChange={e => setBuildForm({ ...buildForm, name: e.target.value })}
                                        placeholder="e.g., WhatsApp Broadcast Writer" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 font-bold mb-1.5 block">Category</label>
                                    <select value={buildForm.category} onChange={e => setBuildForm({ ...buildForm, category: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                        {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1.5 block">Description *</label>
                                <input type="text" value={buildForm.description} onChange={e => setBuildForm({ ...buildForm, description: e.target.value })}
                                    placeholder="One-line description for skill discovery..." className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                            </div>

                            <div>
                                <label className="text-xs text-slate-400 font-bold mb-1.5 block">Instructions * <span className="text-slate-600 font-normal">(what the AI does when running this skill)</span></label>
                                <textarea value={buildForm.instructions} onChange={e => setBuildForm({ ...buildForm, instructions: e.target.value })}
                                    placeholder="Write detailed instructions for the AI: what to produce, how to structure the output, what tone to use, quality rules..."
                                    rows={8} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none resize-none font-mono" />
                                <button onClick={enhanceInstructions} disabled={enhancingInstructions || !buildForm.instructions.trim()}
                                    className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#FF4D00]/15 to-cyan-500/10 border border-[#FF4D00]/30 text-[#FF7A00] text-xs font-bold hover:from-[#FF4D00]/25 hover:to-cyan-500/20 cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-30">
                                    {enhancingInstructions
                                        ? <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> Enhancing...</>
                                        : <><span className="material-symbols-outlined text-sm">auto_awesome</span> Enhance with AI</>}
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 font-bold mb-1.5 block">Tags</label>
                                    <input type="text" value={buildForm.tags} onChange={e => setBuildForm({ ...buildForm, tags: e.target.value })}
                                        placeholder="comma, separated, tags" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 font-bold mb-1.5 block">Output Format</label>
                                    <select value={buildForm.outputFormat} onChange={e => setBuildForm({ ...buildForm, outputFormat: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                        <option value="structured">Structured JSON</option>
                                        <option value="markdown">Markdown</option>
                                        <option value="html">HTML</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 font-bold mb-1.5 block">Temperature</label>
                                    <input type="number" value={buildForm.temperature} onChange={e => setBuildForm({ ...buildForm, temperature: e.target.value })}
                                        min="0" max="2" step="0.1" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                </div>
                            </div>

                            {/* Input Fields Builder */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs text-slate-400 font-bold">Input Fields <span className="text-slate-600 font-normal">(optional — what the user fills in)</span></label>
                                    <button onClick={() => setBuildForm({ ...buildForm, inputFields: [...buildForm.inputFields, { name: '', label: '', type: 'text', required: false, placeholder: '' }] })}
                                        className="text-xs text-primary hover:text-primary-light cursor-pointer font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">add</span> Add Field
                                    </button>
                                </div>
                                {buildForm.inputFields.map((field, i) => (
                                    <div key={i} className="flex gap-2 mb-2">
                                        <input type="text" value={field.name} onChange={e => { const f = [...buildForm.inputFields]; f[i] = { ...f[i], name: e.target.value }; setBuildForm({ ...buildForm, inputFields: f }) }}
                                            placeholder="field_name" className="w-28 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none" />
                                        <input type="text" value={field.label} onChange={e => { const f = [...buildForm.inputFields]; f[i] = { ...f[i], label: e.target.value }; setBuildForm({ ...buildForm, inputFields: f }) }}
                                            placeholder="Display Label" className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none" />
                                        <select value={field.type} onChange={e => { const f = [...buildForm.inputFields]; f[i] = { ...f[i], type: e.target.value }; setBuildForm({ ...buildForm, inputFields: f }) }}
                                            className="w-32 px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none cursor-pointer">
                                            <option value="text">Text</option>
                                            <option value="textarea">Long text</option>
                                            <option value="select">Select</option>
                                            <option value="number">Number</option>
                                            <option value="url">URL</option>
                                            <option value="image_upload">📷 Image Upload</option>
                                            <option value="image_library">🖼️ Image Library</option>
                                            <option value="size_select">📐 Size Picker</option>
                                        </select>
                                        <button onClick={() => { const f = buildForm.inputFields.filter((_, j) => j !== i); setBuildForm({ ...buildForm, inputFields: f }) }}
                                            className="text-slate-600 hover:text-rose-400 cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                                    </div>
                                ))}
                            </div>

                            <button onClick={createSkill} disabled={loading}
                                className="w-full py-3 px-6 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-light cursor-pointer transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50">
                                <span className="material-symbols-outlined text-sm">save</span> Create Skill
                            </button>
                        </div>
                    </div>
                )}
        </DashboardLayout>
    )
}


// ═══════════════════════════════════════════════════════════════
// SKILLS HUB — Help Documentation View
// ═══════════════════════════════════════════════════════════════
const SKILLS_HELP_SECTIONS = [
    {
        id: 'getting-started',
        icon: 'rocket_launch',
        color: '#6366f1',
        title: 'Getting Started',
        subtitle: 'Understand the Skills Hub in 30 seconds',
        steps: [
            { icon: 'apps', title: 'What Are Skills?', description: 'Skills are reusable AI-powered marketing automations. Each skill has instructions, inputs, and an output format — configured once, run anytime. Think of them as custom AI copilots for specific marketing tasks.' },
            { icon: 'browse_activity', title: 'Browse the Library', description: 'The Skills Hub opens to the Browse view showing all available skills. Use category tabs (Content, Creative, SEO, Social, Performance, General) to filter. Each card shows the skill name, description, category, usage count, and average rating.' },
            { icon: 'play_arrow', title: 'Run a Skill', description: 'Click any skill card to open the Run view. Fill in the required inputs, and click "Run Skill". The AI processes your inputs with your brand context and delivers structured results.' },
        ]
    },
    {
        id: 'run-skill',
        icon: 'play_circle',
        color: '#10b981',
        title: 'Running Skills',
        subtitle: 'Execute skills and get AI-powered output',
        steps: [
            { icon: 'input', title: 'Input Fields', description: 'Each skill defines its own input fields — text, textarea, select, number, or URL. Required fields are marked with a red asterisk. Some skills need no inputs at all — they use your brand context directly.' },
            { icon: 'domain', title: 'Brand Context', description: 'When you run a skill, your active brand\'s DNA (name, industry, tone, values, audience) is automatically injected. The AI output is tailored to your brand identity every time.' },
            { icon: 'auto_awesome', title: 'AI Output', description: 'Results are rendered based on the skill\'s output format: Structured JSON shows organized sections with key-value pairs, Markdown renders formatted text, and HTML outputs display rich content.' },
            { icon: 'star', title: 'Rate Results', description: 'After running a skill, rate the output from 1 to 5 stars. Ratings help the community identify the best skills and provide feedback for improvement.' },
            { icon: 'content_copy', title: 'Copy Output', description: 'Click "Copy Output" to copy the full result to your clipboard. Use it in your content tools, emails, campaigns, or presentations.' },
        ]
    },
    {
        id: 'build-skill',
        icon: 'build',
        color: '#8b5cf6',
        title: 'Building Custom Skills',
        subtitle: 'Create your own AI marketing skills',
        steps: [
            { icon: 'add', title: 'Open the Builder', description: 'Click "Create Skill" in the header. You\'ll see the Build view with fields for name, description, instructions, category, tags, output format, temperature, and input fields.' },
            { icon: 'edit_note', title: 'Write Instructions', description: 'The Instructions field is the most important. Write clear, detailed instructions for the AI: what to produce, the structure, tone, quality rules, and any constraints. Be specific — better instructions = better output.' },
            { icon: 'auto_awesome', title: 'Enhance with AI', description: 'Click "Enhance with AI" to automatically improve your rough instructions. The AI rewrites them into professional-grade prompts with structured output rules, quality checks, and formatting guidelines.' },
            { icon: 'tune', title: 'Configure Settings', description: 'Set the category (Content, Creative, SEO, etc.), tags for discoverability, output format (Structured JSON, Markdown, HTML), and temperature (0.0 = precise, 2.0 = creative). Default 0.7 works for most skills.' },
            { icon: 'text_fields', title: 'Define Input Fields', description: 'Click "Add Field" to create input fields users fill in when running the skill. Each field needs a name (field_name), display label, type (text, textarea, select, number, URL), and required flag.' },
        ]
    },
    {
        id: 'ai-generator',
        icon: 'psychology',
        color: '#f59e0b',
        title: 'AI Skill Generator',
        subtitle: 'Describe a skill and AI builds it for you',
        steps: [
            { icon: 'chat', title: 'Describe Your Skill', description: 'Type a natural language description in the AI Generator bar at the top of the Build view. Example: "Create a skill for generating WhatsApp broadcast messages with Hinglish tone for D2C brands."' },
            { icon: 'auto_awesome', title: 'Auto-Generated', description: 'The AI creates the complete skill config: name, description, detailed instructions, category, tags, icon, color, temperature, output format, and all necessary input fields — ready to save.' },
            { icon: 'edit', title: 'Review & Customize', description: 'The generated skill populates all form fields. Review and customize anything — tweak instructions, add/remove input fields, change the category or output format before saving.' },
        ]
    },
    {
        id: 'manage',
        icon: 'settings',
        color: '#06b6d4',
        title: 'Managing Skills',
        subtitle: 'Clone, customize, and organize your skills library',
        steps: [
            { icon: 'content_copy', title: 'Clone a Skill', description: 'Click the Clone button on any skill to duplicate it. This creates an editable copy — perfect for customizing a built-in skill to your specific needs without losing the original.' },
            { icon: 'delete', title: 'Delete Skills', description: 'Remove custom skills you no longer need. Built-in skills can\'t be deleted, but you can clone and modify them instead.' },
            { icon: 'label', title: 'BUILT-IN Badge', description: 'Skills marked with a "BUILT-IN" badge are pre-configured by Mantram. They\'re available to all users and can\'t be modified directly — clone them first to customize.' },
            { icon: 'filter_alt', title: 'Category Filters', description: 'Use the category tabs to filter skills: All Skills, Content, Creative, SEO, Social, Performance, General. Categories help organize your library as it grows.' },
        ]
    },
]

const SKILLS_PRO_TIPS = [
    { icon: 'ads_click', tip: 'Start by running built-in skills to understand how they work, then clone and customize them for your brand.' },
    { icon: '✍️', tip: 'The more detailed your Instructions, the better the output. Include format rules, quality checks, and examples.' },
    { icon: 'smart_toy', tip: 'Use the AI Skill Generator for quick skill creation — it handles 80% of the setup automatically.' },
    { icon: '⚡', tip: 'Use "Enhance with AI" to upgrade rough instructions into professional prompt engineering.' },
    { icon: 'bar_chart', tip: 'Set output format to "Structured JSON" for data you want to reuse in other tools.' },
    { icon: '🌡️', tip: 'Lower temperature (0.3-0.5) for factual/analytical output, higher (0.8-1.2) for creative/brainstorming.' },
]

function SkillsHelpView({ onBack }) {
    const [expanded, setExpanded] = useState('getting-started')
    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="size-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-slate-400">arrow_back</span>
                    </button>
                    <div>
                        <h2 className="text-white font-bold text-lg flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">menu_book</span> Skills Hub Guide
                        </h2>
                        <p className="text-sm text-slate-500">Create, run, and manage AI-powered marketing skills</p>
                    </div>
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-6" style={{ background: 'linear-gradient(135deg, #6366f108, #8b5cf608, #10b98108)' }}>
                <h3 className="text-white font-bold mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary">info</span> What is Skills Hub?</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                    Skills Hub is your library of <strong className="text-white">reusable AI marketing automations</strong>.
                    Each skill is a pre-configured AI workflow — with instructions, inputs, and output format — that you can <strong className="text-white">run anytime</strong> with your brand context.
                    <strong className="text-white"> Build custom skills</strong> from scratch, use the <strong className="text-white">AI Generator</strong> to create them from a description,
                    or <strong className="text-white">clone and customize</strong> built-in skills.
                </p>
                <div className="flex flex-wrap gap-2">
                    {['Browse Library', 'Run Skills', 'Build Custom', 'AI Generator', 'Clone & Edit', 'Rate & Review'].map(t => (
                        <span key={t} className="px-3 py-1 rounded-full text-xs font-bold bg-white/[0.04] border border-white/[0.06] text-slate-400">{t}</span>
                    ))}
                </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 mb-6">
                <h3 className="text-white font-bold mb-4 text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400 text-lg">account_tree</span> Typical Workflow
                </h3>
                <div className="flex items-center gap-0 overflow-x-auto pb-2">
                    {[
                        { label: 'Browse Skills', icon: 'apps', color: '#6366f1' },
                        { label: 'Pick a Skill', icon: 'touch_app', color: '#10b981' },
                        { label: 'Fill Inputs', icon: 'input', color: '#f59e0b' },
                        { label: 'Run Skill', icon: 'play_arrow', color: '#8b5cf6' },
                        { label: 'Get Output', icon: 'auto_awesome', color: '#06b6d4' },
                        { label: 'Rate & Reuse', icon: 'star', color: '#ec4899' },
                    ].map((step, idx, arr) => (
                        <div key={step.label} className="flex items-center shrink-0">
                            <div className="flex flex-col items-center gap-1.5 w-20">
                                <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${step.color}15` }}>
                                    <span className="material-symbols-outlined text-lg" style={{ color: step.color }}>{step.icon}</span>
                                </div>
                                <p className="text-xs text-slate-400 text-center leading-tight font-medium">{step.label}</p>
                            </div>
                            {idx < arr.length - 1 && <span className="material-symbols-outlined text-slate-700 text-sm mx-1 shrink-0">chevron_right</span>}
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-3 mb-6">
                {SKILLS_HELP_SECTIONS.map(section => (
                    <div key={section.id} className="glass-panel rounded-2xl overflow-hidden">
                        <button onClick={() => setExpanded(expanded === section.id ? null : section.id)}
                            className="w-full flex items-center gap-3 p-5 text-left hover:bg-white/[0.02] transition-all cursor-pointer">
                            <div className="size-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}15` }}>
                                <span className="material-symbols-outlined" style={{ color: section.color }}>{section.icon}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-bold text-sm">{section.title}</p>
                                <p className="text-slate-500 text-xs">{section.subtitle}</p>
                            </div>
                            <span className="text-xs text-slate-600 font-bold mr-1">{section.steps.length} topics</span>
                            <span className={`material-symbols-outlined text-slate-500 transition-transform ${expanded === section.id ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>
                        {expanded === section.id && (
                            <div className="px-5 pb-5 space-y-3 border-t border-white/[0.04] pt-4">
                                {section.steps.map((step, idx) => (
                                    <div key={idx} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                            <div className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${section.color}10` }}>
                                                <span className="material-symbols-outlined text-sm" style={{ color: section.color }}>{step.icon}</span>
                                            </div>
                                            {idx < section.steps.length - 1 && <div className="w-px flex-1 mt-1" style={{ backgroundColor: `${section.color}20` }} />}
                                        </div>
                                        <div className="pb-3">
                                            <p className="text-white font-bold text-sm mb-0.5">{step.title}</p>
                                            <p className="text-slate-400 text-xs leading-relaxed">{step.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="glass-panel rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #f59e0b08, #ef444408)' }}>
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400">emoji_objects</span> Pro Tips
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SKILLS_PRO_TIPS.map((tip, idx) => (
                        <div key={idx} className="flex gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                            <span className="text-lg shrink-0 mt-0.5">{tip.icon}</span>
                            <p className="text-xs text-slate-400 leading-relaxed">{tip.tip}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="text-center mt-6 py-6">
                <p className="text-slate-500 text-sm mb-3">Ready to explore?</p>
                <button onClick={onBack} className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-[#FF7A00] text-white cursor-pointer hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center gap-2 mx-auto">
                    <span className="material-symbols-outlined text-sm">apps</span> Browse Skills
                </button>
            </div>
        </div>
    )
}

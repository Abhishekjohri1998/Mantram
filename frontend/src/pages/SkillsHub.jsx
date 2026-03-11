import { useState, useEffect } from 'react'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import DashboardLayout from '../components/DashboardLayout'
import { skills as skillsAPI } from '../services/api'

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
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', ring: 'ring-blue-500/30' },
    amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', ring: 'ring-amber-500/30' },
    violet: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20', ring: 'ring-violet-500/30' },
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
    const [view, setView] = useState('browse')     // browse | run | build | manage
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

    // Load skills
    useEffect(() => {
        loadSkills()
    }, [])

    const loadSkills = async () => {
        setLoading(true)
        try {
            const data = await skillsAPI.list()
            if (data.success) setSkillsList(data.skills || [])
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
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
        } catch (e) { setError(e.message) }
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
        } catch (e) { setError(e.message) }
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
        } catch (e) { setError(e.message) }
    }

    // ── Delete skill ──
    const deleteSkill = async (skillId) => {
        try {
            await skillsAPI.delete(skillId)
            loadSkills()
        } catch (e) { setError(e.message) }
    }

    // ── Create skill ──
    const createSkill = async () => {
        const { name, description, instructions, category, tags, icon, color, temperature, outputFormat, inputFields } = buildForm
        if (!name.trim() || !description.trim() || !instructions.trim()) { setError('Name, description, and instructions are required'); return }
        setLoading(true); setError('')
        try {
            const data = await skillsAPI.create({
                name, description, instructions, category,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                icon, color, temperature: parseFloat(temperature) || 0.7,
                outputFormat, inputFields,
            })
            if (data.success) { loadSkills(); setView('browse'); setBuildForm({ name: '', description: '', instructions: '', category: 'general', tags: '', icon: 'auto_awesome', color: 'violet', temperature: 0.7, outputFormat: 'structured', inputFields: [] }) }
        } catch (e) { setError(e.message) }
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
        } catch (e) { setError(e.message) }
        finally { setGenerating(false) }
    }

    const goHome = () => { setView('browse'); setSelectedSkill(null); setResult(null); setError('') }

    // ── Enhance instructions with AI ──
    const enhanceInstructions = async () => {
        if (!buildForm.instructions.trim()) { setError('Write some rough instructions first, then enhance'); return }
        setEnhancingInstructions(true); setError('')
        try {
            const data = await skillsAPI.enhanceInstructions({
                instructions: buildForm.instructions,
                skillName: buildForm.name,
                skillDescription: buildForm.description,
            })
            if (data.success && data.enhanced) {
                setBuildForm({ ...buildForm, instructions: data.enhanced })
            } else { setError(data.error || 'Enhancement failed') }
        } catch (e) { setError(e.message) }
        finally { setEnhancingInstructions(false) }
    }

    // ── RENDER ──
    return (
        <DashboardLayout title="Skills Hub" subtitle="Reusable AI Marketing Skills">
            <SEOHead title="Skills Hub — Mantram AI" noIndex={true} />
            <div className="max-w-7xl mx-auto">

                {/* Error */}
                {error && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4 flex items-center justify-between">
                        <p className="text-rose-400 text-xs">{error}</p>
                        <button onClick={() => setError('')} className="text-rose-400 hover:text-white text-xs cursor-pointer">✕</button>
                    </div>
                )}

                {/* ═══ BROWSE VIEW ═══ */}
                {view === 'browse' && (
                    <div className="animate-fade-in">
                        {/* Header Bar */}
                        <div className="glass-panel rounded-2xl p-5 mb-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-xl">auto_awesome</span>
                                    AI Skills Library
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">{skillsList.length} skills available • Click to run, clone to customize</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setView('build')}
                                    className="px-4 py-2.5 rounded-xl bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 cursor-pointer transition-all flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">add</span> Create Skill
                                </button>
                            </div>
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
                                                <div className="flex items-center gap-2 text-[10px] text-slate-600">
                                                    {skill.usageCount > 0 && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-xs">play_arrow</span>{skill.usageCount}</span>}
                                                    {skill.avgRating > 0 && <span className="flex items-center gap-0.5"><span className="material-symbols-outlined text-xs text-amber-400">star</span>{skill.avgRating.toFixed(1)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
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
                                                {field.type === 'textarea' ? (
                                                    <textarea value={inputs[field.name] || ''} onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
                                                        placeholder={field.placeholder} rows={3}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none resize-none" />
                                                ) : field.type === 'select' ? (
                                                    <select value={inputs[field.name] || ''} onChange={e => setInputs({ ...inputs, [field.name]: e.target.value })}
                                                        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none cursor-pointer">
                                                        <option value="">{field.placeholder || 'Select...'}</option>
                                                        {field.options?.map((opt, j) => <option key={j} value={opt}>{opt}</option>)}
                                                    </select>
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

                                {/* Render output */}
                                <ResultRenderer output={result.output} outputFormat={result.outputFormat} />

                                {/* Actions */}
                                <div className="flex gap-3 mt-6">
                                    <button onClick={() => { setResult(null); setInputs({}) }}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-primary/10 hover:text-primary cursor-pointer transition-all font-bold">
                                        Run Again
                                    </button>
                                    <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(result.output, null, 2)) }}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 cursor-pointer transition-all font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">content_copy</span> Copy Output
                                    </button>
                                    <button onClick={goHome}
                                        className="px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-400 hover:bg-white/10 hover:text-white cursor-pointer transition-all font-bold">
                                        Back to Skills
                                    </button>
                                </div>
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
                                <span className="material-symbols-outlined text-violet-400 text-sm">psychology</span> AI Skill Generator
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-bold">BETA</span>
                            </h3>
                            <div className="flex gap-2">
                                <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && generateSkill()}
                                    placeholder='Describe the skill, e.g. "Create a skill for generating WhatsApp broadcast messages with Hinglish tone"'
                                    className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:border-primary focus:outline-none" />
                                <button onClick={generateSkill} disabled={generating || !aiPrompt.trim()}
                                    className="px-4 py-3 rounded-xl bg-violet-500/10 text-violet-400 text-xs font-bold hover:bg-violet-500/20 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-30">
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
                                    className="mt-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500/15 to-cyan-500/10 border border-violet-500/30 text-violet-300 text-xs font-bold hover:from-violet-500/25 hover:to-cyan-500/20 cursor-pointer transition-all flex items-center gap-1.5 disabled:opacity-30">
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
                                            className="w-24 px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:border-primary focus:outline-none cursor-pointer">
                                            <option value="text">Text</option><option value="textarea">Long text</option><option value="select">Select</option><option value="number">Number</option><option value="url">URL</option>
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
            </div>
        </DashboardLayout>
    )
}

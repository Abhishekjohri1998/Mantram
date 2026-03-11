import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import { automations as automationsAPI } from '../services/api'

// ═══════════════════════════════════════════════════════════════
// AUTOMATIONS PAGE — Recipe Cards + Flow Builder + Flow List
// ═══════════════════════════════════════════════════════════════

const NODE_STYLES = {
    send_message: { icon: 'chat_bubble', color: '#6366f1', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
    quick_replies: { icon: 'touch_app', color: '#f59e0b', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
    ask_question: { icon: 'help', color: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    condition: { icon: 'call_split', color: '#8b5cf6', bg: 'bg-purple-500/10', border: 'border-purple-500/30' },
    tag_user: { icon: 'label', color: '#06b6d4', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
    delay: { icon: 'timer', color: '#64748b', bg: 'bg-slate-500/10', border: 'border-slate-500/30' },
    action: { icon: 'webhook', color: '#f97316', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
    human_handoff: { icon: 'person', color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
    end: { icon: 'stop_circle', color: '#ef4444', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
}

const RECIPE_ICONS = {
    faq_auto_reply: { icon: 'help_center', gradient: 'from-indigo-500 to-purple-500' },
    lead_capture: { icon: 'person_add', gradient: 'from-emerald-500 to-teal-500' },
    comment_to_dm: { icon: 'mode_comment', gradient: 'from-amber-500 to-orange-500' },
    product_recommendation: { icon: 'recommend', gradient: 'from-pink-500 to-rose-500' },
}

export default function Automations() {
    const { activeBrand: currentBrand } = useBrand()
    const navigate = useNavigate()
    const [recipes, setRecipes] = useState([])
    const [automationsList, setAutomationsList] = useState([])
    const [selectedAutomation, setSelectedAutomation] = useState(null)
    const [loading, setLoading] = useState(false)
    const [creating, setCreating] = useState(null)
    const [view, setView] = useState('list') // 'list' | 'flow'
    const [editingNode, setEditingNode] = useState(null)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [nodeTypeMenu, setNodeTypeMenu] = useState(null) // index to show type picker at
    const [editingTriggers, setEditingTriggers] = useState(false)
    const [newKeyword, setNewKeyword] = useState('')

    // Load recipes once (no brand dependency)
    useEffect(() => {
        fetchRecipes()
    }, [])

    // Load automations when brand changes
    useEffect(() => {
        if (currentBrand?._id) {
            fetchAutomations()
        } else {
            setAutomationsList([])
        }
    }, [currentBrand])

    async function fetchRecipes() {
        try {
            const data = await automationsAPI.recipes()
            setRecipes(data.recipes || [])
        } catch { }
    }

    async function fetchAutomations() {
        setLoading(true)
        try {
            const data = await automationsAPI.list({ brandId: currentBrand._id })
            setAutomationsList(data.automations || [])
        } catch { }
        finally { setLoading(false) }
    }

    async function fetchAll() {
        await Promise.all([fetchRecipes(), fetchAutomations()])
    }

    async function createFromRecipe(recipeId) {
        if (!currentBrand?._id) return
        setCreating(recipeId)
        try {
            const data = await automationsAPI.fromRecipe({ brandId: currentBrand._id, recipeId })
            if (data.automation) {
                await fetchAll()
                // Open the flow builder for the new automation
                setSelectedAutomation(data.automation)
                setView('flow')
            }
        } catch (err) { alert(err.message) }
        finally { setCreating(null) }
    }

    async function toggleAutomation(id, e) {
        e.stopPropagation()
        try {
            await automationsAPI.toggle(id)
            await fetchAll()
        } catch { }
    }

    async function deleteAutomation(id, e) {
        e.stopPropagation()
        if (!confirm('Delete this automation?')) return
        try {
            await automationsAPI.delete(id)
            if (selectedAutomation?._id === id) {
                setSelectedAutomation(null)
                setView('list')
            }
            await fetchAll()
        } catch { }
    }

    async function openFlowBuilder(automation) {
        try {
            const data = await automationsAPI.get(automation._id)
            setSelectedAutomation(data.automation)
            setView('flow')
        } catch { }
    }

    async function updateNode(nodeId, field, value) {
        if (!selectedAutomation) return
        const updatedNodes = selectedAutomation.nodes.map(n => {
            if (n.nodeId !== nodeId) return n
            if (field.startsWith('config.')) {
                const configKey = field.replace('config.', '')
                return { ...n, config: { ...n.config, [configKey]: value } }
            }
            return { ...n, [field]: value }
        })
        try {
            const data = await automationsAPI.update(selectedAutomation._id, { nodes: updatedNodes })
            setSelectedAutomation(data.automation)
        } catch { }
    }

    async function activateAutomation() {
        if (!selectedAutomation) return
        try {
            await automationsAPI.toggle(selectedAutomation._id)
            const data = await automationsAPI.get(selectedAutomation._id)
            setSelectedAutomation(data.automation)
            await fetchAll()
        } catch { }
    }

    // ── Drag-and-drop reorder ──
    const [dragIdx, setDragIdx] = useState(null)
    const [dragOverIdx, setDragOverIdx] = useState(null)

    function handleDragStart(idx) { setDragIdx(idx) }
    function handleDragOver(e, idx) { e.preventDefault(); setDragOverIdx(idx) }
    function handleDragEnd() { setDragIdx(null); setDragOverIdx(null) }

    async function handleDrop(dropIdx) {
        if (dragIdx === null || dragIdx === dropIdx) { handleDragEnd(); return }
        const nodes = [...(selectedAutomation.nodes || [])]
        const [moved] = nodes.splice(dragIdx, 1)
        nodes.splice(dropIdx, 0, moved)
        handleDragEnd()
        try {
            const data = await automationsAPI.update(selectedAutomation._id, { nodes })
            setSelectedAutomation(data.automation)
        } catch { }
    }

    async function deleteNode(nodeId) {
        if (!confirm('Remove this step?')) return
        const nodes = (selectedAutomation.nodes || []).filter(n => n.nodeId !== nodeId)
        try {
            const data = await automationsAPI.update(selectedAutomation._id, { nodes })
            setSelectedAutomation(data.automation)
            setEditingNode(null)
        } catch { }
    }

    async function addNodeAfter(idx, nodeType = 'send_message') {
        const nodes = [...(selectedAutomation.nodes || [])]
        const typeConfig = {
            send_message: { label: 'New Message', config: { messageText: 'Enter your message here...' } },
            quick_replies: { label: 'Quick Replies', config: { messageText: 'Choose an option:', buttons: [{ label: 'Option 1', value: 'opt1' }, { label: 'Option 2', value: 'opt2' }] } },
            ask_question: { label: 'Ask Question', config: { questionText: 'What is your name?', saveToField: 'user_name' } },
            condition: { label: 'Condition', config: { conditionField: 'intent', conditionOperator: 'equals', conditionValue: 'purchase_intent' } },
            tag_user: { label: 'Tag User', config: { tagName: 'interested' } },
            delay: { label: 'Wait', config: { delaySeconds: 5 } },
            human_handoff: { label: 'Transfer to Human', config: {} },
            end: { label: 'End', config: {} },
        }
        const tc = typeConfig[nodeType] || typeConfig.send_message
        const newNode = {
            nodeId: `node_${Date.now()}`,
            type: nodeType,
            label: tc.label,
            config: tc.config,
            position: { x: 0, y: 0 },
        }
        nodes.splice(idx + 1, 0, newNode)
        try {
            const data = await automationsAPI.update(selectedAutomation._id, { nodes })
            setSelectedAutomation(data.automation)
            setEditingNode(newNode.nodeId)
            setNodeTypeMenu(null)
        } catch { }
    }

    // ── Create custom automation ──
    async function createCustomAutomation(formData) {
        if (!currentBrand?._id) return
        setCreating('custom')
        try {
            const data = await automationsAPI.create({
                brandId: currentBrand._id,
                ...formData,
            })
            if (data.automation) {
                await fetchAll()
                setSelectedAutomation(data.automation)
                setView('flow')
                setShowCreateModal(false)
            }
        } catch (err) { alert(err.message) }
        finally { setCreating(null) }
    }

    // ── Update triggers ──
    async function updateTriggers(triggers) {
        if (!selectedAutomation) return
        try {
            const data = await automationsAPI.update(selectedAutomation._id, { triggers })
            setSelectedAutomation(data.automation)
        } catch { }
    }

    async function addTriggerKeyword(triggerIdx, keyword) {
        if (!keyword.trim()) return
        const triggers = [...(selectedAutomation.triggers || [])]
        if (!triggers[triggerIdx].keywords) triggers[triggerIdx].keywords = []
        if (!triggers[triggerIdx].keywords.includes(keyword.trim())) {
            triggers[triggerIdx].keywords.push(keyword.trim())
            await updateTriggers(triggers)
        }
        setNewKeyword('')
    }

    async function removeTriggerKeyword(triggerIdx, keyword) {
        const triggers = [...(selectedAutomation.triggers || [])]
        triggers[triggerIdx].keywords = triggers[triggerIdx].keywords.filter(k => k !== keyword)
        await updateTriggers(triggers)
    }

    async function addTrigger(type) {
        const triggers = [...(selectedAutomation.triggers || [])]
        const newTrigger = { type }
        if (type === 'comment_keyword' || type === 'keyword_match') {
            newTrigger.keywords = ['interested']
        }
        if (type === 'intent_detected') {
            newTrigger.intent = 'purchase_intent'
        }
        triggers.push(newTrigger)
        await updateTriggers(triggers)
    }

    async function removeTrigger(idx) {
        const triggers = [...(selectedAutomation.triggers || [])]
        triggers.splice(idx, 1)
        await updateTriggers(triggers)
    }

    // ── Render ──

    if (view === 'flow' && selectedAutomation) {
        const nodes = selectedAutomation.nodes || []
        return (
            <DashboardLayout title="Flow Builder" subtitle={selectedAutomation.name}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <button onClick={() => { setView('list'); setSelectedAutomation(null) }}
                            className="size-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-slate-400">arrow_back</span>
                        </button>
                        <div>
                            <h2 className="text-white font-bold text-lg">{selectedAutomation.name}</h2>
                            <p className="text-sm text-slate-500">{nodes.length} steps · {selectedAutomation.triggers?.length || 0} triggers</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold ${selectedAutomation.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-slate-500'}`}>
                            {selectedAutomation.isActive ? '● Active' : '○ Draft'}
                        </span>
                        <button onClick={activateAutomation}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${selectedAutomation.isActive
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                                : 'btn-primary'}`}>
                            {selectedAutomation.isActive ? 'Deactivate' : '⚡ Activate Flow'}
                        </button>
                    </div>
                </div>

                {/* Triggers Card — Editable */}
                <div className="glass-panel rounded-xl p-4 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-slate-500 uppercase tracking-widest font-bold flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-primary text-xs">bolt</span> When triggered by
                        </p>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setEditingTriggers(!editingTriggers)}
                                className="text-sm text-primary hover:text-primary/80 cursor-pointer flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">{editingTriggers ? 'check' : 'edit'}</span>
                                {editingTriggers ? 'Done' : 'Edit'}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(selectedAutomation.triggers || []).map((t, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/10">
                                <span className="material-symbols-outlined text-primary text-sm">
                                    {t.type === 'dm_received' ? 'mail' : t.type === 'keyword_match' ? 'key' : t.type === 'intent_detected' ? 'psychology' : t.type.includes('comment') ? 'comment' : 'auto_stories'}
                                </span>
                                <span className="text-sm text-white font-medium">{t.type.replace(/_/g, ' ')}</span>
                                {t.keywords?.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {t.keywords.map(k => (
                                            <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/20 text-sm text-primary font-bold">
                                                {k}
                                                {editingTriggers && (
                                                    <button onClick={() => removeTriggerKeyword(i, k)} className="text-primary/60 hover:text-red-400 cursor-pointer">&times;</button>
                                                )}
                                            </span>
                                        ))}
                                        {editingTriggers && (
                                            <form onSubmit={e => { e.preventDefault(); addTriggerKeyword(i, newKeyword) }} className="inline-flex">
                                                <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} placeholder="+ word"
                                                    className="w-16 px-1.5 py-0.5 rounded bg-black/30 text-sm text-white border border-primary/20 outline-none" />
                                            </form>
                                        )}
                                    </div>
                                )}
                                {t.intent && <span className="text-sm text-primary font-bold">{t.intent}</span>}
                                {editingTriggers && (selectedAutomation.triggers || []).length > 1 && (
                                    <button onClick={() => removeTrigger(i)} className="text-sm text-slate-500 hover:text-red-400 cursor-pointer">
                                        <span className="material-symbols-outlined text-xs">close</span>
                                    </button>
                                )}
                            </div>
                        ))}
                        {editingTriggers && (
                            <div className="relative group">
                                <button className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-primary/30 text-sm text-primary/60 hover:text-primary hover:border-primary/50 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-xs">add</span> Add Trigger
                                </button>
                                <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-1 hidden group-hover:block z-20 min-w-[200px]">
                                    {['dm_received', 'keyword_match', 'comment_keyword', 'comment_any', 'story_reply', 'intent_detected'].map(type => (
                                        <button key={type} onClick={() => addTrigger(type)}
                                            className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-primary/10 hover:text-white transition-all cursor-pointer flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-primary">
                                                {type === 'dm_received' ? 'mail' : type === 'keyword_match' ? 'key' : type === 'intent_detected' ? 'psychology' : type.includes('comment') ? 'comment' : 'auto_stories'}
                                            </span>
                                            {type.replace(/_/g, ' ')}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Vertical Timeline Flow */}
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center gap-2 mb-4 text-sm text-slate-500 uppercase tracking-widest font-bold">
                        <span className="material-symbols-outlined text-xs">route</span> Flow Steps
                        <span className="text-slate-600">— drag to reorder</span>
                    </div>

                    {nodes.map((node, idx) => {
                        const style = NODE_STYLES[node.type] || NODE_STYLES.end
                        const isEditing = editingNode === node.nodeId
                        const isDragging = dragIdx === idx
                        const isDragOver = dragOverIdx === idx

                        return (
                            <div key={node.nodeId}>
                                {/* Node Card */}
                                <div
                                    draggable
                                    onDragStart={() => handleDragStart(idx)}
                                    onDragOver={(e) => handleDragOver(e, idx)}
                                    onDrop={() => handleDrop(idx)}
                                    onDragEnd={handleDragEnd}
                                    className={`group relative flex gap-4 transition-all ${isDragging ? 'opacity-30 scale-95' : ''} ${isDragOver ? 'ring-2 ring-primary/40 rounded-xl' : ''}`}
                                >
                                    {/* Step Number + Timeline Line */}
                                    <div className="flex flex-col items-center shrink-0 w-10">
                                        <div className="size-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 border-2 transition-colors"
                                            style={{ borderColor: style.color, color: style.color, backgroundColor: `${style.color}15` }}>
                                            {idx + 1}
                                        </div>
                                        {idx < nodes.length - 1 && (
                                            <div className="w-0.5 flex-1 min-h-[20px] bg-gradient-to-b" style={{ backgroundImage: `linear-gradient(${style.color}40, transparent)` }} />
                                        )}
                                    </div>

                                    {/* Node Content */}
                                    <div className={`flex-1 mb-3 rounded-xl border transition-all cursor-pointer ${style.border} ${isEditing ? 'ring-2 ring-primary shadow-lg shadow-primary/10' : 'hover:shadow-md'}`}
                                        style={{ backgroundColor: `${style.color}08` }}
                                        onClick={() => setEditingNode(isEditing ? null : node.nodeId)}>

                                        {/* Node Header */}
                                        <div className="flex items-center justify-between px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                {/* Drag Handle */}
                                                <span className="material-symbols-outlined text-slate-600 text-sm cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onMouseDown={e => e.stopPropagation()}>drag_indicator</span>
                                                <div className="size-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${style.color}20` }}>
                                                    <span className="material-symbols-outlined text-base" style={{ color: style.color }}>{style.icon}</span>
                                                </div>
                                                <div>
                                                    <p className="text-white font-bold text-sm">{node.label || node.type.replace(/_/g, ' ')}</p>
                                                    <p className="text-sm text-slate-500 capitalize">{node.type.replace(/_/g, ' ')}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm text-slate-600">{isEditing ? 'expand_less' : 'expand_more'}</span>
                                            </div>
                                        </div>

                                        {/* Collapsed Preview */}
                                        {!isEditing && (
                                            <div className="px-4 pb-3 -mt-1">
                                                {node.type === 'send_message' && <p className="text-sm text-slate-400 line-clamp-1">💬 {node.config.messageText || 'Empty message'}</p>}
                                                {node.type === 'quick_replies' && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {(node.config.buttons || []).map((b, bi) => <span key={bi} className="px-2 py-0.5 rounded-md bg-white/[0.06] text-sm text-white">{b.label}</span>)}
                                                    </div>
                                                )}
                                                {node.type === 'ask_question' && <p className="text-sm text-slate-400 line-clamp-1">❓ {node.config.questionText || 'Question'} → <span className="text-primary">{node.config.saveToField}</span></p>}
                                                {node.type === 'tag_user' && <p className="text-sm text-slate-400">🏷️ Tag: {node.config.tagName}</p>}
                                                {node.type === 'condition' && <p className="text-sm text-slate-400">🔀 if {node.config.conditionField} {node.config.conditionOperator} {node.config.conditionValue}</p>}
                                                {node.type === 'delay' && <p className="text-sm text-slate-400">⏱ Wait {node.config.delaySeconds || 0}s</p>}
                                                {node.type === 'human_handoff' && <p className="text-sm text-slate-400">👤 Transfer to human agent</p>}
                                                {node.type === 'end' && <p className="text-sm text-slate-400">🏁 Flow ends here</p>}
                                            </div>
                                        )}

                                        {/* Expanded Editor */}
                                        {isEditing && (
                                            <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06] pt-3" onClick={e => e.stopPropagation()}>
                                                {/* Label */}
                                                <div>
                                                    <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Step Name</label>
                                                    <input type="text" value={node.label || ''} onChange={e => updateNode(node.nodeId, 'label', e.target.value)}
                                                        className="w-full bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none" />
                                                </div>

                                                {/* Type-specific fields */}
                                                {(node.type === 'send_message' || node.type === 'quick_replies') && (
                                                    <div>
                                                        <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Message</label>
                                                        <textarea value={node.config.messageText || ''} onChange={e => updateNode(node.nodeId, 'config.messageText', e.target.value)}
                                                            className="w-full bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none resize-none" rows={3} />
                                                    </div>
                                                )}
                                                {node.type === 'quick_replies' && (
                                                    <div>
                                                        <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Quick Reply Buttons</label>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {(node.config.buttons || []).map((b, bi) => (
                                                                <span key={bi} className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary font-medium">{b.label}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {node.type === 'ask_question' && (
                                                    <>
                                                        <div>
                                                            <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Question</label>
                                                            <textarea value={node.config.questionText || ''} onChange={e => updateNode(node.nodeId, 'config.questionText', e.target.value)}
                                                                className="w-full bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none resize-none" rows={2} />
                                                        </div>
                                                        <div>
                                                            <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Save response to</label>
                                                            <input type="text" value={node.config.saveToField || ''} onChange={e => updateNode(node.nodeId, 'config.saveToField', e.target.value)}
                                                                className="w-full bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none" placeholder="e.g. user_email" />
                                                        </div>
                                                    </>
                                                )}
                                                {node.type === 'delay' && (
                                                    <div>
                                                        <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Delay (seconds)</label>
                                                        <input type="number" value={node.config.delaySeconds || 0} onChange={e => updateNode(node.nodeId, 'config.delaySeconds', parseInt(e.target.value))}
                                                            className="w-32 bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none" min={0} />
                                                    </div>
                                                )}
                                                {node.type === 'tag_user' && (
                                                    <div>
                                                        <label className="text-sm text-slate-500 uppercase tracking-wider font-bold mb-1 block">Tag Name</label>
                                                        <input type="text" value={node.config.tagName || ''} onChange={e => updateNode(node.nodeId, 'config.tagName', e.target.value)}
                                                            className="w-full bg-black/20 text-white text-sm rounded-lg px-3 py-2 border border-white/[0.1] focus:border-primary/50 outline-none" placeholder="e.g. hot_lead" />
                                                    </div>
                                                )}

                                                {/* Delete */}
                                                <div className="flex justify-end pt-1">
                                                    <button onClick={() => deleteNode(node.nodeId)}
                                                        className="flex items-center gap-1 text-sm text-rose-400 hover:text-rose-300 transition-colors cursor-pointer">
                                                        <span className="material-symbols-outlined text-sm">delete</span> Remove Step
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Add Step Button with Node Type Picker */}
                                {idx < nodes.length - 1 && (
                                    <div className="flex items-center gap-4 mb-3 relative">
                                        <div className="w-10 flex justify-center">
                                            <div className="w-0.5 h-4 bg-white/[0.06]" />
                                        </div>
                                        <button onClick={() => setNodeTypeMenu(nodeTypeMenu === idx ? null : idx)}
                                            className="flex items-center gap-1 px-3 py-1 rounded-lg text-sm text-slate-500 hover:text-primary hover:bg-primary/5 border border-transparent hover:border-primary/10 transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-xs">add</span> Add step
                                        </button>
                                        {nodeTypeMenu === idx && (
                                            <NodeTypePicker onSelect={(type) => addNodeAfter(idx, type)} onClose={() => setNodeTypeMenu(null)} />
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Add Step at End with Type Picker */}
                    <div className="flex items-center gap-4 mt-2 relative">
                        <div className="w-10 flex justify-center">
                            <div className="size-6 rounded-full border-2 border-dashed border-white/[0.1] flex items-center justify-center">
                                <span className="material-symbols-outlined text-xs text-slate-600">add</span>
                            </div>
                        </div>
                        <button onClick={() => setNodeTypeMenu(nodeTypeMenu === 'end' ? null : 'end')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-primary bg-white/[0.02] hover:bg-primary/5 border border-white/[0.06] hover:border-primary/10 transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-sm">add_circle</span> Add New Step
                        </button>
                        {nodeTypeMenu === 'end' && (
                            <NodeTypePicker onSelect={(type) => addNodeAfter(nodes.length - 1, type)} onClose={() => setNodeTypeMenu(null)} />
                        )}
                    </div>
                </div>
            </DashboardLayout>
        )
    }

    // ── List View ──
    return (
        <DashboardLayout title="Conversation Studio" subtitle="Build and manage conversation flows">
            <SEOHead title="Automations — Mantram AI" noIndex={true} />
            {/* Sub-Navigation */}
            <div className="flex items-center gap-1 mb-6 p-1 glass-panel rounded-xl w-fit">
                <button onClick={() => navigate('/conversations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">inbox</span> Inbox
                </button>
                <button className="px-5 py-2 rounded-lg text-sm font-bold bg-primary/10 text-primary flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">bolt</span> Automations
                </button>
                <button onClick={() => navigate('/conversations/ai-settings')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">psychology</span> AI Settings
                </button>
                <button onClick={() => navigate('/conversations/insights')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">insights</span> Insights
                </button>
            </div>
            {/* Recipe Cards — "Create Automation" */}
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-primary">auto_awesome</span>
                    <h2 className="text-white font-bold text-lg">Create Automation</h2>
                    <span className="text-sm text-slate-500">Choose a recipe to get started</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {recipes.map(r => {
                        const style = RECIPE_ICONS[r.id] || { icon: 'bolt', gradient: 'from-slate-500 to-slate-600' }
                        return (
                            <button key={r.id} onClick={() => createFromRecipe(r.id)} disabled={creating === r.id}
                                className="text-left glass-panel rounded-2xl p-5 hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer group disabled:opacity-50">
                                <div className={`size-12 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                    <span className="material-symbols-outlined text-white text-xl">{style.icon}</span>
                                </div>
                                <p className="text-white font-bold text-sm mb-1">{r.name}</p>
                                <p className="text-slate-500 text-sm leading-relaxed line-clamp-2">{r.description}</p>
                                <div className="flex items-center gap-3 mt-3 text-xs text-slate-600">
                                    <span>{r.triggerCount} triggers</span>
                                    <span>{r.nodeCount} steps</span>
                                </div>
                                {creating === r.id && (
                                    <div className="flex items-center gap-1.5 mt-2 text-primary text-xs">
                                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                        Creating...
                                    </div>
                                )}
                            </button>
                        )
                    })}

                    {/* Create Custom Automation Button */}
                    <button onClick={() => setShowCreateModal(true)}
                        className="text-left glass-panel rounded-2xl p-5 border-2 border-dashed border-white/[0.08] hover:border-primary/30 hover:bg-primary/[0.02] transition-all cursor-pointer group">
                        <div className="size-12 rounded-xl bg-white/[0.04] flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-primary/10 transition-all">
                            <span className="material-symbols-outlined text-slate-400 group-hover:text-primary text-xl">add_circle</span>
                        </div>
                        <p className="text-white font-bold text-sm mb-1">Create Custom</p>
                        <p className="text-slate-500 text-sm leading-relaxed">Build your own automation from scratch with custom triggers and steps</p>
                        <div className="flex items-center gap-1 mt-3 text-sm text-primary/60">
                            <span className="material-symbols-outlined text-xs">tune</span>
                            Fully customizable
                        </div>
                    </button>
                </div>
            </div>

            {/* Automations List */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-slate-400">list_alt</span>
                    <h2 className="text-white font-bold text-lg">Your Automations</h2>
                    <span className="text-sm text-slate-500">{automationsList.length} total</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <span className="material-symbols-outlined text-primary text-3xl animate-spin">progress_activity</span>
                    </div>
                ) : automationsList.length === 0 ? (
                    <div className="glass-panel rounded-2xl p-12 text-center">
                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-4">bolt</span>
                        <p className="text-white font-bold text-lg mb-1">No automations yet</p>
                        <p className="text-slate-500 text-sm">Pick a recipe above to create your first automation.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {automationsList.map(a => (
                            <div key={a._id} onClick={() => openFlowBuilder(a)}
                                className="glass-panel rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 hover:bg-primary/[0.02] transition-all cursor-pointer group">
                                {/* Icon */}
                                <div className="size-12 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${a.color || '#6366f1'}15` }}>
                                    <span className="material-symbols-outlined text-xl" style={{ color: a.color || '#6366f1' }}>{a.icon || 'bolt'}</span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-bold text-sm">{a.name}</p>
                                        <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase ${a.isActive
                                            ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.04] text-slate-500'}`}>
                                            {a.status || 'draft'}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-500 mt-0.5">{a.description}</p>
                                </div>

                                {/* Stats */}
                                <div className="flex items-center gap-6 text-center shrink-0">
                                    <div>
                                        <p className="text-lg font-bold text-white">{a.stats?.totalRuns || 0}</p>
                                        <p className="text-xs text-slate-600 uppercase">Runs</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-white">{a.stats?.completedRuns || 0}</p>
                                        <p className="text-xs text-slate-600 uppercase">Completed</p>
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold text-white">{a.stats?.leadsCollected || 0}</p>
                                        <p className="text-xs text-slate-600 uppercase">Leads</p>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => toggleAutomation(a._id, e)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${a.isActive
                                            ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
                                        {a.isActive ? 'Pause' : 'Activate'}
                                    </button>
                                    <button onClick={(e) => deleteAutomation(a._id, e)}
                                        className="size-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Custom Automation Modal */}
            {showCreateModal && <CreateCustomModal onSubmit={createCustomAutomation} onClose={() => setShowCreateModal(false)} creating={creating} />}
        </DashboardLayout>
    )
}

// ── Create Custom Automation Modal ──

function CreateCustomModal({ onSubmit, onClose, creating }) {
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [triggerType, setTriggerType] = useState('comment_keyword')
    const [keywords, setKeywords] = useState('')
    const [dmMessage, setDmMessage] = useState('')
    const [intent, setIntent] = useState('purchase_intent')

    function handleSubmit() {
        if (!name.trim()) return alert('Name is required')
        const trigger = { type: triggerType }
        if (triggerType === 'comment_keyword' || triggerType === 'keyword_match') {
            trigger.keywords = keywords.split(',').map(k => k.trim()).filter(Boolean)
            if (trigger.keywords.length === 0) return alert('Add at least one keyword')
        }
        if (triggerType === 'intent_detected') {
            trigger.intent = intent
        }

        const nodes = [{
            nodeId: 'start',
            type: 'send_message',
            label: 'Welcome Message',
            config: { messageText: dmMessage || 'Hey! 👋 Thanks for reaching out!' },
            nextNodeId: 'end',
            position: { x: 250, y: 100 },
        }, {
            nodeId: 'end',
            type: 'end',
            label: 'End',
            config: {},
            nextNodeId: '',
            position: { x: 250, y: 250 },
        }]

        onSubmit({ name, description, triggers: [trigger], nodes })
    }

    const TRIGGER_TYPES = [
        { id: 'comment_keyword', label: '💬 Comment Keyword', desc: 'When someone types a specific word in comments' },
        { id: 'keyword_match', label: '🔑 DM Keyword', desc: 'When someone sends a DM containing a keyword' },
        { id: 'dm_received', label: '📨 Any DM Received', desc: 'When any DM is received' },
        { id: 'story_reply', label: '📸 Story Reply', desc: 'When someone replies to your story' },
        { id: 'intent_detected', label: '🧠 Intent Detected', desc: 'When AI detects a specific intent' },
        { id: 'comment_any', label: '💬 Any Comment', desc: 'When anyone comments on any post' },
    ]

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div style={{ background: '#1e293b', borderRadius: '16px', border: '1px solid #334155', width: '560px', maxHeight: '85vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ padding: '1.25rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1.1rem', fontWeight: 700 }}>✨ Create Custom Automation</h3>
                        <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Build a custom flow with your own triggers and steps</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Name */}
                    <div>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Automation Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Comment 'TOOL' → Send Product Info"
                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>

                    {/* Description */}
                    <div>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Description (optional)</label>
                        <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this automation do?"
                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>

                    {/* Trigger Type */}
                    <div>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Trigger Type</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                            {TRIGGER_TYPES.map(t => (
                                <button key={t.id} onClick={() => setTriggerType(t.id)}
                                    style={{ textAlign: 'left', background: triggerType === t.id ? '#6366f115' : '#0f172a', border: `1px solid ${triggerType === t.id ? '#6366f150' : '#334155'}`, borderRadius: '10px', padding: '0.75rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                                    <p style={{ margin: 0, color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 600 }}>{t.label}</p>
                                    <p style={{ margin: '0.15rem 0 0', color: '#64748b', fontSize: '0.65rem' }}>{t.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Keywords Input (for comment_keyword and keyword_match) */}
                    {(triggerType === 'comment_keyword' || triggerType === 'keyword_match') && (
                        <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                                {triggerType === 'comment_keyword' ? 'Comment Keywords' : 'DM Keywords'} (comma-separated)
                            </label>
                            <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)}
                                placeholder="e.g. tool, price, info, details"
                                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                            <p style={{ color: '#64748b', fontSize: '0.65rem', margin: '0.25rem 0 0' }}>When someone types any of these words, the automation triggers</p>
                        </div>
                    )}

                    {/* Intent Selection */}
                    {triggerType === 'intent_detected' && (
                        <div>
                            <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Intent</label>
                            <select value={intent} onChange={e => setIntent(e.target.value)}
                                style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem' }}>
                                {['purchase_intent', 'price_inquiry', 'product_inquiry', 'booking', 'complaint', 'greeting', 'order_status', 'support'].map(i => (
                                    <option key={i} value={i}>{i.replace(/_/g, ' ')}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* DM Message */}
                    <div>
                        <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>First DM Message</label>
                        <textarea value={dmMessage} onChange={e => setDmMessage(e.target.value)}
                            placeholder="Hey! 👋 Thanks for your interest! Here are the details about our tool..."
                            rows={3}
                            style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
                        <p style={{ color: '#64748b', fontSize: '0.65rem', margin: '0.25rem 0 0' }}>This message is sent to the user's DM when the automation triggers. You can add more steps after creating.</p>
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '1.25rem', borderTop: '1px solid #334155', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ background: '#334155', color: '#e2e8f0', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={creating === 'custom'}
                        style={{ background: creating === 'custom' ? '#334155' : '#6366f1', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: creating === 'custom' ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
                        {creating === 'custom' ? '⏳ Creating...' : '⚡ Create Automation'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Node Type Picker ──

function NodeTypePicker({ onSelect, onClose }) {
    const types = [
        { id: 'send_message', icon: 'chat_bubble', label: 'Send Message', color: '#6366f1' },
        { id: 'quick_replies', icon: 'touch_app', label: 'Quick Replies', color: '#f59e0b' },
        { id: 'ask_question', icon: 'help', label: 'Ask Question', color: '#10b981' },
        { id: 'condition', icon: 'call_split', label: 'Condition', color: '#8b5cf6' },
        { id: 'tag_user', icon: 'label', label: 'Tag User', color: '#06b6d4' },
        { id: 'delay', icon: 'timer', label: 'Delay', color: '#64748b' },
        { id: 'human_handoff', icon: 'person', label: 'Human Handoff', color: '#eab308' },
        { id: 'end', icon: 'stop_circle', label: 'End Flow', color: '#ef4444' },
    ]
    return (
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={onClose} />
            <div style={{ position: 'absolute', top: '100%', left: '56px', marginTop: '4px', background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '0.375rem', zIndex: 31, boxShadow: '0 20px 40px rgba(0,0,0,0.4)', width: '220px' }}>
                <p style={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '0.375rem 0.5rem', letterSpacing: '0.05em' }}>Choose step type</p>
                {types.map(t => (
                    <button key={t.id} onClick={() => onSelect(t.id)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.625rem', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#e2e8f0', fontSize: '0.8rem', textAlign: 'left', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.target.style.background = `${t.color}15`}
                        onMouseLeave={e => e.target.style.background = 'transparent'}>
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: t.color }}>{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>
        </>
    )
}

// ── Helpers ──

function getFlowHeight(nodes) {
    if (!nodes?.length) return 400
    return Math.max(400, ...nodes.map(n => (n.position?.y || 0) + 120))
}

function getNodeConnections(node) {
    const conns = []
    if (node.nextNodeId) conns.push({ targetId: node.nextNodeId })
    if (node.config?.trueNodeId) conns.push({ targetId: node.config.trueNodeId })
    if (node.config?.falseNodeId) conns.push({ targetId: node.config.falseNodeId, dashed: true })
    if (node.config?.buttons) {
        node.config.buttons.forEach(b => {
            if (b.nextNodeId) conns.push({ targetId: b.nextNodeId })
        })
    }
    return conns
}

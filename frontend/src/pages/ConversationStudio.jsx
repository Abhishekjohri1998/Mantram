import { useState, useEffect, useRef } from 'react'
import SEOHead from '../components/SEOHead'
import { useNavigate, useLocation } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import GlobalLoader from '../components/GlobalLoader'
import { useBrand } from '../context/BrandContext'
import { conversations as conversationsAPI } from '../services/api'

// ═══════════════════════════════════════════════════════════════
// CONVERSATION STUDIO — Unified Smart Inbox
// ═══════════════════════════════════════════════════════════════

const INTENT_ICONS = {
    price_inquiry: 'payments', product_inquiry: 'shopping_bag', order_status: 'local_shipping',
    complaint: 'report_problem', store_location: 'location_on', greeting: 'waving_hand',
    support: 'support_agent', unknown: 'help',
}

const CHANNEL_CONFIG = {
    instagram_dm: { label: 'Instagram DM', icon: 'photo_camera', color: 'text-[#FF7A00]', bg: 'bg-[#FF4D00]/10' },
    facebook_messenger: { label: 'Messenger', icon: 'messenger', color: 'text-[#FF4D00]', bg: 'bg-[#FF4D00]/10' },
    instagram_comment: { label: 'IG Comment', icon: 'mode_comment', color: 'text-[#FF4D00]', bg: 'bg-[#FF4D00]/10' },
    instagram_story_reply: { label: 'Story Reply', icon: 'auto_stories', color: 'text-[var(--sys-primary)]', bg: 'bg-[var(--sys-surface)]' },
    instagram_mention: { label: 'Mention', icon: 'alternate_email', color: 'text-primary', bg: 'bg-[var(--sys-primary-dim)]' },
}

const STATUS_TABS = [
    { id: 'all', label: 'All', icon: 'inbox' },
    { id: 'active', label: 'Active', icon: 'mark_chat_unread' },
    { id: 'handed_off', label: 'Human', icon: 'person' },
    { id: 'resolved', label: 'Resolved', icon: 'check_circle' },
]

export default function ConversationStudio() {
    const { activeBrand: currentBrand } = useBrand()
    const [threads, setThreads] = useState([])
    const [selected, setSelected] = useState(null)
    const [conversation, setConversation] = useState(null)
    const [suggestions, setSuggestions] = useState([])
    const [compliance, setCompliance] = useState(null)
    const [statusFilter, setStatusFilter] = useState('all')
    const [loading, setLoading] = useState(false)
    const [detailLoading, setDetailLoading] = useState(false)
    const [replyText, setReplyText] = useState('')
    const [sending, setSending] = useState(false)
    const [stats, setStats] = useState(null)
    const [error, setError] = useState(null)

    const messagesEndRef = useRef(null)

    // Fetch threads
    useEffect(() => {
        if (currentBrand?._id) {
            fetchThreads()
            fetchStats()
        } else {
            setThreads([])
            setStats(null)
        }
    }, [currentBrand, statusFilter])

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [conversation?.messages])

    const hasBrand = !!currentBrand?._id

    async function fetchThreads() {
        if (!currentBrand?._id) return
        setLoading(true)
        try {
            const params = { brandId: currentBrand._id }
            if (statusFilter !== 'all') params.status = statusFilter
            const data = await conversationsAPI.list(params)
            setThreads(data.conversations || [])
        } catch { setThreads([]) }
        finally { setLoading(false) }
    }

    async function fetchStats() {
        if (!currentBrand?._id) return
        try {
            const data = await conversationsAPI.stats({ brandId: currentBrand._id })
            setStats(data.stats)
        } catch { }
    }

    async function selectThread(thread) {
        setSelected(thread._id)
        setDetailLoading(true)
        try {
            const data = await conversationsAPI.get(thread._id)
            setConversation(data.conversation)
            setCompliance(data.compliance)
            // Fetch AI suggestions
            const sugData = await conversationsAPI.suggestions(thread._id)
            setSuggestions(sugData.suggestions || [])
        } catch { setConversation(null) }
        finally { setDetailLoading(false) }
    }

    async function handleReply(content = replyText, sentBy = 'human') {
        if (!content?.trim() || !selected) return
        setSending(true)
        try {
            await conversationsAPI.reply(selected, { content, sentBy })
            // Refresh conversation
            const data = await conversationsAPI.get(selected)
            setConversation(data.conversation)
            setReplyText('')
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setSending(false) }
    }

    async function handleTakeover() {
        if (!selected) return
        try {
            await conversationsAPI.takeover(selected)
            const data = await conversationsAPI.get(selected)
            setConversation(data.conversation)
            fetchThreads()
        } catch { }
    }

    async function handleResolve() {
        if (!selected) return
        try {
            await conversationsAPI.resolve(selected)
            fetchThreads()
            setSelected(null)
            setConversation(null)
        } catch { }
    }

    async function handleToggleAI() {
        if (!selected || !conversation) return
        try {
            await conversationsAPI.toggleAI(selected, !conversation.isAIHandling)
            const data = await conversationsAPI.get(selected)
            setConversation(data.conversation)
        } catch { }
    }



    const contact = conversation?.contact
    const navigate = useNavigate()

    return (
        <DashboardLayout title="Conversation Studio" subtitle="AI-powered inbox for Instagram & Facebook">
            <SEOHead title="Conversation Studio — Mantram AI" noIndex={true} />
            {/* Sub-Navigation */}
            <div className="flex items-center gap-1 mb-6 p-1 glass-panel rounded-xl w-fit">
                <button className="px-5 py-2 rounded-lg text-sm font-bold bg-primary/10 text-primary flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">inbox</span> Inbox
                </button>
                <button onClick={() => navigate('/conversations/automations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">bolt</span> Automations
                </button>
                <button onClick={() => navigate('/conversations/ai-settings')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">psychology</span> AI Settings
                </button>
                <button onClick={() => navigate('/conversations/insights')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">insights</span> Insights
                </button>
            </div>

            {error && (
                <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-base">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}

            {/* Top Stats Bar */}
            <div className="flex items-center gap-3 mb-6">
                {stats && (
                    <div className="flex gap-3 flex-1">
                        {[
                            { label: 'Total', value: stats.total, icon: 'forum', color: 'text-primary' },
                            { label: 'Active', value: stats.active, icon: 'mark_chat_unread', color: 'text-primary' },
                            { label: 'AI Handled', value: stats.aiHandled, icon: 'smart_toy', color: 'text-[#FF4D00]' },
                            { label: 'Human', value: stats.handedOff, icon: 'person', color: 'text-primary' },
                            { label: 'Resolved', value: stats.resolved, icon: 'check_circle', color: 'text-[var(--sys-text-muted)]' },
                        ].map((s, i) => (
                            <div key={i} className="glass-panel rounded-xl px-4 py-3 flex items-center gap-3 flex-1">
                                <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
                                <div>
                                    <p className="text-xl font-black text-[var(--sys-text)]">{s.value || 0}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>



            {/* 3-Panel Inbox */}
            <div className="flex gap-0 h-[calc(100vh-260px)] rounded-2xl overflow-hidden glass-panel">
                {/* LEFT — Thread List */}
                <div className="w-80 border-r border-[var(--sys-border)] flex flex-col">
                    {/* Status Tabs */}
                    <div className="flex border-b border-[var(--sys-border)] p-1.5 gap-1">
                        {STATUS_TABS.map(t => (
                            <button key={t.id} onClick={() => setStatusFilter(t.id)}
                                className={`flex-1 py-2 px-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1
                                    ${statusFilter === t.id ? 'bg-primary/10 text-primary' : 'text-[var(--sys-text-muted)] hover:text-white hover:bg-[var(--sys-surface)]'}`}>
                                <span className="material-symbols-outlined text-xs">{t.icon}</span>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Thread List */}
                    <div className="flex-1 overflow-y-auto">
                        {!hasBrand ? (
                            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-4">domain</span>
                                <p className="text-[var(--sys-text)] font-bold mb-1">Select a Brand</p>
                                <p className="text-[var(--sys-text-muted)] text-xs">Choose a brand profile first to view and manage conversations.</p>
                            </div>
                        ) : loading ? (
                            <div className="flex items-center justify-center h-32">
                                <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                            </div>
                        ) : threads.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-4">forum</span>
                                <p className="text-[var(--sys-text)] font-bold mb-1">No conversations yet</p>
                                <p className="text-[var(--sys-text-muted)] text-xs">Instagram & Facebook DMs will appear here automatically via Meta integration.</p>
                            </div>
                        ) : threads.map(t => (
                            <button key={t._id} onClick={() => selectThread(t)}
                                className={`w-full text-left px-4 py-3.5 border-b border-[var(--sys-border)] transition-all cursor-pointer
                                    ${selected === t._id ? 'bg-primary/5 border-l-2 border-l-primary' : 'hover:bg-[var(--sys-surface)]'}`}>
                                <div className="flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className="size-10 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center shrink-0">
                                        <span className="text-base font-bold text-[var(--sys-text)]">
                                            {(t.contact?.name || 'U').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <p className="text-base font-bold text-[var(--sys-text)] truncate">{t.contact?.name || 'Unknown'}</p>
                                            <span className="text-xs text-[var(--sys-text-muted)] shrink-0">
                                                {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {/* Channel badge */}
                                            {CHANNEL_CONFIG[t.channel] && (
                                                <span className={`material-symbols-outlined text-[11px] ${CHANNEL_CONFIG[t.channel].color}`}>
                                                    {CHANNEL_CONFIG[t.channel].icon}
                                                </span>
                                            )}
                                            <p className="text-sm text-[var(--sys-text-muted)] truncate">{t.lastMessagePreview || 'New conversation'}</p>
                                        </div>
                                    </div>
                                    {/* Unread badge */}
                                    {t.unreadCount > 0 && (
                                        <div className="size-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                            <span className="text-sm font-bold text-[var(--sys-text)]">{t.unreadCount}</span>
                                        </div>
                                    )}
                                </div>
                                {/* Intent + AI badge */}
                                <div className="flex gap-1.5 mt-2 ml-[52px]">
                                    {t.intent && t.intent !== 'unknown' && (
                                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-0.5">
                                            <span className="material-symbols-outlined text-xs">{INTENT_ICONS[t.intent] || 'help'}</span>
                                            {t.intent.replace(/_/g, ' ')}
                                        </span>
                                    )}
                                    {t.isAIHandling && (
                                        <span className="px-2 py-0.5 rounded-md bg-[#FF4D00]/10 text-[#FF4D00] text-xs font-bold">AI</span>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* CENTER — Message Thread */}
                <div className="flex-1 flex flex-col">
                    {!conversation ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
                            <span className="material-symbols-outlined text-7xl text-slate-800 mb-4">chat</span>
                            <p className="text-[var(--sys-text)] font-bold text-lg mb-1">Select a conversation</p>
                            <p className="text-[var(--sys-text-muted)] text-sm max-w-sm">Pick a thread from the left to view messages, get AI suggestions, and reply in your brand voice.</p>
                        </div>
                    ) : detailLoading ? (
                        <div className="flex-1 flex items-center justify-center p-8">
                            <GlobalLoader
                                isActive={true}
                                title="Loading conversation..."
                                icon="forum"
                                estimatedDuration={10}
                                stages={['Fetching Messages', 'AI Suggestions']}
                                currentStage="Fetching Messages"
                            />
                        </div>
                    ) : (
                        <>
                            {/* Thread Header */}
                            <div className="p-4 border-b border-[var(--sys-border)] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="size-9 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                                        <span className="text-base font-bold text-[var(--sys-text)]">{(contact?.name || 'U').charAt(0)}</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-[var(--sys-text)]">{contact?.name}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">{contact?.platformUsername ? `@${contact.platformUsername}` : contact?.platform}</p>
                                    </div>
                                    {/* Channel badge */}
                                    {CHANNEL_CONFIG[conversation.channel] && (
                                        <span className={`px-2 py-1 rounded-lg text-xs font-bold ${CHANNEL_CONFIG[conversation.channel].bg} ${CHANNEL_CONFIG[conversation.channel].color}`}>
                                            {CHANNEL_CONFIG[conversation.channel].label}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* AI toggle */}
                                    <button onClick={handleToggleAI}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer
                                            ${conversation.isAIHandling ? 'bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                        <span className="material-symbols-outlined text-sm">{conversation.isAIHandling ? 'smart_toy' : 'person'}</span>
                                        {conversation.isAIHandling ? 'AI Mode' : 'Human'}
                                    </button>

                                    {conversation.isAIHandling && (
                                        <button onClick={handleTakeover}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)] hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm mr-1">person</span>Take Over
                                        </button>
                                    )}

                                    <button onClick={handleResolve}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)] hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm mr-1">check</span>Resolve
                                    </button>
                                </div>
                            </div>

                            {/* Compliance Banner */}
                            {compliance && (
                                <div className={`px-4 py-2 flex items-center gap-2 text-xs font-bold
                                    ${compliance.type === 'open' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                        compliance.type === 'restricted' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                            'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                    <span className="material-symbols-outlined text-sm">
                                        {compliance.type === 'open' ? 'verified' : compliance.type === 'restricted' ? 'warning' : 'block'}
                                    </span>
                                    {compliance.reason}
                                    {compliance.closesAt && (
                                        <span className="text-[var(--sys-text-muted)] ml-auto">
                                            Window closes: {new Date(compliance.closesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {conversation.messages.map((m, i) => (
                                    <div key={m._id || i} className={`flex ${m.role === 'brand' ? 'justify-end' : m.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                                        {m.role === 'system' ? (
                                            <div className="px-3 py-1.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-medium">
                                                {m.content}
                                            </div>
                                        ) : (
                                            <div className={`max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${m.role === 'brand'
                                                ? 'bg-primary/20 text-white rounded-br-md'
                                                : 'bg-[var(--sys-surface)] text-[var(--sys-text)] rounded-bl-md'
                                                }`}>
                                                <p>{m.content}</p>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className="text-xs text-[var(--sys-text-muted)]">
                                                        {new Date(m.timestamp || m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {m.sentBy === 'ai' && m.aiConfidence && (
                                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${m.aiConfidence >= 80 ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                            m.aiConfidence >= 60 ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'
                                                            }`}>
                                                            AI {m.aiConfidence}%
                                                        </span>
                                                    )}
                                                    {m.sentBy === 'human' && m.role === 'brand' && (
                                                        <span className="text-xs text-[var(--sys-text-muted)]">👤 Human</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Reply Input */}
                            <div className="p-4 border-t border-[var(--sys-border)]">
                                {/* AI Suggestions */}
                                {suggestions.length > 0 && (
                                    <div className="mb-3">
                                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-primary text-xs">auto_awesome</span>
                                            AI Suggestions
                                        </p>
                                        <div className="flex gap-2 overflow-x-auto pb-1">
                                            {suggestions.map((s, i) => (
                                                <button key={i} onClick={() => handleReply(s.content, 'ai')}
                                                    className="shrink-0 text-left px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer max-w-[200px] group">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="text-xs font-bold text-primary">{s.label}</span>
                                                        <span className={`text-xs font-bold px-1 py-0.5 rounded ${s.confidence >= 80 ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                            s.confidence >= 60 ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'
                                                            }`}>{s.confidence}%</span>
                                                    </div>
                                                    <p className="text-[11px] text-[var(--sys-text-muted)] line-clamp-2 group-hover:text-[var(--sys-text)] transition-colors">{s.content}</p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <form onSubmit={(e) => { e.preventDefault(); handleReply() }} className="flex gap-2">
                                    <input value={replyText} onChange={e => setReplyText(e.target.value)}
                                        placeholder="Type your reply..." className="input-glass flex-1 py-3 px-4" autoFocus />
                                    <button type="submit" disabled={!replyText.trim() || sending}
                                        className="btn-primary px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-30 flex items-center gap-2">
                                        {sending ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">send</span>}
                                        Send
                                    </button>
                                </form>
                            </div>
                        </>
                    )}
                </div>

                {/* RIGHT — Contact Card */}
                <div className="w-72 border-l border-[var(--sys-border)] overflow-y-auto">
                    {conversation && contact ? (
                        <div className="p-4 space-y-5">
                            {/* Contact Header */}
                            <div className="text-center">
                                <div className="size-16 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center mx-auto mb-3">
                                    <span className="text-2xl font-bold text-[var(--sys-text)]">{(contact.name || 'U').charAt(0)}</span>
                                </div>
                                <p className="text-[var(--sys-text)] font-bold">{contact.name}</p>
                                {contact.platformUsername && <p className="text-sm text-[var(--sys-text-muted)]">@{contact.platformUsername}</p>}
                                <div className="flex items-center justify-center gap-2 mt-2">
                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold ${CHANNEL_CONFIG[conversation.channel]?.bg} ${CHANNEL_CONFIG[conversation.channel]?.color}`}>
                                        {contact.platform}
                                    </span>
                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold
                                        ${contact.leadStatus === 'hot' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                            contact.leadStatus === 'warm' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                contact.leadStatus === 'converted' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                    'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'}`}>
                                        {contact.leadStatus || 'new'}
                                    </span>
                                </div>
                            </div>

                            {/* Intent */}
                            {conversation.intent && conversation.intent !== 'unknown' && (
                                <div className="glass-panel rounded-xl p-3">
                                    <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Detected Intent</p>
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">{INTENT_ICONS[conversation.intent]}</span>
                                        <div>
                                            <p className="text-base font-bold text-[var(--sys-text)] capitalize">{conversation.intent.replace(/_/g, ' ')}</p>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-16 h-1.5 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                                    <div className={`h-full rounded-full ${conversation.intentConfidence >= 80 ? 'bg-[var(--sys-surface)]' :
                                                        conversation.intentConfidence >= 60 ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'
                                                        }`} style={{ width: `${conversation.intentConfidence}%` }} />
                                                </div>
                                                <span className="text-sm text-[var(--sys-text-muted)]">{conversation.intentConfidence}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Contact Details */}
                            <div>
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Details</p>
                                <div className="space-y-2">
                                    {[
                                        { icon: 'language', label: 'Language', value: contact.language === 'hi' ? 'Hindi' : contact.language === 'hinglish' ? 'Hinglish' : 'English' },
                                        { icon: 'mail', label: 'Email', value: contact.email || '—' },
                                        { icon: 'phone', label: 'Phone', value: contact.phone || '—' },
                                        { icon: 'location_on', label: 'Location', value: contact.location || '—' },
                                        { icon: 'favorite', label: 'Interest', value: `${contact.interestScore || 0}/100` },
                                        { icon: 'chat', label: 'Messages', value: contact.totalMessages || 0 },
                                    ].map((d, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs">
                                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm">{d.icon}</span>
                                            <span className="text-[var(--sys-text-muted)] w-16">{d.label}</span>
                                            <span className="text-[var(--sys-text)] font-medium">{d.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Tags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {(contact.tags || []).length > 0 ? contact.tags.map((t, i) => (
                                        <span key={i} className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">{t}</span>
                                    )) : (
                                        <span className="text-xs text-[var(--sys-text-muted)]">No tags yet</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="space-y-2">
                                <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest font-bold mb-2">Actions</p>
                                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">edit_note</span>
                                    Create content from this chat
                                </button>
                                <button className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-xs hover:bg-primary/5 hover:text-primary hover:border-primary/20 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                                    Design offer visual
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full px-4 text-center">
                            <span className="material-symbols-outlined text-4xl text-slate-800 mb-3">contact_page</span>
                            <p className="text-xs text-[var(--sys-text-muted)]">Select a conversation to view contact details</p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    )
}

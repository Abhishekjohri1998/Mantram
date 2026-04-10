import { useState, useRef, useEffect, useCallback } from 'react'
import { fidato as fidatoAPI } from '../services/api'
import { useBrand } from '../context/BrandContext'

const BRIEFING_SESSION_KEY = 'fidato_briefing_shown'

export default function FidatoWidget() {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    // Core chat state
    const [open, setOpen] = useState(false)
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const chatEndRef = useRef(null)
    const inputRef = useRef(null)

    // Briefing popup state
    const [briefing, setBriefing] = useState(null)
    const [showBriefing, setShowBriefing] = useState(false)
    const [briefingLoading, setBriefingLoading] = useState(false)

    // Notification state
    const [notifications, setNotifications] = useState([])
    const [showNotifPanel, setShowNotifPanel] = useState(false)

    // Preferences
    const [fidatoEnabled, setFidatoEnabled] = useState(true)

    // Auto-scroll chat
    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        if (open && inputRef.current) inputRef.current.focus()
    }, [open])

    // Set personalized welcome message when brand changes
    useEffect(() => {
        const brandName = activeBrand?.name || ''
        setMessages([{
            role: 'assistant',
            content: brandName
                ? `heyyy! 👋 I'm Fidato, your branding expert for ${brandName}. ask me anything about your brand strategy, content ideas, or how to level up! 💜`
                : `heyyy! 👋 I'm Fidato, your go-to branding expert! select a brand and I'll help you with strategy, content, and everything marketing 💜`
        }])
    }, [activeBrand?._id])

    // Load briefing on mount (once per session) — delayed to let auth settle
    useEffect(() => {
        const alreadyShown = sessionStorage.getItem(BRIEFING_SESSION_KEY)
        if (alreadyShown) return

        let cancelled = false
        const timer = setTimeout(async () => {
            setBriefingLoading(true)
            try {
                const data = await fidatoAPI.briefing(brandId)
                if (cancelled) return
                if (data?.success && data.briefing) {
                    setBriefing(data.briefing)
                    setFidatoEnabled(data.preferences?.fidatoEnabled ?? true)
                    if (data.preferences?.fidatoPopup !== false) {
                        setShowBriefing(true)
                    }
                }
            } catch (e) {
                // Silently fail — briefing is non-critical
                console.warn('Fidato briefing skipped:', e?.message || e)
            }
            if (!cancelled) setBriefingLoading(false)
        }, 2000) // 2s delay to let auth and brand context settle

        return () => { cancelled = true; clearTimeout(timer) }
    }, [])

    // Load notifications
    const loadNotifications = useCallback(async () => {
        try {
            const data = await fidatoAPI.notifications(brandId)
            if (data.success) setNotifications(data.notifications || [])
        } catch { /* silent */ }
    }, [brandId])

    useEffect(() => { loadNotifications() }, [loadNotifications])

    // Dismiss briefing
    const dismissBriefing = (permanent = false) => {
        setShowBriefing(false)
        sessionStorage.setItem(BRIEFING_SESSION_KEY, 'true')
        if (permanent) {
            fidatoAPI.updatePreferences({ fidatoPopup: false }).catch(() => { })
        }
    }

    // Send message
    const sendMessage = async (text) => {
        const msg = text || input.trim()
        if (!msg || loading) return
        setInput('')
        setMessages(prev => [...prev, { role: 'user', content: msg }])
        setLoading(true)

        try {
            const res = await fidatoAPI.chat(msg, brandId)
            setMessages(prev => [...prev, { role: 'assistant', content: res.reply }])
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'oops, something went wrong! try again? 😊' }])
        }
        setLoading(false)
    }

    const clearChat = async () => {
        try { await fidatoAPI.clear() } catch { /* */ }
        setMessages([{
            role: 'assistant',
            content: activeBrand?.name
                ? `fresh start! 🌸 so what's up with ${activeBrand.name}? anything you wanna discuss?`
                : `fresh start! 🌸 what's on your mind?`
        }])
    }

    // Dynamic suggestions based on active brand
    const suggestions = activeBrand ? [
        `How should I promote ${activeBrand.name}?`,
        'What content should I create this week?',
        'Review my brand DNA and suggest improvements',
        'What are the dos and don\'ts for my brand?',
    ] : [
        'What studios are available?',
        'How do I create a brand?',
        'Explain how Brand DNA works',
        'What can you help me with?',
    ]

    if (!fidatoEnabled) return null

    return (
        <>
            {/* ═══════════ BRIEFING POPUP ═══════════ */}
            {showBriefing && briefing && (
                <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4" onClick={() => dismissBriefing()}>
                    <div className="absolute inset-0 bg-[var(--sys-surface)] " />
                    <div className="relative w-full max-w-md rounded-3xl overflow-hidden animate-fade-in"
                        style={{
                            background: 'var(--sys-primary), rgba(10,10,26,0.99))',
                            border: '1px solid rgba(255, 77, 0, 0.25)',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(255, 77, 0, 0.15)',
                        }}
                        onClick={e => e.stopPropagation()}>

                        {/* Briefing header with animated gradient */}
                        <div className="relative p-6 pb-4 text-center overflow-hidden">
                            <div className="absolute inset-0 opacity-20"
                                style={{ background: 'radial-gradient(circle at 50% 0%, #FF4D00 0%, transparent 70%)' }} />
                            <div className="relative">
                                <div className="size-16 rounded-full mx-auto mb-3 flex items-center justify-center text-[var(--sys-text)] text-2xl"
                                    style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-3xl">support_agent</span>
                                </div>
                                <p className="text-xl font-bold text-[var(--sys-text)]">{briefing.greeting}</p>
                                {activeBrand?.name && (
                                    <p className="text-xs text-[#FF7A00]/60 mt-1">Advising for {activeBrand.name}</p>
                                )}
                            </div>
                        </div>

                        {/* Briefing content */}
                        <div className="px-6 pb-4 space-y-3">
                            {/* Day special */}
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(255, 77, 0,0.08)', border: '1px solid rgba(255, 77, 0,0.12)' }}>
                                <span className="material-symbols-outlined text-[#FF4D00] text-lg mt-0.5">celebration</span>
                                <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{briefing.daySpecial}</p>
                            </div>

                            {/* Brand health */}
                            <div className="rounded-2xl p-3.5 flex items-start gap-3"
                                style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}>
                                <span className="material-symbols-outlined text-primary text-lg mt-0.5">monitoring</span>
                                <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{briefing.brandHealth}</p>
                            </div>

                            {/* Inspiration */}
                            <div className="rounded-2xl p-3.5 text-center"
                                style={{ background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.1)' }}>
                                <p className="text-sm border-[var(--sys-border)] italic leading-relaxed">"{briefing.inspiration}"</p>
                            </div>

                            {/* Quick actions */}
                            {briefing.suggestions?.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {briefing.suggestions.slice(0, 3).map((s, i) => (
                                        <button key={i}
                                            onClick={() => { dismissBriefing(); setOpen(true); setTimeout(() => sendMessage(s), 300) }}
                                            className="px-3 py-1.5 rounded-xl text-[11px] font-medium cursor-pointer transition-all hover:scale-[1.03]"
                                            style={{
                                                background: 'rgba(255, 77, 0,0.1)',
                                                border: '1px solid rgba(255, 77, 0,0.15)',
                                                color: 'rgba(196,181,253,0.9)',
                                            }}>
                                            {s.length > 40 ? s.substring(0, 37) + '...' : s}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-5 pt-2 flex items-center justify-between">
                            <button onClick={() => dismissBriefing(true)}
                                className="text-[11px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] transition-colors cursor-pointer">
                                don't show again
                            </button>
                            <button onClick={() => dismissBriefing()}
                                className="px-5 py-2 rounded-xl text-sm font-bold text-[var(--sys-text)] cursor-pointer transition-all hover:scale-[1.03]"
                                style={{ background: 'var(--sys-primary)' }}>
                                let's go! 🚀
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ FLOATING BUBBLE ═══════════ */}
            <button
                onClick={() => setOpen(!open)}
                className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 active:scale-95"
                style={{
                    background: 'var(--sys-primary)',
                    boxShadow: '0 8px 32px rgba(255, 77, 0, 0.4)',
                }}
                title="Chat with Fidato"
            >
                <span className="material-symbols-outlined text-[var(--sys-text)] text-2xl">{open ? 'close' : 'support_agent'}</span>
                {/* Notification badge */}
                {!open && notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 size-5 rounded-full bg-[var(--sys-surface)] border border-[#0a0a1a] flex items-center justify-center text-[10px] font-bold text-[var(--sys-text)]">
                        {notifications.length}
                    </span>
                )}
                {!open && notifications.length === 0 && (
                    <span className="absolute -top-1 -right-1 size-4 rounded-full bg-[var(--sys-surface)] border border-[#0a0a1a]" />
                )}
            </button>

            {/* ═══════════ CHAT PANEL ═══════════ */}
            {open && (
                <div className="fixed bottom-24 right-6 z-50 w-[400px] max-h-[600px] rounded-2xl overflow-hidden flex flex-col animate-fade-in"
                    style={{
                        background: 'var(--sys-primary), rgba(10,10,26,0.99))',
                        border: '1px solid rgba(255, 77, 0, 0.2)',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(255, 77, 0, 0.1)',
                        backdropFilter: 'blur(24px)',
                    }}>

                    {/* Header */}
                    <div className="p-4 flex items-center gap-3 border-b border-[var(--sys-border)]"
                        style={{ background: 'var(--sys-primary), rgba(236,72,153,0.05))' }}>
                        <div className="relative">
                            <div className="size-10 rounded-full flex items-center justify-center text-[var(--sys-text)] text-lg"
                                style={{ background: 'var(--sys-primary)' }}>
                                <span className="material-symbols-outlined">support_agent</span>
                            </div>
                            <span className="absolute bottom-0 right-0 size-3 rounded-full bg-[var(--sys-surface)] border border-[#0f0f1e]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-[var(--sys-text)]">Fidato</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)] truncate">
                                {activeBrand?.name ? `Branding Expert • ${activeBrand.name}` : 'Your Branding Expert • Always Online'}
                            </p>
                        </div>
                        {notifications.length > 0 && (
                            <button onClick={() => setShowNotifPanel(!showNotifPanel)}
                                className="relative size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary cursor-pointer transition-all"
                                title="Notifications">
                                <span className="material-symbols-outlined text-sm">notifications</span>
                                <span className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-[var(--sys-surface)] text-[8px] text-[var(--sys-text)] flex items-center justify-center font-bold">
                                    {notifications.length}
                                </span>
                            </button>
                        )}
                        <button onClick={clearChat} className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all" title="Clear chat">
                            <span className="material-symbols-outlined text-sm">refresh</span>
                        </button>
                        <button onClick={() => setOpen(false)} className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>

                    {/* Notification panel (slide down) */}
                    {showNotifPanel && notifications.length > 0 && (
                        <div className="border-b border-[var(--sys-border)] max-h-48 overflow-y-auto">
                            {notifications.map((n, i) => (
                                <button key={i}
                                    onClick={() => {
                                        setShowNotifPanel(false)
                                        if (n.action) sendMessage(n.action)
                                    }}
                                    className="w-full text-left px-4 py-2.5 flex items-start gap-2.5 hover:bg-[var(--sys-surface)] transition-colors cursor-pointer border-b border-[var(--sys-border)] last:border-0">
                                    <span className={`material-symbols-outlined text-sm mt-0.5 ${n.severity === 'warning' ? 'text-primary' : 'text-[#FF4D00]'}`}>
                                        {n.severity === 'warning' ? 'warning' : 'info'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed">{n.message}</p>
                                        <p className="text-[10px] text-[#FF4D00] mt-0.5">{n.action} →</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 360 }}>
                        {messages.map((m, i) => (
                            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                {m.role === 'assistant' && (
                                    <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-[var(--sys-text)] text-xs"
                                        style={{ background: 'var(--sys-primary)' }}>
                                        <span className="material-symbols-outlined text-xs">support_agent</span>
                                    </div>
                                )}
                                <div className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user'
                                    ? 'bg-[var(--sys-text)] text-[var(--sys-bg)] rounded-br-sm border border-[var(--sys-border)]'
                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text)] rounded-bl-sm border border-[var(--sys-border)]'
                                    }`}
                                    style={{ whiteSpace: 'pre-wrap' }}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-2.5">
                                <div className="size-7 rounded-full shrink-0 flex items-center justify-center text-[var(--sys-text)] text-xs"
                                    style={{ background: 'var(--sys-primary)' }}>
                                    <span className="material-symbols-outlined text-xs">support_agent</span>
                                </div>
                                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <div className="flex gap-1">
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '150ms' }} />
                                        <span className="size-2 rounded-full bg-[#FF4D00] animate-bounce" style={{ animationDelay: '300ms' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Quick suggestions */}
                    {messages.length <= 1 && (
                        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                            {suggestions.map((q, i) => (
                                <button key={i} onClick={() => sendMessage(q)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#FF4D00]/10 text-[#FF7A00] text-[11px] border border-[#FF4D00]/15 hover:bg-[#FF4D00]/20 cursor-pointer transition-all">
                                    {q}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Input */}
                    <div className="p-3 border-t border-[var(--sys-border)] flex gap-2">
                        <input
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                            placeholder={activeBrand ? `Ask about ${activeBrand.name}...` : 'Ask Fidato anything...'}
                            className="flex-1 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-3.5 py-2.5 text-sm text-[var(--sys-text)] placeholder-[var(--sys-text-muted)] outline-none focus:border-[#FF4D00]/40 transition-all"
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={loading || !input.trim()}
                            className="px-3.5 py-2.5 rounded-xl text-[var(--sys-text)] text-sm font-bold cursor-pointer transition-all disabled:opacity-40 flex items-center"
                            style={{ background: 'var(--sys-primary)' }}
                        >
                            <span className="material-symbols-outlined text-sm">send</span>
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}

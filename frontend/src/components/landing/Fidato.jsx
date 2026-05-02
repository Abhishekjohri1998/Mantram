import { useEffect, useState } from 'react'
import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

const CONVERSATIONS = [
    {
        user: 'Fidato, why is my Diwali campaign underperforming?',
        bot: 'Looking at your last 7 days — CTR dropped 38% on the carousel ad. Most of that decay is in the 25–34 cohort (your buyer base). Two likely reasons: ad fatigue (frequency hit 4.2) and the offer copy doesn\'t match Diwali intent. Quick fix: pause that creative, run the new "5-day countdown" carousel I drafted yesterday + bump budget on the Reels variant. Want me to ship the change?',
    },
    {
        user: 'Mujhe instagram caption chahiye for naya launch',
        bot: 'Got you! Here\'s one in your voice — punchy, hi+en, with that warm-confident tone you do well:\n\n"Naye saal ke saath, naya launch. Lightweight, all-day comfortable, finally something that actually fits Indian humidity. Drop pe pehle access? Link in bio."\n\nWant 3 more variants? Or should I ship this to Content Studio + schedule for tomorrow 7pm?',
    },
    {
        user: 'What should my next 30-day plan look like?',
        bot: 'Quick read on where you are: Diwali wrap-up done, Black Friday ahead, retention engine cooling. I\'d split the month — week 1: BFCM teaser + email warm-up. Week 2: hero launch with creative push. Week 3: nurture + win-back lapsed customers. Week 4: post-mortem + retain.\n\nReady-made 30-day plan opening in Monthly Strategy. Take a look and tell me what to tweak.',
    },
]

/**
 * Fidato section — the human heartbeat of an otherwise technical page.
 * Auto-cycling chat preview shows three representative conversations so
 * visitors instantly grok her tone and capability range.
 */
export default function Fidato() {
    const ref = useReveal()
    const [activeChat, setActiveChat] = useState(0)
    const [typedBot, setTypedBot] = useState('')
    const [showUser, setShowUser] = useState(false)

    // Type out the bot reply char by char so the chat feels alive
    useEffect(() => {
        setTypedBot('')
        setShowUser(false)
        const userTimer = setTimeout(() => setShowUser(true), 200)
        const startTyping = setTimeout(() => {
            const fullText = CONVERSATIONS[activeChat].bot
            let i = 0
            const id = setInterval(() => {
                i++
                setTypedBot(fullText.slice(0, i))
                if (i >= fullText.length) clearInterval(id)
            }, 18)
            return () => clearInterval(id)
        }, 1200)
        const next = setTimeout(() => setActiveChat((c) => (c + 1) % CONVERSATIONS.length), 12000)
        return () => { clearTimeout(userTimer); clearTimeout(startTyping); clearTimeout(next) }
    }, [activeChat])

    return (
        <section ref={ref} id="fidato" className="reveal py-20 md:py-32 relative overflow-hidden" aria-labelledby="fidato-title">
            <div className="absolute inset-0 -z-10 pointer-events-none">
                <div className="absolute top-0 right-0 size-[600px] rounded-full blur-[160px]" style={{ background: `${BRAND.secondary}10` }} />
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6 grid lg:grid-cols-12 gap-10 items-center">
                {/* Left — avatar + copy */}
                <div className="lg:col-span-5">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                        Your AI branding expert
                    </span>
                    <h2 id="fidato-title" className="text-3xl md:text-5xl font-black mt-4 mb-5 leading-tight text-[var(--sys-text)]">
                        Meet <span style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Fidato</span>.
                    </h2>
                    <p className="text-base md:text-lg leading-relaxed mb-8" style={{ color: BRAND.textMuted }}>
                        Italian for <em>"trusted"</em>. She's your always-on AI branding expert — a senior CMO who knows your Brand DNA cold, speaks your language, and never sleeps. Ask her anything: strategy, copy, campaign ideas, brand health.
                    </p>

                    {/* Avatar — abstract cyan-orange gradient orb with breathing animation */}
                    <div className="flex items-center gap-4 mb-8">
                        <div className="relative">
                            <div
                                className="size-20 rounded-full agent-pulse relative overflow-hidden"
                                style={{
                                    background: `radial-gradient(circle at 30% 30%, ${BRAND.secondary}, ${BRAND.primary} 70%)`,
                                    boxShadow: `0 12px 40px ${BRAND.primary}40`,
                                }}
                            >
                                {/* "Eye" — subtle inner highlight */}
                                <div className="absolute top-3 left-3 size-4 rounded-full" style={{ background: 'rgba(255,255,255,0.4)' }} />
                            </div>
                            <div
                                className="absolute -bottom-1 -right-1 size-5 rounded-full flex items-center justify-center"
                                style={{ background: '#10B981', border: `3px solid ${BRAND.bg}` }}
                                aria-label="Online"
                                role="status"
                            />
                        </div>
                        <div>
                            <div className="text-lg font-bold text-[var(--sys-text)]">Fidato</div>
                            <div className="text-xs" style={{ color: '#10B981' }}>● Online · ready when you are</div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {[
                            { icon: 'psychology',  text: 'Knows your Brand DNA cold' },
                            { icon: 'language',    text: 'Speaks Hindi, Marathi, Hinglish, English' },
                            { icon: 'monitoring',  text: 'Watches your brand health, flags issues proactively' },
                        ].map((f, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${BRAND.secondary}10`, border: `1px solid ${BRAND.secondary}30` }}>
                                    <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">{f.icon}</span>
                                </span>
                                <span className="text-sm text-[var(--sys-text)]">{f.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right — chat preview */}
                <div className="lg:col-span-7">
                    <div
                        className="rounded-3xl p-6 md:p-8"
                        style={{
                            background: BRAND.surface,
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
                        }}
                    >
                        {/* Chat header */}
                        <div className="flex items-center gap-3 pb-5 mb-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <div
                                className="size-9 rounded-full"
                                style={{
                                    background: `radial-gradient(circle at 30% 30%, ${BRAND.secondary}, ${BRAND.primary} 70%)`,
                                }}
                            />
                            <div className="flex-1">
                                <div className="text-sm font-bold text-[var(--sys-text)]">Fidato</div>
                                <div className="text-[10px]" style={{ color: '#10B981' }}>● Active now</div>
                            </div>
                            <div className="flex gap-1.5">
                                {CONVERSATIONS.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setActiveChat(i)}
                                        className="size-1.5 rounded-full transition-all cursor-pointer"
                                        style={{
                                            background: i === activeChat ? BRAND.secondary : 'rgba(255,255,255,0.2)',
                                            width: i === activeChat ? '20px' : '6px',
                                        }}
                                        aria-label={`Show conversation ${i + 1}`}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="space-y-4 min-h-[280px]">
                            {/* User message */}
                            {showUser && (
                                <div className="flex justify-end field-unfurl" style={{ animationDelay: '0s', opacity: 0 }}>
                                    <div
                                        className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-md text-sm"
                                        style={{ background: BRAND.primary, color: 'white' }}
                                    >
                                        {CONVERSATIONS[activeChat].user}
                                    </div>
                                </div>
                            )}

                            {/* Bot reply (typing) */}
                            {typedBot && (
                                <div className="flex gap-3">
                                    <div
                                        className="size-7 rounded-full shrink-0 mt-1"
                                        style={{ background: `radial-gradient(circle at 30% 30%, ${BRAND.secondary}, ${BRAND.primary} 70%)` }}
                                    />
                                    <div
                                        className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tl-md text-sm whitespace-pre-line text-[var(--sys-text)]"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                                    >
                                        {typedBot}
                                        <span className="inline-block w-1.5 h-3.5 ml-1 align-middle agent-pulse" style={{ background: BRAND.secondary }} aria-hidden="true" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

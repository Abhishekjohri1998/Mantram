import { useEffect, useState } from 'react'
import { BRAND, STUDIOS, STUDIO_ICONS } from '../../data/studios'

/**
 * The hero "video" — actually a CSS+SVG-animated treatment that loops three
 * narrative beats:
 *   1. Brand DNA scan: logo + cyan grid sweep + fields unfurl
 *   2. Agentic fan-out: studios orbit around the central DNA node
 *   3. Output cascade: a grid of branded outputs settles in
 *
 * Why CSS instead of an .mp4: zero asset weight, infinitely swappable copy,
 * crisp on every viewport, and respects prefers-reduced-motion. We can
 * replace this with a real video later by swapping the component — the
 * surrounding hero layout doesn't change.
 */
const FIELDS = [
    { label: 'voice: warm · witty',     delay: 0.6 },
    { label: 'audience: D2C founders',   delay: 0.9 },
    { label: 'palette: orange · ink',    delay: 1.2 },
    { label: 'language: hi · en',        delay: 1.5 },
    { label: 'tone: confident',          delay: 1.8 },
]

const ORBIT_STUDIOS = STUDIOS.slice(0, 8)

export default function HeroVisual() {
    // Cycle through the three beats. Each beat ~5s, total loop ~15s.
    const [beat, setBeat] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setBeat(b => (b + 1) % 3), 5000)
        return () => clearInterval(id)
    }, [])

    return (
        <div
            className="relative w-full aspect-[16/10] rounded-3xl overflow-hidden"
            style={{
                background: `radial-gradient(ellipse at center, ${BRAND.surface} 0%, ${BRAND.bg} 70%)`,
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 40px 120px rgba(255,77,0,0.12), 0 0 60px rgba(6,182,212,0.08)',
            }}
            role="img"
            aria-label="Mantram AI brand-DNA scan and studio orchestration animation"
        >
            {/* Ambient grid */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.08]" aria-hidden="true">
                <defs>
                    <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke={BRAND.secondary} strokeWidth="0.5" />
                    </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#hero-grid)" />
            </svg>

            {/* Scanning line — visible on beat 0 (Scan) */}
            {beat === 0 && (
                <div
                    className="absolute left-0 right-0 h-12 dna-scan-line"
                    style={{ background: `linear-gradient(180deg, transparent, ${BRAND.secondary}40, transparent)` }}
                    aria-hidden="true"
                />
            )}

            {/* Center stage */}
            <div className="absolute inset-0 flex items-center justify-center">
                {/* Beat 0: Brand-DNA scan */}
                {beat === 0 && (
                    <div className="relative flex flex-col items-center">
                        <div className="relative size-24 mb-8 brand-pulse rounded-3xl">
                            {/* Soft orange + cyan halo behind the logo — gives "energy"
                                without putting a hard frame on top of the already-framed logo. */}
                            <div
                                className="absolute inset-0 rounded-3xl blur-xl"
                                style={{ background: `radial-gradient(circle, ${BRAND.primary}80 0%, ${BRAND.secondary}30 60%, transparent 80%)` }}
                                aria-hidden="true"
                            />
                            <img
                                src="/mantram-logo.png"
                                alt=""
                                className="relative size-24 rounded-3xl"
                                style={{ boxShadow: `0 20px 50px ${BRAND.primary}40` }}
                            />
                        </div>

                        <div className="space-y-2">
                            {FIELDS.map((f, i) => (
                                <div
                                    key={i}
                                    className="px-3 py-1.5 rounded-lg text-xs font-mono field-unfurl"
                                    style={{
                                        background: `${BRAND.secondary}10`,
                                        border: `1px solid ${BRAND.secondary}30`,
                                        color: BRAND.secondary,
                                        animationDelay: `${f.delay}s`,
                                        opacity: 0,
                                    }}
                                >
                                    {f.label}
                                </div>
                            ))}
                        </div>

                        <p className="mt-6 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.textMuted }}>
                            Capturing Brand DNA
                        </p>
                    </div>
                )}

                {/* Beat 1: Agents orbit */}
                {beat === 1 && (
                    <div className="relative size-[400px]">
                        {/* Central node */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="relative size-20 brand-pulse rounded-2xl z-10">
                                <div
                                    className="absolute inset-0 rounded-2xl blur-lg"
                                    style={{ background: `radial-gradient(circle, ${BRAND.primary}80 0%, ${BRAND.secondary}30 60%, transparent 80%)` }}
                                    aria-hidden="true"
                                />
                                <img
                                    src="/mantram-logo.png"
                                    alt=""
                                    className="relative size-20 rounded-2xl"
                                />
                            </div>
                        </div>
                        {/* Orbital rings */}
                        <div className="absolute inset-0 rounded-full" style={{ border: `1px dashed ${BRAND.secondary}30` }} />
                        <div className="absolute inset-8 rounded-full" style={{ border: `1px dashed ${BRAND.secondary}20` }} />

                        {/* Studio chips orbiting */}
                        {ORBIT_STUDIOS.map((s, i) => {
                            const angle = (i / ORBIT_STUDIOS.length) * 360
                            return (
                                <div
                                    key={s.slug}
                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                        transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-180px) rotate(-${angle}deg)`,
                                    }}
                                >
                                    <div
                                        className="px-3 py-2 rounded-xl flex items-center gap-2 agent-pulse field-unfurl"
                                        style={{
                                            background: BRAND.surface,
                                            border: `1px solid ${BRAND.secondary}40`,
                                            animationDelay: `${0.1 * i}s`,
                                            opacity: 0,
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-sm" style={{ color: BRAND.secondary }} aria-hidden="true">
                                            {STUDIO_ICONS[s.slug]}
                                        </span>
                                        <span className="text-[10px] font-semibold text-[var(--sys-text)]">{s.name.replace(' Studio', '').replace(' Marketing', '')}</span>
                                    </div>
                                </div>
                            )
                        })}

                        <p className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-[0.3em] whitespace-nowrap" style={{ color: BRAND.textMuted }}>
                            14 Agentic Studios · Active
                        </p>
                    </div>
                )}

                {/* Beat 2: Output cascade */}
                {beat === 2 && (
                    <div className="relative">
                        <div className="grid grid-cols-3 gap-3 max-w-md">
                            {[
                                { type: 'caption', label: 'Insta caption', icon: 'tag', primary: true },
                                { type: 'creative', label: 'Ad creative', icon: 'image' },
                                { type: 'video', label: 'Video', icon: 'play_circle' },
                                { type: 'thumb', label: 'YT thumbnail', icon: 'image' },
                                { type: 'email', label: 'Email', icon: 'mail' },
                                { type: 'plan', label: '30-day plan', icon: 'calendar_month', primary: true },
                            ].map((o, i) => (
                                <div
                                    key={i}
                                    className="aspect-square rounded-xl flex flex-col items-center justify-center gap-2 field-unfurl"
                                    style={{
                                        background: o.primary ? `${BRAND.primary}15` : `${BRAND.secondary}10`,
                                        border: `1px solid ${o.primary ? BRAND.primary : BRAND.secondary}40`,
                                        animationDelay: `${0.15 * i}s`,
                                        opacity: 0,
                                    }}
                                >
                                    <span className="material-symbols-outlined text-2xl" style={{ color: o.primary ? BRAND.primary : BRAND.secondary }} aria-hidden="true">{o.icon}</span>
                                    <span className="text-[10px] font-semibold text-center px-1" style={{ color: o.primary ? BRAND.primary : BRAND.secondary }}>{o.label}</span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-8 text-xs font-bold uppercase tracking-[0.3em] text-center" style={{ color: BRAND.textMuted }}>
                            On-Brand. Every output.
                        </p>
                    </div>
                )}
            </div>

            {/* Beat indicator dots */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5" aria-hidden="true">
                {[0, 1, 2].map(i => (
                    <div
                        key={i}
                        className="size-1.5 rounded-full transition-all duration-500"
                        style={{
                            background: i === beat ? BRAND.primary : 'rgba(255,255,255,0.2)',
                            width: i === beat ? '20px' : '6px',
                        }}
                    />
                ))}
            </div>
        </div>
    )
}

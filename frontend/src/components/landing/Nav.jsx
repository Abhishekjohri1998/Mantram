import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../../data/studios'

/**
 * Sticky landing navigation. Goes from transparent to backdrop-blur on scroll.
 * Two CTAs in the top-right mirror the hero buttons so visitors can convert
 * from any scroll depth.
 */
export default function Nav({ onEarlyAccess, onAgencyDemo, isAuthenticated }) {
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 24)
        window.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

    return (
        <nav
            className="sticky top-0 z-50 w-full transition-all duration-300"
            style={{
                background: scrolled ? `${BRAND.bg}cc` : 'transparent',
                backdropFilter: scrolled ? 'blur(20px)' : 'none',
                borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
            }}
            aria-label="Primary navigation"
        >
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2.5" aria-label="Mantram AI home">
                    <img src="/mantram-logo.png" alt="" className="size-9 rounded-xl" width="36" height="36" />
                    <span className="text-[var(--sys-text)] text-xl font-bold tracking-tight">
                        Mantram <span style={{ color: BRAND.primary }}>AI</span>
                    </span>
                </Link>

                <div className="hidden md:flex items-center gap-8 text-sm">
                    <button onClick={() => scrollTo('studios')} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Studios</button>
                    <button onClick={() => scrollTo('brand-dna')} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Brand DNA</button>
                    <button onClick={() => scrollTo('fidato')} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Fidato</button>
                    <button onClick={() => scrollTo('pricing')} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Pricing</button>
                </div>

                <div className="flex items-center gap-2">
                    {isAuthenticated ? (
                        <Link
                            to="/dashboard"
                            className="text-sm font-bold py-2.5 px-5 rounded-full transition-all hover:scale-105 cursor-pointer"
                            style={{ background: BRAND.primary, color: 'white' }}
                        >
                            Open Dashboard
                        </Link>
                    ) : (
                        <>
                            <button
                                onClick={onAgencyDemo}
                                className="hidden sm:inline-flex text-sm font-semibold py-2.5 px-5 rounded-full transition-all hover:scale-105 cursor-pointer"
                                style={{ color: BRAND.secondary, border: `1px solid ${BRAND.secondary}40` }}
                            >
                                For Agencies
                            </button>
                            <button
                                onClick={onEarlyAccess}
                                className="text-sm font-bold py-2.5 px-5 rounded-full transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                style={{ background: BRAND.primary, color: 'white' }}
                            >
                                Get Early Access
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    )
}

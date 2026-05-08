import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BRAND } from '../../data/studios'

/**
 * Sticky landing navigation. Goes from transparent to backdrop-blur on scroll.
 * Two CTAs in the top-right mirror the hero buttons so visitors can convert
 * from any scroll depth.
 */
export default function Nav({ onAgencyDemo, isAuthenticated }) {
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

                <div className="hidden lg:flex items-center gap-6 text-[13px] font-medium">
                    <button onClick={() => scrollTo('studios')} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">Studios</button>
                    <button onClick={() => scrollTo('templates')} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">Templates</button>
                    <button onClick={() => scrollTo('how-it-works')} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">How it works</button>
                    <button onClick={() => scrollTo('case-studies')} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">Case Studies</button>
                    <button onClick={() => scrollTo('pricing')} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">Pricing</button>
                    <button onClick={onAgencyDemo} className="text-[#a1a1aa] hover:text-white transition-colors cursor-pointer">For Agencies</button>
                </div>

                <div className="flex items-center gap-4">
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
                            <Link
                                to="/login"
                                className="hidden sm:inline-flex text-[13px] font-medium transition-colors hover:text-white cursor-pointer"
                                style={{ color: '#a1a1aa' }}
                            >
                                Sign in
                            </Link>
                            <Link
                                to="/auth?mode=signup"
                                className="hidden sm:inline-flex text-[13px] font-medium py-2 px-4 rounded-full transition-all hover:bg-white/5 cursor-pointer"
                                style={{ color: 'white', border: `1px solid rgba(255,255,255,0.15)` }}
                            >
                                Request Access
                            </Link>
                            <Link
                                to="/auth?mode=signup"
                                className="text-[13px] font-bold py-2 px-5 rounded-full transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                                style={{ background: BRAND.primary, color: 'white' }}
                            >
                                Book a Demo <span aria-hidden="true">→</span>
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    )
}

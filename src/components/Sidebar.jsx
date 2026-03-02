import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { credits as creditsAPI } from '../services/api'

const navItems = [
    { icon: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { icon: 'psychology', label: 'Brainstorm Studio', to: '/brainstorm' },
    { icon: 'edit_note', label: 'Content Studio', to: '/content-studio' },
    { icon: 'auto_fix_high', label: 'Creative Studio', to: '/creative-studio' },
    { icon: 'movie', label: 'Video Studio', to: '/video-studio' },
    { icon: 'calendar_month', label: 'Smart Calendar', to: '/smart-calendar' },
    { icon: 'send', label: 'Publish & Schedule', to: '/publish' },
    { icon: 'forum', label: 'Conversation Studio', to: '/conversations' },
    { icon: 'travel_explore', label: 'SEO Studio', to: '/seo-studio' },
    { icon: 'monitoring', label: 'Ad Studio', to: '/performance-marketing' },
]

const bottomItems = [
    { icon: 'badge', label: 'Brand Profiles', to: '/brand-dna' },
    { icon: 'electrical_services', label: 'Integrations', to: '/integrations' },
    { icon: 'settings', label: 'Settings', to: '/team' },
]

export default function Sidebar({ mobileOpen, onClose }) {
    const { user } = useAuth()
    const [creditBalance, setCreditBalance] = useState(null)

    // Fetch credit balance
    useEffect(() => {
        async function fetchCredits() {
            try {
                const data = await creditsAPI.balance()
                setCreditBalance(data)
            } catch { /* ignore */ }
        }
        if (user) fetchCredits()
        const interval = setInterval(fetchCredits, 2 * 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    // Close sidebar on route change (mobile)
    const handleNavClick = () => {
        if (onClose) onClose()
    }

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape' && mobileOpen) onClose?.() }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [mobileOpen, onClose])

    // Prevent body scroll when mobile sidebar is open
    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [mobileOpen])

    const isSuperAdmin = user?.role === 'superadmin'

    const sidebarContent = (
        <>
            {/* Logo */}
            <div className="p-4 lg:p-6 flex items-center gap-3">
                <div className="size-10 rounded-xl overflow-hidden flex-shrink-0 shadow-lg shadow-primary/20">
                    <img src="/mantram-logo.png" alt="Mantram AI" className="size-10" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-lg font-bold leading-tight text-white truncate">Mantram AI</h1>
                    <p className="text-sm text-slate-500 uppercase tracking-widest font-semibold">Brand OS</p>
                </div>
                {/* Close button on mobile */}
                <button
                    onClick={onClose}
                    className="lg:hidden ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                >
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            {/* Main Nav */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
                <p className="px-3 pt-4 pb-2 text-xs text-slate-600 uppercase tracking-widest font-bold">Create</p>
                {navItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                ? 'bg-primary/10 text-primary shadow-sm'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            }`
                        }
                    >
                        <span className="material-symbols-outlined text-xl">{item.icon}</span>
                        <span>{item.label}</span>
                    </NavLink>
                ))}

                <div className="my-4 mx-3 border-t border-white/[0.06]" />
                <p className="px-3 pb-2 text-xs text-slate-600 uppercase tracking-widest font-bold">Manage</p>
                {bottomItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                ? 'bg-primary/10 text-primary shadow-sm'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            }`
                        }
                    >
                        <span className="material-symbols-outlined text-xl">{item.icon}</span>
                        <span>{item.label}</span>
                    </NavLink>
                ))}

                {/* Super Admin Link */}
                {isSuperAdmin && (
                    <>
                        <div className="my-4 mx-3 border-t border-amber-500/20" />
                        <NavLink
                            to="/superadmin"
                            onClick={handleNavClick}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'bg-amber-500/10 text-amber-400 shadow-sm'
                                    : 'text-amber-400/60 hover:bg-amber-500/5 hover:text-amber-400'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-xl">shield_person</span>
                            <span>Super Admin</span>
                        </NavLink>
                    </>
                )}
            </nav>

            {/* Credits Display */}
            {creditBalance && !creditBalance.unlimited && (
                <div className="px-4 pb-2">
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm text-slate-500 font-bold uppercase">Credits</span>
                            <span className="text-base font-bold text-white">{creditBalance.remaining}/{creditBalance.total}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${creditBalance.remaining / creditBalance.total > 0.5 ? 'bg-emerald-500' :
                                creditBalance.remaining / creditBalance.total > 0.2 ? 'bg-amber-500' : 'bg-rose-500'
                                }`} style={{ width: `${Math.min(100, (creditBalance.remaining / creditBalance.total) * 100)}%` }} />
                        </div>
                    </div>
                </div>
            )}

            {/* New Project CTA */}
            <div className="p-4">
                <NavLink
                    to="/onboarding"
                    onClick={handleNavClick}
                    className="w-full py-3 px-4 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-light transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New Brand
                </NavLink>
            </div>
        </>
    )

    return (
        <>
            {/* ── Desktop Sidebar (lg+) ── */}
            <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-white/[0.06] bg-[#080a14] z-20 h-screen sticky top-0">
                {sidebarContent}
            </aside>

            {/* ── Mobile Sidebar Drawer (< lg) ── */}
            {/* Backdrop overlay */}
            <div
                className={`lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                onClick={onClose}
            />
            {/* Sliding drawer */}
            <aside
                className={`lg:hidden fixed top-0 left-0 h-full w-72 flex flex-col bg-[#080a14] border-r border-white/[0.06] z-50 transform transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {sidebarContent}
            </aside>
        </>
    )
}

import { NavLink } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

const navItems = [
    { icon: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { icon: 'psychology', label: 'Brainstorm Studio', to: '/brainstorm', studioKey: 'brainstormStudio' },
    { icon: 'edit_note', label: 'Content Studio', to: '/content-studio', studioKey: 'contentStudio' },
    { icon: 'auto_fix_high', label: 'Creative Studio', to: '/creative-studio', studioKey: 'creativeStudio' },
    { icon: 'draw', label: 'AI Canvas', to: '/ai-canvas', studioKey: 'creativeStudio' },
    { icon: 'movie', label: 'Video Studio', to: '/video-studio', studioKey: 'videoStudio' },
    { icon: 'share', label: 'Social Media Studio', to: '/social-media-studio', studioKey: 'socialMediaStudio', superAdminOnly: true },
    { icon: 'forum', label: 'Conversation Studio', to: '/conversations', studioKey: 'conversationStudio', superAdminOnly: true },
    { icon: 'travel_explore', label: 'SEO Studio', to: '/seo-studio', studioKey: 'seoStudio' },
    { icon: 'monitoring', label: 'Performance Studio', to: '/performance-marketing', studioKey: 'adStudio' },
    { icon: 'filter_alt', label: 'Funnel Studio', to: '/funnel-studio', studioKey: 'funnelStudio', superAdminOnly: true },
    { icon: 'storefront', label: 'D2C Studio', to: '/d2c-analytics', studioKey: 'd2cAnalytics', superAdminOnly: true },
    { icon: 'loyalty', label: 'Retention Studio', to: '/retention-studio', studioKey: 'retentionStudio', superAdminOnly: true },
    { icon: 'auto_awesome', label: 'Skills Hub', to: '/skills', studioKey: 'skillsHub' },
]

const bottomItems = [
    { icon: 'cases', label: 'Brand Manager', to: '/brands' },
    { icon: 'electrical_services', label: 'Integrations', to: '/integrations' },
    { icon: 'settings', label: 'Settings', to: '/settings' },
]

function filterNavByAccess(items, studioAccess, isSuperAdmin) {
    return items.filter(item => {
        if (item.superAdminOnly && !isSuperAdmin) return false
        if (!studioAccess) return true
        if (!item.studioKey) return true
        return studioAccess[item.studioKey] !== false
    })
}

export default function Sidebar({ mobileOpen, onClose }) {
    const { user } = useAuth()

    const handleNavClick = () => { if (onClose) onClose() }

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape' && mobileOpen) onClose?.() }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [mobileOpen, onClose])

    useEffect(() => {
        if (mobileOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [mobileOpen])

    const isSuperAdmin = user?.role?.trim() === 'superadmin'

    const sidebarContent = (
        <>
            {/* ── Antigravity Logo / Wordmark ── */}
            <div className="p-5 flex items-center gap-3 border-b border-outline-variant/10">
                <div className="size-9 rounded-xl overflow-hidden flex-shrink-0 molten-glow">
                    <img src="/mantram-logo.png" alt="Mantram AI" className="size-9" />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-base font-bold leading-tight text-white truncate tracking-tight font-headline">
                        Mantram<span className="text-primary-fixed">.</span><span className="text-primary-fixed">AI</span>
                    </h1>
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary-fixed/50">Brand OS</p>
                </div>
                {/* Mobile close */}
                <button
                    onClick={onClose}
                    className="lg:hidden p-1.5 rounded-lg heavy-in-soft-out text-outline-variant hover:text-white hover:bg-white/5 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-xl">close</span>
                </button>
            </div>

            {/* ── Main Nav ── */}
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto custom-scrollbar">
                <p className="px-3 pt-2 pb-2 text-[9px] uppercase tracking-[0.2em] font-black text-outline-variant/40 font-mono">Create</p>
                {filterNavByAccess(navItems, user?.studioAccess, isSuperAdmin).map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer group relative ${
                                isActive
                                    ? 'bg-primary-fixed/10 text-primary-fixed border-r-2 border-primary-fixed'
                                    : 'text-outline-variant hover:text-on-surface-variant hover:bg-white/5'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-primary-fixed' : 'group-hover:text-tertiary'}`}>{item.icon}</span>
                                <span className="truncate text-xs uppercase tracking-widest font-label">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}

                <div className="my-3 mx-2 border-t border-outline-variant/10" />
                <p className="px-3 pb-2 text-[9px] uppercase tracking-[0.2em] font-black text-outline-variant/40 font-mono">Manage</p>
                {bottomItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer relative ${
                                isActive
                                    ? 'bg-primary-fixed/10 text-primary-fixed border-r-2 border-primary-fixed'
                                    : 'text-outline-variant hover:text-on-surface-variant hover:bg-white/5'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-primary-fixed' : 'group-hover:text-tertiary'}`}>{item.icon}</span>
                                <span className="truncate text-xs uppercase tracking-widest font-label">{item.label}</span>
                            </>
                        )}
                    </NavLink>
                ))}

                {/* Super Admin Link */}
                {isSuperAdmin && (
                    <>
                        <div className="my-3 mx-2 border-t border-primary-fixed/15" />
                        <NavLink
                            to="/superadmin"
                            onClick={handleNavClick}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer relative ${isActive
                                    ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20'
                                    : 'text-amber-400/40 hover:text-amber-400 border border-transparent'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-[20px] flex-shrink-0">shield_person</span>
                            <span>Super Admin</span>
                        </NavLink>
                    </>
                )}
            </nav>

            {/* ── Bottom CTA + Plan indicator ── */}
            <div className="p-3 space-y-2 border-t border-outline-variant/10">
                <NavLink
                    to="/onboarding"
                    onClick={handleNavClick}
                    className="w-full py-3 px-4 bg-primary-fixed-dim text-black text-xs font-bold uppercase tracking-tighter rounded-lg heavy-in-soft-out transition-all flex items-center justify-center gap-2 cursor-pointer molten-glow font-headline active:scale-95"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New Brand
                </NavLink>

                {/* Plan Indicator */}
                {!isSuperAdmin && (
                    <div className="px-3 py-2.5 rounded-lg flex items-center justify-between bg-white/[0.02] border border-outline-variant/10">
                        <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-outline-variant/40 font-mono">Current Plan</p>
                            <p className="text-xs font-semibold text-on-surface-variant truncate capitalize">{user?.plan || 'Free'} Tier</p>
                        </div>
                        <NavLink to="/credits" className="px-2 py-1 rounded-lg text-[10px] font-black uppercase heavy-in-soft-out whitespace-nowrap bg-primary-fixed/10 text-primary-fixed border border-primary-fixed/20 hover:bg-primary-fixed/20">
                            Upgrade
                        </NavLink>
                    </div>
                )}
            </div>
        </>
    )

    return (
        <>
            {/* ── Desktop Sidebar (lg+) ── */}
            <aside
                className="hidden lg:flex w-64 flex-shrink-0 flex-col h-screen fixed top-0 left-0 z-20 bg-[#0e0e12] border-r border-outline-variant/10 backdrop-blur-xl"
            >
                {sidebarContent}
            </aside>

            {/* ── Mobile Sidebar Drawer (< lg) ── */}
            <div
                className={`lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <aside
                className={`lg:hidden fixed top-0 left-0 h-full w-72 flex flex-col z-50 transform heavy-in-soft-out transition-transform duration-300 bg-[#0e0e12] border-r border-outline-variant/10 backdrop-blur-xl ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {sidebarContent}
            </aside>
        </>
    )
}

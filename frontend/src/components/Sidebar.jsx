import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useSidebar } from './DashboardLayout'

const navItems = [
    { icon: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { icon: 'psychology', label: 'Brainstorm Studio', to: '/brainstorm', studioKey: 'brainstormStudio' },
    { icon: 'edit_note', label: 'Content Studio', to: '/content-studio', studioKey: 'contentStudio' },
    { icon: 'auto_fix_high', label: 'Creative Studio', to: '/creative-studio', studioKey: 'creativeStudio' },
    { icon: 'draw', label: 'AI Canvas', to: '/ai-canvas', studioKey: 'creativeStudio' },
    { icon: 'movie', label: 'Video Studio', to: '/video-studio', studioKey: 'videoStudio' },
    { icon: 'share', label: 'Social Media Studio', to: '/social-media-studio', studioKey: 'socialMediaStudio' },
    { icon: 'forum', label: 'Conversation Studio', to: '/conversations', studioKey: 'conversationStudio' },
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
        if (isSuperAdmin) return true
        if (!studioAccess) return true
        if (!item.studioKey) return true
        return studioAccess[item.studioKey] !== false
    })
}

export default function Sidebar({ mobileOpen, onClose }) {
    const { user } = useAuth()
    const { isCollapsed, setIsCollapsed } = useSidebar()

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

    // --- Core Theme Logic ---
    const [themeVal, setThemeVal] = useState(() => localStorage.getItem('mantram-theme') || 'auto');

    useEffect(() => {
        localStorage.setItem('mantram-theme', themeVal);
        
        const updateClass = (isLight) => {
            if (isLight) document.documentElement.classList.add('theme-light');
            else document.documentElement.classList.remove('theme-light');
        };

        if (themeVal === 'auto') {
            const mql = window.matchMedia('(prefers-color-scheme: light)');
            updateClass(mql.matches);
            const listener = (e) => updateClass(e.matches);
            mql.addEventListener('change', listener);
            return () => mql.removeEventListener('change', listener);
        } else {
            updateClass(themeVal === 'light');
        }
    }, [themeVal]);

    const isSuperAdmin = user?.role?.trim() === 'superadmin'

    const sidebarContent = (
        <>
            {/* ── Main Nav ── */}
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto custom-scrollbar">
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between px-3'} pt-1 pb-2 mb-1 border-b border-[var(--sys-border)]`}>
                    {!isCollapsed && <p className="text-[9px] uppercase tracking-[0.2em] font-black text-[var(--sys-text-muted)] font-mono">Create</p>}
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer hidden lg:flex items-center justify-center" title="Toggle Sidebar">
                        <span className="material-symbols-outlined text-[18px]">{isCollapsed ? 'menu_open' : 'keyboard_double_arrow_left'}</span>
                    </button>
                    {/* Mobile close */}
                    <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>
                {filterNavByAccess(navItems, user?.studioAccess, isSuperAdmin).map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        title={isCollapsed ? item.label : undefined}
                        className={({ isActive }) =>
                            `flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer group relative ${
                                isActive
                                    ? 'bg-primary-fixed/10 text-primary-fixed border-r-2 border-primary-fixed'
                                    : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-primary-fixed' : 'group-hover:text-tertiary'}`}>{item.icon}</span>
                                {!isCollapsed && <span className="truncate text-xs uppercase tracking-widest font-label">{item.label}</span>}
                            </>
                        )}
                    </NavLink>
                ))}

                <div className="my-3 mx-2 border-t border-[var(--sys-border)]" />
                {!isCollapsed && <p className="px-3 pb-2 text-[9px] uppercase tracking-[0.2em] font-black text-[var(--sys-text-muted)] font-mono">Manage</p>}
                {bottomItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
                        onClick={handleNavClick}
                        title={isCollapsed ? item.label : undefined}
                        className={({ isActive }) =>
                            `flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer relative ${
                                isActive
                                    ? 'bg-primary-fixed/10 text-primary-fixed border-r-2 border-primary-fixed'
                                    : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${isActive ? 'text-primary-fixed' : 'group-hover:text-tertiary'}`}>{item.icon}</span>
                                {!isCollapsed && <span className="truncate text-xs uppercase tracking-widest font-label">{item.label}</span>}
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
                            title={isCollapsed ? "Super Admin" : undefined}
                            className={({ isActive }) =>
                                `flex items-center ${isCollapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2.5'} rounded-lg text-[13px] font-medium heavy-in-soft-out transition-all duration-300 cursor-pointer relative ${isActive
                                    ? 'text-primary bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]'
                                    : 'text-primary/40 hover:text-primary border border-transparent'
                                }`
                            }
                        >
                            <span className="material-symbols-outlined text-[20px] flex-shrink-0">shield_person</span>
                            {!isCollapsed && <span>Super Admin</span>}
                        </NavLink>
                    </>
                )}
            </nav>

            {/* ── Bottom CTA + Plan indicator ── */}
            <div className={`p-3 space-y-2 border-t border-[var(--sys-border)] flex flex-col ${isCollapsed ? 'items-center px-1' : ''}`}>
                {/* New Brand Action - Only for Managers and above */}
                {user?.role !== 'member' && (
                    <NavLink
                        to="/onboarding"
                        onClick={handleNavClick}
                        title={isCollapsed ? "New Brand" : undefined}
                        className={`bg-primary text-white text-xs font-bold uppercase tracking-tighter rounded-lg heavy-in-soft-out transition-all flex items-center justify-center gap-2 cursor-pointer font-headline active:scale-95 ${isCollapsed ? 'w-10 h-10 p-0 rounded-full' : 'w-full py-3 px-4'}`}
                    >
                        <span className="material-symbols-outlined text-sm">add</span>
                        {!isCollapsed && "New Brand"}
                    </NavLink>
                )}

                {/* Theme Toggle */}
                {!isCollapsed && (
                    <div className="flex bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-lg p-1 mt-2">
                        <button onClick={() => setThemeVal('light')} title="Light Mode"
                            className={`flex-1 py-1.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${themeVal === 'light' ? 'bg-[var(--sys-border)] text-primary shadow-sm' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                            <span className="material-symbols-outlined text-[16px]">light_mode</span>
                        </button>
                        <button onClick={() => setThemeVal('dark')} title="Dark Mode"
                            className={`flex-1 py-1.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${themeVal === 'dark' ? 'bg-[var(--sys-border)] text-primary shadow-sm' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                            <span className="material-symbols-outlined text-[16px]">dark_mode</span>
                        </button>
                        <button onClick={() => setThemeVal('auto')} title="Auto (System Default)"
                            className={`flex-1 py-1.5 rounded-md flex items-center justify-center transition-all cursor-pointer ${themeVal === 'auto' ? 'bg-[var(--sys-border)] text-primary shadow-sm' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                            <span className="material-symbols-outlined text-[16px]">hdr_auto</span>
                        </button>
                    </div>
                )}

                {/* Plan Indicator */}
                {!isSuperAdmin && !isCollapsed && (
                    <div className="px-3 py-2.5 rounded-lg flex items-center justify-between bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] leading-none mb-1 text-[var(--sys-text-muted)] font-mono">Current Plan</p>
                            <p className="text-xs font-semibold text-[var(--sys-text-muted)] truncate capitalize">{user?.plan || 'Free'} Tier</p>
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
                className={`hidden lg:flex flex-shrink-0 flex-col h-screen fixed top-0 left-0 pt-16 z-20 bg-[var(--sys-bg)] border-r border-[var(--sys-border)] transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}
            >
                {sidebarContent}
            </aside>

            {/* ── Mobile Sidebar Drawer (< lg) ── */}
            <div
                className={`lg:hidden fixed inset-0 bg-[var(--sys-surface)] z-40 transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />
            <aside
                className={`lg:hidden fixed top-0 left-0 h-full w-72 pt-16 flex flex-col z-50 transform heavy-in-soft-out transition-transform duration-300 bg-[var(--sys-bg)] border-r border-[var(--sys-border)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {sidebarContent}
            </aside>
        </>
    )
}

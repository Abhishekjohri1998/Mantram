import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSidebar } from './DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { useCredits } from '../context/CreditContext'
import { superadmin } from '../services/api'
import { useUI } from '../context/UIContext'
import NotificationPanel from './NotificationPanel'
import './Header.css'

export default function Header({ title, subtitle, onMenuToggle }) {
    const { user, logout } = useAuth()
    const { brands, activeBrand, selectBrand, getActiveJobs } = useBrand()
    const { balance: creditBalance } = useCredits()
    const navigate = useNavigate()
    const location = useLocation()
    const [showMenu, setShowMenu] = useState(false)
    const [showBrandMenu, setShowBrandMenu] = useState(false)
    const { fidatoOpen, toggleFidato, intelMissionCount, refreshIntelCount, unreadCount, fetchNotifications } = useUI()
    const { isCollapsed, setIsCollapsed, globalCalendarOpen, setGlobalCalendarOpen } = useSidebar()
    const [platformBudgets, setPlatformBudgets] = useState(null)
    const [resumeJobs, setResumeJobs] = useState([])
    const [showNotifPanel, setShowNotifPanel] = useState(false)
    const menuRef = useRef(null)
    const brandMenuRef = useRef(null)
    const notifBtnRef = useRef(null)

    // Close menus on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
            if (brandMenuRef.current && !brandMenuRef.current.contains(e.target)) setShowBrandMenu(false)
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Check for resumable jobs when brand changes
    useEffect(() => {
        if (!activeBrand?._id || !getActiveJobs) return
        const jobs = getActiveJobs()
        setResumeJobs(jobs)
        if (jobs.length > 0) {
            console.log(`🔄 Brand "${activeBrand.name}" has ${jobs.length} resumable job(s):`, jobs)
        }
    }, [activeBrand?._id])

    useEffect(() => { refreshIntelCount(activeBrand?._id) }, [activeBrand?._id, refreshIntelCount])

    // Fetch notifications on mount + when bell opens
    useEffect(() => { fetchNotifications() }, [activeBrand?._id])

    const handleLogout = () => {
        logout()
        navigate('/auth')
    }

    // Handle brand switch — BrandContext handles saving + restoring page
    const handleBrandSelect = (brand) => {
        selectBrand(brand)
        setShowBrandMenu(false)
    }

    const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

    const creditPercent = creditBalance && !creditBalance.unlimited
        ? Math.min(100, (creditBalance.remaining / creditBalance.total) * 100)
        : 100
    const creditColor = creditPercent > 50 ? 'emerald' : creditPercent > 20 ? 'amber' : 'rose'

    // Fetch platform budgets only for superadmins
    useEffect(() => {
        if (user?.role === 'superadmin') {
            const fetchBudgets = async () => {
                try {
                    const data = await superadmin.getProviderBudgets()
                    if (data.success) setPlatformBudgets(data.budgets)
                } catch (err) {
                    console.error('Failed to fetch platform budgets:', err)
                }
            }
            fetchBudgets()
            const timer = setInterval(fetchBudgets, 30 * 60 * 1000)
            return () => clearInterval(timer)
        }
    }, [user])

    const showWarning = creditBalance && !creditBalance.unlimited && creditBalance.remaining <= 15 && creditBalance.remaining > 0
    const showConsumed = creditBalance && !creditBalance.unlimited && creditBalance.remaining === 0

    const getPlatformAlerts = () => {
        if (!platformBudgets) return []
        return Object.entries(platformBudgets).map(([id, p]) => {
            const percentUsed = (p.consumed / p.budget) * 100
            if (percentUsed >= 100) return { id, level: 'critical', provider: id, percentUsed: Math.round(percentUsed) }
            if (percentUsed >= 80) return { id, level: 'warning', provider: id, percentUsed: Math.round(percentUsed) }
            return null
        }).filter(Boolean)
    }
    const platformAlerts = getPlatformAlerts()

    return (
        <>
            <div className="hdr-wrapper">
            {/* Admin Platform Alerts */}
            {platformAlerts.map(alert => (
                <div key={`admin-alert-${alert.id}`} className="hdr-alert-banner" style={{ borderColor: 'var(--sys-border)' }}>
                    <span className={`material-symbols-outlined text-sm ${alert.level === 'critical' ? 'text-primary' : 'text-primary'}`}>
                        {alert.level === 'critical' ? 'dangerous' : 'warning'}
                    </span>
                    <p style={{ color: 'var(--sys-text)' }}>
                        <span className="uppercase font-bold">{alert.provider}</span> Platform {alert.level === 'critical' ? 'EXHAUSTED' : 'Credits Low'} ({alert.percentUsed}% consumed). Please recharge the API account.
                    </p>
                    <button
                        onClick={() => navigate('/superadmin')}
                        className="hdr-alert-btn"
                    >
                        Manage
                    </button>
                </div>
            ))}

            {/* Credit Warning Banners */}
            {showWarning && (
                <div className="hdr-alert-banner">
                    <span className="material-symbols-outlined text-primary text-lg">warning</span>
                    <p style={{ color: 'var(--sys-text)' }}>
                        Your credits are going to expire soon (only <span className="font-bold">{creditBalance.remaining}</span> left). Please buy more to keep using the agentic studios.
                    </p>
                    <button onClick={() => navigate('/credits')} className="hdr-banner-credit-btn primary">
                        Buy More
                    </button>
                </div>
            )}
            {showConsumed && (
                <div className="hdr-alert-banner">
                    <span className="material-symbols-outlined text-primary text-lg">error</span>
                    <p style={{ color: 'var(--sys-text)' }}>
                        All credits consumed! You cannot perform any more AI operations until you top up.
                    </p>
                    <button onClick={() => navigate('/credits')} className="hdr-banner-credit-btn">
                        Top Up Now
                    </button>
                </div>
            )}

            {/* Resume Banner */}
            {resumeJobs.length > 0 && (
                <div className="hdr-banner-resume">
                    <span className="animate-spin material-symbols-outlined text-[#FF4D00] text-lg">refresh</span>
                    <p>
                        <span className="font-bold">{resumeJobs.length}</span> job{resumeJobs.length > 1 ? 's are' : ' is'} still processing for <span className="font-bold">{activeBrand?.name}</span>.
                    </p>
                    {resumeJobs[0]?.page && (
                        <button onClick={() => navigate(resumeJobs[0].page)}>
                            Resume
                        </button>
                    )}
                </div>
            )}

            <header className="hdr-main">
                <div className="hdr-left">
                    <div className="hdr-logo-group">
                        <img src="/mantram-logo.png" alt="Mantram AI" className="hdr-logo-img" />
                        <div className="hdr-logo-text">Mantram.AI</div>
                    </div>
                    {/* Hamburger — visible on mobile/tablet */}
                    <button
                        onClick={onMenuToggle}
                        className="hdr-hamburger"
                    >
                        <span className="material-symbols-outlined text-xl">menu</span>
                    </button>

                    {title && (
                        <div className="hdr-title-group">
                            <h1 className="hdr-title">{title}</h1>
                            {subtitle && <p className="hdr-subtitle">{subtitle}</p>}
                        </div>
                    )}
                </div>
                
                <div className="hdr-right">
                    {/* Global Brand Switcher */}
                    {brands.length > 0 && (
                        <div className="relative" ref={brandMenuRef}>
                            <button
                                onClick={() => setShowBrandMenu(!showBrandMenu)}
                                className="hdr-brand-btn group"
                                title={`Active brand: ${activeBrand?.name || 'None'}`}
                            >
                                <div className="hdr-brand-avatar"
                                    style={{ background: activeBrand?.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                    {activeBrand?.name?.charAt(0) || '?'}
                                </div>
                                <span className="hdr-brand-name">
                                    {activeBrand?.name || 'Select Brand'}
                                </span>
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm hdr-hide-mobile">unfold_more</span>
                            </button>

                            {showBrandMenu && (
                                <div className="hdr-dropdown-menu hdr-brand-menu">
                                    <div className="px-3 py-2 border-b border-[var(--sys-border)]">
                                        <p className="text-[10px] uppercase tracking-widest text-[var(--sys-text-muted)] font-bold">Switch Brand</p>
                                    </div>
                                    <div className="p-1 max-h-64 overflow-y-auto">
                                        {brands.filter(b => b.status !== 'archived').map(brand => {
                                            const brandJobs = brand._id !== activeBrand?._id ? [] : resumeJobs
                                            return (
                                                <button key={brand._id}
                                                    onClick={() => handleBrandSelect(brand)}
                                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                                                        activeBrand?._id === brand._id
                                                            ? 'text-[var(--sys-text)]'
                                                            : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'
                                                    }`}
                                                    style={activeBrand?._id === brand._id ? { background: 'var(--sys-primary-dim)', border: '1px solid var(--sys-primary)' } : { border: '1px solid transparent' }}>
                                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-[var(--sys-text)] flex-shrink-0"
                                                        style={{ background: brand.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                                        {brand.name?.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-medium truncate flex-1">{brand.name}</span>
                                                    {activeBrand?._id === brand._id && (
                                                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                                                    )}
                                                    {brandJobs.length > 0 && (
                                                        <span className="flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-primary opacity-75" />
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                                                        </span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="px-3 py-2 border-t border-[var(--sys-border)]">
                                        <p className="text-[9px] text-[var(--sys-text-muted)]">Switching brands saves your current page and resumes where you left off.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Credit Balance Badge */}
                    {creditBalance && !creditBalance.unlimited && (
                        <button
                            onClick={() => { navigate('/credits'); setShowMenu(false) }}
                            className="hdr-credit-btn group"
                            title="Credit Balance — Click to view details"
                        >
                            <div className="relative">
                                <span className={`material-symbols-outlined text-lg text-${creditColor}-400`}>toll</span>
                                {creditPercent <= 20 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-[var(--sys-surface)] rounded-full animate-pulse" />
                                )}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-sm font-bold text-${creditColor}-400`}>
                                    {creditBalance.remaining}
                                </span>
                                <span className="text-xs text-[var(--sys-text-muted)] font-medium hidden lg:inline">/ {creditBalance.total}</span>
                            </div>
                            <div className="w-12 h-1.5 rounded-full bg-[var(--sys-surface)] overflow-hidden hidden lg:block">
                                <div
                                    className={`h-full rounded-full transition-all bg-${creditColor}-500`}
                                    style={{ width: `${creditPercent}%` }}
                                />
                            </div>
                        </button>
                    )}
                    {creditBalance?.unlimited && (
                        <div className="hdr-credit-infinite">
                            <span className="material-symbols-outlined text-lg text-primary">all_inclusive</span>
                            <span className="text-xs font-bold text-primary hidden md:inline">Unlimited</span>
                        </div>
                    )}

                    {/* Global Calendar */}
                    <button
                        className={`hdr-action-btn ${globalCalendarOpen ? 'text-primary bg-[var(--sys-surface)]' : ''}`}
                        onClick={() => setGlobalCalendarOpen(!globalCalendarOpen)}
                        title="Global Calendar"
                    >
                        <span className="material-symbols-outlined text-xl">calendar_month</span>
                    </button>

                    {/* Notifications */}
                    <div className="relative" ref={notifBtnRef}>
                        <button
                            className="hdr-action-btn"
                            onClick={() => { if (!showNotifPanel) { setShowNotifPanel(true); fetchNotifications() } else { setShowNotifPanel(false) } }}
                            title="Notifications"
                        >
                            <span className="material-symbols-outlined text-xl">notifications</span>
                            {unreadCount > 0 && (
                                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-black bg-[var(--sys-primary)] text-white border-2 border-[var(--sys-bg)] px-0.5">
                                    {unreadCount > 9 ? '9+' : unreadCount}
                                </span>
                            )}
                            {unreadCount === 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 rounded-full border-2 border-[var(--sys-bg)] bg-primary opacity-0" />
                            )}
                        </button>
                        {showNotifPanel && (
                            <NotificationPanel onClose={() => setShowNotifPanel(false)} />
                        )}
                    </div>

                    {/* Agent Fidato INTEL */}
                    <button
                        onClick={toggleFidato}
                        className="hdr-action-btn p-0 bg-transparent border-none group"
                        title="Agent Fidato — Competitive Intelligence"
                    >
                        <div className="hdr-intel-wrapper">
                            <div className="relative">
                                <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform duration-300 text-primary">shield</span>
                                {intelMissionCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary border border-[var(--sys-bg)]" />
                                    </span>
                                )}
                            </div>
                            <span className="text-[10px] font-extrabold tracking-[0.15em] hidden sm:inline text-[var(--sys-text)]">
                                INTEL
                            </span>
                            {intelMissionCount > 0 && (
                                <span className="text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center bg-primary text-white shadow-sm">
                                    {intelMissionCount}
                                </span>
                            )}
                        </div>
                    </button>

                    {/* Help */}
                    <button className="hdr-action-btn hidden-sm">
                        <span className="material-symbols-outlined text-xl">help</span>
                    </button>

                    {/* User Profile Menu */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="hdr-user-btn"
                        >
                            <div className="hdr-user-info">
                                <p className="text-[13px] font-bold text-[var(--sys-text)] leading-tight">{user?.name || 'User'}</p>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--sys-text-muted)] mt-0.5">
                                    {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.plan || 'Starter'}
                                </p>
                            </div>
                            <div className="hdr-user-avatar">
                                {initials}
                            </div>
                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm hdr-hide-mobile">expand_more</span>
                        </button>

                        {showMenu && (
                            <div className="hdr-dropdown-menu hdr-user-menu">
                                <div className="p-3 border-b border-[var(--sys-border)]">
                                    <p className="text-base font-bold text-[var(--sys-text)]">{user?.name}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)] truncate">{user?.email}</p>
                                </div>

                                {creditBalance && !creditBalance.unlimited && (
                                    <div className="px-3 py-2 border-b border-[var(--sys-border)]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-[var(--sys-text-muted)] font-bold uppercase">Credits</span>
                                            <span className={`text-xs font-bold text-${creditColor}-400`}>
                                                {creditBalance.remaining} / {creditBalance.total}
                                            </span>
                                        </div>
                                        <div className="w-full h-1 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all bg-${creditColor}-500`}
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="p-1">
                                    <button onClick={() => { navigate('/dashboard'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)] transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">dashboard</span> Dashboard
                                    </button>
                                    <button onClick={() => { navigate('/credits'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)] transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">toll</span> Credit Usage
                                    </button>
                                    <button onClick={() => { navigate('/settings'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)] transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">settings</span> Settings
                                    </button>
                                </div>
                                <div className="p-1 border-t border-[var(--sys-border)]">
                                    <button onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">logout</span> Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </div>
        </>
    )
}

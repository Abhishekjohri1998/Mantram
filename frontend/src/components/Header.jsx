import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSidebar } from './DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { useCredits } from '../context/CreditContext'
import { superadmin } from '../services/api'
import { useUI } from '../context/UIContext'

// Removed local NexusBar import

// Removed local AgentFidatoPanel import

export default function Header({ title, subtitle, onMenuToggle }) {
    const { user, logout } = useAuth()
    const { brands, activeBrand, selectBrand, getActiveJobs } = useBrand()
    const { balance: creditBalance } = useCredits()
    const navigate = useNavigate()
    const location = useLocation()
    const [showMenu, setShowMenu] = useState(false)
    const [showBrandMenu, setShowBrandMenu] = useState(false)
    const { fidatoOpen, toggleFidato, intelMissionCount, refreshIntelCount } = useUI()
    const { isCollapsed, setIsCollapsed } = useSidebar()
    const [platformBudgets, setPlatformBudgets] = useState(null)
    const [resumeJobs, setResumeJobs] = useState([])
    const menuRef = useRef(null)
    const brandMenuRef = useRef(null)

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
            <div className="sticky top-0 z-50">
            {/* Admin Platform Alerts */}
            {platformAlerts.map(alert => (
                <div key={`admin-alert-${alert.id}`} className={`${alert.level === 'critical' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]'} border-b py-2 px-4 animate-fade-in flex items-center justify-center gap-3 `}>
                    <span className={`material-symbols-outlined text-sm ${alert.level === 'critical' ? 'text-primary' : 'text-primary'}`}>
                        {alert.level === 'critical' ? 'dangerous' : 'warning'}
                    </span>
                    <p className={`text-xs font-medium ${alert.level === 'critical' ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)]'}`}>
                        <span className="uppercase font-bold">{alert.provider}</span> Platform {alert.level === 'critical' ? 'EXHAUSTED' : 'Credits Low'} ({alert.percentUsed}% consumed). Please recharge the API account.
                    </p>
                    <button
                        onClick={() => navigate('/superadmin')}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${alert.level === 'critical' ? 'bg-[var(--sys-surface)] text-[var(--sys-text)] border-[var(--sys-border)] hover:bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)] text-black border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'}`}
                    >
                        Manage
                    </button>
                </div>
            ))}

            {/* Credit Warning Banners */}
            {showWarning && (
                <div className="bg-[var(--sys-primary-dim)] border-b border-[var(--sys-border)] py-2 px-4 animate-fade-in flex items-center justify-center gap-3 ">
                    <span className="material-symbols-outlined text-primary text-lg">warning</span>
                    <p className="border-[var(--sys-border)] text-xs sm:text-sm font-medium">
                        Your credits are going to expire soon (only <span className="font-bold">{creditBalance.remaining}</span> left). Please buy more to keep using the agentic studios.
                    </p>
                    <button onClick={() => navigate('/credits')} className="px-3 py-1 bg-[var(--sys-surface)] text-black text-[10px] font-black uppercase rounded-lg hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                        Buy More
                    </button>
                </div>
            )}
            {showConsumed && (
                <div className="bg-[var(--sys-primary-dim)] border-b border-[var(--sys-border)] py-2 px-4 animate-fade-in flex items-center justify-center gap-3 ">
                    <span className="material-symbols-outlined text-primary text-lg">error</span>
                    <p className="border-[var(--sys-border)] text-xs sm:text-sm font-medium">
                        All credits consumed! You cannot perform any more AI operations until you top up.
                    </p>
                    <button onClick={() => navigate('/credits')} className="px-3 py-1 bg-[var(--sys-surface)] text-[var(--sys-text)] text-[10px] font-black uppercase rounded-lg hover:bg-[var(--sys-surface)] transition-all cursor-pointer shadow-none">
                        Top Up Now
                    </button>
                </div>
            )}

            {/* Resume Banner — shown when switching back to a brand with in-progress jobs */}
            {resumeJobs.length > 0 && (
                <div className="bg-[#FF4D00]/10 border-b border-[#FF4D00]/20 py-2 px-4 animate-fade-in flex items-center justify-center gap-3 ">
                    <span className="animate-spin material-symbols-outlined text-[#FF4D00] text-lg">refresh</span>
                    <p className="text-orange-50 text-xs sm:text-sm font-medium">
                        <span className="font-bold">{resumeJobs.length}</span> job{resumeJobs.length > 1 ? 's are' : ' is'} still processing for <span className="font-bold">{activeBrand?.name}</span>.
                    </p>
                    {resumeJobs[0]?.page && (
                        <button
                            onClick={() => navigate(resumeJobs[0].page)}
                            className="px-3 py-1 bg-[#FF4D00] text-white text-[10px] font-black uppercase rounded-lg hover:bg-[#FF4D00] transition-all cursor-pointer"
                        >
                            Resume
                        </button>
                    )}
                </div>
            )}

            <header className="fixed top-0 w-full flex justify-between items-center px-6 md:px-8 py-4 h-16 bg-[var(--sys-bg)]/90 backdrop-blur-xl border-b border-[var(--sys-border)] z-50">
                <div className="flex items-center gap-8 min-w-0">
                    <div className="flex items-center gap-2.5">
                        <img src="/mantram-logo.png" alt="Mantram AI" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                        <div className="font-headline tracking-tighter text-2xl font-black italic text-primary-fixed uppercase hidden lg:block">Mantram.AI</div>
                    </div>
                    {/* Hamburger — visible on mobile/tablet */}
                    <button
                        onClick={onMenuToggle}
                        className="lg:hidden p-2 rounded-lg heavy-in-soft-out transition-all cursor-pointer flex-shrink-0 text-[var(--sys-text-muted)] hover:text-primary-fixed hover:bg-primary-fixed/8"
                    >
                        <span className="material-symbols-outlined text-xl">menu</span>
                    </button>

                    {title && (
                        <div className="hidden md:block min-w-0 border-l border-[var(--sys-border)] pl-6 space-y-0.5">
                            <h1 className="text-sm font-bold truncate tracking-tight text-[var(--sys-text)] uppercase leading-none">{title}</h1>
                            {subtitle && <p className="text-[10px] uppercase tracking-widest text-[var(--sys-text-muted)] leading-none">{subtitle}</p>}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                    {/* Global Brand Switcher */}
                    {brands.length > 0 && (
                        <div className="relative" ref={brandMenuRef}>
                            <button
                                onClick={() => setShowBrandMenu(!showBrandMenu)}
                                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer group"
                                title={`Active brand: ${activeBrand?.name || 'None'}`}
                            >
                                <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-[var(--sys-text)] flex-shrink-0"
                                    style={{ background: activeBrand?.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                    {activeBrand?.name?.charAt(0) || '?'}
                                </div>
                                <span className="text-sm font-medium text-[var(--sys-text)] max-w-[100px] truncate hidden sm:block">
                                    {activeBrand?.name || 'Select Brand'}
                                </span>
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm">unfold_more</span>
                            </button>

                            {showBrandMenu && (
                                <div className="absolute right-0 top-full mt-2 w-64 glass-panel rounded-xl border border-[var(--sys-border)] shadow-none overflow-hidden animate-fade-in z-50">
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
                                                    style={activeBrand?._id === brand._id ? { background: 'rgba(255,77,0,0.1)', border: '1px solid rgba(255,77,0,0.15)' } : { border: '1px solid transparent' }}>
                                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-[var(--sys-text)] flex-shrink-0"
                                                        style={{ background: brand.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                                        {brand.name?.charAt(0)}
                                                    </div>
                                                    <span className="text-sm font-medium truncate flex-1">{brand.name}</span>
                                                    {activeBrand?._id === brand._id && (
                                                        <span className="material-symbols-outlined text-sm" style={{ color: '#FF4D00' }}>check_circle</span>
                                                    )}
                                                    {/* Show active job indicator per brand */}
                                                    {brandJobs.length > 0 && (
                                                        <span className="flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-[#FF4D00] opacity-75" />
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF4D00]" />
                                                        </span>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {/* Quick tip */}
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
                            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer group"
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
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                            <span className="material-symbols-outlined text-lg text-primary">all_inclusive</span>
                            <span className="text-xs font-bold text-primary hidden md:inline">Unlimited</span>
                        </div>
                    )}

                    {/* Notifications */}
                    <button className="p-2 transition-colors relative rounded-xl cursor-pointer text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]">
                        <span className="material-symbols-outlined text-xl">notifications</span>
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full border-2 border-[var(--sys-bg)] bg-primary"></span>
                    </button>

                    {/* Agent Fidato INTEL */}
                    <button
                        onClick={toggleFidato}
                        className="relative cursor-pointer group"
                        title="Agent Fidato — Competitive Intelligence"
                        style={{ padding: 0, background: 'none', border: 'none' }}
                    >
                        <div className="absolute -inset-1 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-primary/20 blur-md" />
                        <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all duration-300 group-hover:scale-[1.03] bg-[var(--sys-surface)] border border-[var(--sys-border)]">
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
                    <button className="hidden sm:block p-2 text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors rounded-xl hover:bg-[var(--sys-surface)]">
                        <span className="material-symbols-outlined text-xl">help</span>
                    </button>

                    {/* User Profile Menu */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="flex items-center gap-2 sm:gap-3 sm:pl-3 sm:border-l border-[var(--sys-border)] cursor-pointer hover:bg-[var(--sys-surface)] rounded-xl pr-1 sm:pr-2 py-1 transition-all"
                        >
                            <div className="text-right hidden md:block">
                                <p className="text-[13px] font-bold text-[var(--sys-text)] leading-tight">{user?.name || 'User'}</p>
                                <p className="text-[10px] uppercase tracking-widest font-bold text-[var(--sys-text-muted)] mt-0.5">
                                    {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.plan || 'Starter'}
                                </p>
                            </div>
                            <div className="size-9 sm:size-10 rounded-full flex items-center justify-center text-[var(--sys-text)] bg-[var(--sys-surface-hover)] font-bold text-sm flex-shrink-0 transition-all hover:-translate-y-0.5 border border-[var(--sys-border)]">
                                {initials}
                            </div>
                            <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-sm hidden sm:block">expand_more</span>
                        </button>

                        {showMenu && (
                            <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 glass-panel rounded-xl border border-[var(--sys-border)] shadow-none overflow-hidden animate-fade-in z-50">
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

        {/* NexusBar — Now rendered globally in App.jsx */}
        {/* <NexusBar /> */}

        {/* Agent Fidato INTEL — Now controlled globally via UIContext */}
    </>
)
}

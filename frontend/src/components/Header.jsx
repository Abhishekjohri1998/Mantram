import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useCredits } from '../context/CreditContext'
import NexusBar from './NexusBar'
import AgentFidatoPanel from './AgentFidatoPanel'

export default function Header({ title, subtitle, onMenuToggle }) {
    const { user, logout } = useAuth()
    const { brands, activeBrand, selectBrand } = useBrand()
    const { balance: creditBalance } = useCredits()
    const navigate = useNavigate()
    const [showMenu, setShowMenu] = useState(false)
    const [showBrandMenu, setShowBrandMenu] = useState(false)
    const [showIntelPanel, setShowIntelPanel] = useState(false)
    const [intelMissionCount, setIntelMissionCount] = useState(0)
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


    // Fetch active mission count for INTEL badge
    const fetchIntelCount = useCallback(async () => {
        if (!activeBrand?._id) return
        try {
            const token = localStorage.getItem('mantram_token')
            const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
            const resp = await fetch(`${API_BASE}/intel/missions?brandId=${activeBrand._id}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            })
            if (resp.ok) {
                const data = await resp.json()
                setIntelMissionCount((data.missions || []).filter(m => m.status === 'active').length)
            }
        } catch { /* silent */ }
    }, [activeBrand?._id])

    useEffect(() => { fetchIntelCount() }, [fetchIntelCount])

    const handleLogout = () => {
        logout()
        navigate('/auth')
    }

    const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

    const creditPercent = creditBalance && !creditBalance.unlimited
        ? Math.min(100, (creditBalance.remaining / creditBalance.total) * 100)
        : 100
    const creditColor = creditPercent > 50 ? 'emerald' : creditPercent > 20 ? 'amber' : 'rose'

    // Credit Notifications
    const showWarning = creditBalance && !creditBalance.unlimited && creditBalance.remaining <= 15 && creditBalance.remaining > 0
    const showConsumed = creditBalance && !creditBalance.unlimited && creditBalance.remaining === 0

    return (
        <>
            <div className="sticky top-0 z-50">
            {/* Credit Warning Banners */}
            {showWarning && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4 animate-fade-in flex items-center justify-center gap-3 backdrop-blur-md">
                    <span className="material-symbols-outlined text-amber-500 text-lg">warning</span>
                    <p className="text-amber-200 text-xs sm:text-sm font-medium">
                        Your credits are going to expire soon (only <span className="font-bold">{creditBalance.remaining}</span> left). Please buy more to keep using the agentic studios.
                    </p>
                    <button onClick={() => navigate('/credits')} className="px-3 py-1 bg-amber-500 text-black text-[10px] font-black uppercase rounded-lg hover:bg-amber-400 transition-all cursor-pointer">
                        Buy More
                    </button>
                </div>
            )}
            {showConsumed && (
                <div className="bg-rose-500/10 border-b border-rose-500/20 py-2 px-4 animate-fade-in flex items-center justify-center gap-3 backdrop-blur-md">
                    <span className="material-symbols-outlined text-rose-500 text-lg">error</span>
                    <p className="text-rose-200 text-xs sm:text-sm font-medium">
                        All credits consumed! You cannot perform any more AI operations until you top up.
                    </p>
                    <button onClick={() => navigate('/credits')} className="px-3 py-1 bg-rose-500 text-white text-[10px] font-black uppercase rounded-lg hover:bg-rose-600 transition-all cursor-pointer shadow-lg shadow-rose-500/20">
                        Top Up Now
                    </button>
                </div>
            )}
            <header className="glass-panel border-b border-white/[0.06] px-3 sm:px-5 lg:px-8 py-3 lg:py-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    {/* Hamburger — visible on mobile/tablet */}
                    <button
                        onClick={onMenuToggle}
                        className="lg:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer flex-shrink-0"
                    >
                        <span className="material-symbols-outlined text-xl">menu</span>
                    </button>

                    {title && (
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-lg lg:text-xl font-bold truncate bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">{title}</h2>
                            {subtitle && <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}</p>}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
                    {/* Global Brand Switcher */}
                    {brands.length > 0 && (
                        <div className="relative" ref={brandMenuRef}>
                            <button
                                onClick={() => setShowBrandMenu(!showBrandMenu)}
                                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all cursor-pointer group"
                                title={`Active brand: ${activeBrand?.name || 'None'}`}
                            >
                                <div className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                                    style={{ background: activeBrand?.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                    {activeBrand?.name?.charAt(0) || '?'}
                                </div>
                                <span className="text-sm font-medium text-white max-w-[100px] truncate hidden sm:block">
                                    {activeBrand?.name || 'Select Brand'}
                                </span>
                                <span className="material-symbols-outlined text-slate-500 text-sm">unfold_more</span>
                            </button>

                            {showBrandMenu && (
                                <div className="absolute right-0 top-full mt-2 w-56 glass-panel rounded-xl border border-white/[0.1] shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50">
                                    <div className="px-3 py-2 border-b border-white/[0.06]">
                                        <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Switch Brand</p>
                                    </div>
                                    <div className="p-1 max-h-64 overflow-y-auto">
                                        {brands.filter(b => b.status !== 'archived').map(brand => (
                                            <button key={brand._id}
                                                onClick={() => { selectBrand(brand); setShowBrandMenu(false) }}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${activeBrand?._id === brand._id ? 'bg-primary/10 text-white' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                                                    }`}>
                                                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                                    style={{ background: brand.dna?.colors?.[0]?.hex || '#8b5cf6' }}>
                                                    {brand.name?.charAt(0)}
                                                </div>
                                                <span className="text-sm font-medium truncate flex-1">{brand.name}</span>
                                                {activeBrand?._id === brand._id && (
                                                    <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {/* Credit Balance Badge — compact on mobile */}
                    {creditBalance && !creditBalance.unlimited && (
                        <button
                            onClick={() => { navigate('/credits'); setShowMenu(false) }}
                            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-all cursor-pointer group"
                            title="Credit Balance — Click to view details"
                        >
                            <div className="relative">
                                <span className={`material-symbols-outlined text-lg text-${creditColor}-400`}>toll</span>
                                {creditPercent <= 20 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                                )}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className={`text-sm font-bold text-${creditColor}-400`}>
                                    {creditBalance.remaining}
                                </span>
                                <span className="text-xs text-slate-600 font-medium hidden lg:inline">/ {creditBalance.total}</span>
                            </div>
                            <div className="w-12 h-1.5 rounded-full bg-white/[0.06] overflow-hidden hidden lg:block">
                                <div
                                    className={`h-full rounded-full transition-all bg-${creditColor}-500`}
                                    style={{ width: `${creditPercent}%` }}
                                />
                            </div>
                        </button>
                    )}
                    {creditBalance?.unlimited && (
                        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
                            <span className="material-symbols-outlined text-lg text-amber-400">all_inclusive</span>
                            <span className="text-xs font-bold text-amber-400 hidden md:inline">Unlimited</span>
                        </div>
                    )}

                    {/* Notifications */}
                    <button className="p-2 text-slate-400 hover:text-white transition-colors relative rounded-xl hover:bg-white/[0.04]">
                        <span className="material-symbols-outlined text-xl">notifications</span>
                        <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-[#080a14]"></span>
                    </button>

                    {/* Agent Fidato INTEL — Global Competitive Intelligence */}
                    <button
                        onClick={() => setShowIntelPanel(true)}
                        className="relative cursor-pointer group"
                        title="Agent Fidato — Competitive Intelligence"
                        style={{ padding: 0, background: 'none', border: 'none' }}
                    >
                        {/* Outer glow aura */}
                        <div className="absolute -inset-1 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)', filter: 'blur(8px)' }} />
                        {/* Animated border container */}
                        <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all duration-300 group-hover:scale-[1.03]"
                            style={{
                                background: 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(16,185,129,0.08) 100%)',
                                border: '1px solid rgba(139,92,246,0.35)',
                                boxShadow: '0 0 12px rgba(139,92,246,0.15), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}>
                            {/* Shield icon with gradient */}
                            <div className="relative">
                                <span className="material-symbols-outlined text-lg group-hover:scale-110 transition-transform duration-300"
                                    style={{ color: '#a78bfa', filter: 'drop-shadow(0 0 4px rgba(139,92,246,0.4))' }}>shield</span>
                                {/* Live pulse for active missions */}
                                {intelMissionCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 border border-emerald-300" />
                                    </span>
                                )}
                            </div>
                            {/* INTEL label */}
                            <span className="text-[10px] font-extrabold tracking-[0.15em] hidden sm:inline"
                                style={{ color: '#a78bfa', textShadow: '0 0 8px rgba(139,92,246,0.3)' }}>
                                INTEL
                            </span>
                            {/* Mission count badge */}
                            {intelMissionCount > 0 && (
                                <span className="text-[9px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
                                        color: 'white',
                                        boxShadow: '0 0 8px rgba(139,92,246,0.4)',
                                    }}>
                                    {intelMissionCount}
                                </span>
                            )}
                        </div>
                    </button>

                    {/* Help — hidden on small mobile */}
                    <button className="hidden sm:block p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/[0.04]">
                        <span className="material-symbols-outlined text-xl">help</span>
                    </button>

                    {/* User Profile Menu */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="flex items-center gap-2 sm:gap-3 sm:pl-3 sm:border-l border-white/[0.08] cursor-pointer hover:bg-white/[0.03] rounded-xl pr-1 sm:pr-2 py-1 transition-all"
                        >
                            {/* User name — hidden on mobile */}
                            <div className="text-right hidden md:block">
                                <p className="text-base font-semibold text-white">{user?.name || 'User'}</p>
                                <p className="text-sm text-slate-500 uppercase tracking-wider font-medium">
                                    {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : user?.plan || 'Starter'}
                                </p>
                            </div>
                            <div className="size-9 sm:size-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold text-sm border-2 border-primary/30 flex-shrink-0">
                                {initials}
                            </div>
                            <span className="material-symbols-outlined text-slate-500 text-sm hidden sm:block">expand_more</span>
                        </button>

                        {/* Dropdown Menu */}
                        {showMenu && (
                            <div className="absolute right-0 top-full mt-2 w-56 sm:w-64 glass-panel rounded-xl border border-white/[0.1] shadow-2xl shadow-black/50 overflow-hidden animate-fade-in z-50">
                                <div className="p-3 border-b border-white/[0.06]">
                                    <p className="text-base font-bold text-white">{user?.name}</p>
                                    <p className="text-sm text-slate-500 truncate">{user?.email}</p>
                                </div>

                                {/* Credit balance in dropdown (always visible — especially useful on mobile) */}
                                {creditBalance && !creditBalance.unlimited && (
                                    <div className="px-3 py-2 border-b border-white/[0.06]">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm text-slate-500 font-bold uppercase">Credits</span>
                                            <span className={`text-xs font-bold text-${creditColor}-400`}>
                                                {creditBalance.remaining} / {creditBalance.total}
                                            </span>
                                        </div>
                                        <div className="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all bg-${creditColor}-500`}
                                                style={{ width: `${creditPercent}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="p-1">
                                    <button onClick={() => { navigate('/dashboard'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">dashboard</span> Dashboard
                                    </button>
                                    <button onClick={() => { navigate('/credits'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">toll</span> Credit Usage
                                    </button>
                                    <button onClick={() => { navigate('/team'); setShowMenu(false) }}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/[0.06] hover:text-white transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">settings</span> Settings
                                    </button>
                                </div>
                                <div className="p-1 border-t border-white/[0.06]">
                                    <button onClick={handleLogout}
                                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer text-left">
                                        <span className="material-symbols-outlined text-lg">logout</span> Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        </div>

        <NexusBar />

        {/* Agent Fidato INTEL — Global Side Panel */}
        {showIntelPanel && (
            <AgentFidatoPanel
                studio="global"
                panelOnly
                onClose={() => { setShowIntelPanel(false); fetchIntelCount() }}
            />
        )}
    </>
)
}

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { credits as creditsAPI } from '../services/api'

export default function Header({ title, subtitle, onMenuToggle }) {
    const { user, logout } = useAuth()
    const navigate = useNavigate()
    const [showMenu, setShowMenu] = useState(false)
    const [creditBalance, setCreditBalance] = useState(null)
    const menuRef = useRef(null)

    // Close menu on outside click
    useEffect(() => {
        const handleClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    // Fetch credit balance
    useEffect(() => {
        async function fetchCredits() {
            try {
                const data = await creditsAPI.balance()
                setCreditBalance(data)
            } catch { /* ignore */ }
        }
        if (user) fetchCredits()
        const interval = setInterval(fetchCredits, 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    const handleLogout = () => {
        logout()
        navigate('/auth')
    }

    const initials = (user?.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)

    const creditPercent = creditBalance && !creditBalance.unlimited
        ? Math.min(100, (creditBalance.remaining / creditBalance.total) * 100)
        : 100
    const creditColor = creditPercent > 50 ? 'emerald' : creditPercent > 20 ? 'amber' : 'rose'

    return (
        <header className="sticky top-0 z-10 glass-panel border-b border-white/[0.06] px-3 sm:px-5 lg:px-8 py-3 lg:py-4 flex items-center justify-between gap-2">
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
                        <h2 className="text-base sm:text-lg lg:text-xl font-bold text-white truncate">{title}</h2>
                        {subtitle && <p className="text-xs sm:text-sm text-slate-500 truncate">{subtitle}</p>}
                    </div>
                )}

                {/* Search — hidden on mobile, shown on md+ */}
                <div className="relative ml-2 sm:ml-4 hidden md:block">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                    <input
                        type="text"
                        placeholder="Search anything..."
                        className="bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-primary/40 focus:border-primary/40 outline-none w-48 lg:w-64 transition-all"
                    />
                </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
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
                                {user?.role === 'admin' ? 'Admin' : user?.plan || 'Starter'}
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
    )
}

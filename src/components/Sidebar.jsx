import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { credits as creditsAPI } from '../services/api'

const navItems = [
    { icon: 'dashboard', label: 'Dashboard', to: '/dashboard' },
    { icon: 'psychology', label: 'Brainstorm Studio', to: '/brainstorm' },
    { icon: 'edit_note', label: 'Content Studio', to: '/content-studio' },
    { icon: 'auto_fix_high', label: 'Creative Studio', to: '/creative-studio' },
    { icon: 'calendar_month', label: 'Smart Calendar', to: '/smart-calendar' },
    { icon: 'send', label: 'Publish & Schedule', to: '/publish' },
    { icon: 'travel_explore', label: 'SEO Studio', to: '/seo-studio' },
]

const bottomItems = [
    { icon: 'badge', label: 'Brand Profiles', to: '/brand-dna' },
    { icon: 'electrical_services', label: 'Integrations', to: '/integrations' },
    { icon: 'settings', label: 'Settings', to: '/team' },
]

export default function Sidebar() {
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
        // Refresh every 2 mins
        const interval = setInterval(fetchCredits, 2 * 60 * 1000)
        return () => clearInterval(interval)
    }, [user])

    const isSuperAdmin = user?.role === 'superadmin'

    return (
        <aside className="w-64 flex-shrink-0 flex flex-col border-r border-white/[0.06] bg-[#080a14] z-20 h-screen sticky top-0">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="size-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                </div>
                <div>
                    <h1 className="text-lg font-bold leading-tight text-white">Mantram AI</h1>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Brand OS</p>
                </div>
            </div>

            {/* Main Nav */}
            <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
                <p className="px-3 pt-4 pb-2 text-[10px] text-slate-600 uppercase tracking-widest font-bold">Create</p>
                {navItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
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
                <p className="px-3 pb-2 text-[10px] text-slate-600 uppercase tracking-widest font-bold">Manage</p>
                {bottomItems.map((item) => (
                    <NavLink
                        key={item.label}
                        to={item.to}
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
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Credits</span>
                            <span className="text-xs font-bold text-white">{creditBalance.remaining}/{creditBalance.total}</span>
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
                    className="w-full py-3 px-4 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary-light transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 cursor-pointer"
                >
                    <span className="material-symbols-outlined text-sm">add</span>
                    New Brand
                </NavLink>
            </div>
        </aside>
    )
}

import React, { useState, useEffect, createContext, useContext } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../context/AuthContext'
import { payments as paymentsAPI } from '../services/api'
import { Link } from 'react-router-dom'

// Context to share sidebar toggle across components
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

export default function DashboardLayout({ children, title, subtitle }) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const { user } = useAuth()
    const [subWarning, setSubWarning] = useState(null)

    // Check subscription status globally
    useEffect(() => {
        if (!user || user.role === 'superadmin') return
        paymentsAPI.subscriptionStatus()
            .then(data => {
                if (data?.isCancelled && data?.isInGracePeriod) {
                    setSubWarning({ plan: data.plan, daysRemaining: data.daysRemaining, gracePeriodEnd: data.gracePeriodEnd })
                }
            })
            .catch(() => {})
    }, [user])

    // Detect impersonation: superadmin token is saved in sessionStorage
    const isImpersonating = !!sessionStorage.getItem('mantram_superadmin_token')
    let impersonatedName = user?.name || 'Unknown'
    try {
        const imp = sessionStorage.getItem('mantram_impersonated_user')
        if (imp) {
            const parsed = JSON.parse(imp)
            impersonatedName = `${parsed.name} (${parsed.email})`
        }
    } catch {}

    const handleExitImpersonation = () => {
        const superadminToken = sessionStorage.getItem('mantram_superadmin_token');
        if (superadminToken) {
            sessionStorage.removeItem('mantram_superadmin_token');
            sessionStorage.removeItem('mantram_impersonated_user');
            localStorage.setItem('mantram_token', superadminToken);
            window.location.href = '/superadmin';
        } else {
            window.location.href = '/login';
        }
    }

    return (
        <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
            <div className="bg-surface-container-lowest overflow-hidden h-screen flex flex-col text-on-surface font-body selection:bg-primary-container selection:text-on-primary-container">
                
                {/* Antigravity atmospheric depth */}
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 -left-48 w-80 h-80 bg-tertiary/5 rounded-full blur-[100px] pointer-events-none" />

                <Header title={title} subtitle={subtitle} onMenuToggle={() => setMobileOpen(true)} />
                <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
                
                <main className="lg:ml-64 flex-1 flex flex-col relative overflow-y-auto bg-background pt-16 z-10 min-h-screen">
                    {/* Global Impersonation Banner */}
                    {isImpersonating && (
                        <div className="mb-4 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 shadow-lg rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-white text-lg">visibility</span>
                                <p className="text-white text-xs font-bold">
                                    Viewing as <strong className="underline">{impersonatedName}</strong> — All actions are logged
                                </p>
                            </div>
                            <button onClick={handleExitImpersonation} className="px-3 py-1.5 bg-white text-rose-600 rounded-lg text-[10px] font-black uppercase hover:bg-slate-100 transition-all cursor-pointer">
                                Back to SuperAdmin
                            </button>
                        </div>
                    )}
                    
                    {/* Global Cancelled Subscription Banner */}
                    {subWarning && (
                        <div className="mb-4 px-4 py-3 bg-gradient-to-r from-[#9f0519] to-error shadow-lg shadow-error/20 rounded-xl flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-white text-xl">warning</span>
                                <p className="text-white text-sm font-bold">
                                    Subscription cancelled — <strong>{subWarning.daysRemaining} days</strong> of <strong>{subWarning.plan}</strong> access remaining
                                </p>
                            </div>
                            <Link to="/credits" className="px-4 py-2 bg-white text-error rounded-lg text-xs font-black uppercase hover:bg-slate-100 transition-all shadow-md">
                                Resubscribe
                            </Link>
                        </div>
                    )}

                    {children}
                </main>
            </div>
        </SidebarContext.Provider>
    )
}


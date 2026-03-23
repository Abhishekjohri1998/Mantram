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
            <div className="flex h-screen overflow-hidden">
                <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
                <main className="flex-1 flex flex-col relative overflow-y-auto w-full min-w-0">
                    {/* Background blobs */}
                    <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
                    <div className="fixed bottom-0 left-64 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] -mb-32 pointer-events-none" />

                    {/* Global Impersonation Banner */}
                    {isImpersonating && (
                        <div className="sticky top-0 z-50 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-rose-500 shadow-lg shadow-amber-500/20 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-white text-lg">visibility</span>
                                <p className="text-white text-xs font-bold">
                                    Viewing as <strong className="underline">{impersonatedName}</strong> — All actions are logged
                                </p>
                            </div>
                            <button onClick={handleExitImpersonation} className="px-3 py-1.5 bg-white text-rose-600 rounded-lg text-[10px] font-black uppercase hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-xs">arrow_back</span>
                                Back to SuperAdmin
                            </button>
                        </div>
                    )}

                    {/* Global Cancelled Subscription Banner */}
                    {subWarning && (
                        <div className="sticky top-0 z-40 px-4 py-2 bg-gradient-to-r from-amber-500/90 to-orange-500/90 shadow-lg shadow-amber-500/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-white text-base">warning</span>
                                <p className="text-white text-xs font-bold">
                                    Subscription cancelled — <strong>{subWarning.daysRemaining} days</strong> of <strong>{subWarning.plan}</strong> access remaining
                                </p>
                            </div>
                            <Link to="/credits" className="px-3 py-1 bg-white text-amber-700 rounded-lg text-[10px] font-black uppercase hover:bg-slate-100 transition-all flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">autorenew</span>
                                Resubscribe
                            </Link>
                        </div>
                    )}

                    <Header title={title} subtitle={subtitle} onMenuToggle={() => setMobileOpen(true)} />
                    <div className="p-4 sm:p-6 lg:p-8 relative">
                        {children}
                    </div>
                </main>
            </div>
        </SidebarContext.Provider>
    )
}


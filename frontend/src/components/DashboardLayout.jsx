import React, { useState, useEffect, createContext, useContext } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../context/AuthContext'
import { payments as paymentsAPI } from '../services/api'
import { Link } from 'react-router-dom'
import NotificationToast from './NotificationToast'
import { useJobPoller } from '../hooks/useJobPoller'
import GlobalCalendarDrawer from './GlobalCalendarDrawer'

// Context to share sidebar toggle across components
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

export default function DashboardLayout({ children, title, subtitle }) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(() => localStorage.getItem('mantram-sidebar-collapsed') !== 'false')
    const [globalCalendarOpen, setGlobalCalendarOpen] = useState(false)

    // Mount global job poller — runs for lifetime of dashboard session
    useJobPoller()

    useEffect(() => {
        localStorage.setItem('mantram-sidebar-collapsed', isCollapsed)
    }, [isCollapsed])

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
        <SidebarContext.Provider value={{ mobileOpen, setMobileOpen, isCollapsed, setIsCollapsed, globalCalendarOpen, setGlobalCalendarOpen }}>
            <div className="bg-[var(--sys-bg)] overflow-hidden h-screen flex flex-col text-[var(--sys-text)] font-body selection:bg-primary-container selection:text-on-primary-container">
                
                {/* Antigravity atmospheric depth */}
                <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute top-1/2 -left-48 w-80 h-80 bg-tertiary/5 rounded-full blur-[100px] pointer-events-none" />

                <Header title={title} subtitle={subtitle} onMenuToggle={() => setMobileOpen(true)} />
                <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
                
                <main className={`flex-1 flex flex-col relative overflow-y-auto bg-[var(--sys-bg)] pt-16 px-3 sm:px-4 md:px-6 lg:px-8 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
                    {/* Global Impersonation Banner */}
                    {isImpersonating && (
                        <div className="mt-3 mb-4 px-4 py-2.5 bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-lg rounded-xl flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-[var(--sys-text)] text-lg shrink-0">visibility</span>
                                <p className="text-[var(--sys-text)] text-xs font-bold truncate">
                                    Viewing as <strong className="underline">{impersonatedName}</strong> — All actions are logged
                                </p>
                            </div>
                            <button onClick={handleExitImpersonation} className="px-3 py-1.5 bg-[var(--sys-primary)] text-white rounded-lg text-[10px] font-black uppercase hover:opacity-90 transition-all cursor-pointer shrink-0">
                                Back to SuperAdmin
                            </button>
                        </div>
                    )}
                    
                    {/* Global Cancelled Subscription Banner */}
                    {subWarning && (
                        <div className="mt-3 mb-4 px-4 py-3 bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-none rounded-xl flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className="material-symbols-outlined text-[var(--sys-text)] text-xl shrink-0">warning</span>
                                <p className="text-[var(--sys-text)] text-sm font-bold">
                                    Subscription cancelled — <strong>{subWarning.daysRemaining} days</strong> of <strong>{subWarning.plan}</strong> access remaining
                                </p>
                            </div>
                            <Link to="/credits" className="px-4 py-2 bg-[var(--sys-primary)] text-white rounded-lg text-xs font-black uppercase hover:opacity-90 transition-all shadow-md shrink-0">
                                Resubscribe
                            </Link>
                        </div>
                    )}

                    {children}
                </main>
            </div>
            {/* Global notification toasts — shown on job completion */}
            <NotificationToast />

            {/* Global Calendar Drawer */}
            <GlobalCalendarDrawer open={globalCalendarOpen} onClose={() => setGlobalCalendarOpen(false)} />
        </SidebarContext.Provider>
    )
}


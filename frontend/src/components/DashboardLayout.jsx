import React, { useState, createContext, useContext } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import { useAuth } from '../context/AuthContext'

// Context to share sidebar toggle across components
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

export default function DashboardLayout({ children, title, subtitle }) {
    const [mobileOpen, setMobileOpen] = useState(false)
    const { user } = useAuth()

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

                    <Header title={title} subtitle={subtitle} onMenuToggle={() => setMobileOpen(true)} />
                    <div className="p-4 sm:p-6 lg:p-8 relative">
                        {children}
                    </div>
                </main>
            </div>
        </SidebarContext.Provider>
    )
}


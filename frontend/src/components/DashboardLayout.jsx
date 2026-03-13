import { useState, createContext, useContext } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

// Context to share sidebar toggle across components
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

export default function DashboardLayout({ children, title, subtitle }) {
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
            <div className="flex h-screen overflow-hidden">
                <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
                <main className="flex-1 flex flex-col relative overflow-y-auto w-full min-w-0">
                    {/* Background blobs */}
                    <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
                    <div className="fixed bottom-0 left-64 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] -mb-32 pointer-events-none" />

                    <Header title={title} subtitle={subtitle} onMenuToggle={() => setMobileOpen(true)} />
                    <div className="p-4 pt-6 sm:p-5 sm:pt-8 md:p-6 md:pt-10 lg:p-8 lg:pt-12 relative">
                        {children}
                    </div>
                </main>
            </div>
        </SidebarContext.Provider>
    )
}


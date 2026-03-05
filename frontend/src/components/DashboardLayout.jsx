import { useState, createContext, useContext, Component } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'
import FidatoWidget from './FidatoWidget'

// Context to share sidebar toggle across components
const SidebarContext = createContext()
export const useSidebar = () => useContext(SidebarContext)

// Error boundary to prevent Fidato crashes from breaking the whole page
class FidatoErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { hasError: false } }
    static getDerivedStateFromError() { return { hasError: true } }
    componentDidCatch(err) { console.warn('Fidato widget error (isolated):', err?.message) }
    render() { return this.state.hasError ? null : this.props.children }
}

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
                    <div className="p-4 sm:p-5 md:p-6 lg:p-8 relative">
                        {children}
                    </div>
                </main>
                <FidatoErrorBoundary>
                    <FidatoWidget />
                </FidatoErrorBoundary>
            </div>
        </SidebarContext.Provider>
    )
}

import Sidebar from './Sidebar'
import Header from './Header'

export default function DashboardLayout({ children, title, subtitle }) {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 flex flex-col relative overflow-y-auto">
                {/* Background blobs */}
                <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
                <div className="fixed bottom-0 left-64 w-[400px] h-[400px] bg-primary/5 rounded-full blur-[100px] -mb-32 pointer-events-none" />

                <Header title={title} subtitle={subtitle} />
                <div className="p-8 relative">
                    {children}
                </div>
            </main>
        </div>
    )
}

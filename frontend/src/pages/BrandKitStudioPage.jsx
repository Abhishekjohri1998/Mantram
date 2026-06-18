import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import BrandKitStudio from './BrandKit/index.jsx'
import BrandKitWizard from './BrandKit/BrandKitWizard.jsx'
import BrandCalendar from './BrandCalendar.jsx'
import MonthlyStrategy from '../components/MonthlyStrategy'

export default function BrandKitStudioPage() {
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const { activeBrand, updateBrandDNA } = useBrand()
    
    // Tab can be pre-filled via search param (e.g. ?tab=calendar)
    const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'assets')
    const [showWizard, setShowWizard] = useState(false)

    useEffect(() => {
        const tab = searchParams.get('tab')
        if (tab && ['assets', 'calendar', 'strategy'].includes(tab)) {
            setActiveTab(tab)
        }
    }, [searchParams])

    const handleTabChange = (tabId) => {
        setActiveTab(tabId)
        setSearchParams({ tab: tabId })
    }

    if (!activeBrand) {
        return (
            <DashboardLayout title="Brand Kit Studio" subtitle="Manage brand assets, calendar, and monthly strategy">
                <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
                    <span className="material-symbols-outlined text-6xl text-[var(--sys-text-muted)]">palette</span>
                    <h2 className="text-2xl font-extrabold text-[var(--sys-text)]">No Brand Selected</h2>
                    <p className="text-[var(--sys-text-muted)] text-sm">Create or select a brand to view its Brand Kit.</p>
                    <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm mt-2 cursor-pointer">
                        Create Brand
                    </button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout key={activeBrand._id} title="Brand Kit Studio" subtitle="Your unified brand assets, social calendar, and monthly strategy">
            <SEOHead title="Brand Kit Studio — Mantram AI" noIndex={true} />
            
            <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
                
                {/* Tab Navigation header */}
                <div className="flex items-center justify-between gap-4 flex-wrap border-b border-[var(--sys-border)] pb-4">
                    <div className="flex items-center gap-1 p-1 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit">
                        {[
                            { id: 'assets',   icon: 'palette',       label: 'Brand Assets' },
                            { id: 'calendar', icon: 'calendar_month', label: 'Brand Calendar' },
                            { id: 'strategy', icon: 'edit_calendar',  label: 'Monthly Strategy' },
                        ].map(tab => (
                            <button key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                                    activeTab === tab.id
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                        : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'
                                }`}>
                                <span className="material-symbols-outlined text-[1.1rem]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* New Brand Wizard button for Assets tab */}
                    {activeTab === 'assets' && (
                        <button
                            onClick={() => setShowWizard(true)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-sm">wand_stars</span>
                            New Brand Wizard
                        </button>
                    )}
                </div>

                {/* Render active tab */}
                <div className="mt-4">
                    {activeTab === 'assets' && (
                        <div className="animate-fade-in">
                            <BrandKitStudio brand={activeBrand} />
                        </div>
                    )}
                    {activeTab === 'calendar' && (
                        <div className="animate-fade-in">
                            <BrandCalendar embedded={true} />
                        </div>
                    )}
                    {activeTab === 'strategy' && (
                        <div className="animate-fade-in">
                            <MonthlyStrategy />
                        </div>
                    )}
                </div>
            </div>

            {/* Brand Kit Wizard Modal */}
            {showWizard && (
                <BrandKitWizard
                    onClose={() => setShowWizard(false)}
                    onComplete={(res) => {
                        setShowWizard(false)
                        if (res?.brand) updateBrandDNA(res.brand._id, res.brand.dna)
                    }}
                />
            )}
        </DashboardLayout>
    )
}

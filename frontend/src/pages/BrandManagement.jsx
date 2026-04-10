import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { brands as brandsAPI } from '../services/api'

// ============================================================================
// DELETE CONFIRMATION MODAL
// ============================================================================
function DeleteBrandModal({ brand, onClose, onConfirm }) {
    const [confirmText, setConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)
    const canDelete = confirmText === brand.name

    const handleDelete = async () => {
        if (!canDelete) return
        setDeleting(true)
        try { await onConfirm() } finally { setDeleting(false) }
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-[var(--sys-surface)] " />
            <div className="relative w-full max-w-md rounded-2xl border border-[var(--sys-border)] overflow-hidden animate-fade-in"
                style={{ background: 'rgba(15,15,25,0.97)' }} onClick={e => e.stopPropagation()}>
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="size-12 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                            <span className="material-symbols-outlined text-primary text-2xl">warning</span>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-[var(--sys-text)]">Delete Brand</h3>
                            <p className="text-sm text-[var(--sys-text-muted)]">This cannot be undone</p>
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] mb-4">
                        <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">
                            Deleting <strong className="text-primary">{brand.name}</strong> will permanently remove:
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-[var(--sys-text-muted)]">
                            <li>• All brand DNA & knowledge</li>
                            <li>• All synced products</li>
                            <li>• All integrations for this brand</li>
                            <li>• All generated content & creatives</li>
                            <li>• All audit history</li>
                        </ul>
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1.5 block">
                            Type <strong className="text-[var(--sys-text)]">{brand.name}</strong> to confirm
                        </label>
                        <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                            placeholder={brand.name}
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-600 outline-none focus:border-[var(--sys-border)]" />
                    </div>
                </div>
                <div className="flex justify-end gap-3 p-4 border-t border-[var(--sys-border)]">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Cancel</button>
                    <button onClick={handleDelete} disabled={!canDelete || deleting}
                        className="px-6 py-2 rounded-xl text-sm font-medium bg-[var(--sys-surface)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                        {deleting ? 'Deleting...' : 'Delete Permanently'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ============================================================================
// MAIN BRAND MANAGEMENT PAGE
// ============================================================================
export default function BrandManagement() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeBrand, selectBrand, deleteBrand, fetchBrands } = useBrand()
    const [allBrands, setAllBrands] = useState([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all') // 'all', 'active', 'archived'
    const [deleteTarget, setDeleteTarget] = useState(null)
    const [togglingId, setTogglingId] = useState(null)
    const planLimits = { maxBrands: Infinity, plan: 'Mantram Unlimited' }

    // Fetch ALL brands (including archived) for this management page
    const fetchAllBrands = useCallback(async () => {
        try {
            const data = await brandsAPI.list({ include: 'all' })
            setAllBrands(data.brands || [])
        } catch (err) {
            console.error('Failed to fetch all brands:', err)
        }
    }, [])

    useEffect(() => { fetchAllBrands() }, [fetchAllBrands])

    // Filter brands (from local state that includes archived)
    const filteredBrands = allBrands.filter(b => {
        const matchesSearch = !search || b.name?.toLowerCase().includes(search.toLowerCase()) || b.website?.toLowerCase().includes(search.toLowerCase())
        const matchesStatus = statusFilter === 'all' || b.status === statusFilter
        return matchesSearch && matchesStatus
    })

    const activeBrands = allBrands.filter(b => b.status === 'active' || !b.status)
    const archivedBrands = allBrands.filter(b => b.status === 'archived')

    // Toggle archive/restore
    const handleToggleStatus = async (brand) => {
        const newStatus = brand.status === 'archived' ? 'active' : 'archived'
        setTogglingId(brand._id)
        try {
            await brandsAPI.updateStatus(brand._id, newStatus)
            await fetchAllBrands()  // Refresh local list
            await fetchBrands()     // Refresh global context (so header updates)
        } catch (err) {
            console.error('Failed to update brand status:', err)
        } finally {
            setTogglingId(null)
        }
    }

    // Delete brand
    const handleDeleteBrand = async () => {
        if (!deleteTarget) return
        try {
            await deleteBrand(deleteTarget._id)
            setAllBrands(prev => prev.filter(b => b._id !== deleteTarget._id))
            setDeleteTarget(null)
        } catch (err) {
            alert(`Failed to delete: ${err.message}`)
        }
    }

    // Quick select and navigate to DNA
    const handleViewDNA = (brand) => {
        selectBrand(brand)
        navigate('/brand-dna')
    }

    const formatDate = (d) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    }

    return (
        <DashboardLayout title="Brand Management" subtitle="Manage your brand profiles & DNA">
            <SEOHead title="Brand Management — Mantram AI" noIndex={true} />
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div>
                    <p className="text-[var(--sys-text-muted)] text-sm">
                        {allBrands.length} brand{allBrands.length !== 1 ? 's' : ''} · Manage your brand portfolio
                    </p>
                </div>
                <button onClick={() => navigate('/onboarding')}
                    className="btn-primary py-2.5 px-5 rounded-xl text-sm cursor-pointer flex items-center gap-2 shrink-0">
                    <span className="material-symbols-outlined text-sm">add</span>Add Brand
                </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Total Brands', value: allBrands.length, icon: 'cases', color: '#8b5cf6' },
                    { label: 'Active', value: activeBrands.length, icon: 'check_circle', color: '#34d399' },
                    { label: 'Archived', value: archivedBrands.length, icon: 'archive', color: '#f59e0b' },
                    { label: 'Plan Limit', value: planLimits?.maxBrands || '∞', icon: 'diamond', color: '#06b6d4' },
                ].map((s, i) => (
                    <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                        <span className="material-symbols-outlined text-xl mb-2 block" style={{ color: s.color }}>{s.icon}</span>
                        <p className="text-2xl font-extrabold text-[var(--sys-text)]">{s.value}</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
                <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">search</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search brands by name or website..."
                        className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40 transition-all" />
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                    {['all', 'active', 'archived'].map(f => (
                        <button key={f} onClick={() => setStatusFilter(f)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${statusFilter === f ? 'bg-primary text-white shadow-none' : 'text-[var(--sys-text-muted)] hover:text-white hover:bg-[var(--sys-surface)]'}`}>
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* Brand Cards */}
            {filteredBrands.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center animate-fade-in">
                    {allBrands.length === 0 ? (
                        <>
                            <div className="size-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-4xl text-primary">add_business</span>
                            </div>
                            <h3 className="text-xl font-bold text-[var(--sys-text)] mb-2">No brands yet</h3>
                            <p className="text-[var(--sys-text-muted)] text-sm mb-6 max-w-md mx-auto">
                                Create your first brand by scanning a website or brainstorming from scratch. Your brand DNA will power all AI content generation.
                            </p>
                            <button onClick={() => navigate('/onboarding')}
                                className="btn-primary py-3 px-8 rounded-xl text-sm font-bold cursor-pointer inline-flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">rocket_launch</span>Create Your First Brand
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">search_off</span>
                            <p className="text-[var(--sys-text-muted)] text-sm">No brands match your search or filter.</p>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredBrands.map((brand, i) => {
                        const isActive = activeBrand?._id === brand._id
                        const isArchived = brand.status === 'archived'
                        
                        // Determine if Locked (over plan limit)
                        // To keep it fair, we unlock the oldest N brands (where N = plan limit)
                        const activeBrandsSorted = allBrands
                            .filter(b => b.status !== 'archived')
                            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                        
                        const brandIndex = activeBrandsSorted.findIndex(b => b._id === brand._id)
                        const maxBrands = Infinity
                        const isLocked = false
                        const isOwner = String(brand.user?._id || brand.user) === String(user._id || user.id);

                        const primaryColor = brand.dna?.colors?.[0]?.hex || '#8b5cf6'
                        const secondaryColor = brand.dna?.colors?.[1]?.hex || '#6366f1'
                        return (
                            <div key={brand._id}
                                className={`glass-panel rounded-2xl overflow-hidden transition-all animate-fade-in group hover:border-[var(--sys-border)] ${isActive ? 'ring-2 ring-primary/30' : ''} ${isArchived ? 'opacity-60' : ''} ${isLocked ? 'opacity-75 grayscale-[0.5]' : ''}`}
                                style={{ animationDelay: `${i * 50}ms` }}>

                                {/* Color strip header */}
                                <div className="h-2 w-full" style={{ background: `var(--sys-primary)` }} />

                                <div className="p-5">
                                    {/* Brand info */}
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="size-14 rounded-xl flex items-center justify-center text-2xl font-black text-[var(--sys-text)] shrink-0 shadow-lg"
                                            style={{ background: `var(--sys-primary)` }}>
                                            {brand.dna?.logo?.url ? (
                                                <img src={brand.dna.logo.url} alt="logo" className="w-full h-full object-contain rounded-xl" />
                                            ) : brand.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <h3 className="text-lg font-extrabold text-[var(--sys-text)] truncate">{brand.name}</h3>
                                                {isLocked && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary uppercase tracking-wider shrink-0 animate-pulse">Locked</span>
                                                )}
                                                {isActive && !isLocked && (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary uppercase tracking-wider shrink-0">Active</span>
                                                )}
                                            </div>
                                            {brand.website && (
                                                <p className="text-xs text-primary truncate">{brand.website.replace(/^https?:\/\//, '')}</p>
                                            )}
                                            {!isOwner && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] uppercase tracking-wider">Shared with you</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Description */}
                                    {brand.dna?.brandDescription && (
                                        <p className="text-xs text-[var(--sys-text-muted)] leading-relaxed line-clamp-2 mb-4">{brand.dna.brandDescription}</p>
                                    )}

                                    {/* Meta info */}
                                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isArchived ? 'bg-[var(--sys-primary-dim)] text-primary' : (isLocked ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary')}`}>
                                            {isArchived ? 'Archived' : (isLocked ? 'Upgrade Required' : 'Active')}
                                        </span>
                                        <span className="text-[10px] text-[var(--sys-text-muted)] flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[10px]">calendar_month</span>
                                            {formatDate(brand.createdAt)}
                                        </span>
                                        {brand.dna?.colors?.length > 0 && (
                                            <div className="flex -space-x-1 ml-auto">
                                                {brand.dna.colors.slice(0, 4).map((c, j) => (
                                                    <div key={j} className="size-4 rounded-full border border-[#0d0f1a]"
                                                        style={{ background: c.hex }} title={`${c.name}: ${c.hex}`} />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Voice personality tag */}
                                    {brand.dna?.voice?.personality && (
                                        <div className="flex items-center gap-1.5 mb-4 p-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <span className="material-symbols-outlined text-xs text-primary">record_voice_over</span>
                                            <span className="text-[10px] text-[var(--sys-text-muted)] font-medium">{brand.dna.voice.personality}</span>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="flex gap-2 pt-3 border-t border-[var(--sys-border)]">
                                        {isLocked ? (
                                            <button onClick={() => navigate('/credits')}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-primary bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] transition-all cursor-pointer">
                                                <span className="material-symbols-outlined text-sm">lock</span>Upgrade to Unlock
                                            </button>
                                        ) : (
                                            <>
                                                {!isActive && !isArchived && (
                                                    <button onClick={() => selectBrand(brand)}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-all cursor-pointer">
                                                        <span className="material-symbols-outlined text-sm">check_circle</span>Set Active
                                                    </button>
                                                )}
                                                <button onClick={() => handleViewDNA(brand)}
                                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-[var(--sys-text-muted)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">fingerprint</span>View DNA
                                                </button>
                                            </>
                                        )}
                                        
                                        {isOwner && (
                                            <button onClick={() => handleToggleStatus(brand)} disabled={togglingId === brand._id}
                                                className={`flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border disabled:opacity-40 ${isArchived
                                                    ? 'text-primary bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-primary-dim)] border-[var(--sys-border)]'
                                                    : 'text-primary bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-primary-dim)] border-[var(--sys-border)]'
                                                    }`} title={isArchived ? 'Restore Brand' : 'Archive Brand'}>
                                                <span className="material-symbols-outlined text-sm">{togglingId === brand._id ? 'progress_activity' : (isArchived ? 'unarchive' : 'archive')}</span>
                                            </button>
                                        )}

                                        {isOwner && (
                                            <button onClick={() => setDeleteTarget(brand)}
                                                className="flex items-center justify-center px-3 py-2 rounded-xl text-xs text-primary/60 hover:text-primary bg-[var(--sys-surface)] hover:bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all cursor-pointer"
                                                title="Delete Brand">
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}

                    {/* Add Brand Card */}
                    <button onClick={() => navigate('/onboarding')}
                        className="glass-panel rounded-2xl p-8 flex flex-col items-center justify-center gap-3 border border-dashed border-[var(--sys-border)] hover:border-primary/30 hover:bg-primary/[0.02] transition-all cursor-pointer min-h-[280px] group animate-fade-in"
                        style={{ animationDelay: `${filteredBrands.length * 50}ms` }}>
                        <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-3xl text-primary">add</span>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-bold text-[var(--sys-text)] mb-0.5">Add New Brand</p>
                            <p className="text-xs text-[var(--sys-text-muted)]">Scan a website or brainstorm</p>
                        </div>
                    </button>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteTarget && (
                <DeleteBrandModal brand={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDeleteBrand} />
            )}
        </DashboardLayout>
    )
}

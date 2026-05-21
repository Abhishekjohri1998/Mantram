import { useState, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useBrand } from '../context/BrandContext'
import { brands as brandsAPI, products as productsAPI } from '../services/api'
import BrandKitStudio from './BrandKit/index.jsx'
import BrandKitWizard from './BrandKit/BrandKitWizard.jsx'

// ============================================================================
// EDIT MODAL — reusable inline editor for any DNA section
// ============================================================================
function EditModal({ title, icon, onClose, onSave, children }) {
    const [saving, setSaving] = useState(false)
    const handleSave = async () => {
        setSaving(true)
        try { await onSave() } finally { setSaving(false) }
    }
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-[var(--sys-surface)] " />
            <div className="relative w-full max-w-lg rounded-2xl border border-[var(--sys-border)] overflow-hidden animate-fade-in"
                style={{ background: 'rgba(15,15,25,0.97)' }} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-5 border-b border-[var(--sys-border)]">
                    <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">{icon}</span>{title}
                    </h3>
                    <button onClick={onClose} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">{children}</div>
                <div className="flex justify-end gap-3 p-5 border-t border-[var(--sys-border)]">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">Cancel</button>
                    <button onClick={handleSave} disabled={saving}
                        className="btn-primary px-6 py-2 rounded-xl text-sm font-medium cursor-pointer disabled:opacity-50">
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// Section header with edit button
function SectionHeader({ icon, title, onEdit, badge }) {
    return (
        <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">{icon}</span> {title}
                {badge && <span className="ml-2 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">{badge}</span>}
            </h3>
            {onEdit && (
                <button onClick={onEdit}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/5 transition-all cursor-pointer">
                    <span className="material-symbols-outlined text-sm">edit</span> Edit
                </button>
            )}
        </div>
    )
}

// ============================================================================
// PRODUCT CATALOG COMPONENTS (kept from original)
// ============================================================================

function AddProductModal({ brandId, onClose, onSaved, editProduct }) {
    const [form, setForm] = useState({
        title: editProduct?.title || '', description: editProduct?.description || '',
        productType: editProduct?.productType || '', vendor: editProduct?.vendor || '',
        price: editProduct?.variants?.[0]?.price || '', tags: (editProduct?.tags || []).join(', '),
    })
    const handleSave = async () => {
        if (!form.title.trim()) return alert('Product title is required')
        const data = {
            title: form.title, description: form.description,
            productType: form.productType, vendor: form.vendor,
            tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            variants: [{ title: 'Default', price: parseFloat(form.price) || 0, sku: '', inventoryQuantity: 0 }],
            images: [], source: 'manual', brand: brandId, status: 'active',
        }
        try {
            if (editProduct) {
                await productsAPI.update(editProduct._id, data)
            } else {
                await productsAPI.create(data)
            }
            onSaved()
            onClose()
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }
    return (
        <EditModal title={editProduct ? 'Edit Product' : 'Add Product'} icon="inventory_2" onClose={onClose} onSave={handleSave}>
            {[
                { key: 'title', label: 'Product Name', placeholder: 'e.g. Premium Widget' },
                { key: 'description', label: 'Description', placeholder: 'Product description...', area: true },
                { key: 'productType', label: 'Category', placeholder: 'e.g. Electronics' },
                { key: 'vendor', label: 'Brand/Vendor', placeholder: 'e.g. Acme Corp' },
                { key: 'price', label: 'Price', placeholder: '999', type: 'number' },
                { key: 'tags', label: 'Tags (comma-separated)', placeholder: 'premium, new, bestseller' },
            ].map(f => (
                <div key={f.key}>
                    <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">{f.label}</label>
                    {f.area ? (
                        <textarea value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder} rows={3}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    ) : (
                        <input type={f.type || 'text'} value={form[f.key]}
                            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                    )}
                </div>
            ))}
        </EditModal>
    )
}

function ProductCard({ product, onEdit, onDelete, onEnrich }) {
    const [enriching, setEnriching] = useState(false)
    const handleEnrich = async () => {
        setEnriching(true)
        try { await onEnrich(product._id) } finally { setEnriching(false) }
    }
    const handleDelete = async () => {
        if (!confirm(`Delete "${product.title}"?`)) return
        try { await onDelete(product._id) } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }
    const mainImage = product.images?.[0]?.url
    const price = product.variants?.[0]?.price
    return (
        <div className="glass-panel rounded-xl overflow-hidden group hover:border-primary/20 transition-all">
            <div className="h-28 bg-[var(--sys-surface)] flex items-center justify-center overflow-hidden">
                {mainImage ? (
                    <img src={mainImage} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                    <span className="material-symbols-outlined text-3xl text-slate-700">inventory_2</span>
                )}
            </div>
            <div className="p-3">
                <p className="text-sm font-bold text-[var(--sys-text)] truncate">{product.title}</p>
                <div className="flex items-center gap-2 mt-1">
                    {product.productType && <span className="text-xs text-[var(--sys-text-muted)] truncate">{product.productType}</span>}
                    {price > 0 && <span className="text-xs text-primary font-bold ml-auto">₹{price}</span>}
                </div>
                <div className="flex gap-1 mt-2">
                    <button onClick={() => onEdit(product)} className="flex-1 text-xs text-[var(--sys-text-muted)] hover:text-primary py-1 rounded cursor-pointer">Edit</button>
                    <button onClick={handleEnrich} disabled={enriching} className="flex-1 text-xs text-[var(--sys-text-muted)] hover:text-primary py-1 rounded cursor-pointer disabled:opacity-50">
                        {enriching ? '...' : 'Enrich'}
                    </button>
                    <button onClick={handleDelete} className="flex-1 text-xs text-[var(--sys-text-muted)] hover:text-primary py-1 rounded cursor-pointer">Delete</button>
                </div>
            </div>
        </div>
    )
}

function ProductCatalog({ brandId, brandWebsite, setError }) {
    const [products, setProducts] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [showAdd, setShowAdd] = useState(false)
    const [editProduct, setEditProduct] = useState(null)
    const [search, setSearch] = useState('')
    const [scanning, setScanning] = useState(false)

    const [repairing, setRepairing] = useState(false)

    const fetchProducts = useCallback(async () => {
        if (!brandId) return
        setLoading(true)
        try {
            const data = await productsAPI.list({ brandId, search, limit: 50 })
            setProducts(data.products || [])
            setTotal(data.total || 0)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally { setLoading(false) }
    }, [brandId, search])

    useEffect(() => { fetchProducts() }, [fetchProducts])

    const handleSearch = (val) => { setSearch(val) }
    const handleSaved = () => { fetchProducts(); setShowAdd(false); setEditProduct(null) }
    const handleEnrich = async (id) => {
        try { await productsAPI.aiEnrich(id); fetchProducts() } catch { }
    }
    const handleDelete = async (id) => {
        try { await productsAPI.delete(id); fetchProducts() } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }
    const handleScanWebsite = async () => {
        if (!brandWebsite) return alert('No website URL configured for this brand')
        setScanning(true)
        try {
            const res = await productsAPI.scanFromWebsite(brandId, brandWebsite)
            alert(`Scan complete! Found ${res.imported || 0} new products.`)
            fetchProducts()
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setScanning(false) }
    }
    const handleRepairImages = async () => {
        setRepairing(true)
        try {
            const res = await productsAPI.repairImages(brandId)
            alert(`${res.message}`)
            fetchProducts()
        } catch (err) {
            setError({ message: err.message, isProviderError: err.isProviderError, provider: err.provider })
        } finally { setRepairing(false) }
    }

    return (
        <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '540ms' }}>
            <div className="flex items-center justify-between mb-5">
                <SectionHeader icon="inventory_2" title="Product Catalog" badge={total || null} />
                <div className="flex items-center gap-2">
                    <input type="text" placeholder="Search products..." value={search} onChange={e => handleSearch(e.target.value)}
                        className="input-glass rounded-xl px-3 py-1.5 text-xs w-40" />
                    {brandWebsite && (
                        <button onClick={handleScanWebsite} disabled={scanning}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/5 transition-all cursor-pointer disabled:opacity-50">
                            <span className="material-symbols-outlined text-sm">{scanning ? 'progress_activity' : 'language'}</span>
                            {scanning ? 'Scanning...' : 'Scan Website'}
                        </button>
                    )}
                    <button onClick={handleRepairImages} disabled={repairing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-sm">{repairing ? 'progress_activity' : 'build'}</span>
                        {repairing ? 'Repairing...' : 'Repair Images'}
                    </button>
                    <button onClick={() => { setEditProduct(null); setShowAdd(true) }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium text-primary hover:bg-primary/5 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> Add Product
                    </button>
                </div>
            </div>
            {loading ? (
                <div className="flex items-center justify-center py-8 text-[var(--sys-text-muted)]"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...</div>
            ) : products.length === 0 ? (
                <div className="text-center py-8">
                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-2 block">inventory_2</span>
                    <p className="text-sm text-[var(--sys-text-muted)]">No products yet. Add manually or scan your website.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {products.map(p => (
                        <ProductCard key={p._id} product={p} onEdit={(p) => { setEditProduct(p); setShowAdd(true) }} onDelete={handleDelete} onEnrich={handleEnrich} />
                    ))}
                </div>
            )}
            {showAdd && <AddProductModal brandId={brandId} onClose={() => { setShowAdd(false); setEditProduct(null) }} onSaved={handleSaved} editProduct={editProduct} />}
        </div>
    )
}

// ============================================================================
// DELETE BRAND CONFIRMATION MODAL
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
                            <li>• All audit history</li>
                        </ul>
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1.5 block">
                            Type <strong className="text-[var(--sys-text)]">{brand.name}</strong> to confirm
                        </label>
                        <input type="text" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                            placeholder={brand.name}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
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
// BRAND IMAGE GALLERY — Categorized with Lightbox Viewer
// ============================================================================
function BrandImageGallery({ dna, brandId, updateBrandDNA, setError }) {
    const navigate = useNavigate()
    const [lightbox, setLightbox] = useState(null) // { images, index }
    const [collapsedCats, setCollapsedCats] = useState({})
    const [deletingUrl, setDeletingUrl] = useState(null)
    const [editingImage, setEditingImage] = useState(null) // full img object or null
    const [editForm, setEditForm] = useState({ alt: '', description: '', source: '', category: '', vendor: '', price: '', tags: '' })

    // Open full edit modal for image info
    const handleEditImage = (img, e) => {
        e.stopPropagation()
        setEditingImage(img)
        setEditForm({
            alt: img.alt || '',
            description: img.description || '',
            source: img.source || 'page',
            category: img.category || '',
            vendor: img.vendor || '',
            price: img.price || '',
            tags: (img.tags || []).join?.(', ') || (typeof img.tags === 'string' ? img.tags : ''),
        })
    }

    // Save edited image info via full modal
    const handleSaveEdit = async () => {
        if (!editingImage) return
        const updatedData = {
            alt: editForm.alt,
            description: editForm.description,
            source: editForm.source,
            category: editForm.category,
            vendor: editForm.vendor,
            price: editForm.price,
            tags: editForm.tags,
        }
        const updatedBrandImages = (dna.brandImages || []).map(img =>
            img.url === editingImage.url ? { ...img, ...updatedData } : img
        )
        const updatedBannerImages = (dna.bannerImages || []).map(img =>
            img.url === editingImage.url ? { ...img, ...updatedData } : img
        )
        try {
            await updateBrandDNA(brandId, { brandImages: updatedBrandImages, bannerImages: updatedBannerImages })
            setEditingImage(null)
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // Navigate to Creative Studio AI Photoshoot with image
    const handleEnrichImage = (imgUrl, e) => {
        e.preventDefault()
        e.stopPropagation()
        sessionStorage.setItem('photoshootImage', imgUrl)
        // Use direct location navigation for reliability
        window.location.href = '/creative-studio?mode=photoshoot'
    }

    // Merge and deduplicate all brand images
    const allImages = (() => {
        const merged = []
        const seen = new Set()
        for (const img of [...(dna.bannerImages || []), ...(dna.brandImages || [])]) {
            if (img.url && !seen.has(img.url)) {
                seen.add(img.url)
                merged.push(img)
            }
        }
        return merged
    })()

    if (allImages.length === 0) return null

    // Auto-categorize images based on source, alt text, and URL patterns
    const categorize = (img) => {
        const s = (img.source || '').toLowerCase()
        const alt = (img.alt || '').toLowerCase()
        const url = (img.url || '').toLowerCase()

        if (s === 'hero' || s === 'hero-section' || s === 'og-image' || s === 'twitter-image' || s === 'banner' || s === 'background'
            || alt.match(/hero|banner|splash|jumbotron|slider|carousel/)
            || url.match(/hero|banner|slider|carousel|splash/)) {
            return 'hero'
        }
        if (s === 'product' || s === 'structured-data'
            || alt.match(/product|item|buy|shop|price|₹|\$|cart/)
            || url.match(/product|catalog|item|shop|cdn\.shopify/)) {
            return 'product'
        }
        if (alt.match(/promo|offer|sale|discount|deal|launch|new|campaign|ad/)
            || url.match(/promo|offer|sale|campaign|marketing|ad|launch/)) {
            return 'promo'
        }
        if (alt.match(/partner|client|brand|trust|collab|sponsor|certification|award|certified/)
            || url.match(/partner|client|trust|collab|sponsor|cert/)) {
            return 'partner'
        }
        return 'other'
    }

    const categoryConfig = {
        hero: { label: 'Hero & Banners', icon: 'panorama', color: '#f59e0b' },
        product: { label: 'Product Images', icon: 'inventory_2', color: '#06b6d4' },
        promo: { label: 'Promotional', icon: 'campaign', color: '#ef4444' },
        partner: { label: 'Partner & Trust', icon: 'handshake', color: '#8b5cf6' },
        other: { label: 'Other Images', icon: 'image', color: '#64748b' },
    }

    // Group images by category
    const categories = {}
    const flatIndexed = []
    for (const img of allImages) {
        const cat = categorize(img)
        if (!categories[cat]) categories[cat] = []
        const indexedImg = { ...img, _globalIndex: flatIndexed.length, _category: cat }
        categories[cat].push(indexedImg)
        flatIndexed.push(indexedImg)
    }

    const catOrder = ['hero', 'product', 'promo', 'partner', 'other'].filter(c => categories[c]?.length)

    const toggleCat = (cat) => setCollapsedCats(prev => ({ ...prev, [cat]: !prev[cat] }))

    const openLightbox = (globalIndex) => setLightbox({ images: flatIndexed, index: globalIndex })
    const closeLightbox = () => setLightbox(null)
    const prevImage = () => setLightbox(prev => prev ? { ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length } : null)
    const nextImage = () => setLightbox(prev => prev ? { ...prev, index: (prev.index + 1) % prev.images.length } : null)

    // Delete image from brand DNA
    const handleDeleteImage = async (imgUrl, e) => {
        e.stopPropagation()
        if (!confirm('Remove this image from the brand?')) return
        setDeletingUrl(imgUrl)
        try {
            const updatedBrandImages = (dna.brandImages || []).filter(i => i.url !== imgUrl)
            const updatedBannerImages = (dna.bannerImages || []).filter(i => i.url !== imgUrl)
            await updateBrandDNA(brandId, { brandImages: updatedBrandImages, bannerImages: updatedBannerImages })
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally {
            setDeletingUrl(null)
        }
    }

    // Keyboard navigation for lightbox
    useEffect(() => {
        if (!lightbox) return
        const handleKey = (e) => {
            if (e.key === 'ArrowLeft') prevImage()
            else if (e.key === 'ArrowRight') nextImage()
            else if (e.key === 'Escape') closeLightbox()
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [lightbox, prevImage, nextImage, closeLightbox])

    const currentImg = lightbox ? lightbox.images[lightbox.index] : null
    const currentConf = currentImg ? (categoryConfig[currentImg._category] || categoryConfig.other) : null

    return (
        <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '460ms' }}>
            <div className="flex items-center justify-between mb-5">
                <SectionHeader icon="photo_library" title="Brand Images" badge={allImages.length} />
                <p className="text-sm text-[var(--sys-text-muted)]">Scraped from your website • Hover for actions</p>
            </div>

            {/* Category sections */}
            <div className="space-y-5">
                {catOrder.map(cat => {
                    const conf = categoryConfig[cat]
                    const imgs = categories[cat]
                    const collapsed = collapsedCats[cat]
                    return (
                        <div key={cat}>
                            {/* Category Header */}
                            <button onClick={() => toggleCat(cat)}
                                className="flex items-center gap-2 mb-3 group cursor-pointer w-full text-left">
                                <div className="size-7 rounded-lg flex items-center justify-center" style={{ background: `${conf.color}15` }}>
                                    <span className="material-symbols-outlined text-sm" style={{ color: conf.color }}>{conf.icon}</span>
                                </div>
                                <span className="text-sm font-bold text-[var(--sys-text)]">{conf.label}</span>
                                <span className="text-xs text-[var(--sys-text-muted)] font-medium">{imgs.length}</span>
                                <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)] group-hover:text-[var(--sys-text-muted)] transition-transform ml-auto" style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                                    expand_more
                                </span>
                            </button>

                            {/* Image Grid */}
                            {!collapsed && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                                    {imgs.map((img, i) => (
                                        <div key={i}
                                            style={{ position: 'relative', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', cursor: 'pointer' }}>
                                            {/* Image */}
                                            <div style={{ overflow: 'hidden', borderRadius: '12px' }}>
                                                <img src={img.url} alt={img.alt || `Image ${i + 1}`}
                                                    style={{ width: '100%', height: '96px', objectFit: 'cover', display: 'block' }}
                                                    loading="lazy"
                                                    onClick={() => openLightbox(img._globalIndex)}
                                                    onError={e => { e.target.closest('[style]').parentElement.style.display = 'none'; }} />
                                            </div>

                                            {/* Action buttons — top-right */}
                                            <div style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '3px', zIndex: 20 }}>
                                                {/* Edit — inline metadata edit */}
                                                <button type="button" onClick={(e) => handleEditImage(img, e)}
                                                    style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(99,102,241,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: 'none', cursor: 'pointer' }}
                                                    title="Edit image info">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>edit</span>
                                                </button>
                                                {/* Enrich — AI Photo Studio */}
                                                <button type="button" onClick={(e) => handleEnrichImage(img.url, e)}
                                                    style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(16,185,129,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: 'none', cursor: 'pointer' }}
                                                    title="Use in AI Photo Studio">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>auto_fix_high</span>
                                                </button>
                                                {/* Delete */}
                                                <button type="button" onClick={(e) => handleDeleteImage(img.url, e)} disabled={deletingUrl === img.url}
                                                    style={{ width: '24px', height: '24px', borderRadius: '6px', background: 'rgba(220,38,38,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', border: 'none', cursor: 'pointer', opacity: deletingUrl === img.url ? 0.4 : 1 }}
                                                    title="Remove image">
                                                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{deletingUrl === img.url ? 'progress_activity' : 'delete'}</span>
                                                </button>
                                            </div>

                                            {/* Source badge */}
                                            <div style={{ position: 'absolute', bottom: '4px', left: '4px', fontSize: '7px', color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '4px', textTransform: 'capitalize', backdropFilter: 'blur(4px)' }}>
                                                {img.source || 'page'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ═══════════ EDIT IMAGE MODAL ═══════════ */}
            {editingImage && (
                <EditModal title="Edit Image" icon="image" onClose={() => setEditingImage(null)} onSave={handleSaveEdit}>
                    {/* Image preview */}
                    <div className="flex items-center gap-4 mb-2">
                        <img src={editingImage.url} alt={editForm.alt} className="w-20 h-20 object-cover rounded-xl border border-[var(--sys-border)]" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--sys-text-muted)] truncate">{editingImage.url}</p>
                        </div>
                    </div>
                    {[
                        { key: 'alt', label: 'Product Name / Title', placeholder: 'e.g. ACwO DwOTS Fire Ultra' },
                        { key: 'description', label: 'Description', placeholder: 'Product or image description...', area: true },
                        { key: 'category', label: 'Category', placeholder: 'e.g. Electronics' },
                        { key: 'vendor', label: 'Brand/Vendor', placeholder: 'e.g. Acme Corp' },
                        { key: 'price', label: 'Price', placeholder: '999', type: 'number' },
                        { key: 'tags', label: 'Tags (comma-separated)', placeholder: 'hero, product, promo' },
                    ].map(f => (
                        <div key={f.key}>
                            <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">{f.label}</label>
                            {f.area ? (
                                <textarea value={editForm[f.key]} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder} rows={3}
                                    className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                            ) : (
                                <input type={f.type || 'text'} value={editForm[f.key]}
                                    onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                                    placeholder={f.placeholder}
                                    className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                            )}
                        </div>
                    ))}
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Source Type</label>
                        <select value={editForm.source} onChange={e => setEditForm(p => ({ ...p, source: e.target.value }))}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]">
                            <option value="page">Page</option>
                            <option value="hero">Hero</option>
                            <option value="promo">Promo</option>
                            <option value="product">Product</option>
                            <option value="partner">Partner</option>
                            <option value="banner">Banner</option>
                            <option value="logo">Logo</option>
                            <option value="social">Social</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </EditModal>
            )}

            {/* ═══════════ LIGHTBOX VIEWER (Portal to body) ═══════════ */}
            {lightbox && currentImg && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={closeLightbox}>
                    <div className="absolute inset-0 bg-[var(--sys-surface)] " />

                    {/* Top bar */}
                    <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-[var(--sys-text)]/70">{lightbox.index + 1} / {lightbox.images.length}</span>
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase" style={{ background: `${currentConf.color}20`, color: currentConf.color }}>
                                {currentConf.label}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <a href={currentImg.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                className="size-9 rounded-xl bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text)]/60 hover:text-[var(--sys-text)] transition-all" title="Open in new tab">
                                <span className="material-symbols-outlined text-lg">open_in_new</span>
                            </a>
                            <button onClick={closeLightbox}
                                className="size-9 rounded-xl bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text)]/60 hover:text-[var(--sys-text)] transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-lg">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Nav arrows */}
                    {lightbox.images.length > 1 && (
                        <>
                            <button onClick={e => { e.stopPropagation(); prevImage() }}
                                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 size-12 rounded-full bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text)]/60 hover:text-[var(--sys-text)] transition-all cursor-pointer border border-[var(--sys-border)]">
                                <span className="material-symbols-outlined text-xl">chevron_left</span>
                            </button>
                            <button onClick={e => { e.stopPropagation(); nextImage() }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 size-12 rounded-full bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text)]/60 hover:text-[var(--sys-text)] transition-all cursor-pointer border border-[var(--sys-border)]">
                                <span className="material-symbols-outlined text-xl">chevron_right</span>
                            </button>
                        </>
                    )}

                    {/* Image */}
                    <img src={currentImg.url} alt={currentImg.alt || ''}
                        className="relative max-w-[85vw] max-h-[80vh] object-contain rounded-xl shadow-2xl"
                        onClick={e => e.stopPropagation()} />

                    {/* Bottom info */}
                    {currentImg.alt && (
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-lg text-center">
                            <p className="text-sm text-[var(--sys-text)]/60 bg-[var(--sys-surface)] px-4 py-2 rounded-xl ">{currentImg.alt}</p>
                        </div>
                    )}

                    {/* Keyboard hint */}
                    <div className="absolute bottom-4 right-4 flex items-center gap-1 text-[10px] text-[var(--sys-text)]/20">
                        <span>← → Navigate</span> • <span>ESC Close</span>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}

// ============================================================================
// KNOWLEDGE BANK — Add knowledge via text, files, or URLs
// ============================================================================
function KnowledgeBank({ brandId, setError }) {
    const [activeTab, setActiveTab] = useState('text') // 'text', 'file', 'url'
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [textInput, setTextInput] = useState('')
    const [textTitle, setTextTitle] = useState('')
    const [urlInput, setUrlInput] = useState('')
    const [urlTitle, setUrlTitle] = useState('')
    const [selectedFile, setSelectedFile] = useState(null)
    const [fileTitle, setFileTitle] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const [deletingId, setDeletingId] = useState(null)
    const [feedback, setFeedback] = useState(null)
    // Duplicate detection state
    const [dupWarnings, setDupWarnings] = useState(null) // { warnings, pendingEntry, formData }

    // Load entries
    useEffect(() => {
        if (!brandId) return
        setLoading(true)
        brandsAPI.getKnowledgeEntries(brandId).then(r => {
            if (r.success) setEntries(r.entries || [])
        }).catch(err => {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }).finally(() => setLoading(false))
    }, [brandId, setError])

    const showFeedback = (msg, ok = true) => {
        setFeedback({ msg, ok })
        setTimeout(() => setFeedback(null), 3500)
    }

    const clearInputs = () => {
        setTextInput(''); setTextTitle('')
        setUrlInput(''); setUrlTitle('')
        setSelectedFile(null); setFileTitle('')
    }

    // Build FormData for current input
    const buildFormData = (overrides = {}) => {
        const formData = new FormData()
        formData.append('sourceType', activeTab)
        if (overrides.force) formData.append('force', 'true')
        if (overrides.replaceEntryId) formData.append('replaceEntryId', overrides.replaceEntryId)

        if (activeTab === 'text') {
            formData.append('text', textInput.trim())
            if (textTitle.trim()) formData.append('title', textTitle.trim())
        } else if (activeTab === 'file') {
            formData.append('file', selectedFile)
            if (fileTitle.trim()) formData.append('title', fileTitle.trim())
        } else if (activeTab === 'url') {
            formData.append('url', urlInput.trim())
            if (urlTitle.trim()) formData.append('title', urlTitle.trim())
        }
        return formData
    }

    const handleSuccess = (result) => {
        showFeedback(`Knowledge added! (${(result.entry?.charCount || 0).toLocaleString()} chars extracted)`)
        setEntries(prev => [{ ...result.entry, preview: result.entry.content?.substring(0, 200) || '' }, ...prev])
        clearInputs()
    }

    // Submit knowledge (first pass — may get warnings)
    const handleSubmit = async () => {
        if (activeTab === 'text' && !textInput.trim()) return showFeedback('Please enter some text', false)
        if (activeTab === 'file' && !selectedFile) return showFeedback('Please select a file', false)
        if (activeTab === 'url' && !urlInput.trim()) return showFeedback('Please enter a URL', false)

        setSubmitting(true)
        try {
            const formData = buildFormData()
            const result = await brandsAPI.ingestKnowledge(brandId, formData)

            if (result.success) {
                handleSuccess(result)
            } else if (result.duplicateWarnings?.length) {
                // Show warning modal — let user decide
                setDupWarnings({
                    warnings: result.duplicateWarnings,
                    pendingEntry: result.pendingEntry,
                })
            } else {
                showFeedback(result.error || 'Failed to add knowledge', false)
            }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally {
            setSubmitting(false)
        }
    }

    // User chose an action from the warning modal
    const handleDuplicateAction = async (action, replaceEntryId) => {
        if (action === 'skip') {
            setDupWarnings(null)
            showFeedback('Skipped — no changes made')
            return
        }

        setSubmitting(true)
        try {
            const overrides = { force: true }
            if (action === 'replace' && replaceEntryId) overrides.replaceEntryId = replaceEntryId
            const formData = buildFormData(overrides)
            const result = await brandsAPI.ingestKnowledge(brandId, formData)

            if (result.success) {
                if (action === 'replace' && replaceEntryId) {
                    // Remove the replaced entry from local state
                    setEntries(prev => prev.filter(e => e.id !== replaceEntryId))
                }
                handleSuccess(result)
                showFeedback(action === 'replace' ? 'Existing entry replaced with new data!' : 'Added alongside existing entry.')
            } else {
                showFeedback(result.error || 'Failed to add knowledge', false)
            }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        } finally {
            setSubmitting(false)
            setDupWarnings(null)
        }
    }

    // Delete entry
    const handleDelete = async (entryId) => {
        setDeletingId(entryId)
        try {
            const r = await brandsAPI.deleteKnowledgeEntry(brandId, entryId)
            if (r.success) {
                setEntries(prev => prev.filter(e => e.id !== entryId))
                showFeedback('Entry removed')
            }
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
        finally { setDeletingId(null) }
    }

    // File handling
    const handleFileDrop = (e) => {
        e.preventDefault(); setDragOver(false)
        const file = e.dataTransfer?.files?.[0]
        if (file) setSelectedFile(file)
    }

    const sourceIcons = { text: 'edit_note', file: 'description', url: 'language' }
    const sourceColors = { text: '#8b5cf6', file: '#f59e0b', url: '#06b6d4' }

    const tabs = [
        { key: 'text', icon: 'edit_note', label: 'Text' },
        { key: 'file', icon: 'upload_file', label: 'Upload File' },
        { key: 'url', icon: 'language', label: 'From URL' },
    ]

    return (
        <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '550ms' }}>
            <SectionHeader icon="school" title="Knowledge Bank" badge={entries.length || null} />

            {/* Feedback toast */}
            {feedback && (
                <div className={`mb-4 p-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in ${feedback.ok ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'}`}>
                    <span className="material-symbols-outlined text-sm">{feedback.ok ? 'check_circle' : 'error'}</span>
                    {feedback.msg}
                </div>
            )}

            {/* Input Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] mb-5 w-fit">
                {tabs.map(t => (
                    <button key={t.key} onClick={() => setActiveTab(t.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === t.key ? 'bg-primary text-white shadow-none' : 'text-[var(--sys-text-muted)] hover:text-white hover:bg-[var(--sys-surface)]'}`}>
                        <span className="material-symbols-outlined text-sm">{t.icon}</span>{t.label}
                    </button>
                ))}
            </div>

            {/* ── Text Input ── */}
            {activeTab === 'text' && (
                <div className="space-y-3">
                    <input type="text" value={textTitle} onChange={e => setTextTitle(e.target.value)}
                        placeholder="Title (optional)" className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                    <textarea value={textInput} onChange={e => setTextInput(e.target.value)} rows={5}
                        placeholder="Paste brand knowledge here — product details, company history, tone guidelines, FAQ content, key differentiators, anything the AI should know..."
                        className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-3 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40 resize-none" />
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--sys-text-muted)]">{textInput.length.toLocaleString()} characters</span>
                        <button onClick={handleSubmit} disabled={submitting || !textInput.trim()}
                            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-30 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">{submitting ? 'progress_activity' : 'add'}</span>
                            {submitting ? 'Processing...' : 'Add Knowledge'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── File Upload ── */}
            {activeTab === 'file' && (
                <div className="space-y-3">
                    <input type="text" value={fileTitle} onChange={e => setFileTitle(e.target.value)}
                        placeholder="Title (optional)" className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                    <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleFileDrop}
                        className={`border border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-primary/50 bg-primary/5' : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'}`}
                        onClick={() => document.getElementById('knowledge-file-input')?.click()}>
                        <input id="knowledge-file-input" type="file" className="hidden" accept=".pdf,.txt,.doc,.docx,.csv,.md"
                            onChange={e => { if (e.target.files?.[0]) setSelectedFile(e.target.files[0]) }} />
                        {selectedFile ? (
                            <div className="flex items-center justify-center gap-3">
                                <span className="material-symbols-outlined text-2xl text-primary">description</span>
                                <div className="text-left">
                                    <p className="text-sm font-bold text-[var(--sys-text)]">{selectedFile.name}</p>
                                    <p className="text-xs text-[var(--sys-text-muted)]">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <button onClick={e => { e.stopPropagation(); setSelectedFile(null) }}
                                    className="ml-3 text-[var(--sys-text-muted)] hover:text-primary transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">close</span>
                                </button>
                            </div>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2 block">cloud_upload</span>
                                <p className="text-sm text-[var(--sys-text-muted)]">Drag & drop a file or click to browse</p>
                                <p className="text-xs text-[var(--sys-text-muted)] mt-1">PDF, TXT, DOC, DOCX, CSV, Markdown — max 10MB</p>
                            </>
                        )}
                    </div>
                    <div className="flex justify-end">
                        <button onClick={handleSubmit} disabled={submitting || !selectedFile}
                            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-30 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">{submitting ? 'progress_activity' : 'upload_file'}</span>
                            {submitting ? 'Extracting text...' : 'Upload & Extract'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── URL Input ── */}
            {activeTab === 'url' && (
                <div className="space-y-3">
                    <input type="text" value={urlTitle} onChange={e => setUrlTitle(e.target.value)}
                        placeholder="Title (optional)" className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">link</span>
                        <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)}
                            placeholder="https://example.com/about-us"
                            className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                    </div>
                    <p className="text-xs text-[var(--sys-text-muted)]">We'll extract text content from this page and add it to your brand's knowledge base.</p>
                    <div className="flex justify-end">
                        <button onClick={handleSubmit} disabled={submitting || !urlInput.trim()}
                            className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-30 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">{submitting ? 'progress_activity' : 'download'}</span>
                            {submitting ? 'Fetching page...' : 'Fetch & Add'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Existing Entries ── */}
            {loading ? (
                <div className="flex items-center justify-center py-6 text-[var(--sys-text-muted)] mt-4">
                    <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading entries...
                </div>
            ) : entries.length > 0 && (
                <div className="mt-6 pt-5 border-t border-[var(--sys-border)]">
                    <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-3">
                        {entries.length} Knowledge {entries.length === 1 ? 'Entry' : 'Entries'}
                    </h4>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {entries.map((entry) => (
                            <div key={entry.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all group">
                                <div className="size-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${sourceColors[entry.sourceType]}15` }}>
                                    <span className="material-symbols-outlined text-base" style={{ color: sourceColors[entry.sourceType] }}>{sourceIcons[entry.sourceType]}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <p className="text-sm font-bold text-[var(--sys-text)] truncate">{entry.title}</p>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] uppercase shrink-0">{entry.sourceType}</span>
                                    </div>
                                    {entry.preview && <p className="text-xs text-[var(--sys-text-muted)] line-clamp-2 leading-relaxed">{entry.preview}</p>}
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">{(entry.charCount || 0).toLocaleString()} chars</span>
                                        {entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline truncate max-w-[200px]">{entry.sourceUrl.replace(/^https?:\/\//, '')}</a>}
                                        {entry.fileName && <span className="text-[10px] text-[var(--sys-text-muted)]">{entry.fileName}</span>}
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">
                                            {entry.addedAt ? new Date(entry.addedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                                        </span>
                                    </div>
                                </div>
                                <button onClick={() => handleDelete(entry.id)} disabled={deletingId === entry.id}
                                    className="opacity-0 group-hover:opacity-100 text-[var(--sys-text-muted)] hover:text-primary transition-all cursor-pointer p-1" title="Remove">
                                    <span className="material-symbols-outlined text-sm">{deletingId === entry.id ? 'progress_activity' : 'delete'}</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════ DUPLICATE WARNING MODAL ═══════════ */}
            {dupWarnings && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" onClick={() => setDupWarnings(null)}>
                    <div className="absolute inset-0 bg-[var(--sys-surface)] " />
                    <div className="relative w-full max-w-lg rounded-2xl border border-[var(--sys-border)] overflow-hidden animate-fade-in"
                        style={{ background: 'rgba(15,15,25,0.97)' }} onClick={e => e.stopPropagation()}>
                        {/* Header */}
                        <div className="p-5 border-b border-[var(--sys-border)]">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="size-12 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                                    <span className="material-symbols-outlined text-2xl text-primary">psychology_alt</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-[var(--sys-text)]">Duplicate Content Detected</h3>
                                    <p className="text-xs text-[var(--sys-text-muted)]">
                                        AI analysis found {dupWarnings.warnings.length} potential {dupWarnings.warnings.length === 1 ? 'match' : 'matches'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Warning cards */}
                        <div className="p-5 max-h-[50vh] overflow-y-auto space-y-3">
                            {dupWarnings.warnings.map((w, i) => {
                                const levelStyles = {
                                    EXACT_DUPLICATE: { bg: 'bg-[var(--sys-primary-dim)]', border: 'border-[var(--sys-border)]', icon: 'content_copy', iconColor: 'text-primary', label: 'Exact Duplicate' },
                                    CONFLICTING_DATA: { bg: 'bg-[var(--sys-primary-dim)]', border: 'border-[var(--sys-border)]', icon: 'warning', iconColor: 'text-primary', label: 'Conflicting Data' },
                                    SAME_SOURCE: { bg: 'bg-[#FF4D00]/8', border: 'border-[#FF4D00]/15', icon: 'source', iconColor: 'text-[#FF4D00]', label: 'Same Source' },
                                    SIMILAR_CONTENT: { bg: 'bg-[var(--sys-border)]/8', border: 'border-[var(--sys-border)]', icon: 'compare', iconColor: 'text-[var(--sys-text-muted)]', label: 'Similar Content' },
                                }
                                const s = levelStyles[w.level] || levelStyles.SIMILAR_CONTENT
                                return (
                                    <div key={i} className={`p-4 rounded-xl ${s.bg} border ${s.border}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`material-symbols-outlined text-base ${s.iconColor}`}>{s.icon}</span>
                                            <span className={`text-xs font-bold uppercase tracking-wider ${s.iconColor}`}>{s.label}</span>
                                        </div>
                                        <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed mb-3">{w.message}</p>

                                        {/* Match details */}
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {w.matchDetails?.contentSimilarity > 0 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">
                                                    Content: {w.matchDetails.contentSimilarity}% match
                                                </span>
                                            )}
                                            {w.matchDetails?.titleSimilarity > 0 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">
                                                    Title: {w.matchDetails.titleSimilarity}% similar
                                                </span>
                                            )}
                                            {w.matchDetails?.sharedEntities?.length > 0 && (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">
                                                    Shared: {w.matchDetails.sharedEntities.join(', ')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Existing entry preview */}
                                        <div className="p-3 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-bold text-[var(--sys-text-muted)]">Existing: {w.existingEntry.title}</span>
                                                <span className="text-[9px] text-[var(--sys-text-muted)]">{(w.existingEntry.charCount || 0).toLocaleString()} chars</span>
                                            </div>
                                            {w.existingEntry.preview && (
                                                <p className="text-[11px] text-[var(--sys-text-muted)] line-clamp-2">{w.existingEntry.preview}</p>
                                            )}
                                        </div>

                                        {/* Per-warning Replace button */}
                                        {(w.level === 'EXACT_DUPLICATE' || w.level === 'CONFLICTING_DATA' || w.level === 'SAME_SOURCE') && (
                                            <button onClick={() => handleDuplicateAction('replace', w.existingEntry.id)}
                                                disabled={submitting}
                                                className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-primary bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] transition-all cursor-pointer disabled:opacity-40 flex items-center justify-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">{submitting ? 'progress_activity' : 'swap_horiz'}</span>
                                                Replace this entry with new data
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-3 p-5 border-t border-[var(--sys-border)]">
                            <button onClick={() => handleDuplicateAction('skip')}
                                className="px-4 py-2.5 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                                Skip — Don't Add
                            </button>
                            <button onClick={() => handleDuplicateAction('keep_both')}
                                disabled={submitting}
                                className="btn-primary px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">{submitting ? 'progress_activity' : 'library_add'}</span>
                                {submitting ? 'Adding...' : 'Keep Both'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ============================================================================
// MAIN BRAND DNA COMPONENT
// ============================================================================

export default function BrandDNA() {
    const navigate = useNavigate()
    const { activeBrand, updateBrandDNA, deleteBrand } = useBrand()
    const [error, setError] = useState(null)

    const brand = activeBrand
    const dna = brand?.dna || {}
    const voice = dna.voice || {}

    // Edit states
    const [editSection, setEditSection] = useState(null) // 'voice', 'colors', 'description', 'contentStyle', 'audience'
    const [editData, setEditData] = useState({})
    const [auditLogs, setAuditLogs] = useState([])
    const [auditLoading, setAuditLoading] = useState(false)
    const [showDelete, setShowDelete] = useState(false)
    const [rescanning, setRescanning] = useState(false)
    const [rescanResult, setRescanResult] = useState(null)
    const [mainTab, setMainTab] = useState('dna') // 'dna' | 'brandkit'
    const [showWizard, setShowWizard] = useState(false)

    // Load audit log
    useEffect(() => {
        if (!brand?._id) return
        setAuditLoading(true)
        brandsAPI.getAuditLog(brand._id)
            .then(data => setAuditLogs(data.logs || []))
            .catch(err => {
                setError({
                    message: err.message,
                    isProviderError: err.isProviderError,
                    provider: err.provider
                })
            })
            .finally(() => setAuditLoading(false))
    }, [brand?._id, setError])

    // Start editing a section
    const startEdit = (section) => {
        if (section === 'voice') {
            setEditData({
                personality: voice.personality || '',
                description: voice.description || '',
                tone: voice.tone || 50,
                clarity: voice.clarity || 50,
                warmth: voice.warmth || 50,
                formality: voice.formality || 50,
                wit: voice.wit || 50,
                sampleQuote: voice.sampleQuote || '',
                keywords: (voice.keywords || []).join(', '),
            })
        } else if (section === 'description') {
            setEditData({
                brandDescription: dna.brandDescription || '',
                targetAudience: dna.targetAudience || '',
                industry: dna.industry || '',
                country: dna.country || 'India',
                defaultLanguage: dna.defaultLanguage || 'english',
                targetMarkets: dna.targetMarkets || [],
            })
        } else if (section === 'contentStyle') {
            setEditData({
                dos: (dna.contentStyle?.dos || []).join('\n'),
                donts: (dna.contentStyle?.donts || []).join('\n'),
                keyPhrases: (dna.contentStyle?.keyPhrases || []).join(', '),
            })
        } else if (section === 'colors') {
            setEditData({
                colors: JSON.stringify(dna.colors || [], null, 2),
            })
        }
        setEditSection(section)
    }

    // Save section edits
    const saveSection = async () => {
        if (!brand?._id) return
        try {
            if (editSection === 'voice') {
                await updateBrandDNA(brand._id, {
                    voice: {
                        personality: editData.personality,
                        description: editData.description,
                        tone: parseInt(editData.tone) || 50,
                        clarity: parseInt(editData.clarity) || 50,
                        warmth: parseInt(editData.warmth) || 50,
                        formality: parseInt(editData.formality) || 50,
                        wit: parseInt(editData.wit) || 50,
                        sampleQuote: editData.sampleQuote,
                        keywords: editData.keywords.split(',').map(k => k.trim()).filter(Boolean),
                    }
                })
            } else if (editSection === 'description') {
                await updateBrandDNA(brand._id, {
                    brandDescription: editData.brandDescription,
                    targetAudience: editData.targetAudience,
                    industry: editData.industry,
                    country: editData.country,
                    defaultLanguage: editData.defaultLanguage,
                    targetMarkets: editData.targetMarkets || [],
                })
            } else if (editSection === 'contentStyle') {
                await updateBrandDNA(brand._id, {
                    contentStyle: {
                        dos: editData.dos.split('\n').map(s => s.trim()).filter(Boolean),
                        donts: editData.donts.split('\n').map(s => s.trim()).filter(Boolean),
                        keyPhrases: editData.keyPhrases.split(',').map(s => s.trim()).filter(Boolean),
                    }
                })
            } else if (editSection === 'colors') {
                try {
                    const colors = JSON.parse(editData.colors)
                    await updateBrandDNA(brand._id, { colors })
                } catch { alert('Invalid JSON for colors'); return }
            }
            setEditSection(null)
            // Refresh audit log
            brandsAPI.getAuditLog(brand._id).then(data => setAuditLogs(data.logs || [])).catch(err => {
                setError({
                    message: err.message,
                    isProviderError: err.isProviderError,
                    provider: err.provider
                })
            })
        } catch (err) {
            setError({
                message: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            })
        }
    }

    // Handle brand deletion
    const handleDeleteBrand = async () => {
        try {
            await deleteBrand(brand._id)
            setShowDelete(false)
            navigate('/dashboard')
        } catch (err) {
            alert(`Failed to delete: ${err.message}`)
        }
    }

    // Format relative time
    const timeAgo = (date) => {
        const d = new Date(date)
        const now = new Date()
        const diff = (now - d) / 1000
        if (diff < 60) return 'Just now'
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
        return `${Math.floor(diff / 86400)}d ago`
    }

    const actionLabels = {
        brand_created: { icon: 'add_circle', label: 'Brand Created', color: 'text-primary' },
        brand_deleted: { icon: 'delete', label: 'Brand Deleted', color: 'text-primary' },
        brand_archived: { icon: 'archive', label: 'Brand Archived', color: 'text-primary' },
        brand_restored: { icon: 'unarchive', label: 'Brand Restored', color: 'text-primary' },
        dna_updated: { icon: 'edit', label: 'DNA Updated', color: 'text-primary' },
        voice_updated: { icon: 'record_voice_over', label: 'Voice Updated', color: 'text-[#FF4D00]' },
        colors_updated: { icon: 'palette', label: 'Colors Updated', color: 'text-[#FF7A00]' },
        fonts_updated: { icon: 'text_fields', label: 'Typography Updated', color: 'text-primary' },
        content_style_updated: { icon: 'checklist', label: 'Style Guide Updated', color: 'text-primary' },
        description_updated: { icon: 'description', label: 'Description Updated', color: 'text-primary' },
        audience_updated: { icon: 'group', label: 'Audience Updated', color: 'text-primary' },
        industry_updated: { icon: 'business', label: 'Industry Updated', color: 'text-[var(--sys-text-muted)]' },
        images_updated: { icon: 'photo_library', label: 'Images Updated', color: 'text-primary' },
        knowledge_added: { icon: 'school', label: 'Knowledge Added', color: 'text-primary' },
        knowledge_removed: { icon: 'remove_circle', label: 'Knowledge Removed', color: 'text-primary' },
        brand_rescanned: { icon: 'language', label: 'Website Rescanned', color: 'text-primary' },
    }

    if (!brand) {
        return (
            <DashboardLayout title="Brand DNA" subtitle="Your brand's intelligence profile">
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <span className="material-symbols-outlined text-6xl text-[var(--sys-text-muted)]">fingerprint</span>
                    <h2 className="text-2xl font-extrabold text-[var(--sys-text)]">No Brand Selected</h2>
                    <p className="text-[var(--sys-text-muted)] text-sm">Create or select a brand to view its DNA.</p>
                    <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm mt-2">
                        Create Brand
                    </button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout key={brand._id} title="Brand DNA" subtitle="Your brand's intelligence profile">
            <SEOHead title="Brand DNA — Mantram AI" noIndex={true} />
            {/* Header */}
            <div className="flex items-end justify-between mb-6">
                <div></div>
                <div className="flex items-center gap-2">
                    <button onClick={async () => {
                        if (rescanning || !brand?.website) return
                        setRescanning(true)
                        setRescanResult(null)
                        try {
                            const res = await brandsAPI.rescan(brand._id)
                            setRescanResult({ success: true, message: res.message || `Re-scan complete! ${res.updates || 0} fields refreshed.` })
                            // Refresh brand context
                            if (res.brand) window.location.reload()
                        } catch (err) {
                            setRescanResult({ success: false, message: err.message || 'Re-scan failed' })
                        } finally { setRescanning(false) }
                    }} disabled={rescanning || !brand?.website}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer disabled:opacity-50 ${
                            rescanning ? 'text-primary bg-primary/10 border border-primary/20' : 'text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/5'
                        }`}>
                        <span className={`material-symbols-outlined text-sm ${rescanning ? 'animate-spin' : ''}`}>
                            {rescanning ? 'progress_activity' : 'language'}
                        </span>
                        {rescanning ? 'Scanning Website...' : 'Re-scan Website'}
                    </button>
                    <button onClick={() => setShowDelete(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-primary/60 hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">delete</span> Delete Brand
                    </button>
                </div>
            </div>

            {/* Rescan Status Banner */}
            {rescanning && (
                <div className="glass-panel rounded-2xl p-4 mb-4 flex items-center gap-3 border border-primary/20 bg-primary/5 animate-fade-in">
                    <span className="material-symbols-outlined text-primary animate-spin">progress_activity</span>
                    <div>
                        <div className="text-sm font-medium text-[var(--sys-text)]">Scanning your website...</div>
                        <div className="text-xs text-[var(--sys-text-muted)]">Refreshing brand images, products, and DNA. This may take up to a minute.</div>
                    </div>
                </div>
            )}
            {rescanResult && !rescanning && (
                <div className={`glass-panel rounded-2xl p-4 mb-4 flex items-center gap-3 border animate-fade-in ${
                    rescanResult.success ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)]' : 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)]'
                }`}>
                    <span className={`material-symbols-outlined ${rescanResult.success ? 'text-primary' : 'text-primary'}`}>
                        {rescanResult.success ? 'check_circle' : 'error'}
                    </span>
                    <div className="text-sm text-[var(--sys-text)] flex-1">{rescanResult.message}</div>
                    <button onClick={() => setRescanResult(null)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* Brand Identity Header */}
            <div className="glass-panel rounded-2xl p-6 mb-6 flex items-center gap-6 animate-fade-in">
                <div className="size-20 rounded-2xl flex items-center justify-center text-3xl font-black text-[var(--sys-text)]"
                    style={{ background: dna.colors?.[0]?.hex || '#2B4BEE' }}>
                    {brand.dna?.logo?.url ? (
                        <img src={brand.dna.logo.url} alt="logo" className="w-full h-full object-contain rounded-2xl" />
                    ) : (
                        brand.name?.charAt(0)?.toUpperCase()
                    )}
                </div>
                <div className="flex-1">
                    <h3 className="text-2xl font-extrabold text-[var(--sys-text)]">{brand.name}</h3>
                    {brand.website && <p className="text-sm text-primary">{brand.website}</p>}
                    {dna.brandDescription && <p className="text-sm text-[var(--sys-text-muted)] mt-1 line-clamp-2">{dna.brandDescription}</p>}
                    <div className="flex gap-2 mt-2 flex-wrap">
                        {dna.industry && <span className="px-2 py-0.5 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)]">{dna.industry}</span>}
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)] capitalize">{brand.onboardingMethod}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${brand.status === 'active' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)]'}`}>{brand.status}</span>
                        {dna.targetMarkets?.length > 0 && (
                            <>
                                <span className="text-[var(--sys-text-muted)] text-xs self-center">•</span>
                                {dna.targetMarkets.map(m => {
                                    const flags = { IN: '🇮🇳', US: '🇺🇸', CA: '🇨🇦', UK: '🇬🇧', EU: '🇪🇺', AE: '🇦🇪', SA: '🇸🇦', SG: '🇸🇬', MY: '🇲🇾', ID: '🇮🇩', TH: '🇹🇭', AU: '🇦🇺', NZ: '🇳🇿', BR: '🇧🇷', JP: '🇯🇵', KR: '🇰🇷' };
                                    return <span key={m} className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold" title={`Target Market: ${m}`}>{flags[m] || 'language'} {m}</span>;
                                })}
                            </>
                        )}
                    </div>
                </div>
                <button onClick={() => startEdit('description')}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-sm text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/5 transition-all cursor-pointer shrink-0">
                    <span className="material-symbols-outlined text-sm">edit</span> Edit Info
                </button>
                {brand.aiContext?.totalFeedback > 0 && (
                    <div className="text-center glass-panel px-5 py-3 rounded-xl shrink-0">
                        <p className="text-2xl font-extrabold text-primary">{brand.aiContext.totalFeedback}</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">AI learnings</p>
                    </div>
                )}
            </div>

            {/* ── Tab Navigation ── */}
            <div className="flex items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-1 p-1 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit">
                    {[
                        { id: 'dna',      icon: 'psychology',    label: 'Brand DNA' },
                        { id: 'brandkit', icon: 'auto_awesome',  label: 'Brand Kit Studio' },
                    ].map(tab => (
                        <button key={tab.id}
                            onClick={() => setMainTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                                mainTab === tab.id
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                    : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'
                            }`}>
                            <span className="material-symbols-outlined text-[1.1rem]">{tab.icon}</span>
                            {tab.label}
                            {tab.id === 'brandkit' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-white/20 text-[10px] font-bold tracking-wider">
                                    NEW
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Wizard CTA — shown on Brand Kit tab */}
                {mainTab === 'brandkit' && (
                    <button
                        onClick={() => setShowWizard(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-sm font-medium hover:bg-primary/10 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">wand_stars</span>
                        New Brand Wizard
                    </button>
                )}
            </div>

            {/* ── Brand Kit Studio Tab ── */}
            {mainTab === 'brandkit' && (
                <div className="grid grid-cols-12 gap-6">
                    <BrandKitStudio brand={brand} />
                </div>
            )}

            {/* ── Brand DNA Tab (all original content) ── */}
            {mainTab === 'dna' && <div className="grid grid-cols-12 gap-6">
                {/* Color Palette */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '80ms' }}>
                    <SectionHeader icon="palette" title="Color Palette" onEdit={() => startEdit('colors')} />
                    {dna.colors?.length > 0 ? (
                        <div className="flex gap-4 flex-wrap">
                            {dna.colors.map((c, i) => (
                                <div key={i} className="text-center group">
                                    <div className="w-16 h-16 rounded-xl border border-[var(--sys-border)] shadow-lg group-hover:scale-110 transition-transform"
                                        style={{ background: c.hex }} />
                                    <p className="text-sm text-[var(--sys-text)] mt-2 font-medium">{c.name}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)] font-mono">{c.hex}</p>
                                    <p className="text-sm text-primary capitalize">{c.usage}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[var(--sys-text-muted)] text-sm">No colors extracted yet.</p>
                    )}
                </div>

                {/* Typography */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '160ms' }}>
                    <SectionHeader icon="text_fields" title="Typography" />
                    {dna.fonts ? (
                        <div className="space-y-4">
                            {[
                                { label: 'Heading', data: dna.fonts.heading },
                                { label: 'Body', data: dna.fonts.body },
                                { label: 'Accent', data: dna.fonts.accent },
                            ].filter(f => f.data?.family).map((f, i) => (
                                <div key={i} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-1">{f.label} Font</p>
                                    <p className="text-lg text-[var(--sys-text)] font-bold" style={{ fontFamily: f.data.family }}>{f.data.family}</p>
                                    <p className="text-sm text-[var(--sys-text-muted)]">Weight: {f.data.weight || 'Regular'} • Style: {f.data.style || 'Normal'}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[var(--sys-text-muted)] text-sm">No typography data yet.</p>
                    )}
                </div>

                {/* Voice & Tone */}
                <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '240ms' }}>
                    <SectionHeader icon="record_voice_over" title="Voice & Tone" onEdit={() => startEdit('voice')} />
                    {voice.personality ? (
                        <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-12 md:col-span-5">
                                <p className="text-xl text-primary font-extrabold mb-2">{voice.personality}</p>
                                {voice.description && <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{voice.description}</p>}
                                {voice.sampleQuote && (
                                    <blockquote className="mt-4 p-4 rounded-xl bg-primary/5 border-l-2 border-primary text-sm text-[var(--sys-text-muted)] italic">
                                        "{voice.sampleQuote}"
                                    </blockquote>
                                )}
                                {voice.keywords?.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-sm text-[var(--sys-text-muted)] uppercase tracking-widest mb-2">Brand Keywords</p>
                                        <div className="flex flex-wrap gap-2">
                                            {voice.keywords.map((k, i) => (
                                                <span key={i} className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">{k}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div className="col-span-12 md:col-span-7 space-y-3">
                                {[
                                    { label: 'Tone', value: voice.tone, low: 'Casual', high: 'Authoritative' },
                                    { label: 'Clarity', value: voice.clarity, low: 'Nuanced', high: 'Crystal Clear' },
                                    { label: 'Warmth', value: voice.warmth, low: 'Cool', high: 'Very Warm' },
                                    { label: 'Formality', value: voice.formality, low: 'Informal', high: 'Formal' },
                                    { label: 'Wit', value: voice.wit, low: 'Serious', high: 'Witty' },
                                ].filter(v => v.value !== undefined).map((v, i) => (
                                    <div key={i} className="p-3 rounded-xl bg-[var(--sys-surface)]">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-sm font-bold text-[var(--sys-text)]">{v.label}</span>
                                            <span className="text-sm text-primary font-bold">{v.value}%</span>
                                        </div>
                                        <div className="relative">
                                            <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-xs text-[var(--sys-text-muted)]">{v.low}</span>
                                                <span className="text-xs text-[var(--sys-text-muted)]">{v.high}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-[var(--sys-text-muted)] text-sm">No voice data yet. Scan a website or brainstorm to generate voice profile.</p>
                    )}
                </div>

                {/* Content Style Guide */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '320ms' }}>
                    <SectionHeader icon="checklist" title="Content Style Guide" onEdit={() => startEdit('contentStyle')} />
                    {dna.contentStyle?.dos?.length > 0 || dna.contentStyle?.donts?.length > 0 ? (
                        <div className="space-y-4">
                            {dna.contentStyle.dos?.length > 0 && (
                                <div>
                                    <p className="text-sm text-primary font-bold mb-2"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> ALWAYS</p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.dos.map((d, i) => (
                                            <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-2">
                                                <span className="text-primary mt-1">•</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {dna.contentStyle.donts?.length > 0 && (
                                <div>
                                    <p className="text-sm text-primary font-bold mb-2"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">cancel</span> NEVER</p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.donts.map((d, i) => (
                                            <li key={i} className="text-sm text-[var(--sys-text-muted)] flex items-start gap-2">
                                                <span className="text-primary mt-1">•</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-[var(--sys-text-muted)] text-sm">Style guide will be generated as the AI learns from your feedback.</p>
                    )}
                </div>

                {/* AI Learning Status */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '400ms' }}>
                    <SectionHeader icon="psychology" title="AI Learning Status" />
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                <p className="text-2xl font-extrabold text-primary">{brand.aiContext?.totalFeedback || 0}</p>
                                <p className="text-sm text-[var(--sys-text-muted)]">Feedback Signals</p>
                            </div>
                            <div className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                <p className="text-2xl font-extrabold text-primary">
                                    {brand.aiContext?.avgRating ? `${(brand.aiContext.avgRating * 100).toFixed(0)}%` : '—'}
                                </p>
                                <p className="text-sm text-[var(--sys-text-muted)]">Satisfaction</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-primary/10">
                            <p className="text-sm text-primary font-bold mb-1"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">psychology</span> How the AI learns</p>
                            <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">
                                Every like, dislike, edit, and regeneration teaches the AI your preferences.
                                After enough feedback, generated content becomes indistinguishable from your own writing.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ═══════════ BRAND IMAGES — Categorized Gallery ═══════════ */}
                <BrandImageGallery dna={dna} brandId={brand._id} updateBrandDNA={updateBrandDNA} setError={setError} />

                {/* ═══════════ PRODUCTS ═══════════ */}
                <ProductCatalog brandId={brand._id} brandWebsite={brand.website || ''} setError={setError} />

                {/* ═══════════ KNOWLEDGE BANK ═══════════ */}
                <KnowledgeBank brandId={brand._id} setError={setError} />

                {/* ═══════════ KNOWLEDGE CHANGE LOG ═══════════ */}
                <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '600ms' }}>
                    <SectionHeader icon="history" title="Knowledge Change Log" badge={auditLogs.length || null} />
                    {auditLoading ? (
                        <div className="flex items-center justify-center py-6 text-[var(--sys-text-muted)]">
                            <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...
                        </div>
                    ) : auditLogs.length === 0 ? (
                        <div className="text-center py-6">
                            <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)] mb-2 block">history</span>
                            <p className="text-sm text-[var(--sys-text-muted)]">No changes recorded yet. Edits to brand knowledge will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                            {auditLogs.map((log, i) => {
                                const meta = actionLabels[log.action] || { icon: 'edit', label: log.action, color: 'text-[var(--sys-text-muted)]' }
                                return (
                                    <div key={log._id || i} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-colors">
                                        <span className={`material-symbols-outlined text-lg mt-0.5 ${meta.color}`}>{meta.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-bold text-[var(--sys-text)]">{meta.label}</span>
                                                {log.section && (
                                                    <span className="px-2 py-0.5 rounded bg-[var(--sys-surface)] text-xs text-[var(--sys-text-muted)]">{log.section}</span>
                                                )}
                                            </div>
                                            {log.summary && <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">{log.summary}</p>}
                                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">
                                                by <span className="text-[var(--sys-text-muted)]">{log.userName || 'Unknown'}</span> • {timeAgo(log.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>}

            {/* ── Brand Kit Wizard Modal ── */}
            {showWizard && (
                <BrandKitWizard
                    onClose={() => setShowWizard(false)}
                    onComplete={(result) => {
                        setShowWizard(false)
                        setMainTab('brandkit')
                    }}
                />
            )}

            {/* ═══════════ EDIT MODALS ═══════════ */}

            {editSection === 'voice' && (
                <EditModal title="Edit Voice & Tone" icon="record_voice_over" onClose={() => setEditSection(null)} onSave={saveSection}>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Personality</label>
                        <input type="text" value={editData.personality} onChange={e => setEditData(p => ({ ...p, personality: e.target.value }))}
                            placeholder="e.g. Professional & Bold" className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Description</label>
                        <textarea value={editData.description} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))}
                            placeholder="How this brand communicates..." rows={3} className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    {[
                        { key: 'tone', label: 'Tone', low: 'Casual', high: 'Authoritative' },
                        { key: 'clarity', label: 'Clarity', low: 'Nuanced', high: 'Crystal Clear' },
                        { key: 'warmth', label: 'Warmth', low: 'Cool', high: 'Very Warm' },
                        { key: 'formality', label: 'Formality', low: 'Informal', high: 'Formal' },
                        { key: 'wit', label: 'Wit', low: 'Serious', high: 'Witty' },
                    ].map(s => (
                        <div key={s.key}>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-sm text-[var(--sys-text-muted)]">{s.label}</label>
                                <span className="text-sm text-primary font-bold">{editData[s.key]}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={editData[s.key]}
                                onChange={e => setEditData(p => ({ ...p, [s.key]: e.target.value }))}
                                className="w-full accent-primary" />
                            <div className="flex justify-between">
                                <span className="text-[10px] text-[var(--sys-text-muted)]">{s.low}</span>
                                <span className="text-[10px] text-[var(--sys-text-muted)]">{s.high}</span>
                            </div>
                        </div>
                    ))}
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Sample Quote</label>
                        <textarea value={editData.sampleQuote} onChange={e => setEditData(p => ({ ...p, sampleQuote: e.target.value }))}
                            placeholder="A quote that embodies this brand's voice" rows={2} className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Keywords (comma-separated)</label>
                        <input type="text" value={editData.keywords} onChange={e => setEditData(p => ({ ...p, keywords: e.target.value }))}
                            placeholder="bold, modern, premium" className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                    </div>
                </EditModal>
            )}

            {editSection === 'description' && (
                <EditModal title="Edit Brand Information" icon="description" onClose={() => setEditSection(null)} onSave={saveSection}>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Brand Description</label>
                        <textarea value={editData.brandDescription} onChange={e => setEditData(p => ({ ...p, brandDescription: e.target.value }))}
                            placeholder="What does this brand do..." rows={4} className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Target Audience</label>
                        <textarea value={editData.targetAudience} onChange={e => setEditData(p => ({ ...p, targetAudience: e.target.value }))}
                            placeholder="Who is this brand for..." rows={2} className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Industry</label>
                        <input type="text" value={editData.industry} onChange={e => setEditData(p => ({ ...p, industry: e.target.value }))}
                            placeholder="e.g. Fashion, Technology, Healthcare" className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Country (Origin)</label>
                            <input type="text" value={editData.country} onChange={e => setEditData(p => ({ ...p, country: e.target.value }))}
                                className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                        </div>
                        <div>
                            <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Default Language</label>
                            <input type="text" value={editData.defaultLanguage} onChange={e => setEditData(p => ({ ...p, defaultLanguage: e.target.value }))}
                                className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                        </div>
                    </div>
                    {/* Target Markets Multi-Select */}
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1.5 block">Target Markets</label>
                        <p className="text-xs text-[var(--sys-text-muted)] mb-3">Select the markets where this brand sells or advertises. AI will adapt all content — festivals, currency, language, cultural references — for these markets.</p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { code: 'IN', flag: '🇮🇳', name: 'India' },
                                { code: 'US', flag: '🇺🇸', name: 'United States' },
                                { code: 'CA', flag: '🇨🇦', name: 'Canada' },
                                { code: 'UK', flag: '🇬🇧', name: 'United Kingdom' },
                                { code: 'EU', flag: '🇪🇺', name: 'Europe' },
                                { code: 'AE', flag: '🇦🇪', name: 'UAE' },
                                { code: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
                                { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
                                { code: 'MY', flag: '🇲🇾', name: 'Malaysia' },
                                { code: 'ID', flag: '🇮🇩', name: 'Indonesia' },
                                { code: 'TH', flag: '🇹🇭', name: 'Thailand' },
                                { code: 'AU', flag: '🇦🇺', name: 'Australia' },
                                { code: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
                                { code: 'BR', flag: '🇧🇷', name: 'Brazil' },
                                { code: 'JP', flag: '🇯🇵', name: 'Japan' },
                                { code: 'KR', flag: '🇰🇷', name: 'South Korea' },
                            ].map(market => {
                                const isSelected = (editData.targetMarkets || []).includes(market.code);
                                return (
                                    <button key={market.code} type="button"
                                        onClick={() => setEditData(p => ({
                                            ...p,
                                            targetMarkets: isSelected
                                                ? (p.targetMarkets || []).filter(m => m !== market.code)
                                                : [...(p.targetMarkets || []), market.code]
                                        }))}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${isSelected
                                            ? 'bg-primary/15 text-primary border-primary/30 shadow-md shadow-none'
                                            : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border-[var(--sys-border)] hover:border-[var(--sys-border)] hover:text-[var(--sys-text-muted)]'
                                            }`}>
                                        <span className="text-sm">{market.flag}</span>
                                        {market.name}
                                        {isSelected && <span className="material-symbols-outlined text-xs">check</span>}
                                    </button>
                                );
                            })}
                        </div>
                        {(editData.targetMarkets || []).length === 0 && (
                            <p className="text-xs text-primary/70 mt-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">info</span>
                                No markets selected — AI will auto-detect from the Country field above.
                            </p>
                        )}
                        {(editData.targetMarkets || []).length > 0 && (
                            <p className="text-xs text-primary/70 mt-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                {(editData.targetMarkets || []).length} market{(editData.targetMarkets || []).length > 1 ? 's' : ''} selected — AI will adapt content for {(editData.targetMarkets || []).join(', ')}
                            </p>
                        )}
                    </div>
                </EditModal>
            )}

            {editSection === 'contentStyle' && (
                <EditModal title="Edit Content Style Guide" icon="checklist" onClose={() => setEditSection(null)} onSave={saveSection}>
                    <div>
                        <label className="text-sm text-primary font-bold mb-1 block"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> ALWAYS (one per line)</label>
                        <textarea value={editData.dos} onChange={e => setEditData(p => ({ ...p, dos: e.target.value }))}
                            placeholder="Use active voice&#10;Keep sentences short&#10;Include data points" rows={5}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    <div>
                        <label className="text-sm text-primary font-bold mb-1 block"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">cancel</span> NEVER (one per line)</label>
                        <textarea value={editData.donts} onChange={e => setEditData(p => ({ ...p, donts: e.target.value }))}
                            placeholder="Don't use jargon&#10;Avoid passive voice&#10;Don't exaggerate claims" rows={5}
                            className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] resize-none" />
                    </div>
                    <div>
                        <label className="text-sm text-[var(--sys-text-muted)] mb-1 block">Key Phrases (comma-separated)</label>
                        <input type="text" value={editData.keyPhrases} onChange={e => setEditData(p => ({ ...p, keyPhrases: e.target.value }))}
                            placeholder="innovation, quality, trust" className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)]" />
                    </div>
                </EditModal>
            )}

            {editSection === 'colors' && (
                <EditModal title="Edit Color Palette" icon="palette" onClose={() => setEditSection(null)} onSave={saveSection}>
                    <p className="text-sm text-[var(--sys-text-muted)] mb-2">Edit the JSON array below. Each color should have: name, hex, usage (primary/secondary/accent/background)</p>
                    <textarea value={editData.colors} onChange={e => setEditData(p => ({ ...p, colors: e.target.value }))}
                        rows={12} className="w-full input-glass rounded-xl p-3 text-sm text-[var(--sys-text)] font-mono resize-none" />
                </EditModal>
            )}

            {error && (
                <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-base">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}
            {/* Delete Confirmation */}
            {showDelete && <DeleteBrandModal brand={brand} onClose={() => setShowDelete(false)} onConfirm={handleDeleteBrand} />}

            {/* ── Brand Kit Wizard Modal ── */}
            {showWizard && (
                <BrandKitWizard
                    onClose={() => setShowWizard(false)}
                    onComplete={(result) => {
                        setShowWizard(false)
                        setMainTab('brandkit') // Switch to Brand Kit Studio tab
                    }}
                />
            )}
        </DashboardLayout>
    )
}

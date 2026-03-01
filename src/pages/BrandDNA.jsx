import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { products as productsAPI } from '../services/api'

// ============================================================================
// PRODUCT CATALOG COMPONENTS
// ============================================================================

function AddProductModal({ brandId, onClose, onSaved, editProduct }) {
    const [form, setForm] = useState({
        title: editProduct?.title || '',
        description: editProduct?.description || '',
        type: editProduct?.type || 'product',
        category: editProduct?.category || '',
        subCategory: editProduct?.subCategory || '',
        imageUrl: editProduct?.images?.[0]?.url || '',
        priceAmount: editProduct?.price?.amount || '',
        priceMrp: editProduct?.price?.mrp || '',
        features: editProduct?.features?.join('\n') || '',
        tags: editProduct?.tags?.join(', ') || '',
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const handleSave = async () => {
        if (!form.title.trim()) { setError('Product name is required'); return }
        setSaving(true)
        setError('')
        try {
            const data = {
                brandId,
                title: form.title.trim(),
                description: form.description.trim(),
                type: form.type,
                category: form.category.trim(),
                subCategory: form.subCategory.trim(),
                images: form.imageUrl.trim() ? [{ url: form.imageUrl.trim(), alt: form.title.trim() }] : [],
                price: {
                    amount: parseFloat(form.priceAmount) || 0,
                    currency: 'INR',
                    mrp: parseFloat(form.priceMrp) || undefined,
                },
                features: form.features.split('\n').map(f => f.trim()).filter(Boolean),
                tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            }

            if (editProduct?._id) {
                await productsAPI.update(editProduct._id, data)
            } else {
                await productsAPI.create(data)
            }
            onSaved()
        } catch (err) {
            setError(err.message || 'Failed to save')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="glass-panel rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-extrabold text-white">
                        <span className="material-symbols-outlined text-primary align-middle mr-2">
                            {editProduct ? 'edit' : 'add_circle'}
                        </span>
                        {editProduct ? 'Edit Product' : 'Add Product / Service'}
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">{error}</div>
                )}

                <div className="space-y-4">
                    {/* Type Toggle */}
                    <div className="flex gap-2">
                        {['product', 'service'].map(t => (
                            <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer capitalize ${form.type === t ? 'bg-primary text-white' : 'glass-panel text-slate-400 hover:text-white'}`}>
                                <span className="material-symbols-outlined text-sm mr-1 align-middle">
                                    {t === 'product' ? 'inventory_2' : 'handyman'}
                                </span>
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* Title */}
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Name *</label>
                        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Wireless Earbuds Pro, Logo Design Service"
                            className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Description</label>
                        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Describe the product or service..."
                            rows={3} className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm resize-none" />
                    </div>

                    {/* Image URL */}
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Image URL</label>
                        <input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                            placeholder="https://example.com/product-image.jpg"
                            className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                        {form.imageUrl && (
                            <img src={form.imageUrl} alt="Preview" className="mt-2 h-20 w-20 rounded-xl object-cover border border-white/10"
                                onError={e => { e.target.style.display = 'none' }} />
                        )}
                    </div>

                    {/* Category + SubCategory */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Category</label>
                            <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                placeholder="e.g. Electronics" className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Sub-Category</label>
                            <input value={form.subCategory} onChange={e => setForm(f => ({ ...f, subCategory: e.target.value }))}
                                placeholder="e.g. Earphones" className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                        </div>
                    </div>

                    {/* Price */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Price (₹)</label>
                            <input type="number" value={form.priceAmount} onChange={e => setForm(f => ({ ...f, priceAmount: e.target.value }))}
                                placeholder="999" className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">MRP (₹)</label>
                            <input type="number" value={form.priceMrp} onChange={e => setForm(f => ({ ...f, priceMrp: e.target.value }))}
                                placeholder="1499" className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                        </div>
                    </div>

                    {/* Features */}
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Key Features (one per line)</label>
                        <textarea value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))}
                            placeholder={"Active Noise Cancellation\n40-hour battery life\nIPX5 water resistant"}
                            rows={3} className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm resize-none font-mono" />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1 block">Tags (comma-separated)</label>
                        <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                            placeholder="wireless, bluetooth, premium" className="input-glass w-full py-2.5 px-3.5 rounded-xl text-sm" />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 glass-panel py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all cursor-pointer">
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 btn-primary py-3 rounded-xl text-sm font-bold disabled:opacity-50">
                        {saving ? (
                            <><span className="material-symbols-outlined text-sm animate-spin mr-1 align-middle">progress_activity</span> Saving...</>
                        ) : (
                            <><span className="material-symbols-outlined text-sm mr-1 align-middle">check</span> {editProduct ? 'Update' : 'Add Product'}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

function ProductCard({ product, onEdit, onDelete, onEnrich }) {
    const [enriching, setEnriching] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const handleEnrich = async () => {
        setEnriching(true)
        try {
            await onEnrich(product._id)
        } finally {
            setEnriching(false)
        }
    }

    const handleDelete = async () => {
        if (!confirm('Archive this product?')) return
        setDeleting(true)
        try {
            await onDelete(product._id)
        } finally {
            setDeleting(false)
        }
    }

    const img = product.images?.[0]?.url
    const price = product.price?.amount

    return (
        <div className="glass-panel rounded-2xl overflow-hidden group hover:border-primary/30 transition-all">
            {/* Image */}
            <div className="h-36 bg-gradient-to-br from-white/[0.03] to-white/[0.01] flex items-center justify-center relative overflow-hidden">
                {img ? (
                    <img src={img} alt={product.title} className="w-full h-full object-cover" />
                ) : (
                    <span className="material-symbols-outlined text-4xl text-slate-600">
                        {product.type === 'service' ? 'handyman' : 'inventory_2'}
                    </span>
                )}
                {/* Type badge */}
                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase ${product.type === 'service' ? 'bg-violet-500/20 text-violet-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                    {product.type}
                </span>
                {product.aiEnriched && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-primary/20 text-primary text-[10px] font-bold">
                        ✨ AI Enriched
                    </span>
                )}
                {product.source !== 'manual' && (
                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-lg bg-white/10 text-white/60 text-[10px] font-bold capitalize">
                        via {product.source}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="p-4">
                <h4 className="text-sm font-bold text-white truncate">{product.title}</h4>
                <div className="flex items-center gap-1.5 mt-1">
                    {product.source && product.source !== 'manual' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${product.source === 'shopify_public' || product.source === 'shopify' ? 'bg-green-500/15 text-green-400' :
                                product.source === 'website_scan' ? 'bg-blue-500/15 text-blue-400' : 'bg-slate-500/15 text-slate-400'
                            }`}>
                            {product.source === 'shopify_public' || product.source === 'shopify' ? '🛒 Shopify' :
                                product.source === 'website_scan' ? '🌐 Scanned' : product.source}
                        </span>
                    )}
                    {product.aiEnriched && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold">✨ AI</span>
                    )}
                </div>
                {product.category && (
                    <p className="text-[10px] text-slate-500 mt-0.5">{product.category}{product.subCategory ? ` › ${product.subCategory}` : ''}</p>
                )}
                {price > 0 && (
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-sm font-extrabold text-primary">₹{price.toLocaleString()}</span>
                        {product.price?.mrp > price && (
                            <span className="text-xs text-slate-500 line-through">₹{product.price.mrp.toLocaleString()}</span>
                        )}
                    </div>
                )}
                {product.features?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {product.features.slice(0, 2).map((f, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-slate-400 truncate max-w-[120px]">{f}</span>
                        ))}
                        {product.features.length > 2 && (
                            <span className="text-[10px] text-slate-500">+{product.features.length - 2} more</span>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-1.5 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onEdit(product)} title="Edit"
                        className="flex-1 py-1.5 rounded-lg glass-panel text-[10px] text-slate-400 hover:text-white transition-all cursor-pointer font-bold">
                        <span className="material-symbols-outlined text-xs">edit</span> Edit
                    </button>
                    <button onClick={handleEnrich} disabled={enriching} title="AI Enrich"
                        className="flex-1 py-1.5 rounded-lg glass-panel text-[10px] text-primary hover:bg-primary/10 transition-all cursor-pointer font-bold disabled:opacity-50">
                        <span className={`material-symbols-outlined text-xs ${enriching ? 'animate-spin' : ''}`}>
                            {enriching ? 'progress_activity' : 'auto_awesome'}
                        </span> {enriching ? '...' : 'Enrich'}
                    </button>
                    <button onClick={handleDelete} disabled={deleting} title="Archive"
                        className="py-1.5 px-2 rounded-lg glass-panel text-[10px] text-rose-400 hover:bg-rose-400/10 transition-all cursor-pointer disabled:opacity-50">
                        <span className="material-symbols-outlined text-xs">delete</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

function ProductCatalog({ brandId, brandWebsite }) {
    const [productsList, setProductsList] = useState([])
    const [loading, setLoading] = useState(true)
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [showAdd, setShowAdd] = useState(false)
    const [editProduct, setEditProduct] = useState(null)
    const [searchQuery, setSearchQuery] = useState('')
    // Agentic sync state
    const [scanning, setScanning] = useState(false)
    const [scanResult, setScanResult] = useState(null)
    const [showScanInput, setShowScanInput] = useState(false)
    const [scanUrl, setScanUrl] = useState(brandWebsite || '')

    const fetchProducts = async () => {
        setLoading(true)
        try {
            const res = await productsAPI.list({ brandId, page, limit: 12, search: searchQuery || undefined })
            setProductsList(res.products || [])
            setTotal(res.total || 0)
        } catch (err) {
            console.error('Failed to load products', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { if (brandId) fetchProducts() }, [brandId, page])

    const handleSearch = () => { setPage(1); fetchProducts() }

    const handleSaved = () => {
        setShowAdd(false)
        setEditProduct(null)
        fetchProducts()
    }

    const handleEnrich = async (id) => {
        await productsAPI.aiEnrich(id)
        fetchProducts()
    }

    const handleDelete = async (id) => {
        await productsAPI.delete(id)
        fetchProducts()
    }

    const handleScanWebsite = async () => {
        setScanning(true)
        setScanResult(null)
        try {
            const result = await productsAPI.scanWebsite({
                brandId,
                websiteUrl: scanUrl || undefined,
            })
            setScanResult(result)
            setShowScanInput(false)
            setScanUrl(brandWebsite || '')
            fetchProducts() // Refresh product list after scan
            // Auto-trigger AI enrichment in background (non-blocking)
            if (result.productsCreated > 0) {
                productsAPI.enrich({ brandId }).catch(() => { })
            }
        } catch (err) {
            setScanResult({ success: false, error: err.message || 'Scan failed' })
        } finally {
            setScanning(false)
        }
    }

    return (
        <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '480ms' }}>
            <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">inventory_2</span>
                    Products & Services
                    {total > 0 && (
                        <span className="ml-2 px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-bold">{total}</span>
                    )}
                </h3>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            placeholder="Search products..."
                            className="input-glass py-1.5 pl-8 pr-3 rounded-xl text-xs w-40 bg-white/[0.04]" />
                        <span className="material-symbols-outlined text-sm text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
                    </div>
                    <button onClick={() => {
                        if (brandWebsite && !showScanInput) {
                            // One-click scan with known website
                            handleScanWebsite()
                        } else {
                            setShowScanInput(!showScanInput)
                        }
                    }} disabled={scanning}
                        className="glass-panel py-2 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-cyan-400 hover:bg-cyan-400/10 transition-all disabled:opacity-50 border border-cyan-400/20"
                        title={brandWebsite ? `Scan ${brandWebsite}` : 'Enter website URL to scan'}>
                        <span className="material-symbols-outlined text-sm">{scanning ? 'progress_activity' : 'radar'}</span>
                        {scanning ? 'Scanning...' : 'Scan Website'}
                    </button>
                    <button onClick={() => { setEditProduct(null); setShowAdd(true) }}
                        className="btn-primary py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span> Add Product
                    </button>
                </div>
            </div>

            {/* Scan Website Input */}
            {showScanInput && (
                <div className="mb-5 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 animate-fade-in">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-cyan-400 text-lg">smart_toy</span>
                        <h4 className="text-sm font-bold text-white">AI Product Scanner</h4>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                        {brandWebsite
                            ? `Your brand website (${brandWebsite}) is pre-filled. Change the URL below if you have a different products page.`
                            : 'Enter your website URL — our AI agent will discover all products/services and auto-add them to your catalog.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <input value={scanUrl} onChange={e => setScanUrl(e.target.value)}
                            placeholder="https://yourbrand.com/products"
                            className="input-glass flex-1 py-2.5 px-3 rounded-xl text-sm bg-white/[0.04]" />
                        <button onClick={handleScanWebsite} disabled={scanning || !scanUrl.trim()}
                            className="btn-primary py-2.5 px-5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 flex items-center gap-2 shrink-0">
                            <span className="material-symbols-outlined text-sm">{scanning ? 'progress_activity' : 'radar'}</span>
                            {scanning ? 'Scanning...' : 'Start Scan'}
                        </button>
                        <button onClick={() => { setShowScanInput(false); setScanUrl(brandWebsite || '') }}
                            className="text-slate-500 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Scanning Progress */}
            {scanning && (
                <div className="mb-5 p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-2xl text-cyan-400 animate-spin">progress_activity</span>
                        <div>
                            <p className="text-sm font-bold text-white">AI Agent is scanning your website...</p>
                            <p className="text-xs text-slate-400 mt-0.5">Discovering products, extracting details, images, and pricing. This may take a minute.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Scan Result Banner */}
            {scanResult && (
                <div className={`mb-5 p-4 rounded-xl border animate-fade-in ${scanResult.success !== false
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-rose-500/5 border-rose-500/20'
                    }`}>
                    <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-lg ${scanResult.success !== false ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                            {scanResult.success !== false ? 'check_circle' : 'error'}
                        </span>
                        <p className={`text-sm font-bold ${scanResult.success !== false ? 'text-emerald-400' : 'text-rose-400'
                            }`}>
                            {scanResult.success !== false ? scanResult.message : (scanResult.error || 'Scan failed')}
                        </p>
                        <button onClick={() => setScanResult(null)} className="ml-auto text-slate-500 hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                    {scanResult.productsCreated > 0 && (
                        <p className="text-xs text-slate-400 mt-1 ml-7">
                            ✅ {scanResult.productsCreated} products added
                            {scanResult.productsSkipped > 0 && ` • ⏭️ ${scanResult.productsSkipped} duplicates skipped`}
                        </p>
                    )}
                </div>
            )}

            {loading && productsList.length === 0 ? (
                <div className="flex items-center justify-center py-12 gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
                    <span className="text-slate-400 text-sm">Loading products...</span>
                </div>
            ) : productsList.length === 0 ? (
                <div className="text-center py-12">
                    <span className="material-symbols-outlined text-5xl text-slate-600 mb-3">inventory_2</span>
                    <p className="text-slate-400 text-sm mb-1">No products or services added yet.</p>
                    <p className="text-slate-600 text-xs mb-4">Scan your website or add products manually.</p>
                    <div className="flex items-center justify-center gap-3">
                        <button onClick={() => brandWebsite ? handleScanWebsite() : setShowScanInput(true)}
                            disabled={scanning}
                            className="glass-panel py-2.5 px-6 rounded-xl text-sm font-bold cursor-pointer text-cyan-400 hover:bg-cyan-400/10 border border-cyan-400/20 flex items-center gap-2 disabled:opacity-50">
                            <span className="material-symbols-outlined text-sm">{scanning ? 'progress_activity' : 'radar'}</span>
                            {scanning ? 'Scanning...' : brandWebsite ? `Scan ${(() => { try { return new URL(brandWebsite).hostname } catch { return brandWebsite } })()}` : 'Scan Website'}
                        </button>
                        <button onClick={() => { setEditProduct(null); setShowAdd(true) }}
                            className="btn-primary py-2.5 px-6 rounded-xl text-sm font-bold cursor-pointer">
                            <span className="material-symbols-outlined text-sm mr-1 align-middle">add</span> Add Manually
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {productsList.map(p => (
                            <ProductCard key={p._id} product={p}
                                onEdit={(p) => { setEditProduct(p); setShowAdd(true) }}
                                onDelete={handleDelete}
                                onEnrich={handleEnrich} />
                        ))}
                    </div>

                    {/* Pagination */}
                    {total > 12 && (
                        <div className="flex items-center justify-center gap-3 mt-5">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                                className="glass-panel py-1.5 px-3 rounded-lg text-xs text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer">
                                <span className="material-symbols-outlined text-sm">chevron_left</span> Prev
                            </button>
                            <span className="text-xs text-slate-500">Page {page} of {Math.ceil(total / 12)}</span>
                            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 12)}
                                className="glass-panel py-1.5 px-3 rounded-lg text-xs text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer">
                                Next <span className="material-symbols-outlined text-sm">chevron_right</span>
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Add/Edit Modal */}
            {showAdd && (
                <AddProductModal brandId={brandId} editProduct={editProduct}
                    onClose={() => { setShowAdd(false); setEditProduct(null) }}
                    onSaved={handleSaved} />
            )}
        </div>
    )
}

// ============================================================================
// MAIN BRAND DNA COMPONENT
// ============================================================================

export default function BrandDNA() {
    const navigate = useNavigate()
    const { activeBrand, brands, selectBrand, updateBrandDNA } = useBrand()

    const brand = activeBrand
    const dna = brand?.dna || {}
    const voice = dna.voice || {}

    if (!brand) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <span className="material-symbols-outlined text-6xl text-slate-600">fingerprint</span>
                    <h2 className="text-2xl font-extrabold text-white">No Brand Selected</h2>
                    <p className="text-slate-400 text-sm">Create or select a brand to view its DNA.</p>
                    <button onClick={() => navigate('/onboarding')} className="btn-primary py-2.5 px-6 rounded-xl text-sm mt-2">
                        Create Brand
                    </button>
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            {/* Header */}
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">Brand <span className="text-primary">DNA</span></h2>
                    <p className="text-slate-400 text-sm">Your brand knowledge bank — this drives all AI-generated content.</p>
                </div>
                <select value={brand._id} onChange={e => { const b = brands.find(b => b._id === e.target.value); if (b) selectBrand(b) }}
                    className="input-glass py-2 px-3 rounded-xl text-xs bg-white/[0.04] cursor-pointer">
                    {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
            </div>

            {/* Brand Identity Header */}
            <div className="glass-panel rounded-2xl p-6 mb-6 flex items-center gap-6 animate-fade-in">
                <div className="size-20 rounded-2xl flex items-center justify-center text-3xl font-black text-white"
                    style={{ background: dna.colors?.[0]?.hex || '#2B4BEE' }}>
                    {brand.dna?.logo?.url ? (
                        <img src={brand.dna.logo.url} alt="logo" className="w-full h-full object-contain rounded-2xl" />
                    ) : (
                        brand.name?.charAt(0)?.toUpperCase()
                    )}
                </div>
                <div className="flex-1">
                    <h3 className="text-2xl font-extrabold text-white">{brand.name}</h3>
                    {brand.website && <p className="text-sm text-primary">{brand.website}</p>}
                    {dna.brandDescription && <p className="text-sm text-slate-400 mt-1 line-clamp-2">{dna.brandDescription}</p>}
                    <div className="flex gap-2 mt-2">
                        {dna.industry && <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-[10px] text-slate-400">{dna.industry}</span>}
                        <span className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-[10px] text-slate-400 capitalize">{brand.onboardingMethod}</span>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${brand.status === 'active' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-slate-500/10 text-slate-500'}`}>{brand.status}</span>
                    </div>
                </div>
                {brand.aiContext?.totalFeedback > 0 && (
                    <div className="text-center glass-panel px-5 py-3 rounded-xl">
                        <p className="text-2xl font-extrabold text-primary">{brand.aiContext.totalFeedback}</p>
                        <p className="text-[10px] text-slate-500">AI learnings</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Color Palette */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '80ms' }}>
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">palette</span> Color Palette
                    </h3>
                    {dna.colors?.length > 0 ? (
                        <div className="flex gap-4 flex-wrap">
                            {dna.colors.map((c, i) => (
                                <div key={i} className="text-center group">
                                    <div className="w-16 h-16 rounded-xl border border-white/[0.1] shadow-lg group-hover:scale-110 transition-transform"
                                        style={{ background: c.hex }} />
                                    <p className="text-xs text-white mt-2 font-medium">{c.name}</p>
                                    <p className="text-[10px] text-slate-500 font-mono">{c.hex}</p>
                                    <p className="text-[10px] text-primary capitalize">{c.usage}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm">No colors extracted yet.</p>
                    )}
                </div>

                {/* Typography */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '160ms' }}>
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">text_fields</span> Typography
                    </h3>
                    {dna.fonts ? (
                        <div className="space-y-4">
                            {[
                                { label: 'Heading', data: dna.fonts.heading },
                                { label: 'Body', data: dna.fonts.body },
                                { label: 'Accent', data: dna.fonts.accent },
                            ].filter(f => f.data?.family).map((f, i) => (
                                <div key={i} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{f.label} Font</p>
                                    <p className="text-lg text-white font-bold" style={{ fontFamily: f.data.family }}>{f.data.family}</p>
                                    <p className="text-xs text-slate-400">Weight: {f.data.weight || 'Regular'} • Style: {f.data.style || 'Normal'}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm">No typography data yet.</p>
                    )}
                </div>

                {/* Voice & Tone */}
                <div className="col-span-12 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '240ms' }}>
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">record_voice_over</span> Voice & Tone
                    </h3>

                    {voice.personality ? (
                        <div className="grid grid-cols-12 gap-6">
                            <div className="col-span-12 md:col-span-5">
                                <p className="text-xl text-primary font-extrabold mb-2">{voice.personality}</p>
                                {voice.description && <p className="text-sm text-slate-300 leading-relaxed">{voice.description}</p>}
                                {voice.sampleQuote && (
                                    <blockquote className="mt-4 p-4 rounded-xl bg-primary/5 border-l-2 border-primary text-sm text-slate-300 italic">
                                        "{voice.sampleQuote}"
                                    </blockquote>
                                )}
                                {voice.keywords?.length > 0 && (
                                    <div className="mt-4">
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Brand Keywords</p>
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
                                    <div key={i} className="p-3 rounded-xl bg-white/[0.03]">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-xs font-bold text-white">{v.label}</span>
                                            <span className="text-xs text-primary font-bold">{v.value}%</span>
                                        </div>
                                        <div className="relative">
                                            <div className="progress-bar"><div className="progress-bar-fill" style={{ width: `${v.value}%` }} /></div>
                                            <div className="flex justify-between mt-1">
                                                <span className="text-[10px] text-slate-600">{v.low}</span>
                                                <span className="text-[10px] text-slate-600">{v.high}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm">No voice data yet. Scan a website or brainstorm to generate voice profile.</p>
                    )}
                </div>

                {/* Content Style Guide */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '320ms' }}>
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">checklist</span> Content Style Guide
                    </h3>
                    {dna.contentStyle?.dos?.length > 0 || dna.contentStyle?.donts?.length > 0 ? (
                        <div className="space-y-4">
                            {dna.contentStyle.dos?.length > 0 && (
                                <div>
                                    <p className="text-xs text-emerald-400 font-bold mb-2">✅ ALWAYS</p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.dos.map((d, i) => (
                                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                                <span className="text-emerald-400 mt-1">•</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {dna.contentStyle.donts?.length > 0 && (
                                <div>
                                    <p className="text-xs text-rose-400 font-bold mb-2">❌ NEVER</p>
                                    <ul className="space-y-1.5">
                                        {dna.contentStyle.donts.map((d, i) => (
                                            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                                <span className="text-rose-400 mt-1">•</span> {d}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-slate-500 text-sm">Style guide will be generated as the AI learns from your feedback.</p>
                    )}
                </div>

                {/* AI Learning Status */}
                <div className="col-span-12 md:col-span-6 glass-panel rounded-2xl p-6 animate-fade-in" style={{ animationDelay: '400ms' }}>
                    <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                        <span className="material-symbols-outlined text-primary">psychology</span> AI Learning Status
                    </h3>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                <p className="text-2xl font-extrabold text-primary">{brand.aiContext?.totalFeedback || 0}</p>
                                <p className="text-[10px] text-slate-500">Feedback Signals</p>
                            </div>
                            <div className="p-3 rounded-xl bg-white/[0.03] text-center">
                                <p className="text-2xl font-extrabold text-emerald-400">
                                    {brand.aiContext?.avgRating ? `${(brand.aiContext.avgRating * 100).toFixed(0)}%` : '—'}
                                </p>
                                <p className="text-[10px] text-slate-500">Satisfaction</p>
                            </div>
                        </div>
                        <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10">
                            <p className="text-xs text-primary font-bold mb-1">🧠 How the AI learns</p>
                            <p className="text-[10px] text-slate-400 leading-relaxed">
                                Every like, dislike, edit, and regeneration teaches the AI your preferences.
                                After enough feedback, generated content becomes indistinguishable from your own writing.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ═══════════════════ PRODUCTS & SERVICES CATALOG ═══════════════════ */}
                <ProductCatalog brandId={brand._id} brandWebsite={brand.website || ''} />
            </div>
        </DashboardLayout>
    )
}

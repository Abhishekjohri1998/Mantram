/**
 * Integrations Page
 * Connect Shopify, social media platforms, and manage product catalog.
 */

import { useState, useEffect } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useShopify } from '../context/ShopifyContext'
import { social, shopify as shopifyAPI } from '../services/api'

const SOCIAL_PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: '📷', color: '#E1306C', desc: 'Share photos, reels & stories' },
    { id: 'facebook', name: 'Facebook', icon: '📘', color: '#1877F2', desc: 'Pages, groups & marketplace' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0A66C2', desc: 'Professional posts & articles' },
    { id: 'twitter', name: 'X (Twitter)', icon: '𝕏', color: '#000000', desc: 'Tweets & threads' },
]

export default function Integrations() {
    const { user } = useAuth()
    const { activeBrand } = useBrand()
    const { isEmbedded, shop: shopifyShop } = useShopify()
    const [platformStatus, setPlatformStatus] = useState({})
    const [shopifyDomain, setShopifyDomain] = useState(shopifyShop || '')
    const [shopifyToken, setShopifyToken] = useState('')
    const [shopifyMode, setShopifyMode] = useState(isEmbedded ? 'oauth' : 'token') // 'oauth' or 'token'
    const [products, setProducts] = useState([])
    const [productSearch, setProductSearch] = useState('')
    const [loading, setLoading] = useState({})
    const [syncing, setSyncing] = useState(false)
    const [activeTab, setActiveTab] = useState('platforms') // platforms | products

    useEffect(() => {
        loadStatus()
    }, [])

    const loadStatus = async () => {
        try {
            // Load custom status map for Shopify
            const shopifyData = await shopifyAPI.status();

            // Load actual connected social accounts from database
            const socialData = await social.accounts();
            const accounts = socialData.data || [];

            // Map the accounts array to the platformStatus object format
            const mappedStatus = {
                shopify: shopifyData.status || { connected: false }
            };

            accounts.forEach(acc => {
                // If a platform has multiple accounts (e.g. 2 FB pages), we store it as an array to display
                if (!mappedStatus[acc.platform]) {
                    mappedStatus[acc.platform] = { connected: true, accounts: [] };
                }
                mappedStatus[acc.platform].accounts.push(acc);
            });

            setPlatformStatus(mappedStatus);
        } catch (e) { console.error('Error loading integration status:', e); }
    }

    const loadProducts = async () => {
        try {
            const data = await shopifyAPI.products({ search: productSearch })
            setProducts(data.products || [])
        } catch { /* ignore */ }
    }

    useEffect(() => { if (activeTab === 'products') loadProducts() }, [activeTab, productSearch])

    // ── Connect Social Platform ──
    const connectPlatform = async (platform) => {
        setLoading(l => ({ ...l, [platform]: true }))
        try {
            const data = await social.connect(platform, activeBrand?._id)
            if (data.authUrl) {
                window.open(data.authUrl, '_blank', 'width=600,height=700')
            }
        } catch (err) {
            alert(`Connection failed: ${err.message}`)
        } finally {
            setLoading(l => ({ ...l, [platform]: false }))
        }
    }

    // ── Disconnect Platform ──
    const disconnectPlatform = async (accountId) => {
        if (!confirm(`Disconnect this account?`)) return
        try {
            await social.disconnect(accountId)
            loadStatus()
        } catch (err) {
            alert(err.message)
        }
    }

    // ── Connect Shopify ──
    const connectShopify = async () => {
        if (!shopifyDomain) return alert('Enter your Shopify store domain')

        if (shopifyMode === 'token') {
            // Direct token connection
            if (!shopifyToken) return alert('Paste your Admin API Access Token')
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connectToken(shopifyDomain, shopifyToken)
                alert(`✅ Connected to ${data.shopName}!`)
                setShopifyToken('')
                loadStatus()
            } catch (err) {
                alert(`Connection failed: ${err.message}`)
            } finally {
                setLoading(l => ({ ...l, shopify: false }))
            }
        } else {
            // OAuth flow
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connect(shopifyDomain)
                if (data.authUrl) {
                    window.open(data.authUrl, '_blank', 'width=600,height=700')
                }
            } catch (err) {
                alert(`Shopify connection failed: ${err.message}`)
            } finally {
                setLoading(l => ({ ...l, shopify: false }))
            }
        }
    }

    // ── Sync Products ──
    const syncProducts = async () => {
        setSyncing(true)
        try {
            const data = await shopifyAPI.sync(activeBrand?._id)
            alert(`✅ Synced ${data.synced} products from Shopify!`)
            loadProducts()
        } catch (err) {
            alert(`Sync failed: ${err.message}`)
        } finally {
            setSyncing(false)
        }
    }

    const shopifyStatus = platformStatus.shopify || {}

    return (
        <DashboardLayout>
            {/* Page Header */}
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">
                        <span className="text-primary">⚡</span> Integrations
                    </h2>
                    <p className="text-slate-400 text-sm">Connect platforms, sync products, publish everywhere</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('platforms')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === 'platforms' ? 'bg-primary text-black' : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'}`}>
                        <span className="material-symbols-outlined text-sm mr-1">hub</span> Platforms
                    </button>
                    <button onClick={() => setActiveTab('products')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === 'products' ? 'bg-primary text-black' : 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.1]'}`}>
                        <span className="material-symbols-outlined text-sm mr-1">inventory_2</span> Products
                    </button>
                </div>
            </div>

            <div>
                {activeTab === 'platforms' ? (
                    <div className="space-y-8">
                        {/* Shopify Section */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">🛍️</span> E-Commerce
                            </h2>
                            <div className="glass-panel rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-[#96BF48]/10 flex items-center justify-center text-2xl font-bold text-[#96BF48]">S</div>
                                        <div>
                                            <h3 className="font-bold text-white">Shopify</h3>
                                            <p className="text-sm text-slate-400">Sync products & inventory</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={shopifyStatus.status || 'disconnected'} />
                                </div>

                                {shopifyStatus.connected ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-4 text-sm">
                                            <span className="text-slate-400">Store: <span className="text-white">{shopifyStatus.displayName}</span></span>
                                            {shopifyStatus.lastSyncAt && (
                                                <span className="text-slate-500">Last sync: {new Date(shopifyStatus.lastSyncAt).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={syncProducts} disabled={syncing}
                                                className="btn-primary px-4 py-2 rounded-xl text-sm">
                                                {syncing ? '⏳ Syncing...' : '🔄 Sync Products'}
                                            </button>
                                            <button onClick={() => setActiveTab('products')}
                                                className="px-4 py-2 rounded-xl text-sm bg-white/[0.05] hover:bg-white/[0.1] text-slate-300">
                                                📦 View Products
                                            </button>
                                            <button onClick={() => disconnectPlatform('shopify')}
                                                className="px-4 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10">
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Mode toggle - Hide if embedded (Manual token not allowed for public apps) */}
                                        {!isEmbedded && (
                                            <div className="flex gap-2 mb-2">
                                                <button onClick={() => setShopifyMode('token')}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${shopifyMode === 'token' ? 'bg-[#96BF48]/20 text-[#96BF48] border border-[#96BF48]/30' : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'}`}>
                                                    🔑 Access Token
                                                </button>
                                                <button onClick={() => setShopifyMode('oauth')}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${shopifyMode === 'oauth' ? 'bg-[#96BF48]/20 text-[#96BF48] border border-[#96BF48]/30' : 'bg-white/[0.04] text-slate-400 border border-white/[0.06]'}`}>
                                                    🔗 OAuth
                                                </button>
                                            </div>
                                        )}

                                        <input
                                            type="text" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)}
                                            placeholder="my-store.myshopify.com"
                                            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none"
                                        />

                                        {shopifyMode === 'token' && (
                                            <>
                                                <input
                                                    type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)}
                                                    placeholder="Admin API Access Token (shpat_...)"
                                                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none"
                                                />
                                                <p className="text-[11px] text-slate-500">
                                                    Go to your Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app → Configure Admin API scopes (read_products, read_orders, read_customers) → Install → Copy the Access Token
                                                </p>
                                            </>
                                        )}

                                        <button onClick={connectShopify} disabled={loading.shopify}
                                            className="btn-primary w-full py-3 rounded-xl text-sm font-medium">
                                            {loading.shopify ? 'Connecting...' : shopifyMode === 'token' ? '🔗 Connect with Token' : '🔗 Connect via OAuth'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Social Media Section */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">📱</span> Social Media
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {SOCIAL_PLATFORMS.map(platform => {
                                    const status = platformStatus[platform.id] || {}
                                    return (
                                        <div key={platform.id} className="glass-panel rounded-2xl p-5 hover:border-white/[0.15] transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                                                        style={{ background: `${platform.color}20` }}>
                                                        {platform.icon}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-white text-sm">{platform.name}</h3>
                                                        <p className="text-sm text-slate-500">{platform.desc}</p>
                                                    </div>
                                                </div>
                                                <StatusBadge status={status.status || 'disconnected'} />
                                            </div>

                                            {status.connected && status.accounts ? (
                                                <div className="space-y-2">
                                                    {status.accounts.map(acc => (
                                                        <div key={acc._id} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                {acc.avatar ? (
                                                                    <img src={acc.avatar} alt="avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-full bg-white/[0.1] flexitems-center justify-center flex-shrink-0">
                                                                        <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                                                                    </div>
                                                                )}
                                                                <div className="text-sm truncate pr-2">
                                                                    <span className="text-white font-medium truncate block">{acc.accountName}</span>
                                                                </div>
                                                            </div>
                                                            <button onClick={() => disconnectPlatform(acc._id)}
                                                                className="text-xs font-medium text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
                                                                Disconnect
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => connectPlatform(platform.id)}
                                                        className="w-full mt-2 py-2 rounded-xl text-xs font-medium text-slate-300 bg-white/[0.05] hover:bg-white/[0.1] transition-all">
                                                        + Connect another
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => connectPlatform(platform.id)}
                                                    disabled={loading[platform.id]}
                                                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                                                    style={{ background: `${platform.color}20`, color: platform.color, border: `1px solid ${platform.color}30` }}>
                                                    {loading[platform.id] ? 'Connecting...' : `Connect ${platform.name}`}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </section>

                        {/* Coming Soon */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">🔮</span> Coming Soon
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {['WooCommerce', 'Amazon', 'Pinterest', 'YouTube'].map(name => (
                                    <div key={name} className="glass-panel rounded-xl p-4 opacity-50 text-center">
                                        <p className="text-sm font-medium text-slate-400">{name}</p>
                                        <p className="text-xs text-slate-600 mt-1">Coming soon</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                ) : (
                    /* Products Tab */
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
                                <input
                                    type="text" value={productSearch}
                                    onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Search products..."
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none"
                                />
                            </div>
                            {shopifyStatus.connected && (
                                <button onClick={syncProducts} disabled={syncing}
                                    className="btn-primary px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap">
                                    {syncing ? '⏳ Syncing...' : '🔄 Sync from Shopify'}
                                </button>
                            )}
                        </div>

                        {products.length === 0 ? (
                            <div className="text-center py-16">
                                <span className="material-symbols-outlined text-6xl text-slate-700">inventory_2</span>
                                <p className="text-slate-400 mt-4 text-lg">No products yet</p>
                                <p className="text-sm text-slate-600 mt-1">Connect Shopify to sync your product catalog</p>
                                <button onClick={() => setActiveTab('platforms')}
                                    className="btn-primary px-6 py-3 rounded-xl text-sm mt-6">
                                    Connect Shopify
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {products.map(product => (
                                    <div key={product._id} className="glass-panel rounded-2xl overflow-hidden hover:border-white/[0.15] transition-all group">
                                        {product.images?.[0] && (
                                            <div className="h-40 overflow-hidden bg-white/[0.02]">
                                                <img src={product.images[0].url} alt={product.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            </div>
                                        )}
                                        <div className="p-4">
                                            <h3 className="font-bold text-white text-sm truncate">{product.title}</h3>
                                            <p className="text-sm text-slate-500 mt-0.5">{product.productType || product.vendor}</p>
                                            <div className="flex items-center justify-between mt-3">
                                                <span className="text-primary font-bold text-sm">
                                                    ₹{product.variants?.[0]?.price || '—'}
                                                </span>
                                                {product.tags?.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {product.tags.slice(0, 2).map((tag, i) => (
                                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-400">{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </DashboardLayout>
    )
}

// ── Status Badge Component ──
function StatusBadge({ status }) {
    const config = {
        connected: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Connected' },
        pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Pending' },
        expired: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', label: 'Expired' },
        disconnected: { bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-500', label: 'Not Connected' },
    }
    const c = config[status] || config.disconnected
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {c.label}
        </span>
    )
}

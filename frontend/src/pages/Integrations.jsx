/**
 * Integrations Hub — Single Source of Truth for all platform connections.
 * Handles Connect / Disconnect for: Google Analytics, Meta Ads, Google Ads, Shopify, and Social Media.
 * All connections are scoped to the active brand.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { useShopify } from '../context/ShopifyContext'
import { social, shopify as shopifyAPI, googleAnalytics as gaAPI, apiFetch } from '../services/api'

const SOCIAL_PLATFORMS = [
    { id: 'instagram', name: 'Instagram', icon: '📷', color: '#E1306C', desc: 'Share photos, reels & stories' },
    { id: 'facebook', name: 'Facebook', icon: '📘', color: '#1877F2', desc: 'Pages, groups & marketplace' },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', color: '#0A66C2', desc: 'Professional posts & articles' },
    { id: 'twitter', name: 'X (Twitter)', icon: '𝕏', color: '#000000', desc: 'Tweets & threads' },
]

const AD_PLATFORMS = [
    { key: 'meta', name: 'Meta Ads', icon: '📱', color: '#0081FB', desc: 'Facebook & Instagram ads' },
    { key: 'google', name: 'Google Ads', icon: '📊', color: '#34A853', desc: 'Search, display & YouTube ads' },
]

export default function Integrations() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { activeBrand } = useBrand()
    const { isEmbedded, shop: shopifyShop } = useShopify()

    // ── Social & Shopify state ──
    const [platformStatus, setPlatformStatus] = useState({})
    const [shopifyDomain, setShopifyDomain] = useState(shopifyShop || '')
    const [shopifyToken, setShopifyToken] = useState('')
    const [shopifyMode, setShopifyMode] = useState(isEmbedded ? 'oauth' : 'token')
    const [products, setProducts] = useState([])
    const [productSearch, setProductSearch] = useState('')
    const [loading, setLoading] = useState({})
    const [syncing, setSyncing] = useState(false)
    const [activeTab, setActiveTab] = useState('platforms')
    const [selectedAccount, setSelectedAccount] = useState(null)
    const [posts, setPosts] = useState([])
    const [loadingPosts, setLoadingPosts] = useState(false)

    // ── Google Analytics state ──
    const [gaConnected, setGaConnected] = useState(false)
    const [gaEmail, setGaEmail] = useState('')
    const [gaLoading, setGaLoading] = useState(false)

    // ── Ad Platform state ──
    const [adConnections, setAdConnections] = useState({ meta: { status: 'disconnected' }, google: { status: 'disconnected' } })
    const [connectingPlatform, setConnectingPlatform] = useState(null)

    const brandId = activeBrand?._id

    // ── Load ALL platform statuses ──
    const loadAllStatuses = useCallback(async () => {
        try {
            // Social + Shopify
            const [shopifyData, socialData] = await Promise.allSettled([
                shopifyAPI.status(brandId),
                social.accounts(),
            ])
            const mappedStatus = {
                shopify: shopifyData.status === 'fulfilled' ? (shopifyData.value.status || { connected: false }) : { connected: false },
            }
            if (socialData.status === 'fulfilled') {
                (socialData.value.data || []).forEach(acc => {
                    if (!mappedStatus[acc.platform]) mappedStatus[acc.platform] = { connected: true, accounts: [] }
                    mappedStatus[acc.platform].accounts.push(acc)
                })
            }
            setPlatformStatus(mappedStatus)

            // Google Analytics
            try {
                const gaData = await gaAPI.status(brandId)
                setGaConnected(gaData.connected)
                setGaEmail(gaData.email || '')
            } catch { setGaConnected(false); setGaEmail('') }

            // Ad Platforms (Meta + Google)
            try {
                const adData = await apiFetch(`/pm-studio/connect/status${brandId ? `?brandId=${brandId}` : ''}`)
                if (adData.connections) setAdConnections(adData.connections)
            } catch { /* ignore */ }
        } catch (e) { console.error('Error loading integration statuses:', e) }
    }, [brandId])

    // Re-load everything on brand switch
    useEffect(() => {
        setGaConnected(false); setGaEmail('');
        setAdConnections({ meta: { status: 'disconnected' }, google: { status: 'disconnected' } })
        loadAllStatuses()
    }, [loadAllStatuses])

    // Listen for OAuth popup messages (Social + GA + PM platforms)
    useEffect(() => {
        const syncChannel = new BroadcastChannel('mantram_sync')
        const handler = (e) => {
            if (e.data?.type === 'GOOGLE_ANALYTICS_CONNECTED') {
                setGaConnected(true); setGaEmail(e.data.email || ''); loadAllStatuses()
            }
            if (e.data?.type === 'PM_PLATFORM_CONNECTED') {
                setConnectingPlatform(null); loadAllStatuses()
                syncChannel.postMessage(e.data) // Notify other tabs
            }
            if (e.data?.type === 'SOCIAL_PLATFORM_CONNECTED') {
                loadAllStatuses()
                syncChannel.postMessage(e.data) // Notify other tabs
            }
        }
        window.addEventListener('message', handler)
        return () => {
            window.removeEventListener('message', handler)
            syncChannel.close()
        }
    }, [loadAllStatuses])

    // Detect if this window is an OAuth popup and should close itself
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        if (params.get('social') === 'success' && window.opener) {
            window.opener.postMessage({
                type: 'SOCIAL_PLATFORM_CONNECTED',
                platform: params.get('platform')
            }, window.location.origin)
            window.close()
        }
    }, [])

    // ── Google Analytics Actions ──
    const connectGA = async () => {
        setGaLoading(true)
        try {
            const d = await gaAPI.connect(brandId)
            if (d.authUrl) window.open(d.authUrl, '_blank', 'width=600,height=700')
        } catch (e) { alert(`Connection failed: ${e.message}`) }
        finally { setGaLoading(false) }
    }
    const disconnectGA = async () => {
        if (!confirm('Disconnect Google Analytics for this brand?')) return
        try { await gaAPI.disconnect(brandId); setGaConnected(false); setGaEmail('') } catch { }
    }

    // ── Ad Platform Actions ──
    const connectAdPlatform = async (platformKey) => {
        setConnectingPlatform(platformKey)
        try {
            const data = await apiFetch(`/pm-studio/connect/${platformKey}/auth${brandId ? `?brandId=${brandId}` : ''}`)
            if (data.authUrl) window.open(data.authUrl, `connect_${platformKey}`, 'width=600,height=700,scrollbars=yes')
        } catch (e) {
            alert(`Connection failed: ${e.message}`)
            setConnectingPlatform(null)
        }
    }
    const disconnectAdPlatform = async (platformKey) => {
        if (!confirm(`Disconnect ${platformKey === 'meta' ? 'Meta Ads' : 'Google Ads'} for this brand?`)) return
        try {
            await apiFetch(`/pm-studio/connect/${platformKey}${brandId ? `?brandId=${brandId}` : ''}`, { method: 'DELETE' })
            loadAllStatuses()
        } catch (e) { alert(e.message) }
    }

    // ── Social Platform Actions ──
    const connectPlatform = async (platform) => {
        setLoading(l => ({ ...l, [platform]: true }))
        try {
            const data = await social.connect(platform, brandId)
            if (data.authUrl) window.open(data.authUrl, '_blank', 'width=600,height=700')
        } catch (err) { alert(`Connection failed: ${err.message}`) }
        finally { setLoading(l => ({ ...l, [platform]: false })) }
    }
    const disconnectPlatform = async (accountId) => {
        if (!confirm(`Disconnect this account?`)) return
        try { await social.disconnect(accountId); loadAllStatuses() } catch (err) { alert(err.message) }
    }
    const loadPosts = async (account) => {
        setSelectedAccount(account); setLoadingPosts(true)
        try { const res = await social.getPosts(account._id); setPosts(res.data || []) }
        catch { } finally { setLoadingPosts(false) }
    }

    // ── Shopify Actions ──
    const connectShopify = async () => {
        if (!shopifyDomain) return alert('Enter your Shopify store domain')
        if (shopifyMode === 'token') {
            if (!shopifyToken) return alert('Paste your Admin API Access Token')
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connectToken(shopifyDomain, shopifyToken, brandId)
                alert(`✅ Connected to ${data.shopName}!`); setShopifyToken(''); loadAllStatuses()
            } catch (err) { alert(`Connection failed: ${err.message}`) }
            finally { setLoading(l => ({ ...l, shopify: false })) }
        } else {
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connect(shopifyDomain, brandId)
                if (data.authUrl) window.open(data.authUrl, '_blank', 'width=600,height=700')
            } catch (err) { alert(`Shopify connection failed: ${err.message}`) }
            finally { setLoading(l => ({ ...l, shopify: false })) }
        }
    }
    const syncProducts = async () => {
        setSyncing(true)
        try {
            const data = await shopifyAPI.sync(brandId)
            alert(`✅ Synced ${data.synced} products from Shopify!`); loadProducts()
        } catch (err) { alert(`Sync failed: ${err.message}`) }
        finally { setSyncing(false) }
    }
    const loadProducts = async () => {
        try { const data = await shopifyAPI.products({ search: productSearch }); setProducts(data.products || []) } catch { }
    }
    useEffect(() => { if (activeTab === 'products') loadProducts() }, [activeTab, productSearch])

    const shopifyStatus = platformStatus.shopify || {}

    return (
        <DashboardLayout title="Integrations" subtitle="Connect your platforms & tools">
            <SEOHead title="Integrations — Mantram AI" noIndex={true} />
            {/* Brand Indicator */}
            {activeBrand && (
                <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
                    <span className="material-symbols-outlined text-primary text-base">storefront</span>
                    <span className="text-sm text-slate-400">Showing integrations for</span>
                    <span className="text-sm font-bold text-white">{activeBrand.name}</span>
                    <span className="text-xs text-slate-600 ml-auto">Switch brands in the header to manage other brands</span>
                </div>
            )}

            {/* Tab Switcher */}
            <div className="flex items-end justify-between mb-6">
                <div></div>
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

                        {/* ═══════════ ANALYTICS SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">📊</span> Analytics & Search Console
                                <span className="text-xs text-slate-600 font-normal ml-2">Used by SEO Studio</span>
                            </h2>
                            <div className="glass-panel rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-[#F9AB00]/10 flex items-center justify-center">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M20 4h-4v16h4V4z" fill="#F9AB00" /><path d="M12 10h-4v10h4V10z" fill="#E37400" /><path d="M4 16h-0a2 2 0 100 4h0a2 2 0 100-4z" fill="#E37400" /></svg>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">Google Analytics</h3>
                                            <p className="text-sm text-slate-400">Website traffic, SERP & keyword rankings</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={gaConnected ? 'connected' : 'disconnected'} />
                                </div>

                                {gaConnected ? (
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
                                            <div>
                                                <p className="text-sm text-white font-medium">{gaEmail}</p>
                                                <p className="text-xs text-slate-500">Connected for {activeBrand?.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => navigate('/seo-studio')}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">analytics</span> View in SEO Studio
                                            </button>
                                            <button onClick={disconnectGA}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={connectGA} disabled={gaLoading}
                                        className="w-full py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] bg-[#F9AB00]/15 text-[#F9AB00] border border-[#F9AB00]/25 hover:bg-[#F9AB00]/25 cursor-pointer disabled:opacity-50">
                                        {gaLoading ? '⏳ Connecting...' : '🔗 Connect Google Analytics'}
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* ═══════════ AD PLATFORMS SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">📢</span> Ad Platforms
                                <span className="text-xs text-slate-600 font-normal ml-2">Used by Performance Studio</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {AD_PLATFORMS.map(p => {
                                    const conn = adConnections[p.key] || {}
                                    const isConnected = conn.status === 'connected'
                                    return (
                                        <div key={p.key} className="glass-panel rounded-2xl p-5 hover:border-white/[0.15] transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl"
                                                        style={{ background: `${p.color}20` }}>
                                                        {p.icon}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-white text-sm">{p.name}</h3>
                                                        <p className="text-sm text-slate-500">{p.desc}</p>
                                                    </div>
                                                </div>
                                                <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
                                            </div>

                                            {isConnected ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                                                        <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
                                                        <span className="text-sm text-white font-medium">{conn.email || conn.displayName || 'Connected'}</span>
                                                    </div>
                                                    {conn.customerIds?.length > 0 && (
                                                        <div className="px-2.5 py-1.5">
                                                            <p className="text-xs text-slate-500 mb-1">Customer IDs:</p>
                                                            {conn.customerIds.slice(0, 3).map(id => (
                                                                <p key={id} className="text-xs text-slate-400">{id}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button onClick={() => navigate('/performance-marketing')}
                                                            className="flex-1 py-2 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer flex items-center justify-center gap-1">
                                                            <span className="material-symbols-outlined text-xs">analytics</span> View in PM Studio
                                                        </button>
                                                        <button onClick={() => disconnectAdPlatform(p.key)}
                                                            className="py-2 px-3 rounded-lg text-xs font-medium text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                                                            Disconnect
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    disabled={connectingPlatform === p.key}
                                                    onClick={() => connectAdPlatform(p.key)}
                                                    className="w-full py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-50"
                                                    style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}30` }}>
                                                    {connectingPlatform === p.key ? (
                                                        <><span className="material-symbols-outlined animate-spin text-sm align-middle mr-1">progress_activity</span>Connecting...</>
                                                    ) : (
                                                        `🔗 Connect ${p.name}`
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </section>

                        {/* ═══════════ E-COMMERCE SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">🛍️</span> E-Commerce
                                <span className="text-xs text-slate-600 font-normal ml-2">Used by D2C Studio</span>
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
                                            <button onClick={async () => {
                                                if (!confirm('Disconnect Shopify for this brand?')) return;
                                                setLoading(l => ({ ...l, shopify: true }));
                                                try {
                                                    await shopifyAPI.disconnect(brandId);
                                                    loadAllStatuses();
                                                } catch (err) {
                                                    alert(err.message);
                                                } finally {
                                                    setLoading(l => ({ ...l, shopify: false }));
                                                }
                                            }}
                                                className="px-4 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10">
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
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
                                        <input type="text" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)}
                                            placeholder="my-store.myshopify.com"
                                            className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none" />

                                        {shopifyMode === 'oauth' && (
                                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                                                <span className="material-symbols-outlined text-amber-500 text-xl">warning</span>
                                                <div className="text-xs text-amber-200/80 leading-relaxed">
                                                    <p className="font-bold text-amber-400 mb-1">Shopify Review Pending</p>
                                                    Shopify blocks standard OAuth for new apps on production stores until review is complete.
                                                    Please use <strong>Access Token (Custom App)</strong> mode instead to connect immediately.
                                                </div>
                                            </div>
                                        )}

                                        {shopifyMode === 'token' && (
                                            <>
                                                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                                                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider">How to connect using Access Token</h4>
                                                    <ol className="text-[11px] text-slate-400 space-y-2 list-decimal ml-4">
                                                        <li>Go to <strong>Shopify Admin</strong> → Settings → Apps and sales channels</li>
                                                        <li>Click <strong>Develop apps</strong> → <strong>Create an app</strong></li>
                                                        <li><strong>Configure Admin API scopes</strong>: Select <code>read_products</code>, <code>read_orders</code>, and <code>read_customers</code></li>
                                                        <li>Click <strong>Install app</strong> and copy the <strong>Admin API access token</strong> (starts with <code>shpat_</code>)</li>
                                                    </ol>
                                                </div>
                                                <input type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)}
                                                    placeholder="Admin API Access Token (shpat_...)"
                                                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none" />
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

                        {/* ═══════════ SOCIAL MEDIA SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                <span className="text-2xl">📱</span> Social Media
                                <span className="text-xs text-slate-600 font-normal ml-2">Used by Content & Publish Studios</span>
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
                                                                    <div className="w-8 h-8 rounded-full bg-white/[0.1] flex items-center justify-center flex-shrink-0">
                                                                        <span className="material-symbols-outlined text-sm text-slate-400">person</span>
                                                                    </div>
                                                                )}
                                                                <div className="text-sm truncate pr-2">
                                                                    <span className="text-white font-medium truncate block">{acc.accountName}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                {(acc.platform === 'facebook' || acc.platform === 'instagram') && (
                                                                    <button onClick={() => loadPosts(acc)}
                                                                        className="text-xs font-medium text-primary hover:text-white px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors flex-shrink-0">
                                                                        Manage
                                                                    </button>
                                                                )}
                                                                <button onClick={() => disconnectPlatform(acc._id)}
                                                                    className="text-xs font-medium text-red-400 hover:text-red-300 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0">
                                                                    Disconnect
                                                                </button>
                                                            </div>
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

                        {/* ═══════════ COMING SOON ═══════════ */}
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
                                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Search products..."
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white text-sm placeholder:text-slate-500 focus:border-primary focus:outline-none" />
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

            {/* Manage Posts Modal */}
            {selectedAccount && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedAccount(null)} />
                    <div className="relative bg-[#0c0f1a] border border-white/10 rounded-3xl w-full max-w-4xl flex flex-col max-h-[85vh] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-in">
                        <div className="flex items-center justify-between p-6 border-b border-white/10">
                            <div className="flex items-center gap-4">
                                {selectedAccount.avatar ? (
                                    <img src={selectedAccount.avatar} className="w-10 h-10 rounded-full" alt="" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center font-bold text-primary">
                                        {selectedAccount.accountName[0]}
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-xl font-bold text-white">Manage {selectedAccount.accountName}</h3>
                                    <p className="text-xs text-slate-500 uppercase tracking-widest">{selectedAccount.platform} Integration</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAccount(null)} className="text-slate-500 hover:text-white transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {loadingPosts ? (
                                <div className="py-20 text-center">
                                    <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                                    <p className="text-slate-500 mt-4 font-medium">Fetching recent posts...</p>
                                </div>
                            ) : posts.length === 0 ? (
                                <div className="py-20 text-center bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
                                    <span className="material-symbols-outlined text-5xl text-slate-700 mb-4 text-slate-600">post_add</span>
                                    <p className="text-slate-400 font-medium">No recent posts found on this account.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {posts.map(post => (
                                        <div key={post.id} className="glass-panel p-4 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group flex gap-4">
                                            {post.imageUrl && (
                                                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-black/40 border border-white/10">
                                                    <img src={post.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <p className="text-sm text-slate-300 line-clamp-2 leading-relaxed">
                                                        {post.content || <span className="italic text-slate-500">No caption</span>}
                                                    </p>
                                                    <span className="text-[10px] text-slate-500 mt-2 block">
                                                        {new Date(post.createdAt).toLocaleDateString()} at {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between mt-3">
                                                    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                                                        className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1">
                                                        View Post <span className="material-symbols-outlined text-xs">open_in_new</span>
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
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

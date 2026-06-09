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
import { social, shopify as shopifyAPI, googleAnalytics as gaAPI, apiFetch, API_BASE, etsy as etsyAPI, woocommerce as wooAPI, products as productsAPI, uploadFileToS3 } from '../services/api'

// ── SVG Platform Logos ──────────────────────────────────────────────────────
function PlatformLogo({ id, size = 28 }) {
    const s = { width: size, height: size, display: 'block', flexShrink: 0 }
    switch (id) {
        case 'instagram': return (
            <svg style={s} viewBox="0 0 24 24" fill="none">
                <defs><radialGradient id="ig" cx="30%" cy="107%" r="150%"><stop offset="0%" stopColor="#fdf497"/><stop offset="10%" stopColor="#fd5949"/><stop offset="50%" stopColor="#d6249f"/><stop offset="100%" stopColor="#285AEB"/></radialGradient></defs>
                <rect width="24" height="24" rx="6" fill="url(#ig)"/>
                <circle cx="12" cy="12" r="4.5" stroke="white" strokeWidth="1.8" fill="none"/>
                <circle cx="17.5" cy="6.5" r="1.2" fill="white"/>
            </svg>
        )
        case 'facebook': return (
            <svg style={s} viewBox="0 0 24 24" fill="#1877F2">
                <rect width="24" height="24" rx="6" fill="#1877F2"/>
                <path d="M16 8h-2a1 1 0 0 0-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2v3z" fill="white"/>
            </svg>
        )
        case 'linkedin': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#0A66C2"/>
                <path d="M7 9h2v8H7V9zm1-3a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 8 6zm4 3h2v1.1C14.4 9.4 15 9 16 9c2 0 2.5 1.5 2.5 3v5h-2v-4.5c0-.8-.3-1.5-1.2-1.5-.9 0-1.3.7-1.3 1.5V17h-2V9z" fill="white"/>
            </svg>
        )
        case 'twitter': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#000"/>
                <path d="M17.5 6h-2.1l-3.3 4-3-4H6.5l4.4 5.8L6.2 18h2.1l3.6-4.3L15.3 18H18l-4.7-6.1L17.5 6z" fill="white"/>
            </svg>
        )
        case 'tiktok': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#010101"/>
                <path d="M16 6.5v7a4 4 0 1 1-2-3.46V13a2 2 0 1 0 2 2V6.5h2z" fill="white"/>
                <path d="M14 6.5c.55.9 1.5 1.5 2 1.7" stroke="#00f2ea" strokeWidth="0.5" fill="none"/>
                <path d="M14 6.5c.55.9 1.5 1.5 2 1.7" stroke="#ff0050" strokeWidth="0.5" fill="none" transform="translate(0.5,0)"/>
            </svg>
        )
        case 'youtube': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#FF0000"/>
                <path d="M20.5 8.5s-.2-1.4-.8-2c-.8-.8-1.6-.8-2-.9C15.3 5.5 12 5.5 12 5.5s-3.3 0-5.7.1c-.4.1-1.2.1-2 .9-.6.6-.8 2-.8 2S3.3 10 3.3 11.5v1.4c0 1.4.2 2.9.2 2.9s.2 1.4.8 2c.8.8 1.8.8 2.3.8 1.7.2 7.4.2 7.4.2s3.3 0 5.7-.2c.4-.1 1.2-.1 2-.9.6-.6.8-2 .8-2s.2-1.5.2-3v-1.4c0-1.5-.2-3-.2-3zM10 14.5v-5l5.5 2.5-5.5 2.5z" fill="white"/>
            </svg>
        )
        case 'shopify': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#96BF48"/>
                <path d="M15.3 5.4c0-.1-.1-.2-.2-.2-.1 0-1.3-.1-1.3-.1s-.9-.9-1-.9H12l-.6 4.4 4.2 1-.3-4.2zM12 5.2s-.5.1-.6.2C11 6 10.8 6.8 10.8 6.8H12V5.2zm-.6 1.6h-1.2c-.4 1.7-.8 4.7-.8 4.7l4.8 1.4-.3-2-2.5-.7V6.8zm5.8.8l-.5-.1c-.1-1-.6-1.8-1.5-1.8h-.1l-.4 2.5 2.5.6v-1.2zm-6.2 8.8l3.2.9 1.8-7.4-4.8-1.4-1.4 6.2.2 1.7zm3-2.8l-1.4-.4.4-2.1 1.4.4-.4 2.1z" fill="white"/>
            </svg>
        )
        case 'woocommerce': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#96588A"/>
                <path d="M3 7h18v1.5H3V7zm1.5 2.5h15l-1.5 7h-12l-1.5-7zm4.5 2l1 2.5L12 10l2 4 1-4h2l-2 6H9l-2-6h2z" fill="white"/>
            </svg>
        )
        case 'etsy': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#F56400"/>
                <path d="M8 6h8v2h-5v3h4v2h-4v3h5v2H8V6z" fill="white"/>
            </svg>
        )
        case 'amazon': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#232F3E"/>
                <path d="M6 13.5c2.5 1.8 8 2 11 .5" stroke="#FF9900" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                <path d="M15.5 15.5l1.5-1.5 1 1.5" stroke="#FF9900" strokeWidth="1.2" strokeLinecap="round" fill="none"/>
                <text x="7" y="12" fontSize="7" fill="white" fontFamily="Arial" fontWeight="bold">amazon</text>
            </svg>
        )
        case 'google-analytics': return (
            <svg style={s} viewBox="0 0 24 24" fill="none">
                <path d="M20 4h-4v16h4V4z" fill="#F9AB00" />
                <path d="M12 10h-4v10h4V10z" fill="#E37400" />
                <circle cx="4" cy="18" r="2" fill="#E37400" />
            </svg>
        )
        case 'meta': return (
            <svg style={s} viewBox="0 0 24 24">
                <rect width="24" height="24" rx="6" fill="#0081FB"/>
                <path d="M4.5 14c0-2.5 1.2-5.5 3-5.5 1 0 1.8 1 2.5 2.5C11 9 12.2 8 13.5 8c2.5 0 6 3.5 6 6 0 1.4-.7 2-1.5 2-.7 0-1.3-.5-2-1.5C15.2 13.4 14.5 12 13.5 12c-.8 0-1.5 1-2 2.5-.5 1.2-1 2-2 2-1.2 0-2.5-.8-3-1.5-.5-.6-.5-1-.5-1h-1z" fill="white"/>
            </svg>
        )
        case 'google-ads': return (
            <svg style={s} viewBox="0 0 24 24" fill="none">
                <path d="M3 17L9 7l6 10H3z" fill="#FBBC04"/>
                <path d="M15 7l6 10" stroke="#34A853" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="9" cy="17" r="3" fill="#4285F4"/>
            </svg>
        )
        default: return (
            <div style={{ ...s, borderRadius: 6, background: 'var(--sys-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: size * 0.55, color: 'white' }}>hub</span>
            </div>
        )
    }
}

const SOCIAL_PLATFORMS = [
    { id: 'instagram', name: 'Instagram', color: '#E1306C', desc: 'Photos, reels & stories' },
    { id: 'facebook', name: 'Facebook', color: '#1877F2', desc: 'Pages, groups & marketplace' },
    { id: 'linkedin', name: 'LinkedIn', color: '#0A66C2', desc: 'Professional posts & articles' },
    { id: 'twitter', name: 'X (Twitter)', color: '#E7E9EA', desc: 'Tweets & threads' },
    { id: 'tiktok', name: 'TikTok', color: '#00F2EA', desc: 'Short-form video content' },
    { id: 'youtube', name: 'YouTube', color: '#FF0000', desc: 'Long-form video & shorts', comingSoon: true },
]

const AD_PLATFORMS = [
    { key: 'meta', logoId: 'meta', name: 'Meta Ads', color: '#0081FB', desc: 'Facebook & Instagram ads' },
    { key: 'google', logoId: 'google-ads', name: 'Google Ads', color: '#34A853', desc: 'Search, display & YouTube ads' },
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
    const [shopifyMode, setShopifyMode] = useState('oauth') // Default to OAuth — Shopify reviewers expect standard OAuth
    const [shopifyError, setShopifyError] = useState('')
    const [products, setProducts] = useState([])
    const [showPublishModal, setShowPublishModal] = useState(false)
    const [productSearch, setProductSearch] = useState('')
    const [loading, setLoading] = useState({})
    const [syncing, setSyncing] = useState(false)
    const [activeTab, setActiveTab] = useState('platforms')
    const [selectedAccount, setSelectedAccount] = useState(null)
    const [posts, setPosts] = useState([])
    const [loadingPosts, setLoadingPosts] = useState(false)
    const [selectedProductDetails, setSelectedProductDetails] = useState(null)
    const [toast, setToast] = useState(null)
    const [deletingId, setDeletingId] = useState(null)
    const [confirmDialog, setConfirmDialog] = useState(null)
    const [enlargedImage, setEnlargedImage] = useState(null)

    const [isEditingProduct, setIsEditingProduct] = useState(false)
    const [editTitle, setEditTitle] = useState('')
    const [editDescription, setEditDescription] = useState('')
    const [editPrice, setEditPrice] = useState('')
    const [editVendor, setEditVendor] = useState('')
    const [editProductType, setEditProductType] = useState('')
    const [editSku, setEditSku] = useState('')
    const [editInventoryQuantity, setEditInventoryQuantity] = useState('')
    const [editTags, setEditTags] = useState('')
    const [editImageUrl, setEditImageUrl] = useState('')
    const [savingProduct, setSavingProduct] = useState(false)
    const [uploadingEditImage, setUploadingEditImage] = useState(false)

    const showConfirm = (title, message, onConfirm, isDanger = true, confirmText = 'Confirm', cancelText = 'Cancel') => {
        setConfirmDialog({
            title,
            message,
            confirmText,
            cancelText,
            isDanger,
            onConfirm: () => {
                onConfirm();
                setConfirmDialog(null);
            }
        });
    };

    const startEditingProduct = () => {
        setEditTitle(selectedProductDetails.title || '');
        setEditDescription(selectedProductDetails.description || '');
        setEditPrice(selectedProductDetails.variants?.[0]?.price || selectedProductDetails.price?.amount || '');
        setEditVendor(selectedProductDetails.vendor || '');
        setEditProductType(selectedProductDetails.productType || '');
        setEditSku(selectedProductDetails.variants?.[0]?.sku || '');
        setEditInventoryQuantity(selectedProductDetails.variants?.[0]?.inventoryQuantity || '');
        setEditTags(selectedProductDetails.tags?.join(', ') || '');
        setEditImageUrl(selectedProductDetails.images?.[0]?.url || '');
        setIsEditingProduct(true);
    };

    const handleEditImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingEditImage(true);
        try {
            const s3Url = await uploadFileToS3(file, 'shopify');
            setEditImageUrl(s3Url);
        } catch (err) {
            setToast({ message: `Image upload failed: ${err.message}`, type: 'error' });
        } finally {
            setUploadingEditImage(false);
        }
    };

    const saveProductDetails = async () => {
        if (!editTitle.trim()) {
            setToast({ message: 'Product title is required', type: 'error' });
            return;
        }
        if (!editPrice || isNaN(editPrice) || parseFloat(editPrice) < 0) {
            setToast({ message: 'Please enter a valid price', type: 'error' });
            return;
        }

        setSavingProduct(true);
        try {
            const parsedTags = editTags.split(',').map(t => t.trim()).filter(Boolean);
            const updatedData = {
                title: editTitle,
                description: editDescription,
                vendor: editVendor,
                productType: editProductType,
                tags: parsedTags,
                price: {
                    amount: parseFloat(editPrice),
                    currency: selectedProductDetails.price?.currency || 'INR'
                },
                variants: [
                    {
                        ...selectedProductDetails.variants?.[0],
                        price: parseFloat(editPrice),
                        sku: editSku,
                        inventoryQuantity: parseInt(editInventoryQuantity) || 0
                    }
                ],
                images: editImageUrl ? [{ url: editImageUrl, alt: editTitle }] : []
            };

            const response = await productsAPI.update(selectedProductDetails._id, updatedData);
            setToast({ message: 'Product updated successfully!', type: 'success' });
            setSelectedProductDetails(response.product || { ...selectedProductDetails, ...updatedData });
            setIsEditingProduct(false);
            loadProducts();
        } catch (err) {
            setToast({ message: `Failed to update product: ${err.message}`, type: 'error' });
        } finally {
            setSavingProduct(false);
        }
    };

    const closeDetailsModal = () => {
        setSelectedProductDetails(null);
        setIsEditingProduct(false);
    };

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000)
            return () => clearTimeout(timer)
        }
    }, [toast])

    // ── Google Analytics state ──
    const [gaConnected, setGaConnected] = useState(false)
    const [gaEmail, setGaEmail] = useState('')
    const [gaLoading, setGaLoading] = useState(false)

    // ── Ad Platform state ──
    const [adConnections, setAdConnections] = useState({ meta: { status: 'disconnected' }, google: { status: 'disconnected' } })
    const [connectingPlatform, setConnectingPlatform] = useState(null)

    // ── Etsy state ──
    const [etsyStatus, setEtsyStatus] = useState({ connected: false })
    const [etsyError, setEtsyError] = useState('')
    const [etsySuccess, setEtsySuccess] = useState('')

    // ── WooCommerce state ──
    const [wooStatus, setWooStatus] = useState({ connected: false })
    const [wooBaseUrl, setWooBaseUrl] = useState('')
    const [wooKey, setWooKey] = useState('')
    const [wooSecret, setWooSecret] = useState('')
    const [wooError, setWooError] = useState('')
    const [wooSuccess, setWooSuccess] = useState('')

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
                    if (!mappedStatus[acc.platform]) mappedStatus[acc.platform] = { connected: true, status: 'connected', accounts: [] }
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

            // Etsy
            try {
                const ed = await etsyAPI.status(brandId)
                setEtsyStatus(ed.status || { connected: false })
            } catch { setEtsyStatus({ connected: false }) }

            // WooCommerce
            try {
                const wd = await wooAPI.status(brandId)
                setWooStatus(wd.status || { connected: false })
            } catch { setWooStatus({ connected: false }) }

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

    // Listen for OAuth popup messages (Social + GA + PM platforms + Shopify) via postMessage and BroadcastChannel
    useEffect(() => {
        const syncChannel = new BroadcastChannel('mantram_sync')
        
        const handleMessage = (data) => {
            if (data?.type === 'GOOGLE_ANALYTICS_CONNECTED') {
                setGaConnected(true); setGaEmail(data.email || ''); loadAllStatuses()
            }
            if (data?.type === 'PM_PLATFORM_CONNECTED') {
                setConnectingPlatform(null); loadAllStatuses()
            }
            if (data?.type === 'SOCIAL_PLATFORM_CONNECTED') {
                loadAllStatuses()
            }
            if (data?.type === 'SOCIAL_PLATFORM_DENIED') {
                // User cancelled Twitter (or other) OAuth — clear loading spinner
                const p = data.platform
                if (p) setLoading(l => ({ ...l, [p]: false }))
            }
            if (data?.type === 'SHOPIFY_CONNECTED') {
                loadAllStatuses()
            }
            if (data?.type === 'SHOPIFY_FAILED') {
                setShopifyError(data.detail || 'OAuth connection failed. Please try again.')
            }
        }

        const windowHandler = (e) => {
            if (e.origin !== window.location.origin) return
            handleMessage(e.data)
            // Notify other open tabs/windows
            if (e.data?.type) {
                syncChannel.postMessage(e.data)
            }
        }

        const channelHandler = (e) => {
            handleMessage(e.data)
        }

        window.addEventListener('message', windowHandler)
        syncChannel.addEventListener('message', channelHandler)

        return () => {
            window.removeEventListener('message', windowHandler)
            syncChannel.removeEventListener('message', channelHandler)
            syncChannel.close()
        }
    }, [loadAllStatuses])

    // Detect if this window is an OAuth popup and should close itself
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const socialStatus = params.get('social')
        const platform = params.get('platform')
        const shopifyStatus = params.get('shopify')
        const error = params.get('error')
        const detail = params.get('detail')

        // We are inside a popup if opener exists or if the window name matches a popup signature
        const isPopup = window.opener || window.name === 'shopify_oauth_popup' || window.name.startsWith('connect_')

        if (isPopup) {
            const syncChannel = new BroadcastChannel('mantram_sync')
            
            if (socialStatus === 'success') {
                const msg = { type: 'SOCIAL_PLATFORM_CONNECTED', platform }
                if (window.opener) window.opener.postMessage(msg, window.location.origin)
                syncChannel.postMessage(msg)
                syncChannel.close()
                window.close()
            } else if (socialStatus) {
                const msg = { type: 'SOCIAL_PLATFORM_DENIED', platform, reason: socialStatus }
                if (window.opener) window.opener.postMessage(msg, window.location.origin)
                syncChannel.postMessage(msg)
                syncChannel.close()
                window.close()
            } else if (shopifyStatus === 'connected') {
                const msg = { type: 'SHOPIFY_CONNECTED' }
                if (window.opener) window.opener.postMessage(msg, window.location.origin)
                syncChannel.postMessage(msg)
                syncChannel.close()
                window.close()
            } else if (error === 'shopify_auth_failed') {
                const msg = { type: 'SHOPIFY_FAILED', detail }
                if (window.opener) window.opener.postMessage(msg, window.location.origin)
                syncChannel.postMessage(msg)
                syncChannel.close()
                window.close()
            }
        }
    }, [])

    // Handle redirect callbacks (GA, etc.)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const gaStatus = params.get('ga')
        const gaMsg = params.get('msg')
        
        if (gaStatus === 'success') {
            const email = params.get('email')
            setGaConnected(true)
            if (email) setGaEmail(decodeURIComponent(email))
            loadAllStatuses()
            // Clean URL
            navigate('/integrations', { replace: true })
        } else if (gaStatus === 'error') {
            setToast({ message: `Google Analytics Connection Failed: ${decodeURIComponent(gaMsg || 'Unknown error')}`, type: 'error' })
            navigate('/integrations', { replace: true })
        }

        const etsyStatusParam = params.get('etsy')
        const etsyMsg = params.get('message')

        if (etsyStatusParam === 'success') {
            setEtsySuccess('Etsy connected successfully!')
            setTimeout(() => setEtsySuccess(''), 5000)
            loadAllStatuses()
            navigate('/integrations', { replace: true })
        } else if (etsyStatusParam === 'error') {
            setEtsyError(`Connection failed: ${decodeURIComponent(etsyMsg || 'Unknown error')}`)
            setTimeout(() => setEtsyError(''), 5000)
            navigate('/integrations', { replace: true })
        }

        const shopifyStatusParam = params.get('shopify')
        const shopifyErrParam = params.get('error')
        const shopifyDetailParam = params.get('detail')

        if (shopifyStatusParam === 'connected') {
            loadAllStatuses()
            navigate('/integrations', { replace: true })
        } else if (shopifyErrParam === 'shopify_auth_failed') {
            setShopifyError(decodeURIComponent(shopifyDetailParam || 'OAuth connection failed.'))
            navigate('/integrations', { replace: true })
        }
    }, [navigate, loadAllStatuses])

    // ── Google Analytics Actions ──
    const connectGA = async () => {
        setGaLoading(true)
        try {
            // This is an authorized AJAX call to get the Google Auth URL
            const d = await gaAPI.connect(brandId, 'redirect')
            if (d.authUrl) {
                // Now redirect the main window to the Google Auth URL
                window.location.href = d.authUrl
            }
        } catch (e) { setToast({ message: `Connection failed: ${e.message}`, type: 'error' }) }
        finally { setGaLoading(false) }
    }
    const disconnectGA = async () => {
        showConfirm(
            'Disconnect Google Analytics',
            'Are you sure you want to disconnect Google Analytics for this brand?',
            async () => {
                try {
                    await gaAPI.disconnect(brandId)
                    setGaConnected(false)
                    setGaEmail('')
                    setToast({ message: 'Google Analytics disconnected successfully!', type: 'success' })
                } catch (err) {
                    setToast({ message: `Disconnect failed: ${err.message}`, type: 'error' })
                }
            }
        )
    }

    // ── Ad Platform Actions ──
    const connectAdPlatform = async (platformKey) => {
        setConnectingPlatform(platformKey)
        try {
            const data = await apiFetch(`/pm-studio/connect/${platformKey}/auth${brandId ? `?brandId=${brandId}` : ''}`)
            if (data.authUrl) window.open(data.authUrl, `connect_${platformKey}`, 'width=600,height=700,scrollbars=yes')
        } catch (e) {
            setToast({ message: `Connection failed: ${e.message}`, type: 'error' })
            setConnectingPlatform(null)
        }
    }
    const disconnectAdPlatform = async (platformKey) => {
        const platformName = platformKey === 'meta' ? 'Meta Ads' : 'Google Ads'
        showConfirm(
            `Disconnect ${platformName}`,
            `Are you sure you want to disconnect ${platformName} for this brand?`,
            async () => {
                try {
                    await apiFetch(`/pm-studio/connect/${platformKey}${brandId ? `?brandId=${brandId}` : ''}`, { method: 'DELETE' })
                    loadAllStatuses()
                    setToast({ message: `${platformName} disconnected successfully!`, type: 'success' })
                } catch (e) {
                    setToast({ message: e.message, type: 'error' })
                }
            }
        )
    }

    // ── Social Platform Actions ──
    const connectPlatform = async (platform) => {
        setLoading(l => ({ ...l, [platform]: true }))
        try {
            const data = await social.connect(platform, brandId)
            if (data.url) {
                window.location.href = data.url;
            } else if (data.authUrl) {
                window.open(data.authUrl, '_blank', 'width=600,height=700')
            }
        } catch (err) { setToast({ message: `Connection failed: ${err.message}`, type: 'error' }) }
        finally { setLoading(l => ({ ...l, [platform]: false })) }
    }
    const disconnectPlatform = async (accountId) => {
        showConfirm(
            'Disconnect Account',
            'Are you sure you want to disconnect this account?',
            async () => {
                try {
                    await social.disconnect(accountId)
                    loadAllStatuses()
                    setToast({ message: 'Account disconnected successfully!', type: 'success' })
                } catch (err) {
                    setToast({ message: err.message, type: 'error' })
                }
            }
        )
    }
    const loadPosts = async (account) => {
        setSelectedAccount(account); setLoadingPosts(true)
        try { const res = await social.getPosts(account._id); setPosts(res.data || []) }
        catch { } finally { setLoadingPosts(false) }
    }

    // ── Shopify Actions ──
    const connectShopify = async () => {
        setShopifyError('')
        if (!shopifyDomain) { setShopifyError('Enter your Shopify store domain (e.g. my-store.myshopify.com)'); return }
        if (shopifyMode === 'token') {
            if (!shopifyToken) { setShopifyError('Paste your Admin API Access Token'); return }
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connectToken(shopifyDomain, shopifyToken, brandId)
                setShopifyError(''); setShopifyToken(''); loadAllStatuses()
            } catch (err) { setShopifyError(err.message || 'Connection failed. Check your access token and try again.') }
            finally { setLoading(l => ({ ...l, shopify: false })) }
        } else {
            setLoading(l => ({ ...l, shopify: true }))
            try {
                const data = await shopifyAPI.connect(shopifyDomain, brandId)
                if (data.authUrl) window.open(data.authUrl, 'shopify_oauth_popup', 'width=600,height=700')
            } catch (err) { setShopifyError(err.message || 'OAuth connection failed. Please try again.') }
            finally { setLoading(l => ({ ...l, shopify: false })) }
        }
    }
    const syncProducts = async () => {
        setSyncing(true)
        try {
            const data = await shopifyAPI.sync(brandId)
            setToast({ message: `Synced ${data.products || 0} products from Shopify!`, type: 'success' })
            loadProducts()
        } catch (err) {
            setToast({ message: `Sync failed: ${err.message}`, type: 'error' })
        } finally { setSyncing(false) }
    }

    const deleteProduct = async (id) => {
        showConfirm(
            'Delete Product',
            'Are you sure you want to delete this product? This action cannot be undone.',
            async () => {
                setDeletingId(id)
                try {
                    await productsAPI.delete(id)
                    setToast({ message: 'Product deleted successfully!', type: 'success' })
                    setSelectedProductDetails(null)
                    loadProducts()
                } catch (err) {
                    setToast({ message: `Failed to delete product: ${err.message}`, type: 'error' })
                } finally {
                    setDeletingId(null)
                }
            },
            true,
            'Delete'
        )
    }
    const loadProducts = async () => {
        try { const data = await shopifyAPI.products({ search: productSearch }); setProducts(data.products || []) } catch { }
    }
    useEffect(() => { if (activeTab === 'products') loadProducts() }, [activeTab, productSearch])

    const shopifyStatus = platformStatus.shopify || {}

    return (
        <DashboardLayout title="Integrations" subtitle="Connect your platforms & tools">
            <SEOHead title="Integrations — Mantram AI" noIndex={true} />
            <style>{`
                @keyframes slideUp {
                    from { transform: translateY(100%) scale(0.95); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s ease-out forwards;
                }
                .animate-scale-in {
                    animation: scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
            `}</style>
            {/* Brand Indicator */}
            {activeBrand && (
                <div className="flex items-center gap-2 mb-5 px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-primary/10">
                    <span className="material-symbols-outlined text-primary text-base">storefront</span>
                    <span className="text-sm text-[var(--sys-text-muted)]">Showing integrations for</span>
                    <span className="text-sm font-bold text-[var(--sys-text)]">{activeBrand.name}</span>
                    <span className="text-xs text-[var(--sys-text-muted)] ml-auto">Switch brands in the header to manage other brands</span>
                </div>
            )}

            {/* Tab Switcher */}
            <div className="flex items-end justify-between mb-6">
                <div></div>
                <div className="flex gap-2">
                    <button onClick={() => setActiveTab('platforms')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === 'platforms' ? 'bg-primary text-black' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
                        <span className="material-symbols-outlined text-sm mr-1">hub</span> Platforms
                    </button>
                    <button onClick={() => setActiveTab('products')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${activeTab === 'products' ? 'bg-primary text-black' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}>
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
                                <span className="text-2xl"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">bar_chart</span></span> Analytics & Search Console
                                <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">Used by SEO Studio</span>
                            </h2>
                            <div className="glass-panel rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-[#F9AB00]/10 flex items-center justify-center">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M20 4h-4v16h4V4z" fill="#F9AB00" /><path d="M12 10h-4v10h4V10z" fill="#E37400" /><path d="M4 16h-0a2 2 0 100 4h0a2 2 0 100-4z" fill="#E37400" /></svg>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--sys-text)]">Google Analytics</h3>
                                            <p className="text-sm text-[var(--sys-text-muted)]">Website traffic, SERP & keyword rankings</p>
                                        </div>
                                    </div>
                                    <StatusBadge status={gaConnected ? 'connected' : 'disconnected'} />
                                </div>

                                {gaConnected ? (
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                            <div>
                                                <p className="text-sm text-[var(--sys-text)] font-medium">{gaEmail}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">Connected for {activeBrand?.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => navigate('/seo-studio')}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer flex items-center gap-1">
                                                <span className="material-symbols-outlined text-xs">analytics</span> View in SEO Studio
                                            </button>
                                            <button onClick={disconnectGA}
                                                className="px-3 py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={connectGA} disabled={gaLoading}
                                        className="w-full py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] bg-[#F9AB00]/15 text-[#F9AB00] border border-[#F9AB00]/25 hover:bg-[#F9AB00]/25 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                                        {gaLoading
                                            ? <><span className="material-symbols-outlined animate-spin text-base">progress_activity</span> Connecting...</>
                                            : <><span className="material-symbols-outlined text-base">link</span> Connect Google Analytics</>
                                        }
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* ═══════════ AD PLATFORMS SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--sys-text)]">
                                <span className="material-symbols-outlined text-primary text-lg align-middle">campaign</span>
                                Ad Platforms
                                <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">Used by Performance Studio</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {AD_PLATFORMS.map(p => {
                                    const conn = adConnections[p.key] || {}
                                    const isConnected = conn.status === 'connected'
                                    return (
                                        <div key={p.key} className="glass-panel rounded-2xl p-5 hover:border-primary/20 transition-all">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden"
                                                        style={{ background: `${p.color}15` }}>
                                                        <PlatformLogo id={p.logoId} size={32} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-[var(--sys-text)] text-sm">{p.name}</h3>
                                                        <p className="text-sm text-[var(--sys-text-muted)]">{p.desc}</p>
                                                    </div>
                                                </div>
                                                <StatusBadge status={isConnected ? 'connected' : 'disconnected'} />
                                            </div>

                                            {isConnected ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                        <span className="material-symbols-outlined text-primary text-sm">check_circle</span>
                                                        <span className="text-sm text-[var(--sys-text)] font-medium">{conn.email || conn.displayName || 'Connected'}</span>
                                                    </div>
                                                    {conn.customerIds?.length > 0 && (
                                                        <div className="px-2.5 py-1.5">
                                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Customer IDs:</p>
                                                            {conn.customerIds.slice(0, 3).map(id => (
                                                                <p key={id} className="text-xs text-[var(--sys-text-muted)]">{id}</p>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button onClick={() => navigate('/performance-marketing')}
                                                            className="flex-1 py-2 rounded-lg text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-all cursor-pointer flex items-center justify-center gap-1">
                                                            <span className="material-symbols-outlined text-xs">analytics</span> View in PM Studio
                                                        </button>
                                                        <button onClick={() => disconnectAdPlatform(p.key)}
                                                            className="py-2 px-3 rounded-lg text-xs font-medium text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
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
                                                        ` Connect ${p.name}`
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
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--sys-text)]">
                                <span className="material-symbols-outlined text-primary text-lg align-middle">shopping_bag</span>
                                E-Commerce
                                <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">Used by D2C Studio · Creative Studio · Research Studio</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Shopify — active */}
                                <div className="glass-panel rounded-2xl p-6 hover:border-primary/20 transition-all">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center">
                                                <PlatformLogo id="shopify" size={48} />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-[var(--sys-text)]">Shopify</h3>
                                                <p className="text-sm text-[var(--sys-text-muted)]">Sync products &amp; inventory</p>
                                            </div>
                                        </div>
                                        <StatusBadge status={shopifyStatus.status || 'disconnected'} />
                                    </div>

                                    {shopifyStatus.connected ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-4 text-sm">
                                                <span className="text-[var(--sys-text-muted)]">Store: <span className="text-[var(--sys-text)]">{shopifyStatus.displayName}</span></span>
                                                {shopifyStatus.lastSyncAt && (
                                                    <span className="text-[var(--sys-text-muted)]">Last sync: {new Date(shopifyStatus.lastSyncAt).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={syncProducts} disabled={syncing}
                                                    className="btn-primary px-4 py-2 rounded-xl text-sm flex items-center gap-1.5">
                                                    <span className={`material-symbols-outlined text-sm ${syncing ? 'animate-spin' : ''}`}>{syncing ? 'progress_activity' : 'sync'}</span>
                                                    {syncing ? 'Syncing...' : 'Sync Products'}
                                                </button>
                                                <button onClick={() => setActiveTab('products')}
                                                    className="px-4 py-2 rounded-xl text-sm bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-primary/50 text-[var(--sys-text)] transition-all flex items-center gap-1.5 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">inventory_2</span> View Products
                                                </button>
                                                <button onClick={() => {
                                                    showConfirm(
                                                        'Disconnect Shopify',
                                                        'Are you sure you want to disconnect Shopify for this brand?',
                                                        async () => {
                                                            setLoading(l => ({ ...l, shopify: true }));
                                                            try {
                                                                await shopifyAPI.disconnect(brandId);
                                                                loadAllStatuses();
                                                                setToast({ message: 'Shopify disconnected successfully!', type: 'success' });
                                                            } catch (err) {
                                                                setToast({ message: err.message, type: 'error' });
                                                            } finally {
                                                                setLoading(l => ({ ...l, shopify: false }));
                                                            }
                                                        }
                                                    );
                                                }}
                                                    className="px-4 py-2 rounded-xl text-sm text-primary hover:bg-[var(--sys-primary-dim)]">
                                                    Disconnect
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {!isEmbedded && (
                                                <div className="flex gap-2 mb-2">
                                                    <button onClick={() => setShopifyMode('token')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${shopifyMode === 'token' ? 'bg-[#96BF48]/20 text-[#96BF48] border border-[#96BF48]/30' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                                        🔑 Access Token
                                                    </button>
                                                    <button onClick={() => setShopifyMode('oauth')}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${shopifyMode === 'oauth' ? 'bg-[#96BF48]/20 text-[#96BF48] border border-[#96BF48]/30' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                                        🔗 OAuth
                                                    </button>
                                                </div>
                                            )}
                                            <input type="text" value={shopifyDomain} onChange={e => setShopifyDomain(e.target.value)}
                                                placeholder="my-store.myshopify.com"
                                                className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                                            {shopifyMode === 'oauth' && (
                                                <div className="p-3.5 rounded-xl bg-[#96BF48]/5 border border-[#96BF48]/20 flex gap-3">
                                                    <span className="material-symbols-outlined text-[#96BF48] text-xl">info</span>
                                                    <div className="text-xs leading-relaxed text-[var(--sys-text-muted)]">
                                                        Click <strong>Connect via OAuth</strong> to authorize Mantram AI. You'll be redirected to Shopify to approve permissions.
                                                    </div>
                                                </div>
                                            )}
                                            {shopifyError && (
                                                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-3">
                                                    <span className="material-symbols-outlined text-red-400 text-xl">error</span>
                                                    <div className="text-xs leading-relaxed text-red-300">{shopifyError}</div>
                                                </div>
                                            )}
                                            {shopifyMode === 'token' && (
                                                <>
                                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                                                        <h4 className="text-xs font-bold text-primary uppercase tracking-wider">How to connect using Access Token</h4>
                                                        <ol className="text-[11px] text-[var(--sys-text-muted)] space-y-2 list-decimal ml-4">
                                                            <li>Go to <strong>Shopify Admin</strong> → Settings → Apps and sales channels</li>
                                                            <li>Click <strong>Develop apps</strong> → <strong>Create an app</strong></li>
                                                            <li><strong>Configure Admin API scopes</strong>: Select <code>read_products</code>, <code>write_products</code>, <code>read_orders</code>, <code>read_customers</code>, <code>read_inventory</code>, <code>write_inventory</code></li>
                                                            <li>Click <strong>Install app</strong> and copy the <strong>Admin API access token</strong> (starts with <code>shpat_</code>)</li>
                                                        </ol>
                                                    </div>
                                                    <input type="password" value={shopifyToken} onChange={e => setShopifyToken(e.target.value)}
                                                        placeholder="Admin API Access Token (shpat_...)"
                                                        className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                                                </>
                                            )}
                                            <button onClick={connectShopify} disabled={loading.shopify}
                                                className="btn-primary w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                                                {loading.shopify
                                                    ? <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Connecting...</>
                                                    : <><span className="material-symbols-outlined text-sm">link</span> {shopifyMode === 'token' ? 'Connect with Token' : 'Connect via OAuth'}</>
                                                }
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* WooCommerce */}
                                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden transition-all" style={{ borderColor: wooStatus.connected ? '#96588A40' : undefined }}>
                                    {wooStatus.connected && (
                                        <div className="absolute top-3 right-3">
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#96588A20', color: '#96588A', border: '1px solid #96588A40' }}>Connected</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center">
                                            <PlatformLogo id="woocommerce" size={48} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--sys-text)]">WooCommerce</h3>
                                            <p className="text-sm text-[var(--sys-text-muted)]">WordPress store products &amp; orders</p>
                                        </div>
                                    </div>
                                    {wooStatus.connected ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] bg-[var(--sys-surface)] rounded-xl px-3 py-2">
                                                <span className="material-symbols-outlined text-sm" style={{ color: '#96588A' }}>store</span>
                                                <span className="truncate">{wooStatus.siteName || wooStatus.baseUrl}</span>
                                            </div>
                                            {wooStatus.lastSyncAt && (
                                                <p className="text-xs text-[var(--sys-text-muted)]">Last sync: {new Date(wooStatus.lastSyncAt).toLocaleDateString()}</p>
                                            )}
                                            <div className="flex gap-2">
                                                <button onClick={async () => { try { setLoading(l => ({ ...l, wooSync: true })); await wooAPI.sync(brandId); setWooSuccess('Sync complete!'); setTimeout(() => setWooSuccess(''), 3000); } catch(e) { setWooError(e.message) } finally { setLoading(l => ({ ...l, wooSync: false })) } }}
                                                    disabled={loading.wooSync}
                                                    className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                                                    style={{ background: '#96588A20', color: '#96588A', border: '1px solid #96588A30' }}>
                                                    {loading.wooSync ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">sync</span>}
                                                    Sync Now
                                                </button>
                                                <button onClick={() => {
                                                    showConfirm(
                                                        'Disconnect WooCommerce',
                                                        'Are you sure you want to disconnect WooCommerce for this brand?',
                                                        async () => {
                                                            try {
                                                                await wooAPI.disconnect(brandId);
                                                                setWooStatus({ connected: false });
                                                                setWooKey('');
                                                                setWooSecret('');
                                                                setToast({ message: 'WooCommerce disconnected successfully!', type: 'success' });
                                                            } catch (err) {
                                                                setToast({ message: err.message, type: 'error' });
                                                            }
                                                        }
                                                    );
                                                }}
                                                    className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                                                    style={{ background: '#ff4d0010', color: '#ff4d00', border: '1px solid #ff4d0020' }}>
                                                    <span className="material-symbols-outlined text-sm">link_off</span>
                                                </button>
                                            </div>
                                            {wooSuccess && <p className="text-xs text-green-400">{wooSuccess}</p>}
                                            {wooError && <p className="text-xs text-red-400">{wooError}</p>}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-xs text-[var(--sys-text-muted)]">Connect your WooCommerce store to sync products, orders, and power D2C analytics.</p>
                                            <input type="url" value={wooBaseUrl} onChange={e => setWooBaseUrl(e.target.value)}
                                                placeholder="https://yourstore.com"
                                                className="w-full px-3 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                                            <input type="text" value={wooKey} onChange={e => setWooKey(e.target.value)}
                                                placeholder="Consumer Key (ck_...)"
                                                className="w-full px-3 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                                            <input type="password" value={wooSecret} onChange={e => setWooSecret(e.target.value)}
                                                placeholder="Consumer Secret (cs_...)"
                                                className="w-full px-3 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                                            {wooError && <p className="text-xs text-red-400">{wooError}</p>}
                                            <button onClick={async () => {
                                                if (!wooBaseUrl || !wooKey || !wooSecret) return setWooError('All fields are required.');
                                                setWooError(''); setLoading(l => ({ ...l, woo: true }));
                                                try {
                                                    const r = await wooAPI.connect(wooBaseUrl, wooKey, wooSecret, brandId);
                                                    setWooStatus({ connected: true, siteName: r.siteName, baseUrl: r.baseUrl });
                                                } catch(e) { setWooError(e.message); }
                                                finally { setLoading(l => ({ ...l, woo: false })) }
                                            }} disabled={loading.woo}
                                                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                                                style={{ background: '#96588A20', color: '#96588A', border: '1px solid #96588A30' }}>
                                                {loading.woo ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">link</span>}
                                                Connect WooCommerce
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Etsy */}
                                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden transition-all" style={{ borderColor: etsyStatus.connected ? '#F5640040' : undefined }}>
                                    {etsyStatus.connected && (
                                        <div className="absolute top-3 right-3">
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#F5640020', color: '#F56400', border: '1px solid #F5640040' }}>Connected</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center">
                                            <PlatformLogo id="etsy" size={48} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--sys-text)]">Etsy</h3>
                                            <p className="text-sm text-[var(--sys-text-muted)]">Handmade, vintage &amp; craft listings</p>
                                        </div>
                                    </div>
                                    {etsyStatus.connected ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-[var(--sys-text-muted)] bg-[var(--sys-surface)] rounded-xl px-3 py-2">
                                                <span className="material-symbols-outlined text-sm" style={{ color: '#F56400' }}>storefront</span>
                                                <span className="truncate">{etsyStatus.shopName || `Shop ${etsyStatus.shopId}`}</span>
                                            </div>
                                            {etsyStatus.shopUrl && (
                                                <a href={etsyStatus.shopUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: '#F56400' }}>{etsyStatus.shopUrl}</a>
                                            )}
                                            {etsyStatus.lastSyncAt && (
                                                <p className="text-xs text-[var(--sys-text-muted)]">Last sync: {new Date(etsyStatus.lastSyncAt).toLocaleDateString()}</p>
                                            )}
                                            <div className="flex gap-2">
                                                <button onClick={async () => { try { setLoading(l => ({ ...l, etsySync: true })); await etsyAPI.sync(brandId); setEtsySuccess('Sync complete!'); setTimeout(() => setEtsySuccess(''), 3000); } catch(e) { setEtsyError(e.message) } finally { setLoading(l => ({ ...l, etsySync: false })) } }}
                                                    disabled={loading.etsySync}
                                                    className="flex-1 py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                                                    style={{ background: '#F5640020', color: '#F56400', border: '1px solid #F5640030' }}>
                                                    {loading.etsySync ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">sync</span>}
                                                    Sync Now
                                                </button>
                                                <button onClick={() => {
                                                    showConfirm(
                                                        'Disconnect Etsy',
                                                        'Are you sure you want to disconnect Etsy for this brand?',
                                                        async () => {
                                                            try {
                                                                await etsyAPI.disconnect(brandId);
                                                                setEtsyStatus({ connected: false });
                                                                setToast({ message: 'Etsy disconnected successfully!', type: 'success' });
                                                            } catch (err) {
                                                                setToast({ message: err.message, type: 'error' });
                                                            }
                                                        }
                                                    );
                                                }}
                                                    className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                                                    style={{ background: '#ff4d0010', color: '#ff4d00', border: '1px solid #ff4d0020' }}>
                                                    <span className="material-symbols-outlined text-sm">link_off</span>
                                                </button>
                                            </div>
                                            {etsySuccess && <p className="text-xs text-green-400">{etsySuccess}</p>}
                                            {etsyError && <p className="text-xs text-red-400">{etsyError}</p>}
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <p className="text-xs text-[var(--sys-text-muted)]">Connect your Etsy shop to sync listings, orders and generate AI-powered product content at scale.</p>
                                            {etsyError && <p className="text-xs text-red-400">{etsyError}</p>}
                                            <button onClick={async () => {
                                                setEtsyError(''); setLoading(l => ({ ...l, etsy: true }));
                                                try {
                                                    const res = await etsyAPI.auth(brandId);
                                                    if (res.url) {
                                                        window.location.href = res.url;
                                                    } else {
                                                        throw new Error('Failed to get authorization URL');
                                                    }
                                                } catch(e) { setEtsyError(e.message); }
                                                finally { setLoading(l => ({ ...l, etsy: false })) }
                                            }} disabled={loading.etsy}
                                                className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
                                                style={{ background: '#F5640020', color: '#F56400', border: '1px solid #F5640030' }}>
                                                {loading.etsy ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">link</span>}
                                                Connect Etsy via OAuth
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Amazon — coming soon */}
                                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden hover:border-primary/10 transition-all">
                                    <div className="absolute top-3 right-3">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary border border-primary/20">Coming Soon</span>
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center">
                                            <PlatformLogo id="amazon" size={48} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--sys-text)]">Amazon Seller</h3>
                                            <p className="text-sm text-[var(--sys-text-muted)]">Marketplace listings &amp; A+ content</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-[var(--sys-text-muted)] mb-3">Auto-generate A+ content, listing images and copy from your Amazon catalog.</p>
                                    <button disabled className="w-full py-2.5 rounded-xl text-sm font-medium opacity-40 cursor-not-allowed"
                                        style={{ background: '#FF990020', color: '#FF9900', border: '1px solid #FF990030' }}>
                                        Connect Amazon
                                    </button>
                                </div>

                            </div>
                        </section>


                        {/* ═══════════ SOCIAL MEDIA SECTION ═══════════ */}
                        <section>
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-[var(--sys-text)]">
                                <span className="material-symbols-outlined text-primary text-lg align-middle">smartphone</span>
                                Social Media
                                <span className="text-xs text-[var(--sys-text-muted)] font-normal ml-2">Used by Content &amp; Publish Studios</span>
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {SOCIAL_PLATFORMS.map(platform => {
                                    const status = platformStatus[platform.id] || {}
                                    return (
                                        <div key={platform.id} className={`glass-panel rounded-2xl p-5 transition-all relative ${
                                            platform.comingSoon ? 'opacity-70' : 'hover:border-primary/20'
                                        }`}>
                                            {platform.comingSoon && (
                                                <div className="absolute top-3 right-3">
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary border border-primary/20">Coming Soon</span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
                                                        <PlatformLogo id={platform.id} size={40} />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-[var(--sys-text)] text-sm">{platform.name}</h3>
                                                        <p className="text-sm text-[var(--sys-text-muted)]">{platform.desc}</p>
                                                    </div>
                                                </div>
                                                <StatusBadge status={status.status || 'disconnected'} />
                                            </div>

                                            {platform.comingSoon ? (
                                                <button disabled className="w-full py-2.5 rounded-xl text-sm font-medium opacity-40 cursor-not-allowed flex items-center justify-center gap-2"
                                                    style={{ background: `${platform.color}15`, color: platform.color, border: `1px solid ${platform.color}25` }}>
                                                    <span className="material-symbols-outlined text-sm">link_off</span>
                                                    Coming Soon
                                                </button>
                                            ) : status.connected && status.accounts ? (
                                                <div className="space-y-2">
                                                    {status.accounts.map(acc => (
                                                        <div key={acc._id} className="flex items-center justify-between p-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                            <div className="flex items-center gap-3 overflow-hidden">
                                                                {acc.avatar ? (
                                                                    <img src={acc.avatar} alt="avatar" className="w-8 h-8 rounded-full flex-shrink-0" />
                                                                ) : (
                                                                    <div className="w-8 h-8 rounded-full bg-[var(--sys-surface)] flex items-center justify-center flex-shrink-0">
                                                                        <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">person</span>
                                                                    </div>
                                                                )}
                                                                <div className="text-sm truncate pr-2">
                                                                    <span className="text-[var(--sys-text)] font-medium truncate block">{acc.accountName}</span>
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
                                                                    className="text-xs font-medium text-primary hover:text-[var(--sys-primary)] px-2 py-1 rounded-lg hover:bg-[var(--sys-primary-dim)] transition-colors flex-shrink-0">
                                                                    Disconnect
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => connectPlatform(platform.id)}
                                                        className="w-full mt-2 py-2 rounded-xl text-xs font-medium text-[var(--sys-text-muted)] bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] transition-all">
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
                                <span className="material-symbols-outlined text-lg">rocket_launch</span> Coming Soon
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {['Pinterest', 'Flipkart', 'Snapchat', 'WhatsApp Business'].map(name => (
                                    <div key={name} className="glass-panel rounded-xl p-4 opacity-50 text-center">
                                        <p className="text-sm font-medium text-[var(--sys-text-muted)]">{name}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">Coming soon</p>
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
                                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">search</span>
                                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Search products..."
                                    className="w-full pl-11 pr-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                            </div>
                            {shopifyStatus.connected && (
                                <div className="flex gap-2">
                                    <button onClick={() => setShowPublishModal(true)}
                                        className="px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer">
                                        <span className="material-symbols-outlined text-sm">add_box</span>
                                        Create Live Listing
                                    </button>
                                    <button onClick={syncProducts} disabled={syncing}
                                        className="btn-primary px-5 py-3 rounded-xl text-sm font-medium whitespace-nowrap">
                                        {syncing ? '⏳ Syncing...' : '🔄 Sync from Shopify'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {products.length === 0 ? (
                            <div className="text-center py-16">
                                <span className="material-symbols-outlined text-6xl text-slate-700">inventory_2</span>
                                <p className="text-[var(--sys-text-muted)] mt-4 text-lg">No products yet</p>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Connect Shopify to sync your product catalog</p>
                                <button onClick={() => setActiveTab('platforms')}
                                    className="btn-primary px-6 py-3 rounded-xl text-sm mt-6">
                                    Connect Shopify
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {products.map(product => (
                                    <div key={product._id} 
                                        onClick={() => setSelectedProductDetails(product)}
                                        className="glass-panel rounded-2xl overflow-hidden hover:border-primary/45 hover:scale-[1.01] transition-all group cursor-pointer">
                                        <div className="h-40 overflow-hidden bg-[var(--sys-surface)] flex items-center justify-center relative">
                                            {product.images?.[0]?.url ? (
                                                <>
                                                    <img src={product.images[0].url} alt={product.title}
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.nextSibling.style.display = 'flex';
                                                        }}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                    <div style={{ display: 'none' }} className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface-dim)] text-[var(--sys-text-muted)]">
                                                        <span className="material-symbols-outlined text-4xl">inventory_2</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface-dim)] text-[var(--sys-text-muted)]">
                                                    <span className="material-symbols-outlined text-4xl">inventory_2</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <h3 className="font-bold text-[var(--sys-text)] text-sm truncate">{product.title}</h3>
                                            <p className="text-sm text-[var(--sys-text-muted)] mt-0.5">{product.productType || product.vendor}</p>
                                            <div className="flex items-center justify-between mt-3">
                                                <span className="text-primary font-bold text-sm">
                                                    ₹{product.variants?.[0]?.price || '—'}
                                                </span>
                                                {product.tags?.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {product.tags.slice(0, 2).map((tag, i) => (
                                                            <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{tag}</span>
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
                    <div className="absolute inset-0 bg-[var(--sys-surface)] " onClick={() => setSelectedAccount(null)} />
                    <div className="relative bg-[#0c0f1a] border border-[var(--sys-border)] rounded-3xl w-full max-w-4xl flex flex-col max-h-[85vh] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-in">
                        <div className="flex items-center justify-between p-6 border-b border-[var(--sys-border)]">
                            <div className="flex items-center gap-4">
                                {selectedAccount.avatar ? (
                                    <img src={selectedAccount.avatar} className="w-10 h-10 rounded-full" alt="" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-[var(--sys-surface)] flex items-center justify-center font-bold text-primary">
                                        {selectedAccount.accountName[0]}
                                    </div>
                                )}
                                <div>
                                    <h3 className="text-xl font-bold text-[var(--sys-text)]">Manage {selectedAccount.accountName}</h3>
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase tracking-widest">{selectedAccount.platform} Integration</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedAccount(null)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                            {loadingPosts ? (
                                <div className="py-20 text-center">
                                    <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                                    <p className="text-[var(--sys-text-muted)] mt-4 font-medium">Fetching recent posts...</p>
                                </div>
                            ) : posts.length === 0 ? (
                                <div className="py-20 text-center bg-[var(--sys-surface)] rounded-2xl border border-dashed border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-5xl text-slate-700 mb-4 text-[var(--sys-text-muted)]">post_add</span>
                                    <p className="text-[var(--sys-text-muted)] font-medium">No recent posts found on this account.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {posts.map(post => (
                                        <div key={post.id} className="glass-panel p-4 rounded-2xl border border-[var(--sys-border)] hover:border-primary/30 transition-all group flex gap-4">
                                            {post.imageUrl && (
                                                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                    <img src={post.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt="" />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <p className="text-sm text-[var(--sys-text-muted)] line-clamp-2 leading-relaxed">
                                                        {post.content || <span className="italic text-[var(--sys-text-muted)]">No caption</span>}
                                                    </p>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] mt-2 block">
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
            {/* Create Live Listing Modal */}
            <PublishProductModal
                isOpen={showPublishModal}
                onClose={() => setShowPublishModal(false)}
                brandId={brandId}
                onPublishSuccess={() => {
                    loadProducts();
                }}
            />

            {/* Product Details Modal (Enlarge & View Details & Delete) */}
            {selectedProductDetails && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeDetailsModal} />
                    <div className="relative bg-[#0c0f1a] border border-[var(--sys-border)] rounded-3xl w-full max-w-3xl flex flex-col md:flex-row max-h-[85vh] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-in">
                        {/* Image Section */}
                        <div 
                            onClick={() => {
                                if (!isEditingProduct) {
                                    setEnlargedImage(editImageUrl || selectedProductDetails.images?.[0]?.url);
                                }
                            }}
                            className={`md:w-1/2 bg-[var(--sys-surface-dim)] flex items-center justify-center relative min-h-[300px] md:min-h-0 border-r border-[var(--sys-border)] overflow-hidden ${
                                isEditingProduct ? 'relative' : 'cursor-zoom-in group/img'
                            }`}>
                            {isEditingProduct ? (
                                <>
                                    {editImageUrl ? (
                                        <img src={editImageUrl} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface-dim)] text-[var(--sys-text-muted)]">
                                            <span className="material-symbols-outlined text-6xl">inventory_2</span>
                                        </div>
                                    )}
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                                        <div className="relative bg-[#0c0f1a]/85 hover:bg-[#0c0f1a] backdrop-blur-md border border-[var(--sys-border)] hover:border-primary/50 text-[var(--sys-text)] shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-xs font-bold transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">upload_file</span>
                                            <span>Upload Image</span>
                                            <input type="file" accept="image/*" onChange={handleEditImageUpload} disabled={uploadingEditImage || savingProduct}
                                                className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                        </div>
                                    </div>
                                    {uploadingEditImage && (
                                        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2">
                                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                                            <span className="text-xs text-primary font-bold">Uploading to S3...</span>
                                        </div>
                                    )}
                                </>
                            ) : (
                                selectedProductDetails.images?.[0]?.url ? (
                                    <>
                                        <img src={selectedProductDetails.images[0].url} alt={selectedProductDetails.title}
                                            onError={(e) => {
                                                e.target.style.display = 'none';
                                                e.target.nextSibling.style.display = 'flex';
                                            }}
                                            className="w-full h-full object-contain group-hover/img:scale-105 transition-transform duration-300" />
                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                            <div className="bg-[#0c0f1a]/85 border border-primary/20 rounded-full p-2.5 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-primary text-xl">zoom_in</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'none' }} className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface-dim)] text-[var(--sys-text-muted)]">
                                            <span className="material-symbols-outlined text-6xl">inventory_2</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface-dim)] text-[var(--sys-text-muted)]">
                                        <span className="material-symbols-outlined text-6xl">inventory_2</span>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Details Section */}
                        <div className="md:w-1/2 p-6 flex flex-col justify-between overflow-y-auto">
                            {isEditingProduct ? (
                                <div className="space-y-4 flex-1 flex flex-col justify-between">
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-primary uppercase">Edit Product Details</span>
                                            <button onClick={closeDetailsModal} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">close</span>
                                            </button>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Product Title *</label>
                                            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary focus:outline-none" />
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Vendor</label>
                                                <input type="text" value={editVendor} onChange={e => setEditVendor(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Product Type</label>
                                                <input type="text" value={editProductType} onChange={e => setEditProductType(e.target.value)}
                                                    className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Price *</label>
                                                <input type="number" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                                                    className="w-full px-2 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">SKU</label>
                                                <input type="text" value={editSku} onChange={e => setEditSku(e.target.value)}
                                                    className="w-full px-2 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Qty</label>
                                                <input type="number" value={editInventoryQuantity} onChange={e => setEditInventoryQuantity(e.target.value)}
                                                    className="w-full px-2 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Description</label>
                                            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none resize-none custom-scrollbar" />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Image URL</label>
                                            <input type="url" value={editImageUrl} onChange={e => setEditImageUrl(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase">Tags (comma-separated)</label>
                                            <input type="text" value={editTags} onChange={e => setEditTags(e.target.value)}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-primary focus:outline-none" />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-4 border-t border-[var(--sys-border)] mt-4">
                                        <button onClick={() => setIsEditingProduct(false)} disabled={savingProduct}
                                            className="flex-1 py-2 rounded-xl text-xs font-bold border border-[var(--sys-border)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                                            Cancel
                                        </button>
                                        <button onClick={saveProductDetails} disabled={savingProduct || uploadingEditImage}
                                            className="flex-1 py-2 rounded-xl text-xs font-bold bg-primary text-black hover:opacity-90 transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50">
                                            {savingProduct ? (
                                                <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Saving...</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-xs">save</span> Save</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                                {selectedProductDetails.source || 'Shopify'}
                                            </span>
                                            <button onClick={closeDetailsModal} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors cursor-pointer">
                                                <span className="material-symbols-outlined text-lg">close</span>
                                            </button>
                                        </div>
                                        <h3 className="text-xl font-bold text-[var(--sys-text)] mb-1 leading-tight">{selectedProductDetails.title}</h3>
                                        <p className="text-xs text-[var(--sys-text-muted)] mb-3">
                                            Type: {selectedProductDetails.productType || 'N/A'} | Vendor: {selectedProductDetails.vendor || 'N/A'}
                                        </p>
                                        <div className="text-xl font-extrabold text-primary mb-4">
                                            ₹{selectedProductDetails.variants?.[0]?.price || selectedProductDetails.price?.amount || '—'}
                                        </div>
                                        
                                        <div className="space-y-4">
                                            {selectedProductDetails.description && (
                                                <div>
                                                    <h4 className="text-xs font-bold uppercase text-[var(--sys-text-muted)] tracking-wider mb-1">Description</h4>
                                                    <p className="text-sm text-[var(--sys-text)] leading-relaxed max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                                        {selectedProductDetails.description}
                                                    </p>
                                                </div>
                                            )}
                                            
                                            {selectedProductDetails.tags?.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-bold uppercase text-[var(--sys-text-muted)] tracking-wider mb-1.5">Tags</h4>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {selectedProductDetails.tags.map((tag, i) => (
                                                            <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)]">
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-8 pt-4 border-t border-[var(--sys-border)] flex items-center justify-between gap-4">
                                        <span className="text-[10px] text-[var(--sys-text-muted)]">
                                            Synced: {new Date(selectedProductDetails.syncedAt || selectedProductDetails.createdAt).toLocaleDateString()}
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={startEditingProduct}
                                                className="px-4 py-2 bg-[var(--sys-surface)] hover:bg-[var(--sys-border)] border border-[var(--sys-border)] text-[var(--sys-text)] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer">
                                                <span className="material-symbols-outlined text-xs">edit</span> Edit Details
                                            </button>
                                            <button
                                                onClick={() => deleteProduct(selectedProductDetails._id)}
                                                disabled={deletingId === selectedProductDetails._id}
                                                className="px-4 py-2 bg-red-950/45 hover:bg-red-900 border border-red-500/30 text-red-400 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                                {deletingId === selectedProductDetails._id ? (
                                                    <><span className="material-symbols-outlined text-xs animate-spin">progress_activity</span> Deleting...</>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-xs">delete</span> Delete Product</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Toast Notifications Container */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-[100] animate-slide-up flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-[#0c0f1a]/95 border border-primary/20 backdrop-blur-md shadow-2xl">
                    <span className="material-symbols-outlined text-primary text-xl">
                        {toast.type === 'success' ? 'check_circle' : 'error'}
                    </span>
                    <span className="text-sm font-medium text-[var(--sys-text)]">{toast.message}</span>
                    <button onClick={() => setToast(null)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] ml-2 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}

            {/* Immersive Image Lightbox Overlay */}
            {enlargedImage && (
                <div 
                    onClick={() => setEnlargedImage(null)}
                    className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 cursor-zoom-out animate-fade-in">
                    <button 
                        onClick={() => setEnlargedImage(null)}
                        className="absolute top-6 right-6 text-white/60 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full cursor-pointer">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                    <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center relative animate-scale-in">
                        <img 
                            src={enlargedImage} 
                            alt="Enlarged product" 
                            className="max-w-full max-h-[85vh] object-contain rounded-xl select-none" 
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}

            {/* Custom Confirmation Modal */}
            {confirmDialog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDialog(null)} />
                    <div className="relative bg-[#0c0f1a] border border-[var(--sys-border)] rounded-3xl w-full max-w-md p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-scale-in space-y-6">
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${confirmDialog.isDanger ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary'}`}>
                                <span className="material-symbols-outlined text-xl">
                                    {confirmDialog.isDanger ? 'warning' : 'help'}
                                </span>
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-[var(--sys-text)]">{confirmDialog.title}</h3>
                                <p className="text-sm text-[var(--sys-text-muted)] leading-relaxed">{confirmDialog.message}</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                onClick={() => setConfirmDialog(null)}
                                className="px-4 py-2 bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] rounded-xl text-xs font-bold transition-all cursor-pointer">
                                {confirmDialog.cancelText || 'Cancel'}
                            </button>
                            <button
                                onClick={confirmDialog.onConfirm}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    confirmDialog.isDanger 
                                        ? 'bg-red-600 hover:bg-red-700 text-white' 
                                        : 'bg-primary hover:opacity-90 text-black'
                                }`}>
                                {confirmDialog.confirmText || 'Confirm'}
                            </button>
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
        connected: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', dot: 'bg-[var(--sys-surface)]', label: 'Connected' },
        pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', label: 'Pending' },
        expired: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', dot: 'bg-[var(--sys-surface)]', label: 'Expired' },
        disconnected: { bg: 'bg-[var(--sys-border)]/10', text: 'text-[var(--sys-text-muted)]', dot: 'bg-[var(--sys-border)]', label: 'Not Connected' },
    }
    const c = config[status] || config.disconnected
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            {c.label}
        </span>
    )
}

function PublishProductModal({ isOpen, onClose, brandId, onPublishSuccess }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [sku, setSku] = useState('');
    const [inventoryQuantity, setInventoryQuantity] = useState('10');
    const [vendor, setVendor] = useState('');
    const [productType, setProductType] = useState('');
    const [status, setStatus] = useState('draft');
    const [tags, setTags] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [error, setError] = useState('');
    const [uploadingFile, setUploadingFile] = useState(false);

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        setError('');
        try {
            const s3Url = await uploadFileToS3(file, 'shopify');
            setImageUrl(s3Url);
        } catch (err) {
            setError(err.message || 'Image upload failed');
        } finally {
            setUploadingFile(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) {
            setError('Product title is required');
            return;
        }
        if (!price || isNaN(price) || parseFloat(price) <= 0) {
            setError('Please enter a valid price greater than 0');
            return;
        }

        setPublishing(true);
        try {
            const productData = {
                title,
                description,
                vendor,
                productType,
                status,
                tags,
                variants: [
                    {
                        price: parseFloat(price),
                        sku,
                        inventoryQuantity: parseInt(inventoryQuantity) || 0
                    }
                ],
                images: imageUrl ? [{ url: imageUrl, alt: title }] : []
            };

            await shopifyAPI.publishProduct(brandId, productData);
            
            // Clear fields
            setTitle('');
            setDescription('');
            setPrice('');
            setSku('');
            setInventoryQuantity('10');
            setVendor('');
            setProductType('');
            setStatus('draft');
            setTags('');
            setImageUrl('');
            
            onPublishSuccess();
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to publish product');
        } finally {
            setPublishing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0c0f1a] border border-[var(--sys-border)] rounded-3xl w-full max-w-lg flex flex-col max-h-[90vh] shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-in">
                <div className="flex items-center justify-between p-6 border-b border-[var(--sys-border)]">
                    <div>
                        <h3 className="text-xl font-bold text-[var(--sys-text)]">Create Live Shopify Listing</h3>
                        <p className="text-xs text-[var(--sys-text-muted)]">Publish a new product directly to your store</p>
                    </div>
                    <button onClick={onClose} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-4">
                    {error && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                        </div>
                    )}

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Product Title *</label>
                        <input type="text" value={title} onChange={e => setTitle(e.target.value)} required
                            placeholder="e.g. Premium Cotton Unisex T-Shirt"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Description</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
                            placeholder="Product description (HTML supported)..."
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Price (INR) *</label>
                            <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required
                                placeholder="999.00"
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Status</label>
                            <select value={status} onChange={e => setStatus(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-primary focus:outline-none">
                                <option value="draft">Draft (Unpublished)</option>
                                <option value="active">Active (Live in Store)</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">SKU</label>
                            <input type="text" value={sku} onChange={e => setSku(e.target.value)}
                                placeholder="TSHIRT-BLK-M"
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Inventory Qty</label>
                            <input type="number" value={inventoryQuantity} onChange={e => setInventoryQuantity(e.target.value)}
                                placeholder="10"
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Vendor</label>
                            <input type="text" value={vendor} onChange={e => setVendor(e.target.value)}
                                placeholder="e.g. My Brand"
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Product Type</label>
                            <input type="text" value={productType} onChange={e => setProductType(e.target.value)}
                                placeholder="e.g. Apparel"
                                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Image URL</label>
                        <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Or Upload Image File</label>
                        <div className="relative flex items-center justify-center border-2 border-dashed border-[var(--sys-border)] hover:border-primary/40 rounded-xl p-4 transition-all bg-[var(--sys-surface)] min-h-[90px]">
                            <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingFile || publishing}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                            <div className="text-center space-y-1 pointer-events-none">
                                {uploadingFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-primary">
                                        <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                                        <span>Uploading to S3...</span>
                                    </div>
                                ) : imageUrl ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-emerald-400">
                                        <span className="material-symbols-outlined text-lg">check_circle</span>
                                        <span className="truncate max-w-[250px]">Image uploaded successfully</span>
                                    </div>
                                ) : (
                                    <div className="text-[var(--sys-text-muted)]">
                                        <span className="material-symbols-outlined text-3xl block mb-1">upload_file</span>
                                        <span className="text-xs font-semibold">Click to upload JPG, PNG, WEBP</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase">Tags (comma-separated)</label>
                        <input type="text" value={tags} onChange={e => setTags(e.target.value)}
                            placeholder="summer, casual, new-arrival"
                            className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm placeholder:text-[var(--sys-text-muted)] focus:border-primary focus:outline-none" />
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-[var(--sys-border)]">
                        <button type="button" onClick={onClose} disabled={publishing}
                            className="flex-1 py-3 rounded-xl text-sm font-medium border border-[var(--sys-border)] text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer disabled:opacity-50">
                            Cancel
                        </button>
                        <button type="submit" disabled={publishing}
                            className="flex-1 py-3 rounded-xl text-sm font-medium bg-primary text-black hover:opacity-90 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2">
                            {publishing ? (
                                <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Publishing...</>
                            ) : (
                                <><span className="material-symbols-outlined text-sm">publish</span> Publish Live</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

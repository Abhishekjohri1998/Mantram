import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { superadmin as API, social as socialAPI, getCorsUrl, API_BASE } from '../services/api'
import { useAuth } from '../context/AuthContext'
import TemplateManager from './TemplateManager'
import QAdsManager from './QAdsManager'
import VideoStudioManager from './VideoStudioManager'
import UsageAnalytics from './UsageAnalytics'
import AvatarOptionsForm from '../components/AvatarOptionsForm'
import Storyboard from '../components/VideoStudio/Storyboard'

export default function SuperAdminDashboard() {
    const navigate = useNavigate()
    const { user, loginWithToken, logout } = useAuth()
    const [tab, setTab] = useState('overview')
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [pendingUsers, setPendingUsers] = useState([])
    const [totalUsers, setTotalUsers] = useState(0)
    const [coupons, setCoupons] = useState([])
    const [retentionOffers, setRetentionOffers] = useState([])
    const [showRetentionForm, setShowRetentionForm] = useState(false)
    const [editingRetention, setEditingRetention] = useState(null)
    const [retentionForm, setRetentionForm] = useState({ name: '', description: '', triggerCondition: 'churn_risk', discountType: 'percentage', discountValue: 0, bonusCredits: 0, validForDays: 30, maxUses: 0, isActive: true })
    const [brands, setBrands] = useState([])
    const [totalBrands, setTotalBrands] = useState(0)
    const [content, setContent] = useState([])
    const [totalContent, setTotalContent] = useState(0)
    const [integrations, setIntegrations] = useState(null)
    const [aiHealth, setAiHealth] = useState(null)
    const [systemSettings, setSystemSettings] = useState(null)
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [planFilter, setPlanFilter] = useState('')
    const [userPage, setUserPage] = useState(1)
    const [toast, setToast] = useState(null)
    const [couponForm, setCouponForm] = useState({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '', applicablePlans: [], minPurchase: 0, maxUsesPerUser: 1 })
    const [showCouponForm, setShowCouponForm] = useState(false)
    const [creditModal, setCreditModal] = useState(null)
    const [creditAmount, setCreditAmount] = useState('')
    const [planModal, setPlanModal] = useState(null)
    // Package Builder state
    const [packages, setPackages] = useState([])
    const [aiSuggestions, setAiSuggestions] = useState(null)
    const [aiAnalytics, setAiAnalytics] = useState(null)
    const [suggestingAI, setSuggestingAI] = useState(false)
    const [showPkgForm, setShowPkgForm] = useState(false)
    const [editingPkg, setEditingPkg] = useState(null)
    const [pkgForm, setPkgForm] = useState({
        name: '', description: '', tagline: '', tier: 1,
        studios: { contentStudio: false, creativeStudio: false, seoStudio: false, brainstormStudio: false },
        credits: { monthly: 50, rollover: false, bonusOnSignup: 0 },
        creditCosts: { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 },
        limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 10, socialIntegrations: 1 },
        features: [],
        pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' },
        badge: '', color: '#6366f1', icon: 'star',
    })
    const [newFeature, setNewFeature] = useState('')
    // Credit cost management state (must be before early return)
    const [creditCosts, setCreditCosts] = useState(null)
    const [editingCosts, setEditingCosts] = useState(null)
    const [tokenData, setTokenData] = useState(null)
    const [tokenDays, setTokenDays] = useState(30)
    const [syncingCredits, setSyncingCredits] = useState(false)
    // Audit Log state
    const [logs, setLogs] = useState([])
    const [logsPage, setLogsPage] = useState(1)
    const [totalLogs, setTotalLogs] = useState(0)
    const [logsLoading, setLogsLoading] = useState(false)
    const [showBudgetModal, setShowBudgetModal] = useState(false)
    const [budgetForm, setBudgetForm] = useState({ anthropic: 0, openai: 0, gemini: 0, xai: 0, grok: 0, sarvam: 0 })
    // Pricing Calculator state
    const [pricingData, setPricingData] = useState(null)
    const [pricingPrice, setPricingPrice] = useState(2)
    const [pricingLoading, setPricingLoading] = useState(false)
    const [pricingStudioFilter, setPricingStudioFilter] = useState('all')
    // API Key Management state
    const [apiProviders, setApiProviders] = useState([])
    const [editingProvider, setEditingProvider] = useState(null)
    const [editProviderKeys, setEditProviderKeys] = useState({})
    const [testingProvider, setTestingProvider] = useState(null)
    const [testResults, setTestResults] = useState({})
    // Watermark Management state
    const [watermarkLogoPreview, setWatermarkLogoPreview] = useState('')
    // Provider Usage state
    const [providerUsageData, setProviderUsageData] = useState(null)
    const [providerUsageDays, setProviderUsageDays] = useState(30)
    const [providerUsageLoading, setProviderUsageLoading] = useState(false)
    // Pricing Command Center state
    const [policyData, setPolicyData] = useState(null)
    const [monitorData, setMonitorData] = useState(null)
    const [monitorChecking, setMonitorChecking] = useState(false)
    const [calcCreditPrice, setCalcCreditPrice] = useState(5)
    const [calcMargin, setCalcMargin] = useState(60)
    const [calcExRate, setCalcExRate] = useState(95.56)
    const [policySection, setPolicySection] = useState('calculator')
    const [videoModelRates, setVideoModelRates] = useState([])
    const [videoRatesSearch, setVideoRatesSearch] = useState('')
    const [videoRatesProviderFilter, setVideoRatesProviderFilter] = useState('all')
    const [videoRatesCategoryFilter, setVideoRatesCategoryFilter] = useState('all')
    const [loadingVideoRates, setLoadingVideoRates] = useState(false)
    const [videoRatesResolutionFilter, setVideoRatesResolutionFilter] = useState('all')
    const [expandedVideoModelId, setExpandedVideoModelId] = useState(null)
    const [imageModelRates, setImageModelRates] = useState([])
    const [imageRatesSearch, setImageRatesSearch] = useState('')
    const [imageRatesProviderFilter, setImageRatesProviderFilter] = useState('all')
    const [imageRatesCategoryFilter, setImageRatesCategoryFilter] = useState('all')
    const [imageRatesResolutionFilter, setImageRatesResolutionFilter] = useState('all')
    const [imageRatesQualityFilter, setImageRatesQualityFilter] = useState('all')
    const [expandedImageModelId, setExpandedImageModelId] = useState(null)
    const [loadingImageRates, setLoadingImageRates] = useState(false)
    const [monitorSubTab, setMonitorSubTab] = useState('providers')
    const [monitorTypeFilter, setMonitorTypeFilter] = useState('all')
    // Impersonation search
    const [impersonateSearch, setImpersonateSearch] = useState('')
    const [impersonateResults, setImpersonateResults] = useState([])
    const [impersonateLoading, setImpersonateLoading] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    // Video Provider Switching state
    const [videoProviders, setVideoProviders] = useState(null)
    const [videoCategories, setVideoCategories] = useState({})
    const [switchingProvider, setSwitchingProvider] = useState(null)
    const [addProviderForm, setAddProviderForm] = useState(null) // { modelId, ... }
    const [editProviderData, setEditProviderData] = useState(null) // { modelId, providerId, ... }
    const [imageProviders, setImageProviders] = useState(null)
    const [imageCategories, setImageCategories] = useState({})
    const [switchingImageProvider, setSwitchingImageProvider] = useState(null)
    const [addImageProviderForm, setAddImageProviderForm] = useState(null)
    const [editImageProviderData, setEditImageProviderData] = useState(null)
    // LLM Provider Switching state
    const [llmProviders, setLlmProviders] = useState(null)
    const [llmCategories, setLlmCategories] = useState({})
    const [switchingLlmProvider, setSwitchingLlmProvider] = useState(null)
    const [addLlmProviderForm, setAddLlmProviderForm] = useState(null)
    const [editLlmProviderData, setEditLlmProviderData] = useState(null)
    // Credit Packs management
    const [creditPacksList, setCreditPacksList] = useState([])
    const [showPackForm, setShowPackForm] = useState(false)
    const [editingPack, setEditingPack] = useState(null)
    const [packForm, setPackForm] = useState({ name: '', slug: '', credits: 100, bonusCredits: 0, price: 499, validityDays: 180, icon: 'bolt', badge: '', description: '', isPromo: false, promoDiscount: 0, promoOriginalPrice: 0, promoLabel: '', displayOrder: 0, isActive: true, isFirstPurchaseEligible: true })
    // Studio Visibility (3-tier access control)
    const [studioVisibility, setStudioVisibility] = useState(null)
    const [studioOverrides, setStudioOverrides] = useState([])
    const [studioKeys, setStudioKeys] = useState([])
    const [studioLabels, setStudioLabels] = useState({})
    // Per-user studio access modal
    const [userStudioModal, setUserStudioModal] = useState(null)
    // User Intelligence Analytics state
    const [userSegment, setUserSegment] = useState('all')
    const [userSort, setUserSort] = useState('lastActive')
    const [userSortOrder, setUserSortOrder] = useState('desc')
    const [segmentCounts, setSegmentCounts] = useState({})
    const [userDrawer, setUserDrawer] = useState(null)
    const [usersLoading, setUsersLoading] = useState(false)
    // Growth Content Engine state
    const [growthContent, setGrowthContent] = useState(null)
    const [growthStats, setGrowthStats] = useState(null)
    const [growthHistory, setGrowthHistory] = useState([])
    const [growthLoading, setGrowthLoading] = useState(false)
    const [growthGenerating, setGrowthGenerating] = useState(false)
    const [growthPlatformTab, setGrowthPlatformTab] = useState('linkedin')
    const [growthCopied, setGrowthCopied] = useState(null)
    const [growthRegenerating, setGrowthRegenerating] = useState(null)
    const [growthGeneratingImages, setGrowthGeneratingImages] = useState({})
    const [showTrafficModal, setShowTrafficModal] = useState(false)
    const generatingImagesRef = useRef({})
    useEffect(() => {
        generatingImagesRef.current = growthGeneratingImages
    }, [growthGeneratingImages])
    const hasAnyImageGenerating = Object.keys(growthGeneratingImages).length > 0
    const isImageGenerating = (key) => !!growthGeneratingImages[key]
    const [growthBatchGenerating, setGrowthBatchGenerating] = useState(false)
    const [growthBatchProgress, setGrowthBatchProgress] = useState({ current: 0, total: 0 })
    const [growthImageModel, setGrowthImageModel] = useState('gpt-image-2')
    const [growthHistoryPage, setGrowthHistoryPage] = useState(1)
    const [showGrowthHistory, setShowGrowthHistory] = useState(false)
    const [socialAccounts, setSocialAccounts] = useState([])
    const [isPublishing, setIsPublishing] = useState(null)
    const [publishModalConfig, setPublishModalConfig] = useState(null)
    const [showIgSliders, setShowIgSliders] = useState(false)
    const [growthPreviewImage, setGrowthPreviewImage] = useState(null)
    const [growthSelectedBrandId, setGrowthSelectedBrandId] = useState('')
    const [storyboardModalOpen, setStoryboardModalOpen] = useState(false)
    const [preSeededStoryboardData, setPreSeededStoryboardData] = useState(null)

    if (user?.role !== 'superadmin') {
        return <DashboardLayout><div className="flex items-center justify-center h-screen"><div className="text-center"><span className="material-symbols-outlined text-6xl text-primary mb-4">shield</span><h2 className="text-2xl font-bold text-[var(--sys-text)] mb-2">Access Denied</h2><p className="text-[var(--sys-text-muted)]">Super Admin access required</p></div></div></DashboardLayout>
    }

    const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

    const navGroups = [
        { label: 'Command Center', icon: 'command_bar', items: [
            { id: 'overview', label: 'Overview', icon: 'dashboard' },
            { id: 'growth', label: 'Growth Engine', icon: 'trending_up' },
        ]},
        { label: 'People', icon: 'group', items: [
            { id: 'approvals', label: 'Approvals', icon: 'how_to_reg', badge: pendingUsers?.length },
            { id: 'users', label: 'Users', icon: 'person_search' },
            { id: 'ai-credits', label: 'AI Usage', icon: 'token' },
        ]},
        { label: 'Monetization', icon: 'monetization_on', items: [
            { id: 'packages', label: 'Plans & Packages', icon: 'inventory_2' },
            { id: 'creditPacks', label: 'Credit Store', icon: 'shopping_cart' },
            { id: 'coupons', label: 'Coupons', icon: 'confirmation_number' },
            { id: 'retentionOffers', label: 'Retention Offers', icon: 'favorite' },
            { id: 'storeConfig', label: 'Store Config', icon: 'storefront' },
            { id: 'pricing', label: 'Pricing Strategy', icon: 'calculate' },
        ]},
        { label: 'AI Operations', icon: 'smart_toy', items: [
            { id: 'ai', label: 'AI & System', icon: 'psychology' },
            { id: 'tokenUsage', label: 'Token Usage', icon: 'monitoring' },
            { id: 'ugcStudio', label: 'UGC Studio', icon: 'smart_display' },
        ]},
        { label: 'Platform', icon: 'settings', items: [
            { id: 'templates', label: 'Template Manager', icon: 'style' },
            { id: 'avatars', label: 'Avatar Library', icon: 'face' },
            { id: 'qads', label: 'Q-Ads Manager', icon: 'movie' },
            { id: 'videoStudio', label: 'Video Studio', icon: 'slow_motion_video' },
            { id: 'analytics', label: 'Analytics', icon: 'analytics' },
            { id: 'studios', label: 'Studio Management', icon: 'rocket_launch' },
            { id: 'content', label: 'Content & Brands', icon: 'article' },
            { id: 'integrations', label: 'Integrations', icon: 'hub' },
            { id: 'logs', label: 'Audit Logs', icon: 'history' },
        ]},
    ]

    useEffect(() => { loadStats(); loadPackages(); loadTokenUsage() }, [])
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search])

    useEffect(() => {
        if (tab === 'users' || tab === 'ai-credits') { loadUsers(); if (tab === 'users') loadSegmentCounts() }
        if (tab === 'tokenUsage' || tab === 'overview') loadTokenUsage()
        if (tab === 'approvals') loadPendingUsers()
        if (tab === 'coupons') loadCoupons()
        if (tab === 'retentionOffers') loadRetentionOffers()
        if (tab === 'storeConfig') { loadSettings(); loadCreditCosts() }
        if (tab === 'content') { loadBrands(); loadContent() }
        if (tab === 'ai') { loadAIHealth(); loadSettings(); loadCreditCosts(); loadApiKeys(); loadVideoProviders(); loadImageProviders() }
        if (tab === 'studios') { loadStudioVisibility(); loadStudioOverrides(); }
        if (tab === 'integrations') loadIntegrations()
        if (tab === 'packages') loadPackages()
        if (tab === 'logs') loadLogs()
        if (tab === 'pricing') { loadPolicyData(); loadMonitorData(); loadPricingData(calcCreditPrice); loadVideoModelRates(); loadImageModelRates(); }
        if (tab === 'creditPacks') loadCreditPacks()
        if (tab === 'growth') loadGrowthData()
    }, [tab, debouncedSearch, planFilter, userPage, logsPage])
    // Reload users when segment/sort changes while on users tab
    useEffect(() => { if (tab === 'users') loadUsers() }, [userSegment, userSort, userSortOrder])

    const downloadImage = async (url, filename) => {
        try {
            const corsUrl = getCorsUrl(url)
            const response = await fetch(corsUrl, { mode: 'cors' })
            if (!response.ok) throw new Error('Network response was not ok')
            const blob = await response.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
        } catch (err) {
            console.error('Failed to download image via blob, opening in new tab:', err)
            window.open(url, '_blank')
        }
    }

    const loadGrowthData = async () => {
        setGrowthLoading(true)
        try {
            const [contentRes, statsRes, accountsRes, brandsRes] = await Promise.all([
                API.getGrowthContent(),
                API.getGrowthStats(),
                socialAPI.accounts().catch(() => ({ data: [] })),
                API.getBrands({ limit: 100 }).catch(() => ({ brands: [] }))
            ])
            setGrowthContent(contentRes.content)
            if (contentRes.content && contentRes.content.brandId) {
                setGrowthSelectedBrandId(contentRes.content.brandId)
            }
            setGrowthStats(statsRes.stats)
            setSocialAccounts(accountsRes.data || [])
            if (brandsRes && brandsRes.brands) {
                setBrands(brandsRes.brands)
            }
        } catch (e) { console.error('Growth data load failed:', e) }
        finally { setGrowthLoading(false) }
    }

    const loadGrowthHistory = async (page = 1) => {
        try {
            const res = await API.getGrowthHistory({ page, limit: 7 })
            setGrowthHistory(res.content || [])
        } catch (e) { console.error(e) }
    }

    const handleGenerateGrowth = async () => {
        setGrowthGenerating(true)
        try {
            const res = await API.generateGrowthContent({ brandId: growthSelectedBrandId || undefined })
            if (res.success) {
                setGrowthContent(res.content)
                showToast('Content generated successfully!')
                loadGrowthData()
            }
        } catch (e) { showToast(e.message || 'Generation failed', 'error') }
        finally { setGrowthGenerating(false) }
    }

    const [growthVideoProgress, setGrowthVideoProgress] = useState(0)
    const [growthVideoPhase, setGrowthVideoPhase] = useState('')
    const [growthVideoDetail, setGrowthVideoDetail] = useState('')
    const [growthVideoSegments, setGrowthVideoSegments] = useState(null)
    const [growthVideoEta, setGrowthVideoEta] = useState('')

    // Polling for active storyboard video completion in SuperAdmin dashboard
    useEffect(() => {
        const activeProjectId = growthContent?.instagram?.reel?.storyboardProjectId;
        const currentVideoUrl = growthContent?.instagram?.reel?.videoUrl;

        if (!activeProjectId || currentVideoUrl) return;

        let pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/video-studio/storyboard/status/${activeProjectId}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` }
                });
                const data = await res.json();
                if (data.success) {
                    if (data.finalVideoUrl) {
                        clearInterval(pollInterval);
                        // Save the video URL to the Reel Growth Content document!
                        const updateRes = await API.updateReelVideo(growthContent._id, {
                            videoUrl: data.finalVideoUrl,
                            imageUrl: data.imageUrl || data.project?.storyboard?.imageUrl || data.plan?.imageUrl
                        });
                        if (updateRes.success) {
                            setGrowthContent(updateRes.content);
                            showToast('Storyboard video completed and loaded!');
                        } else {
                            loadGrowthData();
                        }
                    } else if (data.status === 'FAILED') {
                        clearInterval(pollInterval);
                        const isTimeout = data.error && (data.error.includes('Network request timed out') || data.error.includes('504'));
                        showToast(isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : (data.error || 'Video studio generation failed.'), 'error');
                    } else if (data.status === 'IN_PROGRESS') {
                        setGrowthVideoProgress(data.overallProgress || 0);
                        setGrowthVideoPhase(data.phaseLabel || 'Generating...');
                        setGrowthVideoDetail(data.detail || '');
                        setGrowthVideoSegments(data.segments || null);
                        
                        if (data.startedAt && data.overallProgress > 0) {
                            const elapsed = (Date.now() - new Date(data.startedAt).getTime()) / 1000;
                            const velocity = elapsed / data.overallProgress;
                            const remaining = velocity * (100 - data.overallProgress);
                            
                            if (remaining > 0) {
                                const mins = Math.floor(remaining / 60);
                                const secs = Math.floor(remaining % 60);
                                setGrowthVideoEta(`~ ${mins}m ${secs}s remaining`);
                            } else {
                                setGrowthVideoEta('Finishing up...');
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('[Storyboard Poll] Error polling status:', err);
            }
        }, 8000);

        return () => clearInterval(pollInterval);
    }, [growthContent?.instagram?.reel?.storyboardProjectId, growthContent?.instagram?.reel?.videoUrl, growthContent?._id]);

    const handleOpenStoryboard = () => {
        const reel = growthContent?.instagram?.reel;
        if (!reel) return;

        // Convert scenes to cuts structure
        const preSeededCuts = (reel.scenes || []).map((scene, i) => {
            const durStr = scene.duration || '';
            let durSecs = 3;
            const parts = durStr.split(/[-–—]/);
            if (parts.length === 2) {
                const timeToSecs = (str) => {
                    const t = str.trim().split(':');
                    if (t.length === 2) return parseInt(t[0], 10) * 60 + parseInt(t[1], 10);
                    return parseInt(str, 10) || 0;
                };
                const start = timeToSecs(parts[0]);
                const end = timeToSecs(parts[1]);
                durSecs = Math.max(2, end - start);
            }

            return {
                id: scene.sceneNumber || (i + 1),
                lens: '50mm prime',
                duration: durSecs,
                move: 'STEADICAM',
                shot: (scene.shotType || 'Medium').toUpperCase(),
                scene: `${scene.action || ''}. ${scene.voiceover ? `🎙️ Speak: "${scene.voiceover}"` : ''}`,
                framePrompt: `${scene.action || ''}. ${scene.visualDescription || ''}. ${scene.textOverlay ? `Text overlay on screen: "${scene.textOverlay}"` : ''}`,
            };
        });

        const totalDurationVal = preSeededCuts.reduce((sum, c) => sum + c.duration, 0) || 30;

        setPreSeededStoryboardData({
            brief: reel.hook ? `Hook: ${reel.hook}. Concept: ${reel.concept || ''}` : reel.concept || '',
            preSeededCuts,
            duration: totalDurationVal,
            projectId: reel.storyboardProjectId || null,
        });
        setStoryboardModalOpen(true);
    };

    const handleMarkPosted = async (platform, index = 0) => {
        if (!growthContent?._id) return
        try {
            const res = await API.markGrowthPosted(growthContent._id, platform, index)
            if (res.success) setGrowthContent(res.content)
        } catch (e) { showToast('Failed to update', 'error') }
    }

    const triggerPublishModal = (platform, index = 0, slideIndex = null) => {
        const socialPlatform = platform.startsWith('instagram') ? 'instagram' : platform
        const platformAccounts = socialAccounts.filter(a => a.platform === socialPlatform)
        if (platformAccounts.length === 0) {
            showToast(`No ${socialPlatform} accounts connected. Please connect one in Integrations.`, 'error')
            return
        }
        setPublishModalConfig({ platform, index, slideIndex, accounts: platformAccounts, selectedAccountId: platformAccounts[0]._id })
    }

    const executeDirectPublish = async () => {
        if (!publishModalConfig || !publishModalConfig.selectedAccountId) return
        const { platform, index, slideIndex, selectedAccountId } = publishModalConfig
        
        const publishKey = slideIndex !== null ? `${platform}-${index}-${slideIndex}` : `${platform}-${index}`
        setIsPublishing(publishKey)
        setPublishModalConfig(null)
        
        try {
            let text = ''
            let imageUrls = []
            let imageUrl = null
            let videoUrl = null

            if (platform === 'linkedin') {
                const post = growthContent.linkedin[index]
                text = `${post.content}\n\n${post.hashtags?.join(' ')}`
                if (post.imageUrl) imageUrls.push(post.imageUrl)
            } else if (platform === 'twitter') {
                const post = growthContent.twitter[index]
                text = post.tweets.join('\n\n')
                if (post.imageUrl) imageUrl = post.imageUrl
            } else if (platform === 'reddit') {
                const post = growthContent.reddit[index]
                text = `${post.title}\n\n${post.body}`
                if (post.imageUrl) imageUrl = post.imageUrl
            } else if (platform === 'instagram_post') {
                const post = growthContent.instagram.post
                text = `${post.caption}\n\n${post.hashtags?.join(' ')}`
                imageUrls = post.slides.map(s => s.imageUrl).filter(Boolean)
            } else if (platform === 'instagram_story') {
                const story = growthContent.instagram.story
                if (slideIndex !== null) {
                    text = ''
                    imageUrl = story.slides[slideIndex]?.imageUrl
                } else {
                    text = ''
                    imageUrls = story.slides.map(s => s.imageUrl).filter(Boolean)
                }
            } else if (platform === 'instagram_reel') {
                const reel = growthContent.instagram.reel
                text = `${reel.caption}\n\n${reel.hashtags?.join(' ')}`
                if (reel.videoUrl) videoUrl = reel.videoUrl
                else if (reel.imageUrl) imageUrl = reel.imageUrl
                else if (reel.slides?.[0]?.imageUrl) imageUrl = reel.slides[0].imageUrl
            }

            const payload = {
                accountIds: [selectedAccountId],
                text,
                platform,
                ...(imageUrls.length > 1 ? { imageUrls } : {}),
                ...(imageUrls.length === 1 && !imageUrl ? { imageUrl: imageUrls[0] } : {}),
                ...(imageUrl ? { imageUrl } : {}),
                ...(videoUrl ? { videoUrl } : {})
            }

            const res = await socialAPI.publish(payload)
            if (res.success) {
                const errorResults = res.results?.filter(r => r.status === 'error' || r.status === 'failed') || []
                if (errorResults.length > 0) {
                    const errMsg = errorResults.map(r => r.error || 'Unknown error').join(', ')
                    showToast(`Publishing failed: ${errMsg}`, 'error')
                } else {
                    showToast(`Successfully published to ${platform}!`)
                    await handleMarkPosted(platform, index)
                }
            }
        } catch (e) {
            console.error('Publish error:', e)
            showToast(e.message || 'Publishing failed', 'error')
        } finally {
            setIsPublishing(null)
        }
    }

    const handleRegeneratePost = async (platform, index = 0) => {
        if (!growthContent?._id) return
        setGrowthRegenerating(`${platform}-${index}`)
        try {
            const res = await API.regenerateGrowthPost(growthContent._id, { platform, index })
            if (res.success) {
                setGrowthContent(res.content)
                showToast('Post regenerated!')
            }
        } catch (e) { showToast('Regeneration failed', 'error') }
        finally { setGrowthRegenerating(null) }
    }

    const mergeGrowthContent = (prev, next) => {
        if (!prev) return next
        const merged = { ...prev }
        
        if (next.linkedin && prev.linkedin) {
            merged.linkedin = prev.linkedin.map((post, i) => {
                const nextPost = next.linkedin[i]
                if (nextPost && nextPost.imageUrl) {
                    return { ...post, imageUrl: nextPost.imageUrl }
                }
                return post
            })
        }
        
        if (next.twitter && prev.twitter) {
            merged.twitter = prev.twitter.map((post, i) => {
                const nextPost = next.twitter[i]
                if (nextPost && nextPost.imageUrl) {
                    return { ...post, imageUrl: nextPost.imageUrl }
                }
                return post
            })
        }
        
        if (next.reddit && prev.reddit) {
            merged.reddit = prev.reddit.map((post, i) => {
                const nextPost = next.reddit[i]
                if (nextPost && nextPost.imageUrl) {
                    return { ...post, imageUrl: nextPost.imageUrl }
                }
                return post
            })
        }
        
        if (next.instagram && prev.instagram) {
            merged.instagram = {
                ...prev.instagram,
                post: prev.instagram.post ? {
                    ...prev.instagram.post,
                    coverImageUrl: next.instagram.post?.coverImageUrl || prev.instagram.post.coverImageUrl,
                    slides: prev.instagram.post.slides ? prev.instagram.post.slides.map((slide, j) => {
                        const nextSlide = next.instagram.post.slides?.[j]
                        if (nextSlide && nextSlide.imageUrl) {
                            return { ...slide, imageUrl: nextSlide.imageUrl }
                        }
                        return slide
                    }) : prev.instagram.post.slides
                } : prev.instagram.post,
                story: prev.instagram.story ? {
                    ...prev.instagram.story,
                    slides: prev.instagram.story.slides ? prev.instagram.story.slides.map((slide, j) => {
                        const nextSlide = next.instagram.story.slides?.[j]
                        if (nextSlide && nextSlide.imageUrl) {
                            return { ...slide, imageUrl: nextSlide.imageUrl }
                        }
                        return slide
                    }) : prev.instagram.story.slides
                } : prev.instagram.story
            }
        }
        
        return merged
    }

    const handleGenerateImage = async (platform, index = 0, slideIndex = null) => {
        if (!growthContent?._id) return
        const key = slideIndex !== null ? `${platform}-${index}-${slideIndex}` : `${platform}-${index}`
        setGrowthGeneratingImages(prev => ({ ...prev, [key]: true }))

        const timer = setTimeout(() => {
            if (generatingImagesRef.current[key]) {
                setShowTrafficModal(true)
            }
        }, 30000)

        try {
            const res = await API.generateGrowthImage(growthContent._id, { platform, index, slideIndex, imageModel: growthImageModel })
            if (res.success) {
                setGrowthContent(prev => mergeGrowthContent(prev, res.content))
                showToast('Image generated successfully!')
            }
        } catch (e) { showToast(e.message || 'Image generation failed', 'error') }
        finally {
            clearTimeout(timer)
            setGrowthGeneratingImages(prev => {
                const next = { ...prev }
                delete next[key]
                return next
            })
        }
    }

    const handleGenerateAllImages = async (scope = 'platform') => {
        if (!growthContent?._id || growthBatchGenerating) return
        const jobs = []

        if (scope === 'instagram_slides') {
            // Generate only carousel slide images
            const slides = growthContent.instagram?.post?.slides || []
            slides.forEach((s, j) => {
                if (!s.imageUrl) jobs.push({ platform: 'instagram_post', index: 0, slideIndex: j })
            })
        } else if (scope === 'instagram_story') {
            // Generate only story slide images
            const storySlides = growthContent.instagram?.story?.slides || []
            storySlides.forEach((s, j) => {
                if (!s.imageUrl) jobs.push({ platform: 'instagram_story', index: 0, slideIndex: j })
            })
        } else if (scope === 'platform') {
            // Generate all images for current platform tab
            if (growthPlatformTab === 'linkedin') {
                (growthContent.linkedin || []).forEach((_, i) => jobs.push({ platform: 'linkedin', index: i }))
            } else if (growthPlatformTab === 'instagram') {
                const slides = growthContent.instagram?.post?.slides || []
                slides.forEach((s, j) => {
                    if (!s.imageUrl) jobs.push({ platform: 'instagram_post', index: 0, slideIndex: j })
                })
                const storySlides = growthContent.instagram?.story?.slides || []
                storySlides.forEach((s, j) => {
                    if (!s.imageUrl) jobs.push({ platform: 'instagram_story', index: 0, slideIndex: j })
                })
            } else if (growthPlatformTab === 'twitter') {
                (growthContent.twitter || []).forEach((_, i) => jobs.push({ platform: 'twitter', index: i }))
            } else if (growthPlatformTab === 'reddit') {
                (growthContent.reddit || []).forEach((_, i) => jobs.push({ platform: 'reddit', index: i }))
            }
        } else if (scope === 'all') {
            // Generate ALL images across all platforms
            (growthContent.linkedin || []).forEach((_, i) => jobs.push({ platform: 'linkedin', index: i }))
            const slides = growthContent.instagram?.post?.slides || []
            slides.forEach((s, j) => {
                if (!s.imageUrl) jobs.push({ platform: 'instagram_post', index: 0, slideIndex: j })
            })
            const storySlides = growthContent.instagram?.story?.slides || []
            storySlides.forEach((s, j) => {
                if (!s.imageUrl) jobs.push({ platform: 'instagram_story', index: 0, slideIndex: j })
            })
            ;(growthContent.twitter || []).forEach((_, i) => jobs.push({ platform: 'twitter', index: i }))
            ;(growthContent.reddit || []).forEach((_, i) => jobs.push({ platform: 'reddit', index: i }))
        }

        if (jobs.length === 0) {
            showToast('No images to generate (all already have images)', 'info')
            return
        }

        setGrowthBatchGenerating(true)
        setGrowthBatchProgress({ current: 0, total: jobs.length })
        let successCount = 0
        let failCount = 0

        const initialGenerating = {}
        jobs.forEach(job => {
            const key = job.slideIndex !== null && job.slideIndex !== undefined
                ? `${job.platform}-${job.index}-${job.slideIndex}`
                : `${job.platform}-${job.index}`
            initialGenerating[key] = true
        })
        setGrowthGeneratingImages(prev => ({ ...prev, ...initialGenerating }))

        const promises = jobs.map(async (job) => {
            const key = job.slideIndex !== null && job.slideIndex !== undefined
                ? `${job.platform}-${job.index}-${job.slideIndex}`
                : `${job.platform}-${job.index}`

            const timer = setTimeout(() => {
                if (generatingImagesRef.current[key]) {
                    setShowTrafficModal(true)
                }
            }, 30000)

            try {
                const res = await API.generateGrowthImage(growthContent._id, {
                    platform: job.platform,
                    index: job.index,
                    slideIndex: job.slideIndex ?? null,
                    imageModel: growthImageModel
                })
                if (res.success) {
                    setGrowthContent(prev => mergeGrowthContent(prev, res.content))
                    successCount++
                } else {
                    failCount++
                }
            } catch (e) {
                failCount++
                console.error(`Failed to generate image for ${key}:`, e)
            } finally {
                clearTimeout(timer)
                setGrowthGeneratingImages(prev => {
                    const next = { ...prev }
                    delete next[key]
                    return next
                })
                setGrowthBatchProgress(prev => ({ ...prev, current: prev.current + 1 }))
            }
        })

        await Promise.all(promises)

        setGrowthBatchGenerating(false)
        setGrowthBatchProgress({ current: 0, total: 0 })
        if (failCount === 0) {
            showToast(`✨ All ${successCount} images generated successfully!`)
        } else {
            showToast(`Generated ${successCount}/${jobs.length} images (${failCount} failed)`, 'warning')
        }
    }

    const handleCopyContent = (text, key) => {
        navigator.clipboard.writeText(text)
        setGrowthCopied(key)
        setTimeout(() => setGrowthCopied(null), 2000)
    }

    const loadStats = async () => { try { const d = await API.getStats(); setStats(d.stats) } catch (e) { console.error(e) } finally { setLoading(false) } }
    const loadUsers = async (silent = false) => {
        if (!silent) setUsersLoading(true)
        try {
            const d = await API.getUserAnalytics({ page: userPage, limit: 25, search: debouncedSearch, plan: planFilter, segment: userSegment, sort: userSort, order: userSortOrder })
            setUsers(d.users || [])
            setTotalUsers(d.total || 0)
        } catch (e) {
            // fallback to basic list if analytics endpoint not yet deployed
            try { const d = await API.getUsers({ page: userPage, limit: 25, search: debouncedSearch, plan: planFilter }); setUsers(d.users || []); setTotalUsers(d.total || 0) } catch {}
        } finally { if (!silent) setUsersLoading(false) }
    }
    const loadSegmentCounts = async () => {
        try { const d = await API.getUserSegmentCounts(); setSegmentCounts(d.counts || {}) } catch {}
    }
    const loadLogs = async () => { setLogsLoading(true); try { const d = await API.getSystemLogs({ page: logsPage, limit: 50 }); setLogs(d.logs || []); setTotalLogs(d.total || 0) } catch (e) { console.error(e) } finally { setLogsLoading(false) } }
    const loadPendingUsers = async () => { try { const d = await API.getUsers({ approvalStatus: 'pending', limit: 50 }); setPendingUsers(d.users || []) } catch (e) { console.error(e) } }
    const loadCoupons = async () => { try { const d = await API.getCoupons(); setCoupons(d.coupons || []) } catch (e) { console.error(e) } }
    const loadRetentionOffers = async () => { try { const d = await API.getRetentionOffers(); setRetentionOffers(d.offers || []) } catch (e) { console.error(e) } }
    const loadBrands = async () => { try { const d = await API.getBrands({ limit: 50 }); setBrands(d.brands || []); setTotalBrands(d.total || 0) } catch (e) { console.error(e) } }
    const loadContent = async () => { try { const d = await API.getContent({ limit: 50 }); setContent(d.content || []); setTotalContent(d.total || 0) } catch (e) { console.error(e) } }
    const loadAIHealth = async () => { try { const d = await API.getAIHealth(); setAiHealth(d.aiHealth) } catch (e) { console.error(e) } }
    const loadSettings = async () => { try { const d = await API.getSystemSettings(); setSystemSettings(d.settings) } catch (e) { console.error(e) } }
    const loadIntegrations = async () => { try { const d = await API.getIntegrations(); setIntegrations(d) } catch (e) { console.error(e) } }
    const loadPackages = async () => { try { const d = await API.getPackages(); setPackages(d.packages || []) } catch (e) { console.error(e) } }
    const handleAISuggest = async () => { setSuggestingAI(true); try { const d = await API.aiSuggestPackages(); setAiSuggestions(d.suggestions || []); setAiAnalytics(d.analytics) } catch (e) { showToast('AI suggestion failed', 'error') } finally { setSuggestingAI(false) } }
    const handleSeedDefaults = async () => { if (!confirm('Seed default packages?')) return; try { const d = await API.seedDefaultPackages(packages.length > 0); showToast(d.message || 'Packages seeded'); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleSavePkg = async (e) => { e.preventDefault(); try { if (editingPkg) { await API.updatePackage(editingPkg._id, pkgForm); showToast('Package updated') } else { await API.createPackage(pkgForm); showToast('Package created') } setShowPkgForm(false); setEditingPkg(null); resetPkgForm(); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeletePkg = async (id, name) => { if (!confirm(`Delete package "${name}"?`)) return; try { await API.deletePackage(id); showToast('Deleted'); loadPackages() } catch { showToast('Failed', 'error') } }
    const handleEditPkg = (pkg) => { setEditingPkg(pkg); setPkgForm({ name: pkg.name, description: pkg.description || '', tagline: pkg.tagline || '', tier: pkg.tier || 1, studios: pkg.studios || {}, credits: pkg.credits || { monthly: 50, rollover: false, bonusOnSignup: 0 }, creditCosts: pkg.creditCosts || { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 }, limits: pkg.limits || {}, features: pkg.features || [], pricing: pkg.pricing || { monthly: 0, quarterly: 0, yearly: 0 }, badge: pkg.badge || '', color: pkg.color || '#6366f1', icon: pkg.icon || 'star' }); setShowPkgForm(true) }
    const handleAdoptSuggestion = async (s) => { try { await API.createPackage({ ...s, createdBy: undefined }); showToast(`"${s.name}" adopted`); loadPackages() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const resetPkgForm = () => setPkgForm({ name: '', description: '', tagline: '', tier: 1, studios: { contentStudio: false, creativeStudio: false, seoStudio: false, brainstormStudio: false }, credits: { monthly: 50, rollover: false, bonusOnSignup: 0 }, creditCosts: { content: 2, creative: 5, seo: 3, brainstorm: 3, photoshoot: 10 }, limits: { maxBrands: 1, maxTeamMembers: 0, maxProducts: 50, maxScheduledPosts: 10, socialIntegrations: 1 }, features: [], pricing: { monthly: 0, quarterly: 0, yearly: 0, currency: 'INR' }, badge: '', color: '#6366f1', icon: 'star' })
    // Credit cost management functions (useState moved to top with other hooks)
    const loadCreditCosts = async () => { try { const d = await API.getCreditCosts(); setCreditCosts(d.costs); } catch (e) { console.error(e) } }
    const handleSaveCosts = async () => { try { await API.updateCreditCosts(editingCosts); showToast('Credit costs updated'); setEditingCosts(null); loadCreditCosts() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleResetCosts = async () => { if (!confirm('Reset all credit costs to defaults?')) return; try { await API.resetCreditCosts(); showToast('Reset to defaults'); setEditingCosts(null); loadCreditCosts() } catch { showToast('Failed', 'error') } }
    const creditCostLabels = { content: 'Content Generate', contentRefine: 'Content Refine/Regen', creative: 'Creative (Image)', photoshoot: 'AI Photoshoot', seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic', seoCompetitors: 'SEO Competitors', seoAiVisibility: 'SEO AI Visibility', seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit', seoCompetitorDiscover: 'SEO Discover', seoBacklinks: 'SEO Backlinks', seoWarRoom: 'SEO War Room', seoLlmProbe: 'SEO LLM Probe', seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining', brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine', brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay', trendRefresh: 'Trend Refresh', videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generate', videoEdit: 'Video Edit', socialMedia: 'Social Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Audit', socialMediaCompetitor: 'Social Competitor', socialMediaScore: 'Social Score', canvasGenerate: 'Canvas AI Gen', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend', adCreative: 'Ad Creative', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe' }
    const loadPricingData = async (price, margin, exRate) => { setPricingLoading(true); try { const d = await API.getPricingCalculator({ creditPriceINR: price || calcCreditPrice, usdToInr: exRate || calcExRate, targetMargin: margin || calcMargin }); setPricingData(d) } catch (e) { console.error('Pricing calc error:', e) } finally { setPricingLoading(false) } }
    const loadPolicyData = async () => { try { const d = await API.getPricingPolicy(); setPolicyData(d.policy) } catch (e) { console.error(e) } }
    const loadVideoModelRates = async () => { setLoadingVideoRates(true); try { const d = await API.getVideoModelCosts(); setVideoModelRates(d.models || []) } catch (e) { console.error('Failed to load video rates:', e) } finally { setLoadingVideoRates(false) } }
    const loadImageModelRates = async () => { setLoadingImageRates(true); try { const d = await API.getImageModelCosts(); setImageModelRates(d.models || []) } catch (e) { console.error('Failed to load image rates:', e) } finally { setLoadingImageRates(false) } }
    const loadMonitorData = async () => { try { const d = await API.getPricingMonitor(); setMonitorData(d) } catch (e) { console.error(e) } }
    const handlePricingCheck = async () => { setMonitorChecking(true); try { const d = await API.triggerPricingCheck(); showToast(d.message); loadMonitorData() } catch (e) { showToast(e.error || 'Check failed', 'error') } finally { setMonitorChecking(false) } }
    const handleDismissAlerts = async () => { try { await API.dismissPricingAlerts(); showToast('Alerts dismissed'); loadMonitorData() } catch { showToast('Failed', 'error') } }
    // Studio visibility
    const loadStudioVisibility = async () => { try { const d = await API.getStudioVisibility(); setStudioVisibility(d.portalVisibility); setStudioKeys(d.studioKeys || []); setStudioLabels(d.studioLabels || {}) } catch (e) { console.error(e) } }
    const loadStudioOverrides = async () => { try { const d = await API.getStudioOverrides(); setStudioOverrides(d.overrides || []) } catch (e) { console.error(e) } }
    const handleStudioVisibilityChange = async (key, newState) => {
        const updated = { ...studioVisibility, [key]: newState }
        setStudioVisibility(updated)
        try { await API.updateStudioVisibility({ visibility: updated }); showToast(`${studioLabels[key] || key} → ${newState}`) } catch { showToast('Failed', 'error') }
    }
    const openUserStudioModal = async (userId) => {
        try {
            const d = await API.getUserStudioAccess(userId)
            setUserStudioModal({ ...d, userId })
        } catch { showToast('Failed to load studio access', 'error') }
    }
    const handleUserStudioOverride = async (key, val) => {
        if (!userStudioModal) return
        const userId = userStudioModal.userId
        try {
            const d = await API.updateUserStudioAccess(userId, { overrides: { [key]: val } })
            setUserStudioModal(prev => ({ ...prev, resolvedAccess: d.resolvedAccess, userOverrides: { ...prev.userOverrides, [key]: val } }))
            showToast(`${studioLabels[key] || key} → ${val === true ? 'granted' : val === false ? 'revoked' : 'reset'}`)
            loadStudioOverrides()
        } catch { showToast('Failed', 'error') }
    }
    // Credit Pack management
    const loadCreditPacks = async () => { try { const d = await API.getCreditPacks(); setCreditPacksList(d.packs || d.creditPacks || []) } catch (e) { console.error(e) } }
    const handleSavePack = async (e) => { e.preventDefault(); try { if (editingPack) { await API.updateCreditPack(editingPack._id, packForm); showToast('Pack updated') } else { await API.createCreditPack(packForm); showToast('Pack created') } setShowPackForm(false); setEditingPack(null); loadCreditPacks() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeletePack = async (id, name) => { if (!confirm(`Delete pack "${name}"?`)) return; try { await API.deleteCreditPack(id); showToast('Deleted'); loadCreditPacks() } catch { showToast('Failed', 'error') } }
    const handleTogglePack = async (id) => { try { await API.toggleCreditPack(id); loadCreditPacks() } catch { showToast('Failed', 'error') } }
    const handleSeedPacks = async () => { if (!confirm('Seed default credit packs? This will add standard packs.')) return; try { const d = await API.seedCreditPacks(creditPacksList.length > 0); showToast(d.message || 'Packs seeded'); loadCreditPacks() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleEditPack = (p) => { setEditingPack(p); setPackForm({ name: p.name, slug: p.slug, credits: p.credits, bonusCredits: p.bonusCredits || 0, price: p.price, validityDays: p.validityDays || 180, icon: p.icon || 'bolt', badge: p.badge || '', description: p.description || '', isPromo: p.isPromo || false, promoDiscount: p.promoDiscount || 0, promoOriginalPrice: p.promoOriginalPrice || 0, promoLabel: p.promoLabel || '', displayOrder: p.displayOrder || 0, isActive: p.isActive !== false, isFirstPurchaseEligible: p.isFirstPurchaseEligible !== false }); setShowPackForm(true) }
    // API Key Management functions
    const loadApiKeys = async () => { try { const d = await API.getApiKeys(); setApiProviders(d.providers || []) } catch (e) { console.error(e) } }
    const handleSaveApiKey = async (provider) => { try { await API.updateApiKeys(provider, editProviderKeys); showToast('API key updated'); setEditingProvider(null); setEditProviderKeys({}); loadApiKeys() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleDeleteApiKey = async (provider) => { if (!confirm(`Remove stored key for ${provider}? Env vars will still apply.`)) return; try { await API.deleteApiKeys(provider); showToast('Key removed'); loadApiKeys() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const handleTestApiKey = async (provider) => { setTestingProvider(provider); try { const d = await API.testApiKey(provider); setTestResults(r => ({ ...r, [provider]: d })) } catch (e) { setTestResults(r => ({ ...r, [provider]: { success: false, status: 'error', message: e.message } })) } finally { setTestingProvider(null) } }
    // Video Provider functions
    const loadVideoProviders = async () => { try { const d = await API.getVideoProviders(); setVideoProviders(d.models || []); setVideoCategories(d.categories || {}) } catch (e) { console.error('Failed to load video providers:', e) } }
    const handleSwitchVideoProvider = async (modelId, provider) => { setSwitchingProvider(`${modelId}-${provider}`); try { const d = await API.updateVideoProvider({ modelId, provider }); showToast(d.message || 'Provider switched'); loadVideoProviders() } catch (e) { showToast(e.error || e.message || 'Failed to switch provider', 'error') } finally { setSwitchingProvider(null) } }
    const handleAddVideoProvider = async () => { if (!addProviderForm?.modelId || !addProviderForm?.providerId || !addProviderForm?.providerName) return showToast('Fill all required fields', 'error'); try { const d = await API.addVideoProvider(addProviderForm); showToast(d.message || 'Provider added'); setAddProviderForm(null); loadVideoProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleRemoveVideoProvider = async (modelId, providerId) => { if (!confirm(`Remove provider "${providerId}" from this model?`)) return; try { const d = await API.removeVideoProvider({ modelId, providerId }); showToast(d.message || 'Provider removed'); loadVideoProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleEditVideoProvider = async () => { if (!editProviderData) return; try { const { modelId, providerId, ...updates } = editProviderData; const d = await API.modifyVideoProvider({ modelId, providerId, updates }); showToast(d.message || 'Provider updated'); setEditProviderData(null); loadVideoProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }

    // Image Provider Management
    const loadImageProviders = async () => { try { const d = await API.getImageProviders(); setImageProviders(d.models || []); setImageCategories(d.categories || {}) } catch (e) { console.error('Failed to load image providers:', e) } }
    const handleSwitchImageProvider = async (modelId, provider) => { setSwitchingImageProvider(`${modelId}-${provider}`); try { const d = await API.updateImageProvider({ modelId, provider }); showToast(d.message || 'Provider switched'); loadImageProviders() } catch (e) { showToast(e.error || e.message || 'Failed to switch provider', 'error') } finally { setSwitchingImageProvider(null) } }
    const handleAddImageProvider = async () => { if (!addImageProviderForm?.modelId || !addImageProviderForm?.providerId || !addImageProviderForm?.providerName) return showToast('Fill all required fields', 'error'); try { const d = await API.addImageProvider(addImageProviderForm); showToast(d.message || 'Provider added'); setAddImageProviderForm(null); loadImageProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleRemoveImageProvider = async (modelId, providerId) => { if (!confirm(`Remove provider "${providerId}" from this model?`)) return; try { const d = await API.removeImageProvider({ modelId, providerId }); showToast(d.message || 'Provider removed'); loadImageProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleEditImageProvider = async () => { if (!editImageProviderData) return; try { const { modelId, providerId, ...updates } = editImageProviderData; const d = await API.modifyImageProvider({ modelId, providerId, updates }); showToast(d.message || 'Provider updated'); setEditImageProviderData(null); loadImageProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    
    // LLM Provider Management
    const loadLlmProviders = async () => { try { const d = await API.getLlmProviders(); setLlmProviders(d.models || []); setLlmCategories(d.categories || {}) } catch (e) { console.error('Failed to load LLM providers:', e) } }
    const handleSwitchLlmProvider = async (modelId, provider) => { setSwitchingLlmProvider(`${modelId}-${provider}`); try { const d = await API.updateLlmProvider({ modelId, provider }); showToast(d.message || 'Provider switched'); loadLlmProviders() } catch (e) { showToast(e.error || e.message || 'Failed to switch provider', 'error') } finally { setSwitchingLlmProvider(null) } }
    const handleAddLlmProvider = async () => { if (!addLlmProviderForm?.modelId || !addLlmProviderForm?.providerId || !addLlmProviderForm?.providerName) return showToast('Fill all required fields', 'error'); try { const d = await API.addLlmProvider(addLlmProviderForm); showToast(d.message || 'Provider added'); setAddLlmProviderForm(null); loadLlmProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleRemoveLlmProvider = async (modelId, providerId) => { if (!confirm(`Remove provider "${providerId}" from this model?`)) return; try { const d = await API.removeLlmProvider({ modelId, providerId }); showToast(d.message || 'Provider removed'); loadLlmProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }
    const handleEditLlmProvider = async () => { if (!editLlmProviderData) return; try { const { modelId, providerId, ...updates } = editLlmProviderData; const d = await API.modifyLlmProvider({ modelId, providerId, updates }); showToast(d.message || 'Provider updated'); setEditLlmProviderData(null); loadLlmProviders() } catch (e) { showToast(e.error || e.message || 'Failed', 'error') } }

    // Watermark functions
    const handleWatermarkLogoUpload = async (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (ev) => { const dataUrl = ev.target.result; setWatermarkLogoPreview(dataUrl); try { const d = await API.uploadWatermarkLogo(dataUrl); showToast('Watermark logo uploaded'); loadSettings() } catch (err) { showToast(err.error || 'Upload failed', 'error') } }; reader.readAsDataURL(file) }
    const handleWatermarkSettingsUpdate = async (updates) => { try { await API.updateWatermarkSettings(updates); showToast('Watermark settings updated'); loadSettings() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    // Provider Usage functions
    const loadProviderUsage = async (days) => { setProviderUsageLoading(true); try { const d = await API.getProviderUsage(days || providerUsageDays); setProviderUsageData(d) } catch (e) { console.error(e) } finally { setProviderUsageLoading(false) } }
    const loadTokenUsage = async () => { try { const d = await API.getTokenUsage(tokenDays); setTokenData(d); if (d.providerWallets) { const b = {}; d.providerWallets.forEach(w => b[w.provider] = w.budget); setBudgetForm(b) } } catch (e) { console.error(e) } }
    const handleSaveBudgets = async (e) => { e.preventDefault(); try { await API.updateProviderBudgets(budgetForm); showToast('Provider budgets updated'); setShowBudgetModal(false); loadTokenUsage() } catch (e) { showToast(e.error || 'Failed', 'error') } }
    const addFeature = () => { if (!newFeature.trim()) return; setPkgForm(f => ({ ...f, features: [...f.features, { name: newFeature.trim(), included: true }] })); setNewFeature('') }
    const removeFeature = (i) => setPkgForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }))
    const studioNames = { contentStudio: 'Content Studio', creativeStudio: 'Creative Studio', seoStudio: 'SEO Studio', brainstormStudio: 'Brainstorm Studio' }

    // Actions
    const handleImpersonate = async (id, name) => {
        if (!confirm(`View platform as ${name}?`)) return;
        try {
            // Save current superadmin token so we can return later
            const currentToken = localStorage.getItem('mantram_token');
            if (currentToken) sessionStorage.setItem('mantram_superadmin_token', currentToken);
            const d = await API.impersonateUser(id);
            // Use hard reload to clear ALL cached React state (brands, credits, etc.)
            localStorage.setItem('mantram_token', d.token);
            // Store impersonation flag so the app knows to show the banner
            sessionStorage.setItem('mantram_impersonated_user', JSON.stringify({ name: d.user.name, email: d.user.email }));
            window.location.href = '/dashboard';
        } catch { showToast('Impersonation failed', 'error') }
    }
    const handleExitImpersonation = () => {
        const superadminToken = sessionStorage.getItem('mantram_superadmin_token');
        if (superadminToken) {
            sessionStorage.removeItem('mantram_superadmin_token');
            localStorage.setItem('mantram_token', superadminToken);
            window.location.href = '/superadmin';
        } else {
            logout();
            navigate('/login');
        }
    }
    const handleAddCredits = async () => { if (!creditModal || !creditAmount) return; try { await API.addCredits(creditModal._id, { amount: parseInt(creditAmount), reason: 'Super admin' }); showToast(`+${creditAmount} credits`); setCreditModal(null); setCreditAmount(''); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleResetCredits = async (id) => { if (!confirm('Reset used credits to 0?')) return; try { await API.resetCredits(id); showToast('Reset done'); loadUsers() } catch { showToast('Failed', 'error') } }
    const handleChangePlan = async (id, plan) => { try { await API.updateUser(id, { plan }); showToast(`Plan → ${plan}`); setPlanModal(null); loadUsers(); loadStats() } catch { showToast('Failed', 'error') } }
    const handleDeleteUser = async (id, name) => { 
        if (!confirm(`DELETE ${name} and ALL data?`)) return; 
        
        // Save the current state in case we need to roll back on error
        const previousUsers = [...users];
        const previousTotal = totalUsers;
        const previousStats = stats;
        const previousSegmentCounts = { ...segmentCounts };

        // 1. Immediately remove the user from local state to refresh table instantly
        setUsers(prev => prev.filter(u => u._id !== id));
        setTotalUsers(prev => Math.max(0, prev - 1));
        if (stats) {
            setStats(prev => ({
                ...prev,
                totalUsers: Math.max(0, (prev.totalUsers || 1) - 1)
            }));
        }
        if (segmentCounts) {
            setSegmentCounts(prev => {
                const next = { ...prev };
                // Decrease the count for 'all' and the specific segments if present
                if (next.all != null) next.all = Math.max(0, next.all - 1);
                // Also decrement the count for the segment the user was in
                const userObj = users.find(u => u._id === id);
                const seg = userObj?.segment || 'active';
                if (next[seg] != null) next[seg] = Math.max(0, next[seg] - 1);
                return next;
            });
        }

        try { 
            // 2. Perform server-side deletion
            await API.deleteUser(id); 
            showToast('User deleted'); 
            
            // 3. Silently fetch fresh data to sync in the background
            loadUsers(true); 
            loadStats();
            loadSegmentCounts();
        } catch (e) { 
            showToast(e.message || 'Deletion failed', 'error');
            // Roll back to previous state on failure
            setUsers(previousUsers);
            setTotalUsers(previousTotal);
            setStats(previousStats);
            setSegmentCounts(previousSegmentCounts);
        } 
    }

    const handleApproveUser = async (id) => { 
        try { 
            await API.approveUser(id); 
            showToast('User approved and notified'); 
            if (tab === 'approvals') loadPendingUsers();
            else loadUsers();
            loadStats();
        } catch (e) { showToast(e.message || 'Approval failed', 'error') } 
    }

    const handleRejectUser = async (id) => { 
        if (!confirm('Reject this user registration?')) return;
        try { 
            await API.rejectUser(id); 
            showToast('User rejected'); 
            if (tab === 'approvals') loadPendingUsers();
            else loadUsers();
        } catch (e) { showToast(e.message || 'Rejection failed', 'error') } 
    }

    const handleSyncCredits = async () => {
        if (!confirm('This will synchronize all user credit data based on usage logs and plans. Proceed?')) return;
        setSyncingCredits(true);
        try {
            const d = await API.syncCredits();
            showToast(`${d.stats.success} users synced, ${d.stats.failed} failed`);
            loadUsers();
            loadStats();
        } catch (e) {
            showToast(e.message || 'Sync failed', 'error');
        } finally {
            setSyncingCredits(false);
        }
    }

    const handleDeleteBrand = async (brand, name) => { 
        const brandId = brand?._id || brand?.id || brand;
        if (!brandId || brandId === 'undefined') {
            console.error('Attempted to delete brand with undefined ID', { brand, name });
            showToast(`Invalid Brand ID (${brandId})`, 'error');
            return;
        }
        const brandName = name || brand?.name || 'this brand';
        if (!confirm(`Delete brand "${brandName}" and all data?`)) return; 
        try { 
            await API.deleteBrand(brandId); 
            showToast('Brand deleted'); 
            loadBrands(); 
            loadStats();
        } catch (e) { 
            showToast(e.message || 'Failed to delete brand', 'error');
        } 
    }

    const handleDeleteContent = async (item) => { 
        const contentId = item?._id || item?.id || item;
        if (!contentId || contentId === 'undefined') {
            showToast(`Invalid Content ID (${contentId})`, 'error');
            return;
        }
        if (!confirm('Delete this content?')) return; 
        try { 
            await API.deleteContent(contentId); 
            showToast('Deleted'); 
            loadContent();
        } catch (e) { 
            showToast(e.message || 'Failed to delete content', 'error');
        } 
    }
    const handleCreateCoupon = async (e) => { 
        e.preventDefault(); 
        try { 
            await API.createCoupon({ 
                ...couponForm, 
                discountValue: Number(couponForm.discountValue), 
                maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : 0, 
                minPurchase: Number(couponForm.minPurchase) || 0,
                maxUsesPerUser: Number(couponForm.maxUsesPerUser) || 1,
                validUntil: couponForm.validUntil || null 
            }); 
            showToast('Coupon created'); 
            setShowCouponForm(false); 
            setCouponForm({ code: '', discountType: 'credits', discountValue: '', maxUses: '', validUntil: '', description: '', applicablePlans: [], minPurchase: 0, maxUsesPerUser: 1 }); 
            loadCoupons() 
        } catch (e) { showToast(e.error || 'Failed', 'error') } 
    }
    const handleToggleCoupon = async (id, isActive) => { try { await API.updateCoupon(id, { isActive: !isActive }); loadCoupons() } catch { showToast('Failed', 'error') } }
    const handleDeleteCoupon = async (id) => { if (!confirm('Delete coupon?')) return; try { await API.deleteCoupon(id); showToast('Deleted'); loadCoupons() } catch { showToast('Failed', 'error') } }

    // Retention Offers
    const handleSaveRetentionOffer = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...retentionForm,
                discountValue: Number(retentionForm.discountValue) || 0,
                bonusCredits: Number(retentionForm.bonusCredits) || 0,
                validForDays: Number(retentionForm.validForDays) || 30,
                maxUses: Number(retentionForm.maxUses) || 0
            };
            if (editingRetention) {
                await API.updateRetentionOffer(editingRetention._id, payload);
                showToast('Retention offer updated');
            } else {
                await API.createRetentionOffer(payload);
                showToast('Retention offer created');
            }
            setShowRetentionForm(false);
            setEditingRetention(null);
            setRetentionForm({ name: '', description: '', triggerCondition: 'churn_risk', discountType: 'percentage', discountValue: 0, bonusCredits: 0, validForDays: 30, maxUses: 0, isActive: true });
            loadRetentionOffers();
        } catch (e) {
            showToast(e.error || e.message || 'Failed', 'error');
        }
    }
    const handleDeleteRetentionOffer = async (id) => { if (!confirm('Delete retention offer?')) return; try { await API.deleteRetentionOffer(id); showToast('Deleted'); loadRetentionOffers() } catch { showToast('Failed', 'error') } }
    const handleToggleRetentionOffer = async (id, isActive) => { try { await API.updateRetentionOffer(id, { isActive: !isActive }); loadRetentionOffers() } catch { showToast('Failed', 'error') } }

    const handleToggleSetting = async (key, val) => { try { await API.updateSystemSettings({ [key]: val }); showToast('Updated'); loadSettings() } catch { showToast('Failed', 'error') } }

    const platformIcons = { instagram: 'photo_camera', facebook: 'thumb_up', linkedin: 'work', twitter: 'tag', shopify: 'storefront', 'google-analytics': 'bar_chart', 'meta-ads': 'smartphone', 'google-ads': 'search', meta: 'smartphone', google: 'search' }

    // Impersonation search handler
    useEffect(() => {
        if (!impersonateSearch || impersonateSearch.length < 2) { setImpersonateResults([]); return }
        const timer = setTimeout(async () => {
            setImpersonateLoading(true)
            try {
                const d = await API.getUsers({ search: impersonateSearch, limit: 5 })
                setImpersonateResults(d.users || [])
            } catch { setImpersonateResults([]) }
            finally { setImpersonateLoading(false) }
        }, 300)
        return () => clearTimeout(timer)
    }, [impersonateSearch])

    const Card = ({ icon, color, value, label }) => (
        <div className="glass-panel rounded-2xl p-5">
            <span className={`material-symbols-outlined text-2xl mb-3 block ${color}`}>{icon}</span>
            <p className="text-3xl font-extrabold text-[var(--sys-text)]">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            <p className="text-sm text-[var(--sys-text-muted)] mt-1">{label}</p>
        </div>
    )

    return (
        <DashboardLayout>
            <SEOHead title="Super Admin — Mantram AI" noIndex={true} />
            <div>
                {toast && <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-xl ${toast.type === 'error' ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]'}`}>{toast.msg}</div>}

                {/* Per-User Studio Access Modal */}
                {userStudioModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--sys-surface)] " onClick={() => setUserStudioModal(null)}>
                        <div className="w-full max-w-lg bg-[#0e1025] border border-[var(--sys-border)] rounded-2xl shadow-2xl p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2"><span className="material-symbols-outlined text-[#FF4D00]">shield_person</span>Studio Access</h3>
                                    <p className="text-sm text-[var(--sys-text-muted)] mt-1">{userStudioModal.userName} ({userStudioModal.userEmail}) — {userStudioModal.userPlan} plan</p>
                                </div>
                                <button onClick={() => setUserStudioModal(null)} className="p-2 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer"><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <div className="space-y-2">
                                {(userStudioModal.studioKeys || studioKeys).map(key => {
                                    const portalStatus = userStudioModal.portalVisibility?.[key] || 'public';
                                    const hasOverride = userStudioModal.userOverrides?.[key] !== undefined && userStudioModal.userOverrides?.[key] !== null;
                                    const overrideVal = userStudioModal.userOverrides?.[key];
                                    const resolved = userStudioModal.resolvedAccess?.[key];
                                    const label = (userStudioModal.studioLabels || studioLabels)[key] || key;
                                    const isHidden = portalStatus === 'hidden';

                                    let statusBadge, statusColor, statusIcon;
                                    if (isHidden) { statusBadge = 'Hidden (global)'; statusColor = 'text-primary'; statusIcon = 'lock'; }
                                    else if (hasOverride && overrideVal === true) { statusBadge = 'Granted'; statusColor = 'text-primary'; statusIcon = 'check_circle'; }
                                    else if (hasOverride && overrideVal === false) { statusBadge = 'Revoked'; statusColor = 'text-primary'; statusIcon = 'cancel'; }
                                    else if (portalStatus === 'private') { statusBadge = 'Private (no access)'; statusColor = 'text-primary'; statusIcon = 'lock_person'; }
                                    else { statusBadge = 'Plan (public)'; statusColor = 'text-primary'; statusIcon = 'public'; }

                                    return (
                                        <div key={key} className={`flex items-center justify-between px-4 py-3 rounded-xl ${resolved ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-primary-dim)]'} border border-[var(--sys-border)]`}>
                                            <div>
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{label}</p>
                                                <p className={`text-xs flex items-center gap-1 ${statusColor}`}>
                                                    <span className="material-symbols-outlined text-[11px]">{statusIcon}</span>
                                                    {statusBadge}
                                                </p>
                                            </div>
                                            <div className="flex gap-1">
                                                {!resolved ? (
                                                    <button onClick={() => handleUserStudioOverride(key, true)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 border border-[var(--sys-border)]"
                                                    >Grant</button>
                                                ) : (
                                                    <button onClick={() => handleUserStudioOverride(key, false)}
                                                        className="px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 border border-[var(--sys-border)]"
                                                    >Revoke</button>
                                                )}
                                                {hasOverride && (
                                                    <button onClick={() => handleUserStudioOverride(key, null)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer text-[var(--sys-text-muted)] hover:text-primary transition-all"
                                                        title="Reset to default"
                                                    ><span className="material-symbols-outlined text-[14px]">device_reset</span></button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}


                {/* ═══════ SIDEBAR + MAIN LAYOUT ═══════ */}
                <div className="flex gap-6">
                    {/* Sidebar Navigation */}
                    <div className={`${sidebarCollapsed ? 'w-14' : 'w-56'} flex-shrink-0 transition-all duration-300`}>
                        <div className="sticky top-4">
                            <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="w-full flex items-center justify-center mb-3 p-1.5 rounded-lg bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer transition-all">
                                <span className="material-symbols-outlined text-sm">{sidebarCollapsed ? 'chevron_right' : 'chevron_left'}</span>
                            </button>
                            {navGroups.map(group => (
                                <div key={group.label} className="mb-4">
                                    {!sidebarCollapsed && (
                                        <p className="text-[9px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] px-3 mb-1.5">
                                            {group.label}
                                        </p>
                                    )}
                                    {group.items.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setTab(item.id)}
                                            title={sidebarCollapsed ? item.label : ''}
                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all mb-0.5 cursor-pointer ${
                                                tab === item.id
                                                    ? 'bg-[var(--sys-surface)] text-black shadow-none'
                                                    : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)]'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-sm">{item.icon}</span>
                                            {!sidebarCollapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                                            {item.badge > 0 && (
                                                <span className="min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-[var(--sys-surface)] text-[var(--sys-text)] text-[9px] font-black px-1">
                                                    {item.badge > 99 ? '99+' : item.badge}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">

                    {/* ─── TOP BAR: Header + View as User ─── */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h1 className="text-2xl font-extrabold text-[var(--sys-text)] tracking-tight flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-2xl">shield_person</span>
                                    Super Admin
                                </h1>
                                <p className="text-[var(--sys-text-muted)] text-xs mt-0.5">Platform management & operations</p>
                            </div>
                        </div>

                        {/* ─── VIEW AS USER — Command Bar ─── */}
                        <div className="relative">
                            <div className="flex items-center gap-3 bg-[var(--sys-surface)] rounded-xl border border-[var(--sys-border)] px-4 py-2.5 focus-within:border-[var(--sys-border)] transition-all">
                                <span className="material-symbols-outlined text-primary text-lg">person_search</span>
                                <input
                                    type="text"
                                    placeholder="Search user by name or email → View as User..."
                                    value={impersonateSearch}
                                    onChange={e => setImpersonateSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none"
                                />
                                {impersonateLoading && <span className="material-symbols-outlined text-sm animate-spin text-[var(--sys-text-muted)]">progress_activity</span>}
                                <span className="text-[9px] text-[var(--sys-text-muted)] bg-[var(--sys-surface)] px-2 py-1 rounded font-mono">⌘K</span>
                            </div>
                            {/* Results Dropdown */}
                            {impersonateResults.length > 0 && impersonateSearch.length >= 2 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[#08080C]/95 border border-[var(--sys-border)] rounded-xl shadow-none overflow-hidden z-40 ">
                                    {impersonateResults.map(u => (
                                        <div key={u._id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--sys-surface)] transition-all cursor-pointer group" onClick={() => { handleImpersonate(u._id, u.name); setImpersonateSearch(''); setImpersonateResults([]) }}>
                                            <div className="w-8 h-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-black">
                                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-[var(--sys-text)] truncate">{u.name}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)] truncate">{u.email}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary font-bold">{u.plan || 'free'}</span>
                                                <span className="text-[10px] text-[var(--sys-text-muted)]">{u.credits?.balance || 0} cr</span>
                                                <span className="material-symbols-outlined text-base text-primary opacity-0 group-hover:opacity-100 transition-all">login</span>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="px-4 py-2 border-t border-[var(--sys-border)] text-[9px] text-[var(--sys-text-muted)]">
                                        Click user to impersonate • See exactly what they see
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Impersonation Warning Banner */}
                    {user?.isImpersonated && (
                        <div className="mb-6 p-4 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] shadow-none flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-[var(--sys-text)] text-2xl">error</span>
                                <div>
                                    <p className="text-[var(--sys-text)] font-black text-sm uppercase tracking-wider">Active Impersonation Session</p>
                                    <p className="text-[var(--sys-text)]/80 text-xs">You are currently viewing the platform as <strong>{user.name}</strong>. All actions are logged.</p>
                                </div>
                            </div>
                            <button onClick={handleExitImpersonation} className="px-4 py-2 bg-white text-primary rounded-xl text-xs font-black uppercase hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                                Back to SuperAdmin
                            </button>
                        </div>
                    )}

                {/* ════════════ OVERVIEW ════════════ */}
                {tab === 'overview' && (
                    <div>
                        {loading ? <div className="flex items-center justify-center py-20 text-[var(--sys-text-muted)]"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...</div> : stats && (
                            <>
                                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                                    <Card icon="group" color="text-[#FF4D00]" value={stats.totalUsers} label="Users" />
                                    <Card icon="branding_watermark" color="text-[#FF4D00]" value={stats.totalBrands} label="Brands" />
                                    <Card icon="article" color="text-primary" value={stats.totalContent} label="Content" />
                                    <Card icon="image" color="text-[#FF7A00]" value={stats.totalCreatives} label="Creatives" />
                                    <Card icon="inventory_2" color="text-primary" value={stats.totalProducts} label="Products" />
                                </div>

                                {/* API Wallet / Provider Health Summary (Promoted to Overview) */}
                                {tokenData?.providerWallets && (
                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm font-black text-[var(--sys-text)] flex items-center gap-2 uppercase tracking-tighter">
                                                <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
                                                API Provider Wallet (Real-time)
                                            </h4>
                                            <button onClick={() => setTab('tokenUsage')} className="text-[10px] font-bold text-primary hover:text-primary transition-all flex items-center gap-1 cursor-pointer">
                                                Full Analytics <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
                                            {tokenData.providerWallets.map(w => {
                                                if (w.budget === 0 && w.consumed === 0) return null;
                                                const remaining = Math.max(0, w.budget - w.consumed);
                                                const isLow = w.budget > 0 && (remaining / w.budget) < 0.15;
                                                const colors = { anthropic: 'text-[var(--sys-primary)]', openai: 'text-primary', gemini: 'text-[#FF4D00]', xai: 'text-[var(--sys-text)]', grok: 'text-[var(--sys-text)]', sarvam: 'text-primary' };
                                                const bgHighlights = { anthropic: 'border-[var(--sys-border)]', openai: 'border-[var(--sys-border)]', gemini: 'border-[#FF4D00]/10', xai: 'border-[var(--sys-border)]', grok: 'border-[var(--sys-border)]', sarvam: 'border-[var(--sys-border)]' };
                                                
                                                return (
                                                    <div key={w.provider} className={`glass-panel border-[var(--sys-border)] rounded-xl p-3 flex flex-col justify-between transition-all ${isLow ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)]' : 'bg-[var(--sys-surface)]'}`}>
                                                        <div className="flex items-center justify-between gap-2 mb-2">
                                                            <p className={`text-[10px] font-black uppercase tracking-widest truncate ${colors[w.provider] || 'text-[var(--sys-text-muted)]'}`}>{w.provider === 'xai' ? 'Grok (xAI)' : w.provider}</p>
                                                            {isLow && <span className="material-symbols-outlined text-primary text-xs animate-pulse">warning</span>}
                                                        </div>
                                                        <div>
                                                            <p className="text-lg font-black text-[var(--sys-text)] tracking-tighter">${remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                                                            <p className="text-[9px] text-[var(--sys-text-muted)] font-bold uppercase tracking-tighter">Remaining</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-primary">payments</span><span className="text-sm font-bold text-[var(--sys-text)]">Revenue</span></div>
                                        <p className="text-2xl font-extrabold text-primary">₹{(stats.totalRevenue || 0).toLocaleString()}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">{stats.totalSubscriptions} active subs</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-primary">token</span><span className="text-sm font-bold text-[var(--sys-text)]">Credits Used</span></div>
                                        <p className="text-2xl font-extrabold text-primary">{(stats.totalCreditsUsed || 0).toLocaleString()}</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-primary">hub</span><span className="text-sm font-bold text-[var(--sys-text)]">Integrations</span></div>
                                        <p className="text-2xl font-extrabold text-primary">{stats.totalIntegrations}</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-primary">rate_review</span><span className="text-sm font-bold text-[var(--sys-text)]">AI Feedback</span></div>
                                        <p className="text-2xl font-extrabold text-primary">{stats.totalFeedback}</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5 border border-[#FF4D00]/10">
                                        <div className="flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-[#FF4D00]">trending_up</span><span className="text-sm font-bold text-[var(--sys-text)]">Retention Rate</span></div>
                                        <p className="text-2xl font-extrabold text-[#FF4D00]">{stats.usageAnalytics?.retentionRate || '0%'}</p>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-1">{stats.usageAnalytics?.churnedUsersCount || 0} churned (20d+)</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="font-bold text-[var(--sys-text)] text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-lg">pie_chart</span>Plan Distribution</h3>
                                        <div className="flex gap-3">{(stats.planDistribution || []).map(p => (
                                            <div key={p._id || 'none'} className="flex-1 glass-panel rounded-xl p-3 text-center">
                                                <p className="text-xl font-extrabold text-[var(--sys-text)]">{p.count}</p>
                                                <p className="text-xs font-bold mt-1 capitalize text-[var(--sys-text-muted)]">{p._id || 'None'}</p>
                                            </div>
                                        ))}</div>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h3 className="font-bold text-[var(--sys-text)] text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-lg">bar_chart</span>Content by Type</h3>
                                        <div className="space-y-2">{(stats.contentByType || []).map(c => (
                                            <div key={c._id} className="flex items-center justify-between">
                                                <span className="text-sm text-[var(--sys-text-muted)] capitalize">{c._id}</span>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-1.5 rounded-full bg-[var(--sys-surface)]"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (c.count / Math.max(1, stats.totalContent)) * 100)}%` }} /></div>
                                                    <span className="text-sm font-bold text-[var(--sys-text)] w-6 text-right">{c.count}</span>
                                                </div>
                                            </div>
                                        ))}</div>
                                    </div>
                                </div>
                                <div className="glass-panel rounded-2xl p-5">
                                    <h3 className="font-bold text-[var(--sys-text)] text-sm mb-3 flex items-center gap-2"><span className="material-symbols-outlined text-[#FF4D00] text-lg">group</span>Recent Users</h3>
                                    <div className="space-y-1">{(stats.recentUsers || []).map(u => (
                                        <div key={u._id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--sys-surface)] transition-all">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">{u.name?.[0]?.toUpperCase()}</div>
                                                <div><p className="text-sm font-bold text-[var(--sys-text)]">{u.name}</p><p className="text-xs text-[var(--sys-text-muted)]">{u.email}</p></div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold text-[var(--sys-text)] mb-1">{u.credits?.used || 0} / {u.credits?.total + (u.credits?.bonus || 0)} used</p>
                                                    <div className="w-24 h-1 rounded-full bg-[var(--sys-surface)]">
                                                        <div
                                                            className={`h-full rounded-full ${((u.credits?.used || 0) / (u.credits?.total + (u.credits?.bonus || 0))) > 0.9 ? 'bg-[var(--sys-surface)]' : 'bg-primary'}`}
                                                            style={{ width: `${Math.min(100, ((u.credits?.used || 0) / (u.credits?.total + (u.credits?.bonus || 0))) * 100)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                    (u.approvalStatus === 'approved') ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                    (u.approvalStatus === 'rejected') ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                    'bg-[var(--sys-primary-dim)] text-primary'
                                                }`}>
                                                    {u.approvalStatus || 'pending'}
                                                </span>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                    u.plan === 'enterprise' ? 'bg-[var(--sys-primary-dim)] text-primary' : 
                                                    u.plan === 'elite' ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 
                                                    u.plan === 'generative' ? 'bg-[#10b981]/15 text-[#10b981]' : 
                                                    u.plan === 'max' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : 
                                                    u.plan === 'plus' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 
                                                    u.plan === 'professional' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : 
                                                    u.plan === 'creator' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 
                                                    u.plan === 'test' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                    'bg-[var(--sys-border)]/15 text-[var(--sys-text-muted)]'
                                                }`}>Plan: {u.plan}</span>
                                                <span className="text-xs text-[var(--sys-text-muted)]">{new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    ))}</div>
                                </div>

                                {/* AI Usage Insights */}
                                {stats.usageAnalytics && (
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
                                        <div className="lg:col-span-1 glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                            <h3 className="font-bold text-[var(--sys-text)] text-sm mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-lg">error</span>
                                                Quota Alerts
                                            </h3>
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-primary">block</span>
                                                        <span className="text-sm font-bold text-[var(--sys-text)]">Full Exhaustion</span>
                                                    </div>
                                                    <span className="text-lg font-black text-primary">{stats.usageAnalytics.exhaustedCount}</span>
                                                </div>
                                                <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-primary">warning</span>
                                                        <span className="text-sm font-bold text-[var(--sys-text)]">Near Exhaustion (&gt;90%)</span>
                                                    </div>
                                                    <span className="text-lg font-black text-primary">{stats.usageAnalytics.nearEmptyCount}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-primary/10">
                                            <h3 className="font-bold text-[var(--sys-text)] text-sm mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-lg">leaderboard</span>
                                                Top AI Consumers (Leaderboard)
                                            </h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left min-w-[500px]">
                                                    <thead>
                                                        <tr className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider border-b border-[var(--sys-border)]">
                                                            <th className="pb-2">User</th>
                                                            <th className="pb-2">Plan</th>
                                                            <th className="pb-2 text-right">Credits Used</th>
                                                            <th className="pb-2 text-right">Remaining</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/[0.04]">
                                                        {(stats.usageAnalytics.topUsers || []).map(u => (
                                                            <tr key={u._id} className="text-sm group hover:bg-[var(--sys-surface)] transition-all">
                                                                <td className="py-2.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">{u.name?.[0]}</div>
                                                                        <div><p className="font-bold text-[var(--sys-text)] text-xs">{u.name}</p><p className="text-[10px] text-[var(--sys-text-muted)]">{u.email}</p></div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[var(--sys-surface)] text-[var(--sys-text-muted)] capitalize">{u.plan}</span></td>
                                                                <td className="py-2.5 text-right font-bold text-[var(--sys-text)]">{u.credits?.used?.toLocaleString()}</td>
                                                                <td className="py-2.5 text-right font-bold text-primary">
                                                                    {u.creditBalance?.unlimited ? '∞' : u.creditBalance?.remaining?.toLocaleString()}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ APPROVALS ════════════ */}
                {tab === 'approvals' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">how_to_reg</span>
                                    Pending Approvals ({pendingUsers.length})
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Review and approve new user registrations to grant platform access</p>
                            </div>
                            <button onClick={loadPendingUsers} className="p-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer"><span className="material-symbols-outlined text-sm">refresh</span></button>
                        </div>

                        {pendingUsers.length > 0 ? (
                            <div className="space-y-3">
                                {pendingUsers.map(u => (
                                    <div key={u._id} className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className="w-12 h-12 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center text-primary font-bold text-lg">{u.name?.[0]?.toUpperCase()}</div>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <p className="text-base font-bold text-[var(--sys-text)]">{u.name}</p>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-bold tracking-wider uppercase">Position #{u.queueNumber}</span>
                                                    </div>
                                                     <p className="text-sm text-[var(--sys-text-muted)]">
                                                        {u.email} • {u.company || 'Individual'} 
                                                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                            u.plan === 'enterprise' ? 'bg-[var(--sys-primary-dim)] text-primary' : 
                                                            u.plan === 'elite' ? 'bg-[#7c3aed]/15 text-[#7c3aed]' : 
                                                            u.plan === 'generative' ? 'bg-[#10b981]/15 text-[#10b981]' : 
                                                            u.plan === 'max' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : 
                                                            u.plan === 'plus' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 
                                                            u.plan === 'professional' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : 
                                                            u.plan === 'creator' ? 'bg-[#6366f1]/15 text-[#6366f1]' : 
                                                            u.plan === 'test' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                            'bg-[var(--sys-border)]/15 text-[var(--sys-text-muted)]'
                                                        }`}>Plan: {u.plan}</span>
                                                     </p>
                                                    <p className="text-[10px] text-[var(--sys-text-muted)] mt-1 uppercase tracking-widest">Registered {new Date(u.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => handleRejectUser(u._id)} className="px-4 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] transition-all flex items-center gap-1.5 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">close</span>Reject
                                                </button>
                                                <button onClick={() => handleApproveUser(u._id)} className="px-6 py-2 rounded-xl bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold hover:bg-[var(--sys-surface)] transition-all shadow-none flex items-center gap-1.5 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm font-bold">check</span>Approve User
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-20 glass-panel rounded-2xl border border-dashed border-[var(--sys-border)]">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">verified_user</span>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] mb-1">Queue is Empty</h3>
                                <p className="text-sm text-[var(--sys-text-muted)]">All users have been processed. Great job!</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ WAITLIST ════════════ */}
                {tab === 'waitlist' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">list_alt</span>
                                    Waitlist Submissions ({waitlist.length})
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Direct early access requests from the landing page waitlist</p>
                            </div>
                            <button onClick={loadWaitlist} className="p-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer"><span className="material-symbols-outlined text-sm">refresh</span></button>
                        </div>

                        {waitlist.length > 0 ? (
                            <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)] shadow-2xl">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left min-w-[800px]">
                                        <thead>
                                            <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-[0.1em] border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                <th className="px-6 py-4">Name & Email</th>
                                                <th className="px-6 py-4">Company</th>
                                                <th className="px-6 py-4">Message / Note</th>
                                                <th className="px-6 py-4">Submitted At</th>
                                                <th className="px-6 py-4 text-center">Status</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/[0.04]">
                                            {waitlist.map(entry => (
                                                <tr key={entry._id} className="text-sm group hover:bg-[var(--sys-surface)] transition-all">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-[#FF4D00]/10 flex items-center justify-center text-[#FF4D00] font-black shadow-lg">
                                                                {entry.name?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-[var(--sys-text)] truncate">{entry.name}</p>
                                                                <p className="text-[10px] text-[var(--sys-text-muted)] truncate">{entry.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[var(--sys-text-muted)]">{entry.company || '—'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <p className="text-[var(--sys-text-muted)] truncate" title={entry.message}>{entry.message || '—'}</p>
                                                    </td>
                                                    <td className="px-6 py-4 text-[11px] text-[var(--sys-text-muted)]">
                                                        {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {entry.status === 'registered' ? (
                                                            <div className="inline-flex flex-col items-center">
                                                                <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary text-[10px] font-black uppercase tracking-wider border border-[var(--sys-border)]">Registered</span>
                                                            </div>
                                                        ) : entry.status === 'invited' ? (
                                                            <div className="inline-flex flex-col items-center gap-1">
                                                                <span className="px-2 py-0.5 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] text-[10px] font-black uppercase tracking-wider border border-[#FF4D00]/20">Invited</span>
                                                                {entry.invitedAt && <span className="text-[9px] text-slate-700">{new Date(entry.invitedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)] text-[10px] font-black uppercase tracking-wider border border-[var(--sys-border)]">Pending</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {entry.status !== 'registered' && (
                                                                <button 
                                                                    onClick={() => handleApproveWaitlist(entry._id)}
                                                                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all border cursor-pointer ${
                                                                        entry.status === 'invited' 
                                                                        ? 'bg-[#FF4D00]/10 hover:bg-[#FF4D00] text-[#FF4D00] hover:text-[var(--sys-text)] border-[#FF4D00]/20' 
                                                                        : 'bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-surface)] text-primary hover:text-[var(--sys-text)] border-[var(--sys-border)]'
                                                                    }`}
                                                                    title={entry.status === 'invited' ? 'Resend Invitation' : 'Send Invitation'}
                                                                >
                                                                    {entry.status === 'invited' ? 'Resend' : 'Invite'}
                                                                </button>
                                                            )}
                                                            <button 
                                                                onClick={() => handleDeleteWaitlist(entry._id)}
                                                                className="p-1.5 rounded-lg bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-surface)] text-primary hover:text-[var(--sys-text)] transition-all border border-[var(--sys-border)] cursor-pointer"
                                                                title="Remove Entry"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-20 glass-panel rounded-2xl border border-dashed border-[var(--sys-border)]">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">inbox</span>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] mb-1">Waitlist is Empty</h3>
                                <p className="text-sm text-[var(--sys-text-muted)]">No new early access requests found.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ USERS ════════════ */}
                {tab === 'users' && (
                    <div className="space-y-6">
                        {/* Intelligence Segment Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">group</span>
                                    User Intelligence Dashboard
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)]">Granular oversight of platform inhabitants, roles, and behavioral metrics.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={loadUsers} className="p-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer" title="Refresh"><span className="material-symbols-outlined text-sm">refresh</span></button>
                                <button className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">add</span> Add User
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter Bar */}
                        <div className="flex gap-3">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">search</span>
                                <input type="text" value={search} onChange={e => { setSearch(e.target.value); setUserPage(1) }} placeholder="Search name, email, company..." className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-primary/50" />
                            </div>
                            <select value={planFilter} onChange={e => { setPlanFilter(e.target.value); setUserPage(1) }} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none cursor-pointer">
                                <option value="">All Plans</option>
                                {packages.map(p => (
                                    <option key={p._id} value={p.slug}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Drawer */}
                        {userDrawer && (
                            <div className="fixed inset-0 z-50 flex justify-end" style={{background:'rgba(0,0,0,0.55)'}} onClick={() => setUserDrawer(null)}>
                                <div className="w-full max-w-md bg-[#0e1025] border-l border-[var(--sys-border)] h-full overflow-y-auto shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary text-xl font-black">{userDrawer.name?.[0]?.toUpperCase()}</div>
                                            <div><p className="font-bold text-[var(--sys-text)]">{userDrawer.name}</p><p className="text-xs text-[var(--sys-text-muted)]">{userDrawer.email}</p></div>
                                        </div>
                                        <button onClick={() => setUserDrawer(null)} className="p-2 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <div className="flex gap-2 flex-wrap mb-4">
                                        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--sys-primary-dim)] text-primary font-bold uppercase">{userDrawer.plan}</span>
                                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${userDrawer.segment==='power'?'bg-green-500/20 text-green-400':userDrawer.segment==='churned'?'bg-amber-500/20 text-amber-400':userDrawer.segment==='dead'?'bg-red-500/20 text-red-400':'bg-cyan-500/20 text-cyan-400'}`}>{userDrawer.segment==='power'?'⚡ Power':userDrawer.segment==='churned'?'⚠ Churned':userDrawer.segment==='dead'?'☠ Dead':'● Active'}</span>
                                        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)] font-bold">{userDrawer.approvalStatus?.toUpperCase()}</span>
                                        <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">Joined {new Date(userDrawer.createdAt).toLocaleDateString('en-IN',{month:'short',year:'numeric'})}</span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        {[{label:'Credits 30d',val:userDrawer.creditsSpent30d||0,c:'text-primary'},{label:'Gen 30d',val:userDrawer.generationCount30d||0},{label:'Storage',val:`${userDrawer.storageUsedMB||0}MB`},{label:'Time on App',val:`${userDrawer.sessionDurationMins||0}m`},{label:'Downloads',val:userDrawer.totalDownloads||0},{label:'Shares',val:userDrawer.totalShares||0}].map(s=>(
                                            <div key={s.label} className="bg-[var(--sys-surface)] rounded-xl p-3 text-center">
                                                <p className={`text-lg font-black ${s.c||'text-[var(--sys-text)]'}`}>{s.val}</p>
                                                <p className="text-[9px] text-[var(--sys-text-muted)] uppercase font-bold mt-0.5">{s.label}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mb-4">
                                        <p className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">Studio Breakdown</p>
                                        {[{label:'Content',val:userDrawer.contentCount||0,color:'#6366f1'},{label:'Creative',val:userDrawer.creativeCount||0,color:'#FF4D00'},{label:'Video',val:userDrawer.videoCount||0,color:'#06b6d4'}].map(s=>{
                                            const mx=Math.max(userDrawer.contentCount||0,userDrawer.creativeCount||0,userDrawer.videoCount||1,1);
                                            return(<div key={s.label} className="flex items-center gap-2 mb-1.5"><span className="text-[10px] text-[var(--sys-text-muted)] w-14">{s.label}</span><div className="flex-1 h-1.5 rounded-full bg-[var(--sys-surface)]"><div className="h-full rounded-full" style={{width:`${Math.min(100,(s.val/mx)*100)}%`,backgroundColor:s.color}}/></div><span className="text-[10px] font-bold w-6 text-right text-[var(--sys-text)]">{s.val}</span></div>);
                                        })}
                                        {userDrawer.topStudio&&<p className="text-[10px] text-[var(--sys-text-muted)] mt-1">Top: <span className="text-primary font-bold capitalize">{userDrawer.topStudio}</span></p>}
                                    </div>
                                    <div className="mb-4 p-3 bg-[var(--sys-surface)] rounded-xl">
                                        <p className="text-xs font-bold text-[var(--sys-text-muted)] uppercase mb-1">Credits</p>
                                        <p className="text-xl font-black text-primary">{userDrawer.creditBalance?.unlimited?'∞':userDrawer.creditBalance?.remaining??0} <span className="text-xs font-normal text-[var(--sys-text-muted)]">remaining · {userDrawer.credits?.used||0} used / {(userDrawer.credits?.total||0)+(userDrawer.credits?.bonus||0)} total</span></p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={()=>{handleImpersonate(userDrawer._id,userDrawer.name);setUserDrawer(null)}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-xs font-bold cursor-pointer"><span className="material-symbols-outlined text-sm">login</span>Impersonate</button>
                                        <button onClick={()=>{setCreditModal(userDrawer);setUserDrawer(null)}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold cursor-pointer"><span className="material-symbols-outlined text-sm">add_circle</span>Credits</button>
                                        <button onClick={()=>{setPlanModal(userDrawer);setUserDrawer(null)}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold cursor-pointer"><span className="material-symbols-outlined text-sm">upgrade</span>Plan</button>
                                        <button onClick={()=>{openUserStudioModal(userDrawer._id);setUserDrawer(null)}} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold cursor-pointer"><span className="material-symbols-outlined text-sm">shield_person</span>Studios</button>
                                        <button onClick={()=>{handleDeleteUser(userDrawer._id,userDrawer.name);setUserDrawer(null)}} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-xs font-bold cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {/* Segment Tabs */}
                        <div className="flex gap-1 p-1 bg-[var(--sys-surface)] rounded-xl border border-[var(--sys-border)] overflow-x-auto">
                            {[{id:'all',label:'All',icon:'group'},{id:'active',label:'Active',icon:'radio_button_checked',ac:'text-cyan-400'},{id:'power',label:'Power',icon:'bolt',ac:'text-green-400'},{id:'churned',label:'Churned',icon:'warning',ac:'text-amber-400'},{id:'dead',label:'Dead',icon:'skull',ac:'text-red-400'}].map(seg=>(
                                <button key={seg.id} onClick={()=>{setUserSegment(seg.id);setUserPage(1)}} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${userSegment===seg.id?'bg-[var(--sys-bg)] shadow text-[var(--sys-text)]':'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    <span className={`material-symbols-outlined text-sm ${userSegment===seg.id&&seg.ac?seg.ac:''}`}>{seg.icon}</span>
                                    {seg.label}
                                    {segmentCounts[seg.id]!=null&&<span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-[var(--sys-border)] text-[var(--sys-text-muted)] text-[9px] font-black">{segmentCounts[seg.id]}</span>}
                                </button>
                            ))}
                        </div>
                        {/* Sort Bar */}
                        <div className="flex gap-2 flex-wrap items-center">
                            <select value={userSort} onChange={e=>setUserSort(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs outline-none cursor-pointer">
                                <option value="lastActive">Last Active</option>
                                <option value="creditsSpent">Credits Spent (30d)</option>
                                <option value="generations">Generations (30d)</option>
                                <option value="storageUsed">Storage Used</option>
                                <option value="sessionDuration">Time on App</option>
                                <option value="downloads">Downloads</option>
                                <option value="shares">Shares</option>
                                <option value="creditsUsed">Credits Used (Total)</option>
                                <option value="createdAt">Joined Date</option>
                            </select>
                            <button onClick={()=>setUserSortOrder(o=>o==='desc'?'asc':'desc')} className="p-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] cursor-pointer" title="Toggle sort">
                                <span className="material-symbols-outlined text-sm">{userSortOrder==='desc'?'arrow_downward':'arrow_upward'}</span>
                            </button>
                            <p className="text-xs text-[var(--sys-text-muted)] ml-auto">{totalUsers} users · click a row to deep-dive</p>
                        </div>
                        {/* Table */}
                        {usersLoading?(
                            <div className="flex items-center justify-center py-16 text-[var(--sys-text-muted)]"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...</div>
                        ):(
                            <div className="overflow-x-auto rounded-2xl border border-[var(--sys-border)]">
                                <table className="w-full text-sm">
                                    <thead><tr className="border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                        <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)]">User</th>
                                        <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)]">Segment</th>
                                        <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] cursor-pointer hover:text-primary" onClick={()=>setUserSort('creditsSpent')}>Credits 30d{userSort==='creditsSpent'?' ▾':''}</th>
                                        <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] cursor-pointer hover:text-primary" onClick={()=>setUserSort('generations')}>Gen{userSort==='generations'?' ▾':''}</th>
                                        <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] cursor-pointer hover:text-primary" onClick={()=>setUserSort('storageUsed')}>Storage{userSort==='storageUsed'?' ▾':''}</th>
                                        <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] cursor-pointer hover:text-primary" onClick={()=>setUserSort('downloads')}>DL{userSort==='downloads'?' ▾':''}</th>
                                        <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] cursor-pointer hover:text-primary" onClick={()=>setUserSort('lastActive')}>Last Active{userSort==='lastActive'?' ▾':''}</th>
                                    </tr></thead>
                                    <tbody>
                                        {users.map(u=>{
                                            const ss={power:'text-green-400 bg-green-500/10',active:'text-cyan-400 bg-cyan-500/10',churned:'text-amber-400 bg-amber-500/10',dead:'text-red-400 bg-red-500/10'};
                                            const sl={power:'⚡ Power',active:'● Active',churned:'⚠ Churned',dead:'☠ Dead'};
                                            const seg=u.segment||'active';
                                            const da=u.lastActive?Math.floor((Date.now()-new Date(u.lastActive))/86400000):null;
                                            const las=da===null?'Never':da===0?'Today':da===1?'Yesterday':`${da}d ago`;
                                            return(<tr key={u._id} className="border-b border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer group" onClick={()=>setUserDrawer(u)}>
                                                <td className="px-4 py-3"><div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-black shrink-0">{u.name?.[0]?.toUpperCase()}</div>
                                                    <div className="min-w-0"><p className="font-bold text-[var(--sys-text)] text-xs truncate max-w-[140px]">{u.name}</p><p className="text-[10px] text-[var(--sys-text-muted)] truncate max-w-[140px]">{u.email}</p></div>
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-[var(--sys-primary-dim)] text-primary uppercase shrink-0">{u.plan}</span>
                                                </div></td>
                                                <td className="px-3 py-3 text-center"><span className={`text-[9px] px-2 py-1 rounded-full font-bold ${ss[seg]||ss.active}`}>{sl[seg]||seg}</span></td>
                                                <td className="px-3 py-3 text-right"><span className="text-xs font-bold text-primary">{u.creditsSpent30d||0}</span></td>
                                                <td className="px-3 py-3 text-right"><span className="text-xs font-bold text-[var(--sys-text)]">{u.generationCount30d||0}</span></td>
                                                <td className="px-3 py-3 text-right"><span className="text-xs text-[var(--sys-text-muted)]">{u.storageUsedMB||0} MB</span></td>
                                                <td className="px-3 py-3 text-right"><span className="text-xs text-[var(--sys-text-muted)]">{u.totalDownloads||0}</span></td>
                                                <td className="px-3 py-3 text-right"><span className={`text-[10px] font-bold ${seg==='dead'?'text-red-400':seg==='churned'?'text-amber-400':'text-[var(--sys-text-muted)]'}`}>{las}</span></td>
                                            </tr>);
                                        })}
                                        {users.length===0&&<tr><td colSpan="7" className="py-16 text-center text-[var(--sys-text-muted)] text-sm">No users in this segment</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {/* Pagination */}
                        {totalUsers>25&&(
                            <div className="flex justify-center gap-2">
                                <button disabled={userPage<=1} onClick={()=>setUserPage(p=>p-1)} className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)] disabled:opacity-30 cursor-pointer">← Prev</button>
                                <span className="px-4 py-2 text-sm text-[var(--sys-text-muted)]">Page {userPage} · {totalUsers} users</span>
                                <button disabled={users.length<25} onClick={()=>setUserPage(p=>p+1)} className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)] disabled:opacity-30 cursor-pointer">Next →</button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ AI USAGE & CREDITS ════════════ */}
                {tab === 'ai-credits' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Summary Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div className="glass-panel rounded-2xl p-5 border border-primary/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">token</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">System Credits Used</p>
                                        <h4 className="text-2xl font-black text-[var(--sys-text)]">
                                            {stats?.totalCreditsUsed?.toLocaleString() || '—'}
                                        </h4>
                                    </div>
                                </div>
                                <div className="h-1 w-full bg-[var(--sys-surface)] rounded-full overflow-hidden">
                                     <div className="h-full bg-primary" style={{ width: '65%' }} />
                                </div>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">battery_alert</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">Exhausted Accounts</p>
                                        <h4 className="text-2xl font-black text-[var(--sys-text)]">
                                            {stats?.usageAnalytics?.exhaustedCount || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-primary/60 font-medium">Require immediate recharge or plan upgrade</p>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">warning</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">Low Balance (&lt;10%)</p>
                                        <h4 className="text-2xl font-black text-[var(--sys-text)]">
                                            {stats?.usageAnalytics?.nearEmptyCount || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-primary/60 font-medium">Approaching credit limits</p>
                            </div>

                            <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">trending_up</span>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">Top Consumers</p>
                                        <h4 className="text-2xl font-black text-[var(--sys-text)]">
                                            {stats?.usageAnalytics?.topUsers?.length || 0}
                                        </h4>
                                    </div>
                                </div>
                                <p className="text-[10px] text-primary/60 font-medium">Power users with high generation volume</p>
                            </div>
                        </div>

                        {/* Search & Utility Bar */}
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="flex-1 relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">search</span>
                                <input 
                                    type="text" 
                                    value={search} 
                                    onChange={e => { setSearch(e.target.value); setUserPage(1) }} 
                                    placeholder="Search users to manage credits..." 
                                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-primary/50 transition-all shadow-inner" 
                                />
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { setPlanFilter('exhausted'); setUserPage(1) }}
                                    className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${planFilter === 'exhausted' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    Exhausted
                                </button>
                                <button 
                                    onClick={() => { setPlanFilter('low'); setUserPage(1) }}
                                    className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${planFilter === 'low' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm">warning</span>
                                    Low Balance
                                </button>
                                <button 
                                    onClick={() => { setPlanFilter(''); setSearch(''); setUserPage(1) }}
                                    className="px-4 py-3 rounded-2xl text-xs font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] transition-all"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>

                        {/* Detailed Usage Table */}
                        <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)] shadow-2xl">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[900px]">
                                    <thead>
                                        <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-[0.1em] border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                            <th className="px-6 py-4">User Identity</th>
                                            <th className="px-6 py-4">Subscription Plan</th>
                                            <th className="px-6 py-4">AI Usage (Used/Total)</th>
                                            <th className="px-6 py-4">Remaining</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Credit Control</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {users.length > 0 ? users.map(u => {
                                            const total = (u.credits?.total || 0) + (u.credits?.bonus || 0);
                                            const used = u.credits?.used || 0;
                                            const remaining = u.creditBalance?.remaining || 0;
                                            const percent = Math.min(100, (used / total) * 100);
                                            const isLow = remaining <= 5 || percent >= 90;
                                            const isExhausted = remaining <= 0;

                                            return (
                                                <tr key={u._id} className="text-sm group hover:bg-[var(--sys-surface)] transition-all">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-primary font-black shadow-lg">
                                                                {u.name?.[0]?.toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-bold text-[var(--sys-text)] truncate">{u.name}</p>
                                                                <p className="text-[10px] text-[var(--sys-text-muted)] truncate">{u.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-[9px] px-2 py-1 rounded-lg font-black uppercase tracking-wider border ${
                                                            u.plan === 'enterprise' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 
                                                            u.plan === 'elite' ? 'bg-[#7c3aed]/10 border-[#7c3aed]/20 text-[#7c3aed]' : 
                                                            u.plan === 'generative' ? 'bg-[#10b981]/10 border-[#10b981]/20 text-[#10b981]' : 
                                                            u.plan === 'max' ? 'bg-[#FF4D00]/10 border-[#FF4D00]/20 text-[#FF4D00]' : 
                                                            u.plan === 'plus' ? 'bg-[#6366f1]/10 border-[#6366f1]/20 text-[#6366f1]' : 
                                                            u.plan === 'professional' ? 'bg-[#FF4D00]/10 border-[#FF4D00]/20 text-[#FF4D00]' : 
                                                            u.plan === 'creator' ? 'bg-[#6366f1]/10 border-[#6366f1]/20 text-[#6366f1]' : 
                                                            u.plan === 'test' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' :
                                                            'bg-[var(--sys-border)]/10 border-[var(--sys-border)] text-[var(--sys-text-muted)]'
                                                        }`}>
                                                            {u.plan}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="w-32">
                                                            <div className="flex justify-between items-center mb-1.5">
                                                                <p className="text-[10px] font-bold text-[var(--sys-text)]">{used} / {total}</p>
                                                                <p className="text-[9px] text-[var(--sys-text-muted)] font-bold">{Math.round(percent)}%</p>
                                                            </div>
                                                            <div className="h-1.5 w-full bg-[var(--sys-surface)] rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full transition-all duration-700 ${
                                                                        isExhausted ? 'bg-[var(--sys-surface)] shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 
                                                                        isLow ? 'bg-[var(--sys-surface)]' : 
                                                                        'bg-primary'
                                                                    }`}
                                                                    style={{ width: `${percent}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`text-base font-black ${isExhausted ? 'text-primary' : isLow ? 'text-primary' : 'text-primary'}`}>
                                                            {u.creditBalance?.unlimited ? '∞' : remaining}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {isExhausted ? (
                                                            <div className="flex items-center gap-1 text-primary">
                                                                <span className="material-symbols-outlined text-sm">cancel</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Expired</span>
                                                            </div>
                                                        ) : isLow ? (
                                                            <div className="flex items-center gap-1 text-primary">
                                                                <span className="material-symbols-outlined text-sm">history_toggle_off</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Low Balance</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-primary">
                                                                <span className="material-symbols-outlined text-sm">check_circle</span>
                                                                <span className="text-[10px] font-black uppercase tracking-tighter">Healthy</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button 
                                                            onClick={() => setCreditModal(u)}
                                                            className="px-4 py-2 rounded-xl bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-surface)] text-primary hover:text-[var(--sys-text)] text-xs font-black transition-all border border-[var(--sys-border)] flex items-center gap-2 ml-auto cursor-pointer"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">add_card</span>
                                                            Recharge
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan="6" className="py-20 text-center text-[var(--sys-text-muted)] font-medium tracking-wide">No users matching current filters</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {totalUsers > 20 && (
                            <div className="flex justify-center gap-4 mt-8">
                                <button 
                                    disabled={userPage <= 1} 
                                    onClick={() => setUserPage(p => p - 1)} 
                                    className="px-6 py-3 rounded-2xl bg-[var(--sys-surface)] text-xs font-bold text-[var(--sys-text-muted)] disabled:opacity-30 border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all cursor-pointer"
                                >
                                    ← Previous Page
                                </button>
                                <div className="px-6 py-3 rounded-2xl bg-primary/10 border border-primary/20 text-xs font-black text-primary">
                                    Page {userPage}
                                </div>
                                <button 
                                    disabled={users.length < 20} 
                                    onClick={() => setUserPage(p => p + 1)} 
                                    className="px-6 py-3 rounded-2xl bg-[var(--sys-surface)] text-xs font-bold text-[var(--sys-text-muted)] disabled:opacity-30 border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all cursor-pointer"
                                >
                                    Next Page →
                                </button>
                            </div>
                        )}
                    </div>
                )}


                {/* ════════════ TOKEN USAGE ════════════ */}
                {tab === 'tokenUsage' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">monitoring</span>
                                    AI Token Usage &amp; Cost Analytics
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Track actual AI API token consumption, costs, and profitability</p>
                            </div>
                            <div className="flex gap-2">
                                {[7, 30, 90].map(d => (
                                    <button key={d} onClick={() => { setTokenDays(d); setTimeout(() => loadTokenUsage(), 50) }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${tokenDays === d ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'text-[var(--sys-text-muted)] bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
                                        {d}d
                                    </button>
                                ))}
                            </div>
                        </div>

                        {!tokenData ? (
                            <div className="flex items-center justify-center py-20 text-[var(--sys-text-muted)]">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading token analytics...
                            </div>
                        ) : (
                            <>
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-primary text-lg mb-1 block">token</span>
                                        <p className="text-xl font-extrabold text-[var(--sys-text)]">{(tokenData.totals?.totalTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">Total Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-[#FF4D00] text-lg mb-1 block">input</span>
                                        <p className="text-xl font-extrabold text-[var(--sys-text)]">{(tokenData.totals?.inputTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">Input Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-[#FF4D00] text-lg mb-1 block">output</span>
                                        <p className="text-xl font-extrabold text-[var(--sys-text)]">{(tokenData.totals?.outputTokens || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">Output Tokens</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-primary text-lg mb-1 block">payments</span>
                                        <p className="text-xl font-extrabold text-primary">${tokenData.totals?.estimatedCostUSD || 0}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">Est. Cost (USD)</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-primary text-lg mb-1 block">bolt</span>
                                        <p className="text-xl font-extrabold text-[var(--sys-text)]">{(tokenData.totals?.totalCalls || 0).toLocaleString()}</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">AI Calls</p>
                                    </div>
                                    <div className="glass-panel rounded-2xl p-4">
                                        <span className="material-symbols-outlined text-lg mb-1 block" style={{ color: (tokenData.profitability?.margin || 0) > 50 ? '#34d399' : (tokenData.profitability?.margin || 0) > 0 ? '#fbbf24' : '#fb7185' }}>trending_up</span>
                                        <p className="text-xl font-extrabold" style={{ color: (tokenData.profitability?.margin || 0) > 50 ? '#34d399' : (tokenData.profitability?.margin || 0) > 0 ? '#fbbf24' : '#fb7185' }}>{tokenData.profitability?.margin || 0}%</p>
                                        <p className="text-[10px] text-[var(--sys-text-muted)]">Profit Margin</p>
                                    </div>
                                </div>

                                {/* Provider Portfolio Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-sm font-bold text-[var(--sys-text)] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary text-lg">account_balance_wallet</span>
                                            Provider Portfolio (Prepaid Balances)
                                        </h4>
                                        <button onClick={() => setShowBudgetModal(true)} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-[10px] font-bold hover:bg-[var(--sys-surface)] transition-all flex items-center gap-1.5 cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">settings</span>
                                            Configure Budgets
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {tokenData.providerWallets?.length > 0 ? tokenData.providerWallets.map(w => {
                                            const pct = w.budget > 0 ? Math.min(100, (w.consumed / w.budget) * 100) : 0;
                                            const remaining = Math.max(0, w.budget - w.consumed);
                                            const isLow = w.budget > 0 && (remaining / w.budget) < 0.15;
                                            const colors = { anthropic: 'text-[var(--sys-primary)]', openai: 'text-primary', gemini: 'text-[#FF4D00]', xai: 'text-[var(--sys-text)]', grok: 'text-[var(--sys-text)]', sarvam: 'text-primary' };
                                            const bgColors = { anthropic: 'bg-[var(--sys-surface)]', openai: 'bg-[var(--sys-surface)]', gemini: 'bg-[#FF4D00]', xai: 'bg-[var(--sys-border)]', grok: 'bg-[var(--sys-border)]', sarvam: 'bg-[var(--sys-surface)]' };
                                            
                                            return (
                                                <div key={w.provider} className={`glass-panel rounded-2xl p-5 border transition-all ${isLow ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)]'}`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <p className={`text-xs font-black uppercase tracking-widest ${colors[w.provider] || 'text-[var(--sys-text-muted)]'}`}>{w.provider === 'xai' ? 'Grok (xAI)' : w.provider}</p>
                                                        {isLow && <span className="material-symbols-outlined text-primary text-sm animate-pulse">warning</span>}
                                                    </div>
                                                    <div className="flex items-baseline gap-1 mb-1">
                                                        <span className="text-2xl font-black text-[var(--sys-text)]">${remaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                        <span className="text-[10px] text-[var(--sys-text-muted)] font-bold tracking-tighter uppercase">Left</span>
                                                    </div>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <p className="text-[10px] text-[var(--sys-text-muted)] font-medium">of ${w.budget?.toLocaleString()} purchased</p>
                                                        <p className="text-[9px] font-bold text-[var(--sys-text-muted)] bg-[var(--sys-surface)] px-1.5 py-0.5 rounded uppercase tracking-tighter">{w.tokens?.toLocaleString() || 0} tokens</p>
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-tighter">
                                                            <span className="text-[var(--sys-text-muted)]">Consumed: ${w.consumed?.toLocaleString()}</span>
                                                            <span className={pct > 90 ? 'text-primary' : pct > 75 ? 'text-primary' : 'text-[var(--sys-text-muted)]'}>{Math.round(pct)}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-[var(--sys-surface)] rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full rounded-full transition-all duration-1000 ${pct > 90 ? 'bg-[var(--sys-surface)]' : pct > 75 ? 'bg-[var(--sys-surface)]' : bgColors[w.provider] || 'bg-primary'}`} 
                                                                style={{ width: `${pct}%` }} 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="col-span-full py-8 text-center glass-panel rounded-2xl border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-xs">
                                                No provider budgets configured yet. Click "Configure Budgets" to start tracking.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Profitability Banner */}
                                <div className="glass-panel rounded-2xl p-5 mb-5 border border-[var(--sys-border)] bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <h4 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">account_balance</span>
                                        Profitability Analysis
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Monthly Revenue</p>
                                            <p className="text-lg font-extrabold text-primary">₹{(tokenData.profitability?.monthlyRevenue || 0).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Est. AI Cost (INR)</p>
                                            <p className="text-lg font-extrabold text-primary">₹{(tokenData.profitability?.estimatedCostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Net Profit</p>
                                            <p className="text-lg font-extrabold" style={{ color: ((tokenData.profitability?.monthlyRevenue || 0) - (tokenData.profitability?.estimatedCostINR || 0)) > 0 ? '#34d399' : '#fb7185' }}>
                                                ₹{((tokenData.profitability?.monthlyRevenue || 0) - (tokenData.profitability?.estimatedCostINR || 0)).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                                    {/* Per-Studio Breakdown */}
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h4 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#FF4D00] text-lg">apps</span>
                                            Usage by Studio
                                        </h4>
                                        {(tokenData.byStudio || []).length > 0 ? (
                                            <div className="space-y-2">
                                                {tokenData.byStudio.map(s => {
                                                    const maxTokens = Math.max(...tokenData.byStudio.map(x => x.totalTokens || 0));
                                                    const pct = maxTokens > 0 ? ((s.totalTokens || 0) / maxTokens) * 100 : 0;
                                                    const colors = { seo: '#6366f1', content: '#10b981', creative: '#f472b6', brainstorm: '#f59e0b', video: '#06b6d4', unknown: '#64748b' };
                                                    return (
                                                        <div key={s._id || 'unknown'} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-sm font-bold text-[var(--sys-text)] capitalize">{s._id || 'Other'}</span>
                                                                <span className="text-xs text-[var(--sys-text-muted)]">{(s.totalTokens || 0).toLocaleString()} tokens</span>
                                                            </div>
                                                            <div className="w-full h-1.5 rounded-full bg-[var(--sys-surface)] mb-1">
                                                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colors[s._id] || colors.unknown }} />
                                                            </div>
                                                            <div className="flex items-center justify-between text-[10px] text-[var(--sys-text-muted)]">
                                                                <span>{s.calls} calls • {s.credits} credits</span>
                                                                <span className="text-primary">${(s.estimatedCost || 0).toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-[var(--sys-text-muted)] text-center py-8">No token usage data yet. Generate some reports to see studio breakdown.</p>
                                        )}
                                    </div>

                                    {/* Per-Model Breakdown */}
                                    <div className="glass-panel rounded-2xl p-5">
                                        <h4 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#FF4D00] text-lg">smart_toy</span>
                                            Usage by Model
                                        </h4>
                                        {(tokenData.byModel || []).length > 0 ? (
                                            <div className="space-y-2">
                                                {tokenData.byModel.map((m, i) => {
                                                    const provColors = { openai: '#10b981', xai: '#3b82f6', gemini: '#f59e0b' };
                                                    return (
                                                        <div key={i} className="p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-2 h-2 rounded-full" style={{ background: provColors[m._id?.provider] || '#64748b' }} />
                                                                    <span className="text-sm font-bold text-[var(--sys-text)]">{m._id?.model || 'Unknown'}</span>
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)] uppercase">{m._id?.provider}</span>
                                                                </div>
                                                                <span className="text-xs font-bold text-primary">${(m.estimatedCost || 0).toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-[10px] text-[var(--sys-text-muted)]">
                                                                <span>{(m.totalTokens || 0).toLocaleString()} total</span>
                                                                <span>↓{(m.inputTokens || 0).toLocaleString()} in</span>
                                                                <span>↑{(m.outputTokens || 0).toLocaleString()} out</span>
                                                                <span>{m.calls} calls</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-[var(--sys-text-muted)] text-center py-8">No model usage data yet.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Top Token Consumers */}
                                <div className="glass-panel rounded-2xl p-5">
                                    <h4 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-lg">leaderboard</span>
                                        Top Token Consumers
                                    </h4>
                                    {(tokenData.topUsers || []).length > 0 ? (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[700px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider border-b border-[var(--sys-border)]">
                                                        <th className="pb-2">User</th>
                                                        <th className="pb-2">Plan</th>
                                                        <th className="pb-2 text-right">Tokens Used</th>
                                                        <th className="pb-2 text-right">AI Calls</th>
                                                        <th className="pb-2 text-right">Credits Used</th>
                                                        <th className="pb-2 text-right">Est. Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {tokenData.topUsers.map((u, i) => (
                                                        <tr key={u._id || i} className="text-sm hover:bg-[var(--sys-surface)] transition-all">
                                                            <td className="py-2.5">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded bg-[var(--sys-primary-dim)] flex items-center justify-center text-[10px] font-bold text-primary">{u.name?.[0] || '?'}</div>
                                                                    <div><p className="font-bold text-[var(--sys-text)] text-xs">{u.name || 'Unknown'}</p><p className="text-[10px] text-[var(--sys-text-muted)]">{u.email}</p></div>
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[var(--sys-surface)] text-[var(--sys-text-muted)] capitalize">{u.plan}</span></td>
                                                            <td className="py-2.5 text-right font-bold text-[var(--sys-text)]">{(u.totalTokens || 0).toLocaleString()}</td>
                                                            <td className="py-2.5 text-right text-[var(--sys-text-muted)]">{u.calls}</td>
                                                            <td className="py-2.5 text-right text-[var(--sys-text-muted)]">{u.credits}</td>
                                                            <td className="py-2.5 text-right font-bold text-primary">${(u.estimatedCost || 0).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-[var(--sys-text-muted)] text-center py-8">No user token data yet. Users need to generate reports to see their consumption.</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ PACKAGES ════════════ */}
                {tab === 'packages' && (
                    <div>
                        {/* Header row */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">inventory_2</span>
                                    Subscription Packages ({packages.length})
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">AI-driven package builder — design, suggest, and manage subscription tiers</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSeedDefaults} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text-muted)] text-xs font-medium hover:bg-[var(--sys-surface)] flex items-center gap-1.5 cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">database</span>Seed Defaults
                                </button>
                                <button onClick={handleAISuggest} disabled={suggestingAI} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[#FF4D00]/30 text-[#FF7A00] text-xs font-bold hover:from-[#FF4D00]/30 hover:to-[#FF7A00]/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                                    <span className={`material-symbols-outlined text-sm ${suggestingAI ? 'animate-spin' : ''}`}>{suggestingAI ? 'progress_activity' : 'auto_awesome'}</span>
                                    {suggestingAI ? 'Analyzing...' : 'AI Suggest Packages'}
                                </button>
                                <button onClick={() => { resetPkgForm(); setEditingPkg(null); setShowPkgForm(!showPkgForm) }} className="btn-primary py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 cursor-pointer">
                                    <span className="material-symbols-outlined text-sm">add</span>New Package
                                </button>
                            </div>
                        </div>

                        {/* AI Suggestions Panel */}
                        {aiSuggestions && aiSuggestions.length > 0 && (
                            <div className="mb-6">
                                <div className="glass-panel rounded-2xl p-5 border border-[#FF4D00]/20 bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-[#FF4D00]">auto_awesome</span>
                                        <h4 className="font-bold text-[var(--sys-text)] text-sm">AI-Recommended Packages</h4>
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FF4D00]/20 text-[#FF7A00] font-bold">Based on platform analytics</span>
                                        <button onClick={() => setAiSuggestions(null)} className="ml-auto text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                                    </div>
                                    {/* Analytics summary */}
                                    {aiAnalytics && (
                                        <div className="flex gap-3 mb-4">
                                            {[{ l: 'Users', v: aiAnalytics.totalUsers, c: 'text-[#FF4D00]' }, { l: 'Content', v: aiAnalytics.totalContent, c: 'text-primary' }, { l: 'Creatives', v: aiAnalytics.totalCreatives, c: 'text-[#FF7A00]' }, { l: 'SEO Audits', v: aiAnalytics.seoUsage, c: 'text-primary' }].map(a => (
                                                <div key={a.l} className="px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-center">
                                                    <p className={`text-sm font-bold ${a.c}`}>{a.v}</p>
                                                    <p className="text-xs text-[var(--sys-text-muted)]">{a.l}</p>
                                                </div>
                                            ))}
                                            {aiAnalytics.contentHeavy && <span className="self-center text-xs px-2 py-1 rounded bg-[var(--sys-primary-dim)] text-primary font-bold">Content-Heavy</span>}
                                            {aiAnalytics.creativeHeavy && <span className="self-center text-xs px-2 py-1 rounded bg-[#FF4D00]/10 text-[#FF7A00] font-bold">Creative-Heavy</span>}
                                            {aiAnalytics.seoActive && <span className="self-center text-xs px-2 py-1 rounded bg-[var(--sys-primary-dim)] text-primary font-bold">SEO Active</span>}
                                        </div>
                                    )}
                                    {/* Suggestion cards */}
                                    <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {aiSuggestions.map((s, i) => (
                                            <div key={i} className="relative rounded-xl border border-[var(--sys-border)] p-4 hover:border-[#FF4D00]/30 transition-all" style={{ background: `var(--sys-primary)` }}>
                                                {s.badge && <span className="absolute -top-2 right-3 text-[8px] px-2 py-0.5 rounded-full font-bold text-[var(--sys-text)]" style={{ background: s.color }}>{s.badge}</span>}
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="material-symbols-outlined text-lg" style={{ color: s.color }}>{s.icon || 'star'}</span>
                                                    <h5 className="font-bold text-[var(--sys-text)] text-sm">{s.name}</h5>
                                                </div>
                                                <p className="text-sm text-[var(--sys-text-muted)] mb-3 line-clamp-2">{s.description}</p>
                                                {/* Studios */}
                                                <div className="flex gap-1 mb-2">
                                                    {Object.entries(s.studios || {}).map(([k, v]) => (
                                                        <span key={k} className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${v ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-surface)] text-slate-700 line-through'}`}>{studioNames[k]?.split(' ')[0]}</span>
                                                    ))}
                                                </div>
                                                <div className="flex items-baseline gap-2 mb-2">
                                                    <span className="text-lg font-extrabold text-[var(--sys-text)]">₹{s.pricing?.monthly?.toLocaleString()}</span>
                                                    <span className="text-xs text-[var(--sys-text-muted)]">/mo</span>
                                                    <span className="text-sm text-[var(--sys-text-muted)] ml-auto">{s.credits?.monthly >= 999999 ? '∞' : s.credits?.monthly} credits</span>
                                                </div>
                                                {/* AI rationale */}
                                                <p className="text-xs text-[#FF4D00]/70 italic mb-3 line-clamp-2"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">smart_toy</span> {s.aiRationale}</p>
                                                <button onClick={() => handleAdoptSuggestion(s)} className="w-full py-2 rounded-lg text-sm font-bold text-[var(--sys-text)] cursor-pointer hover:opacity-90 transition-all" style={{ background: `var(--sys-primary)` }}>
                                                    Adopt This Package
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Package Creation / Edit Form */}
                        {showPkgForm && (
                            <form onSubmit={handleSavePkg} className="glass-panel rounded-2xl p-6 mb-6 border border-primary/20">
                                <h4 className="font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">{editingPkg ? 'edit' : 'add_circle'}</span>
                                    {editingPkg ? `Edit: ${editingPkg.name}` : 'Create New Package'}
                                </h4>
                                {/* Row 1: Basic info */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    <input type="text" placeholder="Package Name *" value={pkgForm.name} onChange={e => setPkgForm(f => ({ ...f, name: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" required />
                                    <input type="text" placeholder="Tagline" value={pkgForm.tagline} onChange={e => setPkgForm(f => ({ ...f, tagline: e.target.value }))} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    <select value={pkgForm.tier} onChange={e => setPkgForm(f => ({ ...f, tier: Number(e.target.value) }))} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none cursor-pointer">
                                        <option value={1}>Tier 1 — Basic</option><option value={2}>Tier 2 — Pro</option><option value={3}>Tier 3 — Enterprise</option>
                                    </select>
                                    <input type="text" placeholder="Badge (POPULAR, etc)" value={pkgForm.badge} onChange={e => setPkgForm(f => ({ ...f, badge: e.target.value.toUpperCase() }))} className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                </div>
                                <textarea placeholder="Description" value={pkgForm.description} onChange={e => setPkgForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full mb-4 px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none resize-none" />

                                {/* Row 2: Studio Access */}
                                <h5 className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-[#FF4D00]">apps</span>Studio Access</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    {Object.entries(studioNames).map(([key, label]) => (
                                        <button key={key} type="button" onClick={() => setPkgForm(f => ({ ...f, studios: { ...f.studios, [key]: !f.studios[key] } }))}
                                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${pkgForm.studios[key] ? 'border-[var(--sys-border)] bg-[var(--sys-primary-dim)]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)]'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-bold text-[var(--sys-text)]">{label}</span>
                                                <span className={`material-symbols-outlined text-sm ${pkgForm.studios[key] ? 'text-primary' : 'text-slate-700'}`}>{pkgForm.studios[key] ? 'check_circle' : 'cancel'}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Row 3: Credits */}
                                <h5 className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-primary">token</span>Credits & Costs</h5>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
                                    <div>
                                        <label className="text-xs text-[var(--sys-text-muted)] block mb-1">Monthly Credits</label>
                                        <input type="number" value={pkgForm.credits.monthly} onChange={e => setPkgForm(f => ({ ...f, credits: { ...f.credits, monthly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--sys-text-muted)] block mb-1">Signup Bonus</label>
                                        <input type="number" value={pkgForm.credits.bonusOnSignup} onChange={e => setPkgForm(f => ({ ...f, credits: { ...f.credits, bonusOnSignup: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    </div>
                                    <div className="flex items-end">
                                        <button type="button" onClick={() => setPkgForm(f => ({ ...f, credits: { ...f.credits, rollover: !f.credits.rollover } }))}
                                            className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${pkgForm.credits.rollover ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]'}`}>
                                            <span className="material-symbols-outlined text-sm">{pkgForm.credits.rollover ? 'check' : 'close'}</span>Rollover
                                        </button>
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--sys-text-muted)] block mb-1">Content Cost</label>
                                        <input type="number" value={pkgForm.creditCosts.content} onChange={e => setPkgForm(f => ({ ...f, creditCosts: { ...f.creditCosts, content: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    </div>
                                    <div>
                                        <label className="text-xs text-[var(--sys-text-muted)] block mb-1">Creative Cost</label>
                                        <input type="number" value={pkgForm.creditCosts.creative} onChange={e => setPkgForm(f => ({ ...f, creditCosts: { ...f.creditCosts, creative: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    </div>
                                </div>

                                {/* Row 4: Limits + Pricing */}
                                <h5 className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-[#FF4D00]">tune</span>Limits & Pricing</h5>
                                <div className="grid grid-cols-7 gap-3 mb-4">
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">Max Brands</label><input type="number" value={pkgForm.limits.maxBrands} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxBrands: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">Team Seats</label><input type="number" value={pkgForm.limits.maxTeamMembers} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxTeamMembers: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">Products</label><input type="number" value={pkgForm.limits.maxProducts} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxProducts: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">Sched. Posts</label><input type="number" value={pkgForm.limits.maxScheduledPosts} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, maxScheduledPosts: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">Social Accs</label><input type="number" value={pkgForm.limits.socialIntegrations} onChange={e => setPkgForm(f => ({ ...f, limits: { ...f.limits, socialIntegrations: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">₹ Monthly</label><input type="number" value={pkgForm.pricing.monthly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, monthly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">₹ Quarterly</label><input type="number" value={pkgForm.pricing.quarterly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, quarterly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                    <div><label className="text-xs text-[var(--sys-text-muted)] block mb-1">₹ Yearly</label><input type="number" value={pkgForm.pricing.yearly} onChange={e => setPkgForm(f => ({ ...f, pricing: { ...f.pricing, yearly: Number(e.target.value) } }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" /></div>
                                </div>

                                {/* Row 5: Features */}
                                <h5 className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm text-primary">checklist</span>Features</h5>
                                <div className="flex gap-2 mb-2">
                                    <input type="text" value={newFeature} onChange={e => setNewFeature(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addFeature())} placeholder="Add feature (e.g. AI Photoshoot)" className="flex-1 px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none" />
                                    <button type="button" onClick={addFeature} className="px-3 py-2 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-xs font-bold cursor-pointer">+ Add</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5 mb-4">
                                    {pkgForm.features.map((f, i) => (
                                        <span key={i} className="text-xs px-2 py-1 rounded-lg bg-[var(--sys-primary-dim)] text-primary flex items-center gap-1">
                                            {f.name}
                                            <button type="button" onClick={() => removeFeature(i)} className="text-primary hover:text-primary cursor-pointer">×</button>
                                        </span>
                                    ))}
                                </div>

                                {/* Row 6: Color + actions */}
                                <div className="flex items-center gap-3">
                                    <label className="text-xs text-[var(--sys-text-muted)]">Color</label>
                                    <input type="color" value={pkgForm.color} onChange={e => setPkgForm(f => ({ ...f, color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" />
                                    <input type="text" placeholder="Icon name" value={pkgForm.icon} onChange={e => setPkgForm(f => ({ ...f, icon: e.target.value }))} className="px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none w-32" />
                                    <div className="flex-1" />
                                    <button type="button" onClick={() => { setShowPkgForm(false); setEditingPkg(null) }} className="px-4 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] cursor-pointer">Cancel</button>
                                    <button type="submit" className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer">{editingPkg ? 'Update' : 'Create'} Package</button>
                                </div>
                            </form>
                        )}

                        {/* Existing Packages Grid */}
                        {packages.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {packages.map(pkg => (
                                    <div key={pkg._id} className="relative glass-panel rounded-2xl overflow-hidden hover:border-[var(--sys-border)] transition-all" style={{ borderTop: `3px solid ${pkg.color || '#6366f1'}` }}>
                                        {pkg.badge && <span className="absolute top-3 right-3 text-[8px] px-2 py-0.5 rounded-full font-bold text-[var(--sys-text)]" style={{ background: pkg.color }}>{pkg.badge}</span>}
                                        <div className="p-5">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="material-symbols-outlined" style={{ color: pkg.color }}>{pkg.icon || 'star'}</span>
                                                <h4 className="text-base font-extrabold text-[var(--sys-text)]">{pkg.name}</h4>
                                                {pkg.generatedByAI && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[#FF4D00]/15 text-[#FF4D00] font-bold">AI</span>}
                                            </div>
                                            {pkg.tagline && <p className="text-sm text-[var(--sys-text-muted)] mb-3">{pkg.tagline}</p>}

                                            {/* Price */}
                                            <div className="flex items-baseline gap-1 mb-3">
                                                <span className="text-2xl font-extrabold text-[var(--sys-text)]">₹{(pkg.pricing?.monthly || 0).toLocaleString()}</span>
                                                <span className="text-xs text-[var(--sys-text-muted)]">/mo</span>
                                                {pkg.pricing?.quarterly > 0 && <span className="text-sm text-[var(--sys-text-muted)] ml-1">₹{(pkg.pricing?.quarterly || 0).toLocaleString()}/qtr</span>}
                                                {pkg.pricing?.yearly > 0 && <span className="text-sm text-[var(--sys-text-muted)] ml-1">₹{(pkg.pricing?.yearly || 0).toLocaleString()}/yr</span>}
                                            </div>

                                            {/* Studios */}
                                            <div className="flex gap-1 mb-3">
                                                {Object.entries(pkg.studios || {}).map(([k, v]) => (
                                                    <span key={k} className={`text-xs px-2 py-0.5 rounded-full font-bold ${v ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-surface)] text-slate-700 line-through'}`}>{studioNames[k]?.split(' ')[0]}</span>
                                                ))}
                                            </div>

                                            {/* Credits */}
                                            <div className="flex gap-3 mb-3 text-center">
                                                <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]">
                                                    <p className="text-sm font-bold text-primary">{pkg.credits?.monthly >= 999999 ? '∞' : pkg.credits?.monthly || 0}</p>
                                                    <p className="text-[8px] text-[var(--sys-text-muted)]">credits/mo</p>
                                                </div>
                                                <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]">
                                                    <p className="text-base font-bold text-[var(--sys-text)]">{pkg.limits?.maxBrands >= 999 ? '∞' : pkg.limits?.maxBrands || 0}</p>
                                                    <p className="text-[8px] text-[var(--sys-text-muted)]">brands</p>
                                                </div>
                                                <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]">
                                                    <p className="text-base font-bold text-[var(--sys-text)]">{pkg.limits?.maxTeamMembers || 0}</p>
                                                    <p className="text-[8px] text-[var(--sys-text-muted)]">seats</p>
                                                </div>
                                            </div>

                                            {/* Features */}
                                            {pkg.features?.length > 0 && (
                                                <div className="space-y-1 mb-3">
                                                    {pkg.features.slice(0, 5).map((f, i) => (
                                                        <div key={i} className="flex items-center gap-1.5">
                                                            <span className={`material-symbols-outlined text-xs ${f.included ? 'text-primary' : 'text-slate-700'}`}>{f.included ? 'check' : 'close'}</span>
                                                            <span className={`text-xs ${f.included ? 'text-[var(--sys-text-muted)]' : 'text-slate-700 line-through'}`}>{f.name}</span>
                                                        </div>
                                                    ))}
                                                    {pkg.features.length > 5 && <p className="text-xs text-[var(--sys-text-muted)] pl-5">+{pkg.features.length - 5} more</p>}
                                                </div>
                                            )}

                                            {/* Rollover + subscriber badge */}
                                            <div className="flex items-center gap-2 mb-3">
                                                {pkg.credits?.rollover && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-bold">Rollover</span>}
                                                {pkg.isDefault && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-bold">DEFAULT</span>}
                                                <span className="text-xs text-[var(--sys-text-muted)] ml-auto">{pkg.subscriberCount || 0} users</span>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex gap-2 pt-3 border-t border-[var(--sys-border)]">
                                                <button onClick={() => handleEditPkg(pkg)} className="flex-1 py-2 rounded-lg bg-[var(--sys-surface)] text-xs font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] flex items-center justify-center gap-1 cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">edit</span>Edit
                                                </button>
                                                <button onClick={() => handleDeletePkg(pkg._id, pkg.name)} className="py-2 px-3 rounded-lg hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer">
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">inventory_2</span>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] mb-1">No Packages Yet</h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mb-4">Use AI to suggest packages based on usage patterns, or create one manually</p>
                                <button onClick={handleAISuggest} disabled={suggestingAI} className="px-6 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[#FF4D00]/30 text-[#FF7A00] text-sm font-bold cursor-pointer">
                                    <span className="material-symbols-outlined text-sm align-middle mr-1">auto_awesome</span>Generate AI Suggestions
                                </button>
                            </div>
                        )}
                    </div>
                )}


                {/* ════════════ COUPONS ════════════ */}
                {tab === 'coupons' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-black text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">confirmation_number</span>
                                    Coupon Management
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)]">Create and track promotional discounts</p>
                            </div>
                            <button onClick={() => setShowCouponForm(!showCouponForm)} className="px-5 py-2.5 rounded-xl bg-primary text-white font-black text-sm flex items-center gap-2 hover:bg-primary/90 transition-all cursor-pointer">
                                <span className="material-symbols-outlined text-sm">add</span>
                                New Coupon
                            </button>
                        </div>

                        {/* Quick Stats Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                            <div className="glass-panel p-4 rounded-2xl border-[var(--sys-border)]">
                                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--sys-text-muted)] mb-1">Total Coupons</p>
                                <p className="text-2xl font-black text-[var(--sys-text)]">{coupons.length}</p>
                            </div>
                            <div className="glass-panel p-4 rounded-2xl border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.02]">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">Active Now</p>
                                <p className="text-2xl font-black text-primary">{coupons.filter(c => c.isActive && c.isValid).length}</p>
                            </div>
                            <div className="glass-panel p-4 rounded-2xl border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.02]">
                                <p className="text-[10px] font-black uppercase tracking-widest text-primary/60 mb-1">Total Redemptions</p>
                                <p className="text-2xl font-black text-primary">
                                    {coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0)}
                                </p>
                            </div>
                        </div>

                        {showCouponForm && (
                            <form onSubmit={handleCreateCoupon} className="glass-panel rounded-2xl p-6 mb-8 border border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.02] shadow-none anim-fade-in">
                                <h4 className="font-black text-[var(--sys-text)] mb-6 uppercase tracking-widest text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-sm">edit_note</span>
                                    Configure New Coupon
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Unique Code</label>
                                        <input type="text" placeholder="e.g. MANTRAM50" value={couponForm.code} onChange={e => setCouponForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all font-mono font-bold" required />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Discount Type</label>
                                        <select value={couponForm.discountType} onChange={e => setCouponForm(f => ({ ...f, discountType: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none cursor-pointer focus:border-[var(--sys-border)]">
                                            <option value="credits">Bonus Credits</option>
                                            <option value="percentage">% Percentage Discount</option>
                                            <option value="fixed">Fixed ₹ Amount Off</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Value</label>
                                        <input type="number" placeholder="Enter number..." value={couponForm.discountValue} onChange={e => setCouponForm(f => ({ ...f, discountValue: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all font-bold" required />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Total Max Uses (0=∞)</label>
                                        <input type="number" placeholder="Global limit" value={couponForm.maxUses} onChange={e => setCouponForm(f => ({ ...f, maxUses: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Max Uses Per User</label>
                                        <input type="number" value={couponForm.maxUsesPerUser} onChange={e => setCouponForm(f => ({ ...f, maxUsesPerUser: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Min Order Value (₹)</label>
                                        <input type="number" value={couponForm.minPurchase} onChange={e => setCouponForm(f => ({ ...f, minPurchase: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Expiry Date</label>
                                        <input type="date" value={couponForm.validUntil} onChange={e => setCouponForm(f => ({ ...f, validUntil: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-2 block ml-1">Internal Description</label>
                                        <input type="text" placeholder="Why is this coupon being created?" value={couponForm.description} onChange={e => setCouponForm(f => ({ ...f, description: e.target.value }))} className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all" />
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <label className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-3 block ml-1">Targeting: Applicable Plans & Packs (None = All)</label>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-4 bg-[var(--sys-surface)] rounded-2xl border border-[var(--sys-border)]">
                                        {/* Packages */}
                                        {packages.map(p => (
                                            <div key={p.slug} onClick={() => setCouponForm(f => ({ ...f, applicablePlans: f.applicablePlans.includes(p.slug) ? f.applicablePlans.filter(x => x !== p.slug) : [...f.applicablePlans, p.slug] }))} 
                                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border ${couponForm.applicablePlans.includes(p.slug) ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-surface)] border-transparent text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)]'}`}>
                                                <span className="material-symbols-outlined text-xs">{couponForm.applicablePlans.includes(p.slug) ? 'check_box' : 'check_box_outline_blank'}</span>
                                                <span className="text-[10px] font-bold uppercase truncate">{p.name} (Sub)</span>
                                            </div>
                                        ))}
                                        {/* Credit Packs */}
                                        {creditPacksList.map(p => (
                                            <div key={p.slug} onClick={() => setCouponForm(f => ({ ...f, applicablePlans: f.applicablePlans.includes(p.slug) ? f.applicablePlans.filter(x => x !== p.slug) : [...f.applicablePlans, p.slug] }))} 
                                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border ${couponForm.applicablePlans.includes(p.slug) ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-surface)] border-transparent text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)]'}`}>
                                                <span className="material-symbols-outlined text-xs">{couponForm.applicablePlans.includes(p.slug) ? 'check_box' : 'check_box_outline_blank'}</span>
                                                <span className="text-[10px] font-bold uppercase truncate">{p.name} (Pack)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-end gap-3 pt-6 border-t border-[var(--sys-border)]">
                                    <button type="button" onClick={() => setShowCouponForm(false)} className="px-6 py-2.5 rounded-xl text-xs font-black text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer">Discard</button>
                                    <button type="submit" className="px-8 py-2.5 rounded-xl bg-[var(--sys-surface)] text-black font-black text-xs hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer">Create Coupon</button>
                                </div>
                            </form>
                        )}

                        <div className="space-y-3">
                            {coupons.length === 0 ? (
                                <div className="text-center py-20 glass-panel rounded-3xl border border-dashed border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-6xl text-slate-800 mb-4 scale-125 block">confirmation_number</span>
                                    <h3 className="text-xl font-black text-[var(--sys-text)] mb-2">No Active Campaigns</h3>
                                    <p className="text-[var(--sys-text-muted)] max-w-sm mx-auto text-sm">Create your first coupon code to start driving conversions and rewarding users.</p>
                                </div>
                            ) : coupons.map(c => {
                                const isExpired = c.validUntil && new Date(c.validUntil) < new Date();
                                const usagePct = c.maxUses > 0 ? (c.usedCount / c.maxUses) * 100 : 0;
                                
                                return (
                                    <div key={c._id} className={`glass-panel rounded-2xl p-5 border transition-all duration-500 hover:shadow-xl hover:shadow-none ${!c.isActive ? 'opacity-40 grayscale-[0.5]' : isExpired ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)]'}`}>
                                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                            <div className="flex items-center gap-4 flex-1">
                                                <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center border ${c.discountType === 'credits' ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'}`}>
                                                    <p className="text-xs font-black uppercase tracking-tighter leading-none mb-0.5">{c.discountType === 'credits' ? 'Cr' : c.discountType === 'percentage' ? '%' : '₹'}</p>
                                                    <p className="text-lg font-black leading-none">{c.discountValue}</p>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <p className="text-xl font-black text-[var(--sys-text)] font-mono tracking-wider">{c.code}</p>
                                                        <div className="flex gap-1.5">
                                                            <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest ${!c.isActive ? 'bg-[var(--sys-border)]/20 text-[var(--sys-text-muted)]' : isExpired ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                                {!c.isActive ? 'Paused' : isExpired ? 'Expired' : 'Active'}
                                                            </span>
                                                            {c.applicablePlans?.length > 0 && (
                                                                <span className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest bg-[#FF4D00]/20 text-[#FF4D00] border border-[#FF4D00]/20">
                                                                    Targeted ({c.applicablePlans.length})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <p className="text-xs text-[var(--sys-text-muted)] flex items-center gap-1.5 line-clamp-1">
                                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                                        {c.description || 'No description provided'} 
                                                        {c.validUntil && <span className="text-[var(--sys-text-muted)]">• Expires {new Date(c.validUntil).toLocaleDateString()}</span>}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-8 pl-18 lg:pl-0">
                                                <div className="w-32">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <p className="text-[10px] font-black text-[var(--sys-text-muted)] uppercase tracking-tighter">Usage</p>
                                                        <p className="text-[10px] font-black text-[var(--sys-text)] uppercase tracking-tighter">{c.usedCount}{c.maxUses > 0 ? ` / ${c.maxUses}` : ''}</p>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-[var(--sys-surface)] rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full transition-all duration-1000 ${usagePct > 90 ? 'bg-[var(--sys-surface)]' : usagePct > 50 ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`} style={{ width: `${c.maxUses > 0 ? Math.min(100, usagePct) : Math.min(100, (c.usedCount / 100) * 100)}%` }} />
                                                    </div>
                                                </div>

                                                <div className="flex gap-1.5">
                                                    <button onClick={() => handleToggleCoupon(c._id, c.isActive)} className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${c.isActive ? 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]' : 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]'}`} title={c.isActive ? 'Pause' : 'Activate'}>
                                                        <span className="material-symbols-outlined text-lg">{c.isActive ? 'pause' : 'play_arrow'}</span>
                                                    </button>
                                                    <button onClick={() => handleDeleteCoupon(c._id)} className="w-9 h-9 flex items-center justify-center rounded-xl bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer" title="Delete">
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Targeting Tooltip-style info */}
                                        {c.applicablePlans?.length > 0 && (
                                            <div className="mt-4 pt-4 border-t border-[var(--sys-border)] flex flex-wrap gap-2">
                                                <span className="text-[9px] font-black text-slate-700 uppercase pt-0.5">Applies to:</span>
                                                {c.applicablePlans.map(slug => (
                                                    <span key={slug} className="text-[9px] font-bold px-2 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)]">{slug}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ════════════ RETENTION OFFERS ════════════ */}
                {tab === 'retentionOffers' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">favorite</span>
                                    Retention Offers
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Manage automated discount flows to reduce churn</p>
                            </div>
                            <button onClick={() => { setEditingRetention(null); setRetentionForm({ name: '', description: '', triggerCondition: 'churn_risk', discountType: 'percentage', discountValue: 0, bonusCredits: 0, validForDays: 30, maxUses: 0, isActive: true }); setShowRetentionForm(true) }}
                                className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-slate-950 text-xs font-black uppercase tracking-wider hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer">
                                + New Offer
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                            {retentionOffers.map(o => (
                                <div key={o._id} className={`glass-panel rounded-2xl overflow-hidden border transition-all ${o.isActive ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)] opacity-60'}`}>
                                    <div className="p-4 border-b border-[var(--sys-border)]" style={{ background: `var(--sys-primary-dim)` }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-black text-primary uppercase tracking-wider">{o.name}</h4>
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${o.isActive ? 'bg-[var(--sys-surface)] text-primary' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'}`}>{o.isActive ? 'Active' : 'Inactive'}</span>
                                        </div>
                                        <p className="text-2xl font-black text-[var(--sys-text)]">
                                            {o.discountType === 'percentage' ? `${o.discountValue}% OFF` : `₹${o.discountValue} OFF`}
                                        </p>
                                        {o.bonusCredits > 0 && <p className="text-xs font-bold text-[var(--sys-text-muted)] mt-1">+ {o.bonusCredits} Bonus Credits</p>}
                                    </div>
                                    <div className="p-4 space-y-2">
                                        <div className="flex justify-between"><span className="text-[10px] uppercase font-bold text-[var(--sys-text-muted)]">Condition</span><span className="text-xs font-bold text-[var(--sys-text)]">{o.triggerCondition}</span></div>
                                        <div className="flex justify-between"><span className="text-[10px] uppercase font-bold text-[var(--sys-text-muted)]">Validity</span><span className="text-xs font-bold text-[var(--sys-text)]">{o.validForDays} Days</span></div>
                                        <div className="flex justify-between"><span className="text-[10px] uppercase font-bold text-[var(--sys-text-muted)]">Used</span><span className="text-xs font-bold text-[var(--sys-text)]">{o.usedCount} {o.maxUses > 0 ? `/ ${o.maxUses}` : ''}</span></div>
                                        <p className="text-xs text-[var(--sys-text-muted)] mt-2 italic">{o.description}</p>
                                    </div>
                                    <div className="p-3 border-t border-[var(--sys-border)] flex gap-2">
                                        <button onClick={() => { setEditingRetention(o); setRetentionForm(o); setShowRetentionForm(true); }} className="flex-1 py-1.5 rounded-lg bg-[var(--sys-surface)] text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">Edit</button>
                                        <button onClick={() => handleToggleRetentionOffer(o._id, o.isActive)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer"><span className="material-symbols-outlined text-lg">{o.isActive ? 'pause' : 'play_arrow'}</span></button>
                                        <button onClick={() => handleDeleteRetentionOffer(o._id)} className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary transition-all cursor-pointer"><span className="material-symbols-outlined text-lg">delete</span></button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {showRetentionForm && (
                            <div className="fixed inset-0 bg-[var(--sys-surface)] flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowRetentionForm(false)}>
                                <div className="bg-[#08080C] border border-[var(--sys-border)] rounded-2xl w-full max-w-lg p-5 shadow-2xl">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider">{editingRetention ? 'Edit Retention Offer' : 'New Retention Offer'}</h4>
                                        <button onClick={() => setShowRetentionForm(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <form onSubmit={handleSaveRetentionOffer} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Name *</label><input required value={retentionForm.name} onChange={e => setRetentionForm({ ...retentionForm, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Trigger *</label>
                                                <select value={retentionForm.triggerCondition} onChange={e => setRetentionForm({ ...retentionForm, triggerCondition: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none">
                                                    <option value="churn_risk">Churn Risk (Cancellation Flow)</option>
                                                    <option value="abandoned_cart">Abandoned Cart</option>
                                                    <option value="inactive_30d">Inactive (30 Days)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Type *</label>
                                                <select value={retentionForm.discountType} onChange={e => setRetentionForm({ ...retentionForm, discountType: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none">
                                                    <option value="percentage">Percentage (%)</option>
                                                    <option value="fixed">Fixed Rate (₹)</option>
                                                </select>
                                            </div>
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Value *</label><input type="number" required value={retentionForm.discountValue} onChange={e => setRetentionForm({ ...retentionForm, discountValue: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Bonus Credits</label><input type="number" value={retentionForm.bonusCredits} onChange={e => setRetentionForm({ ...retentionForm, bonusCredits: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Valid Days</label><input type="number" required value={retentionForm.validForDays} onChange={e => setRetentionForm({ ...retentionForm, validForDays: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                            <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Max Uses</label><input type="number" value={retentionForm.maxUses} onChange={e => setRetentionForm({ ...retentionForm, maxUses: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                        </div>
                                        <div><label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Description</label><input value={retentionForm.description} onChange={e => setRetentionForm({ ...retentionForm, description: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm outline-none" /></div>
                                        <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={retentionForm.isActive} onChange={e => setRetentionForm({ ...retentionForm, isActive: e.target.checked })} className="accent-primary" /><span className="text-xs text-[var(--sys-text-muted)]">Active</span></label>
                                        <div className="flex gap-3 pt-2">
                                            <button type="button" onClick={() => setShowRetentionForm(false)} className="flex-1 py-3 bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-black uppercase tracking-wider rounded-xl border border-[var(--sys-border)]">Cancel</button>
                                            <button type="submit" className="flex-1 py-3 bg-[var(--sys-surface)] text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl">{editingRetention ? 'Save Changes' : 'Create Offer'}</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ STORE CONFIG ════════════ */}
                {tab === 'storeConfig' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">storefront</span>
                                    Store Configuration
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Manage global visibility and dynamic credit costs</p>
                            </div>
                        </div>

                        {/* Store Visibility */}
                        <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                            <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary text-lg">visibility</span>
                                Store Visibility
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-[var(--sys-surface)] p-4 rounded-xl border border-[var(--sys-border)]">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-[var(--sys-text)]">Subscription Plans</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Show subscription tiers on the billing page</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={systemSettings?.show_subscription_plans ?? true} onChange={(e) => handleToggleSetting('show_subscription_plans', e.target.checked)} />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>
                                </div>
                                <div className="bg-[var(--sys-surface)] p-4 rounded-xl border border-[var(--sys-border)]">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-[var(--sys-text)]">Credit Packs</p>
                                            <p className="text-xs text-[var(--sys-text-muted)] mt-1">Allow users to purchase top-up credits</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" checked={systemSettings?.show_credit_packs ?? true} onChange={(e) => handleToggleSetting('show_credit_packs', e.target.checked)} />
                                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Credit Costs */}
                        <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary text-lg">monetization_on</span>
                                    Dynamic Credit Costs
                                </h4>
                                <div className="flex gap-2">
                                    {editingCosts ? (
                                        <>
                                            <button onClick={() => setEditingCosts(null)} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold hover:bg-[var(--sys-surface)] transition-all border border-[var(--sys-border)] cursor-pointer">Cancel</button>
                                            <button onClick={async () => { try { await API.updateSystemSettings({ creditCosts: editingCosts }); setCreditCosts(editingCosts); setEditingCosts(null); showToast('Costs updated'); } catch { showToast('Failed', 'error'); } }} className="px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-xs font-bold transition-all cursor-pointer">Save Costs</button>
                                        </>
                                    ) : (
                                        <button onClick={() => setEditingCosts({ ...creditCosts })} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-bold hover:bg-[var(--sys-surface)] transition-all border border-[var(--sys-border)] cursor-pointer">Edit Costs</button>
                                    )}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                {Object.entries(editingCosts || creditCosts || {}).map(([key, value]) => {
                                    if (value === 'dynamic') return null;
                                    return (
                                        <div key={key} className={`p-3 rounded-xl border ${editingCosts ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]' : 'border-transparent bg-[var(--sys-surface)]'}`}>
                                            <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase truncate mb-1" title={key}>{key}</p>
                                            {editingCosts ? (
                                                <input type="number" min="0" value={value} onChange={e => setEditingCosts({ ...editingCosts, [key]: Number(e.target.value) })} className="w-full bg-transparent text-sm font-black text-[var(--sys-text)] outline-none" />
                                            ) : (
                                                <p className="text-sm font-black text-[var(--sys-text)]">{value} <span className="text-[10px] font-normal text-[var(--sys-text-muted)]">cr</span></p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ════════════ CONTENT & BRANDS ════════════ */}
                {tab === 'content' && (
                    <div>
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-[#FF4D00]">branding_watermark</span>{totalBrands} Brands</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">{brands.map(b => (
                            <div key={b._id} className="glass-panel rounded-2xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-[#FF4D00]/20 flex items-center justify-center text-[#FF4D00] text-xs font-bold">{b.name?.[0]?.toUpperCase()}</div>
                                        <div><p className="text-base font-bold text-[var(--sys-text)]">{b.name}</p><p className="text-xs text-[var(--sys-text-muted)]">{b.user?.name} • {b.user?.email}</p></div>
                                    </div>
                                    <button onClick={() => handleDeleteBrand(b, b.name)} className="p-1.5 rounded-lg hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
                                </div>
                                <div className="flex gap-3 text-center">
                                    <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]"><p className="text-base font-bold text-[var(--sys-text)]">{b.contentCount}</p><p className="text-xs text-[var(--sys-text-muted)]">Content</p></div>
                                    <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]"><p className="text-base font-bold text-[var(--sys-text)]">{b.creativeCount}</p><p className="text-xs text-[var(--sys-text-muted)]">Creatives</p></div>
                                    <div className="flex-1 p-2 rounded-lg bg-[var(--sys-surface)]"><p className="text-base font-bold text-[var(--sys-text)]">{b.productCount}</p><p className="text-xs text-[var(--sys-text-muted)]">Products</p></div>
                                </div>
                            </div>
                        ))}</div>
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-primary">article</span>{totalContent} Content Pieces</h3>
                        <div className="space-y-2">{content.map(c => (
                            <div key={c._id} className="glass-panel rounded-2xl p-3 flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold capitalize ${c.status === 'published' ? 'bg-[var(--sys-primary-dim)] text-primary' : c.status === 'approved' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : 'bg-[var(--sys-border)]/15 text-[var(--sys-text-muted)]'}`}>{c.status}</span>
                                    <p className="text-sm text-[var(--sys-text)] truncate max-w-[300px]">{c.title || c.prompt?.slice(0, 60) || 'Untitled'}</p>
                                    <span className="text-xs text-[var(--sys-text-muted)] capitalize">{c.type}</span>
                                    <span className="text-xs text-slate-700">{c.brand?.name}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-[var(--sys-text-muted)]">{c.user?.name}</span>
                                    <span className="text-xs text-slate-700">{new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                    <button onClick={() => handleDeleteContent(c)} className="p-1.5 rounded-lg hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer"><span className="material-symbols-outlined text-sm">delete</span></button>
                                </div>
                            </div>
                        ))}</div>
                    </div>
                )}

                {/* ════════════ AI & SYSTEM ════════════ */}
                {tab === 'ai' && (
                    <div>
                        {/* AI Providers */}
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-primary">smart_toy</span>AI Providers</h3>
                        {aiHealth && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">{Object.entries(aiHealth.providers || {}).map(([p, active]) => (
                                <div key={p} className={`glass-panel rounded-2xl p-5 ${active ? 'border border-[var(--sys-border)]' : 'border border-[var(--sys-border)] opacity-60'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-base font-bold text-[var(--sys-text)] capitalize">{p}</p>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${active ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>{active ? 'ACTIVE' : 'NO KEY'}</span>
                                    </div>
                                    {aiHealth.providerUsage?.find(u => u._id === p) && (
                                        <div><p className="text-sm text-[var(--sys-text-muted)]">{aiHealth.providerUsage.find(u => u._id === p).count} generations</p>
                                            <p className="text-sm text-[var(--sys-text-muted)]">Sentiment: {aiHealth.providerUsage.find(u => u._id === p).avgSentiment?.toFixed(2)}</p></div>
                                    )}
                                </div>
                            ))}</div>
                        )}

                        {/* Feedback Breakdown */}
                        {aiHealth?.recentFeedback?.length > 0 && (
                            <div className="glass-panel rounded-2xl p-5 mb-6">
                                <h4 className="font-bold text-[var(--sys-text)] text-sm mb-3">Feedback (Last 24h)</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{aiHealth.recentFeedback.map(f => (
                                    <div key={f._id} className="p-3 rounded-xl bg-[var(--sys-surface)] text-center">
                                        <p className="text-lg font-bold text-[var(--sys-text)]">{f.count}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)] capitalize">{f._id?.replace('_', ' ')}</p>
                                        <p className={`text-xs font-bold ${f.avgSentiment > 0 ? 'text-primary' : f.avgSentiment < 0 ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{f.avgSentiment?.toFixed(2)}</p>
                                    </div>
                                ))}</div>
                            </div>
                        )}

                        {/* ═══ LLM Provider Management — Global API Switcher ═══ */}
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-2 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">psychology</span>
                            LLM & Text Provider Management
                            <span className="text-[9px] font-black text-primary bg-[var(--sys-primary-dim)] px-2 py-0.5 rounded-full uppercase tracking-wider">Global API Switcher</span>
                        </h3>
                        <p className="text-[11px] text-[var(--sys-text-muted)] mb-5">Switch active text providers, manage LLM API keys for Grok, Gemini, OpenAI, Claude, and Sarvam. System respects this globally.</p>

                        {llmProviders && llmProviders.length > 0 ? (() => {
                            const catColors = { premium: 'amber', balanced: 'violet', fast: 'emerald', specialized: 'cyan', experimental: 'rose' };
                            const grouped = {};
                            llmProviders.forEach(m => { const cat = m.category || 'experimental'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(m); });
                            const catOrder = ['premium', 'balanced', 'fast', 'specialized', 'experimental'];
                            return (
                                <div className="space-y-6 mb-8">
                                    {catOrder.filter(c => grouped[c]).map(cat => {
                                        const catInfo = llmCategories[cat] || { label: cat, color: catColors[cat] || 'slate', icon: 'psychology' };
                                        const color = catColors[cat] || 'slate';
                                        return (
                                            <div key={cat}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className={`material-symbols-outlined text-${color}-400 text-sm`}>{catInfo.icon}</span>
                                                    <span className={`text-xs font-black uppercase tracking-wider text-${color}-400`}>{catInfo.label}</span>
                                                    <div className={`flex-1 h-px bg-${color}-500/10`} />
                                                </div>
                                                <div className="space-y-3">
                                                    {grouped[cat].map(model => (
                                                        <div key={model.id} className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <span className={`material-symbols-outlined text-${color}-400`}>{model.icon || 'psychology'}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-sm font-bold text-[var(--sys-text)]">{model.name}</h4>
                                                                    <p className="text-[10px] text-[var(--sys-text-muted)]">
                                                                        Active: <span className={`text-${color}-400 font-bold`}>{model.providers.find(p => p.isActive)?.name || '—'}</span>
                                                                        {model.lastSwitched && <span className="ml-2 text-[var(--sys-text-muted)]">· switched {new Date(model.lastSwitched).toLocaleDateString()}</span>}
                                                                    </p>
                                                                </div>
                                                                <button onClick={() => setAddLlmProviderForm({ modelId: model.id, modelName: model.name, providerId: '', providerName: '', costPerSecond: 0, description: '' })} className="h-8 w-8 rounded-xl bg-[var(--sys-surface)] hover:bg-[var(--sys-surface)] flex items-center justify-center transition-colors">
                                                                    <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">add</span>
                                                                </button>
                                                            </div>
                                                            <div className="space-y-1.5 border-t border-[var(--sys-border)] pt-3">
                                                                {model.providers.map(p => (
                                                                    <div key={p.id} className={`group flex items-center p-2.5 rounded-xl border transition-all ${p.isActive ? `bg-${color}-500/5 border-${color}-500/20` : 'bg-transparent border-transparent hover:bg-[var(--sys-surface)]'}`}>
                                                                        <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0 mb-0">
                                                                            <input type="radio" name={`llm-${model.id}`} checked={p.isActive} onChange={() => handleSwitchLlmProvider(model.id, p.id)} disabled={switchingLlmProvider} className="hidden" />
                                                                            <div className={`w-4 h-4 rounded-full border flex flex-shrink-0 items-center justify-center transition-colors ${p.isActive ? `bg-${color}-500 border-${color}-500` : 'border-[var(--sys-border)] bg-black'}`}>
                                                                                {p.isActive && <div className="w-1.5 h-1.5 rounded-full bg-black shadow-sm" />}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className={`text-xs font-bold ${p.isActive ? 'text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)]'}`}>{p.name}</span>
                                                                                    {p.builtIn && <span className="text-[9px] bg-[var(--sys-surface)] text-[var(--sys-text-muted)] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">built-in</span>}
                                                                                    {!p.hasKey && <span className="text-[9px] bg-[var(--sys-primary-dim)] text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider animate-pulse flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">key_off</span> Missing Key</span>}
                                                                                    {switchingLlmProvider === `${model.id}-${p.id}` && <span className="material-symbols-outlined text-xs animate-spin text-[var(--sys-text-muted)]">progress_activity</span>}
                                                                                </div>
                                                                                {p.description && <p className="text-[10px] text-[var(--sys-text-muted)] truncate mt-0.5" title={p.description}>{p.description}</p>}
                                                                            </div>
                                                                        </label>
                                                                        
                                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button onClick={() => setEditLlmProviderData({ modelId: model.id, providerId: p.id, providerName: p.name, envKey: p.envKey, costPerSecond: p.costPerSecond, description: p.description })} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]" title="Edit Provider">
                                                                                <span className="material-symbols-outlined text-[14px]">edit</span>
                                                                            </button>
                                                                            {!p.builtIn && (
                                                                                <button onClick={() => handleRemoveLlmProvider(model.id, p.id)} disabled={p.isActive} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text-muted)] hover:text-primary disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--sys-text-muted)]" title={p.isActive ? "Cannot remove active provider" : "Remove Provider"}>
                                                                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })() : (
                            <div className="animate-pulse space-y-4 mb-8">
                                <div className="h-32 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl w-full" />
                                <div className="h-32 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl w-full" />
                            </div>
                        )}

                        {/* ═══ Video Provider Management — Global API Switcher ═══ */}
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-2 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#FF4D00]">movie_filter</span>
                            Video Provider Management
                            <span className="text-[9px] font-black text-[#FF4D00] bg-[#FF4D00]/10 px-2 py-0.5 rounded-full uppercase tracking-wider">Global API Switcher</span>
                        </h3>
                        <p className="text-[11px] text-[var(--sys-text-muted)] mb-5">Switch active providers, add new APIs, or remove unused ones for any video model. Changes take effect immediately.</p>

                        {videoProviders && videoProviders.length > 0 ? (() => {
                            // Group models by category
                            const catColors = { cinematic: 'violet', motion: 'cyan', fast: 'emerald', budget: 'amber', experimental: 'rose' };
                            const grouped = {};
                            videoProviders.forEach(m => { const cat = m.category || 'experimental'; if (!grouped[cat]) grouped[cat] = []; grouped[cat].push(m); });
                            const catOrder = ['cinematic', 'motion', 'fast', 'budget', 'experimental'];
                            return (
                                <div className="space-y-6 mb-8">
                                    {catOrder.filter(c => grouped[c]).map(cat => {
                                        const catInfo = videoCategories[cat] || { label: cat, color: catColors[cat] || 'slate', icon: 'movie' };
                                        const color = catColors[cat] || 'slate';
                                        return (
                                            <div key={cat}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className={`material-symbols-outlined text-${color}-400 text-sm`}>{catInfo.icon}</span>
                                                    <span className={`text-xs font-black uppercase tracking-wider text-${color}-400`}>{catInfo.label}</span>
                                                    <div className={`flex-1 h-px bg-${color}-500/10`} />
                                                </div>
                                                <div className="space-y-3">
                                                    {grouped[cat].map(model => (
                                                        <div key={model.id} className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <span className={`material-symbols-outlined text-${color}-400`}>{model.icon || 'movie'}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-sm font-bold text-[var(--sys-text)]">{model.name}</h4>
                                                                    <p className="text-[10px] text-[var(--sys-text-muted)]">
                                                                        Active: <span className={`text-${color}-400 font-bold`}>{model.providers.find(p => p.isActive)?.name || '—'}</span>
                                                                        {model.lastSwitched && <span className="ml-2 text-[var(--sys-text-muted)]">· switched {new Date(model.lastSwitched).toLocaleDateString()}</span>}
                                                                    </p>
                                                                </div>
                                                                {model.multiProvider && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-black uppercase">Multi-Provider</span>}
                                                                {!model.multiProvider && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)] font-black uppercase">Single</span>}
                                                                <button onClick={() => setAddProviderForm({ modelId: model.id, providerId: '', providerName: '', envKey: '', costPerSecond: '', description: '' })}
                                                                    className="text-[10px] px-2 py-1 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[#FF4D00] hover:bg-[#FF4D00]/10 transition-all cursor-pointer flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[12px]">add</span>Add Provider
                                                                </button>
                                                            </div>

                                                            {/* Provider cards */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                {model.providers.map(provider => {
                                                                    const isSwitching = switchingProvider === `${model.id}-${provider.id}`;
                                                                    return (
                                                                        <div key={provider.id}
                                                                            className={`relative p-3 rounded-xl border transition-all group ${
                                                                                provider.isActive
                                                                                    ? `border-${color}-500/40 bg-${color}-500/5`
                                                                                    : provider.hasKey
                                                                                        ? `border-[var(--sys-border)] hover:border-${color}-500/20 cursor-pointer hover:bg-[var(--sys-surface)]`
                                                                                        : 'border-[var(--sys-border)] opacity-50'
                                                                            }`}
                                                                        >
                                                                            {/* Top row: radio + name + actions */}
                                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                                <div onClick={() => !provider.isActive && provider.hasKey && !isSwitching && handleSwitchVideoProvider(model.id, provider.id)}
                                                                                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                                                                        provider.isActive ? `border-${color}-500` : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'
                                                                                    }`}>
                                                                                    {provider.isActive && <div className={`w-1.5 h-1.5 rounded-full bg-${color}-500`} />}
                                                                                    {isSwitching && <span className="material-symbols-outlined text-[8px] animate-spin text-[#FF4D00]">progress_activity</span>}
                                                                                </div>
                                                                                <span className="text-[11px] font-bold text-[var(--sys-text)] flex-1">{provider.name}</span>
                                                                                {provider.isActive && <span className={`text-[7px] px-1 py-0.5 rounded bg-${color}-500/20 text-${color}-400 font-black uppercase`}>Active</span>}
                                                                                {/* Action buttons (visible on hover) */}
                                                                                <div className="hidden group-hover:flex items-center gap-1">
                                                                                    <button onClick={(e) => { e.stopPropagation(); setEditProviderData({ modelId: model.id, providerId: provider.id, name: provider.name, costPerSecond: provider.costPerSecond, description: provider.description }) }}
                                                                                        className="text-[10px] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer" title="Edit">
                                                                                        <span className="material-symbols-outlined text-[12px]">edit</span>
                                                                                    </button>
                                                                                    {!provider.isActive && (
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveVideoProvider(model.id, provider.id) }}
                                                                                            className="text-[10px] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer" title="Remove">
                                                                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {/* Description + cost */}
                                                                            <p className="text-[9px] text-[var(--sys-text-muted)] mb-1.5 leading-relaxed line-clamp-2">{provider.description}</p>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="text-[9px] font-bold text-[var(--sys-text-muted)]">${provider.costPerSecond}/s</span>
                                                                                <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${provider.hasKey ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                                                    {provider.hasKey ? `✓ ${provider.keySource}` : '✗ No Key'}
                                                                                </span>
                                                                                {!provider.builtIn && <span className="text-[7px] px-1 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-black uppercase">Custom</span>}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Add Provider inline form */}
                                                            {addProviderForm?.modelId === model.id && (
                                                                <div className="mt-3 p-4 rounded-xl border border-[#FF4D00]/20 bg-[#FF4D00]/[0.03]">
                                                                    <h5 className="text-[11px] font-bold text-[#FF4D00] mb-3 flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[13px]">add_circle</span>Add New Provider to {model.name}
                                                                    </h5>
                                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                                        <input placeholder="Provider ID (e.g., replicate)" value={addProviderForm.providerId}
                                                                            onChange={e => setAddProviderForm(f => ({ ...f, providerId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[#FF4D00]/40 outline-none" />
                                                                        <input placeholder="Provider Name (e.g., Replicate)" value={addProviderForm.providerName}
                                                                            onChange={e => setAddProviderForm(f => ({ ...f, providerName: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[#FF4D00]/40 outline-none" />
                                                                        <input placeholder="Env Key (e.g., REPLICATE_API_KEY)" value={addProviderForm.envKey}
                                                                            onChange={e => setAddProviderForm(f => ({ ...f, envKey: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[#FF4D00]/40 outline-none" />
                                                                        <input placeholder="Cost/sec (e.g., 0.10)" value={addProviderForm.costPerSecond} type="number" step="0.01"
                                                                            onChange={e => setAddProviderForm(f => ({ ...f, costPerSecond: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[#FF4D00]/40 outline-none" />
                                                                    </div>
                                                                    <input placeholder="Description (optional)" value={addProviderForm.description}
                                                                        onChange={e => setAddProviderForm(f => ({ ...f, description: e.target.value }))}
                                                                        className="w-full px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[#FF4D00]/40 outline-none mb-3" />
                                                                    <div className="flex gap-2">
                                                                        <button onClick={handleAddVideoProvider}
                                                                            className="px-3 py-1.5 rounded-lg bg-[#FF4D00]/20 text-[#FF4D00] text-[11px] font-bold hover:bg-[#FF4D00]/30 cursor-pointer transition-all">
                                                                            Add Provider
                                                                        </button>
                                                                        <button onClick={() => setAddProviderForm(null)}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-[11px] hover:text-[var(--sys-text)] cursor-pointer transition-all">
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <p className="text-[10px] text-[var(--sys-text-muted)] italic">Click the radio button to switch providers. Hover over a provider card to edit or remove. Add custom providers with the + button.</p>
                                </div>
                            );
                        })() : (
                            <div className="glass-panel rounded-2xl p-6 mb-8 text-center text-[var(--sys-text-muted)] text-sm">
                                <span className="material-symbols-outlined text-2xl mb-2 block text-[var(--sys-text-muted)]">movie_filter</span>
                                Loading video providers...
                            </div>
                        )}

                        {/* Edit Provider Modal */}
                        {editProviderData && (
                            <div className="fixed inset-0 bg-[var(--sys-surface)] z-50 flex items-center justify-center" onClick={() => setEditProviderData(null)}>
                                <div className="glass-panel border border-[var(--sys-border)] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                                    <h4 className="text-base font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">edit</span>
                                        Edit Provider: {editProviderData.name}
                                    </h4>
                                    <div className="space-y-3 mb-5">
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Display Name</label>
                                            <input value={editProviderData.name || ''} onChange={e => setEditProviderData(d => ({ ...d, name: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Cost Per Second ($)</label>
                                            <input value={editProviderData.costPerSecond || ''} type="number" step="0.01"
                                                onChange={e => setEditProviderData(d => ({ ...d, costPerSecond: parseFloat(e.target.value) || 0 }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Description</label>
                                            <input value={editProviderData.description || ''} onChange={e => setEditProviderData(d => ({ ...d, description: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleEditVideoProvider}
                                            className="px-4 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-sm font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all flex-1">
                                            Save Changes
                                        </button>
                                        <button onClick={() => setEditProviderData(null)}
                                            className="px-4 py-2 rounded-xl bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-sm hover:text-[var(--sys-text)] cursor-pointer transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ Image Provider Management — Global API Switcher ═══ */}
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-2 flex items-center gap-2 mt-8">
                            <span className="material-symbols-outlined text-primary">image</span>
                            Image Provider Management
                            <span className="text-[9px] font-black text-primary bg-[var(--sys-primary-dim)] px-2 py-0.5 rounded-full uppercase tracking-wider">Global API Switcher</span>
                        </h3>
                        <p className="text-[11px] text-[var(--sys-text-muted)] mb-5">Switch active providers, add new APIs, or remove unused ones for any image model. Changes take effect immediately.</p>

                        {imageProviders && imageProviders.length > 0 ? (() => {
                            const imgCatColors = { multimodal: 'cyan', 'text-to-image': 'violet', premium: 'amber' };
                            const imgGrouped = {};
                            imageProviders.forEach(m => { const cat = m.category || 'text-to-image'; if (!imgGrouped[cat]) imgGrouped[cat] = []; imgGrouped[cat].push(m); });
                            const imgCatOrder = ['multimodal', 'text-to-image', 'premium'];
                            return (
                                <div className="space-y-6 mb-8">
                                    {imgCatOrder.filter(c => imgGrouped[c]).map(cat => {
                                        const catInfo = imageCategories[cat] || { label: cat, color: imgCatColors[cat] || 'slate', icon: 'image' };
                                        const color = imgCatColors[cat] || 'slate';
                                        return (
                                            <div key={cat}>
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className={`material-symbols-outlined text-${color}-400 text-sm`}>{catInfo.icon}</span>
                                                    <span className={`text-xs font-black uppercase tracking-wider text-${color}-400`}>{catInfo.label}</span>
                                                    <div className={`flex-1 h-px bg-${color}-500/10`} />
                                                </div>
                                                <div className="space-y-3">
                                                    {imgGrouped[cat].map(model => (
                                                        <div key={model.id} className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <span className={`material-symbols-outlined text-${color}-400`}>{model.icon || 'image'}</span>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="text-sm font-bold text-[var(--sys-text)]">{model.name}</h4>
                                                                    <p className="text-[10px] text-[var(--sys-text-muted)]">
                                                                        Active: <span className={`text-${color}-400 font-bold`}>{model.providers.find(p => p.isActive)?.name || '—'}</span>
                                                                        {model.lastSwitched && <span className="ml-2 text-[var(--sys-text-muted)]">· switched {new Date(model.lastSwitched).toLocaleDateString()}</span>}
                                                                    </p>
                                                                </div>
                                                                {model.multiProvider && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-black uppercase">Multi-Provider</span>}
                                                                {!model.multiProvider && <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-border)]/10 text-[var(--sys-text-muted)] font-black uppercase">Single</span>}
                                                                <button onClick={() => setAddImageProviderForm({ modelId: model.id, providerId: '', providerName: '', envKey: '', costPerImage: '', description: '' })}
                                                                    className="text-[10px] px-2 py-1 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[12px]">add</span>Add Provider
                                                                </button>
                                                            </div>

                                                            {/* Provider cards */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                {model.providers.map(provider => {
                                                                    const isSwitching = switchingImageProvider === `${model.id}-${provider.id}`;
                                                                    return (
                                                                        <div key={provider.id}
                                                                            className={`relative p-3 rounded-xl border transition-all group ${
                                                                                provider.isActive
                                                                                    ? `border-${color}-500/40 bg-${color}-500/5`
                                                                                    : provider.hasKey
                                                                                        ? `border-[var(--sys-border)] hover:border-${color}-500/20 cursor-pointer hover:bg-[var(--sys-surface)]`
                                                                                        : 'border-[var(--sys-border)] opacity-50'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                                <div onClick={() => !provider.isActive && provider.hasKey && !isSwitching && handleSwitchImageProvider(model.id, provider.id)}
                                                                                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                                                                        provider.isActive ? `border-${color}-500` : 'border-[var(--sys-border)] hover:border-[var(--sys-border)]'
                                                                                    }`}>
                                                                                    {provider.isActive && <div className={`w-1.5 h-1.5 rounded-full bg-${color}-500`} />}
                                                                                    {isSwitching && <span className="material-symbols-outlined text-[8px] animate-spin text-primary">progress_activity</span>}
                                                                                </div>
                                                                                <span className="text-[11px] font-bold text-[var(--sys-text)] flex-1">{provider.name}</span>
                                                                                {provider.isActive && <span className={`text-[7px] px-1 py-0.5 rounded bg-${color}-500/20 text-${color}-400 font-black uppercase`}>Active</span>}
                                                                                <div className="hidden group-hover:flex items-center gap-1">
                                                                                    <button onClick={(e) => { e.stopPropagation(); setEditImageProviderData({ modelId: model.id, providerId: provider.id, name: provider.name, costPerImage: provider.costPerImage, description: provider.description }) }}
                                                                                        className="text-[10px] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer" title="Edit">
                                                                                        <span className="material-symbols-outlined text-[12px]">edit</span>
                                                                                    </button>
                                                                                    {!provider.isActive && (
                                                                                        <button onClick={(e) => { e.stopPropagation(); handleRemoveImageProvider(model.id, provider.id) }}
                                                                                            className="text-[10px] text-[var(--sys-text-muted)] hover:text-primary cursor-pointer" title="Remove">
                                                                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <p className="text-[9px] text-[var(--sys-text-muted)] mb-1.5 leading-relaxed line-clamp-2">{provider.description}</p>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <span className="text-[9px] font-bold text-[var(--sys-text-muted)]">${provider.costPerImage}/img</span>
                                                                                <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${provider.hasKey ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                                                    {provider.hasKey ? `✓ ${provider.keySource}` : '✗ No Key'}
                                                                                </span>
                                                                                {!provider.builtIn && <span className="text-[7px] px-1 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-black uppercase">Custom</span>}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Add Provider inline form */}
                                                            {addImageProviderForm?.modelId === model.id && (
                                                                <div className="mt-3 p-4 rounded-xl border border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.03]">
                                                                    <h5 className="text-[11px] font-bold text-primary mb-3 flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-[13px]">add_circle</span>Add New Provider to {model.name}
                                                                    </h5>
                                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                                        <input placeholder="Provider ID (e.g., replicate)" value={addImageProviderForm.providerId}
                                                                            onChange={e => setAddImageProviderForm(f => ({ ...f, providerId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[var(--sys-border)] outline-none" />
                                                                        <input placeholder="Provider Name" value={addImageProviderForm.providerName}
                                                                            onChange={e => setAddImageProviderForm(f => ({ ...f, providerName: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[var(--sys-border)] outline-none" />
                                                                        <input placeholder="Env Key (e.g., REPLICATE_API_KEY)" value={addImageProviderForm.envKey}
                                                                            onChange={e => setAddImageProviderForm(f => ({ ...f, envKey: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[var(--sys-border)] outline-none" />
                                                                        <input placeholder="Cost/img (e.g., 0.04)" value={addImageProviderForm.costPerImage} type="number" step="0.01"
                                                                            onChange={e => setAddImageProviderForm(f => ({ ...f, costPerImage: e.target.value }))}
                                                                            className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[var(--sys-border)] outline-none" />
                                                                    </div>
                                                                    <input placeholder="Description (optional)" value={addImageProviderForm.description}
                                                                        onChange={e => setAddImageProviderForm(f => ({ ...f, description: e.target.value }))}
                                                                        className="w-full px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-[11px] focus:border-[var(--sys-border)] outline-none mb-3" />
                                                                    <div className="flex gap-2">
                                                                        <button onClick={handleAddImageProvider}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-[11px] font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all">
                                                                            Add Provider
                                                                        </button>
                                                                        <button onClick={() => setAddImageProviderForm(null)}
                                                                            className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-[11px] hover:text-[var(--sys-text)] cursor-pointer transition-all">
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    <p className="text-[10px] text-[var(--sys-text-muted)] italic">Click the radio button to switch providers. Hover over a provider card to edit or remove. Add custom providers with the + button.</p>
                                </div>
                            );
                        })() : (
                            <div className="glass-panel rounded-2xl p-6 mb-8 text-center text-[var(--sys-text-muted)] text-sm">
                                <span className="material-symbols-outlined text-2xl mb-2 block text-[var(--sys-text-muted)]">image</span>
                                Loading image providers...
                            </div>
                        )}

                        {/* Edit Image Provider Modal */}
                        {editImageProviderData && (
                            <div className="fixed inset-0 bg-[var(--sys-surface)] z-50 flex items-center justify-center" onClick={() => setEditImageProviderData(null)}>
                                <div className="glass-panel border border-[var(--sys-border)] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                                    <h4 className="text-base font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">edit</span>
                                        Edit Provider: {editImageProviderData.name}
                                    </h4>
                                    <div className="space-y-3 mb-5">
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Display Name</label>
                                            <input value={editImageProviderData.name || ''} onChange={e => setEditImageProviderData(d => ({ ...d, name: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Cost Per Image ($)</label>
                                            <input value={editImageProviderData.costPerImage || ''} type="number" step="0.001"
                                                onChange={e => setEditImageProviderData(d => ({ ...d, costPerImage: parseFloat(e.target.value) || 0 }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold block mb-1">Description</label>
                                            <input value={editImageProviderData.description || ''} onChange={e => setEditImageProviderData(d => ({ ...d, description: e.target.value }))}
                                                className="w-full px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm focus:border-[var(--sys-border)] outline-none" />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleEditImageProvider}
                                            className="px-4 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-sm font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all flex-1">
                                            Save Changes
                                        </button>
                                        <button onClick={() => setEditImageProviderData(null)}
                                            className="px-4 py-2 rounded-xl bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-sm hover:text-[var(--sys-text)] cursor-pointer transition-all">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* System Settings */}
                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-primary">settings</span>System Settings</h3>
                        {systemSettings && (
                            <div className="glass-panel rounded-2xl p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-[var(--sys-text)]">Watermark on Creatives</p><p className="text-sm text-[var(--sys-text-muted)]">Add brand watermark to generated images</p></div>
                                    <button onClick={() => handleToggleSetting('watermarkEnabled', !systemSettings.watermarkEnabled)}
                                        className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.watermarkEnabled ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.watermarkEnabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-[var(--sys-text)]">Maintenance Mode</p><p className="text-sm text-[var(--sys-text-muted)]">Block access for regular users</p></div>
                                    <button onClick={() => handleToggleSetting('maintenanceMode', !systemSettings.maintenanceMode)}
                                        className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.maintenanceMode ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`}>
                                        <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.maintenanceMode ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                    </button>
                                </div>
                                <div className="pt-2 border-t border-[var(--sys-border)]">
                                    <p className="text-xs text-[var(--sys-text-muted)] uppercase font-bold tracking-wider mb-3">Store Visibility</p>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-base font-bold text-[var(--sys-text)]">Show Subscription Plans</p><p className="text-sm text-[var(--sys-text-muted)]">Users can see & purchase subscription packages</p></div>
                                            <button onClick={() => handleToggleSetting('showSubscriptionPlans', !systemSettings.showSubscriptionPlans)}
                                                className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.showSubscriptionPlans ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.showSubscriptionPlans ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div><p className="text-base font-bold text-[var(--sys-text)]">Show Credit Packs (Top-up Store)</p><p className="text-sm text-[var(--sys-text-muted)]">Users can buy additional credit packs</p></div>
                                            <button onClick={() => handleToggleSetting('showCreditPacks', !systemSettings.showCreditPacks)}
                                                className={`w-12 h-6 rounded-full transition-all cursor-pointer ${systemSettings.showCreditPacks !== false ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`}>
                                                <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-all ${systemSettings.showCreditPacks !== false ? 'translate-x-6' : 'translate-x-0.5'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div><p className="text-base font-bold text-[var(--sys-text)]">Default AI Provider</p><p className="text-sm text-[var(--sys-text-muted)]">Primary model for content generation</p></div>
                                    <select value={systemSettings.defaultProvider || 'gemini'} onChange={e => handleToggleSetting('defaultProvider', e.target.value)}
                                        className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none cursor-pointer">
                                        <option value="gemini">Gemini</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option>
                                    </select>
                                </div>
                                <div className="pt-2 border-t border-[var(--sys-border)]">
                                    <div className="flex items-center justify-between mb-3">
                                        <div><p className="text-base font-bold text-[var(--sys-text)]">Credit Costs</p><p className="text-sm text-[var(--sys-text-muted)]">Credits deducted per AI operation</p></div>
                                        <div className="flex gap-2">
                                            {!editingCosts ? (
                                                <button onClick={() => setEditingCosts({ ...(creditCosts || {}) })} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer flex items-center gap-1"><span className="material-symbols-outlined text-sm">edit</span>Edit</button>
                                            ) : (
                                                <>
                                                    <button onClick={handleResetCosts} className="px-3 py-1.5 rounded-lg text-sm text-[var(--sys-text-muted)] hover:text-primary cursor-pointer">Reset Defaults</button>
                                                    <button onClick={() => setEditingCosts(null)} className="px-3 py-1.5 rounded-lg text-sm text-[var(--sys-text-muted)] cursor-pointer">Cancel</button>
                                                    <button onClick={handleSaveCosts} className="btn-primary px-4 py-1.5 rounded-lg text-xs cursor-pointer">Save</button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {Object.entries(editingCosts || creditCosts || {}).map(([key, val]) => (
                                            <div key={key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                <span className="text-sm text-[var(--sys-text-muted)]">{creditCostLabels[key] || key}</span>
                                                {editingCosts ? (
                                                    <input type="number" min={0} value={editingCosts[key] ?? val} onChange={e => setEditingCosts(prev => ({ ...prev, [key]: Number(e.target.value) }))} className="w-12 text-right text-xs font-bold text-primary bg-transparent outline-none border-b border-[var(--sys-border)]" />
                                                ) : (
                                                    <span className="text-xs font-bold text-primary">{val}</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="glass-panel rounded-2xl p-6 border border-primary/10">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-[var(--sys-primary-dim)] flex items-center justify-center">
                                                <span className="material-symbols-outlined text-primary">sync_problem</span>
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-[var(--sys-text)]">Credit Integrity Sync</p>
                                                <p className="text-sm text-[var(--sys-text-muted)]">Repair and synchronize credit data system-wide</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={handleSyncCredits} 
                                            disabled={syncingCredits}
                                            className="px-6 py-3 rounded-xl bg-[var(--sys-primary-dim)] hover:bg-[var(--sys-primary-dim)] text-primary text-sm font-bold border border-[var(--sys-border)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                        >
                                            <span className={`material-symbols-outlined text-base ${syncingCredits ? 'animate-spin' : ''}`}>
                                                {syncingCredits ? 'progress_activity' : 'database_sync'}
                                            </span>
                                            {syncingCredits ? 'Syncing...' : 'Start Integrity Sync'}
                                        </button>
                                    </div>
                                    <div className="p-4 rounded-xl bg-[var(--sys-primary-dim)] border border-[var(--sys-border)]">
                                        <div className="flex gap-2">
                                            <span className="material-symbols-outlined text-primary text-sm">info</span>
                                            <p className="text-xs text-primary/80 leading-relaxed">
                                                This utility walks through all users, verifies their active subscription allocation, and matches their `used` credits against the `CreditUsage` logs for the current cycle. Use this if you notice discrepancies between plan limits and actual credit balances.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ──────── PRICING CALCULATOR ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">calculate</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-[var(--sys-text)]">Pricing Calculator</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">API cost vs credit revenue — per action profitability</p>
                                    </div>
                                </div>
                                <button onClick={() => loadPricingData()} disabled={pricingLoading} className="px-4 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-[var(--sys-border)] text-primary text-xs font-bold hover:from-emerald-500/20 hover:to-cyan-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
                                    <span className={`material-symbols-outlined text-sm ${pricingLoading ? 'animate-spin' : ''}`}>{pricingLoading ? 'progress_activity' : 'refresh'}</span>
                                    {pricingLoading ? 'Loading...' : pricingData ? 'Refresh' : 'Load Pricing Data'}
                                </button>
                            </div>

                            {pricingData && (
                                <div className="space-y-4">
                                    {/* Credit Price Slider */}
                                    <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                        <label className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 block">PRICE PER CREDIT (₹)</label>
                                        <div className="flex items-center gap-4">
                                            <input type="range" min="0.5" max="10" step="0.5" value={pricingPrice} onChange={e => { setPricingPrice(parseFloat(e.target.value)); loadPricingData(parseFloat(e.target.value)) }} className="flex-1 accent-emerald-500 cursor-pointer" />
                                            <span className="text-2xl font-extrabold text-primary min-w-[60px] text-center">₹{pricingPrice}</span>
                                        </div>
                                    </div>

                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {[{ l: 'Profitable', v: pricingData.summary?.profitableActions, c: 'text-primary', bg: 'from-emerald-500/10', i: 'trending_up' },
                                          { l: 'Break-even', v: pricingData.summary?.breakevenActions, c: 'text-primary', bg: 'from-amber-500/10', i: 'trending_flat' },
                                          { l: 'Loss', v: pricingData.summary?.lossActions, c: 'text-primary', bg: 'from-rose-500/10', i: 'trending_down' },
                                          { l: 'Overall Margin', v: `${pricingData.summary?.overallMarginPct || 0}%`, c: (pricingData.summary?.overallMarginPct || 0) >= 50 ? 'text-primary' : (pricingData.summary?.overallMarginPct || 0) >= 20 ? 'text-primary' : 'text-primary', bg: 'from-[#FF4D00]/10', i: 'donut_large' },
                                        ].map(s => (
                                            <div key={s.l} className={`glass-panel rounded-xl p-4 bg-gradient-to-br ${s.bg} to-transparent`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`material-symbols-outlined text-sm ${s.c}`}>{s.i}</span>
                                                    <span className="text-xs text-[var(--sys-text-muted)] font-bold">{s.l}</span>
                                                </div>
                                                <p className={`text-2xl font-extrabold ${s.c}`}>{s.v}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Monthly Projection */}
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Est. Monthly API Cost</p>
                                            <p className="text-lg font-extrabold text-primary">₹{(pricingData.summary?.estimatedMonthlyAPICostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Est. Monthly Revenue</p>
                                            <p className="text-lg font-extrabold text-primary">₹{(pricingData.summary?.estimatedMonthlyRevenueINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Est. Monthly Profit</p>
                                            <p className={`text-lg font-extrabold ${((pricingData.summary?.estimatedMonthlyRevenueINR || 0) - (pricingData.summary?.estimatedMonthlyAPICostINR || 0)) >= 0 ? 'text-primary' : 'text-primary'}`}>₹{((pricingData.summary?.estimatedMonthlyRevenueINR || 0) - (pricingData.summary?.estimatedMonthlyAPICostINR || 0)).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    {/* Studio Filter */}
                                    <div className="flex gap-2 flex-wrap">
                                        {['all', ...Object.keys(pricingData.studioSummary || {})].map(s => (
                                            <button key={s} onClick={() => setPricingStudioFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${pricingStudioFilter === s ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                                {s === 'all' ? 'All Studios' : s}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Per-Action Table */}
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[900px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Action</th>
                                                        <th className="px-3 py-3">Studio</th>
                                                        <th className="px-3 py-3 text-right">Credits</th>
                                                        <th className="px-3 py-3 text-right">API Cost ($)</th>
                                                        <th className="px-3 py-3 text-right">API Cost (₹)</th>
                                                        <th className="px-3 py-3 text-right">Revenue (₹)</th>
                                                        <th className="px-3 py-3 text-right">Profit (₹)</th>
                                                        <th className="px-3 py-3 text-right">Margin</th>
                                                        <th className="px-3 py-3 text-center">30d Uses</th>
                                                        <th className="px-3 py-3 text-center">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.04]">
                                                    {(pricingData.actions || []).filter(a => pricingStudioFilter === 'all' || a.studio === pricingStudioFilter).map(a => (
                                                        <tr key={a.action} className="text-sm hover:bg-[var(--sys-surface)] transition-all">
                                                            <td className="px-4 py-2.5"><span className="font-bold text-[var(--sys-text)] text-xs">{a.label}</span></td>
                                                            <td className="px-3 py-2.5"><span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)] font-bold">{a.studio}</span></td>
                                                            <td className="px-3 py-2.5 text-right font-bold text-primary">{a.creditCost}</td>
                                                            <td className="px-3 py-2.5 text-right text-[var(--sys-text-muted)] font-mono text-xs">${a.apiCostUSD}</td>
                                                            <td className="px-3 py-2.5 text-right text-[var(--sys-text-muted)]">₹{a.apiCostINR}</td>
                                                            <td className="px-3 py-2.5 text-right text-[var(--sys-text)] font-bold">₹{a.revenueINR}</td>
                                                            <td className={`px-3 py-2.5 text-right font-bold ${a.profitINR >= 0 ? 'text-primary' : 'text-primary'}`}>₹{a.profitINR}</td>
                                                            <td className={`px-3 py-2.5 text-right font-extrabold ${a.marginPct >= 50 ? 'text-primary' : a.marginPct >= 20 ? 'text-primary' : 'text-primary'}`}>{a.marginPct}%</td>
                                                            <td className="px-3 py-2.5 text-center text-[var(--sys-text-muted)]">{a.last30d?.count || 0}</td>
                                                            <td className="px-3 py-2.5 text-center">
                                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${a.status === 'profitable' ? 'bg-[var(--sys-primary-dim)] text-primary' : a.status === 'breakeven' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                                    {a.status === 'profitable' ? '🟢' : a.status === 'breakeven' ? '🟡' : '🔴'} {a.status}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Studio Summary Cards */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                        {Object.entries(pricingData.studioSummary || {}).map(([studio, data]) => (
                                            <div key={studio} className="glass-panel rounded-xl p-3">
                                                <p className="text-xs font-bold text-[var(--sys-text)] mb-1">{studio}</p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className={`text-lg font-extrabold ${data.avgMargin >= 50 ? 'text-primary' : data.avgMargin >= 20 ? 'text-primary' : 'text-primary'}`}>{data.avgMargin}%</span>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)]">avg margin</span>
                                                </div>
                                                <p className="text-[10px] text-[var(--sys-text-muted)]">{data.actions} actions{data.losses > 0 ? ` • ${data.losses} loss` : ''}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ──────── API KEY MANAGEMENT ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[#FF4D00]">key</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-[var(--sys-text)]">API Key Management</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Manage external API keys — DB overrides env vars</p>
                                    </div>
                                </div>
                                <button onClick={loadApiKeys} className="px-3 py-1.5 rounded-lg bg-[#FF4D00]/10 border border-[#FF4D00]/20 text-[#FF4D00] text-xs font-bold hover:bg-[#FF4D00]/20 cursor-pointer flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {apiProviders.map(p => (
                                    <div key={p.id} className="glass-panel rounded-xl p-4 border border-[var(--sys-border)] hover:border-[#FF4D00]/20 transition-all">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-[#FF4D00] text-lg">{p.icon}</span>
                                                <span className="text-sm font-bold text-[var(--sys-text)]">{p.label}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                {p.canTest && (
                                                    <button onClick={() => handleTestApiKey(p.id)} disabled={testingProvider === p.id} className="p-1 rounded hover:bg-[var(--sys-surface)] cursor-pointer" title="Test">
                                                        <span className={`material-symbols-outlined text-sm ${testingProvider === p.id ? 'animate-spin text-primary' : 'text-[var(--sys-text-muted)]'}`}>{testingProvider === p.id ? 'progress_activity' : 'speed'}</span>
                                                    </button>
                                                )}
                                                <button onClick={() => { setEditingProvider(p.id); setEditProviderKeys({}) }} className="p-1 rounded hover:bg-[var(--sys-surface)] cursor-pointer" title="Edit">
                                                    <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">edit</span>
                                                </button>
                                            </div>
                                        </div>
                                        {p.fields.map(f => (
                                            <div key={f.key} className="flex items-center justify-between py-1.5 border-t border-[var(--sys-border)]">
                                                <span className="text-[10px] text-[var(--sys-text-muted)] font-bold">{f.label}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-[var(--sys-text-muted)] font-mono">{f.masked || '—'}</span>
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${f.source === 'database' ? 'bg-[#FF4D00]/15 text-[#FF4D00]' : f.source === 'env' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>{f.source}</span>
                                                </div>
                                            </div>
                                        ))}
                                        {testResults[p.id] && (
                                            <div className={`mt-2 p-2 rounded-lg text-[10px] font-bold ${testResults[p.id].success ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                {testResults[p.id].status === 'connected' ? '🟢' : testResults[p.id].status === 'no_key' ? '⚫' : '🔴'} {testResults[p.id].message}
                                            </div>
                                        )}
                                        {editingProvider === p.id && (
                                            <div className="mt-3 pt-3 border-t border-[#FF4D00]/20 space-y-2">
                                                {p.fields.map(f => (
                                                    <input key={f.key} type="password" placeholder={`New ${f.label}`} value={editProviderKeys[f.key] || ''} onChange={e => setEditProviderKeys(k => ({ ...k, [f.key]: e.target.value }))} className="w-full px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs focus:border-[#FF4D00]/50 outline-none" />
                                                ))}
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleSaveApiKey(p.id)} className="flex-1 px-3 py-1.5 rounded-lg bg-[#FF4D00]/20 text-[#FF4D00] text-xs font-bold hover:bg-[#FF4D00]/30 cursor-pointer">Save</button>
                                                    <button onClick={() => handleDeleteApiKey(p.id)} className="px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer">Remove</button>
                                                    <button onClick={() => setEditingProvider(null)} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-bold hover:bg-[var(--sys-surface)] cursor-pointer">Cancel</button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ──────── WATERMARK CONFIGURATION ──────── */}
                        {systemSettings && (
                            <div className="mt-8">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-primary">branding_watermark</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-[var(--sys-text)]">Watermark Configuration</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Logo, position, opacity — applied to images & videos</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                        <label className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 block">WATERMARK LOGO</label>
                                        <div className="flex flex-col items-center gap-3">
                                            {(watermarkLogoPreview || systemSettings.watermarkLogoUrl) ? (
                                                <div className="w-full h-24 rounded-lg bg-[var(--sys-surface)]/50 flex items-center justify-center overflow-hidden border border-[var(--sys-border)]">
                                                    <img src={watermarkLogoPreview || systemSettings.watermarkLogoUrl} alt="Watermark" className="max-h-20 max-w-full object-contain" />
                                                </div>
                                            ) : (
                                                <div className="w-full h-24 rounded-lg bg-[var(--sys-surface)]/50 flex items-center justify-center border border-dashed border-[var(--sys-border)]">
                                                    <span className="text-[var(--sys-text-muted)] text-xs">No logo — text watermark active</span>
                                                </div>
                                            )}
                                            <label className="px-4 py-2 rounded-lg bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-sm">upload</span> Upload Logo
                                                <input type="file" accept="image/*" onChange={handleWatermarkLogoUpload} className="hidden" />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                        <label className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 block">POSITION</label>
                                        <select value={systemSettings.watermarkPosition || 'bottom-right'} onChange={e => handleWatermarkSettingsUpdate({ position: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs mb-4 cursor-pointer outline-none">
                                            {['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'].map(pos => (
                                                <option key={pos} value={pos} className="bg-[#08080C]">{pos.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                                            ))}
                                        </select>
                                        <label className="text-xs font-bold text-[var(--sys-text-muted)] mb-2 block">OPACITY ({Math.round((systemSettings.watermarkOpacity || 0.4) * 100)}%)</label>
                                        <input type="range" min="0.1" max="1" step="0.05" value={systemSettings.watermarkOpacity || 0.4} onChange={e => handleWatermarkSettingsUpdate({ opacity: parseFloat(e.target.value) })} className="w-full accent-cyan-500 cursor-pointer" />
                                    </div>

                                    <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                        <label className="text-xs font-bold text-[var(--sys-text-muted)] mb-3 block">WATERMARK STATUS</label>
                                        <div className="flex items-center gap-3 mb-4">
                                            <button onClick={() => handleWatermarkSettingsUpdate({ enabled: !systemSettings.watermarkEnabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer transition-colors ${systemSettings.watermarkEnabled ? 'bg-[var(--sys-surface)]' : 'bg-[var(--sys-surface)]'}`}>
                                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${systemSettings.watermarkEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                            </button>
                                            <span className={`text-sm font-bold ${systemSettings.watermarkEnabled ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>{systemSettings.watermarkEnabled ? 'ON — All Outputs' : 'OFF — No Watermarks'}</span>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-primary">image</span><span className="text-[var(--sys-text-muted)]">Applied to generated images</span></div>
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-primary">movie</span><span className="text-[var(--sys-text-muted)]">Applied to generated videos</span></div>
                                            <div className="flex items-center gap-2 text-[10px]"><span className="material-symbols-outlined text-xs text-primary">tune</span><span className="text-[var(--sys-text-muted)]">Per-brand/user overrides available</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ──────── PROVIDER USAGE INTELLIGENCE ──────── */}
                        <div className="mt-8">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center">
                                        <span className="material-symbols-outlined text-[var(--sys-primary)]">monitoring</span>
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-[var(--sys-text)]">Provider Usage Intelligence</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Real API usage data from providers + internal logs</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select value={providerUsageDays} onChange={e => { setProviderUsageDays(parseInt(e.target.value)); loadProviderUsage(parseInt(e.target.value)) }} className="px-2 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs cursor-pointer outline-none">
                                        {[7, 14, 30, 60, 90].map(d => <option key={d} value={d} className="bg-[#08080C]">{d} days</option>)}
                                    </select>
                                    <button onClick={() => loadProviderUsage()} disabled={providerUsageLoading} className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-primary)] text-xs font-bold hover:bg-[var(--sys-surface)] cursor-pointer flex items-center gap-1 disabled:opacity-50">
                                        <span className={`material-symbols-outlined text-sm ${providerUsageLoading ? 'animate-spin' : ''}`}>{providerUsageLoading ? 'progress_activity' : 'refresh'}</span>
                                        {providerUsageLoading ? 'Loading...' : providerUsageData ? 'Refresh' : 'Load Usage'}
                                    </button>
                                </div>
                            </div>

                            {providerUsageData && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Total API Cost (Est.)</p>
                                            <p className="text-xl font-extrabold text-primary">${providerUsageData.totalEstimatedCostUSD}</p>
                                            <p className="text-[10px] text-[var(--sys-text-muted)]">≈ ₹{Math.round((providerUsageData.totalEstimatedCostUSD || 0) * calcExRate).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Total API Calls</p>
                                            <p className="text-xl font-extrabold text-primary">{(providerUsageData.totalCalls || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 text-center">
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-1">Credits Consumed</p>
                                            <p className="text-xl font-extrabold text-[#FF4D00]">{(providerUsageData.totalCreditsUsed || 0).toLocaleString()}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                                        {Object.entries(providerUsageData.providerUsage || {}).map(([prov, data]) => (
                                            <div key={prov} className={`glass-panel rounded-xl p-4 border ${data.calls > 0 ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)]'}`}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-xs font-bold text-[var(--sys-text)] capitalize">{prov}</span>
                                                    {data.calls > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-primary)] font-bold">ACTIVE</span>}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between text-[10px]"><span className="text-[var(--sys-text-muted)]">Calls</span><span className="text-[var(--sys-text)] font-bold">{data.calls.toLocaleString()}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-[var(--sys-text-muted)]">Tokens</span><span className="text-[var(--sys-text)] font-bold">{(data.totalTokens || 0).toLocaleString()}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-[var(--sys-text-muted)]">Est. Cost</span><span className="text-primary font-bold">${data.estimatedCostUSD}</span></div>
                                                    <div className="flex justify-between text-[10px]"><span className="text-[var(--sys-text-muted)]">Credits</span><span className="text-primary font-bold">{data.creditsUsed}</span></div>
                                                </div>
                                                {data.models?.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-[var(--sys-border)]">
                                                        {data.models.slice(0, 3).map(m => (
                                                            <div key={m.model} className="flex justify-between text-[9px] py-0.5">
                                                                <span className="text-[var(--sys-text-muted)] truncate max-w-[60%]">{m.model}</span>
                                                                <span className="text-[var(--sys-text-muted)]">{m.calls} calls</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {providerUsageData.piapiBalance && (
                                        <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="material-symbols-outlined text-[var(--sys-primary)] text-sm">account_balance_wallet</span>
                                                <span className="text-xs font-bold text-[var(--sys-text)]">PiAPI Account Balance</span>
                                            </div>
                                            <pre className="text-[10px] text-[var(--sys-text-muted)] bg-[var(--sys-surface)] p-2 rounded overflow-auto max-h-24">{JSON.stringify(providerUsageData.piapiBalance, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {/* ════════════ STUDIO MANAGEMENT ════════════ */}
                {tab === 'studios' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">rocket_launch</span>
                                    Studio Launch Control
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Control which studios are visible across the platform — globally or per user</p>
                            </div>
                            <button onClick={loadStudioVisibility} className="p-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer"><span className="material-symbols-outlined text-sm">refresh</span></button>
                        </div>

                        {/* Legend */}
                        <div className="flex gap-6 mb-5 px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                            <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-[var(--sys-surface)]" /><span className="text-[var(--sys-text-muted)]"><b className="text-primary">Public</b> — visible to everyone (per plan)</span></div>
                            <div className="flex items-center gap-2 text-xs"><span className="w-2.5 h-2.5 rounded-full bg-[var(--sys-surface)]" /><span className="text-[var(--sys-text-muted)]"><b className="text-primary">Hidden</b> — off for everyone</span></div>
                        </div>

                        {/* Global Studio Visibility */}
                        {studioVisibility ? (
                            <div className="space-y-2 mb-8">
                                {studioKeys.map(key => {
                                    const status = studioVisibility[key] || 'public';
                                    const rowBorder = { public: 'border-[var(--sys-border)]', hidden: 'border-[var(--sys-border)]' };
                                    const dotColor = { public: 'bg-[var(--sys-surface)]', hidden: 'bg-[var(--sys-surface)]' };
                                    const activeClasses = {
                                        public: 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]',
                                        hidden: 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]',
                                    };
                                    return (
                                        <div key={key} className={`flex items-center justify-between px-5 py-4 rounded-xl bg-[var(--sys-surface)] border ${rowBorder[status]} transition-all`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`w-3 h-3 rounded-full ${dotColor[status]}`} />
                                                <span className="text-sm font-bold text-[var(--sys-text)]">{studioLabels[key] || key}</span>
                                                <span className="text-[10px] text-[var(--sys-text-muted)] font-mono bg-[var(--sys-surface)] px-2 py-0.5 rounded">{key}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                {['public', 'hidden'].map(state => (
                                                    <button key={state} onClick={() => handleStudioVisibilityChange(key, state)}
                                                        className={`px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${status === state
                                                            ? activeClasses[state]
                                                            : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] border border-transparent'
                                                        }`}
                                                    >
                                                        {state.charAt(0).toUpperCase() + state.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center py-12 text-[var(--sys-text-muted)] text-sm">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                                Loading studio visibility...
                            </div>
                        )}

                        {/* Per-User Studio Access Section */}
                        <div className="glass-panel rounded-2xl p-5 mt-6">
                            <h4 className="text-sm font-bold text-[var(--sys-text)] flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary">shield_person</span>
                                Per-User Studio Access
                            </h4>
                            <p className="text-xs text-[var(--sys-text-muted)] mb-4">Search for a user to grant or revoke individual studio access. User overrides take priority over global settings.</p>
                            <div className="flex items-center gap-3 bg-[var(--sys-surface)] rounded-xl border border-[var(--sys-border)] px-4 py-2.5">
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-lg">search</span>
                                <input
                                    type="text"
                                    placeholder="Search user to manage studio access..."
                                    value={impersonateSearch}
                                    onChange={e => setImpersonateSearch(e.target.value)}
                                    className="flex-1 bg-transparent text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none"
                                />
                            </div>
                            {impersonateResults.length > 0 && impersonateSearch.length >= 2 && (
                                <div className="mt-2 border border-[var(--sys-border)] rounded-xl overflow-hidden">
                                    {impersonateResults.map(u => (
                                        <div key={u._id} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--sys-surface)] transition-all border-b border-[var(--sys-border)] last:border-b-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-black">{u.name?.charAt(0)?.toUpperCase() || '?'}</div>
                                                <div>
                                                    <p className="text-sm font-bold text-[var(--sys-text)]">{u.name}</p>
                                                    <p className="text-[10px] text-[var(--sys-text-muted)]">{u.email} · {u.plan || 'free'}</p>
                                                </div>
                                            </div>
                                            <button onClick={() => { openUserStudioModal(u._id); setImpersonateSearch(''); setImpersonateResults([]) }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#FF4D00]/10 text-[#FF4D00] border border-[#FF4D00]/20 hover:bg-[#FF4D00]/20 cursor-pointer transition-all flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-xs">tune</span> Manage Access
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {studioOverrides.length > 0 && (
                                <div className="mt-6 border-t border-[var(--sys-border)] pt-5">
                                    <h5 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-3">Active User Overrides</h5>
                                    <div className="space-y-2">
                                        {studioOverrides.map(u => (
                                            <div key={u._id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-black">{u.name?.charAt(0)?.toUpperCase() || '?'}</div>
                                                    <div>
                                                        <p className="text-sm font-bold text-[var(--sys-text)]">{u.name}</p>
                                                        <p className="text-[10px] text-[var(--sys-text-muted)]">{u.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1.5 flex-wrap justify-end max-w-[50%]">
                                                    {Object.entries(u.studioAccess || {}).map(([key, val]) => {
                                                        if (val !== true && val !== false) return null;
                                                        const isHidden = studioVisibility?.[key] === 'hidden';
                                                        const isGranted = val === true;
                                                        
                                                        let badgeClass = "bg-[var(--sys-surface)] text-[var(--sys-text-muted)]";
                                                        if (isGranted && isHidden) badgeClass = "bg-rose-500/10 text-rose-500 border border-rose-500/20";
                                                        else if (isGranted) badgeClass = "bg-emerald-500/10 text-emerald-500";
                                                        else badgeClass = "bg-rose-500/10 text-rose-500";

                                                        return (
                                                            <span key={key} title={isGranted && isHidden ? "Granted (Globally Hidden)" : ""} className={`px-2 py-1 rounded text-[10px] font-bold ${badgeClass}`}>
                                                                {studioLabels?.[key] || key}: {isGranted ? 'Granted' : 'Revoked'} {isGranted && isHidden && '⚠️'}
                                                            </span>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ════════════ INTEGRATIONS ════════════ */}
                {tab === 'integrations' && (
                    <div>
                        {integrations && (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">{Object.entries(integrations.summary?.byPlatform || {}).map(([p, count]) => (
                                    <div key={p} className="glass-panel rounded-2xl p-4 text-center">
                                        <p className="text-2xl mb-1">{platformIcons[p] || '🔌'}</p>
                                        <p className="text-lg font-extrabold text-[var(--sys-text)]">{count}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)] capitalize">{p.replace('-', ' ')}</p>
                                    </div>
                                ))}</div>

                                {/* Search + Filter */}
                                <div className="flex gap-3 mb-5">
                                    <div className="flex-1 relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-lg">search</span>
                                        <input
                                            type="text"
                                            placeholder="Search by user, email, or brand..."
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-primary/50"
                                            id="integration-search"
                                            onChange={e => {
                                                const q = e.target.value.toLowerCase()
                                                document.querySelectorAll('[data-integration-row]').forEach(row => {
                                                    row.style.display = row.dataset.integrationRow.includes(q) ? '' : 'none'
                                                })
                                            }}
                                        />
                                    </div>
                                    <select
                                        className="px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none cursor-pointer"
                                        onChange={e => {
                                            const f = e.target.value
                                            document.querySelectorAll('[data-integration-row]').forEach(row => {
                                                row.style.display = (!f || row.dataset.platform === f) ? '' : 'none'
                                            })
                                        }}
                                    >
                                        <option value="">All Platforms</option>
                                        {Object.keys(integrations.summary?.byPlatform || {}).map(p => (
                                            <option key={p} value={p}>{p.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Table Header */}
                                <div className="overflow-x-auto pb-2">
                                    <div className="min-w-[800px]">
                                        <div className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1.5fr_1fr] gap-3 px-4 py-2 text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider border-b border-[var(--sys-border)] mb-2">
                                            <span>User</span><span>Brand</span><span>Platform</span><span>Status</span><span>Account</span><span>Last Synced</span>
                                        </div>

                                        {/* Table Rows */}
                                        <div className="space-y-1.5">
                                            {(integrations.integrations || []).map(i => (
                                                <div
                                                    key={i._id}
                                                    data-integration-row={`${i.user?.name || ''} ${i.user?.email || ''} ${i.brand?.name || ''} ${i.platform || ''}`.toLowerCase()}
                                                    data-platform={i.platform}
                                                    className="grid grid-cols-[2fr_1.5fr_1fr_0.8fr_1.5fr_1fr] gap-3 items-center glass-panel rounded-xl px-4 py-3 hover:bg-[var(--sys-surface)] transition-all"
                                                >
                                                    {/* User */}
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                                                            {i.user?.name?.[0]?.toUpperCase() || '?'}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-[var(--sys-text)] truncate">{i.user?.name || 'Unknown'}</p>
                                                            <p className="text-[10px] text-[var(--sys-text-muted)] truncate">{i.user?.email}</p>
                                                        </div>
                                                    </div>
                                                    {/* Brand */}
                                                    <div className="min-w-0">
                                                        <p className="text-sm text-[var(--sys-text-muted)] truncate">{i.brand?.name || '—'}</p>
                                                    </div>
                                                    {/* Platform */}
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-lg">{platformIcons[i.platform] || '🔌'}</span>
                                                        <span className="text-xs text-[var(--sys-text-muted)] capitalize">{(i.platform || '').replace('-', ' ')}</span>
                                                    </div>
                                                    {/* Status */}
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold w-fit ${i.status === 'connected' ? 'bg-[var(--sys-primary-dim)] text-primary' : i.status === 'expired' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-border)]/15 text-[var(--sys-text-muted)]'}`}>{i.status}</span>
                                                    {/* Account */}
                                                    <p className="text-xs text-[var(--sys-text-muted)] truncate">{i.displayName || i.email || '—'}</p>
                                                    {/* Last Synced */}
                                                    <span className="text-xs text-[var(--sys-text-muted)]">{i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Never'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {(integrations.integrations || []).length === 0 && (
                                    <div className="text-center py-16 glass-panel rounded-2xl mt-4">
                                        <span className="material-symbols-outlined text-5xl text-slate-700 mb-3">hub</span>
                                        <h3 className="text-lg font-bold text-[var(--sys-text)] mb-1">No Integrations</h3>
                                        <p className="text-sm text-[var(--sys-text-muted)]">Users haven't connected any platforms yet</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* ════════════ AUDIT LOGS ════════════ */}
                {tab === 'logs' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#FF4D00]">history</span>
                                    System Audit Logs
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Immutable record of all administrative actions performed on the platform</p>
                            </div>
                            <button onClick={loadLogs} className="p-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all"><span className={`${logsLoading ? 'animate-spin' : ''} material-symbols-outlined text-sm`}>refresh</span></button>
                        </div>

                        <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left min-w-[800px]">
                                    <thead>
                                        <tr className="text-xs text-[var(--sys-text-muted)] font-bold uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                            <th className="px-5 py-4">Action & Target</th>
                                            <th className="px-5 py-4">Admin</th>
                                            <th className="px-5 py-4">Severity</th>
                                            <th className="px-5 py-4">IP Address</th>
                                            <th className="px-5 py-4 text-right">Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.04]">
                                        {logsLoading ? (
                                            <tr><td colSpan="5" className="py-20 text-center text-[var(--sys-text-muted)] capitalize"><span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading Audit Trail...</td></tr>
                                        ) : logs.length > 0 ? logs.map(log => (
                                            <tr key={log._id} className="text-sm hover:bg-[var(--sys-surface)] transition-all group">
                                                <td className="px-5 py-4">
                                                    <div>
                                                        <span className="font-bold text-[var(--sys-text)] uppercase text-[10px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] mr-2">{log.action?.replace(/_/g, ' ')}</span>
                                                        <span className="text-[var(--sys-text-muted)] text-xs">{log.targetModel} ({log.targetId?.slice(-6)})</span>
                                                        {log.metadata?.reason && <p className="text-[10px] text-[var(--sys-text-muted)] mt-1 italic">"{log.metadata.reason}"</p>}
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded bg-[#FF4D00]/10 flex items-center justify-center text-[10px] font-bold text-[#FF4D00]">{log.admin?.name?.[0]}</div>
                                                        <span className="text-[var(--sys-text-muted)] font-medium">{log.admin?.name || 'System'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                        log.severity === 'high' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                        log.severity === 'medium' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                        'bg-[var(--sys-primary-dim)] text-primary'
                                                    }`}>{log.severity?.toUpperCase()}</span>
                                                </td>
                                                <td className="px-5 py-4 font-mono text-xs text-[var(--sys-text-muted)]">{log.ipAddress || '—'}</td>
                                                <td className="px-5 py-4 text-right text-[var(--sys-text-muted)] text-xs">
                                                    {new Date(log.createdAt).toLocaleString('en-IN', { 
                                                        day: '2-digit', 
                                                        month: 'short', 
                                                        year: 'numeric',
                                                        hour: '2-digit', 
                                                        minute: '2-digit', 
                                                        second: '2-digit',
                                                        hour12: true 
                                                    })}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" className="py-20 text-center text-[var(--sys-text-muted)]">No audit logs found</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        {totalLogs > 50 && (
                            <div className="flex justify-center gap-2 mt-6">
                                <button disabled={logsPage <= 1} onClick={() => setLogsPage(p => p - 1)} className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)] disabled:opacity-30 cursor-pointer">← Prev</button>
                                <span className="px-4 py-2 text-sm text-[var(--sys-text-muted)]">Page {logsPage}</span>
                                <button disabled={logs.length < 50} onClick={() => setLogsPage(p => p + 1)} className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-sm text-[var(--sys-text-muted)] disabled:opacity-30 cursor-pointer">Next →</button>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ MODALS ════════════ */}
                {creditModal && (
                    <div className="fixed inset-0 bg-[var(--sys-surface)] flex items-center justify-center z-50" onClick={() => setCreditModal(null)}>
                        <div className="glass-panel rounded-2xl p-6 w-[90%] max-w-sm border border-primary/20" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-primary">add_circle</span>Add Credits — {creditModal.name}</h3>
                            <p className="text-sm text-[var(--sys-text-muted)] mb-4">Current: {creditModal.creditBalance?.remaining || 0} credits</p>
                            <input type="number" value={creditAmount} onChange={e => setCreditAmount(e.target.value)} placeholder="Credits to add" className="w-full px-4 py-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none mb-4" />
                            <div className="flex gap-3 mb-4">{[25, 50, 100, 500].map(n => (
                                <button key={n} onClick={() => setCreditAmount(String(n))} className="flex-1 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-bold hover:bg-primary/10 hover:text-primary cursor-pointer">+{n}</button>
                            ))}</div>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setCreditModal(null)} className="px-4 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] cursor-pointer">Cancel</button>
                                <button onClick={handleAddCredits} disabled={!creditAmount} className="btn-primary px-6 py-2 rounded-lg text-sm cursor-pointer disabled:opacity-30">Add</button>
                            </div>
                        </div>
                    </div>
                )}
                {planModal && (
                    <div className="fixed inset-0 bg-[var(--sys-surface)] flex items-center justify-center z-50" onClick={() => setPlanModal(null)}>
                        <div className="glass-panel rounded-2xl p-6 w-[95%] max-w-md border border-primary/20" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-[var(--sys-text)] mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-[#FF4D00]">upgrade</span>Change Plan — {planModal.name}</h3>
                            <p className="text-sm text-[var(--sys-text-muted)] mb-4">Current: <strong className="text-[var(--sys-text)] capitalize">{planModal.plan}</strong></p>
                            <div className="space-y-2">
                                {packages.length > 0 ? packages.map((pkg) => (
                                    <button 
                                        key={pkg._id} 
                                        onClick={() => handleChangePlan(planModal._id, pkg.slug)} 
                                        className={`w-full p-4 rounded-xl text-left transition-all cursor-pointer border ${planModal.plan === pkg.slug ? 'border-primary/40 bg-primary/10' : 'border-[var(--sys-border)] hover:bg-[var(--sys-surface)]'}`}
                                    >
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <p className="text-base font-bold text-[var(--sys-text)] capitalize">{pkg.name}</p>
                                                <p className="text-[11px] text-[var(--sys-text-muted)]">
                                                    {pkg.credits?.monthly} credits • {pkg.pricing?.monthly > 0 ? `₹${pkg.pricing.monthly}/mo` : 'Free'}
                                                </p>
                                            </div>
                                            {planModal.plan === pkg.slug && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">CURRENT</span>}
                                        </div>
                                    </button>
                                )) : (
                                    <div className="text-center py-4 text-[var(--sys-text-muted)] text-sm">No packages found. Create one in the Packages tab.</div>
                                )}
                            </div>
                            <div className="flex justify-end mt-4"><button onClick={() => setPlanModal(null)} className="px-4 py-2 rounded-lg text-sm text-[var(--sys-text-muted)] cursor-pointer">Close</button></div>
                        </div>
                    </div>
                )}
                {/* Provider Budgets Modal */}
                {showBudgetModal && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#08080C]/80 animate-in fade-in duration-300">
                        <div className="glass-panel rounded-3xl w-full max-w-md border border-[var(--sys-border)] shadow-2xl p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                                    Configure Provider Budgets
                                </h3>
                                <button onClick={() => setShowBudgetModal(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all"><span className="material-symbols-outlined">close</span></button>
                            </div>
                            <p className="text-xs text-[var(--sys-text-muted)] mb-6 font-medium leading-relaxed">Enter the total dollar amount you have recharged for each provider. We'll track your platform's consumption against these limits.</p>
                            
                            <form onSubmit={handleSaveBudgets} className="space-y-4">
                                {Object.keys(budgetForm).map(provider => (
                                    <div key={provider}>
                                        <label className="block text-[10px] font-black text-[var(--sys-text-muted)] uppercase tracking-widest mb-1.5 ml-1">{provider}</label>
                                        <div className="relative">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sys-text-muted)] text-sm font-bold">$</span>
                                            <input 
                                                type="number" 
                                                value={budgetForm[provider]} 
                                                onChange={e => setBudgetForm(f => ({ ...f, [provider]: Number(e.target.value) }))}
                                                className="w-full pl-8 pr-4 py-3 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-sm outline-none focus:border-[var(--sys-border)] transition-all"
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                ))}
                                <div className="pt-4 flex gap-3">
                                    <button type="button" onClick={() => setShowBudgetModal(false)} className="flex-1 py-3 bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[var(--sys-surface)] transition-all border border-[var(--sys-border)] cursor-pointer">Cancel</button>
                                    <button type="submit" className="flex-1 py-3 bg-[var(--sys-surface)] text-slate-950 text-xs font-black uppercase tracking-wider rounded-2xl hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer">Save Budgets</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ════════════ PRICING STRATEGY COMMAND CENTER ════════════ */}
                {tab === 'pricing' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">calculate</span>
                                    Pricing Strategy Command Center
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Policy, margin calculator, and LLM price monitoring</p>
                            </div>
                        </div>

                        {/* Sub-nav */}
                        <div className="flex gap-2 mb-6">
                            {[{ id: 'calculator', label: '🧮 Margin Calculator', icon: 'tune' },
                              { id: 'policy', label: '📋 Pricing Policy', icon: 'description' },
                              { id: 'monitor', label: '🤖 Price Monitor', icon: 'monitoring' },
                              { id: 'video-rates', label: '🎥 Video Model Rates', icon: 'slow_motion_video' },
                              { id: 'image-rates', label: '🖼️ Image Model Rates', icon: 'image' }].map(s => (
                                <button key={s.id} onClick={() => setPolicySection(s.id)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        policySection === s.id ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>

                        {/* ─── SECTION 1: INTERACTIVE MARGIN CALCULATOR ─── */}
                        {policySection === 'calculator' && (
                            <div className="space-y-6">
                                {/* Slider Controls */}
                                <div className="glass-panel rounded-2xl p-6 border border-[var(--sys-border)]">
                                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">tune</span>
                                        Adjust Parameters — See Real-Time Impact
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-[var(--sys-text-muted)]">₹ per Credit</label>
                                                <span className="text-lg font-black text-primary">₹{calcCreditPrice}</span>
                                            </div>
                                            <input type="range" min="1" max="10" step="0.5" value={calcCreditPrice}
                                                onChange={e => { setCalcCreditPrice(parseFloat(e.target.value)); loadPricingData(parseFloat(e.target.value), calcMargin, calcExRate) }}
                                                className="w-full accent-amber-500" />
                                            <div className="flex justify-between text-[9px] text-[var(--sys-text-muted)] mt-1"><span>₹1</span><span>₹5 (floor)</span><span>₹10</span></div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-[var(--sys-text-muted)]">Target Margin %</label>
                                                <span className="text-lg font-black text-primary">{calcMargin}%</span>
                                            </div>
                                            <input type="range" min="20" max="80" step="5" value={calcMargin}
                                                onChange={e => { setCalcMargin(parseInt(e.target.value)); loadPricingData(calcCreditPrice, parseInt(e.target.value), calcExRate) }}
                                                className="w-full accent-emerald-500" />
                                            <div className="flex justify-between text-[9px] text-[var(--sys-text-muted)] mt-1"><span>20%</span><span>50% (target)</span><span>80%</span></div>
                                        </div>
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <label className="text-xs font-bold text-[var(--sys-text-muted)]">USD/INR Rate</label>
                                                <span className="text-lg font-black text-[#FF4D00]">₹{calcExRate}</span>
                                            </div>
                                            <input type="range" min="80" max="105" step="0.1" value={calcExRate}
                                                onChange={e => { setCalcExRate(parseFloat(e.target.value)); loadPricingData(calcCreditPrice, calcMargin, parseFloat(e.target.value)) }}
                                                className="w-full accent-blue-500" />
                                            <div className="flex justify-between text-[9px] text-[var(--sys-text-muted)] mt-1"><span>₹80</span><span>₹95.56 (default)</span><span>₹105</span></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Summary Cards */}
                                {pricingData?.summary && (
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                        <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Profitable</p>
                                            <p className="text-2xl font-black text-primary">{pricingData.summary.profitableActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Breakeven</p>
                                            <p className="text-2xl font-black text-primary">{pricingData.summary.breakevenActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4 border border-[var(--sys-border)]">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Loss</p>
                                            <p className="text-2xl font-black text-primary">{pricingData.summary.lossActions}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Est Monthly API Cost</p>
                                            <p className="text-2xl font-black text-[var(--sys-text)]">₹{(pricingData.summary.estimatedMonthlyAPICostINR || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="glass-panel rounded-xl p-4">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Overall Margin</p>
                                            <p className={`text-2xl font-black ${pricingData.summary.overallMarginPct >= 50 ? 'text-primary' : pricingData.summary.overallMarginPct >= 20 ? 'text-primary' : 'text-primary'}`}>
                                                {pricingData.summary.overallMarginPct}%
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Studio Summary */}
                                {pricingData?.studioSummary && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {Object.entries(pricingData.studioSummary).map(([studio, s]) => (
                                            <div key={studio} className={`glass-panel rounded-xl p-4 border ${s.avgMargin >= 50 ? 'border-[var(--sys-border)]' : s.avgMargin >= 20 ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)]'}`}>
                                                <p className="text-xs font-bold text-[var(--sys-text)] truncate">{studio}</p>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className={`text-lg font-black ${s.avgMargin >= 50 ? 'text-primary' : s.avgMargin >= 20 ? 'text-primary' : 'text-primary'}`}>{s.avgMargin}%</span>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)]">{s.actions} actions{s.losses > 0 ? `, ${s.losses} loss` : ''}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Per-Action Table */}
                                {pricingData?.actions && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                        <div className="flex items-center justify-between p-4 border-b border-[var(--sys-border)]">
                                            <h4 className="text-sm font-black text-[var(--sys-text)] flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary text-lg">table_chart</span>
                                                Per-Action Cost vs Revenue
                                            </h4>
                                            <select value={pricingStudioFilter} onChange={e => setPricingStudioFilter(e.target.value)}
                                                className="px-3 py-1.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text)] cursor-pointer">
                                                <option value="all">All Studios</option>
                                                {Object.keys(pricingData.studioSummary || {}).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[900px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Action</th>
                                                        <th className="px-4 py-3">Studio</th>
                                                        <th className="px-4 py-3 text-right">Credits</th>
                                                        <th className="px-4 py-3 text-right">API Cost</th>
                                                        <th className="px-4 py-3 text-right">Revenue</th>
                                                        <th className="px-4 py-3 text-right">Profit</th>
                                                        <th className="px-4 py-3 text-right">Margin</th>
                                                        <th className="px-4 py-3 text-center">Status</th>
                                                        <th className="px-4 py-3 text-right">30d Uses</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {pricingData.actions
                                                        .filter(a => pricingStudioFilter === 'all' || a.studio === pricingStudioFilter)
                                                        .map(a => (
                                                        <tr key={a.action} className="text-sm hover:bg-[var(--sys-surface)] transition-all">
                                                            <td className="px-4 py-2.5 font-medium text-[var(--sys-text)] text-xs">{a.label}</td>
                                                            <td className="px-4 py-2.5 text-[10px] text-[var(--sys-text-muted)]">{a.studio}</td>
                                                            <td className="px-4 py-2.5 text-right font-bold text-[var(--sys-text)] text-xs">{a.creditCost}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text-muted)]">₹{a.apiCostINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-primary">₹{a.revenueINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: a.profitINR >= 0 ? '#34d399' : '#f87171' }}>₹{a.profitINR}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs font-bold" style={{ color: a.marginPct >= 50 ? '#34d399' : a.marginPct >= 20 ? '#fbbf24' : '#f87171' }}>{a.marginPct}%</td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                                                    a.status === 'profitable' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                    a.status === 'breakeven' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                    'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                                                    {a.status === 'profitable' ? '🟢' : a.status === 'breakeven' ? '🟡' : '🔴'} {a.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right text-[10px] text-[var(--sys-text-muted)]">{a.last30d?.count || 0}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 2: PRICING POLICY DOCUMENT ─── */}
                        {policySection === 'policy' && policyData && (
                            <div className="space-y-6">
                                {/* Formula */}
                                <div className="glass-panel rounded-2xl p-6 border border-[#FF4D00]/10">
                                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[#FF4D00]">function</span>
                                        Pricing Formula & Guardrails
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                        <div className="bg-[#FF4D00]/5 rounded-xl p-4 border border-[#FF4D00]/10">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Formula</p>
                                            <p className="text-sm font-black text-[#FF4D00] mt-1">{policyData.formula?.text}</p>
                                        </div>
                                        <div className="bg-[var(--sys-primary-dim)] rounded-xl p-4 border border-[var(--sys-border)]">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Floor Price</p>
                                            <p className="text-sm font-black text-primary mt-1">{policyData.formula?.floorPrice}</p>
                                        </div>
                                        <div className="bg-[var(--sys-primary-dim)] rounded-xl p-4 border border-[var(--sys-border)]">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Target Margin</p>
                                            <p className="text-sm font-black text-primary mt-1">{policyData.formula?.targetMargin}</p>
                                        </div>
                                        <div className="bg-[#FF4D00]/5 rounded-xl p-4 border border-[#FF4D00]/10">
                                            <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Exchange Rate</p>
                                            <p className="text-sm font-black text-[#FF4D00] mt-1">{policyData.formula?.exchangeRate}</p>
                                        </div>
                                    </div>
                                    {policyData.guardrails && (
                                        <div className="space-y-2">
                                            {policyData.guardrails.map((g, i) => (
                                                <div key={i} className="flex items-center gap-3 bg-[var(--sys-surface)] rounded-lg p-3">
                                                    <span className="material-symbols-outlined text-primary text-base">shield</span>
                                                    <div className="flex-1">
                                                        <span className="text-xs font-bold text-[var(--sys-text)]">{g.rule}: </span>
                                                        <span className="text-xs text-primary font-bold">{g.value}</span>
                                                        <span className="text-xs text-[var(--sys-text-muted)]"> — {g.reason}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Credit Costs by Studio */}
                                {policyData.creditCostsByStudio && (
                                    <div className="glass-panel rounded-2xl p-6">
                                        <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">token</span>
                                            Credit Costs by Studio
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {Object.entries(policyData.creditCostsByStudio).map(([studio, actions]) => (
                                                <div key={studio} className="bg-[var(--sys-surface)] rounded-xl p-4 border border-[var(--sys-border)]">
                                                    <h5 className="text-xs font-black text-primary uppercase mb-3">{studio}</h5>
                                                    <div className="space-y-1.5">
                                                        {actions.map(a => (
                                                            <div key={a.action} className="flex items-center justify-between">
                                                                <span className="text-xs text-[var(--sys-text-muted)]">{a.label}</span>
                                                                <span className="text-xs font-bold text-[var(--sys-text)] bg-[var(--sys-surface)] px-2 py-0.5 rounded">
                                                                    {typeof a.credits === 'string' ? a.credits : `${a.credits} cr`}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Video Model Matrix */}
                                {policyData.videoMatrix?.length > 0 && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                        <div className="p-4 border-b border-[var(--sys-border)]">
                                            <h4 className="text-sm font-black text-[var(--sys-text)] flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">videocam</span>
                                                Video Model Cost Matrix
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[800px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Model</th>
                                                        <th className="px-4 py-3 text-right">Fast $/sec</th>
                                                        <th className="px-4 py-3 text-right">Quality $/sec</th>
                                                        <th className="px-4 py-3 text-right">5s Fast 1080p</th>
                                                        <th className="px-4 py-3 text-right">10s Fast 1080p</th>
                                                        <th className="px-4 py-3 text-right">15s Fast 1080p</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {policyData.videoMatrix.map(v => (
                                                        <tr key={v.model} className="text-sm hover:bg-[var(--sys-surface)] transition-all">
                                                            <td className="px-4 py-2.5 font-bold text-[var(--sys-text)] text-xs">{v.name}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text-muted)]">${v.fastPerSec}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text-muted)]">${v.qualityPerSec}</td>
                                                            {v.examples.map(ex => (
                                                                <td key={ex.duration} className="px-4 py-2.5 text-right text-xs">
                                                                    <span className="text-[var(--sys-text)] font-bold">{ex.fast1080?.credits || '—'} cr</span>
                                                                    <span className="text-[9px] text-[var(--sys-text-muted)] ml-1">(${ex.fast1080?.usd || '—'})</span>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Top-Up Packs */}
                                {policyData.creditPacks?.length > 0 && (
                                    <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                        <div className="p-4 border-b border-[var(--sys-border)]">
                                            <h4 className="text-sm font-black text-[var(--sys-text)] flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">shopping_cart</span>
                                                Credit Top-Up Packs ({policyData.creditPacks.length} tiers)
                                            </h4>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[600px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Pack</th>
                                                        <th className="px-4 py-3 text-right">Credits</th>
                                                        <th className="px-4 py-3 text-right">Bonus</th>
                                                        <th className="px-4 py-3 text-right">Total</th>
                                                        <th className="px-4 py-3 text-right">Price</th>
                                                        <th className="px-4 py-3 text-right">₹/Credit</th>
                                                        <th className="px-4 py-3 text-right">Validity</th>
                                                        <th className="px-4 py-3">Badge</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {policyData.creditPacks.map(p => (
                                                        <tr key={p.slug} className="text-sm hover:bg-[var(--sys-surface)] transition-all">
                                                            <td className="px-4 py-2.5 font-bold text-[var(--sys-text)] text-xs">{p.name}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text)]">{p.credits?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-primary font-bold">{p.bonus > 0 ? `+${p.bonus?.toLocaleString()}` : '—'}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-primary font-bold">{p.total?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text)] font-bold">₹{p.price?.toLocaleString()}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text-muted)]">₹{p.perCredit}</td>
                                                            <td className="px-4 py-2.5 text-right text-xs text-[var(--sys-text-muted)]">{p.validity}d</td>
                                                            <td className="px-4 py-2.5 text-xs">{p.badge ? <span className="px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary text-[9px] font-bold">{p.badge}</span> : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 3: LLM PRICE MONITOR ─── */}
                        {policySection === 'monitor' && (
                            <div className="space-y-6">
                                {/* Controls */}
                                <div className="flex items-center gap-3 flex-wrap">
                                    <button onClick={handlePricingCheck} disabled={monitorChecking}
                                        className="px-5 py-2.5 rounded-xl bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-black uppercase tracking-wider hover:bg-[var(--sys-surface)] transition-all shadow-none disabled:opacity-50 cursor-pointer flex items-center gap-2 border border-[var(--sys-border)]">
                                        {monitorChecking ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">radar</span>}
                                        {monitorChecking ? 'Scraping Models...' : 'Check Now'}
                                    </button>
                                    {monitorData?.lastCheck && (
                                        <span className="text-xs text-[var(--sys-text-muted)]">
                                            Last checked: {new Date(monitorData.lastCheck).toLocaleString('en-IN')}
                                        </span>
                                    )}
                                </div>

                                {/* Oracle Banner */}
                                <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start md:items-center gap-3">
                                        <div className="p-2 rounded-lg bg-[var(--sys-primary-dim)] text-primary flex items-center justify-center">
                                            <span className="material-symbols-outlined text-xl">smart_toy</span>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-0.5 flex items-center gap-2">
                                                Live AI Pricing Oracle Active
                                                <span className="relative flex h-2 w-2">
                                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--sys-surface)] opacity-75"></span>
                                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--sys-surface)]"></span>
                                                </span>
                                            </h4>
                                            <p className="text-xs text-[var(--sys-text-muted)]">Scrapes provider docs via LLM to extract live generation costs across all APIs.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] min-w-[80px]">
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase font-black tracking-wider">Providers</p>
                                            <p className="text-lg font-black text-[var(--sys-text)]">{monitorData?.providers ? Object.keys(monitorData.providers).length : '—'}</p>
                                        </div>
                                        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] min-w-[80px]">
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase font-black tracking-wider">Models</p>
                                            <p className="text-lg font-black text-[var(--sys-text)]">{monitorData?.providers ? Object.values(monitorData.providers).reduce((sum, p) => sum + Object.keys(p.models).length, 0) : '—'}</p>
                                        </div>
                                        <div className="flex flex-col items-center p-2.5 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] min-w-[80px]">
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase font-black tracking-wider">Margin</p>
                                            <p className="text-xs font-bold text-primary flex items-center gap-0.5"><span className="material-symbols-outlined text-[12px]">shield</span>≥50%</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Monitor Sub-Navigation */}
                                <div className="flex gap-2">
                                    {[{ id: 'providers', label: 'All Providers', icon: 'dns' },
                                      { id: 'comparison', label: 'Cost Comparison', icon: 'compare_arrows' },
                                      { id: 'alerts', label: `Alerts ${monitorData?.alertCount > 0 ? `(${monitorData.alertCount})` : ''}`, icon: 'notifications' }].map(s => (
                                        <button key={s.id} onClick={() => setMonitorSubTab(s.id)}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                (monitorSubTab || 'providers') === s.id ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                            <span className="material-symbols-outlined text-sm">{s.icon}</span>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── TAB: ALL PROVIDERS ── */}
                                {(monitorSubTab || 'providers') === 'providers' && monitorData?.providers && (
                                    <div className="space-y-4">
                                        <div className="flex gap-2 flex-wrap">
                                            {['all', 'text', 'image', 'video', 'voice'].map(t => (
                                                <button key={t} onClick={() => setMonitorTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                    (monitorTypeFilter || 'all') === t ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                                    {t === 'all' ? '📊 All' : t === 'text' ? '💬 Text' : t === 'image' ? '🖼️ Image' : t === 'video' ? '🎥 Video' : '🎙️ Voice'}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {Object.entries(monitorData.providers)
                                                .filter(([, provider]) => {
                                                    if ((monitorTypeFilter || 'all') === 'all') return true;
                                                    return Object.values(provider.models).some(m => m.type === (monitorTypeFilter || 'all'));
                                                })
                                                .map(([providerId, provider]) => (
                                                <div key={providerId} className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xl">{provider.icon}</span>
                                                            <h5 className="text-sm font-black text-[var(--sys-text)]">{provider.provider}</h5>
                                                        </div>
                                                        <span className="text-[9px] bg-[var(--sys-surface)] text-[var(--sys-text-muted)] px-2 py-0.5 rounded-full font-bold">{Object.keys(provider.models).length} models</span>
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        {Object.entries(provider.models)
                                                            .filter(([, model]) => (monitorTypeFilter || 'all') === 'all' || model.type === (monitorTypeFilter || 'all'))
                                                            .map(([modelId, model]) => (
                                                            <div key={modelId} className="bg-[var(--sys-surface)] rounded-xl p-3 border border-[var(--sys-border)] hover:border-[var(--sys-border)] transition-all">
                                                                <div className="flex items-center justify-between mb-1.5">
                                                                    <p className="text-xs font-bold text-[var(--sys-text)]">{model.name}</p>
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                                        model.type === 'text' ? 'bg-[#FF4D00]/10 text-[#FF4D00]' :
                                                                        model.type === 'image' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                        model.type === 'video' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                        'bg-[#FF4D00]/10 text-[#FF7A00]'}`}>{model.type}</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                                                    {model.inputPer1M !== undefined && <span className="px-2 py-0.5 rounded bg-[#FF4D00]/10 text-[#FF4D00]">In: ${model.inputPer1M}/1M</span>}
                                                                    {model.outputPer1M !== undefined && <span className="px-2 py-0.5 rounded bg-[#FF4D00]/10 text-[#FF4D00]">Out: ${model.outputPer1M}/1M</span>}
                                                                    {model.flatCostUSD !== undefined && <span className="px-2 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary">${model.flatCostUSD}/{model.type === 'video' ? 'gen' : 'image'}</span>}
                                                                    {model.costPerSecFast !== undefined && <span className="px-2 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary">Fast: ${model.costPerSecFast}/s</span>}
                                                                    {model.costPerSecQuality !== undefined && <span className="px-2 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary">Quality: ${model.costPerSecQuality}/s</span>}
                                                                    {model.costPerMinute !== undefined && <span className="px-2 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary">${model.costPerMinute}/min</span>}
                                                                    {model.costPerSecond !== undefined && <span className="px-2 py-0.5 rounded bg-[#FF4D00]/10 text-[#FF7A00]">${model.costPerSecond}/sec</span>}
                                                                </div>
                                                                <p className="text-[9px] text-[var(--sys-text-muted)] mt-1.5 flex items-center gap-1">
                                                                    <span className="text-[8px] font-mono text-slate-700">{modelId}</span>
                                                                    <span className="text-slate-700">·</span>
                                                                    <a href={model.pricingUrl} target="_blank" rel="noopener" className="hover:text-primary transition-colors">Pricing →</a>
                                                                </p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* ── TAB: COST COMPARISON ── */}
                                {(monitorSubTab || 'providers') === 'comparison' && (
                                    <div className="space-y-6">
                                        <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                                            <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">compare_arrows</span>
                                                Cross-Provider Cost Comparison
                                            </h4>
                                            <p className="text-xs text-[var(--sys-text-muted)] mb-4">Models available on multiple providers are grouped together. The cheapest option is highlighted in green.</p>
                                            <div className="flex gap-2 mb-5">
                                                {['all', 'text', 'image', 'video', 'voice'].map(t => (
                                                    <button key={t} onClick={() => setMonitorTypeFilter(t)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                        (monitorTypeFilter || 'all') === t ? 'bg-[var(--sys-primary-dim)] text-primary border border-[var(--sys-border)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] border border-[var(--sys-border)] hover:text-[var(--sys-text)]'}`}>
                                                        {t === 'all' ? '📊 All' : t === 'text' ? '💬 Text' : t === 'image' ? '🖼️ Image' : t === 'video' ? '🎥 Video' : '🎙️ Voice'}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="space-y-3">
                                                {(monitorData?.comparison || [])
                                                    .filter(c => (monitorTypeFilter || 'all') === 'all' || c.type === (monitorTypeFilter || 'all'))
                                                    .map((comp, idx) => (
                                                    <div key={idx} className={`rounded-xl border transition-all ${comp.providerCount > 1 ? 'border-[var(--sys-border)] bg-[var(--sys-surface)]/[0.02]' : 'border-[var(--sys-border)] bg-[var(--sys-surface)]'}`}>
                                                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sys-border)]">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                                    comp.type === 'text' ? 'bg-[#FF4D00]/10 text-[#FF4D00]' :
                                                                    comp.type === 'image' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                    comp.type === 'video' ? 'bg-[var(--sys-primary-dim)] text-primary' :
                                                                    'bg-[#FF4D00]/10 text-[#FF7A00]'}`}>{comp.type}</span>
                                                                <p className="text-sm font-bold text-[var(--sys-text)]">{comp.modelName}</p>
                                                                {comp.providerCount > 1 && (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary font-bold">{comp.providerCount} providers</span>
                                                                )}
                                                            </div>
                                                            {comp.providerCount > 1 && (
                                                                <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[12px]">emoji_events</span>
                                                                    Best: {comp.cheapestProvider}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="divide-y divide-white/[0.03]">
                                                            {comp.providers.map((p, pi) => (
                                                                <div key={pi} className={`flex items-center justify-between px-4 py-2.5 ${p.cheapest && comp.providerCount > 1 ? 'bg-[var(--sys-surface)]/[0.04]' : ''}`}>
                                                                    <div className="flex items-center gap-2.5 min-w-[180px]">
                                                                        <span className="text-sm">{p.icon}</span>
                                                                        <div>
                                                                            <p className={`text-xs font-bold ${p.cheapest && comp.providerCount > 1 ? 'text-primary' : 'text-[var(--sys-text)]'}`}>{p.providerName}</p>
                                                                            <p className="text-[8px] font-mono text-[var(--sys-text-muted)]">{p.modelId}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className={`text-xs font-bold ${p.cheapest && comp.providerCount > 1 ? 'text-primary' : p.rank === comp.providerCount && comp.providerCount > 1 ? 'text-primary' : 'text-[var(--sys-text-muted)]'}`}>
                                                                            {p.costLabel}
                                                                        </span>
                                                                        {p.cheapest && comp.providerCount > 1 && (
                                                                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-primary-dim)] text-primary font-black uppercase">Cheapest</span>
                                                                        )}
                                                                        {!p.cheapest && comp.providerCount > 1 && (
                                                                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)] font-bold">
                                                                                +{((p.costUSD / comp.providers[0].costUSD - 1) * 100).toFixed(0)}%
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* ── TAB: ALERTS ── */}
                                {(monitorSubTab || 'providers') === 'alerts' && (
                                    <div className="space-y-4">
                                        {monitorData?.alerts?.length > 0 ? (
                                            <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-2xl p-5">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h4 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-primary">emergency</span>
                                                        Price Change Alerts ({monitorData.alerts.length})
                                                    </h4>
                                                    <button onClick={handleDismissAlerts} className="px-3 py-1.5 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-[10px] font-bold border border-[var(--sys-border)] hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                                        Dismiss All
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {monitorData.alerts.map((a, i) => (
                                                        <div key={i} className="flex items-center gap-2 py-2 px-3 bg-[var(--sys-surface)] rounded-lg border border-[var(--sys-border)]">
                                                            <span className={`material-symbols-outlined text-sm ${a.direction === 'up' ? 'text-primary' : 'text-primary'}`}>
                                                                {a.direction === 'up' ? 'trending_up' : 'trending_down'}
                                                            </span>
                                                            <div className="flex-1">
                                                                <span className="text-xs font-bold text-[var(--sys-text)]">{a.model}: </span>
                                                                <span className="text-xs text-[var(--sys-text-muted)]">{a.details}</span>
                                                            </div>
                                                            <span className="text-[9px] text-[var(--sys-text-muted)]">{a.detectedAt ? new Date(a.detectedAt).toLocaleDateString('en-IN') : ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="glass-panel rounded-2xl p-8 border border-[var(--sys-border)] text-center">
                                                <span className="material-symbols-outlined text-4xl text-primary mb-2 block">check_circle</span>
                                                <p className="text-sm font-bold text-[var(--sys-text)] mb-1">No Price Alerts</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">All provider costs are stable. The oracle will alert you when prices change.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── SECTION 4: VIDEO MODEL RATES ─── */}
                        {policySection === 'video-rates' && (
                            <div className="space-y-6">
                                {/* Search and Filters */}
                                <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)] flex flex-wrap items-center gap-4 justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                                        <div className="relative flex-1">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--sys-text-muted)]">search</span>
                                            <input type="text" value={videoRatesSearch} onChange={e => setVideoRatesSearch(e.target.value)}
                                                placeholder="Search video models by name or id..."
                                                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] outline-none focus:border-primary transition-all" />
                                        </div>
                                        {videoRatesSearch && (
                                            <button onClick={() => setVideoRatesSearch('')} className="text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">Clear</button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex gap-1 bg-[var(--sys-surface)] p-1 rounded-xl border border-[var(--sys-border)]">
                                            {['all', '480p', '720p', '1080p', '4k'].map(res => (
                                                <button key={res} onClick={() => { setVideoRatesResolutionFilter(res); setExpandedVideoModelId(null); }}
                                                    className={`px-3.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                        videoRatesResolutionFilter === res ? 'bg-[var(--sys-primary-dim)] text-primary' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                                    {res === 'all' ? '👁️ Base (1080p)' : res}
                                                </button>
                                            ))}
                                        </div>
                                        <select value={videoRatesProviderFilter} onChange={e => setVideoRatesProviderFilter(e.target.value)}
                                            className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text)] cursor-pointer">
                                            <option value="all">All Providers</option>
                                            <option value="laozhang">Laozhang</option>
                                            <option value="atlascloud">AtlasCloud</option>
                                            <option value="fal">Fal.ai</option>
                                            <option value="grok">Grok (xAI)</option>
                                            <option value="hailuo">Hailuo (MiniMax)</option>
                                            <option value="piapi">PiAPI</option>
                                        </select>
                                        <select value={videoRatesCategoryFilter} onChange={e => setVideoRatesCategoryFilter(e.target.value)}
                                            className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text)] cursor-pointer">
                                            <option value="all">All Categories</option>
                                            <option value="Text-to-Video">Text-to-Video</option>
                                            <option value="Image-to-Video">Image-to-Video</option>
                                            <option value="Reference-to-Video">Reference-to-Video</option>
                                            <option value="Video-Edit">Video Edit</option>
                                            <option value="Audio-to-Video">Audio-to-Video</option>
                                            <option value="Video-Extension">Video Extension</option>
                                            <option value="Video-to-Video">Video-to-Video</option>
                                            <option value="Video-Upscale">Video Upscale</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Cost & Margin Config Info */}
                                <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm">settings_suggest</span>
                                            Margin and Exchange Simulator
                                        </h4>
                                        <p className="text-xs text-[var(--sys-text-muted)]">
                                            These cost metrics are synchronized dynamically with your Margin Calculator settings above: <strong className="text-[var(--sys-text)]">₹{calcCreditPrice}/credit</strong> floor, <strong className="text-[var(--sys-text)]">{calcMargin}% target margin</strong>, and exchange rate of <strong className="text-[var(--sys-text)]">₹{calcExRate}/USD</strong>.
                                        </p>
                                    </div>
                                    <div className="flex gap-4 text-xs font-bold text-[var(--sys-text)]">
                                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-3 py-2 rounded-xl">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] block uppercase">Ex Rate</span>
                                            ₹{calcExRate} / USD
                                        </div>
                                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-3 py-2 rounded-xl">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] block uppercase">Target Margin</span>
                                            {calcMargin}%
                                        </div>
                                    </div>
                                </div>

                                {/* Rates Table */}
                                <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                    {loadingVideoRates ? (
                                        <div className="flex flex-col items-center justify-center p-12 text-[var(--sys-text-muted)]">
                                            <span className="material-symbols-outlined text-4xl animate-spin text-primary mb-2">progress_activity</span>
                                            <p className="text-xs">Loading video model rates...</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[900px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Model Details</th>
                                                        <th className="px-4 py-3">Provider</th>
                                                        <th className="px-4 py-3">Category</th>
                                                        <th className="px-4 py-3 text-right">USD/sec {videoRatesResolutionFilter !== 'all' ? `(${videoRatesResolutionFilter})` : ''}</th>
                                                        <th className="px-4 py-3 text-right">INR/sec {videoRatesResolutionFilter !== 'all' ? `(${videoRatesResolutionFilter})` : ''}</th>
                                                        <th className="px-4 py-3 text-right">USD/min {videoRatesResolutionFilter !== 'all' ? `(${videoRatesResolutionFilter})` : ''}</th>
                                                        <th className="px-4 py-3 text-right">INR/min {videoRatesResolutionFilter !== 'all' ? `(${videoRatesResolutionFilter})` : ''}</th>
                                                        <th className="px-4 py-3 text-right">Suggested Retail INR/sec (Margin)</th>
                                                        <th className="px-4 py-3 text-right font-black text-primary">Est Credits/sec</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {videoModelRates
                                                        .filter(m => {
                                                            if (videoRatesProviderFilter !== 'all' && m.provider !== videoRatesProviderFilter) return false;
                                                            if (videoRatesCategoryFilter !== 'all' && m.category !== videoRatesCategoryFilter) return false;
                                                            if (videoRatesSearch) {
                                                                const s = videoRatesSearch.toLowerCase();
                                                                return m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s);
                                                            }
                                                            return true;
                                                        })
                                                        .map(m => {
                                                            const RESOLUTION_MULTIPLIERS = {
                                                                '480p': 0.5,
                                                                '720p': 0.7,
                                                                '1080p': 1.0,
                                                                '4k': 2.0
                                                            };
                                                            const mult = RESOLUTION_MULTIPLIERS[videoRatesResolutionFilter] || 1.0;
                                                            const usdPerSecScaled = m.usdPerSec * mult;
                                                            const inrPerSec = usdPerSecScaled * calcExRate;
                                                            const usdPerMin = usdPerSecScaled * 60;
                                                            const inrPerMin = inrPerSec * 60;
                                                            // Retail target with margin: retail = cost / (1 - margin)
                                                            const suggestedRetailPerSec = inrPerSec / (1 - (calcMargin / 100));
                                                            // Recommended credits per second = suggested retail / credit price
                                                            const estCreditsPerSec = Math.ceil(suggestedRetailPerSec / calcCreditPrice);

                                                            return (
                                                                <React.Fragment key={m.id}>
                                                                    <tr className="text-sm hover:bg-[var(--sys-surface)] transition-all cursor-pointer"
                                                                        onClick={() => setExpandedVideoModelId(expandedVideoModelId === m.id ? null : m.id)}>
                                                                        <td className="px-4 py-3.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)] transition-all" style={{ transform: expandedVideoModelId === m.id ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
                                                                                <div>
                                                                                    <p className="font-bold text-[var(--sys-text)] text-xs">{m.name}</p>
                                                                                    <span className="text-[9px] font-mono text-[var(--sys-text-muted)]">{m.id}</span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3.5 text-xs font-semibold uppercase text-[var(--sys-text-muted)]">{m.provider}</td>
                                                                        <td className="px-4 py-3.5 text-xs text-[var(--sys-text-muted)]">{m.category}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs">${usdPerSecScaled.toFixed(3)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs text-[var(--sys-text-muted)]">₹{inrPerSec.toFixed(2)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs text-[var(--sys-text-muted)]">${usdPerMin.toFixed(2)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs text-[var(--sys-text-muted)]">₹{inrPerMin.toFixed(2)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-400">₹{suggestedRetailPerSec.toFixed(2)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs font-black text-primary">{estCreditsPerSec} cr/s</td>
                                                                    </tr>
                                                                    {expandedVideoModelId === m.id && (
                                                                        <tr className="bg-[var(--sys-surface)]/30">
                                                                            <td colSpan={9} className="px-6 py-4">
                                                                                <div className="glass-panel border border-[var(--sys-border)] rounded-2xl p-4 animate-in fade-in duration-300">
                                                                                    <h5 className="text-xs font-black uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
                                                                                        <span className="material-symbols-outlined text-sm">grid_view</span>
                                                                                        Complete Resolution Pricing Breakdown for {m.name}
                                                                                    </h5>
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                                                                        {['480p', '720p', '1080p', '4k'].map(res => {
                                                                                            const multiplier = RESOLUTION_MULTIPLIERS[res];
                                                                                            const rUsdPerSec = m.usdPerSec * multiplier;
                                                                                            const rInrPerSec = rUsdPerSec * calcExRate;
                                                                                            const rUsdPerMin = rUsdPerSec * 60;
                                                                                            const rInrPerMin = rInrPerSec * 60;
                                                                                            const rSuggestedRetailPerSec = rInrPerSec / (1 - (calcMargin / 100));
                                                                                            const rEstCreditsPerSec = Math.ceil(rSuggestedRetailPerSec / calcCreditPrice);

                                                                                            return (
                                                                                                <div key={res} className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl p-3 hover:border-primary/30 transition-all">
                                                                                                    <div className="flex items-center justify-between border-b border-[var(--sys-border)] pb-2 mb-2">
                                                                                                        <span className="text-xs font-black text-[var(--sys-text)] uppercase">{res}</span>
                                                                                                        <span className="text-[9px] bg-[var(--sys-primary-dim)] text-primary px-1.5 py-0.5 rounded-full font-mono">{multiplier}x scale</span>
                                                                                                    </div>
                                                                                                    <div className="space-y-1.5 text-xs">
                                                                                                        <div className="flex justify-between">
                                                                                                            <span className="text-[10px] text-[var(--sys-text-muted)]">Cost/second:</span>
                                                                                                            <span className="font-bold text-[var(--sys-text)] font-mono">${rUsdPerSec.toFixed(3)} <span className="text-[10px] text-[var(--sys-text-muted)] font-normal">(₹{rInrPerSec.toFixed(2)})</span></span>
                                                                                                        </div>
                                                                                                        <div className="flex justify-between">
                                                                                                            <span className="text-[10px] text-[var(--sys-text-muted)]">Cost/minute:</span>
                                                                                                            <span className="font-bold text-[var(--sys-text-muted)] font-mono">${rUsdPerMin.toFixed(2)} <span className="text-[10px] text-[var(--sys-text-muted)] font-normal">(₹{rInrPerMin.toFixed(2)})</span></span>
                                                                                                        </div>
                                                                                                        <div className="flex justify-between">
                                                                                                            <span className="text-[10px] text-[var(--sys-text-muted)]">Retail (Margin):</span>
                                                                                                            <span className="font-bold text-emerald-400 font-mono">₹{rSuggestedRetailPerSec.toFixed(2)}/s</span>
                                                                                                        </div>
                                                                                                        <div className="flex justify-between border-t border-white/[0.03] pt-1.5 mt-1.5">
                                                                                                            <span className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Est Credits:</span>
                                                                                                            <span className="font-black text-primary font-mono">{rEstCreditsPerSec} cr/s</span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ─── SECTION 5: IMAGE MODEL RATES ─── */}
                        {policySection === 'image-rates' && (
                            <div className="space-y-6">
                                {/* Search and Filters */}
                                <div className="glass-panel rounded-2xl p-4 border border-[var(--sys-border)] flex flex-wrap items-center gap-4 justify-between">
                                    <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                                        <div className="relative flex-1">
                                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--sys-text-muted)]">search</span>
                                            <input type="text" value={imageRatesSearch} onChange={e => setImageRatesSearch(e.target.value)}
                                                placeholder="Search image models by name or id..."
                                                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] outline-none focus:border-primary transition-all" />
                                        </div>
                                        {imageRatesSearch && (
                                            <button onClick={() => setImageRatesSearch('')} className="text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">Clear</button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 flex-wrap">
                                        {/* Resolution Selector */}
                                        <div className="flex gap-1 bg-[var(--sys-surface)] p-1 rounded-xl border border-[var(--sys-border)]">
                                            {['all', '1K', '2K', '4K'].map(res => (
                                                <button key={res} onClick={() => { setImageRatesResolutionFilter(res); setExpandedImageModelId(null); }}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                        imageRatesResolutionFilter === res ? 'bg-[var(--sys-primary-dim)] text-primary' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                                    {res === 'all' ? '👁️ All Res' : res}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Quality Selector */}
                                        <div className="flex gap-1 bg-[var(--sys-surface)] p-1 rounded-xl border border-[var(--sys-border)]">
                                            {['all', 'Low', 'Medium', 'High'].map(q => (
                                                <button key={q} onClick={() => { setImageRatesQualityFilter(q); setExpandedImageModelId(null); }}
                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                        imageRatesQualityFilter === q ? 'bg-[var(--sys-primary-dim)] text-primary' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                                    {q === 'all' ? '👁️ All Qual' : q}
                                                </button>
                                            ))}
                                        </div>
                                        <select value={imageRatesProviderFilter} onChange={e => setImageRatesProviderFilter(e.target.value)}
                                            className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text)] cursor-pointer">
                                            <option value="all">All Providers</option>
                                            <option value="google">Google</option>
                                            <option value="microsoft">Microsoft</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="baidu">Baidu</option>
                                            <option value="grok">Grok (xAI)</option>
                                            <option value="laozhang">Laozhang (Alibaba)</option>
                                            <option value="bytedance">ByteDance</option>
                                            <option value="piapi">PiAPI</option>
                                            <option value="fal">Fal.ai</option>
                                        </select>
                                        <select value={imageRatesCategoryFilter} onChange={e => setImageRatesCategoryFilter(e.target.value)}
                                            className="px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-xs text-[var(--sys-text)] cursor-pointer">
                                            <option value="all">All Categories</option>
                                            <option value="Text-to-Image">Text-to-Image</option>
                                            <option value="Image-to-Image">Image-to-Image</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Cost & Margin Config Info */}
                                <div className="bg-[var(--sys-primary-dim)] border border-[var(--sys-border)] rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-1 flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-sm">settings_suggest</span>
                                            Margin and Exchange Simulator (Image)
                                        </h4>
                                        <p className="text-xs text-[var(--sys-text-muted)]">
                                            These cost metrics are synchronized dynamically with your Margin Calculator settings above: <strong className="text-[var(--sys-text)]">₹{calcCreditPrice}/credit</strong> floor, <strong className="text-[var(--sys-text)]">{calcMargin}% target margin</strong>, and exchange rate of <strong className="text-[var(--sys-text)]">₹{calcExRate}/USD</strong>.
                                        </p>
                                    </div>
                                    <div className="flex gap-4 text-xs font-bold text-[var(--sys-text)]">
                                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-3 py-2 rounded-xl">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] block uppercase">Ex Rate</span>
                                            ₹{calcExRate} / USD
                                        </div>
                                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-3 py-2 rounded-xl">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] block uppercase">Target Margin</span>
                                            {calcMargin}%
                                        </div>
                                    </div>
                                </div>

                                {/* Rates Table */}
                                <div className="glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)]">
                                    {loadingImageRates ? (
                                        <div className="flex flex-col items-center justify-center p-12 text-[var(--sys-text-muted)]">
                                            <span className="material-symbols-outlined text-4xl animate-spin text-primary mb-2">progress_activity</span>
                                            <p className="text-xs">Loading image model rates...</p>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left min-w-[900px]">
                                                <thead>
                                                    <tr className="text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                                                        <th className="px-4 py-3">Model Details</th>
                                                        <th className="px-4 py-3">Provider</th>
                                                        <th className="px-4 py-3">Category</th>
                                                        <th className="px-4 py-3 text-right">USD/PIC {imageRatesResolutionFilter !== 'all' || imageRatesQualityFilter !== 'all' ? `(Scaled)` : ''}</th>
                                                        <th className="px-4 py-3 text-right">INR/PIC {imageRatesResolutionFilter !== 'all' || imageRatesQualityFilter !== 'all' ? `(Scaled)` : ''}</th>
                                                        <th className="px-4 py-3 text-right">Suggested Retail INR/PIC (Margin)</th>
                                                        <th className="px-4 py-3 text-right font-black text-primary">Est Credits/PIC</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-white/[0.03]">
                                                    {imageModelRates
                                                        .filter(m => {
                                                            if (imageRatesProviderFilter !== 'all' && m.provider !== imageRatesProviderFilter) return false;
                                                            if (imageRatesCategoryFilter !== 'all' && m.category !== imageRatesCategoryFilter) return false;
                                                            if (imageRatesSearch) {
                                                                const s = imageRatesSearch.toLowerCase();
                                                                return m.name.toLowerCase().includes(s) || m.id.toLowerCase().includes(s);
                                                            }
                                                            return true;
                                                        })
                                                        .map(m => {
                                                            const RESOLUTION_MULTIPLIERS = { '1K': 1.0, '2K': 1.5, '4K': 2.5 };
                                                            const QUALITY_MULTIPLIERS = { 'Low': 0.5, 'Medium': 1.0, 'High': 1.8 };

                                                            const resMult = RESOLUTION_MULTIPLIERS[imageRatesResolutionFilter] || 1.0;
                                                            const qualMult = QUALITY_MULTIPLIERS[imageRatesQualityFilter] || 1.0;
                                                            const combinedMult = resMult * qualMult;

                                                            const usdPerPicScaled = m.usdPerPic * combinedMult;
                                                            const inrPerPic = usdPerPicScaled * calcExRate;
                                                            const suggestedRetailPerPic = inrPerPic / (1 - (calcMargin / 100));
                                                            const estCreditsPerPic = Math.ceil(suggestedRetailPerPic / calcCreditPrice);

                                                            return (
                                                                <React.Fragment key={m.id}>
                                                                    <tr className="text-sm hover:bg-[var(--sys-surface)] transition-all cursor-pointer"
                                                                        onClick={() => setExpandedImageModelId(expandedImageModelId === m.id ? null : m.id)}>
                                                                        <td className="px-4 py-3.5">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)] transition-all" style={{ transform: expandedImageModelId === m.id ? 'rotate(90deg)' : 'none' }}>chevron_right</span>
                                                                                <div>
                                                                                    <p className="font-bold text-[var(--sys-text)] text-xs">{m.name}</p>
                                                                                    <span className="text-[9px] font-mono text-[var(--sys-text-muted)]">{m.id}</span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3.5 text-xs font-semibold uppercase text-[var(--sys-text-muted)]">{m.provider}</td>
                                                                        <td className="px-4 py-3.5 text-xs text-[var(--sys-text-muted)]">{m.category}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs">${usdPerPicScaled.toFixed(4)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs text-[var(--sys-text-muted)]">₹{inrPerPic.toFixed(3)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-emerald-400">₹{suggestedRetailPerPic.toFixed(3)}</td>
                                                                        <td className="px-4 py-3.5 text-right font-mono text-xs font-black text-primary">{estCreditsPerPic} cr</td>
                                                                    </tr>
                                                                    {expandedImageModelId === m.id && (
                                                                        <tr className="bg-[var(--sys-surface)]/30">
                                                                            <td colSpan={7} className="px-6 py-4">
                                                                                <div className="glass-panel border border-[var(--sys-border)] rounded-2xl p-4 animate-in fade-in duration-300">
                                                                                    <h5 className="text-xs font-black uppercase tracking-wider text-primary mb-1.5 flex items-center gap-1.5">
                                                                                        <span className="material-symbols-outlined text-sm">grid_view</span>
                                                                                        Resolution vs Quality Pricing Matrix for {m.name}
                                                                                    </h5>
                                                                                    <p className="text-[10px] text-[var(--sys-text-muted)] mb-3">
                                                                                        Shows the dynamic pricing for each permutation of Resolution (1K, 2K, 4K) and Quality (Low, Medium, High).
                                                                                    </p>
                                                                                    <div className="overflow-x-auto">
                                                                                        <table className="w-full text-left border border-[var(--sys-border)] rounded-xl overflow-hidden mt-3 text-xs min-w-[700px]">
                                                                                            <thead>
                                                                                                <tr className="bg-[var(--sys-surface)] text-[10px] text-[var(--sys-text-muted)] font-black uppercase tracking-wider">
                                                                                                    <th className="px-3 py-2 border-b border-[var(--sys-border)]">Resolution \ Quality</th>
                                                                                                    <th className="px-3 py-2 text-right border-b border-[var(--sys-border)]">Low (0.5x)</th>
                                                                                                    <th className="px-3 py-2 text-right border-b border-[var(--sys-border)]">Medium (1.0x)</th>
                                                                                                    <th className="px-3 py-2 text-right border-b border-[var(--sys-border)]">High (1.8x)</th>
                                                                                                </tr>
                                                                                            </thead>
                                                                                            <tbody className="divide-y divide-white/[0.03]">
                                                                                                {['1K', '2K', '4K'].map(res => {
                                                                                                    const resMultiplier = RESOLUTION_MULTIPLIERS[res];
                                                                                                    return (
                                                                                                        <tr key={res} className="hover:bg-white/[0.01]">
                                                                                                            <td className="px-3 py-2.5 font-bold text-[var(--sys-text)] uppercase bg-[var(--sys-surface)]/20 border-r border-[var(--sys-border)]">{res} ({resMultiplier}x scale)</td>
                                                                                                            {['Low', 'Medium', 'High'].map(qual => {
                                                                                                                const qualMultiplier = QUALITY_MULTIPLIERS[qual];
                                                                                                                const cellMult = resMultiplier * qualMultiplier;
                                                                                                                const cellUsd = m.usdPerPic * cellMult;
                                                                                                                const cellInr = cellUsd * calcExRate;
                                                                                                                const cellSuggestedRetail = cellInr / (1 - (calcMargin / 100));
                                                                                                                const cellEstCredits = Math.ceil(cellSuggestedRetail / calcCreditPrice);

                                                                                                                return (
                                                                                                                    <td key={qual} className="px-3 py-2.5 text-right font-mono">
                                                                                                                        <div className="font-bold text-[var(--sys-text)]">${cellUsd.toFixed(4)}</div>
                                                                                                                        <div className="text-[10px] text-[var(--sys-text-muted)]">₹{cellInr.toFixed(3)}</div>
                                                                                                                        <div className="text-[10px] text-emerald-400 font-bold">₹{cellSuggestedRetail.toFixed(3)} retail</div>
                                                                                                                        <div className="text-primary font-black text-[11px] mt-0.5">{cellEstCredits} cr</div>
                                                                                                                    </td>
                                                                                                                );
                                                                                                            })}
                                                                                                        </tr>
                                                                                                    );
                                                                                                })}
                                                                                            </tbody>
                                                                                        </table>
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    )}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ════════════ CREDIT STORE MANAGEMENT ════════════ */}
                {tab === 'creditPacks' && (
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">shopping_cart</span>
                                    Credit Store Management
                                </h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mt-1">Manage additional credit packs users can purchase</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleSeedPacks} className="px-3 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text-muted)] text-xs font-bold hover:bg-[var(--sys-surface)] transition-all cursor-pointer border border-[var(--sys-border)]">
                                    <span className="material-symbols-outlined text-sm mr-1 align-middle">database</span>Seed Defaults
                                </button>
                                <button onClick={() => { setEditingPack(null); setPackForm({ name: '', slug: '', credits: 100, bonusCredits: 0, price: 499, validityDays: 180, icon: 'bolt', badge: '', description: '', isPromo: false, promoDiscount: 0, promoOriginalPrice: 0, promoLabel: '', displayOrder: 0, isActive: true, isFirstPurchaseEligible: true }); setShowPackForm(true) }}
                                    className="px-4 py-2 rounded-lg bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-black uppercase tracking-wider hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer border border-[var(--sys-border)]">
                                    + New Pack
                                </button>
                            </div>
                        </div>

                        {/* Pack Grid */}
                        {creditPacksList.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
                            {creditPacksList.map(p => (
                                <div key={p._id} className={`glass-panel rounded-2xl overflow-hidden border transition-all ${p.isActive ? 'border-[var(--sys-border)]' : 'border-[var(--sys-border)] opacity-60'}`}>
                                    {/* Pack Header */}
                                    <div className="p-4 border-b border-[var(--sys-border)]" style={{ background: `var(--sys-primary)` }}>
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="material-symbols-outlined text-xl" style={{ color: p.color || '#f59e0b' }}>{p.icon || 'bolt'}</span>
                                                <h4 className="text-sm font-black text-[var(--sys-text)]">{p.name}</h4>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {p.badge && <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: `${p.badgeColor || '#f59e0b'}20`, color: p.badgeColor || '#f59e0b' }}>{p.badge}</span>}
                                                {p.isPromo && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--sys-primary-dim)] text-primary font-bold">PROMO</span>}
                                            </div>
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-2xl font-black text-[var(--sys-text)]">₹{p.price?.toLocaleString()}</span>
                                            {p.isPromo && p.promoOriginalPrice > 0 && <span className="text-sm text-[var(--sys-text-muted)] line-through">₹{p.promoOriginalPrice}</span>}
                                        </div>
                                    </div>
                                    {/* Pack Details */}
                                    <div className="p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Credits</span>
                                            <span className="text-sm font-bold text-[var(--sys-text)]">{p.credits?.toLocaleString()}{p.bonusCredits > 0 && <span className="text-primary"> +{p.bonusCredits}</span>}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">₹/Credit</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">₹{(p.price / ((p.credits || 1) + (p.bonusCredits || 0))).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Validity</span>
                                            <span className="text-xs text-[var(--sys-text-muted)]">{p.validityDays || 180} days</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Sales</span>
                                            <span className="text-xs text-primary font-bold">{p.purchaseCount || 0} sold · ₹{(p.totalRevenue || 0).toLocaleString()}</span>
                                        </div>
                                    </div>
                                    {/* Pack Actions */}
                                    <div className="p-3 border-t border-[var(--sys-border)] flex gap-2">
                                        <button onClick={() => handleEditPack(p)} className="flex-1 py-1.5 rounded-lg bg-[var(--sys-surface)] text-xs text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">Edit</button>
                                        <button onClick={() => handleTogglePack(p._id)} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${p.isActive ? 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]' : 'bg-[var(--sys-primary-dim)] text-primary hover:bg-[var(--sys-primary-dim)]'}`}>
                                            {p.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                        <button onClick={() => handleDeletePack(p._id, p.name)} className="py-1.5 px-3 rounded-lg bg-[var(--sys-primary-dim)] text-primary text-xs hover:bg-[var(--sys-primary-dim)] transition-all cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        )}

                        {creditPacksList.length === 0 && (
                            <div className="text-center py-16 glass-panel rounded-2xl">
                                <span className="material-symbols-outlined text-5xl text-[var(--sys-text-muted)] mb-3 block">shopping_cart</span>
                                <p className="text-[var(--sys-text-muted)] text-sm font-bold mb-1">No credit packs yet</p>
                                <p className="text-[var(--sys-text-muted)] text-xs mb-4">Create packs or seed defaults to get started</p>
                                <button onClick={handleSeedPacks} className="px-5 py-2.5 rounded-xl bg-[var(--sys-surface)] text-slate-950 text-xs font-black uppercase hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer">
                                    Seed Default Packs
                                </button>
                            </div>
                        )}

                        {/* Create/Edit Pack Modal */}
                        {showPackForm && (
                            <div className="fixed inset-0 bg-[var(--sys-surface)] flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && setShowPackForm(false)}>
                                <div className="bg-[#08080C] border border-[var(--sys-border)] rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" style={{ scrollbarWidth: 'thin' }}>
                                    <div className="p-5 border-b border-[var(--sys-border)] flex items-center justify-between sticky top-0 bg-[#08080C] z-10">
                                        <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider">{editingPack ? 'Edit Pack' : 'New Credit Pack'}</h4>
                                        <button onClick={() => setShowPackForm(false)} className="p-1 rounded-lg hover:bg-[var(--sys-surface)] text-[var(--sys-text-muted)] cursor-pointer"><span className="material-symbols-outlined">close</span></button>
                                    </div>
                                    <form onSubmit={handleSavePack} className="p-5 space-y-4">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Name *</label>
                                                <input value={packForm.name} onChange={e => setPackForm(f => ({ ...f, name: e.target.value }))} required className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none focus:border-[var(--sys-border)]" placeholder="⚡ Spark" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Slug *</label>
                                                <input value={packForm.slug} onChange={e => setPackForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} required className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none focus:border-[var(--sys-border)]" placeholder="spark" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Credits *</label>
                                                <input type="number" value={packForm.credits} onChange={e => setPackForm(f => ({ ...f, credits: parseInt(e.target.value) || 0 }))} required className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Bonus</label>
                                                <input type="number" value={packForm.bonusCredits} onChange={e => setPackForm(f => ({ ...f, bonusCredits: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Price (₹) *</label>
                                                <input type="number" value={packForm.price} onChange={e => setPackForm(f => ({ ...f, price: parseInt(e.target.value) || 0 }))} required className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Validity (days)</label>
                                                <input type="number" value={packForm.validityDays} onChange={e => setPackForm(f => ({ ...f, validityDays: parseInt(e.target.value) || 180 }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Icon</label>
                                                <input value={packForm.icon} onChange={e => setPackForm(f => ({ ...f, icon: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" placeholder="bolt" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Display Order</label>
                                                <input type="number" value={packForm.displayOrder} onChange={e => setPackForm(f => ({ ...f, displayOrder: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Badge</label>
                                                <input value={packForm.badge} onChange={e => setPackForm(f => ({ ...f, badge: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" placeholder="Best Value, Popular..." />
                                            </div>
                                            <div>
                                                <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Description</label>
                                                <input value={packForm.description} onChange={e => setPackForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" placeholder="Great for casual creators" />
                                            </div>
                                        </div>
                                        {/* Promo Section */}
                                        <div className="border border-[var(--sys-border)] rounded-xl p-4">
                                            <label className="flex items-center gap-2 cursor-pointer mb-3">
                                                <input type="checkbox" checked={packForm.isPromo} onChange={e => setPackForm(f => ({ ...f, isPromo: e.target.checked }))} className="accent-amber-500" />
                                                <span className="text-xs font-bold text-[var(--sys-text)]">Enable Promo Mode</span>
                                            </label>
                                            {packForm.isPromo && (
                                                <div className="grid grid-cols-3 gap-3">
                                                    <div>
                                                        <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Discount %</label>
                                                        <input type="number" value={packForm.promoDiscount} onChange={e => setPackForm(f => ({ ...f, promoDiscount: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Original ₹</label>
                                                        <input type="number" value={packForm.promoOriginalPrice} onChange={e => setPackForm(f => ({ ...f, promoOriginalPrice: parseInt(e.target.value) || 0 }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold mb-1 block">Promo Label</label>
                                                        <input value={packForm.promoLabel} onChange={e => setPackForm(f => ({ ...f, promoLabel: e.target.value }))} className="w-full px-3 py-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] outline-none" placeholder="33% off!" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {/* Toggles */}
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={packForm.isActive} onChange={e => setPackForm(f => ({ ...f, isActive: e.target.checked }))} className="accent-emerald-500" />
                                                <span className="text-xs text-[var(--sys-text-muted)]">Active</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={packForm.isFirstPurchaseEligible} onChange={e => setPackForm(f => ({ ...f, isFirstPurchaseEligible: e.target.checked }))} className="accent-amber-500" />
                                                <span className="text-xs text-[var(--sys-text-muted)]">2× First Purchase</span>
                                            </label>
                                        </div>
                                        <div className="flex gap-3 pt-2">
                                            <button type="button" onClick={() => setShowPackForm(false)} className="flex-1 py-3 bg-[var(--sys-surface)] text-[var(--sys-text)] text-xs font-black uppercase tracking-wider rounded-xl hover:bg-[var(--sys-surface)] transition-all border border-[var(--sys-border)] cursor-pointer">Cancel</button>
                                            <button type="submit" className="flex-1 py-3 bg-[var(--sys-surface)] text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-[var(--sys-surface)] transition-all shadow-none cursor-pointer">{editingPack ? 'Update Pack' : 'Create Pack'}</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'ugcStudio' && (
                    <UGCStudioSettings />
                )}

                {/* ════════════ GROWTH ENGINE ════════════ */}
                {tab === 'growth' && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--sys-border)] pb-4">
                            <div>
                                <h2 className="text-xl font-black text-[var(--sys-text)] flex items-center gap-2 whitespace-nowrap">
                                    <span className="material-symbols-outlined text-emerald-500">trending_up</span>
                                    Growth Engine
                                </h2>
                                <p className="text-xs text-[var(--sys-text-muted)] mt-1">Auto-generated daily content • Copy, post, grow</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                                {growthStats && (
                                    <div className="flex items-center gap-4 mr-4">
                                        <div className="text-center">
                                            <p className="text-lg font-black text-emerald-500">{growthStats.streak}</p>
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase tracking-wider">Streak</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-blue-500">{growthStats.postsPosted}/{growthStats.postsThisWeek}</p>
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase tracking-wider">This Week</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-lg font-black text-purple-500">{growthStats.coverage}%</p>
                                            <p className="text-[9px] text-[var(--sys-text-muted)] uppercase tracking-wider">Coverage</p>
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-2.5 py-1.5 mr-2 shrink-0 w-fit max-w-full">
                                    <span className="text-xs font-bold text-[var(--sys-text-muted)] flex items-center gap-1 shrink-0 whitespace-nowrap">
                                        <span className="material-symbols-outlined text-xs text-emerald-500">auto_awesome_motion</span>
                                        Brand context:
                                    </span>
                                    <select
                                        value={growthSelectedBrandId}
                                        onChange={(e) => setGrowthSelectedBrandId(e.target.value)}
                                        className="text-xs p-1 rounded-lg bg-[var(--sys-bg)] border border-[var(--sys-border)] text-[var(--sys-text)] outline-none font-bold cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
                                    >
                                        <option value="">Default (Mantram AI)</option>
                                        {brands.map(b => (
                                            <option key={b._id} value={b._id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => { setShowGrowthHistory(!showGrowthHistory); if (!showGrowthHistory) loadGrowthHistory() }}
                                    className="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer transition-all border border-[var(--sys-border)]"
                                >
                                    <span className="material-symbols-outlined text-sm mr-1" style={{ verticalAlign: 'middle' }}>history</span>
                                    History
                                </button>
                                <button
                                    onClick={handleGenerateGrowth}
                                    disabled={growthGenerating}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    {growthGenerating ? (
                                        <><span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>Generating...</>
                                    ) : (
                                        <><span className="material-symbols-outlined text-sm">auto_awesome</span>{growthContent ? 'Regenerate All' : 'Generate Today'}</>
                                    )}
                                </button>
                            </div>
                        </div>

                        {growthLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <span className="material-symbols-outlined text-4xl animate-spin text-[var(--sys-text-muted)]">progress_activity</span>
                            </div>
                        ) : !growthContent ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <span className="material-symbols-outlined text-6xl text-[var(--sys-text-muted)] mb-4">rocket_launch</span>
                                <h3 className="text-lg font-bold text-[var(--sys-text)] mb-2">No content generated for today</h3>
                                <p className="text-sm text-[var(--sys-text-muted)] mb-6 max-w-md">Click "Generate Today" to create content for LinkedIn, Instagram, Twitter, and Reddit. Or wait until 5:30 AM IST for auto-generation.</p>
                                <button onClick={handleGenerateGrowth} disabled={growthGenerating} className="px-6 py-3 rounded-2xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-all text-sm disabled:opacity-50">
                                    {growthGenerating ? 'Generating...' : '🚀 Generate Now'}
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Meta info */}
                                <div className="flex items-center gap-4 text-[10px] text-[var(--sys-text-muted)]">
                                    <span>📅 {new Date(growthContent.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                                    <span>🎯 {growthContent.theme?.replace(/_/g, ' ')?.toUpperCase()}</span>
                                    <span>🤖 {growthContent.metadata?.model}</span>
                                    {growthContent.metadata?.trendingTopics?.length > 0 && (
                                        <span>📊 Trends: {growthContent.metadata.trendingTopics.slice(0, 3).join(', ')}</span>
                                    )}
                                </div>

                                {/* Top Controls */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-4">
                                    {/* Platform Tabs */}
                                    <div className="flex flex-wrap gap-1 p-1 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit max-w-full">
                                        {[
                                            { id: 'linkedin', label: 'LinkedIn', icon: '💼', color: '#0A66C2', count: growthContent.linkedin?.length || 0 },
                                            { id: 'instagram', label: 'Instagram', icon: '📸', color: '#E4405F', count: 3 },
                                            { id: 'twitter', label: 'Twitter/X', icon: '🐦', color: '#1DA1F2', count: growthContent.twitter?.length || 0 },
                                            { id: 'reddit', label: 'Reddit', icon: '🟠', color: '#FF4500', count: growthContent.reddit?.length || 0 },
                                        ].map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => setGrowthPlatformTab(p.id)}
                                                className={`px-2.5 sm:px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 ${
                                                    growthPlatformTab === p.id
                                                        ? 'text-white shadow-lg'
                                                        : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'
                                                }`}
                                                style={growthPlatformTab === p.id ? { background: p.color } : {}}
                                            >
                                                <span>{p.icon}</span> {p.label}
                                                <span className="px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: growthPlatformTab === p.id ? 'rgba(255,255,255,0.2)' : 'var(--sys-border)' }}>{p.count}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {/* Image Model Selector + Generate All */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] w-fit max-w-full shrink-0">
                                            <span className="text-xs font-bold text-[var(--sys-text-muted)] pl-2">🖼️ Image Model:</span>
                                            <select
                                                value={growthImageModel}
                                                onChange={(e) => setGrowthImageModel(e.target.value)}
                                                className="text-xs p-1.5 rounded-xl bg-[var(--sys-bg)] border border-[var(--sys-border)] text-[var(--sys-text)] outline-none font-bold cursor-pointer max-w-[150px] truncate"
                                            >
                                                <option value="gpt-image-2">GPT Image 2</option>
                                                <option value="nanobanana-2">NanoBanana 2</option>
                                                <option value="nanobanana-pro">NanoBanana Pro</option>
                                            </select>
                                        </div>
                                        <button
                                            onClick={() => handleGenerateAllImages('platform')}
                                            disabled={growthBatchGenerating || hasAnyImageGenerating}
                                            className="px-3 py-2 rounded-xl text-[10px] font-bold bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-purple-500/20 border border-purple-400/20"
                                        >
                                            {growthBatchGenerating ? (
                                                <>
                                                    <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                                                    {growthBatchProgress.current}/{growthBatchProgress.total} Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-[13px]">photo_library</span>
                                                    Gen All Images
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => handleGenerateAllImages('all')}
                                            disabled={growthBatchGenerating || hasAnyImageGenerating}
                                            className="px-3 py-2 rounded-xl text-[10px] font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-orange-500/20 border border-orange-400/20"
                                            title="Generate images for ALL platforms at once"
                                        >
                                            {growthBatchGenerating ? (
                                                <>
                                                    <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
                                                    Working...
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-[13px]">all_inclusive</span>
                                                    Gen All Platforms
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* LINKEDIN POSTS */}
                                {growthPlatformTab === 'linkedin' && (
                                    <div className="space-y-4">
                                        {(growthContent.linkedin || []).map((post, i) => (
                                            <div key={i} className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #0A66C210, transparent)' }}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm">💼</span>
                                                        <span className="text-xs font-bold text-[var(--sys-text)]">LinkedIn Post {i + 1}</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-500">{post.type?.replace(/_/g, ' ')}</span>
                                                        {post.bestTime && <span className="text-[10px] text-[var(--sys-text-muted)]">⏰ {post.bestTime}</span>}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <button 
                                                            onClick={() => triggerPublishModal('linkedin', i)}
                                                            disabled={isPublishing === `linkedin-${i}`}
                                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            {isPublishing === `linkedin-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish
                                                        </button>
                                                        <button onClick={() => handleMarkPosted('linkedin', i)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${post.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                            {post.posted ? '✅ Posted' : '○ Mark'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleRegeneratePost('linkedin', i)}
                                                            disabled={growthRegenerating === `linkedin-${i}`}
                                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {growthRegenerating === `linkedin-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                        </button>
                                                        <button
                                                            onClick={() => handleGenerateImage('linkedin', i)}
                                                            disabled={isImageGenerating(`linkedin-${i}`)}
                                                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-blue-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1"
                                                        >
                                                            {isImageGenerating(`linkedin-${i}`) ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🖼️'} Gen Image
                                                        </button>
                                                        <button
                                                            onClick={() => handleCopyContent(post.content + '\n\n' + (post.hashtags || []).join(' '), `li-${i}`)}
                                                            className="px-3 py-1 rounded-lg text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-all"
                                                        >
                                                            {growthCopied === `li-${i}` ? '✓ Copied!' : '📋 Copy'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-4">
                                                    <pre className="text-sm text-[var(--sys-text)] whitespace-pre-wrap font-sans leading-relaxed">{post.content}</pre>
                                                    {post.hashtags?.length > 0 && (
                                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                                            {post.hashtags.map((h, j) => (
                                                                <span key={j} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500">{h}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {post.imageUrl && (
                                                        <div className="mt-3 rounded-lg overflow-hidden border border-[var(--sys-border)] relative group cursor-zoom-in" onClick={() => setGrowthPreviewImage(post.imageUrl)}>
                                                            <img src={post.imageUrl} alt="Generated" className="w-full h-auto object-cover max-h-64 transition-transform duration-500 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm">
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(post.imageUrl); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Zoom Preview"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">zoom_in</span>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); downloadImage(post.imageUrl, `linkedin-post-${i + 1}.png`); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Download Image"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">download</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* INSTAGRAM POSTS + STORY */}
                                {growthPlatformTab === 'instagram' && (
                                    <div className="space-y-4">
                                        {/* Instagram Post */}
                                        <div className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #E4405F10, #833AB410, transparent)' }}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm">📸</span>
                                                    <span className="text-xs font-bold text-[var(--sys-text)]">Instagram Post</span>
                                                    {growthContent.instagram?.post?.bestTime && <span className="text-[10px] text-[var(--sys-text-muted)]">⏰ {growthContent.instagram.post.bestTime}</span>}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button 
                                                        onClick={() => triggerPublishModal('instagram_post')}
                                                        disabled={isPublishing === `instagram_post-0`}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                    >
                                                        {isPublishing === `instagram_post-0` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish
                                                    </button>
                                                    <button onClick={() => handleMarkPosted('instagram_post')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${growthContent.instagram?.post?.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                        {growthContent.instagram?.post?.posted ? '✅ Posted' : '○ Mark'}
                                                    </button>
                                                    <button onClick={() => handleRegeneratePost('instagram_post')} disabled={growthRegenerating === 'instagram_post-0'} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1">
                                                        {growthRegenerating === 'instagram_post-0' ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                    </button>
                                                    <button
                                                        onClick={() => handleCopyContent(growthContent.instagram?.post?.caption + '\n\n' + (growthContent.instagram?.post?.hashtags || []).join(' '), 'ig-post')}
                                                        className="px-3 py-1 rounded-lg text-[10px] font-bold text-white cursor-pointer transition-all flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #E4405F, #833AB4)' }}
                                                    >
                                                        {growthCopied === 'ig-post' ? '✓ Copied!' : '📋 Copy'}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="p-4">
                                                <pre className="text-sm text-[var(--sys-text)] whitespace-pre-wrap font-sans leading-relaxed mb-4">{growthContent.instagram?.post?.caption}</pre>
                                                
                                                {/* Aesthetic Instagram Feed Post Mockup Card */}
                                                {growthContent.instagram?.post?.slides?.length > 0 && (
                                                    <div className="mb-6 flex flex-col items-center">
                                                        <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-widest mb-3 self-start">📱 Instagram Feed Mockup (Cover Page)</p>
                                                        <div 
                                                            onClick={() => setShowIgSliders(!showIgSliders)}
                                                            className="w-full max-w-[360px] bg-black rounded-2xl border border-neutral-850 shadow-[0_15px_40px_rgba(228,64,95,0.08)] overflow-hidden cursor-pointer hover:border-pink-500/40 hover:shadow-[0_20px_50px_rgba(228,64,95,0.18)] transition-all duration-500 group relative"
                                                        >
                                                            {/* Mock Header */}
                                                            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-neutral-900 bg-black">
                                                                <div className="flex items-center gap-2.5">
                                                                    {/* Stylized Instagram Avatar Border */}
                                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] p-[1.8px] flex items-center justify-center">
                                                                        <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                                                                            <span className="text-[10px] font-black tracking-tighter text-pink-500">M</span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="leading-tight">
                                                                        <div className="text-[11px] font-bold text-white flex items-center gap-1">
                                                                            mantram.ai
                                                                            <span className="material-symbols-outlined text-[10px] text-blue-400 font-bold">verified</span>
                                                                        </div>
                                                                        <div className="text-[8px] text-neutral-400 font-medium">Sponsored • Growth Engine</div>
                                                                    </div>
                                                                </div>
                                                                <span className="material-symbols-outlined text-[16px] text-neutral-400 cursor-pointer">more_horiz</span>
                                                            </div>

                                                            {/* Media Block */}
                                                            <div className="relative aspect-square w-full bg-gradient-to-br from-[#121212] via-[#1a1a1a] to-[#281c2d] flex items-center justify-center overflow-hidden">
                                                                {/* Ambient Glow */}
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(228,64,95,0.15)_0%,transparent_70%)] pointer-events-none" />

                                                                {/* Image or template overlay */}
                                                                {growthContent.instagram.post.slides[0]?.imageUrl ? (
                                                                    <div className="relative w-full h-full group">
                                                                        <img 
                                                                            src={growthContent.instagram.post.slides[0].imageUrl} 
                                                                            alt="Cover Graphic" 
                                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                                                        />
                                                                        {isImageGenerating('instagram_post-0-0') && (
                                                                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                                                                                <span className="material-symbols-outlined text-white text-3xl animate-spin mb-2">progress_activity</span>
                                                                                <span className="text-[10px] text-white font-bold tracking-wider animate-pulse">GENERATING COVER...</span>
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {/* Swipe right on cover overlay */}
                                                                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-pink-500/30 text-[10px] font-bold text-white flex items-center gap-1.5 shadow-lg animate-bounce z-10">
                                                                            <span className="material-symbols-outlined text-[12px] text-pink-500">swipe_left</span>
                                                                            Swipe Right 👉
                                                                        </div>

                                                                        {/* Regenerate cover image button on hover */}
                                                                        <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
                                                                            <div className="flex gap-3">
                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(growthContent.instagram.post.slides[0].imageUrl); }}
                                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                                    title="Zoom Preview"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-xl">zoom_in</span>
                                                                                </button>
                                                                                <button 
                                                                                    onClick={(e) => { e.stopPropagation(); downloadImage(growthContent.instagram.post.slides[0].imageUrl, 'instagram-cover.png'); }}
                                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                                    title="Download Image"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-xl">download</span>
                                                                                </button>
                                                                            </div>
                                                                            <button 
                                                                                onClick={(e) => { e.stopPropagation(); handleGenerateImage('instagram_post', 0, 0); }}
                                                                                className="px-3 py-1.5 rounded-lg bg-pink-600/90 text-white font-bold text-xs shadow-lg hover:bg-pink-700 transition-all flex items-center gap-1.5 cursor-pointer border border-pink-400/20"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">cached</span>
                                                                                Regenerate Cover
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="absolute inset-0 flex flex-col justify-between p-6 text-center">
                                                                        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]" />
                                                                        
                                                                        <div className="text-[9px] font-bold text-pink-500/60 uppercase tracking-widest mt-2">Mantram Instagram Cover</div>
                                                                        
                                                                        <div className="my-auto px-4 z-10">
                                                                            <h4 className="text-sm font-black text-white leading-snug tracking-tight uppercase mb-2 font-sans bg-gradient-to-b from-white to-neutral-300 bg-clip-text text-transparent drop-shadow-lg">
                                                                                {growthContent.instagram.post.slides[0]?.text || "Why US SaaS Tools Fail Indian D2C"}
                                                                            </h4>
                                                                            <p className="text-[9px] text-neutral-400 leading-normal max-w-xs mx-auto line-clamp-2">
                                                                                {growthContent.instagram.post.slides[0]?.visualDescription || "A beautiful layout showcasing D2C metrics"}
                                                                            </p>
                                                                        </div>

                                                                        <div className="flex flex-col items-center gap-2.5 z-10 mb-2">
                                                                            {isImageGenerating('instagram_post-0-0') ? (
                                                                                <div className="flex flex-col items-center gap-1">
                                                                                    <span className="material-symbols-outlined text-pink-500 text-lg animate-spin">progress_activity</span>
                                                                                    <span className="text-[9px] font-bold text-pink-500 animate-pulse">Generating Cover...</span>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleGenerateImage('instagram_post', 0, 0); }}
                                                                                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-xs shadow-lg hover:shadow-pink-500/20 transition-all flex items-center gap-1.5 cursor-pointer border border-pink-400/20"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                                                                                    Generate Cover Image
                                                                                </button>
                                                                            )}
                                                                            <span className="text-[8px] text-neutral-500">(Slide 1 image of the carousel sliders)</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Translucent Carousel Badge */}
                                                                <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-neutral-800 text-[9px] font-bold text-white z-10 flex items-center gap-1 shadow-md">
                                                                    <span className="material-symbols-outlined text-[10px] text-pink-500">view_carousel</span>
                                                                    1 / {growthContent.instagram.post.slides.length}
                                                                </div>

                                                                {/* Pulse Indicator */}
                                                                <div className="absolute bottom-3 right-3 bg-pink-500 text-white rounded-full p-1.5 shadow-lg shadow-pink-500/30 opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300 z-10 flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-[14px]">touch_app</span>
                                                                </div>
                                                            </div>

                                                            {/* Action Bar */}
                                                            <div className="px-3.5 py-3 bg-black">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-3.5">
                                                                        <span className="material-symbols-outlined text-[18px] text-white hover:text-pink-500 transition-colors">favorite</span>
                                                                        <span className="material-symbols-outlined text-[18px] text-white hover:text-pink-500 transition-colors">mode_comment</span>
                                                                        <span className="material-symbols-outlined text-[18px] text-white hover:text-pink-500 transition-colors">send</span>
                                                                    </div>
                                                                    {/* Dots indicator */}
                                                                    <div className="flex items-center gap-1">
                                                                        {growthContent.instagram.post.slides.map((_, dotIdx) => (
                                                                            <div 
                                                                                key={dotIdx} 
                                                                                className={`w-1.5 h-1.5 rounded-full transition-all ${dotIdx === 0 ? 'bg-pink-500 w-2' : 'bg-neutral-700'}`} 
                                                                            />
                                                                        ))}
                                                                    </div>
                                                                    <span className="material-symbols-outlined text-[18px] text-white hover:text-pink-500 transition-colors">bookmark</span>
                                                                </div>

                                                                {/* Caption */}
                                                                <div className="text-[11px] leading-relaxed text-neutral-300 line-clamp-2 mt-2 font-sans">
                                                                    <span className="font-bold text-white mr-1.5">mantram.ai</span>
                                                                    {growthContent.instagram.post.caption}
                                                                </div>
                                                                
                                                                {/* Reveal Banner */}
                                                                <div className="mt-3.5 pt-2 border-t border-neutral-900 flex items-center justify-between">
                                                                    <div className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                                        <span className="material-symbols-outlined text-[12px] text-pink-500 animate-pulse">{showIgSliders ? 'expand_less' : 'expand_more'}</span>
                                                                        {showIgSliders ? 'Hide Sliders' : 'Click to Swipe & View Carousel Sliders'}
                                                                    </div>
                                                                    <span className="text-[9px] font-bold text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20 group-hover:bg-pink-500 group-hover:text-white transition-all">
                                                                        {showIgSliders ? 'Collapse' : 'Reveal Slides'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {growthContent.instagram?.post?.slides?.length > 0 && showIgSliders && (
                                                    <div className="mt-4 animate-in fade-in slide-in-from-top-4 duration-300">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider">📑 Carousel Slides</p>
                                                            <button
                                                                onClick={() => handleGenerateAllImages('instagram_slides')}
                                                                disabled={growthBatchGenerating || hasAnyImageGenerating}
                                                                className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1 shadow-lg shadow-pink-500/20 border border-pink-400/20"
                                                            >
                                                                {growthBatchGenerating ? (
                                                                    <>
                                                                        <span className="material-symbols-outlined text-[11px] animate-spin">progress_activity</span>
                                                                        {growthBatchProgress.current}/{growthBatchProgress.total}
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <span className="material-symbols-outlined text-[11px]">auto_awesome</span>
                                                                        Gen All Slide Images
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {growthContent.instagram.post.slides.map((s, j) => (
                                                                <div key={j} className="p-3 rounded-xl bg-[var(--sys-bg)] border border-[var(--sys-border)] flex flex-col justify-between">
                                                                    <div>
                                                                        <p className="text-[10px] font-bold text-pink-500 mb-1">Slide {s.slideNumber}</p>
                                                                        <p className="text-xs text-[var(--sys-text)] font-bold mb-1">{s.text}</p>
                                                                        <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-2">🎨 {s.visualDescription}</p>
                                                                    </div>
                                                                    <div className="mt-2 relative">
                                                                        {isImageGenerating(`instagram_post-0-${j}`) && !s.imageUrl && (
                                                                            <div className="w-full h-32 rounded-lg bg-[var(--sys-bg)] border-2 border-dashed border-pink-500/30 flex flex-col items-center justify-center gap-2 mb-2 relative overflow-hidden">
                                                                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                                                                                <span className="material-symbols-outlined text-pink-500 text-2xl animate-spin">progress_activity</span>
                                                                                <span className="text-[10px] font-bold text-pink-500 animate-pulse">Generating...</span>
                                                                            </div>
                                                                        )}
                                                                        {s.imageUrl && (
                                                                            <div className="relative group cursor-zoom-in mb-2 rounded-lg overflow-hidden border border-[var(--sys-border)]" onClick={() => setGrowthPreviewImage(s.imageUrl)}>
                                                                                <img src={s.imageUrl} alt={`Slide ${s.slideNumber}`} className={`w-full h-auto object-cover transition-all duration-500 ${isImageGenerating(`instagram_post-0-${j}`) ? 'opacity-50 blur-sm scale-105' : 'group-hover:scale-105'}`} />
                                                                                {isImageGenerating(`instagram_post-0-${j}`) && (
                                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                                                                        <span className="material-symbols-outlined text-white text-2xl animate-spin mb-1 drop-shadow-lg">progress_activity</span>
                                                                                    </div>
                                                                                )}
                                                                                <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm ${isImageGenerating(`instagram_post-0-${j}`) ? 'hidden' : ''}`}>
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(s.imageUrl); }}
                                                                                        className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                                        title="Zoom Preview"
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-lg">zoom_in</span>
                                                                                    </button>
                                                                                    <button 
                                                                                        onClick={(e) => { e.stopPropagation(); downloadImage(s.imageUrl, `instagram-post-slide-${j + 1}.png`); }}
                                                                                        className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                                        title="Download Image"
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-lg">download</span>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <button
                                                                            onClick={() => handleGenerateImage('instagram_post', 0, j)}
                                                                            disabled={isImageGenerating(`instagram_post-0-${j}`)}
                                                                            className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-pink-500/10 hover:text-pink-500 hover:border-pink-500/30 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                                                                        >
                                                                            {isImageGenerating(`instagram_post-0-${j}`) ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🖼️'} {isImageGenerating(`instagram_post-0-${j}`) ? 'Generating...' : 'Gen Image'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {growthContent.instagram?.post?.hashtags?.length > 0 && (
                                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                                        {growthContent.instagram.post.hashtags.map((h, j) => (
                                                            <span key={j} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-500/10 text-pink-500">{h}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>


                                    {/* Instagram Story */}
                                    <div className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #833AB410, #FD1D1D10, transparent)' }}>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm">📱</span>
                                                <span className="text-xs font-bold text-[var(--sys-text)]">Instagram Story Script</span>
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/10 text-purple-500">{growthContent.instagram?.story?.slides?.length || 0} slides</span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        onClick={() => handleGenerateAllImages('instagram_story')}
                                                        disabled={growthBatchGenerating || hasAnyImageGenerating}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1 shadow-lg shadow-pink-500/20 border border-pink-400/20 mr-1"
                                                    >
                                                        {growthBatchGenerating ? (
                                                            <>
                                                                <span className="material-symbols-outlined text-[11px] animate-spin">progress_activity</span>
                                                                {growthBatchProgress.current}/{growthBatchProgress.total}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className="material-symbols-outlined text-[11px]">auto_awesome</span>
                                                                Gen All Slide Images
                                                            </>
                                                        )}
                                                    </button>
                                                    <button 
                                                        onClick={() => triggerPublishModal('instagram_story')}
                                                        disabled={isPublishing === 'instagram_story-0'}
                                                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                    >
                                                        {isPublishing === 'instagram_story-0' ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish All
                                                    </button>
                                                    <button onClick={() => handleMarkPosted('instagram_story')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${growthContent.instagram?.story?.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                        {growthContent.instagram?.story?.posted ? '✅ Posted' : '○ Mark'}
                                                    </button>
                                                    <button onClick={() => handleRegeneratePost('instagram_story')} disabled={growthRegenerating === 'instagram_story-0'} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1">
                                                        {growthRegenerating === 'instagram_story-0' ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                    </button>
                                                </div>
                                        </div>
                                        <div className="p-4">
                                            <div className="flex gap-3 overflow-x-auto pb-2">
                                                {(growthContent.instagram?.story?.slides || []).map((s, j) => (
                                                    <div key={j} className="flex-shrink-0 w-48 p-3 rounded-xl bg-[var(--sys-bg)] border border-[var(--sys-border)] flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex items-center gap-1.5 mb-2">
                                                                <span className="text-[10px] font-bold text-purple-500">Slide {s.slideNumber}</span>
                                                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-purple-500/10 text-purple-500">{s.type}</span>
                                                            </div>
                                                            <p className="text-xs text-[var(--sys-text)] font-bold mb-1">{s.text}</p>
                                                            {s.visualDescription && <p className="text-[10px] text-[var(--sys-text-muted)] italic mb-1">🎨 {s.visualDescription}</p>}
                                                            {s.ctaText && <p className="text-[10px] text-emerald-500 font-bold">👆 {s.ctaText}</p>}
                                                            {s.stickerSuggestion && <p className="text-[10px] text-amber-500 mb-2">🏷️ {s.stickerSuggestion}</p>}
                                                        </div>
                                                        <div className="mt-2 space-y-1.5">
                                                            {isImageGenerating(`instagram_story-0-${j}`) && !s.imageUrl && (
                                                                <div className="w-full aspect-[9/16] rounded-lg bg-[var(--sys-bg)] border-2 border-dashed border-purple-500/30 flex flex-col items-center justify-center gap-2 mb-2 relative overflow-hidden">
                                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                                                                    <span className="material-symbols-outlined text-purple-500 text-2xl animate-spin">progress_activity</span>
                                                                    <span className="text-[10px] font-bold text-purple-500 animate-pulse">Generating...</span>
                                                                </div>
                                                            )}
                                                            {s.imageUrl && (
                                                                <div className="relative group cursor-zoom-in mb-2 rounded-lg overflow-hidden border border-[var(--sys-border)]" onClick={() => setGrowthPreviewImage(s.imageUrl)}>
                                                                    <img src={s.imageUrl} alt={`Story ${s.slideNumber}`} className={`w-full h-auto object-cover aspect-[9/16] transition-transform duration-500 ${isImageGenerating(`instagram_story-0-${j}`) ? 'opacity-50 blur-sm scale-105' : 'group-hover:scale-105'}`} />
                                                                    {isImageGenerating(`instagram_story-0-${j}`) && (
                                                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                                                            <span className="material-symbols-outlined text-white text-2xl animate-spin mb-1 drop-shadow-lg">progress_activity</span>
                                                                        </div>
                                                                    )}
                                                                    <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm ${isImageGenerating(`instagram_story-0-${j}`) ? 'hidden' : ''}`}>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(s.imageUrl); }}
                                                                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                            title="Zoom Preview"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">zoom_in</span>
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); downloadImage(s.imageUrl, `instagram-story-slide-${j + 1}.png`); }}
                                                                            className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                            title="Download Image"
                                                                        >
                                                                            <span className="material-symbols-outlined text-sm">download</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <button
                                                                onClick={() => handleGenerateImage('instagram_story', 0, j)}
                                                                disabled={isImageGenerating(`instagram_story-0-${j}`)}
                                                                className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-purple-500/10 hover:text-purple-500 hover:border-purple-500/30 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                                                            >
                                                                {isImageGenerating(`instagram_story-0-${j}`) ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🖼️'} {isImageGenerating(`instagram_story-0-${j}`) ? 'Generating...' : 'Generate Image'}
                                                            </button>
                                                            {s.imageUrl && (
                                                                <button
                                                                    onClick={() => triggerPublishModal('instagram_story', 0, j)}
                                                                    disabled={isPublishing === `instagram_story-0-${j}`}
                                                                    className="w-full py-1.5 rounded-lg text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                                                                >
                                                                    {isPublishing === `instagram_story-0-${j}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish Slide
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Instagram Reel */}
                                        <div className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #FF006610, #FE350410, transparent)' }}>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm">🎬</span>
                                                    <span className="text-xs font-bold text-[var(--sys-text)]">Instagram Reel Script</span>
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-500/10 text-red-500">{growthContent.instagram?.reel?.scenes?.length || 0} scenes</span>
                                                    {growthContent.instagram?.reel?.totalDuration && <span className="text-[10px] text-[var(--sys-text-muted)]">⏱️ {growthContent.instagram.reel.totalDuration}</span>}
                                                    {growthContent.instagram?.reel?.bestTime && <span className="text-[10px] text-[var(--sys-text-muted)]">⏰ {growthContent.instagram.reel.bestTime}</span>}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                     <button 
                                                         onClick={() => triggerPublishModal('instagram_reel')}
                                                         disabled={isPublishing === 'instagram_reel-0'}
                                                         className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                     >
                                                         {isPublishing === 'instagram_reel-0' ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish
                                                     </button>
                                                     <button onClick={() => handleMarkPosted('instagram_reel')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${growthContent.instagram?.reel?.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                         {growthContent.instagram?.reel?.posted ? '✅ Posted' : '○ Mark'}
                                                     </button>
                                                     <button onClick={() => handleRegeneratePost('instagram_reel')} disabled={growthRegenerating === 'instagram_reel-0'} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1">
                                                         {growthRegenerating === 'instagram_reel-0' ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                     </button>
                                                     <button
                                                         onClick={() => handleCopyContent(growthContent.instagram?.reel?.caption + '\n\n' + (growthContent.instagram?.reel?.hashtags || []).join(' '), 'ig-reel')}
                                                         className="px-3 py-1 rounded-lg text-[10px] font-bold text-white cursor-pointer transition-all flex items-center gap-1" style={{ background: 'linear-gradient(135deg, #FF0066, #FE3504)' }}
                                                     >
                                                         {growthCopied === 'ig-reel' ? '✓ Copied!' : '📋 Copy Caption'}
                                                     </button>
                                                 </div>
                                            </div>
                                            <div className="p-4 space-y-4">
                                                {/* Hook + Concept */}
                                                {growthContent.instagram?.reel?.hook && (
                                                    <div className="flex gap-3">
                                                        <div className="flex-1 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                                                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">🎯 Hook (First 3 Seconds)</p>
                                                            <p className="text-sm text-[var(--sys-text)] font-bold">{growthContent.instagram.reel.hook}</p>
                                                        </div>
                                                        {growthContent.instagram?.reel?.audioSuggestion && (
                                                            <div className="flex-shrink-0 w-48 p-3 rounded-xl bg-[var(--sys-bg)] border border-[var(--sys-border)]">
                                                                <p className="text-[9px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-1">🎵 Audio</p>
                                                                <p className="text-xs text-[var(--sys-text)]">{growthContent.instagram.reel.audioSuggestion}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {growthContent.instagram?.reel?.concept && (
                                                    <p className="text-xs text-[var(--sys-text-muted)] italic">💡 Concept: {growthContent.instagram.reel.concept}</p>
                                                )}

                                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                                    {/* Left Column: Video Preview / Storyboard Action (5 cols) */}
                                                    <div className="lg:col-span-5 flex flex-col justify-start">
                                                        {growthContent.instagram?.reel?.videoUrl ? (
                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider">🎥 Video Preview</p>
                                                                <div className="relative aspect-[9/16] w-full max-w-[260px] mx-auto rounded-2xl overflow-hidden bg-black border border-[var(--sys-border)] shadow-lg">
                                                                     <video src={growthContent.instagram.reel.videoUrl} className="w-full h-full object-cover animate-in fade-in" controls playsInline />
                                                                 </div>
                                                                 <button 
                                                                     onClick={() => handleOpenStoryboard()}
                                                                     className="mt-3 w-full py-2 bg-[var(--sys-surface)] hover:bg-[var(--sys-bg)] border border-[var(--sys-border)] text-[var(--sys-text)] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                                                                 >
                                                                     <span className="material-symbols-outlined text-sm">edit</span> Edit Storyboard
                                                                 </button>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider">🎥 Video Studio</p>
                                                                <div className="flex flex-col items-center justify-center p-6 bg-[var(--sys-bg)] rounded-2xl border border-dashed border-[var(--sys-border)] min-h-[300px]">
                                                                    {growthContent.instagram?.reel?.storyboardProjectId ? (
                                                                        <div className="w-full flex flex-col items-center w-full px-4">
                                                                            <div className="w-full flex justify-between text-[10px] font-bold text-primary mb-1.5 uppercase tracking-wider">
                                                                                <span>{growthVideoPhase || 'Generating Video Reel...'}</span>
                                                                                <span>{Math.round(growthVideoProgress)}%</span>
                                                                            </div>
                                                                            <div className="w-full h-2 bg-[var(--sys-bg)] border border-[var(--sys-border)] rounded-full overflow-hidden mb-3">
                                                                                <div 
                                                                                    className="h-full bg-primary transition-all duration-1000 ease-out relative overflow-hidden" 
                                                                                    style={{ width: `${growthVideoProgress}%` }}
                                                                                >
                                                                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                                                                </div>
                                                                            </div>
                                                                            {growthVideoSegments && growthVideoSegments.total > 0 && (
                                                                                <p className="text-[11px] text-[var(--sys-text)] font-bold mb-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                                                    Segment {growthVideoSegments.completed} of {growthVideoSegments.total}
                                                                                </p>
                                                                            )}
                                                                            <p className="text-[10px] text-[var(--sys-text-muted)] mb-5 text-center h-4 flex items-center gap-1">
                                                                                <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                                                {growthVideoEta || 'Estimating time remaining...'}
                                                                            </p>
                                                                            <button 
                                                                                onClick={() => handleOpenStoryboard()}
                                                                                className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--sys-surface)] text-[var(--sys-text)] border border-[var(--sys-border)] hover:bg-[var(--sys-bg)] transition-all flex items-center gap-1.5 cursor-pointer w-full justify-center shadow-sm"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">open_in_new</span> Open Video Studio Details
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3">movie_creation</span>
                                                                            <p className="text-xs font-bold text-[var(--sys-text)] mb-1 text-center">No Video Generated Yet</p>
                                                                            <p className="text-[10px] text-[var(--sys-text-muted)] mb-4 text-center max-w-[200px]">Transform this script into an AI presenter video using Avatar Studio.</p>
                                                                            <button 
                                                                                onClick={() => handleOpenStoryboard()}
                                                                                className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-primary/20"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">movie_edit</span> Create Storyboard
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right Column: Shooting Script (7 cols) */}
                                                    <div className="lg:col-span-7 space-y-4">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-3">🎬 Shooting Script</p>
                                                            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                                                                {(growthContent.instagram?.reel?.scenes || []).map((scene, j) => (
                                                                    <div key={j} className="flex gap-3 p-3 rounded-xl bg-[var(--sys-bg)] border border-[var(--sys-border)]">
                                                                        <div className="flex flex-col items-center flex-shrink-0 w-12">
                                                                            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-[10px] font-black text-red-500">{scene.sceneNumber}</div>
                                                                            {j < (growthContent.instagram.reel.scenes.length - 1) && <div className="w-px flex-1 bg-red-500/20 mt-1" />}
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-red-500/10 text-red-500">{scene.duration}</span>
                                                                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-blue-500/10 text-blue-500">{scene.shotType}</span>
                                                                            </div>
                                                                            <p className="text-xs text-[var(--sys-text)] font-bold mb-1">📹 {scene.action}</p>
                                                                            {scene.voiceover && <p className="text-[11px] text-[var(--sys-text)] mb-1">🎙️ <em>"{scene.voiceover}"</em></p>}
                                                                            {scene.textOverlay && <p className="text-[10px] text-amber-500 font-bold mb-1">📝 {scene.textOverlay}</p>}
                                                                            {scene.visualDescription && <p className="text-[10px] text-[var(--sys-text-muted)] italic">🎨 {scene.visualDescription}</p>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Caption */}
                                                {growthContent.instagram?.reel?.caption && (
                                                    <div className="pt-3 border-t border-[var(--sys-border)]">
                                                        <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2">📝 Caption</p>
                                                        <pre className="text-sm text-[var(--sys-text)] whitespace-pre-wrap font-sans leading-relaxed">{growthContent.instagram.reel.caption}</pre>
                                                        {growthContent.instagram?.reel?.hashtags?.length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {growthContent.instagram.reel.hashtags.map((h, k) => (
                                                                    <span key={k} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-500">{h}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TWITTER/X POSTS */}
                                {growthPlatformTab === 'twitter' && (
                                    <div className="space-y-4">
                                        {(growthContent.twitter || []).map((post, i) => (
                                            <div key={i} className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #1DA1F210, transparent)' }}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm">🐦</span>
                                                        <span className="text-xs font-bold text-[var(--sys-text)]">{post.type === 'thread' ? 'Twitter Thread' : 'Tweet'}</span>
                                                        {post.type === 'thread' && <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-sky-500/10 text-sky-500">{post.tweets?.length} tweets</span>}
                                                        {post.bestTime && <span className="text-[10px] text-[var(--sys-text-muted)]">⏰ {post.bestTime}</span>}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                         <button 
                                                             onClick={() => triggerPublishModal('twitter', i)}
                                                             disabled={isPublishing === `twitter-${i}`}
                                                             className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                         >
                                                             {isPublishing === `twitter-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish
                                                         </button>
                                                         <button onClick={() => handleMarkPosted('twitter', i)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${post.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                             {post.posted ? '✅ Posted' : '○ Mark'}
                                                         </button>
                                                         <button onClick={() => handleRegeneratePost('twitter', i)} disabled={growthRegenerating === `twitter-${i}`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1">
                                                             {growthRegenerating === `twitter-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                         </button>
                                                         <button
                                                             onClick={() => handleGenerateImage('twitter', i)}
                                                             disabled={isImageGenerating(`twitter-${i}`)}
                                                             className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-blue-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1"
                                                         >
                                                             {isImageGenerating(`twitter-${i}`) ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🖼️'} Gen Image
                                                         </button>
                                                         <button
                                                             onClick={() => handleCopyContent(post.tweets?.join('\n\n---\n\n') || '', `tw-${i}`)}
                                                             className="px-3 py-1 rounded-lg text-[10px] font-bold bg-sky-500 text-white hover:bg-sky-600 cursor-pointer transition-all flex items-center gap-1"
                                                         >
                                                             {growthCopied === `tw-${i}` ? '✓ Copied!' : '📋 Copy'}
                                                         </button>
                                                     </div>
                                                </div>
                                                <div className="p-4 space-y-3">
                                                    {(post.tweets || []).map((tweet, j) => (
                                                        <div key={j} className="flex gap-3">
                                                            {post.type === 'thread' && (
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-6 h-6 rounded-full bg-sky-500/10 flex items-center justify-center text-[10px] font-bold text-sky-500">{j + 1}</div>
                                                                    {j < post.tweets.length - 1 && <div className="w-px flex-1 bg-[var(--sys-border)] mt-1" />}
                                                                </div>
                                                            )}
                                                            <div className="flex-1">
                                                                <p className="text-sm text-[var(--sys-text)] leading-relaxed">{tweet}</p>
                                                                <p className="text-[10px] text-[var(--sys-text-muted)] mt-1">{tweet.length}/280</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {post.imageUrl && (
                                                        <div className="mt-3 rounded-lg overflow-hidden border border-[var(--sys-border)] relative group cursor-zoom-in" onClick={() => setGrowthPreviewImage(post.imageUrl)}>
                                                            <img src={post.imageUrl} alt="Generated" className="w-full h-auto object-cover max-h-64 transition-transform duration-500 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm">
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(post.imageUrl); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Zoom Preview"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">zoom_in</span>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); downloadImage(post.imageUrl, `twitter-post-${i + 1}.png`); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Download Image"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">download</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* REDDIT POSTS */}
                                {growthPlatformTab === 'reddit' && (
                                    <div className="space-y-4">
                                        {(growthContent.reddit || []).map((post, i) => (
                                            <div key={i} className="rounded-2xl border border-[var(--sys-border)] bg-[var(--sys-surface)] overflow-hidden">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-[var(--sys-border)]" style={{ background: 'linear-gradient(135deg, #FF450010, transparent)' }}>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm">🟠</span>
                                                        <span className="text-xs font-bold text-[var(--sys-text)]">{post.subreddit}</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-500/10 text-orange-500">{post.tone}</span>
                                                        {post.bestTime && <span className="text-[10px] text-[var(--sys-text-muted)]">⏰ {post.bestTime}</span>}
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                         <button 
                                                             onClick={() => triggerPublishModal('reddit', i)}
                                                             disabled={isPublishing === `reddit-${i}`}
                                                             className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1 disabled:opacity-50"
                                                         >
                                                             {isPublishing === `reddit-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🚀'} Publish
                                                         </button>
                                                         <button onClick={() => handleMarkPosted('reddit', i)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 ${post.posted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-emerald-500'}`}>
                                                             {post.posted ? '✅ Posted' : '○ Mark'}
                                                         </button>
                                                         <button onClick={() => handleRegeneratePost('reddit', i)} disabled={growthRegenerating === `reddit-${i}`} className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-purple-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1">
                                                             {growthRegenerating === `reddit-${i}` ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🔄'} Regen
                                                         </button>
                                                         <button
                                                             onClick={() => handleGenerateImage('reddit', i)}
                                                             disabled={isImageGenerating(`reddit-${i}`)}
                                                             className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[var(--sys-bg)] text-[var(--sys-text-muted)] hover:text-orange-500 cursor-pointer transition-all disabled:opacity-50 flex items-center gap-1"
                                                         >
                                                             {isImageGenerating(`reddit-${i}`) ? <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span> : '🖼️'} Gen Image
                                                         </button>
                                                         <button
                                                             onClick={() => handleCopyContent(post.title + '\n\n' + post.body, `rd-${i}`)}
                                                             className="px-3 py-1 rounded-lg text-[10px] font-bold bg-orange-600 text-white hover:bg-orange-700 cursor-pointer transition-all flex items-center gap-1"
                                                         >
                                                             {growthCopied === `rd-${i}` ? '✓ Copied!' : '📋 Copy All'}
                                                         </button>
                                                     </div>
                                                </div>
                                                <div className="p-4">
                                                    <div className="flex items-center gap-2 mb-3">
                                                        <button onClick={() => handleCopyContent(post.title, `rd-title-${i}`)} className="text-[9px] text-[var(--sys-text-muted)] hover:text-orange-500 cursor-pointer">
                                                            {growthCopied === `rd-title-${i}` ? '✓' : '📋'}
                                                        </button>
                                                        <h4 className="text-sm font-bold text-[var(--sys-text)]">{post.title}</h4>
                                                    </div>
                                                    <pre className="text-sm text-[var(--sys-text)] whitespace-pre-wrap font-sans leading-relaxed">{post.body}</pre>
                                                    {post.imageUrl && (
                                                        <div className="mt-4 rounded-lg overflow-hidden border border-[var(--sys-border)] relative group cursor-zoom-in" onClick={() => setGrowthPreviewImage(post.imageUrl)}>
                                                            <img src={post.imageUrl} alt="Generated" className="w-full h-auto object-cover max-h-64 transition-transform duration-500 group-hover:scale-105" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm">
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setGrowthPreviewImage(post.imageUrl); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Zoom Preview"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">zoom_in</span>
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); downloadImage(post.imageUrl, `reddit-post-${i + 1}.png`); }}
                                                                    className="p-2 bg-white/20 hover:bg-white/40 rounded-full text-white transition-colors backdrop-blur-lg flex items-center justify-center border border-white/20"
                                                                    title="Download Image"
                                                                >
                                                                    <span className="material-symbols-outlined text-xl">download</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* History */}
                        {showGrowthHistory && growthHistory.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-sm font-bold text-[var(--sys-text)] mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">history</span> Past Content
                                </h3>
                                <div className="space-y-2">
                                    {growthHistory.map(day => (
                                        <div key={day._id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs font-bold text-[var(--sys-text)]">{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-500/10 text-purple-500">{day.theme?.replace(/_/g, ' ')}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${day.status === 'posted' ? 'bg-emerald-500/10 text-emerald-500' : day.status === 'partial' ? 'bg-amber-500/10 text-amber-500' : 'bg-[var(--sys-bg)] text-[var(--sys-text-muted)]'}`}>
                                                    {day.status === 'posted' ? '✅ All Posted' : day.status === 'partial' ? '🔶 Partial' : '○ Not Posted'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Publish Account Selection Modal */}
                {publishModalConfig && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-2xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-[var(--sys-border)] flex items-center justify-between">
                                <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">send</span>
                                    Select Account to Publish
                                </h3>
                                <button onClick={() => setPublishModalConfig(null)} className="p-2 hover:bg-[var(--sys-bg)] rounded-xl transition-colors">
                                    <span className="material-symbols-outlined text-[var(--sys-text-muted)] text-[20px]">close</span>
                                </button>
                            </div>
                            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
                                {publishModalConfig.accounts.map(acc => (
                                    <div 
                                        key={acc._id} 
                                        onClick={() => setPublishModalConfig({ ...publishModalConfig, selectedAccountId: acc._id })}
                                        className={`p-3 rounded-xl cursor-pointer transition-all border flex items-center justify-between ${publishModalConfig.selectedAccountId === acc._id ? 'border-primary bg-primary/5' : 'border-[var(--sys-border)] bg-[var(--sys-bg)] hover:border-primary/50'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[var(--sys-surface)] flex items-center justify-center border border-[var(--sys-border)]">
                                                <span className="material-symbols-outlined text-sm">{acc.platform === 'linkedin' ? 'work' : acc.platform === 'twitter' ? 'tag' : acc.platform === 'reddit' ? 'forum' : 'photo_camera'}</span>
                                            </div>
                                            <div>
                                                <div className="font-bold text-sm text-[var(--sys-text)]">{acc.accountName || acc.displayName || acc.platform}</div>
                                                <div className="text-xs text-[var(--sys-text-muted)] capitalize">{acc.platform}</div>
                                            </div>
                                        </div>
                                        {publishModalConfig.selectedAccountId === acc._id && (
                                            <span className="material-symbols-outlined text-primary">check_circle</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="p-4 border-t border-[var(--sys-border)] bg-[var(--sys-bg)] flex justify-end gap-2">
                                <button onClick={() => setPublishModalConfig(null)} className="px-4 py-2 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] transition-all">Cancel</button>
                                <button onClick={executeDirectPublish} className="px-4 py-2 rounded-xl text-sm font-bold bg-primary text-white hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20">
                                    <span className="material-symbols-outlined text-[16px]">send</span> Publish Now
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Image Preview Modal */}
                {growthPreviewImage && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={() => setGrowthPreviewImage(null)}>
                        <div className="absolute top-4 right-4 flex items-center gap-4">
                            <button 
                                onClick={(e) => { e.stopPropagation(); downloadImage(growthPreviewImage, 'mantram-growth-image.png') }}
                                className="px-4 py-2 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-2 shadow-xl"
                            >
                                <span className="material-symbols-outlined text-sm">download</span> Download High-Res
                            </button>
                            <button onClick={() => setGrowthPreviewImage(null)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors backdrop-blur-lg">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <img 
                            src={growthPreviewImage} 
                            alt="Preview" 
                            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl animate-in zoom-in-95 duration-200" 
                            onClick={e => e.stopPropagation()} 
                        />
                    </div>
                )}

                {/* ════════════ TEMPLATES ════════════ */}
                {tab === 'templates' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ marginTop: '-20px' }}>
                        <TemplateManager />
                    </div>
                )}

                {/* ════════════ Q-ADS MANAGER ════════════ */}
                {tab === 'qads' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ marginTop: '-20px' }}>
                        <QAdsManager />
                    </div>
                )}

                {/* ════════════ VIDEO STUDIO MANAGER ════════════ */}
                {tab === 'videoStudio' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ marginTop: '-20px' }}>
                        <VideoStudioManager />
                    </div>
                )}

                {/* ════════════ USAGE ANALYTICS ════════════ */}
                {tab === 'analytics' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ marginTop: '-20px' }}>
                        <UsageAnalytics />
                    </div>
                )}

                {/* ════════════ AVATAR LIBRARY ════════════ */}
                {tab === 'avatars' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ marginTop: '-20px' }}>
                        <AvatarAdmin />
                    </div>
                )}

                {/* ── STORYBOARD FULLSCREEN MODAL ── */}
                {storyboardModalOpen && preSeededStoryboardData && (
                    <div className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-md overflow-hidden" style={{ zIndex: 9999 }}>
                        {/* Header bar */}
                        <div className="h-16 px-6 bg-[var(--sys-surface)] border-b border-[var(--sys-border)] flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="material-symbols-outlined text-primary text-2xl animate-pulse">movie_creation</span>
                                <div>
                                    <h3 className="font-bold text-[var(--sys-text)] text-base">Reel Storyboard Studio</h3>
                                    <p className="text-xs text-[var(--sys-text-muted)]">Customize voice, avatar, and style for your generated Reel script</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => setStoryboardModalOpen(false)} 
                                className="p-2 hover:bg-[var(--sys-bg)] rounded-xl transition-all flex items-center justify-center border border-[var(--sys-border)] hover:border-red-500/30 group"
                            >
                                <span className="material-symbols-outlined text-[var(--sys-text-muted)] group-hover:text-red-500 transition-colors">close</span>
                            </button>
                        </div>
                        {/* Content body */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <Storyboard
                                activeBrand={brands.find(b => (b._id || b.id) === growthSelectedBrandId)}
                                projects={[]}
                                canCreateVideo={true}
                                user={user}
                                initialBrief={preSeededStoryboardData.brief}
                                initialCuts={preSeededStoryboardData.preSeededCuts}
                                initialDuration={preSeededStoryboardData.duration}
                                initialFormat="9:16"
                                initialProjectId={preSeededStoryboardData.projectId}
                                onProjectIdCreated={async (projectId) => {
                                    try {
                                        const updateRes = await API.updateReelVideo(growthContent._id, {
                                            storyboardProjectId: projectId
                                        });
                                        if (updateRes.success) {
                                            setGrowthContent(updateRes.content);
                                        }
                                    } catch (err) {
                                        console.error('[Storyboard Modal] Failed to save project ID:', err);
                                    }
                                }}
                                onVideoComplete={async ({ finalVideoUrl, imageUrl }) => {
                                    try {
                                        const updateRes = await API.updateReelVideo(growthContent._id, {
                                            videoUrl: finalVideoUrl,
                                            imageUrl: imageUrl
                                        });
                                        if (updateRes.success) {
                                            setGrowthContent(updateRes.content);
                                            showToast('Storyboard video compiled and saved!');
                                        }
                                        setStoryboardModalOpen(false);
                                    } catch (err) {
                                        console.error('[Storyboard Modal] Failed to save final video:', err);
                                        showToast('Failed to save final video details', 'error');
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* ── HIGH TRAFFIC WARNING MODAL ── */}
                {showTrafficModal && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                        <div className="bg-[var(--sys-surface)] border border-[var(--sys-border)] max-w-md w-full p-8 rounded-3xl shadow-2xl text-center transform animate-in fade-in zoom-in duration-300 relative">
                            <div className="size-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="material-symbols-outlined text-4xl text-amber-500 animate-pulse">traffic</span>
                            </div>
                            <h3 className="text-xl font-bold text-[var(--sys-text)] mb-3">High Traffic Detected</h3>
                            <p className="text-[var(--sys-text-muted)] text-sm leading-relaxed mb-6">
                                modal is experiencing heavy traffic that's why the generation is little slow but do not worry we are generating best images for you
                            </p>
                            <div className="flex flex-col gap-3">
                                <button 
                                    onClick={() => setShowTrafficModal(false)}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white font-bold text-sm transition-all cursor-pointer border-none shadow-lg shadow-purple-500/20"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>{/* end flex-1 content */}
            </div>{/* end sidebar+content flex */}
            </div>{/* end outer wrapper */}
        </DashboardLayout>
    )
}

/* ── UGC Studio Settings Sub-Component ── */
function UGCStudioSettings() {
    const [flags, setFlags] = useState({})
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState('')

    const token = localStorage.getItem('mantram_token')
    const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '')

    useEffect(() => {
        fetch(`${apiBase}/superadmin/feature-flags`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => { if (d.success) setFlags(d.flags || {}) })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [])

    const update = async (key, value) => {
        setSaving(key)
        try {
            await fetch(`${apiBase}/superadmin/feature-flags/${key}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ value }),
            })
            setFlags(prev => ({ ...prev, [key]: { ...prev[key], value } }))
        } catch {}
        setSaving('')
    }

    if (loading) return <div className="text-center py-20 text-[var(--sys-text-muted)]">Loading UGC settings...</div>

    return (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">smart_display</span>
                        UGC Studio Settings
                    </h3>
                    <p className="text-sm text-[var(--sys-text-muted)] mt-1">Configure Seedance 2.0 (MuAPI) UGC Pro generation</p>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* V1 Legacy Toggle */}
                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">history</span>
                        UGC V1 (HeyGen)
                    </h4>
                    <p className="text-xs text-[var(--sys-text-muted)] mb-4">Keep the legacy HeyGen UGC tab visible in Video Studio.</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={flags.ugcV1Enabled?.value ?? true}
                            onChange={e => update('ugcV1Enabled', e.target.checked)} className="accent-amber-500" />
                        <span className="text-xs font-bold text-[var(--sys-text)]">
                            {(flags.ugcV1Enabled?.value ?? true) ? 'Enabled' : 'Disabled'}
                        </span>
                        {saving === 'ugcV1Enabled' && <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>}
                    </label>
                </div>

                {/* Pro Toggle */}
                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">rocket_launch</span>
                        UGC Pro (Seedance 2.0)
                    </h4>
                    <p className="text-xs text-[var(--sys-text-muted)] mb-4">Show UGC Pro in sidebar for all users.</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={flags.ugcProEnabled?.value ?? true}
                            onChange={e => update('ugcProEnabled', e.target.checked)} className="accent-emerald-500" />
                        <span className="text-xs font-bold text-[var(--sys-text)]">
                            {(flags.ugcProEnabled?.value ?? true) ? 'Enabled' : 'Disabled'}
                        </span>
                        {saving === 'ugcProEnabled' && <span className="material-symbols-outlined text-sm animate-spin text-primary">progress_activity</span>}
                    </label>
                </div>

                {/* Model Selector */}
                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">tune</span>
                        Default Model
                    </h4>
                    <p className="text-xs text-[var(--sys-text-muted)] mb-4">Seedance 2.0 generation mode used for UGC Pro.</p>
                    <select value={flags.ugcProModel?.value || 'seedance-v2.0-i2v'}
                        onChange={e => update('ugcProModel', e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] cursor-pointer outline-none focus:border-[var(--sys-border)]">
                        <option value="seedance-v2.0-i2v">Image-to-Video (I2V) — Recommended</option>
                        <option value="seedance-2.0-omni-reference">Omni Reference — Multi-Image</option>
                        <option value="seedance-v2.0-t2v">Text-to-Video (T2V) — No avatar</option>
                    </select>
                    {saving === 'ugcProModel' && <span className="material-symbols-outlined text-sm animate-spin text-primary mt-2 block">progress_activity</span>}
                </div>

                {/* Quality Selector */}
                <div className="glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                    <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">high_quality</span>
                        Default Quality
                    </h4>
                    <p className="text-xs text-[var(--sys-text-muted)] mb-4">Default quality level for UGC video generation.</p>
                    <select value={flags.ugcProQuality?.value || 'high'}
                        onChange={e => update('ugcProQuality', e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-sm text-[var(--sys-text)] cursor-pointer outline-none focus:border-[var(--sys-border)]">
                        <option value="high">High — Best visual quality</option>
                        <option value="basic">Fast — Quicker generation</option>
                    </select>
                    {saving === 'ugcProQuality' && <span className="material-symbols-outlined text-sm animate-spin text-primary mt-2 block">progress_activity</span>}
                </div>
            </div>

            {/* Info Card */}
            <div className="mt-6 glass-panel rounded-2xl p-5 border border-[var(--sys-border)]">
                <h4 className="text-sm font-black text-[var(--sys-text)] uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">info</span>
                    UGC Pro Pipeline
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div className="bg-[var(--sys-surface)] rounded-xl p-3 border border-[var(--sys-border)]">
                        <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Engine</p>
                        <p className="text-sm font-bold text-[var(--sys-text)] mt-1">Seedance 2.0</p>
                    </div>
                    <div className="bg-[var(--sys-surface)] rounded-xl p-3 border border-[var(--sys-border)]">
                        <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Provider</p>
                        <p className="text-sm font-bold text-[var(--sys-text)] mt-1">MuAPI</p>
                    </div>
                    <div className="bg-[var(--sys-surface)] rounded-xl p-3 border border-[var(--sys-border)]">
                        <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Base Cost</p>
                        <p className="text-sm font-bold text-primary mt-1">15 credits</p>
                    </div>
                    <div className="bg-[var(--sys-surface)] rounded-xl p-3 border border-[var(--sys-border)]">
                        <p className="text-[10px] text-[var(--sys-text-muted)] uppercase font-bold">Max Duration</p>
                        <p className="text-sm font-bold text-[var(--sys-text)] mt-1">30s (chained)</p>
                    </div>
                </div>
            </div>
        </div>
    )
}

const CREDIT_COSTS = { content: 2, creative: 5, brainstorm: 3, seo: 3, photoshoot: 10, trendMatch: 1 }


/* ── Avatar Library Admin ── */
// ─── MODEL CONFIGS ────────────────────────────────────────────────────────────
const ADMIN_MODELS = [
    { key: 'gpt-image-2',  label: 'GPT-4o Image',  sub: 'Highest fidelity',  color: '#10b981' },
    { key: 'nanobanana-2', label: 'NanoBanana 2',   sub: 'Gemini • Creative', color: '#6366f1' },
    { key: 'gpt-image-1',  label: 'GPT Image 1',    sub: 'Fast generation',   color: '#3b82f6' },
    { key: 'flux-pro',     label: 'Flux Pro',        sub: 'Detail-rich',       color: '#f59e0b' },
]
const RATIOS = [
    { r: '9:16', label: 'Portrait', icon: 'stay_current_portrait' },
    { r: '1:1',  label: 'Square',   icon: 'crop_square' },
    { r: '16:9', label: 'Wide',     icon: 'crop_landscape' },
    { r: '4:5',  label: 'Feed',     icon: 'crop_portrait' },
    { r: '3:4',  label: 'Tall',     icon: 'crop_5_4' },
]

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
    panel: { background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' },
    label: { fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 10, display: 'block' },
    chip: (active, color) => ({ padding: '6px 14px', borderRadius: 8, border: `1px solid ${active ? color : 'rgba(255,255,255,0.08)'}`, background: active ? `${color}18` : 'transparent', color: active ? color : 'rgba(255,255,255,0.45)', fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }),
    input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' },
    btn: (primary) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, border: primary ? 'none' : '1px solid rgba(255,255,255,0.1)', background: primary ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(255,255,255,0.05)', color: primary ? '#fff' : 'rgba(255,255,255,0.65)', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }),
}

// ─── ADMIN IMAGE STUDIO ───────────────────────────────────────────────────────
function AdminImageStudio() {
    const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '')
    const getToken = () => localStorage.getItem('mantram_token')

    const [mode, setMode] = React.useState('avatar')
    const [model, setModel] = React.useState('gpt-image-2')
    const [ratio, setRatio] = React.useState('9:16')
    const [options, setOptions] = React.useState({ origin: 'south-asian', ageRange: 'adult', genderExpression: 'feminine', clothingStyle: 'smart-casual', environment: 'minimalist', lightingMood: 'natural-daylight', additionalDetails: '' })
    const [prompt, setPrompt] = React.useState('')
    const [negative, setNegative] = React.useState('')
    const [generating, setGenerating] = React.useState(false)
    const [variants, setVariants] = React.useState([])
    const [selected, setSelected] = React.useState(null)
    const [genPrompt, setGenPrompt] = React.useState('')
    const [toast, setToast] = React.useState(null)
    const [saveOpen, setSaveOpen] = React.useState(false)
    const [saveName, setSaveName] = React.useState('')
    const [saveSection, setSaveSection] = React.useState('general')
    const [saveCategoryId, setSaveCategoryId] = React.useState('')
    const [saveCategories, setSaveCategories] = React.useState([])
    const [saving, setSaving] = React.useState(false)

    const notify = (msg, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3200) }

    const generate = async () => {
        if (generating) return
        if (mode === 'creative' && !prompt.trim()) { notify('Enter a prompt','err'); return }
        setGenerating(true); setVariants([]); setSelected(null)
        try {
            const body = mode === 'creative'
                ? { directPrompt: prompt.trim(), negativePrompt: negative.trim(), aspectRatio: ratio, model }
                : { ...options, aspectRatio: ratio, model }
            const r = await fetch(`${apiBase}/avatar-studio/admin/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(body),
            })
            const d = await r.json()
            if (!d.success) throw new Error(d.error || 'Generation failed')
            setVariants(d.variants || [])
            setGenPrompt(d.prompt || '')
            const first = (d.variants||[]).find(v=>!v.failed&&v.url)
            if (first) setSelected(first.slot)
            const ok = (d.variants||[]).filter(v=>!v.failed).length
            notify(`${ok}/3 variants ready`)
        } catch(e) { notify(e.message,'err') }
        setGenerating(false)
    }

    const saveTemplate = async () => {
        if (!saveName.trim()) { notify('Name required','err'); return }
        const url = variants[selected]?.url; if (!url) return
        setSaving(true)
        try {
            const r = await fetch(`${apiBase}/superadmin/templates/promote-from-generated`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ name: saveName.trim(), previewUrl: url, savedPrompt: genPrompt, studioOrigin: mode, studioSection: saveSection, categoryId: saveCategoryId || undefined }),
            })
            const d = await r.json()
            if (!d.success) throw new Error(d.error)
            notify('Saved to Template Library'); setSaveOpen(false); setSaveName('')
        } catch(e) { notify(e.message,'err') }
        setSaving(false)
    }

    const openSaveModal = async () => {
        setSaveOpen(true)
        try {
            const r = await fetch(`${apiBase}/superadmin/templates/categories`, { headers: { Authorization: `Bearer ${getToken()}` } })
            const d = await r.json()
            setSaveCategories(d.categories || [])
        } catch {}
    }

    const selectedUrl = selected !== null ? variants[selected]?.url : null
    const modelCfg = ADMIN_MODELS.find(m=>m.key===model) || ADMIN_MODELS[0]

    return (
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minHeight: 520 }}>

            {/* Toast */}
            {toast && <div style={{ position:'fixed', top:24, right:24, zIndex:9999, padding:'12px 20px', borderRadius:12, fontSize:13, fontWeight:700, background: toast.type==='err' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)', border:`1px solid ${toast.type==='err'?'rgba(239,68,68,0.25)':'rgba(99,102,241,0.25)'}`, color: toast.type==='err'?'#f87171':'#a5b4fc', backdropFilter:'blur(12px)', pointerEvents:'none' }}>{toast.msg}</div>}

            {/* Save modal */}
            {saveOpen && selectedUrl && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, backdropFilter:'blur(4px)' }} onClick={()=>setSaveOpen(false)}>
                    <div style={{ background:'#0d0d18', border:'1px solid rgba(255,255,255,0.1)', borderRadius:20, padding:28, width:460 }} onClick={e=>e.stopPropagation()}>
                        <p style={{ fontSize:15, fontWeight:800, color:'#fff', margin:'0 0 16px' }}>Save as Template</p>
                        <img src={selectedUrl} alt="" style={{ width:'100%', height:140, objectFit:'cover', objectPosition:'top', borderRadius:12, marginBottom:14 }} />
                        <input value={saveName} onChange={e=>setSaveName(e.target.value)} placeholder="Template name…" style={{ ...S.input, marginBottom:10 }} />
                        <select value={saveSection} onChange={e=>setSaveSection(e.target.value)} style={{ ...S.input, marginBottom:10 }}>
                            {[{v:'ai_create',l:'AI Create'},{v:'carousel',l:'Carousel'},{v:'campaign',l:'Campaign'},{v:'campaign_shot',l:'Campaign Shot'},{v:'video_ugc',l:'Video UGC'},{v:'video_qads',l:'Video Q-Ads'},{v:'avatar',l:'Avatar'},{v:'general',l:'General'},{v:'homepage',l:'Homepage'}].map(s=><option key={s.v} value={s.v}>{s.l}</option>)}
                        </select>
                        <select value={saveCategoryId} onChange={e=>setSaveCategoryId(e.target.value)} style={{ ...S.input, marginBottom:14 }}>
                            <option value="">No Category</option>
                            {saveCategories.map(c=><option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                            <button onClick={()=>setSaveOpen(false)} style={S.btn(false)}>Cancel</button>
                            <button onClick={saveTemplate} disabled={saving} style={S.btn(true)}>{saving?'Saving…':'Save Template'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LEFT PANEL ── */}
            <div style={{ width:320, flexShrink:0, display:'flex', flexDirection:'column', gap:14 }}>

                {/* Mode selector */}
                <div style={S.panel}>
                    <span style={S.label}>Generation Mode</span>
                    <div style={{ display:'flex', gap:6 }}>
                        {[{id:'avatar',label:'Avatar',icon:'person'},{id:'creative',label:'Creative',icon:'brush'}].map(t=>(
                            <button key={t.id} onClick={()=>setMode(t.id)} style={{ ...S.chip(mode===t.id,'#6366f1'), flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize:15 }}>{t.icon}</span>{t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Model selector */}
                <div style={S.panel}>
                    <span style={S.label}>Image Model</span>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {ADMIN_MODELS.map(m=>(
                            <button key={m.key} onClick={()=>setModel(m.key)} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:`1px solid ${model===m.key?m.color:'rgba(255,255,255,0.07)'}`, background:model===m.key?`${m.color}12`:'transparent', cursor:'pointer', transition:'all 0.15s', textAlign:'left' }}>
                                <span style={{ width:8, height:8, borderRadius:'50%', background:m.color, flexShrink:0, opacity:model===m.key?1:0.35 }} />
                                <span style={{ flex:1 }}>
                                    <span style={{ display:'block', fontSize:13, fontWeight:700, color:model===m.key?'#fff':'rgba(255,255,255,0.55)' }}>{m.label}</span>
                                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', fontWeight:500 }}>{m.sub}</span>
                                </span>
                                {model===m.key && <span className="material-symbols-outlined" style={{ fontSize:16, color:m.color }}>check_circle</span>}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Aspect Ratio */}
                <div style={S.panel}>
                    <span style={S.label}>Aspect Ratio</span>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {RATIOS.map(r=>(
                            <button key={r.r} onClick={()=>setRatio(r.r)} style={S.chip(ratio===r.r,'#6366f1')}>
                                {r.label} <span style={{ opacity:0.5, fontSize:10 }}>{r.r}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Controls */}
                {mode==='avatar' ? (
                    <div style={S.panel}>
                        <span style={S.label}>Avatar Options</span>
                        <AvatarOptionsForm options={options} onChange={(k,v)=>setOptions(p=>({...p,[k]:v}))} errors={{}} compact={true} />
                    </div>
                ) : (
                    <div style={S.panel}>
                        <span style={S.label}>Prompt</span>
                        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={5} placeholder="Describe the image…" style={S.input} />
                        <span style={{ ...S.label, marginTop:12 }}>Negative Prompt</span>
                        <textarea value={negative} onChange={e=>setNegative(e.target.value)} rows={2} placeholder="Elements to avoid…" style={S.input} />
                    </div>
                )}

                {/* Generate CTA */}
                <button onClick={generate} disabled={generating} style={{ ...S.btn(true), width:'100%', padding:'13px 0', fontSize:14, background:generating?'rgba(99,102,241,0.3)':'linear-gradient(135deg,#6366f1,#4f46e5)', cursor:generating?'not-allowed':'pointer', opacity:generating?0.7:1 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18, animation:generating?'spin 1s linear infinite':'none' }}>{generating?'progress_activity':'auto_awesome'}</span>
                    {generating ? 'Generating 3 variants…' : `Generate · ${modelCfg.label}`}
                </button>
                <p style={{ textAlign:'center', fontSize:11, color:'rgba(99,102,241,0.5)', margin:'-6px 0 0', fontWeight:600 }}>Super Admin · Unlimited · S3-persisted</p>
            </div>

            {/* ── RIGHT: CANVAS ── */}
            <div style={{ flex:1, minWidth:0 }}>
                {variants.length===0 && !generating && (
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:440, border:'1px dashed rgba(255,255,255,0.07)', borderRadius:16, gap:12, color:'rgba(255,255,255,0.18)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize:48 }}>image_search</span>
                        <p style={{ fontSize:14, fontWeight:600, margin:0 }}>Configure and generate</p>
                        <p style={{ fontSize:12, margin:0 }}>3 parallel variants — each saved to S3</p>
                    </div>
                )}

                {(generating || variants.length>0) && (
                    <>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                            {[0,1,2].map(slot=>{
                                const v = variants[slot]
                                const ok = !generating && v && !v.failed && v.url
                                const fail = !generating && v && v.failed
                                const sel = selected===slot
                                return (
                                    <div key={slot} onClick={()=>ok&&setSelected(slot)} style={{ position:'relative', aspectRatio:ratio.replace(':','/'), borderRadius:14, overflow:'hidden', border:`1.5px solid ${sel?'rgba(99,102,241,0.7)':'rgba(255,255,255,0.07)'}`, background:'rgba(255,255,255,0.03)', cursor:ok?'pointer':'default', boxShadow:sel?'0 0 0 3px rgba(99,102,241,0.2)':'none', transition:'all 0.2s' }}>
                                        {generating && (
                                            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10 }}>
                                                <div style={{ width:32, height:32, borderRadius:'50%', border:'2px solid rgba(99,102,241,0.2)', borderTopColor:'#6366f1', animation:'spin 0.9s linear infinite' }} />
                                                <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)', fontWeight:600 }}>Generating…</span>
                                            </div>
                                        )}
                                        {ok && <img src={v.url} alt={`Variant ${slot+1}`} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />}
                                        {fail && (
                                            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:16, gap:6 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize:28, color:'rgba(239,68,68,0.4)' }}>broken_image</span>
                                                <span style={{ fontSize:10, color:'rgba(239,68,68,0.5)', textAlign:'center', lineHeight:1.4 }}>{v.error?.substring(0,80)||'Failed'}</span>
                                            </div>
                                        )}
                                        {ok && (
                                            <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'24px 12px 10px', background:'linear-gradient(to top,rgba(0,0,0,0.7),transparent)' }}>
                                                <span style={{ fontSize:10, fontWeight:700, color:sel?'#a5b4fc':'rgba(255,255,255,0.5)' }}>{sel?'● Selected':'Option '+(slot+1)}</span>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>

                        {selectedUrl && (
                            <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
                                <button onClick={generate} disabled={generating} style={S.btn(false)}>
                                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>refresh</span>Regenerate
                                </button>
                                <a href={selectedUrl} download target="_blank" rel="noopener" style={{ ...S.btn(false), textDecoration:'none' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>download</span>Download
                                </a>
                                <button onClick={()=>{setSaveName('');openSaveModal()}} style={{ ...S.btn(false), borderColor:'rgba(99,102,241,0.3)', color:'#a5b4fc' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>bookmark_add</span>Save as Template
                                </button>
                            </div>
                        )}

                        {genPrompt && !generating && (
                            <details style={{ marginTop:14 }}>
                                <summary style={{ fontSize:11, color:'rgba(255,255,255,0.2)', cursor:'pointer', fontWeight:600, userSelect:'none' }}>View assembled prompt</summary>
                                <pre style={{ marginTop:8, padding:12, background:'rgba(255,255,255,0.03)', borderRadius:10, fontSize:11, color:'rgba(255,255,255,0.3)', whiteSpace:'pre-wrap', wordBreak:'break-word', lineHeight:1.6 }}>{genPrompt}</pre>
                            </details>
                        )}
                    </>
                )}
            </div>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
    )
}

// ─── AVATAR LIBRARY ADMIN ────────────────────────────────────────────────────
// Defined here — BEFORE AvatarAdmin which uses it — satisfying definition-before-use rule
function AvatarLibraryAdmin() {
    const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '')
    const getToken = () => localStorage.getItem('mantram_token')

    const [avatars, setAvatars] = React.useState([])
    const [loading, setLoading] = React.useState(true)
    const [toast, setToast] = React.useState(null)
    const [filter, setFilter] = React.useState('all') // 'all' | 'public' | 'mine'
    const [busy, setBusy] = React.useState({})

    const notify = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3200) }

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const r = await fetch(`${apiBase}/avatar-studio/library`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            })
            const d = await r.json()
            if (d.success) {
                const all = [
                    ...(d.publicAvatars || []).map(a => ({ ...a, _isPublic: true })),
                    ...(d.myAvatars || []).map(a => ({ ...a, _isPublic: false })),
                ]
                setAvatars(all)
            }
        } catch (e) { notify(e.message, 'err') }
        setLoading(false)
    }, [apiBase])

    React.useEffect(() => { load() }, [load])

    const doAction = async (avatarId, action) => {
        setBusy(p => ({ ...p, [avatarId]: action }))
        try {
            let url, method = 'POST'
            if (action === 'delete') {
                url = `${apiBase}/video-studio/ugc-pro/avatars/${avatarId}`
                method = 'DELETE'
            } else if (action === 'publish') {
                url = `${apiBase}/avatar-studio/admin/publish/${avatarId}`
            } else if (action === 'unpublish') {
                url = `${apiBase}/avatar-studio/admin/unpublish/${avatarId}`
            }
            const r = await fetch(url, {
                method,
                headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            })
            const d = await r.json()
            if (!d.success) throw new Error(d.error || `${action} failed`)
            notify(`\u2713 ${action} complete`)
            load()
        } catch (e) { notify(e.message, 'err') }
        setBusy(p => { const n = { ...p }; delete n[avatarId]; return n })
    }

    const filtered = filter === 'public' ? avatars.filter(a => a._isPublic)
        : filter === 'mine' ? avatars.filter(a => !a._isPublic)
        : avatars

    return (
        <div>
            {toast && (
                <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, padding: '12px 20px', borderRadius: 12, fontSize: 13, fontWeight: 700, background: toast.type === 'err' ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)', border: `1px solid ${toast.type === 'err' ? 'rgba(239,68,68,0.25)' : 'rgba(99,102,241,0.25)'}`, color: toast.type === 'err' ? '#f87171' : '#a5b4fc', backdropFilter: 'blur(12px)', pointerEvents: 'none' }}>{toast.msg}</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                {[
                    { id: 'all', label: `All (${avatars.length})` },
                    { id: 'public', label: `Published (${avatars.filter(a => a._isPublic).length})` },
                    { id: 'mine', label: `User-Generated (${avatars.filter(a => !a._isPublic).length})` },
                ].map(f => (
                    <button key={f.id} onClick={() => setFilter(f.id)}
                        style={{ ...S.chip(filter === f.id, '#6366f1') }}>
                        {f.label}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={load} style={{ ...S.btn(false), padding: '8px 14px', fontSize: 12 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>refresh</span> Refresh
                </button>
            </div>
            {loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    {[...Array(12)].map((_, i) => (
                        <div key={i} style={{ aspectRatio: '9/16', borderRadius: 12, background: 'rgba(255,255,255,0.04)', animation: 'pulse 1.5s infinite' }} />
                    ))}
                </div>
            )}
            {!loading && filtered.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.25)', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 44 }}>person_off</span>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>No avatars in this view</div>
                </div>
            )}
            {!loading && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                    {filtered.map(avatar => (
                        <div key={avatar._id} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${avatar._isPublic ? 'rgba(20,184,166,0.5)' : 'rgba(255,255,255,0.07)'}`, background: '#1a1a20', aspectRatio: '9/16' }}>
                            {avatar.imageUrl && (
                                <img src={avatar.imageUrl} alt={avatar.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                            )}
                            {avatar._isPublic && (
                                <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 20, fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, background: 'rgba(20,184,166,0.82)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                                    Published
                                </div>
                            )}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', padding: '24px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                                    {avatar.name || 'Untitled'}
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    <button
                                        onClick={() => doAction(avatar._id, avatar._isPublic ? 'unpublish' : 'publish')}
                                        disabled={!!busy[avatar._id]}
                                        style={{ flex: 1, background: avatar._isPublic ? 'rgba(239,68,68,0.2)' : 'rgba(20,184,166,0.22)', border: 'none', borderRadius: 6, color: avatar._isPublic ? '#f87171' : '#2dd4bf', fontSize: 9, fontWeight: 800, cursor: 'pointer', padding: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}
                                    >
                                        {busy[avatar._id] === (avatar._isPublic ? 'unpublish' : 'publish') ? '\u2026' : (avatar._isPublic ? 'Unpublish' : 'Publish')}
                                    </button>
                                    <button
                                        onClick={() => { if (confirm('Delete this avatar?')) doAction(avatar._id, 'delete') }}
                                        disabled={!!busy[avatar._id]}
                                        style={{ width: 28, background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: 6, color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
    )
}

// ─── AVATAR ADMIN WRAPPER ─────────────────────────────────────────────────────
function AvatarAdmin() {
    const [tab, setTab] = React.useState('generate')
    const tabs = [
        { id:'generate', label:'Image Studio',    icon:'auto_awesome' },
        { id:'library',  label:'Avatar Library',  icon:'grid_view' },
    ]
    return (
        <div>
            <div style={{ display:'flex', gap:2, marginBottom:24, borderBottom:'1px solid rgba(255,255,255,0.07)', paddingBottom:0 }}>
                {tabs.map(t=>(
                    <button key={t.id} onClick={()=>setTab(t.id)} style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 18px', border:'none', borderBottom:`2px solid ${tab===t.id?'#6366f1':'transparent'}`, background:'transparent', color:tab===t.id?'#a5b4fc':'rgba(255,255,255,0.35)', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all 0.15s', marginBottom:-1 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:17 }}>{t.icon}</span>{t.label}
                    </button>
                ))}
            </div>
            {tab==='generate' && <AdminImageStudio />}
            {tab==='library'  && <AvatarLibraryAdmin />}
        </div>
    )
}

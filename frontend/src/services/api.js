/**
 * Mantram AI — Frontend API Service
 * Centralized API client for all backend communication.
 * Handles auth tokens, error handling, and response parsing.
 */

export const API_BASE = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');

/**
 * Utility to proxy S3 URLs through our backend to avoid CORS issues in the Canvas.
 * Required for Fabric.js FabricImage.fromURL calls with crossOrigin: 'anonymous'.
 */
export const getCorsUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    
    // Check if it's an S3 URL or external asset that likely lacks CORS headers
    const isS3 = url.includes('s3.amazonaws.com') || url.includes('.s3.') || url.includes('mantram-assets');
    const isUnsplash = url.includes('images.unsplash.com');
    
    if (isS3 || isUnsplash) {
        // Return proxied URL
        return `${API_BASE}/media/proxy?url=${encodeURIComponent(url)}`;
    }
    
    return url;
};


// Token management
let authToken = localStorage.getItem('mantram_token') || '';
let dynamicTokenProvider = null;

export const setToken = (token) => {
    authToken = token;
    localStorage.setItem('mantram_token', token);
};

export const setDynamicTokenProvider = (provider) => {
    dynamicTokenProvider = provider;
};

export const clearToken = () => {
    authToken = '';
    localStorage.removeItem('mantram_token');
};

export const getToken = () => authToken;

// Base fetch wrapper
export async function apiFetch(endpoint, options = {}) {
    let token = authToken;

    // Use dynamic token (like Shopify Session Token) if provider is registered
    if (dynamicTokenProvider) {
        const dToken = await dynamicTokenProvider();
        if (dToken) token = dToken;
    }

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    // Configurable timeout — default 1 hour (3,600,000ms), heavy operations can pass longer
    const { timeout: timeoutMs = 3600000, signal: externalSignal, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // If caller provides an external signal (for stop buttons), wire it up
    if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort());
    }

    let response;
    try {
        // Ensure endpoint starts with /
        const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`; 
        response = await fetch(`${API_BASE}${url}`, {
            ...fetchOptions,
            headers,
            signal: controller.signal,
        });
    } catch (e) {
        clearTimeout(timer);
        if (e.name === 'AbortError') throw new Error('Request timed out — the server is still processing. Please try again.');
        
        // Improved network error detection — 'Failed to fetch' / 'Load failed' covers many scenarios
        const msg = e.message || '';
        if (msg.includes('Load failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            // Try to determine the likely cause
            if (msg.includes('ERR_CONNECTION_REFUSED') || msg.includes('ECONNREFUSED')) {
                throw new Error('Server is not reachable — it may be restarting. Please wait a moment and try again.');
            }
            if (msg.includes('ERR_CONNECTION_RESET') || msg.includes('ECONNRESET')) {
                throw new Error('Connection was reset mid-request — the server may have restarted. Please try again.');
            }
            // Generic connectivity failure
            throw new Error('Could not connect to the server. Please check your internet connection and try again. If the problem persists, the server may be restarting.');
        }
        throw new Error(msg || 'Unknown network error');
    }
    clearTimeout(timer);

    // Handle non-JSON responses (e.g. HTML 404 pages from Vite proxy)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status} — ensure backend is running on port 3001`);
        }
        // Try to parse anyway for edge cases
        const text = await response.text();
        try { return JSON.parse(text); } catch { throw new Error(`Server returned non-JSON response (${response.status})`); }
    }

    const data = await response.json();

    if (!response.ok) {
        // Broadcast global unauthorized event if token is invalid or expired
        if (response.status === 401 && token) {
            window.dispatchEvent(new CustomEvent('mantram:unauthorized', { detail: { message: data.error || 'Session expired' } }));
        }

        const err = new Error(data.error || 'API request failed');
        // Attach domain-specific metadata for specialized error UI (e.g. SEO Audit Guard)
        if (data.diagnosis) err.diagnosis = data.diagnosis;
        if (data.metrics) err.metrics = data.metrics;
        if (data.strategyUsed) err.strategyUsed = data.strategyUsed;
        if (data.attemptsMade) err.attemptsMade = data.attemptsMade;
        
        if (data.isProviderError) {
            err.isProviderError = true;
            err.provider = data.provider;
        }
        throw err;
    }

    return data;
}

// ============ Auth API ============
export const auth = {
    register: (data) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    getProfile: () => apiFetch('/auth/me'),
    updateProfile: (data) => apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
    google: () => apiFetch('/auth/google'),
    claimUserId: (userId) => apiFetch('/auth/claim-userid', { method: 'PUT', body: JSON.stringify({ userId }) }),
    changePassword: (currentPassword, newPassword) => apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    verifyEmail: (token) => apiFetch(`/auth/verify-email?token=${token}`),
    completeWalkthrough: (studioId) => apiFetch('/auth/walkthrough', { method: 'PUT', body: JSON.stringify({ studioId }) }),
};

// ============ Brands API ============
export const brands = {
    list: (params = {}) => apiFetch(`/brands?${new URLSearchParams(params)}`),
    get: (id) => apiFetch(`/brands/${id}`),
    create: (data) => apiFetch('/brands', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateDNA: (id, dnaUpdates) => apiFetch(`/brands/${id}/dna`, { method: 'PUT', body: JSON.stringify(dnaUpdates) }),
    updateKnowledge: (id, section, data) => apiFetch(`/brands/${id}/knowledge`, { method: 'PUT', body: JSON.stringify({ section, data }) }),
    updateStatus: (id, status) => apiFetch(`/brands/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    updateAutonomy: (id, settings) => apiFetch(`/brands/${id}/autonomy`, { method: 'PUT', body: JSON.stringify(settings) }),
    getAuditLog: (id, page = 1) => apiFetch(`/brands/${id}/audit-log?page=${page}`),
    rescan: (id) => apiFetch(`/brands/${id}/rescan`, { method: 'POST', timeout: 120000 }),
    delete: (id) => apiFetch(`/brands/${id}`, { method: 'DELETE' }),
    // Custom Templates
    getTemplates: (id) => apiFetch(`/brands/${id}/templates`),
    saveTemplate: (id, data) => apiFetch(`/brands/${id}/templates`, { method: 'POST', body: JSON.stringify(data) }),
    deleteTemplate: (id, templateId) => apiFetch(`/brands/${id}/templates/${templateId}`, { method: 'DELETE' }),
    // Custom Categories
    getCategories: (id) => apiFetch(`/brands/${id}/categories`),
    saveCategory: (id, data) => apiFetch(`/brands/${id}/categories`, { method: 'POST', body: JSON.stringify(data) }),
    deleteCategory: (id, categoryId) => apiFetch(`/brands/${id}/categories/${categoryId}`, { method: 'DELETE' }),
    // Knowledge Bank
    getKnowledgeEntries: (id) => apiFetch(`/brands/${id}/knowledge/entries`),
    ingestKnowledge: (id, formData) => {
        // Use raw fetch for FormData (file uploads)
        const token = localStorage.getItem('mantram_token') || '';
        return fetch(`${API_BASE}/brands/${id}/knowledge/ingest`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: formData,
        }).then(r => r.json());
    },
    deleteKnowledgeEntry: (id, entryId) => apiFetch(`/brands/${id}/knowledge/entries/${entryId}`, { method: 'DELETE' }),
};

// ============ Content API ============
export const content = {
    providers: () => apiFetch('/content/providers'),
    generate: (data) => apiFetch('/content/generate', { method: 'POST', body: JSON.stringify(data) }),
    // Agentic pipeline (v2 — with real intelligence gathering)
    agenticStart: (data) => apiFetch('/content/agentic/start', { method: 'POST', body: JSON.stringify(data) }),
    agenticEdit: (id, data) => apiFetch(`/content/agentic/${id}/edit`, { method: 'POST', body: JSON.stringify(data) }),
    agenticABVariants: (id) => apiFetch(`/content/agentic/${id}/ab-variants`, { method: 'POST' }),
    // Blog-specific agentic pipeline
    blogGenerate: (data) => apiFetch('/content/agentic/blog/generate', { method: 'POST', body: JSON.stringify(data) }),
    blogGenerateImage: (id, data) => apiFetch(`/content/agentic/blog/${id}/generate-image`, { method: 'POST', body: JSON.stringify(data) }),
    blogAssist: (data) => apiFetch('/content/agentic/assist', { method: 'POST', body: JSON.stringify(data) }),
    blogPublishWebsite: (id) => apiFetch(`/content/agentic/blog/${id}/publish-website`, { method: 'POST' }),
    parseIntent: (input) => apiFetch('/content/agentic/parse-intent', { method: 'POST', body: JSON.stringify({ input }) }),
    generateVisualPrompt: (data) => apiFetch('/content/agentic/visual-prompt', { method: 'POST', body: JSON.stringify(data) }),
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/content?${query}`);
    },
    get: (id) => apiFetch(`/content/${id}`),
    update: (id, data) => apiFetch(`/content/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    feedback: (id, data) => apiFetch(`/content/${id}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
    regenerate: (id, data) => apiFetch(`/content/${id}/regenerate`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/content/${id}`, { method: 'DELETE' }),
    refine: (id, data) => apiFetch(`/content/${id}/refine`, { method: 'POST', body: JSON.stringify(data) }),
    refineText: (data) => apiFetch('/content/refine-text', { method: 'POST', body: JSON.stringify(data) }),
    youtube: (data) => apiFetch('/content/agentic/youtube', { method: 'POST', body: JSON.stringify(data) }),
    youtubeSeo: (data) => apiFetch('/content/agentic/youtube-seo', { method: 'POST', body: JSON.stringify(data) }),
    trending: (data) => apiFetch('/content/trending', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Templates API ============
export const templates = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/templates?${query}`);
    },
    get: (id) => apiFetch(`/templates/${id}`),
    use: (id, data) => apiFetch(`/templates/${id}/use`, { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    // ── DNA Template Intelligence ──────────────────────────────────────────────
    // Returns all user-created templates scoped to a brand (for the template grid)
    myBrand: (brandId) => apiFetch(`/templates/my-brand?brandId=${brandId}`),
    // Runs Gemini 2-pass vision DNA extraction on a reference image, creates Template doc
    analyzeAndCreate: (data) => apiFetch('/templates/analyze-and-create', {
        method: 'POST',
        body: JSON.stringify(data),
        timeout: 90000,  // DNA extraction can take 30-45s
    }),
    // Soft-delete a user-created template (sets isActive=false)
    delete: (id) => apiFetch(`/templates/${id}`, { method: 'DELETE' }),
    // Upload a reference image for template creation — returns S3 URL
    uploadReferenceImage: (file) => {
        const token = localStorage.getItem('mantram_token') || '';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'template-references');
        return fetch(`${API_BASE}/media/upload`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: formData,
        }).then(r => r.json());
    },
};

// ============ Creatives API ============
export const creatives = {
    generate: (data, options = {}) => apiFetch('/creatives/generate', { method: 'POST', body: JSON.stringify(data), ...options }),
    pollProgress: (progressId) => apiFetch(`/creatives/progress/${progressId}`),
    enhancePrompt: (data) => apiFetch('/creatives/enhance-prompt', { method: 'POST', body: JSON.stringify(data) }),
    generateCampaignCopy: (data) => apiFetch('/creatives/generate-campaign-copy', { method: 'POST', body: JSON.stringify(data) }),
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/creatives?${query}`);
    },
    feedback: (id, data) => apiFetch(`/creatives/${id}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/creatives/${id}`, { method: 'DELETE' }),
    saveToBank: (data) => apiFetch('/creatives/save-to-bank', { method: 'POST', body: JSON.stringify(data) }),
    imageBank: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/creatives/image-bank?${query}`);
    },
    uploadToBank: (data) => apiFetch('/creatives/upload-to-bank', { method: 'POST', body: JSON.stringify(data) }),
    // Additional methods for CreativeStudio.jsx
    lifestyleMockup: (data) => apiFetch('/creatives/lifestyle-mockup', { method: 'POST', body: JSON.stringify(data) }),
    virtualTryon: (data) => apiFetch('/creatives/virtual-tryon', { method: 'POST', body: JSON.stringify(data) }),
    vtoStatus: (requestId, brandId) => apiFetch(`/creatives/virtual-tryon/status/${requestId}?brandId=${brandId}`),
    // Carousel generation
    generateCarousel: (data) => apiFetch('/creatives/carousel', { method: 'POST', body: JSON.stringify(data) }),
    getCarousel: (carouselId) => apiFetch(`/creatives/carousel/${carouselId}`),
    analyzeCarouselTheme: (data) => apiFetch('/creatives/carousel/analyze-theme', { method: 'POST', body: JSON.stringify(data) }),
    // Agentic creative pipeline (multi-agent: ArtDirector + PromptEngineer + StyleCritic)
    agenticStart: (data) => apiFetch('/creatives/agentic/start', { method: 'POST', body: JSON.stringify(data) }),
    agenticVariations: (id) => apiFetch(`/creatives/agentic/${id}/variations`, { method: 'POST' }),
    agenticRegenerate: (id, data) => apiFetch(`/creatives/agentic/${id}/regenerate`, { method: 'POST', body: JSON.stringify(data) }),
    // Image upscaling (2K Sharp / 4K Fal.ai ESRGAN)
    upscale: (data) => apiFetch('/creatives/upscale', { method: 'POST', body: JSON.stringify(data), timeout: 60000 }),
    // ── Background Generation Jobs ──
    // Returns jobId in ~100ms; pipeline runs server-side regardless of tab state
    createJob: (data) => apiFetch('/creatives/jobs', { method: 'POST', body: JSON.stringify(data) }),
    pollJob: (jobId) => apiFetch(`/creatives/jobs/${jobId}`),
    listJobs: () => apiFetch('/creatives/jobs'),
    cancelJob: (jobId) => apiFetch(`/creatives/jobs/${jobId}`, { method: 'DELETE' }),
    suggestCopy: (data) => apiFetch('/creatives/suggest-copy', { method: 'POST', body: JSON.stringify(data) }),
    // AI Image Editing (Gemini Nano Banana 2)
    editImage: (data) => apiFetch('/creatives/edit-image', { method: 'POST', body: JSON.stringify(data), timeout: 200000 }),
    // Campaign Shot — 1-click cinematic product poster
    campaignShot: (data) => apiFetch('/creatives/campaign-shot', { method: 'POST', body: JSON.stringify(data), timeout: 300000 }),
    // Logo Animation Director — analyses a logo image and writes a Seedance 2 animation prompt
    analyseForAnimation: (data) => apiFetch('/creatives/analyse-logo-for-animation', { method: 'POST', body: JSON.stringify(data), timeout: 60000 }),
};

// ============ Agent API ============
export const agents = {
    scanWebsite: (url) => apiFetch('/agents/scan-website', { method: 'POST', body: JSON.stringify({ url }) }),
    scanLocalBusiness: (businessName, location) => apiFetch('/agents/scan-local-business', { method: 'POST', body: JSON.stringify({ businessName, location }) }),
    // SSE streaming version — returns EventSource URL for real-time progress
    getScanStreamUrl: (url) => {
        const token = localStorage.getItem('mantram_token') || '';
        const baseUrl = API_BASE.replace('/api', ''); // SSE needs full path
        const encodedUrl = encodeURIComponent(url);
        // EventSource doesn't support custom headers, so we pass token as query param
        return `${API_BASE}/agents/scan-website/stream?url=${encodedUrl}${token ? `&token=${token}` : ''}`;
    },
    // SSE streaming for local business scan — returns URL for fetch + ReadableStream
    getLocalScanStreamUrl: (businessName, location) => {
        const token = localStorage.getItem('mantram_token') || '';
        const params = new URLSearchParams({ businessName, location });
        if (token) params.set('token', token);
        return `${API_BASE}/agents/scan-local-business/stream?${params.toString()}`;
    },
    brainstorm: (data) => apiFetch('/agents/brainstorm', { method: 'POST', body: JSON.stringify(data) }),
    saveBrainstorm: (brandData) => apiFetch('/agents/brainstorm/save', { method: 'POST', body: JSON.stringify({ brandData }) }),
    generateLogo: (data) => apiFetch('/agents/generate-logo', { method: 'POST', body: JSON.stringify(data) }),
    productIdeas: (data) => apiFetch('/agents/product-ideas', { method: 'POST', body: JSON.stringify(data) }),
    analyzeImage: (data) => apiFetch('/agents/analyze-image', { method: 'POST', body: JSON.stringify(data) }),
    aiPhotoshoot: (data) => apiFetch('/agents/ai-photoshoot', { method: 'POST', body: JSON.stringify(data) }),
    health: () => apiFetch('/agents/health'),
};

// ============ Shopify API ============
export const shopify = {
    connect: (shopDomain, brandId) => apiFetch('/shopify/connect', { method: 'POST', body: JSON.stringify({ shopDomain, brandId }) }),
    connectToken: (shopDomain, accessToken, brandId) => apiFetch('/shopify/connect-token', { method: 'POST', body: JSON.stringify({ shopDomain, accessToken, brandId }) }),
    sync: (brandId) => apiFetch('/shopify/sync', { method: 'POST', body: JSON.stringify({ brandId }) }),
    products: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify/products?${query}`);
    },
    getProduct: (id) => apiFetch(`/shopify/products/${id}`),
    disconnect: (brandId) => apiFetch(`/shopify/disconnect${brandId ? `?brandId=${brandId}` : ''}`, { method: 'DELETE' }),
    status: (brandId) => apiFetch(`/shopify/status${brandId ? `?brandId=${brandId}` : ''}`),
};

// ============ Etsy API ============
export const etsy = {
    auth: (brandId) => apiFetch(`/etsy/auth${brandId ? `?brandId=${brandId}` : ''}`),
    status: (brandId) => apiFetch(`/etsy/status${brandId ? `?brandId=${brandId}` : ''}`),
    sync: (brandId) => apiFetch('/etsy/sync', { method: 'POST', body: JSON.stringify({ brandId }) }),
    products: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/etsy/products?${query}`);
    },
    analytics: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/etsy/analytics?${query}`);
    },
    publish: (productId, data = {}) => apiFetch(`/etsy/publish/${productId}`, { method: 'POST', body: JSON.stringify(data) }),
    disconnect: (brandId) => apiFetch(`/etsy/disconnect${brandId ? `?brandId=${brandId}` : ''}`, { method: 'DELETE' }),
};

// ============ WooCommerce API ============
export const woocommerce = {
    connect: (baseUrl, consumerKey, consumerSecret, brandId) => apiFetch('/woocommerce/connect', { method: 'POST', body: JSON.stringify({ baseUrl, consumerKey, consumerSecret, brandId }) }),
    status: (brandId) => apiFetch(`/woocommerce/status${brandId ? `?brandId=${brandId}` : ''}`),
    sync: (brandId) => apiFetch('/woocommerce/sync', { method: 'POST', body: JSON.stringify({ brandId }) }),
    products: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/woocommerce/products?${query}`);
    },
    analytics: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/woocommerce/analytics?${query}`);
    },
    publish: (productId, data = {}) => apiFetch(`/woocommerce/publish/${productId}`, { method: 'POST', body: JSON.stringify(data) }),
    disconnect: (brandId) => apiFetch(`/woocommerce/disconnect${brandId ? `?brandId=${brandId}` : ''}`, { method: 'DELETE' }),
};


// ============ Products API ============
export const products = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/products?${query}`);
    },
    get: (id) => apiFetch(`/products/${id}`),
    create: (data) => apiFetch('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/products/${id}`, { method: 'DELETE' }),
    aiEnrich: (id) => apiFetch(`/products/${id}/ai-enrich`, { method: 'POST' }),
    generateListing: (id, platform) => apiFetch(`/products/${id}/generate-listing`, { method: 'POST', body: JSON.stringify({ platform }) }),
    platforms: () => apiFetch('/products/meta/platforms'),
    scanWebsite: (data) => apiFetch('/products/scan-website', { method: 'POST', body: JSON.stringify(data) }),
    scanFromWebsite: (brandId, websiteUrl) => apiFetch('/products/scan-website', { method: 'POST', body: JSON.stringify({ brandId, websiteUrl }) }),
    repairImages: (brandId) => apiFetch('/products/repair-images', { method: 'POST', body: JSON.stringify({ brandId }) }),
    smartMatch: (data) => apiFetch('/products/smart-match', { method: 'POST', body: JSON.stringify(data) }),
    enrich: (data) => apiFetch('/products/enrich', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Trends API ============
export const trends = {
    now: (geo = 'IN') => apiFetch(`/trends/now?geo=${geo}`),
    brandMatch: (brandId, geo = 'IN') => apiFetch(`/trends/brand-match?brandId=${brandId}&geo=${geo}`),
    refresh: (geo = 'IN') => apiFetch(`/trends/refresh?geo=${geo}`, { method: 'POST' }),
    grokTopics: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-topics?${q}`); },
    grokSeo: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-seo?${q}`); },
    grokContent: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-content?${q}`); },
    grokCompetitors: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-competitors?${q}`); },
};

// ============ Dashboard Summary API ============
export const dashboardSummary = {
    get: (brandId) => apiFetch(`/dashboard-summary${brandId ? `?brandId=${brandId}` : ''}`),
    getHero: (brandId) => apiFetch(`/dashboard-summary/hero${brandId ? `?brandId=${brandId}` : ''}`),
    getIntelligence: (brandId) => apiFetch(`/dashboard-summary/intelligence${brandId ? `?brandId=${brandId}` : ''}`),
    getRadar: (brandId) => apiFetch(`/dashboard-summary/radar${brandId ? `?brandId=${brandId}` : ''}`),
    getEnhanced: (brandId) => apiFetch(`/dashboard-summary/enhanced${brandId ? `?brandId=${brandId}` : ''}`),
};


// ============ D2C Shopify Analytics API ============
export const shopifyAnalytics = {
    overview: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify-analytics/overview?${query}`);
    },
    aiInsights: (data) => apiFetch('/shopify-analytics/ai-insights', { method: 'POST', body: JSON.stringify(data) }),
    boostPlan: (data) => apiFetch('/shopify-analytics/boost-plan', { method: 'POST', body: JSON.stringify(data) }),
    sync: () => apiFetch('/shopify-analytics/sync', { method: 'POST' }),
    creativeCockpit: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify-analytics/creative-cockpit?${query}`);
    },
    cohortLtv: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify-analytics/cohort-ltv?${query}`);
    },
    profitability: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify-analytics/profitability?${query}`);
    },
    aiCopilot: (data) => apiFetch('/shopify-analytics/ai-copilot', { method: 'POST', body: JSON.stringify(data) }),
    snapshot: () => apiFetch('/shopify-analytics/snapshot'),
};

// ============ Team Management API ============
export const team = {
    // Members
    getMembers: () => apiFetch('/team/members'),
    getPlanLimits: () => apiFetch('/team/plan-limits'),
    invite: (data) => apiFetch('/team/invite', { method: 'POST', body: JSON.stringify(data) }),
    updateAccess: (memberId, data) => apiFetch(`/team/members/${memberId}/access`, { method: 'PUT', body: JSON.stringify(data) }),
    updateMemberBrands: (memberId, brandIds) => apiFetch(`/team/members/${memberId}/brands`, { method: 'PUT', body: JSON.stringify({ brandIds }) }),
    removeMember: (memberId) => apiFetch(`/team/members/${memberId}`, { method: 'DELETE' }),
    revokeInvite: (inviteId) => apiFetch(`/team/invites/${inviteId}`, { method: 'DELETE' }),
    // Chat
    getChannels: () => apiFetch('/team/chat/channels'),
    getMessages: (channelId, page = 1) => apiFetch(`/team/chat/${channelId}/messages?page=${page}`),
    sendMessage: (channelId, data) => apiFetch(`/team/chat/${channelId}/send`, { method: 'POST', body: JSON.stringify(data) }),
    react: (channelId, data) => apiFetch(`/team/chat/${channelId}/react`, { method: 'POST', body: JSON.stringify(data) }),
    // Approvals
    getApprovals: (params = '') => apiFetch(`/team/approvals?${params}`),
    createApproval: (data) => apiFetch('/team/approvals', { method: 'POST', body: JSON.stringify(data) }),
    updateApproval: (id, data) => apiFetch(`/team/approvals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    // AI
    teamHealth: () => apiFetch('/team/ai/team-health', { method: 'POST' }),
};

// ============ Fidato AI Assistant ============
export const fidato = {
    chat: (message, brandId) => apiFetch('/fidato/chat', { method: 'POST', body: JSON.stringify({ message, brandId }) }),
    canvasDirect: (data) => { const { signal, ...body } = data; return apiFetch('/fidato/canvas-direct', { method: 'POST', body: JSON.stringify(body), timeout: 3600000, signal }); },
    briefing: (brandId) => apiFetch('/fidato/briefing', { method: 'POST', body: JSON.stringify({ brandId }) }),
    notifications: (brandId) => apiFetch(`/fidato/notifications${brandId ? `?brandId=${brandId}` : ''}`),
    updatePreferences: (prefs) => apiFetch('/fidato/preferences', { method: 'POST', body: JSON.stringify(prefs) }),
    clear: () => apiFetch('/fidato/clear', { method: 'POST' }),
};

// ============ Intel & Competitive Insights API ============
export const intel = {
    list: (brandId) => apiFetch(`/intel/missions?brandId=${brandId}`),
    create: (data) => apiFetch('/intel/missions', { method: 'POST', body: JSON.stringify(data) }),
    getFindings: (id) => apiFetch(`/intel/missions/${id}/findings`),
    run: (id) => apiFetch(`/intel/missions/${id}/run`, { method: 'POST' }),
    update: (id, data) => apiFetch(`/intel/missions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/intel/missions/${id}`, { method: 'DELETE' }),
    alerts: (brandId) => apiFetch(`/intel/missions/alerts?brandId=${brandId}`),
};

// ============ Virality Predictor API ============
export const viralityPredictor = {
    predict: (data) => apiFetch('/virality/predict', {
        method: 'POST',
        body: JSON.stringify(data),
        timeout: 120000, // 2 min — 3 model calls in sequence
    }),
    health: () => apiFetch('/virality/health'),
};

// ============ Nexus — Unified Agentic Interface ============
export const nexus = {
    chat: (message, brandId, options = {}) => apiFetch('/nexus/chat', {
        method: 'POST',
        body: JSON.stringify({ message, brandId, ...options }),
    }),
    briefing: (brandId) => apiFetch('/nexus/briefing', { method: 'POST', body: JSON.stringify({ brandId }) }),
    notifications: (brandId) => apiFetch(`/nexus/notifications${brandId ? `?brandId=${brandId}` : ''}`),
    updatePreferences: (prefs) => apiFetch('/nexus/preferences', { method: 'POST', body: JSON.stringify(prefs) }),
    clear: () => apiFetch('/nexus/clear', { method: 'POST' }),
};

// ============ Social Media API ============
export const social = {
    accounts: () => apiFetch('/social/accounts'),
    connect: (platform) => apiFetch(`/social/auth/${platform}`),
    disconnect: (accountId) => apiFetch(`/social/accounts/${accountId}`, { method: 'DELETE' }),
    publish: (data) => apiFetch('/social/publish', { method: 'POST', body: JSON.stringify(data) }),
    schedule: (data) => apiFetch('/social/schedule', { method: 'POST', body: JSON.stringify(data) }),
    publishHistory: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/social/posts/history?${query}`);
    },
    cancelScheduled: (id) => apiFetch(`/social/posts/${id}/cancel`, { method: 'PUT' }),
    generateCaption: (data) => apiFetch('/social/generate-caption', { method: 'POST', body: JSON.stringify(data) }),
    status: () => apiFetch('/social/status'),
    getPosts: (accountId) => apiFetch(`/social/accounts/${accountId}/posts`),
    getInsights: (accountId, postId) => apiFetch(`/social/accounts/${accountId}/posts/${postId}/insights`),
};

// ============ Voice API ============
export const voice = {
    transcribe: (formData) => {
        const token = localStorage.getItem('mantram_token') || '';
        return fetch(`${API_BASE}/voice/transcribe`, {
            method: 'POST',
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: formData,
        }).then(res => res.json());
    },
};

// ============ Rewards API ============
export const rewards = {
    status: () => apiFetch('/rewards/status'),
    claimMilestone: (milestoneId) => apiFetch(`/rewards/milestones/${milestoneId}/claim`, { method: 'POST' }),
    applyReferral: (code) => apiFetch('/rewards/referral/apply', { method: 'POST', body: JSON.stringify({ code }) }),
};

// ============ Canvas Assets API (Creative Studio) ============
export const canvasAssets = {
    aiGenerate: (data) => apiFetch('/canvas-assets/ai-generate', { method: 'POST', body: JSON.stringify(data) }),
    aiEdit: (data) => apiFetch('/canvas-assets/ai-edit', { method: 'POST', body: JSON.stringify(data) }),
    aiEditVisual: (data) => apiFetch('/canvas-assets/ai-edit-visual', { method: 'POST', body: JSON.stringify(data) }),
    aiRetouch: (data) => apiFetch('/canvas-assets/ai-retouch', { method: 'POST', body: JSON.stringify(data) }),
    aiBackground: (data) => apiFetch('/canvas-assets/ai-background', { method: 'POST', body: JSON.stringify(data) }),
    aiAnalyze: (data) => apiFetch('/canvas-assets/ai-analyze', { method: 'POST', body: JSON.stringify(data) }),
    aiAnalyzeTemplate: (data) => apiFetch('/canvas-assets/ai-analyze-template', { method: 'POST', body: JSON.stringify(data) }),
    // Agentic Canvas tools
    generateVideo: (data) => apiFetch('/fidato/canvas-video', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    generateVoiceover: (data) => apiFetch('/fidato/canvas-voiceover', { method: 'POST', body: JSON.stringify(data) }),
    generateMusic: (data) => apiFetch('/fidato/canvas-music', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    generateSoundEffect: (data) => apiFetch('/fidato/canvas-sfx', { method: 'POST', body: JSON.stringify(data) }),
    compileVideo: (data) => apiFetch('/fidato/canvas-compile', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    // MCoT — Post-Generation Critique
    critiqueImage: (data) => apiFetch('/fidato/canvas-critique', { method: 'POST', body: JSON.stringify(data) }),
    // Multi-size Campaign Generation
    generateCampaign: (data) => apiFetch('/fidato/canvas-campaign', { method: 'POST', body: JSON.stringify(data) }),
    // Smart Design Adaptation — AI-powered layout re-composition for different platform sizes
    smartAdapt: (data) => apiFetch('/canvas-assets/smart-adapt', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    // AI Design Adaptation — NanoBanana 2 image regeneration for each platform size (S3 URL only)
    aiAdapt: (data) => apiFetch('/canvas-assets/ai-adapt', { method: 'POST', body: JSON.stringify(data), timeout: 150000 }),

    // Upload canvas export base64 to S3 — use this BEFORE aiAdapt so no base64 travels in adapt calls
    uploadCanvasExport: (data) => apiFetch('/canvas-assets/upload-canvas-export', { method: 'POST', body: JSON.stringify(data), timeout: 30000 }),


};

// ============ Video Studio API ============
export const videoStudio = {
    list: () => apiFetch('/video-studio'),
    get: (id) => apiFetch(`/video-studio/${id}`),
    start: (data) => apiFetch('/video-studio/start', { method: 'POST', body: JSON.stringify(data) }),
    select: (id, data) => apiFetch(`/video-studio/${id}/select`, { method: 'POST', body: JSON.stringify(data) }),
    approve: (id, data) => apiFetch(`/video-studio/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
    voiceoverPreview: (id, data) => apiFetch(`/video-studio/${id}/voiceover-preview`, { method: 'POST', body: JSON.stringify(data) }),
    generate: (id, data) => apiFetch(`/video-studio/${id}/generate`, { method: 'POST', body: JSON.stringify(data) }),
    getStatus: (id) => apiFetch(`/video-studio/${id}/status`),
    edit: (id, data) => apiFetch(`/video-studio/${id}/edit`, { method: 'POST', body: JSON.stringify(data) }),
    finalize: (id, data) => apiFetch(`/video-studio/${id}/finalize`, { method: 'POST', body: JSON.stringify(data) }),
    modelsCapabilities: () => apiFetch('/video-studio/models/capabilities'),
    // Backward compatibility for CreativeStudio.jsx
    advancedI2V: (data) => apiFetch('/video-studio/advanced/i2v', { method: 'POST', body: JSON.stringify(data) }),
    advancedGenerate: (data) => apiFetch('/video-studio/advanced/generate', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Retention Studio API ============
export const retentionStudio = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/retention-studio?${query}`);
    },
    get: (id) => apiFetch(`/retention-studio/${id}`),
    analytics: (id) => apiFetch(`/retention-studio/${id}/analytics`),
    create: (data) => apiFetch('/retention-studio', { method: 'POST', body: JSON.stringify(data) }),
    ingest: (id, data) => apiFetch(`/retention-studio/${id}/ingest`, { method: 'POST', body: JSON.stringify(data) }),
    match: (id, data) => apiFetch(`/retention-studio/${id}/match`, { method: 'POST', body: JSON.stringify(data) }),
    creative: (id, data) => apiFetch(`/retention-studio/${id}/creative`, { method: 'POST', body: JSON.stringify(data) }),
    compose: (id, data) => apiFetch(`/retention-studio/${id}/compose`, { method: 'POST', body: JSON.stringify(data) }),
    approve: (id, data) => apiFetch(`/retention-studio/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
    send: (id, data) => apiFetch(`/retention-studio/${id}/send`, { method: 'POST', body: JSON.stringify(data) }),
    preview: (id) => apiFetch(`/retention-studio/${id}/preview`, { method: 'POST' }),
    testEmail: (id, email) => apiFetch(`/retention-studio/${id}/test-email`, { method: 'POST', body: JSON.stringify({ email }) }),
    generateImage: (id, data) => apiFetch(`/retention-studio/${id}/generate-image`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/retention-studio/${id}`, { method: 'DELETE' }),

    // RFM & Segmentation (Phase 1)
    rfmAnalysis: (brandId) => apiFetch(`/retention-studio/rfm?brandId=${brandId}`),
    rfmSegment: (key, brandId) => apiFetch(`/retention-studio/rfm/${key}?brandId=${brandId}`),
    
    // Templates
    templates: () => apiFetch('/retention-studio/templates'),
    templateCategories: () => apiFetch('/retention-studio/templates/categories'),

    // Intelligence
    winbackCandidates: (brandId) => apiFetch(`/retention-studio/winback?brandId=${brandId}`),
    priceDrops: (brandId) => apiFetch(`/retention-studio/price-drops?brandId=${brandId}`),
    recentBuyers: (brandId) => apiFetch(`/retention-studio/recent-buyers?brandId=${brandId}`),

    // Contacts
    unifiedContacts: (brandId) => apiFetch(`/retention-studio/contacts/unified?brandId=${brandId}`),

    // Channels & Widget
    smsStatus: () => apiFetch('/retention-studio/sms/status'),
    pushStatus: () => apiFetch('/retention-studio/push/status'),
    widgetEmbed: (brandId) => apiFetch(`/retention-studio/widget/embed?brandId=${brandId}`),
    browseTrackerStats: () => apiFetch('/retention-studio/track/stats'),
};

// ============ Admin API ============
export const admin = {
    getStats: () => apiFetch('/admin/stats'),
    getUsers: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/admin/users?${query}`);
    },
    updateUser: (id, data) => apiFetch(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    getAIHealth: () => apiFetch('/admin/ai-health'),
};

// ============ Super Admin API ============
export const superadmin = {
    getStats: () => apiFetch('/superadmin/stats'),
    getUsers: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/users?${query}`);
    },
    getUser: (id) => apiFetch(`/superadmin/users/${id}`),
    updateUser: (id, data) => apiFetch(`/superadmin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => apiFetch(`/superadmin/users/${id}`, { method: 'DELETE' }),
    impersonateUser: (id) => apiFetch(`/superadmin/users/${id}/impersonate`, { method: 'POST' }),
    addCredits: (id, data) => apiFetch(`/superadmin/users/${id}/add-credits`, { method: 'POST', body: JSON.stringify(data) }),
    resetCredits: (id) => apiFetch(`/superadmin/users/${id}/reset-credits`, { method: 'POST' }),
    approveUser: (id) => apiFetch(`/superadmin/users/${id}/approve`, { method: 'PUT' }),
    rejectUser: (id) => apiFetch(`/superadmin/users/${id}/reject`, { method: 'PUT' }),
    // User Intelligence Analytics
    getUserAnalytics: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/users/analytics?${query}`);
    },
    getUserSegmentCounts: () => apiFetch('/superadmin/users/segment-counts'),

    // Waitlist
    approveWaitlist: (id) => apiFetch(`/superadmin/waitlist/${id}/approve`, { method: 'POST' }),
    deleteWaitlist: (id) => apiFetch(`/superadmin/waitlist/${id}`, { method: 'DELETE' }),

    // Subscriptions
    getSubscriptions: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/subscriptions?${query}`);
    },
    createSubscription: (data) => apiFetch('/superadmin/subscriptions', { method: 'POST', body: JSON.stringify(data) }),
    // Coupons
    getCoupons: () => apiFetch('/superadmin/coupons'),
    createCoupon: (data) => apiFetch('/superadmin/coupons', { method: 'POST', body: JSON.stringify(data) }),
    updateCoupon: (id, data) => apiFetch(`/superadmin/coupons/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCoupon: (id) => apiFetch(`/superadmin/coupons/${id}`, { method: 'DELETE' }),

    // Retention Offers
    getRetentionOffers: () => apiFetch('/superadmin/retention-offers'),
    createRetentionOffer: (data) => apiFetch('/superadmin/retention-offers', { method: 'POST', body: JSON.stringify(data) }),
    updateRetentionOffer: (id, data) => apiFetch(`/superadmin/retention-offers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRetentionOffer: (id) => apiFetch(`/superadmin/retention-offers/${id}`, { method: 'DELETE' }),

    // Brands
    getBrands: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/brands?${query}`);
    },
    deleteBrand: (id) => apiFetch(`/superadmin/brands/${id}`, { method: 'DELETE' }),
    // Content
    getContent: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/content?${query}`);
    },
    deleteContent: (id) => apiFetch(`/superadmin/content/${id}`, { method: 'DELETE' }),
    // Creatives
    getCreatives: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/creatives?${query}`);
    },
    // AI & System
    getAIHealth: () => apiFetch('/superadmin/ai-health'),
    getSystemSettings: () => apiFetch('/superadmin/system-settings'),
    updateSystemSettings: (data) => apiFetch('/superadmin/system-settings', { method: 'PUT', body: JSON.stringify(data) }),
    // Integrations
    getIntegrations: () => apiFetch('/superadmin/integrations'),
    getProducts: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/products?${query}`);
    },
    // Packages
    getPackages: () => apiFetch('/superadmin/packages'),
    createPackage: (data) => apiFetch('/superadmin/packages', { method: 'POST', body: JSON.stringify(data) }),
    updatePackage: (id, data) => apiFetch(`/superadmin/packages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePackage: (id) => apiFetch(`/superadmin/packages/${id}`, { method: 'DELETE' }),
    aiSuggestPackages: () => apiFetch('/superadmin/packages/ai-suggest', { method: 'POST' }),
    seedDefaultPackages: (force) => apiFetch('/superadmin/packages/seed-defaults', { method: 'POST', body: JSON.stringify({ force }) }),
    // Credit Costs
    getCreditCosts: () => apiFetch('/superadmin/credit-costs'),
    updateCreditCosts: (costs) => apiFetch('/superadmin/credit-costs', { method: 'PUT', body: JSON.stringify({ costs }) }),
    resetCreditCosts: () => apiFetch('/superadmin/credit-costs/reset', { method: 'POST' }),
    // Token Usage Analytics
    getTokenUsage: (days = 30) => apiFetch(`/superadmin/stats/token-usage?days=${days}`),
    syncCredits: () => apiFetch('/superadmin/system/sync-all-credits', { method: 'POST' }),
    getSystemLogs: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/superadmin/system-logs?${query}`);
    },

    // API Keys & Providers
    getApiKeys: () => apiFetch('/superadmin/api-keys'),
    updateApiKeys: (provider, keys) => apiFetch('/superadmin/api-keys', { method: 'PUT', body: JSON.stringify({ provider, keys }) }),
    deleteApiKeys: (provider) => apiFetch(`/superadmin/api-keys/${provider}`, { method: 'DELETE' }),
    testApiKey: (provider) => apiFetch(`/superadmin/api-keys/${provider}/test`, { method: 'POST' }),

    // Budgets & Usage
    getProviderBudgets: () => apiFetch('/superadmin/provider-budgets'),
    updateProviderBudgets: (data) => apiFetch('/superadmin/provider-budgets', { method: 'PUT', body: JSON.stringify(data) }),
    getProviderUsage: (days) => apiFetch(`/superadmin/provider-usage?days=${days}`),

    // Credit Packs
    getCreditPacks: () => apiFetch('/superadmin/credit-packs'),
    createCreditPack: (data) => apiFetch('/superadmin/credit-packs', { method: 'POST', body: JSON.stringify(data) }),
    updateCreditPack: (id, data) => apiFetch(`/superadmin/credit-packs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCreditPack: (id) => apiFetch(`/superadmin/credit-packs/${id}`, { method: 'DELETE' }),
    toggleCreditPack: (id) => apiFetch(`/superadmin/credit-packs/${id}/toggle`, { method: 'POST' }),
    seedCreditPacks: () => apiFetch('/superadmin/credit-packs/seed-defaults', { method: 'POST' }),

    // Watermark
    uploadWatermarkLogo: (dataUrl) => apiFetch('/superadmin/watermark/upload', { method: 'POST', body: JSON.stringify({ logo: dataUrl }) }),
    updateWatermarkSettings: (data) => apiFetch('/superadmin/watermark/settings', { method: 'PUT', body: JSON.stringify(data) }),
    getWatermarkOverrides: () => apiFetch('/superadmin/watermark/overrides'),
    updateWatermarkOverride: (data) => apiFetch('/superadmin/watermark/override', { method: 'PUT', body: JSON.stringify(data) }),

    // Studio Visibility (3-tier access control)
    getStudioVisibility: () => apiFetch('/superadmin/studio-visibility'),
    updateStudioVisibility: (data) => apiFetch('/superadmin/studio-visibility', { method: 'PUT', body: JSON.stringify(data) }),
    getUserStudioAccess: (userId) => apiFetch(`/superadmin/users/${userId}/studio-access`),
    updateUserStudioAccess: (userId, data) => apiFetch(`/superadmin/users/${userId}/studio-access`, { method: 'PUT', body: JSON.stringify(data) }),

    // Waitlist
    getWaitlist: () => apiFetch('/superadmin/waitlist'),

    // Pricing Command Center
    getPricingCalculator: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/superadmin/pricing-calculator?${q}`); },
    getPricingPolicy: () => apiFetch('/superadmin/pricing-policy'),
    getPricingMonitor: () => apiFetch('/superadmin/pricing-monitor'),
    triggerPricingCheck: () => apiFetch('/superadmin/pricing-monitor/check', { method: 'POST' }),
    dismissPricingAlerts: () => apiFetch('/superadmin/pricing-monitor/dismiss', { method: 'POST' }),

    // LLM Provider Switching
    getLlmProviders: () => apiFetch('/superadmin/llm-providers'),
    updateLlmProvider: (data) => apiFetch('/superadmin/llm-providers', { method: 'PUT', body: JSON.stringify(data) }),
    addLlmProvider: (data) => apiFetch('/superadmin/llm-providers/provider', { method: 'POST', body: JSON.stringify(data) }),
    modifyLlmProvider: (data) => apiFetch('/superadmin/llm-providers/provider', { method: 'PATCH', body: JSON.stringify(data) }),
    removeLlmProvider: (data) => apiFetch('/superadmin/llm-providers/provider', { method: 'DELETE', body: JSON.stringify(data) }),

    // Video Provider Switching
    getVideoProviders: () => apiFetch('/superadmin/video-providers'),
    updateVideoProvider: (data) => apiFetch('/superadmin/video-providers', { method: 'PUT', body: JSON.stringify(data) }),
    addVideoProvider: (data) => apiFetch('/superadmin/video-providers/provider', { method: 'POST', body: JSON.stringify(data) }),
    modifyVideoProvider: (data) => apiFetch('/superadmin/video-providers/provider', { method: 'PATCH', body: JSON.stringify(data) }),
    removeVideoProvider: (data) => apiFetch('/superadmin/video-providers/provider', { method: 'DELETE', body: JSON.stringify(data) }),

    // Image Provider Switching
    getImageProviders: () => apiFetch('/superadmin/image-providers'),
    updateImageProvider: (data) => apiFetch('/superadmin/image-providers', { method: 'PUT', body: JSON.stringify(data) }),
    addImageProvider: (data) => apiFetch('/superadmin/image-providers/provider', { method: 'POST', body: JSON.stringify(data) }),
    modifyImageProvider: (data) => apiFetch('/superadmin/image-providers/provider', { method: 'PATCH', body: JSON.stringify(data) }),
    removeImageProvider: (data) => apiFetch('/superadmin/image-providers/provider', { method: 'DELETE', body: JSON.stringify(data) }),

    // Avatar Library
    getAvatars: () => apiFetch('/superadmin/avatars'),
    createAvatar: (formData) => {
        const token = localStorage.getItem('mantram_token') || '';
        return fetch(`${API_BASE}/superadmin/avatars`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: formData,
        }).then(r => r.json());
    },
    updateAvatar: (id, data) => apiFetch(`/superadmin/avatars/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteAvatar: (id) => apiFetch(`/superadmin/avatars/${id}`, { method: 'DELETE' }),
};

// ============ Credits API ============
export const credits = {
    balance: () => apiFetch('/credits/balance'),
    usage: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/credits/usage?${query}`);
    },
    summary: () => apiFetch('/credits/summary'),
    // Additional methods for CreditsPage.jsx
    history: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/credits/history?${query}`);
    },
    plans: () => apiFetch('/credits/plans'),
    buy: (data) => apiFetch('/credits/buy', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Brainstorm Studio API ============
export const brainstormStudio = {
    start: (data) => apiFetch('/brainstorm-studio/start', { method: 'POST', body: JSON.stringify(data) }),
    confirm: (data) => apiFetch('/brainstorm-studio/confirm', { method: 'POST', body: JSON.stringify(data) }),
    generate: (data) => apiFetch('/brainstorm-studio/generate', { method: 'POST', body: JSON.stringify(data) }),
    refine: (data) => apiFetch('/brainstorm-studio/refine', { method: 'POST', body: JSON.stringify(data) }),
    feedback: (data) => apiFetch('/brainstorm-studio/feedback', { method: 'POST', body: JSON.stringify(data) }),
    screenplay: (data) => apiFetch('/brainstorm-studio/screenplay', { method: 'POST', body: JSON.stringify(data) }),
    chat: (data) => apiFetch('/brainstorm-studio/chat', { method: 'POST', body: JSON.stringify(data) }),
    // Brand Strategy
    strategy: (data) => apiFetch('/brainstorm-studio/strategy', { method: 'POST', body: JSON.stringify(data) }),
    strategySlides: (data) => apiFetch('/brainstorm-studio/strategy-slides', { method: 'POST', body: JSON.stringify(data) }),
    // ── NEW: 8-Mode Research-Backed Strategy Generator ──
    strategyMode: (data) => apiFetch('/brainstorm-studio/strategy-mode', { method: 'POST', body: JSON.stringify(data) }),
    // Phase 4: SSE streaming version — returns raw fetch Response for caller to stream
    strategyModeStream: (data) => {
        const base = typeof window !== 'undefined' ? (window.__API_BASE__ || import.meta?.env?.VITE_API_URL || 'http://localhost:5001') : 'http://localhost:5001';
        const token = typeof window !== 'undefined' ? (localStorage.getItem('mantram_token') || sessionStorage.getItem('mantram_token')) : null;
        return fetch(`${base}/api/brainstorm-studio/strategy-mode/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
            body: JSON.stringify(data),
            signal: AbortSignal.timeout(180000),
        });
    },
    listStrategies: () => apiFetch('/brainstorm-studio/strategies'),
    getStrategy: (id) => apiFetch(`/brainstorm-studio/strategies/${id}`),
    updateKpi: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/kpi`, { method: 'PATCH', body: JSON.stringify(data) }),
    toggleMilestone: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/milestone`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateStrategyStatus: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),

    // ── Sessions — Persistent brainstorm history ──
    sessions: (brandId) => apiFetch(`/brainstorm-studio/sessions${brandId ? `?brandId=${brandId}` : ''}`),
    loadSession: (id) => apiFetch(`/brainstorm-studio/sessions/${id}`),
    deleteSession: (id) => apiFetch(`/brainstorm-studio/sessions/${id}`, { method: 'DELETE' }),
    renameSession: (id, title) => apiFetch(`/brainstorm-studio/sessions/${id}/title`, { method: 'PATCH', body: JSON.stringify({ title }) }),

    // ── Fidato Chat: streaming SSE (POST with ReadableStream) ──
    fidatoChat: async (payload, { onToken, onThinking, onIdeas, onScreenplay, onStrategy, onDeepDive, onCalendar, onSessionId, onDone, onError, onReasoningStep, onCitations } = {}) => {
        const token = localStorage.getItem('mantram_token') || '';
        const response = await fetch(`${API_BASE}/brainstorm-studio/fidato-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: 'Request failed' }));
            onError?.(err.error || `HTTP ${response.status}`);
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const raw = line.slice(6).trim();
                if (!raw || raw === '[DONE]') continue;
                try {
                    const evt = JSON.parse(raw);
                    if (evt.type === 'token') onToken?.(evt.text);
                    else if (evt.type === 'thinking') onThinking?.();
                    else if (evt.type === 'reasoning_step') onReasoningStep?.(evt.step, evt.icon);
                    else if (evt.type === 'citations') onCitations?.(evt.citations);
                    else if (evt.type === 'ideas') onIdeas?.(evt.payload, evt.intent);
                    else if (evt.type === 'screenplay') onScreenplay?.(evt.payload, evt.conceptTitle);
                    else if (evt.type === 'strategy') onStrategy?.(evt.payload);
                    else if (evt.type === 'deep_dive') onDeepDive?.(evt.payload);
                    else if (evt.type === 'calendar') onCalendar?.(evt.payload);
                    else if (evt.type === 'session_id') onSessionId?.(evt.sessionId);
                    else if (evt.type === 'done') onDone?.(evt.sessionState, evt.questionOptions || null);
                    else if (evt.type === 'error') onError?.(evt.message);
                } catch { /* ignore malformed SSE */ }
            }
        }
    },
};


// ============ Research Studio API ============
export const researchStudio = {
    competitor: (data) => apiFetch('/research-studio/competitor', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    trends: (data) => apiFetch('/research-studio/trends', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    keywords: (data) => apiFetch('/research-studio/keywords', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    ads: (data) => apiFetch('/research-studio/ads', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    audience: (data) => apiFetch('/research-studio/audience', { method: 'POST', body: JSON.stringify(data), timeout: 120000 }),
    synthesis: (data) => apiFetch('/research-studio/synthesis', { method: 'POST', body: JSON.stringify(data), timeout: 180000 }),
    save: (data) => apiFetch('/research-studio/save', { method: 'POST', body: JSON.stringify(data) }),
    reports: (brandId) => apiFetch(`/research-studio/reports${brandId ? `?brandId=${brandId}` : ''}`),
    getReport: (id) => apiFetch(`/research-studio/reports/${id}`),
};


// ============ Agent Command API ============
export const agentCommand = {
    chat: (data) => apiFetch('/agent-command/chat', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ SEO Studio API ============
// ============ Performance Marketing Studio API ============
export const pmStudio = {
    // ── Core Pipeline ──
    research: (data) => apiFetch('/pm-studio/research', { method: 'POST', body: JSON.stringify(data) }),
    strategy: (data) => apiFetch('/pm-studio/strategy', { method: 'POST', body: JSON.stringify(data) }),
    budget: (data) => apiFetch('/pm-studio/budget', { method: 'POST', body: JSON.stringify(data) }),
    generateCreatives: (data) => apiFetch('/pm-studio/generate-creatives', { method: 'POST', body: JSON.stringify(data) }),
    generateAdImage: (data) => apiFetch('/pm-studio/generate-ad-image', { method: 'POST', body: JSON.stringify(data) }),
    analyze: (data) => apiFetch('/pm-studio/analyze', { method: 'POST', body: JSON.stringify(data) }),
    report: (data) => apiFetch('/pm-studio/report', { method: 'POST', body: JSON.stringify(data) }),

    // ── Campaigns ──
    createCampaign: (data) => apiFetch('/pm-studio/campaigns', { method: 'POST', body: JSON.stringify(data) }),
    getCampaigns: (params = {}) => apiFetch(`/pm-studio/campaigns?${new URLSearchParams(params)}`),
    getCampaign: (id) => apiFetch(`/pm-studio/campaigns/${id}`),
    updateCampaign: (id, data) => apiFetch(`/pm-studio/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    createABTest: (id, data) => apiFetch(`/pm-studio/campaigns/${id}/ab-test`, { method: 'POST', body: JSON.stringify(data) }),

    // ── Reports & Learnings ──
    getReports: (params = {}) => apiFetch(`/pm-studio/reports?${new URLSearchParams(params)}`),
    getReport: (id) => apiFetch(`/pm-studio/reports/${id}`),
    getLearnings: (params = {}) => apiFetch(`/pm-studio/learnings?${new URLSearchParams(params)}`),
    updateLearning: (id, data) => apiFetch(`/pm-studio/learnings/${id}/status`, { method: 'PUT', body: JSON.stringify(data) }),

    // ── Dashboard & Connections ──
    dashboard: (params = {}) => apiFetch(`/pm-studio/dashboard?${new URLSearchParams(params)}`),
    connections: () => apiFetch('/pm-studio/connections'),
    trends: (params = {}) => apiFetch(`/pm-studio/trends?${new URLSearchParams(params)}`),

    // ── Phase 1: Live Data Pipeline ──
    syncCampaigns: (data = {}) => apiFetch('/pm-studio/sync-campaigns', { method: 'POST', body: JSON.stringify(data) }),
    anomalies: (params = {}) => apiFetch(`/pm-studio/anomalies?${new URLSearchParams(params)}`),
    autoFixAnomalies: (data) => apiFetch('/pm-studio/anomalies/auto-fix', { method: 'POST', body: JSON.stringify(data) }),
    blendedRoas: (params = {}) => apiFetch(`/pm-studio/blended-roas?${new URLSearchParams(params)}`),

    // ── Phase 2: Autonomous Optimization ──
    roasForecast: (data) => apiFetch('/pm-studio/roas-forecast', { method: 'POST', body: JSON.stringify(data) }),
    optimize: (data = {}) => apiFetch('/pm-studio/optimize', { method: 'POST', body: JSON.stringify(data) }),
    optimizationLog: (params = {}) => apiFetch(`/pm-studio/optimization-log?${new URLSearchParams(params)}`),
    setAutopilot: (id, data) => apiFetch(`/pm-studio/campaigns/${id}/autopilot`, { method: 'PUT', body: JSON.stringify(data) }),

    // ── Phase 3: Cross-Studio Intelligence ──
    crossStudioOpportunities: (params = {}) => apiFetch(`/pm-studio/cross-studio/opportunities?${new URLSearchParams(params)}`),
    createFromSEO: (data) => apiFetch('/pm-studio/cross-studio/create-from-seo', { method: 'POST', body: JSON.stringify(data) }),

    // ── Phase 4: Attribution, Pixel, Alerts, Benchmarks ──
    attribution: (params = {}) => apiFetch(`/pm-studio/attribution?${new URLSearchParams(params)}`),
    pixelSetup: (params = {}) => apiFetch(`/pm-studio/pixel/setup?${new URLSearchParams(params)}`),
    sendAlertManual: (data) => apiFetch('/pm-studio/alerts/send', { method: 'POST', body: JSON.stringify(data) }),
    testAlert: (data = {}) => apiFetch('/pm-studio/alerts/test', { method: 'POST', body: JSON.stringify(data) }),
    benchmarks: (params = {}) => apiFetch(`/pm-studio/benchmarks?${new URLSearchParams(params)}`),
    benchmarksAI: (params = {}) => apiFetch(`/pm-studio/benchmarks/ai?${new URLSearchParams(params)}`),
};

export const seoStudio = {
    healthCheck: (data) => apiFetch('/seo-studio/health-check', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    traffic: (data) => apiFetch('/seo-studio/traffic', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    competitors: (data) => apiFetch('/seo-studio/competitors', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    aiVisibility: (data) => apiFetch('/seo-studio/ai-visibility', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    auditPage: (data) => apiFetch('/seo-studio/audit-page', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    ask: (data) => apiFetch('/seo-studio/ask', { method: 'POST', body: JSON.stringify(data) }),
    manageCompetitors: (data) => apiFetch('/seo-studio/competitors/manage', { method: 'POST', body: JSON.stringify(data) }),
    discoverCompetitors: (data) => apiFetch('/seo-studio/competitors/discover', { method: 'POST', body: JSON.stringify(data) }),
    // Agentic workflows — extended timeouts for heavy AI+crawl operations
    competitorWarRoom: (data) => apiFetch('/seo-studio/competitor-warroom', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    backlinkIntelligence: (data) => apiFetch('/seo-studio/backlinks', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    getSavedReport: (brandId, type) => apiFetch(`/seo-studio/reports/${type}?brandId=${brandId}`),
    llmProbe: (data) => apiFetch('/seo-studio/llm-probe', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    autoFix: (data) => apiFetch('/seo-studio/auto-fix', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    contentFix: (data) => apiFetch('/seo-studio/content-fix', { method: 'POST', body: JSON.stringify(data), timeout: 600000 }),
    promptMining: (data) => apiFetch('/seo-studio/prompt-mining', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    history: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/history?${query}`);
    },
    getAudit: (id) => apiFetch(`/seo-studio/history/${id}`),
    historyCompare: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/history/compare?${query}`);
    },
    // GSC Position Tracking
    gscSnapshot: (data) => apiFetch('/seo-studio/gsc/snapshot', { method: 'POST', body: JSON.stringify(data) }),
    gscSnapshots: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/gsc/snapshots?${query}`);
    },
    gscRankChanges: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/gsc/rank-changes?${query}`);
    },
    // Phase 3: Advanced
    jsCrawl: (data) => apiFetch('/seo-studio/js-crawl', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    contentScore: (data) => apiFetch('/seo-studio/content-score', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
    competitorMonitor: (data) => apiFetch('/seo-studio/competitor-monitor', { method: 'POST', body: JSON.stringify(data), timeout: 3600000 }),
};

// ============ Skills System API ============
export const skills = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/skills?${query}`);
    },
    get: (id) => apiFetch(`/skills/${id}`),
    create: (data) => apiFetch('/skills', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/skills/${id}`, { method: 'DELETE' }),
    clone: (id) => apiFetch(`/skills/${id}/clone`, { method: 'POST' }),
    rate: (id, data) => apiFetch(`/skills/${id}/rate`, { method: 'POST', body: JSON.stringify(data) }),
    execute: (id, data) => apiFetch(`/skills/${id}/execute`, { method: 'POST', body: JSON.stringify(data) }),
    generate: (data) => apiFetch('/skills/generate', { method: 'POST', body: JSON.stringify(data) }),
    enhanceInstructions: (data) => apiFetch('/skills/enhance-instructions', { method: 'POST', body: JSON.stringify(data) }),
    // Credit cost preview (shown before execution)
    creditCost: (id) => apiFetch(`/skills/${id}/credit-cost`),
    // Model A — Persistent skill activation
    activate: (id) => apiFetch(`/skills/${id}/activate`, { method: 'POST' }),
    deactivate: (id) => apiFetch(`/skills/${id}/deactivate`, { method: 'POST' }),
    getActive: () => apiFetch('/skills/active/list'),
    // Model B — Execution history & output routing
    listExecutions: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/skills/executions/list?${query}`);
    },
    routeExecution: (executionId, data) => apiFetch(`/skills/executions/${executionId}/route`, { method: 'POST', body: JSON.stringify(data) }),
    // Marketplace (Mantram users)
    browseMarketplace: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/skills/marketplace/browse?${query}`);
    },
    installSkill: (id) => apiFetch(`/skills/${id}/install`, { method: 'POST' }),
    publishSkill: (id) => apiFetch(`/skills/${id}/publish`, { method: 'POST' }),
    unpublishSkill: (id) => apiFetch(`/skills/${id}/unpublish`, { method: 'POST' }),
    // Phase 2: Video status polling
    videoStatus: (skillId, projectId, executionId) => {
        const params = new URLSearchParams({ projectId, ...(executionId ? { executionId } : {}) });
        return apiFetch(`/skills/${skillId}/video-status?${params}`);
    },
    // Phase 2: Manual chain trigger
    chain: (skillId, data) => apiFetch(`/skills/${skillId}/chain`, { method: 'POST', body: JSON.stringify(data) }),
    // Phase 3: Analytics
    analyticsSummary: (brandId) => {
        const params = brandId ? `?brandId=${brandId}` : '';
        return apiFetch(`/skills/analytics/summary${params}`);
    },
    analyticsHistory: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/skills/analytics/history?${query}`);
    },
};

// ============ MCP Tools API ============
export const mcpTools = {
    list: () => apiFetch('/mcp-tools'),
};

// ============ Google Analytics + Search Console API (brand-aware) ============
export const googleAnalytics = {
    connect: (brandId, flow = 'popup') => apiFetch(`/google-analytics/connect?flow=${flow}${brandId ? `&brandId=${brandId}` : ''}`),
    status: (brandId) => apiFetch(`/google-analytics/status${brandId ? `?brandId=${brandId}` : ''}`),
    disconnect: (brandId) => apiFetch('/google-analytics/disconnect', { method: 'POST', body: JSON.stringify({ brandId: brandId || undefined }) }),
    properties: (brandId) => apiFetch(`/google-analytics/properties${brandId ? `?brandId=${brandId}` : ''}`),
    report: (data) => apiFetch('/google-analytics/report', { method: 'POST', body: JSON.stringify(data) }),
    searchConsoleSites: (brandId) => apiFetch(`/google-analytics/search-console/sites${brandId ? `?brandId=${brandId}` : ''}`),
    searchConsoleReport: (data) => apiFetch('/google-analytics/search-console/report', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Conversations API (Conversation Studio) ============
export const conversations = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/conversations?${query}`);
    },
    get: (id) => apiFetch(`/conversations/${id}`),
    reply: (id, data) => apiFetch(`/conversations/${id}/reply`, { method: 'POST', body: JSON.stringify(data) }),
    takeover: (id) => apiFetch(`/conversations/${id}/takeover`, { method: 'POST' }),
    resolve: (id) => apiFetch(`/conversations/${id}/resolve`, { method: 'POST' }),
    toggleAI: (id, enabled) => apiFetch(`/conversations/${id}/ai-mode`, { method: 'POST', body: JSON.stringify({ enabled }) }),
    suggestions: (id) => apiFetch(`/conversations/${id}/suggestions`),
    stats: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/conversations/stats/overview?${query}`);
    },
};

// ============ Contacts API (Conversation Studio CRM) ============
export const contacts = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/contacts?${query}`);
    },
    get: (id) => apiFetch(`/contacts/${id}`),
    update: (id, data) => apiFetch(`/contacts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/contacts/${id}`, { method: 'DELETE' }),
    stats: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/contacts/stats/overview?${query}`);
    },
};

// ============ Automations API (Conversation Studio) ============
export const automations = {
    recipes: () => apiFetch('/automations/recipes'),
    fromRecipe: (data) => apiFetch('/automations/from-recipe', { method: 'POST', body: JSON.stringify(data) }),
    create: (data) => apiFetch('/automations', { method: 'POST', body: JSON.stringify(data) }),
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/automations?${query}`);
    },
    get: (id) => apiFetch(`/automations/${id}`),
    update: (id, data) => apiFetch(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggle: (id) => apiFetch(`/automations/${id}/toggle`, { method: 'POST' }),
    delete: (id) => apiFetch(`/automations/${id}`, { method: 'DELETE' }),
    stats: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/automations/stats/overview?${query}`);
    },
};

// ============ Routing Rules API (AI Smart Routing) ============
export const routingRules = {
    list: (brandId) => apiFetch(`/routing-rules?brandId=${brandId}`),
    create: (data) => apiFetch('/routing-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/routing-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id, brandId) => apiFetch(`/routing-rules/${id}?brandId=${brandId}`, { method: 'DELETE' }),
    reorder: (data) => apiFetch('/routing-rules/reorder', { method: 'POST', body: JSON.stringify(data) }),
    test: (data) => apiFetch('/routing-rules/test', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Comment Replies API (Auto-Reply Logs) ============
export const commentReplies = {
    list: (brandId, limit = 20) => apiFetch(`/comment-replies?brand=${brandId}&limit=${limit}`),
};

// ============ Payments & Subscriptions API ============
export const payments = {
    getPackages: () => apiFetch('/payments/packages'),
    validateCoupon: (data) => apiFetch('/payments/validate-coupon', {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    createOrder: (packageId, billingCycle = 'monthly', couponCode = null) =>
        apiFetch('/payments/create-order', {
            method: 'POST',
            body: JSON.stringify({ packageId, billingCycle, couponCode })
        }),
    verify: (paymentData) =>
        apiFetch('/payments/verify', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        }),
    createTopupOrder: (packId, couponCode = null) =>
        apiFetch('/payments/create-topup-order', {
            method: 'POST',
            body: JSON.stringify({ packId, couponCode })
        }),
    verifyTopup: (paymentData) =>
        apiFetch('/payments/verify-topup', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        }),
    // Additional methods for CreditsPage.jsx
    getStoreVisibility: () => apiFetch('/payments/store-visibility'),
    subscriptionStatus: () => apiFetch('/payments/subscription-status'),
    getTopupPacks: () => apiFetch('/payments/topup-packs'),
};

// ============ Funnel Studio API ============
export const funnelStudio = {
    // Templates
    templates: () => apiFetch('/funnel-studio/templates'),

    // Funnel CRUD
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/funnel-studio?${query}`);
    },
    get: (id) => apiFetch(`/funnel-studio/${id}`),
    create: (data) => apiFetch('/funnel-studio', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/funnel-studio/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/funnel-studio/${id}`, { method: 'DELETE' }),

    // Entries (Pipeline)
    entries: (funnelId, params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/funnel-studio/${funnelId}/entries?${query}`);
    },
    addEntry: (funnelId, data) => apiFetch(`/funnel-studio/${funnelId}/entries`, { method: 'POST', body: JSON.stringify(data) }),
    updateEntry: (funnelId, entryId, data) => apiFetch(`/funnel-studio/${funnelId}/entries/${entryId}`, { method: 'PUT', body: JSON.stringify(data) }),
    moveEntry: (funnelId, entryId, toStage) => apiFetch(`/funnel-studio/${funnelId}/entries/${entryId}/move`, { method: 'PUT', body: JSON.stringify({ toStage }) }),
    deleteEntry: (funnelId, entryId) => apiFetch(`/funnel-studio/${funnelId}/entries/${entryId}`, { method: 'DELETE' }),

    // Analytics
    analytics: (funnelId) => apiFetch(`/funnel-studio/${funnelId}/analytics`),

    // AI
    aiGenerate: (data) => apiFetch('/funnel-studio/ai/generate', { method: 'POST', body: JSON.stringify(data) }),

    // Phase 2: Builder + Studio Connections
    duplicate: (id) => apiFetch(`/funnel-studio/${id}/duplicate`, { method: 'POST' }),
    importContacts: (funnelId, data) => apiFetch(`/funnel-studio/${funnelId}/import-contacts`, { method: 'POST', body: JSON.stringify(data) }),
    aiSuggestions: (funnelId) => apiFetch(`/funnel-studio/${funnelId}/ai-suggestions`, { method: 'POST' }),
};

// ── Nurture Sequences ──
export const nurtureSequences = {
    list: (funnelId) => apiFetch(`/nurture-sequences?funnelId=${funnelId}`),
    get: (id) => apiFetch(`/nurture-sequences/${id}`),
    create: (data) => apiFetch('/nurture-sequences', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/nurture-sequences/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/nurture-sequences/${id}`, { method: 'DELETE' }),
    aiGenerate: (data) => apiFetch('/nurture-sequences/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
    aiStepContent: (data) => apiFetch('/nurture-sequences/ai/generate-step-content', { method: 'POST', body: JSON.stringify(data) }),
    preview: (id) => apiFetch(`/nurture-sequences/${id}/preview`, { method: 'POST' }),
    toggle: (id) => apiFetch(`/nurture-sequences/${id}/toggle`, { method: 'POST' }),
};

// ── Funnel Intelligence (Phase 4) ──
export const funnelIntelligence = {
    // AI Lead Scoring
    scoreEntries: (funnelId) => apiFetch(`/funnel-intelligence/${funnelId}/score-entries`, { method: 'POST' }),
    // Funnel Health
    health: (funnelId) => apiFetch(`/funnel-intelligence/${funnelId}/health`),
    // Landing Pages
    listPages: (funnelId) => apiFetch(`/funnel-intelligence/pages?funnelId=${funnelId}`),
    getPage: (id) => apiFetch(`/funnel-intelligence/pages/${id}`),
    createPage: (data) => apiFetch('/funnel-intelligence/pages', { method: 'POST', body: JSON.stringify(data) }),
    updatePage: (id, data) => apiFetch(`/funnel-intelligence/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deletePage: (id) => apiFetch(`/funnel-intelligence/pages/${id}`, { method: 'DELETE' }),
    aiGeneratePage: (data) => apiFetch('/funnel-intelligence/pages/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
    // A/B Testing
    createVariant: (data) => apiFetch('/funnel-intelligence/ab-test/create-variant', { method: 'POST', body: JSON.stringify(data) }),
    abResults: (pageId) => apiFetch(`/funnel-intelligence/ab-test/${pageId}/results`),
    chooseWinner: (pageId, data) => apiFetch(`/funnel-intelligence/ab-test/${pageId}/choose-winner`, { method: 'POST', body: JSON.stringify(data) }),
    // Delivery
    deliver: (data) => apiFetch('/funnel-intelligence/deliver', { method: 'POST', body: JSON.stringify(data) }),
    deliverBatch: (data) => apiFetch('/funnel-intelligence/deliver-batch', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Funnel Automation Engine ──
export const funnelAutomation = {
    list: (funnelId) => apiFetch(`/funnel-automation?funnelId=${funnelId}`),
    get: (id) => apiFetch(`/funnel-automation/${id}`),
    create: (data) => apiFetch('/funnel-automation', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/funnel-automation/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/funnel-automation/${id}`, { method: 'DELETE' }),
    toggle: (id) => apiFetch(`/funnel-automation/${id}/toggle`, { method: 'POST' }),
    run: (data) => apiFetch('/funnel-automation/run', { method: 'POST', body: JSON.stringify(data) }),
    runInactivity: (data) => apiFetch('/funnel-automation/run-inactivity', { method: 'POST', body: JSON.stringify(data) }),
    aiGenerate: (data) => apiFetch('/funnel-automation/ai/generate', { method: 'POST', body: JSON.stringify(data) }),
    executeSuggestion: (data) => apiFetch('/funnel-automation/execute-suggestion', { method: 'POST', body: JSON.stringify(data) }),
    scoreEntry: (data) => apiFetch('/funnel-automation/score-entry', { method: 'POST', body: JSON.stringify(data) }),
    // Score Decay + Predictive Scoring
    scoreDecay: (data) => apiFetch('/funnel-automation/score-decay', { method: 'POST', body: JSON.stringify(data) }),
    predictiveScore: (data) => apiFetch('/funnel-automation/predictive-score', { method: 'POST', body: JSON.stringify(data) }),
    // Revenue Forecast
    revenueForecast: (funnelId) => apiFetch(`/funnel-automation/revenue-forecast?funnelId=${funnelId}`),
    // Activity Feed
    activityFeed: (funnelId) => apiFetch(`/funnel-automation/activity-feed?funnelId=${funnelId}`),
};

// ── Funnel Studio Extensions ──
export const funnelSharing = {
    share: (id, data) => apiFetch(`/funnel-studio/${id}/share`, { method: 'POST', body: JSON.stringify(data) }),
    unshare: (id) => apiFetch(`/funnel-studio/${id}/unshare`, { method: 'POST' }),
    browse: (category) => apiFetch(`/funnel-studio/shared/browse${category ? `?category=${category}` : ''}`),
    clone: (id, data) => apiFetch(`/funnel-studio/shared/${id}/clone`, { method: 'POST', body: JSON.stringify(data) }),
    webhookToken: (id) => apiFetch(`/funnel-studio/${id}/webhook-token`),
};

// ── Funnel Agentic (AI Qualifier, Smart Routing, Nurture, Cross-Studio, CSV Import) ──
export const funnelAgentic = {
    aiQualify: (funnelId, data = {}) => apiFetch(`/funnel-agentic/${funnelId}/ai-qualify`, { method: 'POST', body: JSON.stringify(data) }),
    smartRoute: (funnelId, data = {}) => apiFetch(`/funnel-agentic/${funnelId}/smart-route`, { method: 'POST', body: JSON.stringify(data) }),
    aiNurture: (funnelId, data) => apiFetch(`/funnel-agentic/${funnelId}/ai-nurture`, { method: 'POST', body: JSON.stringify(data) }),
    crossStudioSuggest: (funnelId) => apiFetch(`/funnel-agentic/${funnelId}/cross-studio-suggest`, { method: 'POST' }),
    importCsv: (funnelId, data) => apiFetch(`/funnel-agentic/${funnelId}/import-csv`, { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Media Upload API (S3 Upload-First Pattern) ============
export const media = {
    upload: (data) => apiFetch('/media/upload', { method: 'POST', body: JSON.stringify(data) }),
    // Returns { uploadUrl, s3Url, key } — use uploadUrl to PUT the file binary directly from browser
    presignUpload: (data) => apiFetch('/media/presign-upload', { method: 'POST', body: JSON.stringify(data) }),
};

/**
 * Upload a File object directly to S3 via presigned PUT (no base64, no Node proxying).
 * @param {File} file - The browser File object from an <input type="file">
 * @param {string} folder - S3 folder prefix (default: 'refs')
 * @returns {Promise<string>} - The permanent S3 URL
 */
export async function uploadFileToS3(file, folder = 'refs') {
    // 1. Get presigned PUT URL from backend
    const { uploadUrl, s3Url } = await media.presignUpload({
        fileName: file.name,
        contentType: file.type || 'image/jpeg',
        folder,
    });
    // 2. PUT the raw binary directly to S3
    const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'image/jpeg' },
        body: file,
    });
    if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);
    return s3Url;
}

// ============ Studio Reports API (Unified Branded Reports) ============
export const studioReports = {
    generate: (data) => apiFetch('/studio-reports/generate', { method: 'POST', body: JSON.stringify(data) }),
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/studio-reports?${query}`);
    },
    get: (id) => apiFetch(`/studio-reports/${id}`),
    update: (id, data) => apiFetch(`/studio-reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => apiFetch(`/studio-reports/${id}`, { method: 'DELETE' }),
    generateSlides: (id) => apiFetch(`/studio-reports/${id}/slides`, { method: 'POST' }),
};

// ============ Social Media Studio API ============
export const socialMediaStudio = {
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/social-media-studio?${query}`);
    },
    generateStrategy: (data) => apiFetch('/social-media-studio/generate-strategy', { method: 'POST', body: JSON.stringify(data) }),
    generateCalendar: (data) => apiFetch('/social-media-studio/generate-calendar', { method: 'POST', body: JSON.stringify(data) }),
    accountAudit: (data) => apiFetch('/social-media-studio/account-audit', { method: 'POST', body: JSON.stringify(data) }),
    profileScore: (data) => apiFetch('/social-media-studio/profile-score', { method: 'POST', body: JSON.stringify(data) }),
    competitorAnalysis: (data) => apiFetch('/social-media-studio/competitor-analysis', { method: 'POST', body: JSON.stringify(data) }),
    // Strategy methods
    listStrategies: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/social-media-studio/strategies?${query}`);
    },
    getStrategy: (id) => apiFetch(`/social-media-studio/strategies/${id}`),
    deleteStrategy: (id) => apiFetch(`/social-media-studio/strategies/${id}`, { method: 'DELETE' }),
};

// ============ Monthly Strategy Engine API ============
export const monthlyStrategy = {
    // SSE streaming generation — returns raw fetch Response
    generateStream: (data, signal) => {
        const base = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');
        const token = localStorage.getItem('mantram_token') || '';
        return fetch(`${base}/monthly-strategy/generate/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify(data),
            signal: signal || AbortSignal.timeout(300000),
        });
    },
    // Blocking fallback
    generate: (data) => apiFetch('/monthly-strategy/generate', { method: 'POST', body: JSON.stringify(data) }),
    // List
    list: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/monthly-strategy?${query}`);
    },
    // Single
    get: (id) => apiFetch(`/monthly-strategy/${id}`),
    // Calendar only
    calendar: (id) => apiFetch(`/monthly-strategy/${id}/calendar`),
    // Status update
    updateStatus: (strategyId, itemId, status) =>
        apiFetch(`/monthly-strategy/${strategyId}/items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    // Asset writeback
    updateAsset: (strategyId, itemId, data) =>
        apiFetch(`/monthly-strategy/${strategyId}/items/${itemId}/asset`, { method: 'PATCH', body: JSON.stringify(data) }),
    // Studio handoff info
    execute: (strategyId, itemId) =>
        apiFetch(`/monthly-strategy/${strategyId}/items/${itemId}/execute`, { method: 'POST' }),
    // Regenerate brief (1 credit)
    regenerateBrief: (strategyId, itemId, instructions = '') =>
        apiFetch(`/monthly-strategy/${strategyId}/items/${itemId}/regenerate-brief`, { method: 'POST', body: JSON.stringify({ instructions }) }),
    // Archive
    delete: (id) => apiFetch(`/monthly-strategy/${id}`, { method: 'DELETE' }),
    // Inline image generation — reuses /creatives/generate endpoint
    // refImageUrls: string[] — must be S3/HTTP URLs, never base64
    generateVisual: (data) =>
        apiFetch('/creatives/generate', { method: 'POST', body: JSON.stringify(data), timeout: 180000 }),
    // Fire-and-forget background job — returns { jobId } immediately, pipeline runs on server
    startJob: (data) => apiFetch('/monthly-strategy/generate/start', { method: 'POST', body: JSON.stringify(data) }),
    // Batch generate all pending calendar images — returns { batchId, totalItems }
    batchGenerate: (strategyId, data) =>
        apiFetch(`/monthly-strategy/${strategyId}/batch-generate`, { method: 'POST', body: JSON.stringify(data) }),
};

// ── Brand Calendar ──────────────────────────────────────────────────────────
export const brandCalendar = {
    // Month view — returns all SocialPosts + strategy items for brand in given month
    month: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/calendar?${query}`);
    },
    // Today + tomorrow — used for dashboard widget
    today: (brand) => {
        const q = brand ? `?brand=${brand}` : '';
        return apiFetch(`/calendar/today${q}`);
    },
};

// ── Background Jobs ─────────────────────────────────────────────────────────
export const jobs = {
    // All pending/processing jobs for current user
    active: () => apiFetch('/jobs/active'),
    // Poll a specific job by ID
    status: (jobId) => apiFetch(`/jobs/${jobId}`),
    // Cancel a running job
    cancel: (jobId) => apiFetch(`/jobs/${jobId}/cancel`, { method: 'PATCH' }),
};

// ── Notifications ───────────────────────────────────────────────────────────
export const notificationsAPI = {
    list: (limit = 30) => apiFetch(`/notifications?limit=${limit}`),
    unreadCount: () => apiFetch('/notifications/unread-count'),
    read: (id) => apiFetch(`/notifications/${id}/read`, { method: 'POST' }),
    readAll: () => apiFetch('/notifications/read-all', { method: 'POST' }),
    delete: (id) => apiFetch(`/notifications/${id}`, { method: 'DELETE' }),
};

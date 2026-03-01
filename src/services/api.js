/**
 * Mantram AI — Frontend API Service
 * Centralized API client for all backend communication.
 * Handles auth tokens, error handling, and response parsing.
 */

const API_BASE = `${window.location.origin}/api`;

// Token management
let authToken = localStorage.getItem('mantram_token') || '';

export const setToken = (token) => {
    authToken = token;
    localStorage.setItem('mantram_token', token);
};

export const clearToken = () => {
    authToken = '';
    localStorage.removeItem('mantram_token');
};

export const getToken = () => authToken;

// Base fetch wrapper
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
    });

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
        throw new Error(data.error || 'API request failed');
    }

    return data;
}

// ============ Auth API ============
export const auth = {
    register: (data) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    getProfile: () => apiFetch('/auth/me'),
    updateProfile: (data) => apiFetch('/auth/profile', { method: 'PUT', body: JSON.stringify(data) }),
};

// ============ Brands API ============
export const brands = {
    list: () => apiFetch('/brands'),
    get: (id) => apiFetch(`/brands/${id}`),
    create: (data) => apiFetch('/brands', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiFetch(`/brands/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    updateDNA: (id, dnaUpdates) => apiFetch(`/brands/${id}/dna`, { method: 'PUT', body: JSON.stringify(dnaUpdates) }),
    delete: (id) => apiFetch(`/brands/${id}`, { method: 'DELETE' }),
};

// ============ Content API ============
export const content = {
    providers: () => apiFetch('/content/providers'),
    generate: (data) => apiFetch('/content/generate', { method: 'POST', body: JSON.stringify(data) }),
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
};

// ============ Creatives API ============
export const creatives = {
    generate: (data) => apiFetch('/creatives/generate', { method: 'POST', body: JSON.stringify(data) }),
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
};

// ============ Agent API ============
export const agents = {
    scanWebsite: (url) => apiFetch('/agents/scan-website', { method: 'POST', body: JSON.stringify({ url }) }),
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
    connect: (shopDomain) => apiFetch('/shopify/connect', { method: 'POST', body: JSON.stringify({ shopDomain }) }),
    sync: (brandId) => apiFetch('/shopify/sync', { method: 'POST', body: JSON.stringify({ brandId }) }),
    products: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/shopify/products?${query}`);
    },
    getProduct: (id) => apiFetch(`/shopify/products/${id}`),
    disconnect: () => apiFetch('/shopify/disconnect', { method: 'DELETE' }),
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
    smartMatch: (data) => apiFetch('/products/smart-match', { method: 'POST', body: JSON.stringify(data) }),
    enrich: (data) => apiFetch('/products/enrich', { method: 'POST', body: JSON.stringify(data) }),
};

// ============ Trends API ============
export const trends = {
    now: (geo = 'IN') => apiFetch(`/trends/now?geo=${geo}`),
    brandMatch: (brandId, geo = 'IN') => apiFetch(`/trends/brand-match?brandId=${brandId}&geo=${geo}`),
    refresh: (geo = 'IN') => apiFetch(`/trends/refresh?geo=${geo}`, { method: 'POST' }),
};

// ============ Social Media API ============
export const social = {
    connect: (platform, brandId) => apiFetch(`/social/connect/${platform}`, { method: 'POST', body: JSON.stringify({ brandId }) }),
    status: () => apiFetch('/social/status'),
    publish: (data) => apiFetch('/social/publish', { method: 'POST', body: JSON.stringify(data) }),
    disconnect: (platform) => apiFetch(`/social/disconnect/${platform}`, { method: 'DELETE' }),
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
};

// ============ Credits API ============
export const credits = {
    balance: () => apiFetch('/credits/balance'),
    usage: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/credits/usage?${query}`);
    },
    summary: () => apiFetch('/credits/summary'),
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
};

// ============ SEO Studio API ============
export const seoStudio = {
    healthCheck: (data) => apiFetch('/seo-studio/health-check', { method: 'POST', body: JSON.stringify(data) }),
    traffic: (data) => apiFetch('/seo-studio/traffic', { method: 'POST', body: JSON.stringify(data) }),
    competitors: (data) => apiFetch('/seo-studio/competitors', { method: 'POST', body: JSON.stringify(data) }),
    aiVisibility: (data) => apiFetch('/seo-studio/ai-visibility', { method: 'POST', body: JSON.stringify(data) }),
    auditPage: (data) => apiFetch('/seo-studio/audit-page', { method: 'POST', body: JSON.stringify(data) }),
    ask: (data) => apiFetch('/seo-studio/ask', { method: 'POST', body: JSON.stringify(data) }),
    manageCompetitors: (data) => apiFetch('/seo-studio/competitors/manage', { method: 'POST', body: JSON.stringify(data) }),
    discoverCompetitors: (data) => apiFetch('/seo-studio/competitors/discover', { method: 'POST', body: JSON.stringify(data) }),
    history: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/history?${query}`);
    },
    getAudit: (id) => apiFetch(`/seo-studio/history/${id}`),
};

// ============ Google Analytics + Search Console API ============
export const googleAnalytics = {
    connect: () => apiFetch('/google-analytics/connect'),
    status: () => apiFetch('/google-analytics/status'),
    disconnect: () => apiFetch('/google-analytics/disconnect', { method: 'POST' }),
    properties: () => apiFetch('/google-analytics/properties'),
    report: (data) => apiFetch('/google-analytics/report', { method: 'POST', body: JSON.stringify(data) }),
    searchConsoleSites: () => apiFetch('/google-analytics/search-console/sites'),
    searchConsoleReport: (data) => apiFetch('/google-analytics/search-console/report', { method: 'POST', body: JSON.stringify(data) }),
};

/**
 * Mantram AI — Frontend API Service
 * Centralized API client for all backend communication.
 * Handles auth tokens, error handling, and response parsing.
 */

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

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
    google: () => apiFetch('/auth/google'),
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
};

// ============ Creatives API ============
export const creatives = {
    generate: (data) => apiFetch('/creatives/generate', { method: 'POST', body: JSON.stringify(data) }),
    enhancePrompt: (data) => apiFetch('/creatives/enhance-prompt', { method: 'POST', body: JSON.stringify(data) }),
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
    grokTopics: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-topics?${q}`); },
    grokSeo: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-seo?${q}`); },
    grokContent: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-content?${q}`); },
    grokCompetitors: (params = {}) => { const q = new URLSearchParams(params).toString(); return apiFetch(`/trends/grok-competitors?${q}`); },
};

// ============ Dashboard Summary API ============
export const dashboardSummary = {
    get: (brandId) => apiFetch(`/dashboard-summary${brandId ? `?brandId=${brandId}` : ''}`),
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
    // Brand Strategy
    strategy: (data) => apiFetch('/brainstorm-studio/strategy', { method: 'POST', body: JSON.stringify(data) }),
    strategySlides: (data) => apiFetch('/brainstorm-studio/strategy-slides', { method: 'POST', body: JSON.stringify(data) }),
    listStrategies: () => apiFetch('/brainstorm-studio/strategies'),
    getStrategy: (id) => apiFetch(`/brainstorm-studio/strategies/${id}`),
    updateKpi: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/kpi`, { method: 'PATCH', body: JSON.stringify(data) }),
    toggleMilestone: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/milestone`, { method: 'PATCH', body: JSON.stringify(data) }),
    updateStrategyStatus: (id, data) => apiFetch(`/brainstorm-studio/strategies/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) }),
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
    healthCheck: (data) => apiFetch('/seo-studio/health-check', { method: 'POST', body: JSON.stringify(data) }),
    traffic: (data) => apiFetch('/seo-studio/traffic', { method: 'POST', body: JSON.stringify(data) }),
    competitors: (data) => apiFetch('/seo-studio/competitors', { method: 'POST', body: JSON.stringify(data) }),
    aiVisibility: (data) => apiFetch('/seo-studio/ai-visibility', { method: 'POST', body: JSON.stringify(data) }),
    auditPage: (data) => apiFetch('/seo-studio/audit-page', { method: 'POST', body: JSON.stringify(data) }),
    ask: (data) => apiFetch('/seo-studio/ask', { method: 'POST', body: JSON.stringify(data) }),
    manageCompetitors: (data) => apiFetch('/seo-studio/competitors/manage', { method: 'POST', body: JSON.stringify(data) }),
    discoverCompetitors: (data) => apiFetch('/seo-studio/competitors/discover', { method: 'POST', body: JSON.stringify(data) }),
    // New agentic workflows
    competitorWarRoom: (data) => apiFetch('/seo-studio/competitor-warroom', { method: 'POST', body: JSON.stringify(data) }),
    llmProbe: (data) => apiFetch('/seo-studio/llm-probe', { method: 'POST', body: JSON.stringify(data) }),
    autoFix: (data) => apiFetch('/seo-studio/auto-fix', { method: 'POST', body: JSON.stringify(data) }),
    promptMining: (data) => apiFetch('/seo-studio/prompt-mining', { method: 'POST', body: JSON.stringify(data) }),
    history: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return apiFetch(`/seo-studio/history?${query}`);
    },
    getAudit: (id) => apiFetch(`/seo-studio/history/${id}`),
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
};

// ============ Google Analytics + Search Console API (brand-aware) ============
export const googleAnalytics = {
    connect: (brandId) => apiFetch(`/google-analytics/connect${brandId ? `?brandId=${brandId}` : ''}`),
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

// ============ Payments & Subscriptions API ============
export const payments = {
    getPackages: () => apiFetch('/payments/packages'),
    createOrder: (packageId, billingCycle = 'monthly') =>
        apiFetch('/payments/create-order', {
            method: 'POST',
            body: JSON.stringify({ packageId, billingCycle })
        }),
    verify: (paymentData) =>
        apiFetch('/payments/verify', {
            method: 'POST',
            body: JSON.stringify(paymentData)
        }),
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

// ============ Media Upload API (S3 Upload-First Pattern) ============
export const media = {
    upload: (data) => apiFetch('/media/upload', { method: 'POST', body: JSON.stringify(data) }),
};

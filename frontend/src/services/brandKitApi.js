/**
 * Brand Kit API Service
 * Connects frontend to all /api/brand-kit/* endpoints
 */

export const API_BASE = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');

const authHeaders = () => {
    const token = localStorage.getItem('mantram_token');
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
};

async function handleResponse(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
}

export const brandKitApi = {
    /** Generate brand logo + identity marks */
    generateIdentity: (payload) =>
        fetch(`${API_BASE}/brand-kit/identity/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

    /** Generate full stationery kit */
    generateStationery: (payload) =>
        fetch(`${API_BASE}/brand-kit/stationery/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

    /** Generate interactive brand guide */
    generateGuide: (payload) =>
        fetch(`${API_BASE}/brand-kit/guide/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

    /** Generate product collection / new range launch pack */
    generateCollection: (payload) =>
        fetch(`${API_BASE}/brand-kit/collection/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

    /** Zero-brand all-in-one wizard */
    runWizard: (payload) =>
        fetch(`${API_BASE}/brand-kit/wizard/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) }).then(handleResponse),

    /** List all brand kit assets */
    listAssets: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return fetch(`${API_BASE}/brand-kit/assets${qs ? '?' + qs : ''}`, { headers: authHeaders() }).then(handleResponse);
    },

    /** Delete an asset */
    deleteAsset: (id) =>
        fetch(`${API_BASE}/brand-kit/assets/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handleResponse),
};

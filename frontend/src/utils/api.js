const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default async function api(endpoint, options = {}) {
    // Strip whitespace/control chars — Safari throws DOMException for header
    // values containing newlines (from localStorage tokens stored with whitespace)
    const token = (localStorage.getItem('mantram_token') || '').replace(/[\s\r\n\t]+/g, '');
    const headers = {
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Only set Content-Type if it's not a FormData payload (browser sets correct boundary for multipart)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || data.message || 'API request failed');
    }

    return data;
}

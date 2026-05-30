/**
 * Utility functions for Google Analytics and Microsoft Clarity tracking
 * SEC-001: Only public user slugs (e.g. "cosmic-ninja-42") are sent to
 * third-party analytics. Never send MongoDB ObjectIDs to external services.
 */

// Track a page view explicitly for SPAs
export const trackPageView = (url) => {
    if (typeof window.gtag === 'function') {
        window.gtag('config', 'G-74SEW9Y4R0', {
            page_path: url,
        });
    }
};

// Track a custom event (e.g. button click)
export const trackEvent = (eventName, params = {}) => {
    if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params);
    }
};

/**
 * Identify the user for session recordings.
 * @param {string} publicId - The user's public slug (e.g. "cosmic-ninja-42").
 *                            NEVER pass MongoDB _id to third-party services.
 */
export const setUserId = (publicId) => {
    if (!publicId) return;

    // For Google Analytics — use public slug only
    if (typeof window.gtag === 'function') {
        window.gtag('config', 'G-74SEW9Y4R0', {
            user_id: publicId
        });
    }

    // For Microsoft Clarity — use public slug only
    if (typeof window.clarity === 'function') {
        window.clarity("set", "user_id", publicId);
    }
};


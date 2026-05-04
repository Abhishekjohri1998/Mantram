/**
 * Utility functions for Google Analytics and Microsoft Clarity tracking
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

// Identify the user for session recordings
export const setUserId = (userId) => {
    // For Google Analytics
    if (typeof window.gtag === 'function') {
        window.gtag('config', 'G-74SEW9Y4R0', {
            user_id: userId
        });
    }

    // For Microsoft Clarity
    if (typeof window.clarity === 'function') {
        window.clarity("set", "user_id", userId);
    }
};

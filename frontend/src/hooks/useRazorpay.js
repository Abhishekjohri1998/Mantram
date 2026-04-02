import { useState, useCallback } from 'react';

/**
 * Custom hook to load the Razorpay checkout script on demand.
 * This prevents the script from blocking the initial page load.
 */
export function useRazorpay() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loadRazorpay = useCallback(() => {
        return new Promise((resolve, reject) => {
            // Check if script is already present
            if (window.Razorpay) {
                resolve(window.Razorpay);
                return;
            }

            setLoading(true);
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.async = true;
            script.defer = true;

            script.onload = () => {
                setLoading(false);
                if (window.Razorpay) {
                    resolve(window.Razorpay);
                } else {
                    const err = new Error('Razorpay SDK failed to load');
                    setError(err);
                    reject(err);
                }
            };

            script.onerror = () => {
                setLoading(false);
                const err = new Error('Failed to load Razorpay SDK');
                setError(err);
                reject(err);
            };

            document.body.appendChild(script);
        });
    }, []);

    return { loadRazorpay, loading, error };
}

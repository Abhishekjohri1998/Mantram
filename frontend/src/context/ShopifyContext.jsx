import { createContext, useContext, useEffect, useState } from 'react';
import { setDynamicTokenProvider } from '../services/api';

const ShopifyContext = createContext();

export const useShopify = () => useContext(ShopifyContext);

export const ShopifyProvider = ({ children }) => {
    const [isEmbedded, setIsEmbedded] = useState(false);
    const [shop, setShop] = useState(null);
    const [shopifyError, setShopifyError] = useState(null);

    const getSessionToken = async () => {
        // We use window.shopify directly to avoid stale closure issues with isEmbedded
        const urlParams = new URLSearchParams(window.location.search);
        const shopParam = urlParams.get('shop');
        const hostParam = urlParams.get('host');

        if (!(shopParam && hostParam)) return null;
        
        // Wait for App Bridge to load (CDN script may still be loading)
        if (!window.shopify) {
            await new Promise((resolve) => {
                let attempts = 0;
                const check = setInterval(() => {
                    attempts++;
                    if (window.shopify || attempts > 50) { // Max 5 seconds
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }

        if (!window.shopify) {
            console.warn('⚠️ Shopify App Bridge not available after waiting');
            setShopifyError('App Bridge failed to load. Please refresh the page.');
            return null;
        }

        try {
            // App Bridge v4 (CDN version) uses shopify.idToken()
            const token = await window.shopify.idToken();
            setShopifyError(null); // Clear any previous error
            return token;
        } catch (error) {
            console.error('❌ Failed to get Shopify Session Token:', error);
            setShopifyError('Session token failed. Please reload the app from Shopify Admin.');
            return null;
        }
    };

    useEffect(() => {
        // Detect if we are running inside Shopify iframe
        const urlParams = new URLSearchParams(window.location.search);
        const shopParam = urlParams.get('shop');
        const hostParam = urlParams.get('host');

        if (shopParam && hostParam) {
            console.log('🛍️ Shopify Embedded Context detected:', shopParam);
            setIsEmbedded(true);
            setShop(shopParam);

            // Register dynamic token provider for API service
            setDynamicTokenProvider(getSessionToken);
        }
    }, []);

    return (
        <ShopifyContext.Provider value={{ isEmbedded, shop, shopifyError, getSessionToken }}>
            {children}
        </ShopifyContext.Provider>
    );
};

import { createContext, useContext, useEffect, useState } from 'react';
import { setDynamicTokenProvider } from '../services/api';

const ShopifyContext = createContext();

export const useShopify = () => useContext(ShopifyContext);

export const ShopifyProvider = ({ children }) => {
    const [isEmbedded, setIsEmbedded] = useState(false);
    const [shop, setShop] = useState(null);

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

            // Initialize App Bridge if it's loaded from CDN
            if (window.shopify) {
                // App Bridge v3+ initialization is implicit 
                // but we can config if needed here
            }
        }
    }, []);

    const getSessionToken = async () => {
        if (!isEmbedded || !window.shopify) return null;
        try {
            // App Bridge v4 (CDN version) uses shopify.idToken()
            return await window.shopify.idToken();
        } catch (error) {
            console.error('❌ Failed to get Shopify Session Token:', error);
            return null;
        }
    };

    return (
        <ShopifyContext.Provider value={{ isEmbedded, shop, getSessionToken }}>
            {children}
        </ShopifyContext.Provider>
    );
};

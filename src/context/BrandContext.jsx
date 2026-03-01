import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { brands as brandsAPI } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const BrandContext = createContext(null);

export function BrandProvider({ children }) {
    const { isAuthenticated } = useAuth();
    const [brands, setBrands] = useState([]);
    const [activeBrand, setActiveBrand] = useState(null);
    const [loading, setLoading] = useState(false);

    // Fetch brands when authenticated
    const fetchBrands = useCallback(async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            // Check for pending brand from onboarding (saved to localStorage before login)
            const pendingBrandJson = localStorage.getItem('mantram_pending_brand');
            if (pendingBrandJson) {
                try {
                    const pendingBrand = JSON.parse(pendingBrandJson);
                    console.log('📦 Found pending brand from onboarding, saving...', pendingBrand.name);
                    const saved = await brandsAPI.create({
                        name: pendingBrand.name,
                        website: pendingBrand.website,
                        onboardingMethod: pendingBrand.onboardingMethod || 'website',
                        dna: pendingBrand.dna,
                        rawScanData: pendingBrand.rawScanData,
                    });
                    if (saved.brand) {
                        console.log('✅ Pending brand saved:', saved.brand.name);
                    }
                } catch (saveErr) {
                    console.error('Failed to save pending brand:', saveErr);
                }
                localStorage.removeItem('mantram_pending_brand');
            }

            const data = await brandsAPI.list();
            setBrands(data.brands || []);
            // Auto-select first brand if none active
            if (!activeBrand && data.brands?.length) {
                setActiveBrand(data.brands[0]);
            }
        } catch (err) {
            console.error('Failed to fetch brands:', err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => { fetchBrands(); }, [fetchBrands]);

    const selectBrand = (brand) => {
        setActiveBrand(brand);
        localStorage.setItem('mantram_active_brand', brand._id);
    };

    const addBrand = (brand) => {
        setBrands(prev => [brand, ...prev]);
        setActiveBrand(brand);
    };

    const updateBrand = async (id, updates) => {
        const data = await brandsAPI.update(id, updates);
        setBrands(prev => prev.map(b => b._id === id ? data.brand : b));
        if (activeBrand?._id === id) setActiveBrand(data.brand);
        return data.brand;
    };

    const updateBrandDNA = async (id, dnaUpdates) => {
        const data = await brandsAPI.updateDNA(id, dnaUpdates);
        setBrands(prev => prev.map(b => b._id === id ? data.brand : b));
        if (activeBrand?._id === id) setActiveBrand(data.brand);
        return data.brand;
    };

    return (
        <BrandContext.Provider value={{
            brands, activeBrand, loading,
            selectBrand, addBrand, updateBrand, updateBrandDNA, fetchBrands,
        }}>
            {children}
        </BrandContext.Provider>
    );
}

export const useBrand = () => {
    const ctx = useContext(BrandContext);
    if (!ctx) throw new Error('useBrand must be used within BrandProvider');
    return ctx;
};

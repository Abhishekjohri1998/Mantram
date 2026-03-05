import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { brands as brandsAPI } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const BrandContext = createContext(null);
const STORAGE_KEY = 'mantram_active_brand';

export function BrandProvider({ children }) {
    const { isAuthenticated } = useAuth();
    const [brands, setBrands] = useState([]);
    const [activeBrand, setActiveBrandState] = useState(null);
    const [loading, setLoading] = useState(false);
    const initializedRef = useRef(false);

    // Wrapper that also persists to localStorage
    const setActiveBrand = useCallback((brand) => {
        setActiveBrandState(brand);
        if (brand?._id) {
            localStorage.setItem(STORAGE_KEY, brand._id);
        }
    }, []);

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
            // Safety filter: exclude archived brands from global state
            // (backend already filters, but this is a double-safety layer)
            const brandList = (data.brands || []).filter(b => b.status !== 'archived');
            setBrands(brandList);

            if (brandList.length === 0) {
                setActiveBrand(null);
                return;
            }

            // Restore previously selected brand from localStorage
            const savedBrandId = localStorage.getItem(STORAGE_KEY);
            const savedBrand = savedBrandId
                ? brandList.find(b => b._id === savedBrandId && b.status !== 'archived')
                : null;

            if (savedBrand) {
                // Restore saved brand (even if activeBrand is already set, refresh the data)
                setActiveBrand(savedBrand);
            } else if (!activeBrand || !brandList.find(b => b._id === activeBrand._id)) {
                // No saved brand or saved brand no longer exists → pick first
                setActiveBrand(brandList[0]);
            }

            initializedRef.current = true;
        } catch (err) {
            console.error('Failed to fetch brands:', err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => { fetchBrands(); }, [fetchBrands]);

    // Public selectBrand — updates state + localStorage
    const selectBrand = useCallback((brand) => {
        setActiveBrand(brand);
        console.log(`🏷️ Brand switched to: ${brand?.name || 'none'}`);
    }, [setActiveBrand]);

    const addBrand = useCallback((brand) => {
        setBrands(prev => [brand, ...prev]);
        setActiveBrand(brand);
    }, [setActiveBrand]);

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

    const deleteBrand = async (id) => {
        await brandsAPI.delete(id);
        setBrands(prev => {
            const remaining = prev.filter(b => b._id !== id);
            // If deleted brand was active, switch to next available
            if (activeBrand?._id === id) {
                if (remaining.length > 0) {
                    setActiveBrand(remaining[0]);
                } else {
                    setActiveBrand(null);
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
            return remaining;
        });
    };

    return (
        <BrandContext.Provider value={{
            brands, activeBrand, loading,
            hasBrands: brands.length > 0,
            selectBrand, addBrand, updateBrand, updateBrandDNA, deleteBrand, fetchBrands,
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

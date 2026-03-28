import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { brands as brandsAPI } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { useBrandSession } from '../hooks/useBrandSession.js';

const BrandContext = createContext(null);
const STORAGE_KEY = 'mantram_active_brand';

export function BrandProvider({ children }) {
    const { isAuthenticated, user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [brands, setBrands] = useState([]);
    const [activeBrand, setActiveBrandState] = useState(null);
    const [loading, setLoading] = useState(false);
    const initializedRef = useRef(false);
    const prevBrandIdRef = useRef(null);

    const { saveSession, restoreSession, saveActiveJob, removeActiveJob, getActiveJobs } = useBrandSession(user?._id);

    // Wrapper that persists to localStorage
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
                    console.log('📦 Found pending brand from onboarding:', pendingBrand.name);

                    const normalizeUrl = (u) => (u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
                    const pendingWebsite = normalizeUrl(pendingBrand.website);

                    const currentData = await brandsAPI.list();
                    const currentBrands = (currentData.brands || []).filter(b => b.status !== 'archived');
                    const existingBrand = pendingWebsite
                        ? currentBrands.find(b => normalizeUrl(b.website) === pendingWebsite)
                        : null;

                    if (existingBrand) {
                        console.log('🔄 Brand with same website found, updating:', existingBrand.name, '→', pendingBrand.name);
                        const updated = await brandsAPI.update(existingBrand._id, {
                            name: pendingBrand.name || existingBrand.name,
                            website: pendingBrand.website || existingBrand.website,
                            onboardingMethod: pendingBrand.onboardingMethod || existingBrand.onboardingMethod,
                            dna: { ...existingBrand.dna, ...pendingBrand.dna },
                            rawScanData: pendingBrand.rawScanData || existingBrand.rawScanData,
                        });
                        if (updated.brand) console.log('✅ Existing brand updated:', updated.brand.name);
                    } else {
                        const saved = await brandsAPI.create({
                            name: pendingBrand.name,
                            website: pendingBrand.website,
                            onboardingMethod: pendingBrand.onboardingMethod || 'website',
                            dna: pendingBrand.dna,
                            rawScanData: pendingBrand.rawScanData,
                        });
                        if (saved.brand) console.log('✅ New brand created:', saved.brand.name);
                    }
                    
                    // CRITICAL: Refresh user to update brandCount in AuthContext
                    if (refreshUser) {
                        console.log('🔄 Refreshing user after brand creation...');
                        await refreshUser();
                    }
                } catch (saveErr) {
                    console.error('Failed to save pending brand:', saveErr);
                }
                localStorage.removeItem('mantram_pending_brand');
            }

            const data = await brandsAPI.list();
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

            const brandToActivate = savedBrand || (!activeBrand || !brandList.find(b => b._id === activeBrand._id) ? brandList[0] : null);

            if (brandToActivate) {
                setActiveBrand(brandToActivate);
                // On initial load, restore last active page for this brand
                if (!initializedRef.current) {
                    const session = restoreSession(brandToActivate._id);
                    if (session.lastActivePage && session.lastActivePage !== window.location.pathname) {
                        console.log(`🔁 Resuming brand "${brandToActivate.name}" at: ${session.lastActivePage}`);
                        navigate(session.lastActivePage, { replace: true });
                    }
                }
            }

            initializedRef.current = true;
        } catch (err) {
            console.error('Failed to fetch brands:', err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated]);

    useEffect(() => { fetchBrands(); }, [fetchBrands]);

    /**
     * selectBrand — called from Header when user picks a brand
     * 1. Save current page for the OUTGOING brand
     * 2. Switch active brand
     * 3. Navigate to last known page for the INCOMING brand
     */
    const selectBrand = useCallback((brand) => {
        const currentPath = window.location.pathname;

        // 1. Save current page for outgoing brand
        if (activeBrand?._id && activeBrand._id !== brand._id) {
            saveSession(activeBrand._id, { lastActivePage: currentPath });
            console.log(`💾 Saved session for "${activeBrand.name}": ${currentPath}`);
        }

        // 2. Switch brand
        setActiveBrand(brand);
        prevBrandIdRef.current = brand._id;
        console.log(`🏷️ Brand switched to: ${brand?.name || 'none'}`);

        // 3. Restore last page for incoming brand (or go to dashboard)
        const session = restoreSession(brand._id);
        const targetPage = session.lastActivePage || '/dashboard';
        console.log(`🔁 Navigating to "${brand.name}" last page: ${targetPage}`);
        navigate(targetPage);
    }, [activeBrand, setActiveBrand, saveSession, restoreSession, navigate]);

    // Auto-save current page every time the route changes
    useEffect(() => {
        if (!activeBrand?._id || !initializedRef.current) return;
        const currentPath = window.location.pathname;
        // Don't save auth / onboarding pages
        if (currentPath.startsWith('/auth') || currentPath.startsWith('/onboarding')) return;
        saveSession(activeBrand._id, { lastActivePage: currentPath });
    }, [activeBrand?._id, window.location.pathname]);

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
            // Session helpers — exposed so Video Studio / other modules can save jobs
            saveActiveJob: (jobId, meta) => saveActiveJob(activeBrand?._id, jobId, meta),
            removeActiveJob: (jobId) => removeActiveJob(activeBrand?._id, jobId),
            getActiveJobs: () => getActiveJobs(activeBrand?._id),
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

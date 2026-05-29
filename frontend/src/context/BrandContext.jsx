import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { brands as brandsAPI, invalidateCache } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';
import { useBrandSession } from '../hooks/useBrandSession.js';

const BrandContext = createContext(null);
const STORAGE_KEY = 'mantram_active_brand';

export function BrandProvider({ children }) {
    const { isAuthenticated, user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
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
                    
                    // 1. Try to match by website
                    let targetBrand = pendingWebsite
                        ? currentBrands.find(b => normalizeUrl(b.website) === pendingWebsite)
                        : null;

                    // 2. Fallback: If only one brand exists (new account) and it has no website, use it
                    if (!targetBrand && currentBrands.length === 1 && !currentBrands[0].website) {
                        targetBrand = currentBrands[0];
                    }

                    if (targetBrand) {
                        console.log('🔄 Reconciling pending data into brand:', targetBrand.name);
                        const updated = await brandsAPI.update(targetBrand._id, {
                            name: pendingBrand.name || targetBrand.name,
                            website: pendingBrand.website || targetBrand.website,
                            onboardingMethod: pendingBrand.onboardingMethod || targetBrand.onboardingMethod,
                            dna: { ...targetBrand.dna, ...pendingBrand.dna },
                            rawScanData: pendingBrand.rawScanData || targetBrand.rawScanData,
                        });
                        if (updated.brand) console.log('✅ Brand reconciled successfully:', updated.brand.name);
                    } else {
                        const saved = await brandsAPI.create({
                            name: pendingBrand.name,
                            website: pendingBrand.website,
                            onboardingMethod: pendingBrand.onboardingMethod || 'website',
                            dna: pendingBrand.dna,
                            rawScanData: pendingBrand.rawScanData,
                        });
                        if (saved.brand) console.log('✅ New brand created from pending scan:', saved.brand.name);
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
                // PERF-017: Bust cache so the list() call below fetches fresh data
                invalidateCache('/brands');
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
                // On session start, restore last active page for this brand
                // We use sessionStorage to ensure this ONLY happens once per tab session.
                const resumptionKey = `mantram_resumed_${brandToActivate._id}`;
                const alreadyResumed = sessionStorage.getItem(resumptionKey);

                if (!initializedRef.current && !alreadyResumed) {
                    const session = restoreSession(brandToActivate._id);
                    const currentPath = window.location.pathname;
                    
                    // Only auto-resume if we are on a "entry" page (root, dashboard, or nexus)
                    // If the user already navigated to a specific tool, don't force-resume them back.
                    const isEntryPage = currentPath === '/' || currentPath === '/dashboard' || currentPath === '/nexus';
                    
                    if (isEntryPage && session.lastActivePage && 
                        session.lastActivePage !== currentPath && 
                        !currentPath.startsWith('/onboarding') && 
                        !currentPath.startsWith('/auth')) {
                        
                        // Avoid redirect loops: if we are already at the target page (ignoring query params) skip
                        const targetBase = session.lastActivePage.split('?')[0].replace(/\/$/, '');
                        const currentBase = currentPath.split('?')[0].replace(/\/$/, '');
                        
                        if (targetBase === currentBase) {
                            console.log(`ℹ️ Already at resumption target base: ${targetBase}`);
                        } else {
                            console.log(`🔁 Resuming brand "${brandToActivate.name}" at: ${session.lastActivePage}`);
                            sessionStorage.setItem(resumptionKey, 'true'); // Mark as done BEFORE navigating
                            navigate(session.lastActivePage, { replace: true });
                        }
                    }
                    // Even if we didn't navigate, mark as resumed for this session to prevent hijacking later
                    sessionStorage.setItem(resumptionKey, 'true');
                }


            }

            initializedRef.current = true;
        } catch (err) {
            console.error('Failed to fetch brands:', err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, setActiveBrand, restoreSession, navigate, refreshUser]);

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
        const currentPath = location.pathname;
        // Don't save auth / onboarding pages
        if (currentPath.startsWith('/auth') || currentPath.startsWith('/onboarding')) return;
        saveSession(activeBrand._id, { lastActivePage: currentPath });
    }, [activeBrand?._id, location.pathname, saveSession]);

    const addBrand = useCallback((brand) => {
        setBrands(prev => [brand, ...prev]);
        setActiveBrand(brand);
    }, [setActiveBrand]);

    const updateBrand = async (id, updates) => {
        const data = await brandsAPI.update(id, updates);
        invalidateCache('/brands'); // Bust list cache after mutation
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
        invalidateCache('/brands'); // Bust list cache after deletion
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

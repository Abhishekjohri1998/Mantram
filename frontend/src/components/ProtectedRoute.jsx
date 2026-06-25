import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, isAuthenticated, loading: authLoading } = useAuth()
    const { activeBrand, initialized: brandInitialized, isBrandOnboarded } = useBrand()
    const location = useLocation()

    // 1. If auth is loading, show spinner
    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c16' }}>
                <div className="text-center space-y-4">
                    <span className="material-symbols-outlined text-primary text-5xl animate-spin">progress_activity</span>
                    <p className="text-[var(--sys-text-muted)] text-sm">Loading...</p>
                </div>
            </div>
        )
    }

    // 2. If not authenticated, redirect to login page immediately
    if (!isAuthenticated) {
        const redirectPath = location.pathname + location.search
        return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectPath)}`} replace />
    }

    // 3. If authenticated, wait for brand context to load
    if (!brandInitialized) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c16' }}>
                <div className="text-center space-y-4">
                    <span className="material-symbols-outlined text-primary text-5xl animate-spin">progress_activity</span>
                    <p className="text-[var(--sys-text-muted)] text-sm">Loading brand context...</p>
                </div>
            </div>
        )
    }

    // 4. Check role if allowedRoles is provided
    if (allowedRoles && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/templates" replace />
    }

    // 5. Onboarding Enforcement
    // Check if the user has an active brand and if it is fully onboarded (contains DNA/Knowledge)
    const hasOnboardedBrand = activeBrand && isBrandOnboarded(activeBrand);
    const isWhitelisted = [
        '/onboarding',
        '/settings',
        '/credits',
        '/verify-email',
        '/auth',
        '/login',
        '/signup',
        '/reset-password',
        '/terms',
        '/privacy-policy'
    ].some(path => location.pathname.startsWith(path));

    if (!hasOnboardedBrand && !isWhitelisted && user?.role !== 'member') {
        console.log('🔄 Active brand not onboarded, redirecting to onboarding...');
        return <Navigate to="/onboarding" replace />;
    }

    return children
}

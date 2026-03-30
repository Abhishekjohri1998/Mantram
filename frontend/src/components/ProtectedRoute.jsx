import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, isAuthenticated, loading } = useAuth()
    const location = useLocation()

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0c16' }}>
                <div className="text-center space-y-4">
                    <span className="material-symbols-outlined text-primary text-5xl animate-spin">progress_activity</span>
                    <p className="text-slate-400 text-sm">Loading...</p>
                </div>
            </div>
        )
    }

    if (!isAuthenticated) {
        const redirectPath = location.pathname + location.search
        return <Navigate to={`/auth?redirect=${encodeURIComponent(redirectPath)}`} replace />
    }

    // Check role if allowedRoles is provided
    if (allowedRoles && !allowedRoles.includes(user?.role)) {
        return <Navigate to="/dashboard" replace />
    }

    // --- Onboarding Enforcement ---
    // If user has NO brands, they MUST go through onboarding before accessing any other tool.
    // Exclude certain paths to prevent infinite loops or allow basic account management.
    const hasBrand = (user?.brandCount ?? 0) > 0;
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

    if (!hasBrand && !isWhitelisted) {
        console.log('🔄 No brands found, redirecting to onboarding...');
        return <Navigate to="/onboarding" replace />;
    }

    return children
}

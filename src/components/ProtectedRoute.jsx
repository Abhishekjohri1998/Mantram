import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children }) {
    const { isAuthenticated, loading } = useAuth()
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

    return children
}

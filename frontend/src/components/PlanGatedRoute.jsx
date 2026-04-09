import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';

const PlanGatedRoute = ({ studioKey, children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    if (loading) return null;

    // Every authenticated user has access to all studios now
    const hasAccess = !!user;

    if (!hasAccess) {
        return (
            <DashboardLayout title="Access Restricted">
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in">
                    <div className="size-20 rounded-2xl bg-[var(--sys-primary-dim)] flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-primary">lock</span>
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--sys-text)] mb-3">Upgrade Required</h2>
                    <p className="text-[var(--sys-text-muted)] mb-8 max-w-md">
                        Access to this studio is not included in your current <strong>{user?.planDetails?.name || 'Starter'}</strong> plan. 
                        Upgrade your plan to unlock all professional features and resume your work.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button 
                            onClick={() => navigate('/credits')}
                            className="bg-primary text-white py-3 px-8 rounded-xl text-sm font-bold cursor-pointer hover:bg-primary-light transition-all shadow-none"
                        >
                            View Upgrade Plans
                        </button>
                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="bg-[var(--sys-surface)] border border-[var(--sys-border)] px-8 py-3 rounded-xl text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-all cursor-pointer"
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return children;
};

export default PlanGatedRoute;

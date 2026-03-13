import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from './DashboardLayout';

const PlanGatedRoute = ({ studioKey, children }) => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();

    if (loading) return null;

    // Superadmin has access to everything
    const hasAccess = user?.role === 'superadmin' || 
                    (user?.planDetails?.studios && user.planDetails.studios[studioKey] !== false);

    if (!hasAccess) {
        return (
            <DashboardLayout title="Access Restricted">
                <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-fade-in">
                    <div className="size-20 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-amber-500">lock</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-3">Upgrade Required</h2>
                    <p className="text-slate-400 mb-8 max-w-md">
                        Access to this studio is not included in your current <strong>{user?.planDetails?.name || 'Starter'}</strong> plan. 
                        Upgrade your plan to unlock all professional features and resume your work.
                    </p>
                    <div className="flex flex-wrap justify-center gap-4">
                        <button 
                            onClick={() => navigate('/credits')}
                            className="bg-primary text-white py-3 px-8 rounded-xl text-sm font-bold cursor-pointer hover:bg-primary-light transition-all shadow-lg shadow-primary/20"
                        >
                            View Upgrade Plans
                        </button>
                        <button 
                            onClick={() => navigate('/dashboard')}
                            className="bg-white/[0.04] border border-white/[0.08] px-8 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-all cursor-pointer"
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

import { useState, useEffect } from 'react'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { admin as adminAPI } from '../services/api'

export default function AdminDashboard() {
    const [stats, setStats] = useState(null)
    const [users, setUsers] = useState([])
    const [aiHealth, setAiHealth] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userPage, setUserPage] = useState(1)
    const [totalUsers, setTotalUsers] = useState(0)

    useEffect(() => {
        async function fetchAll() {
            try {
                const [statsData, usersData, healthData] = await Promise.all([
                    adminAPI.getStats().catch(() => null),
                    adminAPI.getUsers({ page: 1, limit: 10 }).catch(() => ({ users: [], total: 0 })),
                    adminAPI.getAIHealth().catch(() => null),
                ])
                if (statsData) setStats(statsData.stats)
                setUsers(usersData.users || [])
                setTotalUsers(usersData.total || 0)
                if (healthData) setAiHealth(healthData)
            } catch (err) {
                console.error('Admin fetch error:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchAll()
    }, [])

    const loadMore = async () => {
        const next = userPage + 1
        try {
            const data = await adminAPI.getUsers({ page: next, limit: 10 })
            setUsers(prev => [...prev, ...(data.users || [])])
            setUserPage(next)
        } catch (err) { console.error(err) }
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center py-20 text-slate-400">
                    <span className="material-symbols-outlined animate-spin mr-2 text-2xl">progress_activity</span>
                    Loading admin dashboard...
                </div>
            </DashboardLayout>
        )
    }

    return (
        <DashboardLayout>
            <SEOHead title="Admin Dashboard — Mantram AI" noIndex={true} />
            <div className="mb-6">
                <h2 className="text-3xl font-extrabold tracking-tight mb-1">Admin <span className="text-primary">Dashboard</span></h2>
                <p className="text-slate-400 text-sm">Platform-wide statistics and management.</p>
            </div>

            {/* Top Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total Users', value: stats?.totalUsers || totalUsers, icon: 'group', color: 'text-primary' },
                    { label: 'Total Brands', value: stats?.totalBrands || 0, icon: 'storefront', color: 'text-emerald-400' },
                    { label: 'Content Created', value: stats?.totalContent || 0, icon: 'article', color: 'text-[#FF4D00]' },
                    { label: 'Creatives Made', value: stats?.totalCreatives || 0, icon: 'image', color: 'text-amber-400' },
                ].map((s, i) => (
                    <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                        <span className={`material-symbols-outlined text-xl ${s.color} mb-2 block`}>{s.icon}</span>
                        <p className="text-2xl font-extrabold text-white">{s.value}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Users Table */}
                <div className="col-span-12 lg:col-span-8">
                    <div className="glass-panel rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">group</span> Users ({totalUsers})
                            </h3>
                        </div>

                        {users.length === 0 ? (
                            <p className="text-slate-500 text-sm text-center py-8">No users found.</p>
                        ) : (
                            <div className="space-y-2">
                                <div className="grid grid-cols-12 text-sm text-slate-500 uppercase tracking-widest font-bold px-4 py-2">
                                    <div className="col-span-4">User</div>
                                    <div className="col-span-2">Role</div>
                                    <div className="col-span-2">Plan</div>
                                    <div className="col-span-2">Content</div>
                                    <div className="col-span-2">Joined</div>
                                </div>
                                {users.map((u, i) => (
                                    <div key={u._id} className="grid grid-cols-12 items-center p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all animate-fade-in"
                                        style={{ animationDelay: `${i * 40}ms` }}>
                                        <div className="col-span-4 flex items-center gap-3">
                                            <div className="size-8 rounded-full bg-gradient-to-br from-primary to-[#FF7A00] flex items-center justify-center text-white text-xs font-bold">
                                                {u.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div>
                                                <p className="text-sm text-white font-medium">{u.name}</p>
                                                <p className="text-sm text-slate-500">{u.email}</p>
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-400/10 text-amber-400' :
                                                u.role === 'team-member' ? 'bg-primary/10 text-primary' :
                                                    'bg-white/[0.06] text-slate-400'
                                                }`}>{u.role}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-sm text-white capitalize">{u.plan}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-sm text-slate-400">{u.usage?.contentGenerated || 0}</span>
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-sm text-slate-500">{new Date(u.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                ))}
                                {users.length < totalUsers && (
                                    <button onClick={loadMore} className="w-full text-center py-3 text-sm text-primary hover:text-primary-light cursor-pointer font-bold">
                                        Load More Users
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* AI Health */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-emerald-400">health_and_safety</span> AI Health
                        </h3>
                        {aiHealth?.providers ? (
                            <div className="space-y-3">
                                {aiHealth.providers.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03]">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2.5 h-2.5 rounded-full ${p.status === 'healthy' ? 'bg-emerald-400' : p.status === 'degraded' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                                            <span className="text-sm text-white capitalize font-medium">{p.name}</span>
                                        </div>
                                        <span className="text-sm text-slate-400 capitalize">{p.status || (p.available ? 'healthy' : 'unavailable')}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">AI health data unavailable.</p>
                        )}

                        {aiHealth?.usage && (
                            <div className="mt-4 p-3 rounded-xl bg-white/[0.03]">
                                <p className="text-sm text-slate-500">Total API Calls</p>
                                <p className="text-lg font-extrabold text-white">{aiHealth.usage.total || 0}</p>
                            </div>
                        )}
                    </div>

                    {/* Plan Distribution */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-amber-400">diamond</span> Plans
                        </h3>
                        <div className="space-y-3">
                            {[
                                { plan: 'Starter', count: stats?.planDistribution?.starter || users.filter(u => u.plan === 'starter').length, color: 'bg-slate-400' },
                                { plan: 'Professional', count: stats?.planDistribution?.professional || users.filter(u => u.plan === 'professional').length, color: 'bg-primary' },
                                { plan: 'Enterprise', count: stats?.planDistribution?.enterprise || users.filter(u => u.plan === 'enterprise').length, color: 'bg-amber-400' },
                            ].map((p, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                                        <span className="text-sm text-slate-300">{p.plan}</span>
                                    </div>
                                    <span className="text-sm text-white font-bold">{p.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Feedback Stats */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">psychology</span> RLHF Stats
                        </h3>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-400">Total Feedback</span>
                                <span className="text-sm text-white font-bold">{stats?.totalFeedback || 0}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-400">Avg Sentiment</span>
                                <span className={`text-sm font-bold ${(stats?.avgSentiment || 0) > 0.3 ? 'text-emerald-400' :
                                    (stats?.avgSentiment || 0) > 0 ? 'text-amber-400' : 'text-slate-400'
                                    }`}>{stats?.avgSentiment ? `${(stats.avgSentiment * 100).toFixed(0)}%` : '—'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}

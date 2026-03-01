import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { admin as adminAPI } from '../services/api'

export default function TeamDashboard() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { brands } = useBrand()
    const [teamMembers, setTeamMembers] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        // Fetch team members (admin endpoint)
        adminAPI.getUsers({ limit: 50 })
            .then(data => {
                // Filter for team members belonging to the same organization
                const members = (data.users || []).filter(u =>
                    u.organization === user?.id || u._id === user?.id || u.role === 'team-member'
                )
                setTeamMembers(members.length > 0 ? members : data.users?.slice(0, 5) || [])
            })
            .catch(() => setTeamMembers([]))
            .finally(() => setLoading(false))
    }, [user])

    const roleColors = {
        admin: { bg: 'bg-amber-400/10', text: 'text-amber-400' },
        user: { bg: 'bg-primary/10', text: 'text-primary' },
        'team-member': { bg: 'bg-emerald-400/10', text: 'text-emerald-400' },
    }

    return (
        <DashboardLayout>
            <div className="flex items-end justify-between mb-6">
                <div>
                    <h2 className="text-3xl font-extrabold tracking-tight mb-1">Team <span className="text-primary">Dashboard</span></h2>
                    <p className="text-slate-400 text-sm">Manage your team and shared brand projects.</p>
                </div>
                <button className="btn-primary py-2 px-4 rounded-xl text-sm cursor-pointer">
                    <span className="material-symbols-outlined text-sm">person_add</span> Invite Member
                </button>
            </div>

            {/* Team Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Team Members', value: teamMembers.length, icon: 'group', color: 'text-primary' },
                    { label: 'Shared Brands', value: brands.length, icon: 'storefront', color: 'text-emerald-400' },
                    {
                        label: 'Active This Week', value: teamMembers.filter(m => {
                            const lastActive = new Date(m.lastActive || m.updatedAt)
                            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                            return lastActive > weekAgo
                        }).length, icon: 'trending_up', color: 'text-purple-400'
                    },
                    { label: 'Total Content', value: teamMembers.reduce((s, m) => s + (m.usage?.contentGenerated || 0), 0), icon: 'article', color: 'text-amber-400' },
                ].map((s, i) => (
                    <div key={i} className="glass-panel rounded-2xl p-5 animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                        <span className={`material-symbols-outlined text-xl ${s.color} mb-2 block`}>{s.icon}</span>
                        <p className="text-2xl font-extrabold text-white">{s.value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-12 gap-6">
                {/* Team Members */}
                <div className="col-span-12 lg:col-span-8">
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-5">
                            <span className="material-symbols-outlined text-primary">group</span> Team Members
                        </h3>

                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-slate-400">
                                <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span> Loading team...
                            </div>
                        ) : teamMembers.length === 0 ? (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-4xl text-slate-600 mb-3 block">group_add</span>
                                <p className="text-slate-400 mb-4">No team members yet. Invite your first team member!</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {teamMembers.map((m, i) => {
                                    const rc = roleColors[m.role] || roleColors.user
                                    return (
                                        <div key={m._id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all animate-fade-in"
                                            style={{ animationDelay: `${i * 60}ms` }}>
                                            <div className="size-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                                                {m.name?.charAt(0)?.toUpperCase() || '?'}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-white font-bold">{m.name}</p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${rc.bg} ${rc.text}`}>{m.role}</span>
                                                    {m._id === user?.id && <span className="text-[10px] text-slate-500">(You)</span>}
                                                </div>
                                                <p className="text-xs text-slate-500">{m.email}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs text-slate-400">{m.usage?.contentGenerated || 0} content</p>
                                                <p className="text-[10px] text-slate-600">
                                                    Last active: {m.lastActive ? new Date(m.lastActive).toLocaleDateString() : '—'}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Panel */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* Shared Brands */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">storefront</span> Shared Brands
                        </h3>
                        {brands.length === 0 ? (
                            <p className="text-slate-500 text-sm py-4">No brands yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {brands.map((b, i) => (
                                    <div key={b._id} onClick={() => navigate('/nexus')}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all cursor-pointer">
                                        <div className="size-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                            style={{ background: b.dna?.colors?.[0]?.hex || '#2B4BEE' }}>
                                            {b.name?.charAt(0)?.toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm text-white font-medium">{b.name}</p>
                                            <p className="text-[10px] text-slate-500">{b.dna?.voice?.personality || 'No voice set'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Activity Feed */}
                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-primary">notifications</span> Activity
                        </h3>
                        <div className="space-y-3">
                            {teamMembers.slice(0, 4).map((m, i) => (
                                <div key={i} className="flex items-start gap-3">
                                    <div className="size-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0 mt-0.5">
                                        {m.name?.charAt(0)}
                                    </div>
                                    <div>
                                        <p className="text-xs text-white"><span className="font-bold">{m.name}</span> generated {m.usage?.contentGenerated || 0} pieces of content</p>
                                        <p className="text-[10px] text-slate-600">{m.lastActive ? new Date(m.lastActive).toLocaleString() : 'Recently'}</p>
                                    </div>
                                </div>
                            ))}
                            {teamMembers.length === 0 && <p className="text-xs text-slate-500">No recent activity.</p>}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    )
}

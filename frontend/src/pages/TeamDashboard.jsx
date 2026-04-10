import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import SEOHead from '../components/SEOHead'
import { useAuth } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'
import { team as teamAPI } from '../services/api'

const STUDIO_LABELS = {
    contentStudio: { label: 'Content Studio', icon: 'edit_note', color: '#34d399' },
    creativeStudio: { label: 'Creative Studio', icon: 'auto_fix_high', color: '#ec4899' },
    seoStudio: { label: 'SEO Studio', icon: 'travel_explore', color: '#f59e0b' },
    brainstormStudio: { label: 'Brainstorm', icon: 'psychology', color: '#8b5cf6' },
    videoStudio: { label: 'Video Studio', icon: 'movie', color: '#06b6d4' },
    socialMediaStudio: { label: 'Social Media', icon: 'share', color: '#a855f7' },
    conversationStudio: { label: 'Conversations', icon: 'forum', color: '#3b82f6' },
    adStudio: { label: 'Performance Studio', icon: 'monitoring', color: '#f43f5e' },
    funnelStudio: { label: 'Funnel Studio', icon: 'filter_alt', color: '#f97316' },
    d2cAnalytics: { label: 'D2C Studio', icon: 'storefront', color: '#14b8a6' },
    skillsHub: { label: 'Skills Hub', icon: 'auto_awesome', color: '#eab308' },
}

const TABS = [
    { id: 'members', label: 'Members', icon: 'group' },
    { id: 'chat', label: 'Chat', icon: 'forum' },
    { id: 'approvals', label: 'Approvals', icon: 'task_alt' },
    { id: 'insights', label: 'AI Insights', icon: 'auto_awesome' },
]

export default function TeamDashboard() {
    const navigate = useNavigate()
    const { user } = useAuth()
    const { brands } = useBrand()
    const [activeTab, setActiveTab] = useState('members')

    // Members
    const [members, setMembers] = useState([])
    const [invites, setInvites] = useState([])
    const [isAdmin, setIsAdmin] = useState(false)
    const [isOrgOwner, setIsOrgOwner] = useState(false)
    const [planLimits, setPlanLimits] = useState(null)
    const [loading, setLoading] = useState(true)

    // Invite modal
    const [showInvite, setShowInvite] = useState(false)
    const [inviteForm, setInviteForm] = useState({ email: '', name: '', role: 'member', studioAccess: {}, brandAccess: [], message: '' })
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteResult, setInviteResult] = useState(null)

    // Access edit modal
    const [editingMember, setEditingMember] = useState(null)
    const [editAccess, setEditAccess] = useState({})

    // Chat
    const [channels, setChannels] = useState([])
    const [activeChannel, setActiveChannel] = useState('general')
    const [messages, setMessages] = useState([])
    const [chatInput, setChatInput] = useState('')
    const [chatLoading, setChatLoading] = useState(false)
    const chatEndRef = useRef(null)

    // Approvals
    const [approvals, setApprovals] = useState([])
    const [approvalStats, setApprovalStats] = useState({})
    const [approvalFilter, setApprovalFilter] = useState('')

    // AI Insights
    const [healthData, setHealthData] = useState(null)
    const [healthLoading, setHealthLoading] = useState(false)

    // ── Load members ──
    const loadMembers = useCallback(async () => {
        try {
            setLoading(true)
            const [membersData, limits] = await Promise.all([
                teamAPI.getMembers(),
                teamAPI.getPlanLimits(),
            ])
            setMembers(membersData.members || [])
            setInvites(membersData.invites || [])
            setIsAdmin(membersData.isAdmin)
            setIsOrgOwner(!user.organization || user.teamRole === 'owner')
            setPlanLimits(limits)
        } catch { /* silent */ }
        finally { setLoading(false) }
    }, [user])

    useEffect(() => { loadMembers() }, [loadMembers])

    // ── Invite ──
    const handleInvite = async () => {
        if (!inviteForm.email) return
        setInviteLoading(true)
        setInviteResult(null)
        try {
            const res = await teamAPI.invite(inviteForm)
            setInviteResult(res)
            loadMembers()
            setInviteForm({ email: '', name: '', role: 'member', studioAccess: {}, brandAccess: [], message: '' })
        } catch (err) {
            setInviteResult({ error: err.message })
        }
        setInviteLoading(false)
    }

    // ── Update access ──
    const handleSaveAccess = async () => {
        if (!editingMember) return
        try {
            await teamAPI.updateAccess(editingMember._id, editAccess)
            setEditingMember(null)
            loadMembers()
        } catch { /* silent */ }
    }

    // ── Remove member ──
    const handleRemove = async (id) => {
        if (!confirm('Remove this team member?')) return
        try {
            await teamAPI.removeMember(id)
            loadMembers()
        } catch { /* silent */ }
    }

    // ── Chat ──
    const loadChannels = useCallback(async () => {
        try {
            const data = await teamAPI.getChannels()
            setChannels(data.channels || [])
        } catch { /* */ }
    }, [])

    const loadMessages = useCallback(async (ch) => {
        setChatLoading(true)
        try {
            const data = await teamAPI.getMessages(ch || activeChannel)
            setMessages(data.messages || [])
        } catch { /* */ }
        setChatLoading(false)
    }, [activeChannel])

    useEffect(() => {
        if (activeTab === 'chat') { loadChannels(); loadMessages() }
    }, [activeTab, loadChannels, loadMessages])

    useEffect(() => { if (activeTab === 'chat') loadMessages(activeChannel) }, [activeChannel])

    useEffect(() => {
        if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const sendMessage = async () => {
        if (!chatInput.trim()) return
        try {
            await teamAPI.sendMessage(activeChannel, { content: chatInput })
            setChatInput('')
            loadMessages()
        } catch { /* */ }
    }

    // ── Approvals ──
    const loadApprovals = useCallback(async () => {
        try {
            const data = await teamAPI.getApprovals(approvalFilter ? `status=${approvalFilter}` : '')
            setApprovals(data.approvals || [])
            setApprovalStats(data.stats || {})
        } catch { /* */ }
    }, [approvalFilter])

    useEffect(() => { if (activeTab === 'approvals') loadApprovals() }, [activeTab, loadApprovals])

    const handleApprovalAction = async (id, action, message = '') => {
        try {
            await teamAPI.updateApproval(id, { action, message })
            loadApprovals()
        } catch { /* */ }
    }

    // ── AI Insights ──
    const loadHealth = async () => {
        setHealthLoading(true)
        try {
            const data = await teamAPI.teamHealth()
            setHealthData(data)
        } catch { /* */ }
        setHealthLoading(false)
    }

    useEffect(() => { if (activeTab === 'insights') loadHealth() }, [activeTab])

    const roleColors = {
        owner: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', label: 'Owner' },
        manager: { bg: 'bg-[#FF4D00]/10', text: 'text-[#FF4D00]', label: 'Manager' },
        member: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', label: 'Member' },
    }

    const statusColors = {
        pending: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', icon: 'schedule' },
        approved: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', icon: 'check_circle' },
        rejected: { bg: 'bg-[var(--sys-primary-dim)]', text: 'text-primary', icon: 'cancel' },
        'revision-requested': { bg: 'bg-[#FF4D00]/10', text: 'text-[#FF4D00]', icon: 'edit_note' },
    }

    return (
        <DashboardLayout title="Team Dashboard" subtitle="Team activity & collaboration hub">
            <SEOHead title="Team Dashboard — Mantram AI" noIndex={true} />
            <div className="flex items-end justify-between mb-6">
                <div>
                    <p className="text-[var(--sys-text-muted)] text-sm">
                         Manage your team, chat, and approvals.
                    </p>
                </div>
                {isOrgOwner && (
                    <button onClick={() => setShowInvite(true)} className="btn-primary py-2.5 px-5 rounded-xl text-sm cursor-pointer flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">person_add</span>Invite Member
                    </button>
                )}
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] mb-6 w-fit">
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === t.id ? 'bg-primary text-white shadow-none' : 'text-[var(--sys-text-muted)] hover:text-white hover:bg-[var(--sys-surface)]'}`}>
                        <span className="material-symbols-outlined text-sm">{t.icon}</span>{t.label}
                        {t.id === 'approvals' && approvalStats.pending > 0 && (
                            <span className="size-5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text)] text-[10px] font-bold flex items-center justify-center">{approvalStats.pending}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════ */}
            {/* MEMBERS TAB                                        */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'members' && (
                <div className="grid grid-cols-12 gap-6">
                    <div className="col-span-12 lg:col-span-8">
                        <div className="glass-panel rounded-2xl p-6">
                            <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-5">
                                <span className="material-symbols-outlined text-primary">group</span>Team Members
                            </h3>
                            {loading ? (
                                <div className="flex items-center justify-center py-12 text-[var(--sys-text-muted)]">
                                    <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...
                                </div>
                            ) : members.length === 0 ? (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">group_add</span>
                                    <p className="text-[var(--sys-text-muted)] mb-4">No team members yet. Invite your first member!</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {members.map((m, i) => {
                                        const rc = roleColors[m.teamRole] || roleColors.member
                                        const isOwner = !m.organization || m.teamRole === 'owner'
                                        return (
                                            <div key={m._id} className="flex items-center gap-4 p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-all animate-fade-in"
                                                style={{ animationDelay: `${i * 60}ms` }}>
                                                <div className="size-10 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-sm font-bold shrink-0">
                                                    {m.name?.charAt(0)?.toUpperCase() || '?'}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-sm text-[var(--sys-text)] font-bold truncate">{m.name}</p>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rc.bg} ${rc.text}`}>{rc.label}</span>
                                                        {m._id === user?.id && <span className="text-xs text-[var(--sys-text-muted)]">(You)</span>}
                                                    </div>
                                                    <p className="text-xs text-[var(--sys-text-muted)]">{m.email}</p>
                                                    <div className="flex gap-1 mt-1 flex-wrap">
                                                        {Object.entries(m.studioAccess || {}).filter(([, v]) => v).slice(0, 5).map(([k]) => (
                                                            <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{STUDIO_LABELS[k]?.label || k}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-sm text-[var(--sys-text-muted)]">{m.usage?.contentGenerated || 0} content</p>
                                                    <p className="text-xs text-[var(--sys-text-muted)]">{m.lastActive ? new Date(m.lastActive).toLocaleDateString() : '—'}</p>
                                                </div>
                                                {isOrgOwner && !isOwner && (
                                                    <div className="flex gap-1 shrink-0">
                                                        <button onClick={() => { setEditingMember(m); setEditAccess({ studioAccess: m.studioAccess || {}, brandAccess: m.brandAccess || [], teamRole: m.teamRole }) }}
                                                            className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-primary/10 cursor-pointer transition-all" title="Edit Access">
                                                            <span className="material-symbols-outlined text-sm">tune</span>
                                                        </button>
                                                        <button onClick={() => handleRemove(m._id)}
                                                            className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-primary hover:bg-[var(--sys-primary-dim)] cursor-pointer transition-all" title="Remove">
                                                            <span className="material-symbols-outlined text-sm">person_remove</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Pending invites */}
                            {invites.length > 0 && (
                                <div className="mt-6 pt-5 border-t border-[var(--sys-border)]">
                                    <p className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-3">Pending Invites</p>
                                    {invites.map(inv => (
                                        <div key={inv._id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)]/[0.03] border border-[var(--sys-border)] mb-2">
                                            <span className="material-symbols-outlined text-primary">mail</span>
                                            <div className="flex-1">
                                                <p className="text-sm text-[var(--sys-text)]">{inv.email}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">Invited by {inv.invitedBy?.name} · Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                                            </div>
                                            {isAdmin && (
                                                <button onClick={async () => { await teamAPI.revokeInvite(inv._id); loadMembers() }}
                                                    className="text-xs text-primary hover:text-[var(--sys-primary)] cursor-pointer">Revoke</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right sidebar — quick stats */}
                    <div className="col-span-12 lg:col-span-4 space-y-6">
                        <div className="glass-panel rounded-2xl p-6">
                            <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary">diamond</span>Plan
                            </h3>
                            <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] border border-primary/20 mb-3">
                                <p className="text-lg font-extrabold text-[var(--sys-text)] capitalize">Mantram Unlimited</p>
                                <p className="text-sm text-[var(--sys-text-muted)]">Unlimited team members & brands</p>
                            </div>
                        </div>

                        <div className="glass-panel rounded-2xl p-6">
                            <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-primary">storefront</span>Brands
                            </h3>
                            {brands.length === 0 ? (
                                <p className="text-[var(--sys-text-muted)] text-sm">No brands yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {brands.map(b => (
                                        <div key={b._id} onClick={() => navigate('/brand-dna')}
                                            className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:bg-[var(--sys-surface)] transition-all cursor-pointer">
                                            <div className="size-8 rounded-lg flex items-center justify-center text-[var(--sys-text)] text-xs font-bold"
                                                style={{ background: b.dna?.colors?.[0]?.hex || '#2B4BEE' }}>
                                                {b.name?.charAt(0)?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-[var(--sys-text)] font-medium truncate">{b.name}</p>
                                                <p className="text-xs text-[var(--sys-text-muted)]">{b.sharedWith?.length || 0} members</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* CHAT TAB                                           */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'chat' && (
                <div className="grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 240px)' }}>
                    {/* Channel sidebar */}
                    <div className="col-span-12 md:col-span-3 glass-panel rounded-2xl p-4 overflow-y-auto">
                        <p className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-3">Channels</p>
                        <div className="space-y-1">
                            {channels.map(ch => (
                                <button key={ch.id} onClick={() => setActiveChannel(ch.id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-sm cursor-pointer transition-all ${activeChannel === ch.id ? 'bg-primary/10 text-primary border border-primary/20' : 'text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-white'}`}>
                                    <span className="material-symbols-outlined text-sm" style={{ color: ch.color }}>{ch.icon}</span>
                                    <span className="truncate flex-1">{ch.name}</span>
                                    {ch.unreadCount > 0 && <span className="size-5 rounded-full bg-[var(--sys-surface)] text-[var(--sys-text)] text-[9px] font-bold flex items-center justify-center">{ch.unreadCount}</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Message area */}
                    <div className="col-span-12 md:col-span-9 glass-panel rounded-2xl flex flex-col">
                        <div className="p-4 border-b border-[var(--sys-border)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">forum</span>
                            <span className="text-sm font-bold text-[var(--sys-text)]">{channels.find(c => c.id === activeChannel)?.name || 'General'}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {chatLoading ? (
                                <div className="flex items-center justify-center py-12 text-[var(--sys-text-muted)]">
                                    <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>Loading...
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-2 block">chat</span>
                                    <p className="text-[var(--sys-text-muted)] text-sm">No messages yet. Start the conversation!</p>
                                </div>
                            ) : messages.map(m => (
                                <div key={m._id} className={`flex gap-3 ${String(m.sender?._id) === String(user?.id) ? 'flex-row-reverse' : ''}`}>
                                    <div className="size-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-bold shrink-0">
                                        {m.sender?.name?.charAt(0) || '?'}
                                    </div>
                                    <div className={`max-w-[70%] p-3 rounded-2xl ${String(m.sender?._id) === String(user?.id) ? 'bg-primary/15 border border-primary/20' : 'bg-[var(--sys-surface)] border border-[var(--sys-border)]'}`}>
                                        <p className="text-[10px] text-[var(--sys-text-muted)] mb-1">{m.sender?.name} · {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        <p className="text-sm text-[var(--sys-text)] whitespace-pre-wrap">{m.content}</p>
                                        {m.attachments?.length > 0 && (
                                            <div className="mt-2 flex gap-2 flex-wrap">
                                                {m.attachments.map((a, i) => (
                                                    <div key={i} className="px-2 py-1 rounded-lg bg-[var(--sys-surface)] text-xs text-[var(--sys-text-muted)] flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">{a.type === 'creative' ? 'image' : 'article'}</span>{a.name || a.type}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {m.reactions?.length > 0 && (
                                            <div className="flex gap-1 mt-1.5">
                                                {m.reactions.map((r, i) => <span key={i} className="text-xs cursor-default">{r.emoji}</span>)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="p-3 border-t border-[var(--sys-border)] flex gap-2">
                            <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                                placeholder="Type a message..."
                                className="flex-1 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                            <button onClick={sendMessage}
                                className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 cursor-pointer transition-all flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">send</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* APPROVALS TAB                                      */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'approvals' && (
                <div className="space-y-6">
                    {/* Stats bar */}
                    <div className="grid grid-cols-3 gap-4">
                        {[
                            { label: 'Pending', value: approvalStats.pending || 0, color: '#f59e0b', filter: 'pending' },
                            { label: 'Approved', value: approvalStats.approved || 0, color: '#34d399', filter: 'approved' },
                            { label: 'Rejected', value: approvalStats.rejected || 0, color: '#f43f5e', filter: 'rejected' },
                        ].map((s, i) => (
                            <button key={i} onClick={() => setApprovalFilter(approvalFilter === s.filter ? '' : s.filter)}
                                className={`glass-panel rounded-2xl p-5 cursor-pointer transition-all ${approvalFilter === s.filter ? 'border' : 'border border-[var(--sys-border)]'}`}
                                style={approvalFilter === s.filter ? { borderColor: s.color } : {}}>
                                <p className="text-2xl font-extrabold text-[var(--sys-text)]">{s.value}</p>
                                <p className="text-sm text-[var(--sys-text-muted)]">{s.label}</p>
                            </button>
                        ))}
                    </div>

                    <div className="glass-panel rounded-2xl p-6">
                        <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-5">
                            <span className="material-symbols-outlined text-primary">task_alt</span>Approval Queue
                        </h3>
                        {approvals.length === 0 ? (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-2 block">fact_check</span>
                                <p className="text-[var(--sys-text-muted)] text-sm">No approvals {approvalFilter ? `with status "${approvalFilter}"` : 'yet'}.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {approvals.map(a => {
                                    const sc = statusColors[a.status] || statusColors.pending
                                    return (
                                        <div key={a._id} className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className={`material-symbols-outlined ${sc.text}`}>{sc.icon}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm text-[var(--sys-text)] font-bold truncate">{a.itemTitle}</p>
                                                    <p className="text-xs text-[var(--sys-text-muted)]">
                                                        {a.itemType} · by {a.requestedBy?.name} → {a.approver?.name} · {new Date(a.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sc.bg} ${sc.text} uppercase`}>{a.status}</span>
                                                {a.priority !== 'normal' && (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.priority === 'urgent' ? 'bg-[var(--sys-primary-dim)] text-primary' : a.priority === 'high' ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'}`}>{a.priority}</span>
                                                )}
                                            </div>
                                            {/* AI Review badge */}
                                            {a.aiReview?.brandVoiceScore != null && (
                                                <div className="flex items-center gap-2 mb-2 p-2 rounded-lg bg-primary/[0.03] border border-primary/10">
                                                    <span className="material-symbols-outlined text-sm text-primary">auto_awesome</span>
                                                    <span className="text-xs text-[var(--sys-text-muted)]">AI Brand Voice Score: </span>
                                                    <span className={`text-xs font-bold ${a.aiReview.brandVoiceScore >= 70 ? 'text-primary' : a.aiReview.brandVoiceScore >= 40 ? 'text-primary' : 'text-primary'}`}>{a.aiReview.brandVoiceScore}%</span>
                                                </div>
                                            )}
                                            {/* Feedback */}
                                            {a.feedback?.length > 0 && (
                                                <div className="space-y-1 mb-3">
                                                    {a.feedback.slice(-3).map((f, i) => (
                                                        <div key={i} className="flex items-start gap-2 text-xs">
                                                            <span className="material-symbols-outlined text-xs text-[var(--sys-text-muted)]" style={{ marginTop: 2 }}>
                                                                {f.action === 'approve' ? 'check' : f.action === 'reject' ? 'close' : 'chat'}
                                                            </span>
                                                            <span className="text-[var(--sys-text-muted)]"><strong>{f.user?.name || 'System'}</strong>: {f.message}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {/* Actions */}
                                            {a.status === 'pending' && String(a.approver?._id) === String(user?.id) && (
                                                <div className="flex gap-2 mt-2">
                                                    <button onClick={() => handleApprovalAction(a._id, 'approve', 'Approved <span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span>')}
                                                        className="flex-1 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer border border-[var(--sys-border)] transition-all"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">check_circle</span> Approve</button>
                                                    <button onClick={() => { const msg = prompt('Revision notes:'); if (msg) handleApprovalAction(a._id, 'revision', msg) }}
                                                        className="flex-1 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer border border-[var(--sys-border)] transition-all"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">edit</span> Request Revision</button>
                                                    <button onClick={() => handleApprovalAction(a._id, 'reject', 'Rejected')}
                                                        className="flex-1 py-2 rounded-xl bg-[var(--sys-primary-dim)] text-primary text-xs font-bold hover:bg-[var(--sys-primary-dim)] cursor-pointer border border-[var(--sys-border)] transition-all"><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">cancel</span> Reject</button>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* AI INSIGHTS TAB                                    */}
            {/* ══════════════════════════════════════════════════ */}
            {activeTab === 'insights' && (
                <div className="space-y-6">
                    {healthLoading ? (
                        <div className="glass-panel rounded-2xl p-12 flex items-center justify-center">
                            <span className="material-symbols-outlined animate-spin mr-3 text-primary text-2xl">progress_activity</span>
                            <span className="text-[var(--sys-text-muted)]">Analyzing team performance...</span>
                        </div>
                    ) : healthData ? (
                        <>
                            {/* KPI Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Team Size', value: healthData.teamSize, icon: 'group', color: '#8b5cf6' },
                                    { label: 'Active This Week', value: healthData.activeThisWeek, icon: 'trending_up', color: '#34d399' },
                                    { label: 'Total Content', value: healthData.totalContent, icon: 'article', color: '#06b6d4' },
                                    { label: 'Chat Messages', value: healthData.chatMessages, icon: 'forum', color: '#f59e0b' },
                                ].map((s, i) => (
                                    <div key={i} className="glass-panel rounded-2xl p-5">
                                        <span className={`material-symbols-outlined text-xl mb-2 block`} style={{ color: s.color }}>{s.icon}</span>
                                        <p className="text-2xl font-extrabold text-[var(--sys-text)]">{s.value}</p>
                                        <p className="text-sm text-[var(--sys-text-muted)]">{s.label}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Insights */}
                            {healthData.insights?.length > 0 && (
                                <div className="glass-panel rounded-2xl p-6">
                                    <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                        <span className="material-symbols-outlined text-primary">auto_awesome</span>AI Insights
                                    </h3>
                                    <div className="space-y-3">
                                        {healthData.insights.map((ins, i) => (
                                            <div key={i} className={`flex items-start gap-3 p-3 rounded-xl border ${ins.type === 'urgent' ? 'bg-[var(--sys-surface)]/[0.03] border-[var(--sys-border)]' : ins.type === 'warning' ? 'bg-[var(--sys-surface)]/[0.03] border-[var(--sys-border)]' : ins.type === 'success' ? 'bg-[var(--sys-surface)]/[0.03] border-[var(--sys-border)]' : 'bg-primary/[0.03] border-primary/10'}`}>
                                                <span className={`material-symbols-outlined text-lg ${ins.type === 'urgent' ? 'text-primary' : ins.type === 'warning' ? 'text-primary' : ins.type === 'success' ? 'text-primary' : 'text-primary'}`}>{ins.icon}</span>
                                                <p className="text-sm text-[var(--sys-text)] flex-1">{ins.message}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Member breakdown */}
                            <div className="glass-panel rounded-2xl p-6">
                                <h3 className="font-bold text-[var(--sys-text)] flex items-center gap-2 mb-4">
                                    <span className="material-symbols-outlined text-[#FF4D00]">leaderboard</span>Member Performance
                                </h3>
                                <div className="space-y-2">
                                    {healthData.members?.sort((a, b) => (b.contentGenerated + b.creativesGenerated) - (a.contentGenerated + a.creativesGenerated)).map((m, i) => (
                                        <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)]">
                                            <span className="text-sm font-bold text-[var(--sys-text-muted)] w-6">#{i + 1}</span>
                                            <div className="size-8 rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center text-[var(--sys-text)] text-xs font-bold shrink-0">
                                                {m.name?.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-[var(--sys-text)] font-medium truncate">{m.name}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)]">{m.role} · {m.studios?.length || 0} studios</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-[var(--sys-text)]">{m.contentGenerated + m.creativesGenerated}</p>
                                                <p className="text-[10px] text-[var(--sys-text-muted)]">outputs</p>
                                            </div>
                                            <div className="w-24 h-1.5 rounded-full bg-[var(--sys-surface)] overflow-hidden">
                                                <div className="h-full rounded-full bg-[var(--sys-surface)] border border-[var(--sys-border)] transition-all"
                                                    style={{ width: `${Math.min(100, ((m.contentGenerated + m.creativesGenerated) / Math.max(1, healthData.totalContent + healthData.totalCreatives)) * 100 * healthData.teamSize)}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="glass-panel rounded-2xl p-12 text-center">
                            <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] mb-3 block">auto_awesome</span>
                            <p className="text-[var(--sys-text-muted)] mb-4">Team intelligence will appear here.</p>
                            <button onClick={loadHealth} className="btn-primary py-2.5 px-6 rounded-xl text-sm cursor-pointer">Analyze Team</button>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* INVITE MODAL                                       */}
            {/* ══════════════════════════════════════════════════ */}
            {showInvite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--sys-surface)] " onClick={() => setShowInvite(false)}>
                    <div className="glass-panel rounded-2xl p-6 w-full max-w-lg mx-4 border border-[var(--sys-border)]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-[var(--sys-text)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">person_add</span>Invite Team Member
                            </h3>
                            <button onClick={() => setShowInvite(false)} className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-1 block">Email *</label>
                                <input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                                    placeholder="teammate@company.com"
                                    className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-1 block">Name</label>
                                <input value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="John Doe"
                                    className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] placeholder-slate-500 outline-none focus:border-primary/40" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-1 block">Role</label>
                                <select value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}
                                    className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] outline-none focus:border-primary/40">
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>

                            {/* Studio access toggles */}
                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2 block">Studio Access</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(STUDIO_LABELS).map(([key, s]) => (
                                        <label key={key} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] cursor-pointer hover:bg-[var(--sys-surface)] transition-all">
                                            <input type="checkbox"
                                                checked={inviteForm.studioAccess[key] !== false}
                                                onChange={e => setInviteForm(f => ({ ...f, studioAccess: { ...f.studioAccess, [key]: e.target.checked } }))}
                                                className="accent-primary" />
                                            <span className="material-symbols-outlined text-sm" style={{ color: s.color }}>{s.icon}</span>
                                            <span className="text-xs text-[var(--sys-text)]">{s.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Brand access */}
                            {brands.length > 0 && (
                                <div>
                                    <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2 block">Brand Access</label>
                                    <div className="space-y-1">
                                        {brands.map(b => (
                                            <label key={b._id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--sys-surface)] cursor-pointer hover:bg-[var(--sys-surface)]">
                                                <input type="checkbox"
                                                    checked={inviteForm.brandAccess.includes(b._id)}
                                                    onChange={e => setInviteForm(f => ({
                                                        ...f,
                                                        brandAccess: e.target.checked ? [...f.brandAccess, b._id] : f.brandAccess.filter(id => id !== b._id)
                                                    }))}
                                                    className="accent-primary" />
                                                <span className="text-xs text-[var(--sys-text)]">{b.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {inviteResult && (
                                <div className={`p-3 rounded-xl text-sm ${inviteResult.error ? 'bg-[var(--sys-primary-dim)] text-primary' : 'bg-[var(--sys-primary-dim)] text-primary'}`}>
                                    {inviteResult.error || ` Invite sent to ${inviteResult.sentTo}! They'll receive an email with a link to join your team.`}
                                </div>
                            )}

                            <button onClick={handleInvite} disabled={inviteLoading || !inviteForm.email}
                                className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                                {inviteLoading ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">send</span>}
                                {inviteLoading ? 'Sending...' : 'Send Invite'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* EDIT ACCESS MODAL                                  */}
            {/* ══════════════════════════════════════════════════ */}
            {editingMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--sys-surface)] " onClick={() => setEditingMember(null)}>
                    <div className="glass-panel rounded-2xl p-6 w-full max-w-lg mx-4 border border-[var(--sys-border)]" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-lg font-bold text-[var(--sys-text)]">Edit Access — {editingMember.name}</h3>
                            <button onClick={() => setEditingMember(null)} className="size-8 rounded-lg bg-[var(--sys-surface)] flex items-center justify-center text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-1 block">Team Role</label>
                                <select value={editAccess.teamRole} onChange={e => setEditAccess(a => ({ ...a, teamRole: e.target.value }))}
                                    className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--sys-text)] outline-none">
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2 block">Studio Access</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(STUDIO_LABELS).map(([key, s]) => (
                                        <label key={key} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--sys-surface)] border border-[var(--sys-border)] cursor-pointer hover:bg-[var(--sys-surface)]">
                                            <input type="checkbox"
                                                checked={editAccess.studioAccess?.[key] !== false}
                                                onChange={e => setEditAccess(a => ({ ...a, studioAccess: { ...a.studioAccess, [key]: e.target.checked } }))}
                                                className="accent-primary" />
                                            <span className="material-symbols-outlined text-sm" style={{ color: s.color }}>{s.icon}</span>
                                            <span className="text-xs text-[var(--sys-text)]">{s.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {brands.length > 0 && (
                                <div>
                                    <label className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-2 block">Brand Access</label>
                                    <div className="space-y-1">
                                        {brands.map(b => (
                                            <label key={b._id} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--sys-surface)] cursor-pointer hover:bg-[var(--sys-surface)]">
                                                <input type="checkbox"
                                                    checked={(editAccess.brandAccess || []).includes(b._id)}
                                                    onChange={e => setEditAccess(a => ({
                                                        ...a,
                                                        brandAccess: e.target.checked ? [...(a.brandAccess || []), b._id] : (a.brandAccess || []).filter(id => id !== b._id)
                                                    }))}
                                                    className="accent-primary" />
                                                <span className="text-xs text-[var(--sys-text)]">{b.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button onClick={handleSaveAccess}
                                className="w-full py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 cursor-pointer transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined text-sm">save</span>Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    )
}

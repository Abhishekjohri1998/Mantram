import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI, social } from '../services/api'
import PublishModal from '../components/PublishModal'

// ═══════════════════════════════════════════════════════════════
// PUBLISH & SCHEDULE — Premium social post management
// ═══════════════════════════════════════════════════════════════

const PLATFORM_META = {
    instagram: { label: 'Instagram', icon: '📸', color: '#E1306C', gradient: 'from-pink-500 to-purple-600', ring: 'ring-pink-500/30' },
    facebook: { label: 'Facebook', icon: '👥', color: '#1877F2', gradient: 'from-blue-500 to-indigo-600', ring: 'ring-blue-500/30' },
    twitter: { label: 'Twitter / X', icon: '𝕏', color: '#1DA1F2', gradient: 'from-slate-400 to-slate-600', ring: 'ring-slate-400/30' },
    linkedin: { label: 'LinkedIn', icon: '💼', color: '#0A66C2', gradient: 'from-sky-500 to-blue-600', ring: 'ring-sky-500/30' },
}

const typeIcons = {
    social: 'share', blog: 'article', ad: 'campaign', email: 'email',
    seo: 'search', promote: 'storefront', celebrate: 'celebration',
    launch: 'rocket_launch', educate: 'school', engage: 'forum',
    brand: 'branding_watermark', hijack: 'trending_up', caption: 'closed_caption',
    other: 'description',
}

export default function PublishSchedule() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()

    const [readyContent, setReadyContent] = useState([])
    const [contentLoading, setContentLoading] = useState(true)
    const [socialPosts, setSocialPosts] = useState([])
    const [historyLoading, setHistoryLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('published')
    const [copiedId, setCopiedId] = useState(null)
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
    const [publishItem, setPublishItem] = useState(null)
    const [cancellingId, setCancellingId] = useState(null)

    useEffect(() => {
        async function fetchContent() {
            setContentLoading(true)
            try {
                const data = await contentAPI.list({ limit: 100 })
                setReadyContent((data.content || []).filter(c => c.status === 'approved'))
            } catch (err) { console.error('Failed to load content:', err) }
            finally { setContentLoading(false) }
        }
        fetchContent()
    }, [activeBrand?._id])

    const fetchHistory = useCallback(async () => {
        setHistoryLoading(true)
        try {
            const data = await social.publishHistory({ brand: activeBrand?._id || '' })
            setSocialPosts(data.posts || [])
        } catch (err) { console.error('Failed to load social posts:', err) }
        finally { setHistoryLoading(false) }
    }, [activeBrand?._id])

    useEffect(() => { fetchHistory() }, [fetchHistory])

    const publishedPosts = socialPosts.filter(p => p.status === 'published')
    const scheduledPosts = socialPosts.filter(p => p.status === 'scheduled')
    const failedPosts = socialPosts.filter(p => p.status === 'failed')

    const tabs = [
        { id: 'published', label: 'Published', icon: 'task_alt', count: publishedPosts.length },
        { id: 'scheduled', label: 'Scheduled', icon: 'schedule_send', count: scheduledPosts.length },
        { id: 'ready', label: 'Ready to Post', icon: 'check_circle', count: readyContent.length },
        { id: 'failed', label: 'Failed', icon: 'error_outline', count: failedPosts.length },
    ]

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleCancel = async (postId) => {
        setCancellingId(postId)
        try {
            await social.cancelScheduled(postId)
            setSocialPosts(prev => prev.map(p => p._id === postId ? { ...p, status: 'cancelled' } : p))
        } catch (err) { alert('Failed to cancel: ' + (err.message || 'Unknown error')) }
        finally { setCancellingId(null) }
    }

    const formatTimeAgo = (date) => {
        const s = Math.floor((Date.now() - new Date(date)) / 1000)
        if (s < 60) return 'just now'
        if (s < 3600) return `${Math.floor(s / 60)}m ago`
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`
        return `${Math.floor(s / 86400)}d ago`
    }

    const formatCountdown = (date) => {
        const ms = new Date(date) - Date.now()
        if (ms <= 0) return 'Due now'
        const h = Math.floor(ms / 3600000)
        const m = Math.floor((ms % 3600000) / 60000)
        if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
        if (h > 0) return `${h}h ${m}m`
        return `${m}m`
    }

    const isLoading = activeTab === 'ready' ? contentLoading : historyLoading

    return (
        <DashboardLayout title="Publish & Schedule" subtitle="Track, schedule & manage your social posts">
            <div className="p-6 lg:p-8 max-w-6xl mx-auto">

                {/* ═══ Hero Stats ═══ */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {/* Published Stat */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/[0.08] to-emerald-600/[0.03] border border-emerald-500/10 p-5 group hover:border-emerald-500/20 transition-all">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                                <span className="material-symbols-outlined text-emerald-400">task_alt</span>
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Published</span>
                        </div>
                        <p className="text-3xl font-black text-white">{publishedPosts.length}</p>
                    </div>

                    {/* Scheduled Stat */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500/[0.08] to-violet-600/[0.03] border border-violet-500/10 p-5 group hover:border-violet-500/20 transition-all">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-violet-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
                                <span className="material-symbols-outlined text-violet-400">schedule_send</span>
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Scheduled</span>
                        </div>
                        <p className="text-3xl font-black text-white">{scheduledPosts.length}</p>
                    </div>

                    {/* Ready Stat */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500/[0.08] to-sky-600/[0.03] border border-sky-500/10 p-5 group hover:border-sky-500/20 transition-all">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-sky-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                                <span className="material-symbols-outlined text-sky-400">check_circle</span>
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ready</span>
                        </div>
                        <p className="text-3xl font-black text-white">{readyContent.length}</p>
                    </div>

                    {/* Failed Stat */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500/[0.08] to-rose-600/[0.03] border border-rose-500/10 p-5 group hover:border-rose-500/20 transition-all">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500" />
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                                <span className="material-symbols-outlined text-rose-400">error_outline</span>
                            </div>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Failed</span>
                        </div>
                        <p className="text-3xl font-black text-white">{failedPosts.length}</p>
                    </div>
                </div>

                {/* ═══ Tabs ═══ */}
                <div className="flex gap-1.5 mb-6 bg-white/[0.02] p-1.5 rounded-2xl border border-white/[0.06]">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer
                                ${activeTab === tab.id
                                    ? 'bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/20'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'}`}>
                            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                            {tab.count > 0 && (
                                <span className={`text-[10px] font-bold min-w-[20px] h-5 flex items-center justify-center rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* ═══ Content Area ═══ */}
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-500">
                        <span className="material-symbols-outlined text-4xl animate-spin mb-3 text-primary/60">progress_activity</span>
                        <p className="text-sm font-medium">Loading posts...</p>
                    </div>

                    /* ═══ PUBLISHED ═══ */
                ) : activeTab === 'published' ? (
                    publishedPosts.length > 0 ? (
                        <div className="space-y-3">
                            {publishedPosts.map((post, idx) => {
                                const meta = PLATFORM_META[post.platform] || {}
                                return (
                                    <div key={post._id}
                                        className="group relative rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.03] p-5 transition-all duration-200"
                                        style={{ animation: `fadeInUp 0.4s ease-out ${idx * 60}ms both` }}>

                                        {/* Platform accent line */}
                                        <div className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b ${meta.gradient || 'from-primary to-primary-light'} opacity-60`} />

                                        <div className="flex items-start gap-4 pl-3">
                                            {/* Image thumb */}
                                            {post.imageUrl && (
                                                <img src={post.imageUrl} alt="" className={`w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-white/10 ring-2 ${meta.ring || 'ring-white/10'}`} onError={e => e.target.style.display = 'none'} />
                                            )}

                                            <div className="min-w-0 flex-1">
                                                {/* Meta row */}
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r ${meta.gradient || 'from-primary to-primary-light'} text-white shadow-sm`}>
                                                        {meta.icon || '📱'} {meta.label || post.platform}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-medium">{post.accountName}</span>
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                                                        <span className="material-symbols-outlined text-[10px]">check_circle</span> Live
                                                    </span>
                                                </div>

                                                {/* Caption */}
                                                <p className="text-[13px] text-slate-300 line-clamp-2 whitespace-pre-wrap leading-relaxed">{post.caption?.substring(0, 250)}</p>

                                                {/* Timestamp */}
                                                <div className="flex items-center gap-3 mt-2.5">
                                                    <span className="text-[11px] text-slate-600 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[11px]">schedule</span>
                                                        {formatTimeAgo(post.publishedAt || post.createdAt)}
                                                    </span>
                                                    <span className="text-[11px] text-slate-600">
                                                        {new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <button onClick={() => handleCopy(post.caption, post._id)}
                                                className="p-2.5 rounded-xl hover:bg-white/[0.06] text-slate-600 hover:text-white transition-all cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0">
                                                <span className="material-symbols-outlined text-lg">{copiedId === post._id ? 'check' : 'content_copy'}</span>
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon="send"
                            title="No published posts yet"
                            desc="Publish content from Content Studio or Creative Studio to see your posts tracked here."
                            actionLabel="Go to Content Studio"
                            onAction={() => navigate('/content-studio')}
                        />
                    )

                    /* ═══ SCHEDULED ═══ */
                ) : activeTab === 'scheduled' ? (
                    scheduledPosts.length > 0 ? (
                        <div className="space-y-3">
                            {scheduledPosts.map((post, idx) => {
                                const meta = PLATFORM_META[post.platform] || {}
                                return (
                                    <div key={post._id}
                                        className="group relative rounded-2xl bg-violet-500/[0.03] border border-violet-500/10 hover:border-violet-500/20 p-5 transition-all duration-200"
                                        style={{ animation: `fadeInUp 0.4s ease-out ${idx * 60}ms both` }}>

                                        <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b from-violet-400 to-fuchsia-500 opacity-60" />

                                        <div className="flex items-start gap-4 pl-3">
                                            {post.imageUrl && (
                                                <img src={post.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-violet-500/20" onError={e => e.target.style.display = 'none'} />
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r ${meta.gradient || 'from-primary to-primary-light'} text-white shadow-sm`}>
                                                        {meta.icon || '📱'} {meta.label || post.platform}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-medium">{post.accountName}</span>
                                                    {/* Countdown badge */}
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/20">
                                                        <span className="material-symbols-outlined text-[12px]">timer</span>
                                                        {formatCountdown(post.scheduledFor)}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-slate-300 line-clamp-2 whitespace-pre-wrap leading-relaxed">{post.caption?.substring(0, 250)}</p>
                                                <div className="flex items-center gap-2 mt-2.5">
                                                    <span className="material-symbols-outlined text-xs text-violet-400">event</span>
                                                    <span className="text-[11px] text-violet-400 font-medium">
                                                        {new Date(post.scheduledFor).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => handleCancel(post._id)}
                                                disabled={cancellingId === post._id}
                                                className="px-4 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer flex items-center gap-1.5 border border-rose-500/15 hover:border-rose-500/30 flex-shrink-0 disabled:opacity-30">
                                                {cancellingId === post._id ? (
                                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-sm">close</span> Cancel</>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon="schedule_send"
                            title="No scheduled posts"
                            desc="Use the 'Schedule for later' toggle when publishing to queue posts for the perfect time."
                            actionLabel="Go to Content Studio"
                            onAction={() => navigate('/content-studio')}
                        />
                    )

                    /* ═══ READY ═══ */
                ) : activeTab === 'ready' ? (
                    readyContent.length > 0 ? (
                        <div className="space-y-3">
                            {readyContent.map((item, idx) => (
                                <div key={item._id}
                                    className="group relative rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-primary/20 hover:bg-white/[0.03] p-5 transition-all duration-200"
                                    style={{ animation: `fadeInUp 0.4s ease-out ${idx * 60}ms both` }}>

                                    <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b from-primary to-primary-light opacity-40" />

                                    <div className="flex items-start justify-between gap-4 pl-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="material-symbols-outlined text-primary text-lg">{typeIcons[item.type] || 'description'}</span>
                                                <h3 className="font-bold text-white truncate text-[15px]">{item.title || `${item.type} content`}</h3>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-primary uppercase">{item.type}</span>
                                            </div>
                                            <p className="text-[13px] text-slate-400 line-clamp-2 whitespace-pre-wrap leading-relaxed">{item.content?.substring(0, 280)}</p>
                                            <span className="text-[11px] text-slate-600 mt-2 inline-block">
                                                {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                {item.brand?.name && ` • ${item.brand.name}`}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => handleCopy(item.content, item._id)}
                                                className="p-2.5 rounded-xl hover:bg-white/[0.06] text-slate-600 hover:text-white transition-all cursor-pointer opacity-0 group-hover:opacity-100">
                                                <span className="material-symbols-outlined text-lg">{copiedId === item._id ? 'check' : 'content_copy'}</span>
                                            </button>
                                            <button onClick={() => { setPublishItem(item); setIsPublishModalOpen(true) }}
                                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-primary-light text-white text-xs font-bold hover:shadow-lg hover:shadow-primary/20 transition-all cursor-pointer flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">send</span>
                                                Publish
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon="check_circle"
                            title="No content ready to post"
                            desc="Approve content in Content Studio or Creative Studio to see it here."
                            actionLabel="Go to Content Studio"
                            onAction={() => navigate('/content-studio')}
                        />
                    )

                    /* ═══ FAILED ═══ */
                ) : activeTab === 'failed' ? (
                    failedPosts.length > 0 ? (
                        <div className="space-y-3">
                            {failedPosts.map((post, idx) => {
                                const meta = PLATFORM_META[post.platform] || {}
                                return (
                                    <div key={post._id}
                                        className="group relative rounded-2xl bg-rose-500/[0.03] border border-rose-500/10 hover:border-rose-500/20 p-5 transition-all duration-200"
                                        style={{ animation: `fadeInUp 0.4s ease-out ${idx * 60}ms both` }}>

                                        <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b from-rose-400 to-red-600 opacity-60" />

                                        <div className="flex items-start gap-4 pl-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-gradient-to-r ${meta.gradient || 'from-slate-500 to-slate-600'} text-white/80`}>
                                                        {meta.icon || '📱'} {meta.label || post.platform}
                                                    </span>
                                                    <span className="text-xs text-slate-500">{post.accountName}</span>
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400">
                                                        <span className="material-symbols-outlined text-[10px]">error</span> Failed
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-slate-400 line-clamp-2 whitespace-pre-wrap">{post.caption?.substring(0, 200)}</p>
                                                {post.error && (
                                                    <div className="mt-2 px-3 py-2 rounded-lg bg-rose-500/[0.06] border border-rose-500/10 flex items-start gap-2">
                                                        <span className="material-symbols-outlined text-rose-400 text-sm mt-0.5">warning</span>
                                                        <p className="text-xs text-rose-300/80 leading-relaxed">{post.error}</p>
                                                    </div>
                                                )}
                                                <span className="text-[11px] text-slate-600 mt-2 inline-block">{formatTimeAgo(post.createdAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ) : (
                        <EmptyState
                            icon="verified"
                            title="All clear!"
                            desc="No failed publish attempts. Everything's running smoothly."
                        />
                    )
                ) : null}
            </div>

            <PublishModal
                isOpen={isPublishModalOpen}
                onClose={() => {
                    setIsPublishModalOpen(false)
                    fetchHistory()
                }}
                defaultText={publishItem?.content || ''}
                defaultImage={publishItem?.imageUrl || publishItem?.files?.[0]?.url || ''}
                brandId={activeBrand?._id}
            />

            <style>{`
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </DashboardLayout>
    )
}

// ── Premium Empty State ──
function EmptyState({ icon, title, desc, actionLabel, onAction }) {
    return (
        <div className="flex flex-col items-center justify-center py-24 glass-panel rounded-2xl border border-white/[0.04]">
            <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
                <span className="material-symbols-outlined text-4xl text-slate-600">{icon}</span>
            </div>
            <h3 className="text-lg font-bold text-white mb-1.5">{title}</h3>
            <p className="text-sm text-slate-500 text-center max-w-sm mb-5 leading-relaxed">{desc}</p>
            {actionLabel && onAction && (
                <button onClick={onAction}
                    className="px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all cursor-pointer flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    {actionLabel}
                </button>
            )}
        </div>
    )
}

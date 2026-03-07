import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import DashboardLayout from '../components/DashboardLayout'
import { useBrand } from '../context/BrandContext'
import { content as contentAPI } from '../services/api'
import PublishModal from '../components/PublishModal'

// ═══════════════════════════════════════════════════════════════
// PUBLISH & SCHEDULE — Real content from Content Studio
// ═══════════════════════════════════════════════════════════════

export default function PublishSchedule() {
    const navigate = useNavigate()
    const { activeBrand } = useBrand()
    const [allContent, setAllContent] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('approved')
    const [copiedId, setCopiedId] = useState(null)
    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
    const [publishItem, setPublishItem] = useState(null)

    // Fetch all content for active brand
    useEffect(() => {
        async function fetchContent() {
            setLoading(true)
            try {
                const data = await contentAPI.list({ limit: 100 })
                setAllContent(data.content || [])
            } catch (err) {
                console.error('Failed to load content:', err)
            } finally {
                setLoading(false)
            }
        }
        fetchContent()
    }, [activeBrand?._id])

    const tabs = [
        { id: 'approved', label: 'Ready to Publish', icon: 'check_circle' },
        { id: 'draft', label: 'Drafts', icon: 'edit_note' },
        { id: 'published', label: 'Published', icon: 'task_alt' },
    ]

    // Count per tab
    const counts = {
        approved: allContent.filter(c => c.status === 'approved').length,
        draft: allContent.filter(c => c.status === 'draft').length,
        published: allContent.filter(c => c.status === 'published').length,
    }

    const filtered = allContent.filter(c => c.status === activeTab)

    const handleCopy = (text, id) => {
        navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    const handleDownload = (item) => {
        const blob = new Blob([item.content], { type: 'text/plain' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${(item.title || item.type || 'content').replace(/\s+/g, '-')}.txt`
        link.click()
    }

    const handleStatusChange = async (id, newStatus) => {
        try {
            await contentAPI.update(id, { status: newStatus })
            setAllContent(prev => prev.map(c => c._id === id ? { ...c, status: newStatus } : c))
        } catch (err) {
            console.error('Status update failed:', err)
        }
    }

    const typeIcons = {
        social: 'share', blog: 'article', ad: 'campaign', email: 'email',
        seo: 'search', promote: 'storefront', celebrate: 'celebration',
        launch: 'rocket_launch', educate: 'school', engage: 'forum',
        brand: 'branding_watermark', hijack: 'trending_up', caption: 'closed_caption',
        other: 'description',
    }

    const channelColors = {
        instagram: { bg: 'bg-pink-500/10', text: 'text-pink-400', icon: '📸' },
        facebook: { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '📘' },
        linkedin: { bg: 'bg-sky-500/10', text: 'text-sky-400', icon: '💼' },
        twitter: { bg: 'bg-slate-500/10', text: 'text-slate-300', icon: '🐦' },
        email: { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '📧' },
        whatsapp: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '💬' },
        website: { bg: 'bg-purple-500/10', text: 'text-purple-400', icon: '🌐' },
    }

    return (
        <DashboardLayout>
            <div className="p-8 max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold text-white tracking-tight">
                            <span className="material-symbols-outlined text-primary text-3xl align-middle mr-2">send</span>
                            Publish & Schedule
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">
                            {allContent.length} total content pieces • {counts.approved} ready to publish
                        </p>
                    </div>
                    <button onClick={() => navigate('/content-studio')}
                        className="btn-primary py-2.5 px-5 rounded-xl text-sm flex items-center gap-2 cursor-pointer">
                        <span className="material-symbols-outlined text-sm">add</span>
                        Create New
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer
                                ${activeTab === tab.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-400 hover:bg-white/[0.04]'}`}>
                            <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                            {tab.label}
                            {counts[tab.id] > 0 && (
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20' : 'bg-white/[0.06]'}`}>{counts[tab.id]}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Content Queue */}
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-slate-500">
                        <span className="material-symbols-outlined animate-spin mr-2">progress_activity</span>
                        Loading content...
                    </div>
                ) : filtered.length > 0 ? (
                    <div className="space-y-3">
                        {filtered.map((item, idx) => {
                            const ch = channelColors[item.platform] || channelColors[item.channel] || { bg: 'bg-white/[0.06]', text: 'text-slate-400', icon: '📄' }
                            return (
                                <div key={item._id} className="glass-panel rounded-2xl p-5 hover:bg-white/[0.03] transition-all animate-fade-in"
                                    style={{ animationDelay: `${idx * 50}ms` }}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <span className="material-symbols-outlined text-primary text-lg">
                                                    {typeIcons[item.type] || 'description'}
                                                </span>
                                                <h3 className="font-bold text-white truncate">
                                                    {item.title || `${item.type} content`}
                                                </h3>
                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">
                                                    {item.type}
                                                </span>
                                                {(item.platform || item.channel) && (
                                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ch.bg} ${ch.text}`}>
                                                        {ch.icon} {item.platform || item.channel}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-sm text-slate-400 line-clamp-3 whitespace-pre-wrap">
                                                {item.content?.substring(0, 300)}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2">
                                                <span className="text-xs text-slate-600">
                                                    {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                {item.brand?.name && (
                                                    <span className="text-xs text-slate-600">• {item.brand.name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button onClick={() => handleCopy(item.content, item._id)}
                                                className="p-2 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white transition-all cursor-pointer" title="Copy">
                                                <span className="material-symbols-outlined text-lg">
                                                    {copiedId === item._id ? 'check' : 'content_copy'}
                                                </span>
                                            </button>
                                            <button onClick={() => handleDownload(item)}
                                                className="p-2 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-white transition-all cursor-pointer" title="Download">
                                                <span className="material-symbols-outlined text-lg">download</span>
                                            </button>
                                            {item.status === 'draft' && (
                                                <button onClick={() => handleStatusChange(item._id, 'approved')}
                                                    className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all cursor-pointer flex items-center gap-1 border border-emerald-500/20">
                                                    <span className="material-symbols-outlined text-sm">check</span>
                                                    Approve
                                                </button>
                                            )}
                                            {item.status === 'approved' && (
                                                <button onClick={() => {
                                                    setPublishItem(item);
                                                    setIsPublishModalOpen(true);
                                                }}
                                                    className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-light transition-all cursor-pointer flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-sm">send</span>
                                                    Publish
                                                </button>
                                            )}
                                            {item.status === 'published' && (
                                                <span className="px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-sm">task_alt</span>
                                                    Published
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <div className="text-center py-20 glass-panel rounded-2xl">
                        <span className="material-symbols-outlined text-6xl text-slate-700 mb-3">inbox</span>
                        <h3 className="text-lg font-bold text-white mb-1">
                            No {activeTab === 'approved' ? 'ready' : activeTab} content
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            {activeTab === 'approved'
                                ? 'Approve content in Content Studio to see it here'
                                : activeTab === 'draft'
                                    ? 'Generated content will appear as drafts'
                                    : 'Published content will be tracked here'}
                        </p>
                        <button onClick={() => navigate('/content-studio')}
                            className="btn-primary py-2.5 px-6 rounded-xl text-sm cursor-pointer">
                            Go to Content Studio
                        </button>
                    </div>
                )}

                {/* V2 Coming Soon */}
                <div className="mt-8 glass-panel rounded-2xl p-6 border border-primary/10">
                    <div className="flex items-center gap-3 mb-3">
                        <span className="material-symbols-outlined text-primary text-xl">rocket_launch</span>
                        <h3 className="font-bold text-white">Coming in V2</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            { icon: 'schedule_send', label: 'Auto Scheduling', desc: 'AI picks the best time to post' },
                            { icon: 'share', label: 'Direct Publishing', desc: 'Push to Instagram, Facebook, LinkedIn' },
                            { icon: 'analytics', label: 'Post Analytics', desc: 'Track engagement and reach' },
                        ].map((f, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02]">
                                <span className="material-symbols-outlined text-primary text-lg">{f.icon}</span>
                                <div>
                                    <p className="text-base font-semibold text-white">{f.label}</p>
                                    <p className="text-[11px] text-slate-500">{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <PublishModal
                isOpen={isPublishModalOpen}
                onClose={() => {
                    setIsPublishModalOpen(false);
                    // Refresh content after closing to update statuses
                    window.location.reload();
                }}
                defaultText={publishItem?.content || ''}
                defaultImage={publishItem?.imageUrl || publishItem?.files?.[0]?.url || ''}
            />
        </DashboardLayout>
    )
}

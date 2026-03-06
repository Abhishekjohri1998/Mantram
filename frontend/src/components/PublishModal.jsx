import { useState, useEffect } from 'react'
import { social } from '../services/api'

export default function PublishModal({ isOpen, onClose, defaultText = '', defaultImage = null }) {
    const [accounts, setAccounts] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedAccounts, setSelectedAccounts] = useState([])
    const [text, setText] = useState(defaultText)
    const [imageUrl, setImageUrl] = useState(defaultImage || '')
    const [publishing, setPublishing] = useState(false)
    const [results, setResults] = useState(null)

    useEffect(() => {
        if (!isOpen) return
        setText(defaultText)
        setImageUrl(defaultImage || '')
        setResults(null)
        loadAccounts()
    }, [isOpen, defaultText, defaultImage])

    const loadAccounts = async () => {
        setLoading(true)
        try {
            const data = await social.accounts()
            setAccounts(data.data || [])
            // Auto-select all by default
            setSelectedAccounts((data.data || []).map(a => a._id))
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const toggleAccount = (id) => {
        if (selectedAccounts.includes(id)) {
            setSelectedAccounts(selectedAccounts.filter(a => a !== id))
        } else {
            setSelectedAccounts([...selectedAccounts, id])
        }
    }

    const handlePublish = async () => {
        if (selectedAccounts.length === 0) return alert('Select at least one account')
        if (!text) return alert('Content text is required')

        setPublishing(true)
        try {
            const res = await social.publish({
                accountIds: selectedAccounts,
                text,
                imageUrl
            })
            setResults(res.results)
        } catch (err) {
            alert(err.message || 'Failed to publish')
        } finally {
            setPublishing(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0c0f1a] border border-white/10 rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl animate-fade-in">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">send</span>
                        Publish to Socials
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-5">

                    {/* Publishing Results screen */}
                    {results ? (
                        <div className="space-y-4">
                            <div className="text-center py-6">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-outlined text-3xl text-emerald-400">check_circle</span>
                                </div>
                                <h4 className="text-xl font-bold text-white">Publishing Complete</h4>
                                <p className="text-slate-400 text-sm mt-1">Here's the results of your social media post.</p>
                            </div>

                            <div className="space-y-3">
                                {results.map((r, i) => (
                                    <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${r.status === 'success' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
                                        <div>
                                            <p className="font-bold text-white text-sm">{r.accountName} <span className="text-xs text-slate-500 font-normal uppercase ml-1">({r.platform})</span></p>
                                            {r.status === 'error' && <p className="text-xs text-rose-400 mt-1">{r.error}</p>}
                                        </div>
                                        <div className={`px-2.5 py-1 rounded text-xs font-bold ${r.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                            {r.status.toUpperCase()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Account Selection */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Select Accounts</h4>
                                {loading ? (
                                    <div className="py-8 text-center"><span className="material-symbols-outlined animate-spin text-primary">progress_activity</span></div>
                                ) : accounts.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                                        <p className="text-slate-400 text-sm mb-2">No social accounts connected.</p>
                                        <a href="/integrations" className="text-primary text-sm hover:underline">Go to Settings to connect accounts</a>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        {accounts.map(acc => {
                                            const isSelected = selectedAccounts.includes(acc._id)
                                            return (
                                                <button key={acc._id} onClick={() => toggleAccount(acc._id)}
                                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${isSelected ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(234,179,8,0.15)]' : 'bg-white/5 border-white/10 hover:border-white/20'}`}>
                                                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'bg-primary text-[#0c0f1a]' : 'border border-slate-500'}`}>
                                                        {isSelected && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                                    </div>
                                                    {acc.avatar ? <img src={acc.avatar} className="w-8 h-8 rounded-full flex-shrink-0" alt="" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0"><span className="material-symbols-outlined text-xs">storefront</span></div>}
                                                    <div className="truncate pr-2">
                                                        <p className="text-sm font-bold text-white truncate">{acc.accountName}</p>
                                                        <p className="text-[10px] text-slate-400 uppercase">{acc.platform}</p>
                                                    </div>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Content Details */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-300 mb-3 uppercase tracking-wider">Post Content</h4>
                                <div className="space-y-3">
                                    <textarea
                                        value={text}
                                        onChange={e => setText(e.target.value)}
                                        className="w-full h-32 p-3 bg-white/5 border border-white/10 text-white text-sm rounded-xl focus:outline-none focus:border-primary custom-scrollbar"
                                        placeholder="Write your post content here..."
                                    />

                                    <div>
                                        <input
                                            type="text"
                                            value={imageUrl}
                                            onChange={e => setImageUrl(e.target.value)}
                                            placeholder="Optional Media URL (Required for Instagram)"
                                            className="w-full p-3 bg-white/5 border border-white/10 text-white text-sm rounded-xl focus:outline-none focus:border-primary"
                                        />
                                        {imageUrl && (
                                            <div className="mt-3 p-2 bg-white/5 rounded-xl border border-white/10 inline-block">
                                                <img src={imageUrl} alt="preview" className="max-h-32 rounded-lg" onError={(e) => e.target.style.display = 'none'} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-black/20 rounded-b-2xl">
                    <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors cursor-pointer">
                        {results ? 'Close' : 'Cancel'}
                    </button>
                    {!results && (
                        <button onClick={handlePublish} disabled={publishing || accounts.length === 0}
                            className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
                            {publishing ? (
                                <><span className="material-symbols-outlined text-lg animate-spin">progress_activity</span> Publishing...</>
                            ) : (
                                <><span className="material-symbols-outlined text-lg">send</span> Publish Now</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import AvatarOptionsForm from '../AvatarOptionsForm'

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    return fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    }).then(async r => {
        const data = await r.json()
        if (!data.success) throw new Error(data.error || 'Request failed')
        return data
    })
}

const css = `
.avpk-backdrop {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0,0,0,0.85); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    animation: avpk-fade 0.2s ease forwards;
}
@keyframes avpk-fade { from { opacity: 0 } to { opacity: 1 } }

.avpk-modal {
    background: #141414; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px; width: 100%; max-width: 960px; height: 80vh;
    display: flex; overflow: hidden;
    box-shadow: 0 32px 64px rgba(0,0,0,0.7);
}

/* Sidebar */
.avpk-sidebar {
    width: 180px; flex-shrink: 0;
    border-right: 1px solid rgba(255,255,255,0.06);
    padding: 20px 12px; display: flex; flex-direction: column; gap: 4px;
}
.avpk-sb-title {
    font-size: 16px; font-weight: 800; color: #fff;
    margin-bottom: 16px; padding: 0 8px;
}
.avpk-sb-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 8px;
    font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6);
    cursor: pointer; border: none; background: transparent; transition: all 0.15s;
    text-align: left; width: 100%;
}
.avpk-sb-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
.avpk-sb-item.active { background: rgba(255,255,255,0.1); color: #fff; font-weight: 700; }
.avpk-sb-item .material-symbols-outlined { font-size: 18px; }

.avpk-sb-divider {
    height: 1px; background: rgba(255,255,255,0.06);
    margin: 8px 0;
}
.avpk-sb-label {
    font-size: 10px; font-weight: 700; color: rgba(255,255,255,0.3);
    text-transform: uppercase; letter-spacing: 1px;
    padding: 4px 10px; margin-top: 4px;
}

/* Main area */
.avpk-main {
    flex: 1; display: flex; flex-direction: column; overflow: hidden;
}
.avpk-header {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.avpk-search {
    flex: 1; display: flex; align-items: center; gap: 8px;
    background: rgba(255,255,255,0.06); border-radius: 10px;
    padding: 0 12px; border: 1px solid rgba(255,255,255,0.06);
    transition: border-color 0.2s;
}
.avpk-search:focus-within { border-color: rgba(255,255,255,0.2); }
.avpk-search input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #fff; font-size: 13px; padding: 10px 0;
}
.avpk-search input::placeholder { color: rgba(255,255,255,0.3); }
.avpk-close {
    width: 32px; height: 32px; border-radius: 50%;
    background: rgba(255,255,255,0.08); border: none;
    color: #fff; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.2s;
}
.avpk-close:hover { background: rgba(255,255,255,0.15); }

/* Grid */
.avpk-grid {
    flex: 1; overflow-y: auto; padding: 16px 20px;
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px;
    align-content: start;
}
.avpk-grid::-webkit-scrollbar { width: 4px; }
.avpk-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

/* Card */
.avpk-card {
    aspect-ratio: 9/16; border-radius: 12px; overflow: hidden;
    position: relative; cursor: pointer;
    background: #1e1e1e; border: 2px solid transparent;
    transition: all 0.2s;
}
.avpk-card:hover { border-color: rgba(255,255,255,0.2); transform: translateY(-2px); }
.avpk-card.selected { border-color: #ec4899; }
.avpk-card img {
    position: absolute; inset: 0; width: 100%; height: 100%;
    object-fit: cover;
}
.avpk-card-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%);
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 10px; opacity: 0; transition: opacity 0.2s;
}
.avpk-card:hover .avpk-card-overlay { opacity: 1; }
.avpk-card-name {
    font-size: 12px; font-weight: 700; color: #fff;
}
.avpk-card-select {
    margin-top: 6px; width: 100%; padding: 6px 0;
    background: linear-gradient(135deg, #ec4899, #f472b6);
    border: none; border-radius: 8px;
    color: #fff; font-size: 11px; font-weight: 800;
    cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px;
}
.avpk-card-actions {
    position: absolute; top: 6px; right: 6px;
    display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s;
}
.avpk-card:hover .avpk-card-actions { opacity: 1; }
.avpk-card-action {
    width: 24px; height: 24px; border-radius: 6px;
    background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
    border: none; color: #fff; display: flex; align-items: center;
    justify-content: center; cursor: pointer; transition: background 0.2s;
}
.avpk-card-action:hover { background: rgba(0,0,0,0.8); }
.avpk-card-badge {
    position: absolute; top: 6px; left: 6px;
    padding: 2px 6px; border-radius: 4px;
    font-size: 8px; font-weight: 800; text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* Create card */
.avpk-create-card {
    aspect-ratio: 9/16; border-radius: 12px; overflow: hidden;
    position: relative; cursor: pointer;
    background: rgba(255,255,255,0.03);
    border: 2px dashed rgba(255,255,255,0.12);
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 10px;
    transition: all 0.2s;
}
.avpk-create-card:hover {
    border-color: rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.06);
}
.avpk-create-icon {
    width: 48px; height: 48px; border-radius: 12px;
    background: rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
}
.avpk-create-label {
    font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.7);
}

/* Create flow panel (replaces grid) */
.avpk-create-panel {
    flex: 1; overflow-y: auto; padding: 32px 40px;
    display: flex; flex-direction: column; gap: 24px;
}
.avpk-create-back {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; color: rgba(255,255,255,0.6);
    font-size: 13px; font-weight: 600; cursor: pointer;
    padding: 0; transition: color 0.2s;
}
.avpk-create-back:hover { color: #fff; }
.avpk-create-title {
    font-size: 20px; font-weight: 800; color: #fff;
}
.avpk-create-modes {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
.avpk-mode-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px; padding: 24px;
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    cursor: pointer; transition: all 0.2s; text-align: center;
}
.avpk-mode-card:hover {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.15);
}
.avpk-mode-card.active {
    border-color: #ec4899;
    background: rgba(236,72,153,0.06);
}

/* Generate form */
.avpk-gen-form {
    display: flex; flex-direction: column; gap: 14px;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 16px; padding: 24px;
}
.avpk-gen-input {
    width: 100%; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
    padding: 12px 14px; color: #fff; font-size: 14px; outline: none;
    transition: border-color 0.2s; font-family: inherit;
}
.avpk-gen-input:focus { border-color: rgba(255,255,255,0.25); }
.avpk-gen-input::placeholder { color: rgba(255,255,255,0.3); }
.avpk-gen-btn {
    padding: 12px 24px; border-radius: 10px; border: none;
    font-weight: 800; font-size: 14px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    transition: all 0.2s;
}
.avpk-gen-btn.primary {
    background: linear-gradient(135deg, #ec4899, #f472b6);
    color: #fff;
}
.avpk-gen-btn.primary:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(236,72,153,0.3); }
.avpk-gen-btn.primary:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; }
.avpk-gen-btn.secondary {
    background: rgba(255,255,255,0.08); color: #fff;
    border: 1px solid rgba(255,255,255,0.1);
}

/* Preview */
.avpk-preview {
    width: 160px; aspect-ratio: 9/16; border-radius: 12px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    overflow: hidden; margin: 0 auto;
}
.avpk-preview img {
    width: 100%; height: 100%; object-fit: cover;
}

/* Empty */
.avpk-empty {
    grid-column: 1 / -1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 60px 20px;
    color: rgba(255,255,255,0.3); gap: 8px;
}

@media (max-width: 768px) {
    .avpk-modal { flex-direction: column; height: 90vh; }
    .avpk-sidebar { width: 100%; flex-direction: row; overflow-x: auto; padding: 10px; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .avpk-grid { grid-template-columns: repeat(3, 1fr); }
    .avpk-sb-title { display: none; }
    .avpk-sb-divider { display: none; }
    .avpk-sb-label { display: none; }
}
`

export default function AvatarPicker({ isOpen, onClose, onSelect, activeBrand }) {
    const [filter, setFilter] = useState('all')        // all | pinned | my
    const [gender, setGender] = useState('all')         // all | male | female
    const [search, setSearch] = useState('')
    const [templates, setTemplates] = useState([])
    const [userAvatars, setUserAvatars] = useState([])
    const [loading, setLoading] = useState(true)
    const [selected, setSelected] = useState(null)

    const [showCreate, setShowCreate] = useState(false)
    const [createMode, setCreateMode] = useState(null) // 'upload' | 'generate'
    const [avatarName, setAvatarName] = useState('')
    // ── Structured generation state (replaces genPrompt free-text) ──
    const [genOptions, setGenOptions] = useState({
        origin: 'south-asian', ageRange: 'adult', genderExpression: '',
        clothingStyle: 'smart-casual', environment: 'minimalist', lightingMood: 'natural-daylight', additionalDetails: ''
    })
    const [genErrors, setGenErrors] = useState({})
    const [genBusy, setGenBusy] = useState(false)
    const [genVariants, setGenVariants] = useState([])   // [{ slot, url, failed }]
    const [genSelectedSlot, setGenSelectedSlot] = useState(null)
    const fileRef = useRef(null)
    const [uploadBusy, setUploadBusy] = useState(false)

    // Load avatars
    const loadAvatars = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (filter !== 'all') params.set('filter', filter)
            if (gender !== 'all') params.set('gender', gender)
            if (search) params.set('search', search)
            const d = await api(`/video-studio/ugc-pro/avatars?${params}`)
            setTemplates(d.templates || [])
            setUserAvatars(d.userAvatars || [])
        } catch { }
        setLoading(false)
    }, [filter, gender, search])

    useEffect(() => {
        if (isOpen) loadAvatars()
    }, [isOpen, loadAvatars])

    // Upload avatar
    const handleUpload = useCallback(async (file) => {
        setUploadBusy(true)
        try {
            const form = new FormData()
            form.append('avatarImage', file)
            
            let finalName = avatarName.trim()
            if (finalName && !finalName.startsWith('@')) finalName = '@' + finalName
            form.append('name', finalName)

            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/avatars', { method: 'POST', body: form, headers: {} })
            // Refresh list
            await loadAvatars()
            setShowCreate(false)
            setCreateMode(null)
            setAvatarName('')
            setGenPrompt('')
        } catch { }
        setUploadBusy(false)
    }, [activeBrand, loadAvatars, avatarName])

    // Generate avatar with AI — uses structured options, calls new avatar-studio endpoint
    const handleGenerate = useCallback(async () => {
        if (!genOptions.genderExpression) {
            setGenErrors({ genderExpression: 'Please select a gender expression' })
            return
        }
        setGenBusy(true); setGenVariants([null, null, null]); setGenSelectedSlot(null)
        try {
            const d = await api('/avatar-studio/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...genOptions, brandId: activeBrand?._id }),
            })
            const variants = d.variants || []
            setGenVariants(variants)
            const firstOk = variants.find(v => !v.failed && v.url)
            if (firstOk) setGenSelectedSlot(firstOk.slot)
            await loadAvatars()
        } catch (err) {
            console.error('[AvatarPicker] Generate failed:', err.message)
            setGenVariants([])
        }
        setGenBusy(false)
    }, [genOptions, activeBrand, loadAvatars])

    // Select and confirm
    const handleSelect = useCallback((avatar) => {
        onSelect({ _id: avatar._id, name: avatar.name, imageUrl: avatar.imageUrl })
        onClose()
    }, [onSelect, onClose])

    // Pin toggle
    const handlePin = useCallback(async (id, e) => {
        e.stopPropagation()
        try {
            await api(`/video-studio/ugc-pro/avatars/${id}/pin`, { method: 'PUT' })
            loadAvatars()
        } catch { }
    }, [loadAvatars])

    // Delete
    const handleDelete = useCallback(async (id, e) => {
        e.stopPropagation()
        if (!confirm('Delete this avatar?')) return
        try {
            await api(`/video-studio/ugc-pro/avatars/${id}`, { method: 'DELETE' })
            loadAvatars()
        } catch { }
    }, [loadAvatars])

    if (!isOpen) return null

    const allAvatars = [...templates, ...userAvatars]

    return (
        <div className="avpk-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
            <style>{css}</style>
            <div className="avpk-modal">

                {/* Sidebar */}
                <div className="avpk-sidebar">
                    <div className="avpk-sb-title">Select Avatar</div>

                    <button className={`avpk-sb-item ${filter === 'all' && gender === 'all' ? 'active' : ''}`}
                        onClick={() => { setFilter('all'); setGender('all'); setShowCreate(false) }}>
                        <span className="material-symbols-outlined">group</span> All
                    </button>
                    <button className={`avpk-sb-item ${filter === 'pinned' ? 'active' : ''}`}
                        onClick={() => { setFilter('pinned'); setGender('all'); setShowCreate(false) }}>
                        <span className="material-symbols-outlined">push_pin</span> Pinned
                    </button>
                    <button className={`avpk-sb-item ${filter === 'my' ? 'active' : ''}`}
                        onClick={() => { setFilter('my'); setGender('all'); setShowCreate(false) }}>
                        <span className="material-symbols-outlined">person</span> My avatars
                    </button>

                    <div className="avpk-sb-divider" />
                    <div className="avpk-sb-label">Gender</div>

                    <button className={`avpk-sb-item ${gender === 'male' ? 'active' : ''}`}
                        onClick={() => { setGender(gender === 'male' ? 'all' : 'male'); setFilter('all'); setShowCreate(false) }}>
                        <span className="material-symbols-outlined">male</span> Male
                    </button>
                    <button className={`avpk-sb-item ${gender === 'female' ? 'active' : ''}`}
                        onClick={() => { setGender(gender === 'female' ? 'all' : 'female'); setFilter('all'); setShowCreate(false) }}>
                        <span className="material-symbols-outlined">female</span> Female
                    </button>
                </div>

                {/* Main */}
                <div className="avpk-main">
                    {/* Header */}
                    <div className="avpk-header">
                        <div className="avpk-search">
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)' }}>search</span>
                            <input placeholder="Search..." value={search}
                                onChange={e => setSearch(e.target.value)} />
                        </div>
                        <button className="avpk-close" onClick={onClose}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                    </div>

                    {/* Create Flow */}
                    {showCreate ? (
                        <div className="avpk-create-panel">
                            <button className="avpk-create-back" onClick={() => { setShowCreate(false); setCreateMode(null); setGenPreview(null) }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                                Back to gallery
                            </button>
                            <div className="avpk-create-title">Create Avatar</div>

                            {/* Mode selection */}
                            <div className="avpk-create-modes">
                                <div className={`avpk-mode-card ${createMode === 'upload' ? 'active' : ''}`}
                                    onClick={() => setCreateMode('upload')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#a855f7' }}>cloud_upload</span>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Upload Photo</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Turn any photo into a UGC avatar</div>
                                </div>
                                <div className={`avpk-mode-card ${createMode === 'generate' ? 'active' : ''}`}
                                    onClick={() => setCreateMode('generate')}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#ec4899' }}>auto_awesome</span>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>AI Generate</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Describe the look you want</div>
                                </div>
                            </div>

                            {/* Upload mode */}
                            {createMode === 'upload' && (
                                <div className="avpk-gen-form">
                                    <input
                                        className="avpk-gen-input"
                                        placeholder="Name this avatar (e.g. @sarah)"
                                        value={avatarName}
                                        onChange={e => setAvatarName(e.target.value)}
                                    />
                                    <input type="file" ref={fileRef} accept="image/*" hidden
                                        onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                                    <button className="avpk-gen-btn secondary" onClick={() => fileRef.current?.click()} disabled={uploadBusy || !avatarName.trim()}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add_photo_alternate</span>
                                        {uploadBusy ? 'Uploading...' : 'Choose Photo to Upload'}
                                    </button>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                        JPG, PNG, WebP — portrait (9:16) recommended
                                    </div>
                                </div>
                            )}

                            {/* Generate mode — structured options + 3-up variant grid */}
                            {createMode === 'generate' && (
                                <div className="avpk-gen-form">
                                    <AvatarOptionsForm
                                        options={genOptions}
                                        onChange={(key, val) => {
                                            setGenOptions(prev => ({ ...prev, [key]: val }))
                                            if (genErrors[key]) setGenErrors(prev => ({ ...prev, [key]: '' }))
                                        }}
                                        errors={genErrors}
                                        compact={true}
                                    />
                                    <button className="avpk-gen-btn primary" onClick={handleGenerate} disabled={genBusy}>
                                        {genBusy
                                            ? <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span> Generating 3 variants...</>
                                            : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> Generate 3 Variants</>}
                                    </button>

                                    {/* 3-up mini variant grid */}
                                    {genVariants.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                                            {[0, 1, 2].map(slot => {
                                                const v = genVariants[slot]
                                                const isSelected = genSelectedSlot === slot
                                                return (
                                                    <div key={slot}
                                                        onClick={() => v && !v.failed && v.url && setGenSelectedSlot(slot)}
                                                        style={{
                                                            position: 'relative', aspectRatio: '9/16',
                                                            borderRadius: 10, overflow: 'hidden',
                                                            border: isSelected ? '2px solid #f97316' : '1.5px solid rgba(255,255,255,0.1)',
                                                            background: 'rgba(255,255,255,0.04)',
                                                            cursor: v && !v.failed && v.url ? 'pointer' : 'default',
                                                        }}
                                                    >
                                                        {genBusy && (
                                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,0.3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                                            </div>
                                                        )}
                                                        {!genBusy && v && !v.failed && v.url && (
                                                            <img src={v.url} alt={`Variant ${slot + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        )}
                                                        {!genBusy && v && v.failed && (
                                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'rgba(239,68,68,0.6)' }}>broken_image</span>
                                                            </div>
                                                        )}
                                                        {isSelected && (
                                                            <div style={{ position: 'absolute', top: 4, right: 4, background: '#f97316', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800 }}>✓</div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Use selected variant */}
                                    {genSelectedSlot !== null && genVariants[genSelectedSlot]?.url && (
                                        <button className="avpk-gen-btn primary" onClick={() => {
                                            onSelect({ _id: null, name: 'AI Avatar', imageUrl: genVariants[genSelectedSlot].url })
                                            onClose()
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
                                            Use This Avatar
                                        </button>
                                    )}

                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                                        3 variants · 9:16 portrait · 4 credits
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Avatar Grid */
                        <div className="avpk-grid">
                            {/* Create Avatar Card — always first */}
                            <div className="avpk-create-card" onClick={() => setShowCreate(true)}>
                                <div className="avpk-create-icon">
                                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'rgba(255,255,255,0.5)' }}>add</span>
                                </div>
                                <span className="avpk-create-label">Create avatar</span>
                            </div>

                            {loading && allAvatars.length === 0 && (
                                <div className="avpk-empty">
                                    <span className="material-symbols-outlined" style={{ fontSize: 32, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                    Loading avatars...
                                </div>
                            )}

                            {!loading && allAvatars.length === 0 && (
                                <div className="avpk-empty">
                                    <span className="material-symbols-outlined" style={{ fontSize: 40 }}>person_off</span>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>No avatars found</div>
                                    <div style={{ fontSize: 12 }}>Create one or adjust your filters</div>
                                </div>
                            )}

                            {allAvatars.map(avatar => (
                                <div key={avatar._id} className={`avpk-card ${selected === avatar._id ? 'selected' : ''}`}
                                    onClick={() => handleSelect(avatar)}>
                                    <img src={avatar.imageUrl} alt={avatar.name} loading="lazy" />

                                    {/* Badge for templates */}
                                    {avatar.isTemplate && (
                                        <div className="avpk-card-badge" style={{ background: 'rgba(168,85,247,0.8)', color: '#fff' }}>Template</div>
                                    )}

                                    {/* Hover overlay */}
                                    <div className="avpk-card-overlay">
                                        <span className="avpk-card-name">{avatar.name || 'Avatar'}</span>
                                        <button className="avpk-card-select" onClick={(e) => { e.stopPropagation(); handleSelect(avatar) }}>
                                            Select avatar
                                        </button>
                                    </div>

                                    {/* Actions for user's own avatars */}
                                    {!avatar.isTemplate && (
                                        <div className="avpk-card-actions">
                                            <button className="avpk-card-action" onClick={(e) => handlePin(avatar._id, e)}
                                                title={avatar.isPinned ? 'Unpin' : 'Pin'}>
                                                <span className="material-symbols-outlined" style={{
                                                    fontSize: 14,
                                                    color: avatar.isPinned ? '#f59e0b' : '#fff',
                                                    fontVariationSettings: avatar.isPinned ? "'FILL' 1" : "'FILL' 0"
                                                }}>push_pin</span>
                                            </button>
                                            <button className="avpk-card-action" onClick={(e) => handleDelete(avatar._id, e)} title="Delete">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

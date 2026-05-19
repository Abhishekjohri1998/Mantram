import { useState, useEffect, useRef, useCallback } from 'react'
import AvatarOptionsForm from '../AvatarOptionsForm'

const API = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const r = await fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const data = await r.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

const css = `
@keyframes avpk-fade { from { opacity:0; transform:scale(0.97) } to { opacity:1; transform:scale(1) } }
@keyframes avpk-spin { to { transform:rotate(360deg) } }
@keyframes avpk-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }

.avpk-backdrop {
    position:fixed; inset:0; z-index:9999;
    background:rgba(0,0,0,0.88); backdrop-filter:blur(10px);
    display:flex; align-items:center; justify-content:center; padding:24px;
    animation:avpk-fade 0.2s ease forwards;
}
.avpk-modal {
    background:#111116; border:1px solid rgba(255,255,255,0.09);
    border-radius:22px; width:100%; max-width:980px; height:82vh;
    display:flex; overflow:hidden;
    box-shadow:0 40px 80px rgba(0,0,0,0.75);
}
.avpk-sidebar {
    width:186px; flex-shrink:0;
    border-right:1px solid rgba(255,255,255,0.06);
    padding:22px 12px; display:flex; flex-direction:column; gap:3px;
    background:rgba(255,255,255,0.015); overflow-y:auto;
}
.avpk-sb-title { font-size:15px; font-weight:800; color:#fff; margin-bottom:18px; padding:0 8px; letter-spacing:-0.3px; }
.avpk-sb-item {
    display:flex; align-items:center; gap:9px;
    padding:8px 11px; border-radius:9px;
    font-size:13px; font-weight:500; color:rgba(255,255,255,0.5);
    cursor:pointer; border:none; background:transparent; transition:all 0.15s; text-align:left; width:100%;
}
.avpk-sb-item:hover { background:rgba(255,255,255,0.06); color:#fff; }
.avpk-sb-item.active { background:rgba(255,255,255,0.1); color:#fff; font-weight:700; }
.avpk-sb-item .material-symbols-outlined { font-size:17px; }
.avpk-sb-divider { height:1px; background:rgba(255,255,255,0.06); margin:8px 0; }
.avpk-sb-label { font-size:9.5px; font-weight:700; color:rgba(255,255,255,0.25); text-transform:uppercase; letter-spacing:1.1px; padding:4px 11px; margin-top:4px; }

.avpk-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.avpk-header {
    display:flex; align-items:center; gap:12px;
    padding:14px 20px; border-bottom:1px solid rgba(255,255,255,0.06);
}
.avpk-search {
    flex:1; display:flex; align-items:center; gap:8px;
    background:rgba(255,255,255,0.055); border-radius:10px;
    padding:0 12px; border:1px solid rgba(255,255,255,0.07); transition:border-color 0.2s;
}
.avpk-search:focus-within { border-color:rgba(255,255,255,0.18); }
.avpk-search input { flex:1; background:transparent; border:none; outline:none; color:#fff; font-size:13px; padding:10px 0; }
.avpk-search input::placeholder { color:rgba(255,255,255,0.28); }
.avpk-close {
    width:32px; height:32px; border-radius:50%;
    background:rgba(255,255,255,0.08); border:none;
    color:#fff; display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:background 0.2s; flex-shrink:0;
}
.avpk-close:hover { background:rgba(255,255,255,0.15); }

.avpk-grid {
    flex:1; overflow-y:auto; padding:16px 20px;
    display:grid; grid-template-columns:repeat(5,1fr); grid-auto-rows:max-content; gap:12px; align-content:start;
}
.avpk-grid::-webkit-scrollbar { width:4px; }
.avpk-grid::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px; }

.avpk-skeleton {
    width:100%; aspect-ratio:9/16; border-radius:12px; align-self:start;
    background:linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%);
    background-size:200% 100%;
    animation:avpk-shimmer 1.6s infinite;
}
.avpk-card {
    width:100%; aspect-ratio:9/16; border-radius:12px; overflow:hidden;
    position:relative; cursor:pointer; align-self:start;
    background:#1b1b20; border:2px solid transparent; transition:all 0.2s;
}
.avpk-card:hover { border-color:rgba(255,255,255,0.22); transform:translateY(-2px); }
.avpk-card.selected { border-color:#ec4899; }
.avpk-card img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.avpk-card-overlay {
    position:absolute; inset:0;
    background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 55%);
    display:flex; flex-direction:column; justify-content:flex-end;
    padding:10px; opacity:0; transition:opacity 0.2s;
}
.avpk-card:hover .avpk-card-overlay { opacity:1; }
.avpk-card-name { font-size:11.5px; font-weight:700; color:#fff; }
.avpk-card-select {
    margin-top:6px; width:100%; padding:6px 0;
    background:linear-gradient(135deg,#ec4899,#f472b6);
    border:none; border-radius:7px;
    color:#fff; font-size:11px; font-weight:800; cursor:pointer;
    text-transform:uppercase; letter-spacing:0.5px;
}
.avpk-card-actions { position:absolute; top:6px; right:6px; display:flex; gap:4px; opacity:0; transition:opacity 0.2s; }
.avpk-card:hover .avpk-card-actions { opacity:1; }
.avpk-card-action {
    width:24px; height:24px; border-radius:6px;
    background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
    border:none; color:#fff; display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:background 0.2s;
}
.avpk-card-action:hover { background:rgba(0,0,0,0.85); }

/* Platform badge — teal pill, not orange */
.avpk-badge-platform {
    position:absolute; top:6px; left:6px;
    padding:2px 7px; border-radius:20px;
    font-size:8px; font-weight:800; text-transform:uppercase; letter-spacing:0.8px;
    background:rgba(20,184,166,0.82); color:#fff; backdrop-filter:blur(4px);
}

.avpk-create-card {
    width:100%; aspect-ratio:9/16; border-radius:12px; overflow:hidden;
    position:relative; cursor:pointer; align-self:start;
    background:rgba(255,255,255,0.025);
    border:2px dashed rgba(255,255,255,0.11);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
    transition:all 0.2s;
}
.avpk-create-card:hover { border-color:rgba(255,255,255,0.24); background:rgba(255,255,255,0.055); }
.avpk-create-icon { width:44px; height:44px; border-radius:12px; background:rgba(255,255,255,0.09); display:flex; align-items:center; justify-content:center; }
.avpk-create-label { font-size:11.5px; font-weight:700; color:rgba(255,255,255,0.65); }

.avpk-empty { grid-column:1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:rgba(255,255,255,0.28); gap:10px; }
.avpk-empty-action { margin-top:4px; padding:8px 18px; border-radius:9px; background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.7); font-size:12px; font-weight:700; cursor:pointer; transition:all 0.2s; }
.avpk-empty-action:hover { background:rgba(255,255,255,0.12); color:#fff; }

.avpk-create-panel { flex:1; overflow-y:auto; padding:28px 36px; display:flex; flex-direction:column; gap:22px; }
.avpk-create-back { display:flex; align-items:center; gap:6px; background:none; border:none; color:rgba(255,255,255,0.5); font-size:13px; font-weight:600; cursor:pointer; padding:0; transition:color 0.2s; }
.avpk-create-back:hover { color:#fff; }
.avpk-create-title { font-size:19px; font-weight:800; color:#fff; letter-spacing:-0.3px; }
.avpk-mode-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.avpk-mode-card { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:20px 16px; display:flex; flex-direction:column; align-items:center; gap:10px; cursor:pointer; transition:all 0.2s; text-align:center; }
.avpk-mode-card:hover { background:rgba(255,255,255,0.07); border-color:rgba(255,255,255,0.14); }
.avpk-mode-card.active { border-color:#ec4899; background:rgba(236,72,153,0.07); }

.avpk-gen-form { display:flex; flex-direction:column; gap:13px; }
.avpk-gen-input { width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:11px 14px; color:#fff; font-size:14px; outline:none; transition:border-color 0.2s; font-family:inherit; box-sizing:border-box; }
.avpk-gen-input:focus { border-color:rgba(255,255,255,0.24); }
.avpk-gen-input::placeholder { color:rgba(255,255,255,0.28); }
.avpk-gen-textarea { resize:vertical; min-height:90px; }

/* Variant grid */
.avpk-var-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.avpk-var-slot {
    position:relative; aspect-ratio:9/16; border-radius:10px; overflow:hidden;
    background:rgba(255,255,255,0.04); border:1.5px solid rgba(255,255,255,0.08);
    transition:all 0.2s; cursor:default;
}
.avpk-var-slot.ready { cursor:pointer; }
.avpk-var-slot.ready:hover { border-color:rgba(255,255,255,0.22); transform:translateY(-2px); }
.avpk-var-slot.selected { border-color:#ec4899; box-shadow:0 0 0 3px rgba(236,72,153,0.18); }
.avpk-var-slot img { width:100%; height:100%; object-fit:cover; display:block; }
.avpk-var-slot .avpk-var-spinner { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
.avpk-var-slot .avpk-var-spinner span { animation:avpk-spin 1s linear infinite; font-size:22px; color:rgba(255,255,255,0.3); }
.avpk-var-check { position:absolute; top:5px; right:5px; width:18px; height:18px; background:#ec4899; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff; font-weight:900; }
.avpk-var-retry { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
.avpk-var-retry span.material-symbols-outlined { font-size:22px; color:rgba(239,68,68,0.55); }
.avpk-var-retry button { font-size:10px; font-weight:700; color:rgba(255,255,255,0.5); background:rgba(255,255,255,0.07); border:none; border-radius:6px; padding:4px 9px; cursor:pointer; }

/* Name input always visible */
.avpk-name-row { display:flex; flex-direction:column; gap:6px; }
.avpk-name-label { font-size:10px; font-weight:700; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:0.8px; }
.avpk-name-input { width:100%; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:9px; padding:10px 13px; color:#fff; font-size:13px; outline:none; font-family:inherit; box-sizing:border-box; transition:border-color 0.2s, opacity 0.2s; }
.avpk-name-input:focus { border-color:rgba(255,255,255,0.22); }
.avpk-name-input::placeholder { color:rgba(255,255,255,0.28); }
.avpk-name-input:disabled { opacity:0.38; cursor:not-allowed; }

.avpk-btn {
    padding:11px 22px; border-radius:10px; border:none;
    font-weight:800; font-size:13.5px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; gap:7px; transition:all 0.2s;
}
.avpk-btn.primary { background:linear-gradient(135deg,#ec4899,#f472b6); color:#fff; }
.avpk-btn.primary:hover { transform:translateY(-1px); box-shadow:0 8px 22px rgba(236,72,153,0.32); }
.avpk-btn.primary:disabled { opacity:0.4; cursor:default; transform:none; box-shadow:none; }
.avpk-btn.secondary { background:rgba(255,255,255,0.08); color:#fff; border:1px solid rgba(255,255,255,0.1); }
.avpk-btn.secondary:disabled { opacity:0.4; cursor:default; }

.avpk-hint { font-size:11px; color:rgba(255,255,255,0.28); text-align:center; }

@media (max-width:768px) {
    .avpk-modal { flex-direction:column; height:92vh; }
    .avpk-sidebar { width:100%; flex-direction:row; overflow-x:auto; padding:10px; border-right:none; border-bottom:1px solid rgba(255,255,255,0.06); }
    .avpk-grid { grid-template-columns:repeat(3,1fr); }
    .avpk-sb-title,.avpk-sb-divider,.avpk-sb-label { display:none; }
}
`

export default function AvatarPicker({ isOpen, onClose, onSelect, activeBrand }) {
    const [filter, setFilter] = useState('all')
    const [gender, setGender] = useState('all')
    const [search, setSearch] = useState('')
    const [myAvatars, setMyAvatars] = useState([])
    const [publicAvatars, setPublicAvatars] = useState([])
    const [loading, setLoading] = useState(true)

    const [showCreate, setShowCreate] = useState(false)
    const [createMode, setCreateMode] = useState(null)   // 'upload'|'generate'|'prompt'
    const [avatarName, setAvatarName] = useState('')

    // Generate state
    const [genOptions, setGenOptions] = useState({ origin:'south-asian', ageRange:'adult', genderExpression:'', clothingStyle:'smart-casual', environment:'minimalist', lightingMood:'natural-daylight', additionalDetails:'' })
    const [genErrors, setGenErrors] = useState({})
    const [directPrompt, setDirectPrompt] = useState('')
    const [genBusy, setGenBusy] = useState(false)
    // variants: [{slot,url,failed}] or [null,null,null] (skeleton)
    const [genVariants, setGenVariants] = useState([])
    const [genSelectedSlots, setGenSelectedSlots] = useState([])
    const [saveBusy, setSaveBusy] = useState(false)

    const fileRef = useRef(null)
    const [uploadBusy, setUploadBusy] = useState(false)

    // ── Load library from new canonical endpoint ────────────────────────────────
    const loadAvatars = useCallback(async () => {
        setLoading(true)
        try {
            const d = await api('/avatar-studio/library')
            let mine = d.myAvatars || []
            let pub  = d.publicAvatars || []

            if (search) {
                const q = search.toLowerCase()
                mine = mine.filter(a => (a.name||'').toLowerCase().includes(q))
                pub  = pub.filter(a  => (a.name||'').toLowerCase().includes(q))
            }
            if (gender !== 'all') {
                mine = mine.filter(a => a.gender === gender)
                pub  = pub.filter(a  => a.gender === gender)
            }
            if (filter === 'my') { pub = [] }

            setMyAvatars(mine)
            setPublicAvatars(pub)
        } catch { /* silent — never crash */ }
        setLoading(false)
    }, [filter, gender, search])

    useEffect(() => { if (isOpen) loadAvatars() }, [isOpen, loadAvatars])

    // ── Reset create state on close ─────────────────────────────────────────────
    const resetCreate = () => { setShowCreate(false); setCreateMode(null); setAvatarName(''); setDirectPrompt(''); setGenVariants([]); setGenSelectedSlots([]); setGenErrors({}) }
    const handleClose = () => { resetCreate(); onClose() }

    // ── Upload ──────────────────────────────────────────────────────────────────
    const handleUpload = useCallback(async (file) => {
        let nameToUse = avatarName.trim();
        if (!nameToUse) {
            nameToUse = file.name ? file.name.split('.')[0] : 'My Avatar';
            setAvatarName(nameToUse); // Auto-fill the name
        }
        setUploadBusy(true)
        try {
            const form = new FormData()
            form.append('avatarImage', file)
            form.append('name', nameToUse)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            await api('/video-studio/ugc-pro/avatars', { method:'POST', body:form, headers:{} })
            await loadAvatars(); resetCreate()
        } catch { }
        setUploadBusy(false)
    }, [avatarName, activeBrand, loadAvatars])

    // ── Generate ────────────────────────────────────────────────────────────────
    const handleGenerate = useCallback(async () => {
        const mode = createMode   // 'generate' = structured | 'prompt' = direct

        if (mode === 'generate' && !genOptions.genderExpression) {
            setGenErrors({ genderExpression:'Please select a gender expression' }); return
        }
        if (mode === 'prompt' && directPrompt.trim().length < 10) {
            setGenErrors({ directPrompt:'Prompt must be at least 10 characters' }); return
        }
        setGenErrors({})
        setGenBusy(true)
        // Show skeleton immediately
        setGenVariants([null, null])
        setGenSelectedSlots([])

        try {
            const body = mode === 'prompt'
                ? { mode:'directPrompt', directPrompt:directPrompt.trim(), brandId:activeBrand?._id }
                : { mode:'structured', ...genOptions, brandId:activeBrand?._id }

            const d = await api('/avatar-studio/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
            const variants = d.variants || []
            setGenVariants(variants)
            // Auto-select the first successful variant
            const firstOk = variants.find(v => !v.failed && v.url)
            if (firstOk) setGenSelectedSlots([firstOk.slot])
        } catch(err) {
            console.error('[AvatarPicker] Generate failed:', err.message)
            setGenVariants([{slot:0,failed:true},{slot:1,failed:true}])
        }
        setGenBusy(false)
    }, [createMode, genOptions, directPrompt, activeBrand])

    // ── Save selected variants ──────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        if (genSelectedSlots.length === 0 || !avatarName.trim()) return
        setSaveBusy(true)
        try {
            // Save each selected variant. If multiple, append #1, #2 to name
            const promises = genSelectedSlots.map((slot, index) => {
                const v = genVariants[slot]
                if (!v?.url) return null
                const saveName = genSelectedSlots.length > 1 ? `${avatarName.trim()} #${index + 1}` : avatarName.trim()
                return api('/avatar-studio/save', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body:JSON.stringify({ name:saveName, selectedUrl:v.url, generationMode:createMode==='prompt'?'directPrompt':'structured', options: createMode==='generate' ? genOptions : { directPrompt } })
                })
            })
            await Promise.all(promises.filter(Boolean))
            await loadAvatars(); resetCreate()
        } catch(err) { console.error('[AvatarPicker] Save failed:', err.message) }
        setSaveBusy(false)
    }, [genVariants, genSelectedSlots, avatarName, createMode, loadAvatars])

    // ── Select existing avatar ──────────────────────────────────────────────────
    const handleSelect = useCallback((avatar) => {
        onSelect({ _id:avatar._id, name:avatar.name, imageUrl:avatar.imageUrl })
        handleClose()
    }, [onSelect])

    // ── Use generated variant directly (bypass save) ────────────────────────────
    const handleUseNow = useCallback(() => {
        if (genSelectedSlots.length === 0) return
        // Use the first selected variant
        const v = genVariants[genSelectedSlots[0]]
        if (!v?.url) return
        onSelect({ _id:null, name:avatarName.trim() || 'AI Avatar', imageUrl:v.url })
        handleClose()
    }, [genVariants, genSelectedSlots, avatarName, onSelect])

    // ── Delete ──────────────────────────────────────────────────────────────────
    const handleDelete = useCallback(async (id, e) => {
        e.stopPropagation()
        if (!confirm('Delete this avatar?')) return
        try { await api(`/video-studio/ugc-pro/avatars/${id}`, { method:'DELETE' }); loadAvatars() } catch {}
    }, [loadAvatars])

    if (!isOpen) return null

    // ── Helpers ─────────────────────────────────────────────────────────────────
    const allAvatars = [...publicAvatars, ...myAvatars]
    const hasSelections = genSelectedSlots.length > 0
    const canSave = hasSelections && avatarName.trim().length > 0 && !saveBusy
    const canGenerate = !genBusy && (createMode === 'prompt' ? directPrompt.trim().length >= 10 : !!genOptions.genderExpression)

    return (
        <div className="avpk-backdrop" onClick={e => { if (e.target === e.currentTarget) handleClose() }}>
            <style>{css}</style>
            <div className="avpk-modal">

                {/* ── Sidebar ─────────────────────────────────────────────── */}
                <div className="avpk-sidebar">
                    <div className="avpk-sb-title">Avatars</div>

                    <button className={`avpk-sb-item ${filter==='all'&&gender==='all'?'active':''}`}
                        onClick={() => { setFilter('all'); setGender('all'); resetCreate() }}>
                        <span className="material-symbols-outlined">group</span> All
                    </button>
                    <button className={`avpk-sb-item ${filter==='my'?'active':''}`}
                        onClick={() => { setFilter('my'); setGender('all'); resetCreate() }}>
                        <span className="material-symbols-outlined">person</span> My avatars
                    </button>

                    <div className="avpk-sb-divider" />
                    <div className="avpk-sb-label">Gender</div>
                    <button className={`avpk-sb-item ${gender==='male'?'active':''}`}
                        onClick={() => { setGender(gender==='male'?'all':'male'); setFilter('all'); resetCreate() }}>
                        <span className="material-symbols-outlined">male</span> Male
                    </button>
                    <button className={`avpk-sb-item ${gender==='female'?'active':''}`}
                        onClick={() => { setGender(gender==='female'?'all':'female'); setFilter('all'); resetCreate() }}>
                        <span className="material-symbols-outlined">female</span> Female
                    </button>
                    <button className={`avpk-sb-item ${gender==='unspecified'?'active':''}`}
                        onClick={() => { setGender(gender==='unspecified'?'all':'unspecified'); setFilter('all'); resetCreate() }}>
                        <span className="material-symbols-outlined">transgender</span> Other
                    </button>
                </div>

                {/* ── Main ────────────────────────────────────────────────── */}
                <div className="avpk-main">
                    {/* Header */}
                    <div className="avpk-header">
                        <div className="avpk-search">
                            <span className="material-symbols-outlined" style={{ fontSize:17, color:'rgba(255,255,255,0.28)' }}>search</span>
                            <input placeholder="Search avatars…" value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <button className="avpk-close" onClick={handleClose}>
                            <span className="material-symbols-outlined" style={{ fontSize:17 }}>close</span>
                        </button>
                    </div>

                    {/* ── Create Flow ────────────────────────────────────── */}
                    {showCreate ? (
                        <div className="avpk-create-panel">
                            <button className="avpk-create-back" onClick={resetCreate}>
                                <span className="material-symbols-outlined" style={{ fontSize:17 }}>arrow_back</span> Back to gallery
                            </button>
                            <div className="avpk-create-title">Create Avatar</div>

                            {/* Mode picker */}
                            <div className="avpk-mode-row">
                                {[
                                    { id:'upload',   icon:'cloud_upload', color:'#a855f7', label:'Upload Photo',    sub:'Turn any photo into an avatar' },
                                    { id:'generate', icon:'tune',          color:'#ec4899', label:'Structured',      sub:'Full option selector · 9:16' },
                                    { id:'prompt',   icon:'edit_note',     color:'#14b8a6', label:'Direct Prompt',   sub:'Describe it yourself' },
                                ].map(m => (
                                    <div key={m.id} className={`avpk-mode-card ${createMode===m.id?'active':''}`} onClick={() => setCreateMode(m.id)}>
                                        <span className="material-symbols-outlined" style={{ fontSize:28, color:m.color }}>{m.icon}</span>
                                        <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{m.label}</div>
                                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.38)' }}>{m.sub}</div>
                                    </div>
                                ))}
                            </div>

                            {/* ── UPLOAD ───────────────────────────────── */}
                            {createMode === 'upload' && (
                                <div className="avpk-gen-form">
                                    <div className="avpk-name-row">
                                        <span className="avpk-name-label">Avatar Name</span>
                                        <input className="avpk-name-input" placeholder="e.g. @sarah" value={avatarName} onChange={e => setAvatarName(e.target.value)} />
                                    </div>
                                    <input type="file" ref={fileRef} accept="image/*" hidden onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                                    <button className="avpk-btn secondary" onClick={() => fileRef.current?.click()} disabled={uploadBusy}>
                                        <span className="material-symbols-outlined" style={{ fontSize:17 }}>add_photo_alternate</span>
                                        {uploadBusy ? 'Uploading…' : 'Choose photo'}
                                    </button>
                                    <div className="avpk-hint">JPG, PNG, WebP — portrait 9:16 recommended</div>
                                </div>
                            )}

                            {/* ── STRUCTURED GENERATE ──────────────────── */}
                            {createMode === 'generate' && (
                                <div className="avpk-gen-form">
                                    <AvatarOptionsForm options={genOptions} onChange={(k,v) => { setGenOptions(p=>({...p,[k]:v})); if(genErrors[k]) setGenErrors(p=>({...p,[k]:''})) }} errors={genErrors} compact={true} />

                                    {/* Name input — always visible, greyed out until variant selected */}
                                    <div className="avpk-name-row">
                                        <span className="avpk-name-label">Avatar Name</span>
                                        <input className="avpk-name-input" placeholder="Name this avatar…" value={avatarName} onChange={e => setAvatarName(e.target.value)} disabled={genVariants.length === 0 && !genBusy} />
                                    </div>

                                    <button className="avpk-btn primary" onClick={handleGenerate} disabled={!canGenerate}>
                                        <span className="material-symbols-outlined" style={{ fontSize:16, animation:genBusy?'avpk-spin 1s linear infinite':'none' }}>{genBusy?'progress_activity':'auto_awesome'}</span>
                                        {genBusy ? 'Generating 2 variants…' : 'Generate 2 Variants'}
                                    </button>

                                    {/* Variant grid — appears immediately as skeletons */}
                                    {(genBusy || genVariants.length > 0) && (
                                        <div className="avpk-var-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                            {[0,1].map(slot => {
                                                const v = genVariants[slot]
                                                const isSkel   = genBusy || v === null
                                                const isOk     = !isSkel && v && !v.failed && v.url
                                                const isFailed = !isSkel && v && v.failed
                                                const isSel    = genSelectedSlots.includes(slot)
                                                return (
                                                    <div key={slot}
                                                        className={`avpk-var-slot ${isOk?'ready':''} ${isSel?'selected':''}`}
                                                        onClick={() => {
                                                            if (!isOk) return;
                                                            if (isSel) setGenSelectedSlots(prev => prev.filter(s => s !== slot));
                                                            else setGenSelectedSlots(prev => [...prev, slot]);
                                                        }}>
                                                        {isSkel && (
                                                            <div className="avpk-var-spinner">
                                                                <span className="material-symbols-outlined">progress_activity</span>
                                                            </div>
                                                        )}
                                                        {isOk && <img src={v.url} alt={`Variant ${slot+1}`} />}
                                                        {isFailed && (
                                                            <div className="avpk-var-retry">
                                                                <span className="material-symbols-outlined">broken_image</span>
                                                                <button onClick={e => { e.stopPropagation(); handleGenerate() }}>Retry</button>
                                                            </div>
                                                        )}
                                                        {isSel && <div className="avpk-var-check">✓</div>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Save / Use buttons */}
                                    {hasSelections && (
                                        <div style={{ display:'flex', gap:8 }}>
                                            <button className="avpk-btn secondary" style={{ flex:1 }} onClick={handleUseNow}>
                                                <span className="material-symbols-outlined" style={{ fontSize:15 }}>check</span> Use Now
                                            </button>
                                            <button className="avpk-btn primary" style={{ flex:1 }} onClick={handleSave} disabled={!canSave}>
                                                <span className="material-symbols-outlined" style={{ fontSize:15 }}>{saveBusy?'progress_activity':'bookmark_add'}</span>
                                                {saveBusy ? 'Saving…' : `Save ${genSelectedSlots.length} to Library`}
                                            </button>
                                        </div>
                                    )}
                                    <div className="avpk-hint">2 variants · 9:16 portrait · 4 credits</div>
                                </div>
                            )}

                            {/* ── DIRECT PROMPT ─────────────────────────── */}
                            {createMode === 'prompt' && (
                                <div className="avpk-gen-form">
                                    <textarea className="avpk-gen-input avpk-gen-textarea"
                                        placeholder="Describe your avatar in detail — appearance, clothing, setting, mood…"
                                        value={directPrompt} onChange={e => setDirectPrompt(e.target.value)} rows={5} />
                                    {genErrors.directPrompt && <div style={{ color:'#f87171', fontSize:12 }}>{genErrors.directPrompt}</div>}

                                    {/* Name always visible */}
                                    <div className="avpk-name-row">
                                        <span className="avpk-name-label">Avatar Name</span>
                                        <input className="avpk-name-input" placeholder="Name this avatar…" value={avatarName} onChange={e => setAvatarName(e.target.value)} disabled={genVariants.length === 0 && !genBusy} />
                                    </div>

                                    <button className="avpk-btn primary" onClick={handleGenerate} disabled={!canGenerate}>
                                        <span className="material-symbols-outlined" style={{ fontSize:16, animation:genBusy?'avpk-spin 1s linear infinite':'none' }}>{genBusy?'progress_activity':'auto_awesome'}</span>
                                        {genBusy ? 'Generating 2 variants…' : 'Generate 2 Variants'}
                                    </button>

                                    {(genBusy || genVariants.length > 0) && (
                                        <div className="avpk-var-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                            {[0,1].map(slot => {
                                                const v = genVariants[slot]
                                                const isSkel   = genBusy || v === null
                                                const isOk     = !isSkel && v && !v.failed && v.url
                                                const isFailed = !isSkel && v && v.failed
                                                const isSel    = genSelectedSlots.includes(slot)
                                                return (
                                                    <div key={slot}
                                                        className={`avpk-var-slot ${isOk?'ready':''} ${isSel?'selected':''}`}
                                                        onClick={() => {
                                                            if (!isOk) return;
                                                            if (isSel) setGenSelectedSlots(prev => prev.filter(s => s !== slot));
                                                            else setGenSelectedSlots(prev => [...prev, slot]);
                                                        }}>
                                                        {isSkel && <div className="avpk-var-spinner"><span className="material-symbols-outlined">progress_activity</span></div>}
                                                        {isOk && <img src={v.url} alt={`Variant ${slot+1}`} />}
                                                        {isFailed && (
                                                            <div className="avpk-var-retry">
                                                                <span className="material-symbols-outlined">broken_image</span>
                                                                <button onClick={e => { e.stopPropagation(); handleGenerate() }}>Retry</button>
                                                            </div>
                                                        )}
                                                        {isSel && <div className="avpk-var-check">✓</div>}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {hasSelections && (
                                        <div style={{ display:'flex', gap:8 }}>
                                            <button className="avpk-btn secondary" style={{ flex:1 }} onClick={handleUseNow}>
                                                <span className="material-symbols-outlined" style={{ fontSize:15 }}>check</span> Use Now
                                            </button>
                                            <button className="avpk-btn primary" style={{ flex:1 }} onClick={handleSave} disabled={!canSave}>
                                                <span className="material-symbols-outlined" style={{ fontSize:15 }}>{saveBusy?'progress_activity':'bookmark_add'}</span>
                                                {saveBusy ? 'Saving…' : `Save ${genSelectedSlots.length} to Library`}
                                            </button>
                                        </div>
                                    )}
                                    <div className="avpk-hint">2 variants · 9:16 portrait · 4 credits · directPrompt mode</div>
                                </div>
                            )}
                        </div>
                    ) : (

                        /* ── Avatar Gallery ─────────────────────────────── */
                        <div className="avpk-grid">
                            {/* Create card — always first */}
                            <div className="avpk-create-card" onClick={() => setShowCreate(true)}>
                                <div className="avpk-create-icon">
                                    <span className="material-symbols-outlined" style={{ fontSize:22, color:'rgba(255,255,255,0.5)' }}>add</span>
                                </div>
                                <span className="avpk-create-label">Create avatar</span>
                            </div>

                            {/* Loading skeletons */}
                            {loading && [0,1,2,3].map(i => <div key={i} className="avpk-skeleton" />)}

                            {/* Empty states */}
                            {!loading && allAvatars.length === 0 && myAvatars.length === 0 && publicAvatars.length === 0 && (
                                <div className="avpk-empty">
                                    <span className="material-symbols-outlined" style={{ fontSize:40 }}>person_off</span>
                                    <div style={{ fontSize:14, fontWeight:700 }}>No avatars yet</div>
                                    <button className="avpk-empty-action" onClick={() => setShowCreate(true)}>
                                        Create your first avatar →
                                    </button>
                                </div>
                            )}

                            {/* Public (By Mantram) — teal pill */}
                            {!loading && publicAvatars.map(avatar => (
                                <div key={avatar._id} className="avpk-card" onClick={() => handleSelect(avatar)}>
                                    <img src={avatar.imageUrl} alt={avatar.name} loading="lazy" />
                                    <div className="avpk-badge-platform">By Mantram</div>
                                    <div className="avpk-card-overlay">
                                        <span className="avpk-card-name">{avatar.name||'Avatar'}</span>
                                        <button className="avpk-card-select" onClick={e => { e.stopPropagation(); handleSelect(avatar) }}>Select</button>
                                    </div>
                                </div>
                            ))}

                            {/* User's own avatars */}
                            {!loading && myAvatars.map(avatar => (
                                <div key={avatar._id} className="avpk-card" onClick={() => handleSelect(avatar)}>
                                    <img src={avatar.imageUrl} alt={avatar.name} loading="lazy" />
                                    <div className="avpk-card-overlay">
                                        <span className="avpk-card-name">{avatar.name||'Avatar'}</span>
                                        <button className="avpk-card-select" onClick={e => { e.stopPropagation(); handleSelect(avatar) }}>Select</button>
                                    </div>
                                    <div className="avpk-card-actions">
                                        <button className="avpk-card-action" onClick={e => handleDelete(avatar._id, e)} title="Delete">
                                            <span className="material-symbols-outlined" style={{ fontSize:13 }}>delete</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

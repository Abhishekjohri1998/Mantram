import { useState, useEffect, useRef, useCallback } from 'react'
import AvatarPicker from './AvatarPicker'
import PublishModal from '../PublishModal'
import VideoHoverActions from './VideoHoverActions'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const isFormData = opts.body instanceof FormData
    const headers = isFormData ? { Authorization: `Bearer ${token}`, ...(opts.headers||{}) } : { 'Content-Type':'application/json', Authorization:`Bearer ${token}`, ...(opts.headers||{}) }
    const res = await fetch(`${API_BASE}${path}`, { ...opts, headers })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server error ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}
import ViralityMiniPanel from '../ViralityMiniPanel'

const DURS = [{value:5,label:'5s',msIcon:'timer'},{value:8,label:'8s',msIcon:'timer'},{value:10,label:'10s',msIcon:'timer'},{value:15,label:'15s',msIcon:'timer'},{value:20,label:'20s',msIcon:'timer'},{value:30,label:'30s',msIcon:'movie'},{value:45,label:'45s',msIcon:'movie'},{value:60,label:'60s',msIcon:'movie'},{value:90,label:'90s',msIcon:'movie'},{value:120,label:'120s',msIcon:'movie'}]
const FMTS = [{value:'9:16',label:'9:16',msIcon:'crop_portrait'},{value:'16:9',label:'16:9',msIcon:'crop_landscape'},{value:'1:1',label:'1:1',msIcon:'crop_square'}]
const RES = [
    {value:'480p',label:'480p',msIcon:'sd'},
    {value:'720p',label:'720p',msIcon:'sd'},
    {value:'1080p',label:'1080p',msIcon:'hd'},
    {value:'4k',label:'4K',msIcon:'4k'}
]
const VIDEO_MODELS = [
    {value:'seedance-2.0',label:'Seedance 2.0',msIcon:'local_movies'},
    {value:'seedance-2.0-fast',label:'Seedance 2.0 Fast',msIcon:'bolt'},
    {value:'seedance-2.0-mini',label:'Seedance 2.0 Mini',msIcon:'bolt'},
    {value:'happyhorse-1.0',label:'HappyHorse 1.0',msIcon:'pets'},
    {value:'happyhorse-1.1',label:'HappyHorse 1.1',msIcon:'pets'},
    {value:'gemini-flash',label:'Gemini Flash Video',msIcon:'flash_on'},
    {value:'grok-imagine',label:'Grok Imagine',msIcon:'smart_toy'},
    {value:'kling-3.0',label:'Kling 3.0',msIcon:'videocam'},
    {value:'kling-3.0-o',label:'Kling Omni',msIcon:'auto_awesome'},
    {value:'veo-3.1',label:'Veo 3.1',msIcon:'movie'},
    {value:'veo-3.1-fast',label:'Veo 3.1 Fast',msIcon:'bolt'},
    {value:'veo-3.1-lite',label:'Veo 3.1 Lite',msIcon:'movie'},
    {value:'seedance-1.0',label:'Seedance 1.0',msIcon:'speed'},
]

// --- Internal Component to prevent massive re-renders on keystroke ---
const DebouncedInput = ({ value, onChange, placeholder, className, disabled }) => {
    const [local, setLocal] = useState(value || '');
    useEffect(() => { setLocal(value || '') }, [value]);
    return (
        <input 
            type="text" 
            className={className}
            placeholder={placeholder}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => { if (local !== value) onChange(local) }}
            onKeyDown={e => { if (e.key === 'Enter' && local !== value) onChange(local) }}
            disabled={disabled}
        />
    )
}

const LANGUAGES = [
    {value:'English',label:'English',msIcon:'translate'},
    {value:'Hindi',label:'Hindi',msIcon:'translate'},
    {value:'Tamil',label:'தமிழ்',msIcon:'translate'},
    {value:'Telugu',label:'తెలుగు',msIcon:'translate'},
    {value:'Kannada',label:'ಕನ್ನಡ',msIcon:'translate'},
    {value:'Malayalam',label:'മലയാളം',msIcon:'translate'},
    {value:'Bengali',label:'বাংলা',msIcon:'translate'},
    {value:'Marathi',label:'मराठी',msIcon:'translate'},
    {value:'Gujarati',label:'ગુજરાતી',msIcon:'translate'},
    {value:'Punjabi',label:'ਪੰਜਾਬੀ',msIcon:'translate'},
    {value:'Urdu',label:'اردو',msIcon:'translate'},
    {value:'Arabic',label:'العربية',msIcon:'translate'},
]

const css = `
.qv2-root {
    --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent);
    --sys-surface-raised: color-mix(in srgb, var(--sys-text) 6%, var(--sys-surface));
    --sys-surface-hover: color-mix(in srgb, var(--sys-text) 10%, var(--sys-surface));
    position: relative;
    width: 100%;
    min-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    align-items: center;
    background: radial-gradient(circle at center top, var(--sys-primary-dim) 0%, var(--sys-surface) 50%);
    padding-top: 40px;
    padding-bottom: 40px;
}
.qv2-bg {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
    width: 100%;
    max-width: 1200px;
    padding: 24px 0;
    opacity: .9;
}
.qv2-bi {
    aspect-ratio: 9/16;
    border-radius: 12px;
    overflow: hidden;
    background: var(--sys-surface);
    border: 1px solid var(--sys-border);
    position: relative;
}
.qv2-bi video {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
}
.qv2-bi:hover {
    transform: scale(1.02);
    z-index: 2;
    box-shadow: 0 10px 30px rgba(0,0,0,.5);
}
.qv2-bi-ov {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 40%);
    opacity: 0;
    transition: opacity 0.2s;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 12px;
}
.qv2-bi:hover .qv2-bi-ov {
    opacity: 1;
}
.qv2-bi-btn {
    background: rgba(255,255,255,0.15);
    backdrop-filter: blur(4px);
    border: none;
    border-radius: 16px;
    height: 28px;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0 10px;
    font-size: 11px;
    font-weight: 700;
    gap: 4px;
}
.qv2-bi-btn:hover {
    background: rgba(255,255,255,0.3);
    transform: scale(1.05);
}
.qv2-bi-btn.preview-btn {
    background: rgba(255, 77, 0, 0.6);
}
.qv2-bi-btn.preview-btn:hover {
    background: rgba(255, 77, 0, 0.85);
}
.qv2-bi-btn.template-btn {
    background: rgba(99, 102, 241, 0.5);
}
.qv2-bi-btn.template-btn:hover {
    background: rgba(99, 102, 241, 0.8);
}
.qv2-lay {
    width: 100%;
    max-width: 1200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 16px;
    gap: 32px;
}

/* Scott Box Panel */
.scott-panel {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    max-width: 900px;
    width: 100%;
    backdrop-filter: blur(20px);
}
.scott-input-wrapper {
    display: flex;
    align-items: center;
    background: rgba(255,255,255,0.05);
    border-radius: 12px;
    flex: 1;
    padding: 0 12px;
    border: 1px solid rgba(255,255,255,0.05);
}
.scott-input-wrapper:focus-within {
    border-color: rgba(255,255,255,0.2);
}
.scott-input {
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 14px;
    width: 100%;
    padding: 12px 0;
    font-family: inherit;
}
.scott-input::placeholder {
    color: rgba(255,255,255,0.4);
}
.scott-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-right: -4px;
}
.scott-btn-cfg {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: 8px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.8);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
}
.scott-btn-cfg:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
}
.scott-btn-cfg .material-symbols-outlined {
    font-size: 16px;
}

.scott-block-btn {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    background: #2a2a2a;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: rgba(255,255,255,0.8);
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    position: relative;
    overflow: hidden;
}
.scott-block-btn:hover {
    background: #333;
    border-color: rgba(255,255,255,0.2);
    color: #fff;
}
.scott-block-btn.active {
    border-color: #10b981;
    color: #10b981;
}
.scott-block-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.6;
}
.scott-block-btn.active .scott-block-img {
    opacity: 1;
}

.scott-generate {
    background: var(--sys-primary);
    color: #fff;
    border: none;
    border-radius: 12px;
    padding: 0 24px;
    height: 72px;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
}
.scott-generate:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(255, 77, 0, 0.4);
}
.scott-generate:disabled {
    background: #444;
    color: #888;
    cursor: default;
    transform: none;
    box-shadow: none;
}

/* Modals */
.scott-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.8);
    backdrop-filter: blur(5px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    animation: qv2-fade-in 0.2s forwards;
}
@keyframes qv2-fade-in { to { opacity: 1; } }
.scott-modal {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    width: 100%;
    max-width: 800px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 48px rgba(0,0,0,0.6);
    overflow: hidden;
}
.scott-modal-hdr {
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}
.scott-modal-close {
    width: 32px; height: 32px;
    border-radius: 16px;
    background: rgba(255,255,255,0.1);
    border: none;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.2s;
}
.scott-modal-close:hover {
    background: rgba(255,255,255,0.2);
}

/* Avatar Modal Specifics */
.avatar-modal-body {
    padding: 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}
.avatar-card {
    background: #222;
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    position: relative;
    overflow: hidden;
}
.avatar-preview {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
}

/* Category Grid */
.cat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 24px;
    overflow-y: auto;
}
.cat-card {
    aspect-ratio: 3/4;
    border-radius: 12px;
    background: #2a2a2a;
    border: 2px solid transparent;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: all 0.2s;
    padding: 12px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
}
.cat-card:hover {
    border-color: rgba(255,255,255,0.3);
}
.cat-card.active {
    border-color: #10b981;
}
.cat-card-ov {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%);
    z-index: 1;
}

/* Template Cards — Higgsfield-style looping video */
.qv2-temp-card {
    flex: 0 0 180px;
    height: 280px;
    border-radius: 14px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    border: 1px solid rgba(255,255,255,0.08);
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.qv2-temp-card:hover {
    transform: scale(1.04);
    border-color: var(--sys-primary);
    box-shadow: 0 12px 32px rgba(255, 77, 0, 0.2);
}
.qv2-temp-card video,
.qv2-temp-card img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.qv2-temp-card .overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%);
    transition: opacity 0.2s;
}
.qv2-temp-name {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    z-index: 2;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    line-height: 1.3;
}
.qv2-temp-btn {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0,0,0,0.5);
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 3;
}
.qv2-temp-card:hover .qv2-temp-btn {
    opacity: 1;
}
.qv2-temp-btn span {
    background: var(--sys-primary);
    color: #fff;
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
}
/* Category pills for template section */
.qv2-cat-pills {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
}
.qv2-cat-pill {
    padding: 5px 14px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}
.qv2-cat-pill:hover {
    border-color: rgba(255,255,255,0.3);
    color: #fff;
}
.qv2-cat-pill.active {
    border-color: var(--sys-primary);
    color: var(--sys-primary);
    background: var(--sys-primary-dim);
}

/* Active Output Card */
.scott-output-card {
    width: 100%;
    max-width: 900px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 16px;
    backdrop-filter: blur(20px);
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}

@keyframes spin { 100% { transform: rotate(360deg); } }
.spin { animation: spin 1s linear infinite; }
`;

function CfgMenu({ value, onChange, options, icon }) {
    const [open, setOpen] = useState(false); const ref = useRef(null)
    useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [])
    const sel = options.find(o => {
        const oVal = o.value !== undefined ? o.value : o;
        if (oVal == value) return true;
        if ((oVal === 'gemini-flash' || oVal === 'gemini-omni-flash') &&
            (value === 'gemini-flash' || value === 'gemini-omni-flash')) {
            return true;
        }
        return false;
    }) || options[0]
    return <div style={{ position: 'relative', flexShrink: 0 }} ref={ref}>
        <button type="button" className="scott-btn-cfg" onClick={() => setOpen(!open)} style={{ flexShrink: 0 }}>
            {icon && <span className="material-symbols-outlined">{icon}</span>}
            <span>{sel?.label || value}</span>
        </button>
        {open && <div className="qv2-cmenu" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 8, zIndex: 9999, minWidth: 100, maxHeight: 300, overflowY: 'auto' }}>
            {options.map(o => {
                const oVal = o.value !== undefined ? o.value : o;
                const isSelected = oVal == value ||
                    ((oVal === 'gemini-flash' || oVal === 'gemini-omni-flash') &&
                     (value === 'gemini-flash' || value === 'gemini-omni-flash'));
                return <button
                    key={oVal}
                    type="button"
                    className="qv2-copt"
                    style={{
                        width: '100%',
                        padding: '8px',
                        background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: 'none',
                        color: isSelected ? '#10b981' : '#fff',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: 6,
                        fontWeight: isSelected ? '700' : 'normal'
                    }}
                    onClick={() => {
                        onChange(oVal);
                        setOpen(false);
                    }}
                >
                    {o.label || o}
                </button>
            })}
        </div>}
    </div>
}

// ── Save as Template Form (used in admin modal) ─────────────────────────────
function SaveTemplateForm({ project, onClose, api: apiFn }) {
    const [name, setName] = useState(project.title || 'Q-Ads Video Template')
    const [categories, setCategories] = useState([])
    const [categoryId, setCategoryId] = useState('')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)

    useEffect(() => {
        apiFn('/superadmin/templates/categories').then(d => {
            if (d.categories) setCategories(d.categories)
        }).catch(() => {})
    }, [apiFn])

    const handleSave = async (e) => {
        e.preventDefault()
        if (!name.trim() || !categoryId) return setError('Name and category are required')
        setSaving(true)
        setError('')
        try {
            await apiFn('/superadmin/templates/promote-from-job', {
                method: 'POST',
                body: JSON.stringify({
                    sourceJobId: project._id,
                    sourceType: 'VideoProject',
                    name: name.trim(),
                    categoryId,
                    description,
                    studioOrigin: 'video',
                    tags: ['q-ads', 'video'],
                })
            })
            setSuccess(true)
            setTimeout(() => onClose(), 1500)
        } catch (err) {
            setError(err.message || 'Failed to save template')
        } finally {
            setSaving(false)
        }
    }

    if (success) {
        return (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#22c55e', marginBottom: 8 }}>check_circle</span>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Saved as template draft!</p>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Activate it in Super Admin › Template Manager</p>
            </div>
        )
    }

    return (
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Video preview thumbnail */}
            {project.generation?.videoUrl && (
                <div style={{ borderRadius: 10, overflow: 'hidden', aspectRatio: '16/9', maxHeight: 160, background: '#000' }}>
                    <video src={project.generation.videoUrl} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Template Name
                <input value={name} onChange={e => setName(e.target.value)} required style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Category
                <select value={categoryId} onChange={e => setCategoryId(e.target.value)} required style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none' }}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Description (optional)
                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, outline: 'none' }} />
            </label>
            {error && <p style={{ color: '#ef4444', fontSize: 12, margin: 0 }}>{error}</p>}
            <button type="submit" disabled={saving} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1, marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{saving ? 'progress_activity' : 'bookmark_add'}</span>
                {saving ? 'Saving...' : 'Save as Template'}
            </button>
        </form>
    )
}

function GridVideo({ project, onPreview, onSaveTemplate, isAdmin }) {
    const vRef = useRef(null)
    const videoUrl = project.generation?.videoUrl || project.finalVideoUrl
    return <div className="qv2-bi has-vha" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => onPreview?.(videoUrl)}>
        <video ref={vRef} src={videoUrl} muted autoPlay loop playsInline />
        <VideoHoverActions videoUrl={videoUrl} onPreview={onPreview} project={project} />
        <div className="qv2-bi-ov">
            {isAdmin && (
                <button className="qv2-bi-btn template-btn" onClick={(e) => { e.stopPropagation(); onSaveTemplate(project); }}>
                    <span className="material-symbols-outlined" style={{fontSize: 14}}>bookmark_add</span>
                    Template
                </button>
            )}
        </div>
    </div>
}

export default function QAdsV2({ activeBrand, projects = [], projectsLoaded = false, onVideoComplete, initialTemplateId, canCreateVideo = true, onUpgradeRequired, user }) {
    const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'
    const [previewVideo, setPreviewVideo] = useState(null)
    const [savingTemplate, setSavingTemplate] = useState(null)
    const [categories, setCategories] = useState([])
    const [presets, setPresets] = useState([])
    const [templates, setTemplates] = useState([])
    const [templateCategories, setTemplateCategories] = useState([])
    const [selectedTemplateCategory, setSelectedTemplateCategory] = useState('all')
    const [selP, setSelP] = useState(null)
    const [selectedCategory, setSelectedCategory] = useState(null)
    const [productUrl, setProductUrl] = useState('')
    const [productData, setProductData] = useState(null)
    const [productImgs, setProductImgs] = useState([])
    const [avatarUrl, setAvatarUrl] = useState(null)
    const [avatarDesc, setAvatarDesc] = useState('')
    const [avatarBusy, setAvatarBusy] = useState(false)
    const [duration, setDuration] = useState(5)
    const [format, setFormat] = useState('9:16')
    const [resolution, setResolution] = useState('480p')
    const [selectedModel, setSelectedModel] = useState('seedance-2.0-fast')
    const [userBrief, setUserBrief] = useState('')
    const [hookShot, setHookShot] = useState(false)
    const [language, setLanguage] = useState(() => {
        const brandLang = activeBrand?.dna?.defaultLanguage
        if (brandLang) {
            const match = LANGUAGES.find(l => l.value.toLowerCase() === brandLang.toLowerCase())
            return match ? match.value : 'English'
        }
        return 'English'
    })

    const getCredits = (modelId, dur, res) => {
        const d = parseInt(dur) || 8;
        const r = res || '720p';
        const m = modelId || 'seedance-2.0';
        
        let costPerSec = 0.23;
        if (m === 'seedance-2.0-fast') costPerSec = 0.1536;
        else if (m === 'seedance-2.0-mini') costPerSec = 0.08;
        else if (m === 'seedance-1.0') costPerSec = 0.08;
        else if (m === 'happyhorse-1.0' || m === 'happyhorse-1.1') costPerSec = 0.15;
        else if (m === 'gemini-flash' || m === 'gemini-omni-flash') costPerSec = 0.15;
        else if (m === 'kling-3.0') costPerSec = 0.07;
        else if (m === 'veo-3.1') costPerSec = 0.10;
        else if (m === 'veo-3.1-lite') costPerSec = 0.05;
        else if (m === 'grok-imagine') costPerSec = 0.08;
        
        let resMult = 1.0;
        const ATLAS_MODELS = ['seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini', 'happyhorse-1.0', 'happyhorse-1.1', 'gemini-flash', 'gemini-omni-flash', 'veo-3.1-lite'];
        if (ATLAS_MODELS.includes(m)) {
            if (r === '480p') resMult = 0.5;
            else if (r === '720p') resMult = 0.6;
            else if (r === '1080p') resMult = 1.0;
            else if (r === '4k') resMult = 2.0;
        } else {
            if (r === '480p') resMult = 0.5;
            else if (r === '720p') resMult = 0.7;
            else if (r === '4k') resMult = 2.0;
        }
        
        const usd = costPerSec * d * resMult;
        return Math.max(Math.ceil(usd * 20), 5);
    };

    // Modals
    const [showAvatar, setShowAvatar] = useState(false)
    const [showCats, setShowCats] = useState(false)
    const [showProduct, setShowProduct] = useState(false)
    const prodRef = useRef(null)
    const fileRef = useRef(null)
    const prodImgRef = useRef(null)  // product image file upload
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isAnalyzingAssets, setIsAnalyzingAssets] = useState(false)
    const [publishUrl, setPublishUrl] = useState('')

    // Prompt generation state (3 variants)
    const [isGeneratingPrompts, setIsGeneratingPrompts] = useState(false)
    const [promptStage, setPromptStage] = useState('')
    const [variants, setVariants] = useState([])   // [{ variantId, prompt, legend }]
    const [legend, setLegend] = useState('')

    // Per-variant video generation state
    // { A: { status, progress, videoUrl, jobId, error }, B: {...}, C: {...} }
    const [videoJobs, setVideoJobs] = useState({}) // { [variantId]: { status, progress, videoUrl, jobId } }
    const pollRefs = useRef({})

    // Fetch history on mount to ensure latest projects are visible (especially if user switched tabs and returned)
    useEffect(() => {
        if (onVideoComplete) onVideoComplete();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Hydrate both generating and completed projects into videoJobs to resume polling or display completed videos if user switched tabs
    useEffect(() => {
        if (!projects || projects.length === 0) return;
        
        const relevantProjects = projects.filter(p => 
            p.studioMode === 'q-ads-v2' || p.title?.startsWith('Q-Ad')
        );
        
        if (relevantProjects.length > 0) {
            setVideoJobs(prev => {
                const updated = { ...prev };
                let changed = false;
                
                relevantProjects.forEach(p => {
                    const variantId = p.title?.match(/Variant ([A-Z0-9])/i)?.[1] || p._id; 
                    const jobId = p.generation?.requestId || p.generation?.taskId || p.generation?.falRequestId || p._id;
                    const isGenerating = (p.status === 'generating' || p.generation?.status === 'GENERATING') && !p.generation?.videoUrl && !p.finalVideoUrl;
                    const hasVideo = p.finalVideoUrl || p.generation?.videoUrl;
                    
                    if (isGenerating && jobId && !updated[variantId]) {
                        updated[variantId] = {
                            status: 'generating',
                            progress: p.generation?.progress || 10,
                            jobId,
                            projectId: p._id
                        };
                        changed = true;
                    } else if (!isGenerating && hasVideo && !updated[variantId]) {
                        updated[variantId] = {
                            status: 'done',
                            progress: 100,
                            jobId,
                            projectId: p._id,
                            videoUrl: p.finalVideoUrl || p.generation?.videoUrl
                        };
                        changed = true;
                    }
                });
                
                return changed ? updated : prev;
            });
        }
    }, [projects]);

    const [error, setError] = useState(null)

    useEffect(() => {
        api('/video-studio/ugc-pro/qads/v2/presets').then(d => {
            setPresets(d.presets || [])
            setCategories(d.categories || [])
            if (d.presets?.length > 0 && !selP) setSelP(d.presets[0].id)
        }).catch(() => {})

        const fetchTemplates = () => {
            api('/templates/by-section/video_qads?limit=50').then(d => {
                const tpls = d.templates || []
                setTemplates(tpls)
                // Extract unique categories from templates
                const cats = [...new Set(tpls.map(t => t.categoryId?.name).filter(Boolean))]
                setTemplateCategories(cats)
            }).catch(() => {})
        }

        fetchTemplates()

        // Poll every 5s if any template is still pending
        const interval = setInterval(() => {
            setTemplates(current => {
                const pending = current.filter(t => t.previewUrl === 'pending' && t.sourceJobId);
                if (pending.length > 0) {
                    let updated = false;
                    Promise.all(pending.map(async (t) => {
                        try {
                            const res = await api(`/superadmin/templates/generate/status/${t.sourceJobId}`);
                            if (res.status === 'COMPLETED' || res.status === 'FAILED') {
                                updated = true;
                            }
                        } catch (e) {
                            console.warn(`Poll error for template ${t._id}:`, e.message);
                        }
                    })).then(() => {
                        if (updated) fetchTemplates();
                    });
                }
                return current;
            });
        }, 5000);

        return () => clearInterval(interval);
    }, [])

    // Handle template click — pre-fill all fields from templateAssets or flat fields
    const handleTemplateClick = useCallback((template) => {
        // 1. Fill the prompt/brief input
        setUserBrief(template.promptTemplate || template.savedPrompt || '')

        // 2. Pre-fill from structured templateAssets (preferred) or fallback flat fields
        const assets = template.templateAssets || []
        const productAssets = assets.filter(a => a.role === 'product').map(a => a.url).filter(Boolean)
        const avatarAsset = assets.find(a => a.role === 'avatar')

        if (productAssets.length > 0) {
            setProductImgs(productAssets)
        } else if (template.savedProductImageUrls?.length > 0) {
            setProductImgs(template.savedProductImageUrls)
        }

        if (template.savedProductUrl) {
            setProductUrl(template.savedProductUrl)
        }

        // 3. Pre-fill avatar
        if (avatarAsset?.url) {
            setAvatarUrl(avatarAsset.url)
        } else if (template.savedAvatarUrl) {
            setAvatarUrl(template.savedAvatarUrl)
        }

        // 4. Pre-fill video settings
        if (template.savedVideoSettings) {
            if (template.savedVideoSettings.duration) setDuration(template.savedVideoSettings.duration)
            if (template.savedVideoSettings.format) setFormat(template.savedVideoSettings.format)
            if (template.savedVideoSettings.model) setSelectedModel(template.savedVideoSettings.model)
            if (template.savedVideoSettings.presetId) setSelP(template.savedVideoSettings.presetId)
            if (template.savedVideoSettings.hookShot !== undefined) setHookShot(template.savedVideoSettings.hookShot)
        }
    }, [])

    const hasHydratedRef = useRef(false);
    useEffect(() => {
        if (initialTemplateId && templates.length > 0 && !hasHydratedRef.current) {
            const matched = templates.find(t => t._id === initialTemplateId);
            if (matched) {
                handleTemplateClick(matched);
                hasHydratedRef.current = true;
            }
        }
    }, [initialTemplateId, templates, handleTemplateClick]);

    const handleAvatarUpload = useCallback(async file => {
        setAvatarBusy(true); setError(null)
        try {
            const form = new FormData(); form.append('avatarImage', file)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: form, headers: {} })
            setAvatarUrl(d.avatarUrl)
            setShowAvatar(false) // Auto-close modal after successful upload
        } catch (e) { setError(e.message) }
        setAvatarBusy(false)
    }, [activeBrand])

    const handleAvatarGenerate = useCallback(async () => {
        if (!avatarDesc.trim()) { setError('Describe your avatar'); return }
        setAvatarBusy(true); setError(null)
        try {
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: JSON.stringify({ brandId: activeBrand?._id, description: avatarDesc, environment: 'home' }) })
            setAvatarUrl(d.avatarUrl)
            setShowAvatar(false) // Auto-close modal after successful generation
        } catch (e) { setError(e.message) }
        setAvatarBusy(false)
    }, [avatarDesc, activeBrand])

    // Upload product image directly (no URL needed)
    const handleProductImageUpload = useCallback(async (file) => {
        setIsAnalyzing(true); setError(null)
        try {
            const form = new FormData()
            form.append('avatarImage', file) // reuse the upload endpoint
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/generate-avatar', { method: 'POST', body: form, headers: {} })
            setProductImgs(prev => [d.avatarUrl, ...prev])
        } catch (e) { setError(e.message) }
        setIsAnalyzing(false)
    }, [activeBrand])

    // Analyze product URL and fetch data
    const handleAnalyze = useCallback(async () => {
        if (!productUrl.trim()) { setError('Enter a product URL first'); return }
        setIsAnalyzing(true); setError(null)
        try {
            const form = new FormData()
            form.append('productUrl', productUrl)
            if (activeBrand?._id) form.append('brandId', activeBrand._id)
            const d = await api('/video-studio/ugc-pro/analyze-product', { method: 'POST', body: form, headers: {} })
            setProductData(d.productData)
            setProductImgs(prev => {
                const newImgs = d.productImageUrls || [];
                const merged = [...prev];
                newImgs.forEach(img => { if (!merged.includes(img)) merged.push(img) });
                return merged;
            });
            setShowProduct(false) // Auto-close modal after successful analysis
        } catch (e) { setError(e.message) }
        setIsAnalyzing(false)
    }, [productUrl, activeBrand])

    // Deep Visual Analysis of Assets (Prompt Enhancement)
    const analyzeAssets = useCallback(async () => {
        if (!productImgs.length && !avatarUrl) {
            setError('Please upload a product or avatar image first to generate a smart direction.');
            return;
        }
        setIsAnalyzingAssets(true);
        setError(null);
        try {
            const res = await api('/video-studio/ugc-pro/qads/v2/analyze-assets', {
                method: 'POST',
                body: JSON.stringify({
                    productImageUrls: productImgs,
                    avatarUrl: avatarUrl,
                    brandName: activeBrand?.name,
                    userBrief: userBrief || '',
                    productData: productData || null,
                })
            });
            if (res.prompt) {
                setUserBrief(res.prompt);
            }
        } catch (e) {
            setError('Failed to analyze assets: ' + e.message);
        } finally {
            setIsAnalyzingAssets(false);
        }
    }, [productImgs, avatarUrl, activeBrand, userBrief, productData]);


    // Step 1 — Generate 3 prompt variants (single Claude call)
    const generatePrompts = useCallback(async () => {
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        if (!selP) { setError('Select a format first.'); return }
        setIsGeneratingPrompts(true); setError(null); setVariants([]); setLegend(''); setVideoJobs({})

        try {
            let pData = productData
            let pImgs = productImgs

            if (!pData && productUrl.trim()) {
                setPromptStage('Analyzing product...')
                const form = new FormData()
                form.append('productUrl', productUrl)
                if (activeBrand?._id) form.append('brandId', activeBrand._id)
                const d = await api('/video-studio/ugc-pro/analyze-product', { method: 'POST', body: form, headers: {} })
                pData = d.productData;
                const newImgs = d.productImageUrls || [];
                pImgs = [...pImgs];
                newImgs.forEach(img => { if (!pImgs.includes(img)) pImgs.push(img) });
                setProductData(pData); setProductImgs(pImgs)
            }

            setPromptStage('Writing cinematic variant...')
            const res = await api('/video-studio/ugc-pro/qads/v2/generate-prompts', {
                method: 'POST',
                body: JSON.stringify({
                    brandId: activeBrand?._id,
                    presetId: selP,
                    userBrief,
                    productData: pData,
                    settings: { duration, format, resolution, model: selectedModel, hookShot, language },
                    avatarUrl: avatarUrl || null,
                    productImageUrls: pImgs
                })
            })

            setVariants(res.variants || [])
            setLegend(res.variants?.[0]?.legend || '')
        } catch (e) {
            setError(e.message)
        } finally {
            setIsGeneratingPrompts(false)
            setPromptStage('')
        }
    }, [selP, userBrief, productData, productUrl, productImgs, duration, format, resolution, selectedModel, hookShot, language, avatarUrl, activeBrand])

    // Step 2 — Generate video for one variant
    const generateVideo = useCallback(async (variant) => {
        if (!canCreateVideo) { onUpgradeRequired?.(); return }
        const vid = variant.variantId
        setVideoJobs(prev => ({ ...prev, [vid]: { status: 'generating', progress: 3 } }))
        setError(null)

        const isLongForm = duration > 15

        try {
            let jobId

            if (isLongForm) {
                // ═══ LONG-FORM ROUTE (30–120s) ═══
                const res = await api('/video-studio/long-form/generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        targetDuration: duration,
                        model: selectedModel,
                        prompt: variant.prompt,
                        referenceImages: [...(productImgs || []), ...(avatarUrl ? [avatarUrl] : [])],
                        imageRole: avatarUrl ? 'character' : 'product',
                        language,
                        aspectRatio: format,
                        settings: { resolution, quality: 'high', hookShot },
                        brandId: activeBrand?._id,
                        productData,
                        bgmPreset: 'cinematic',
                    })
                })
                jobId = res.jobId
                setVideoJobs(prev => ({ ...prev, [vid]: { status: 'generating', progress: 5, jobId, isLongForm: true, segments: res.segments, estimatedMinutes: res.estimatedMinutes } }))

                // Long-form polling — uses dedicated status endpoint with phase tracking
                pollRefs.current[vid] = setInterval(async () => {
                    try {
                        const d = await api(`/video-studio/long-form/status/${jobId}`)
                        if (d) {
                            const status = d.status === 'COMPLETED' ? 'done'
                                : d.status === 'FAILED' ? 'failed'
                                : d.status === 'CANCELLED' ? 'failed'
                                : 'generating'
                            setVideoJobs(prev => ({
                                ...prev,
                                [vid]: {
                                    ...prev[vid],
                                    status,
                                    progress: d.progress || prev[vid]?.progress,
                                    videoUrl: d.videoUrl || prev[vid]?.videoUrl,
                                    error: (d.error && (d.error.includes('Network request timed out') || d.error.includes('504'))) ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : d.error,
                                    phaseLabel: d.phaseLabel || prev[vid]?.phaseLabel,
                                    detail: d.detail || '',
                                    scenes: d.scenes || prev[vid]?.scenes,
                                }
                            }))
                            if (status === 'done' || status === 'failed') {
                                clearInterval(pollRefs.current[vid])
                                if (status === 'done' && onVideoComplete) onVideoComplete()
                            }
                        }
                    } catch (_) {}
                }, 5000)

            } else {
                // ═══ STANDARD ROUTE (≤15s) ═══
                const res = await api('/video-studio/ugc-pro/qads/v2/generate-video', {
                    method: 'POST',
                    body: JSON.stringify({
                        brandId: activeBrand?._id,
                        presetId: selP,
                        variantId: vid,
                        prompt: variant.prompt,
                        legend: variant.legend || '',
                        productImageUrls: productImgs,
                        avatarUrl: avatarUrl || null,
                        settings: { duration, format, resolution, model: selectedModel, hookShot, language }
                    })
                })

                jobId = res.jobId || res.requestId || res.falRequestId
                setVideoJobs(prev => ({ ...prev, [vid]: { status: 'generating', progress: 5, jobId } }))

                // Standard polling
                pollRefs.current[vid] = setInterval(async () => {
                    try {
                        const d = await api(`/video-studio/ugc-pro/qads/v2/status/${jobId}`)
                        if (d) {
                            const status = d.status === 'COMPLETED' ? 'done'
                                : d.status === 'FAILED' ? 'failed'
                                : 'generating'
                            setVideoJobs(prev => ({
                                ...prev,
                                [vid]: {
                                    ...prev[vid],
                                    status,
                                    progress: d.progress || prev[vid]?.progress,
                                    videoUrl: d.videoUrl || prev[vid]?.videoUrl,
                                    error: (d.error && (d.error.includes('Network request timed out') || d.error.includes('504'))) ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : d.error
                                }
                            }))
                            if (status === 'done' || status === 'failed') {
                                clearInterval(pollRefs.current[vid])
                                // 🎤 Keep polling briefly for voiceover/BGM muxing
                                if (status === 'done' && language) {
                                    setVideoJobs(prev => ({ ...prev, [vid]: { ...prev[vid], voiceoverStatus: 'processing' } }))
                                    let voPollCount = 0
                                    const maxVoPolls = 12 // 60 seconds max (12 x 5s)
                                    pollRefs.current[`${vid}_vo`] = setInterval(async () => {
                                        voPollCount++
                                        try {
                                            const voCheck = await api(`/video-studio/ugc-pro/qads/v2/status/${d.jobId || jobId}`)
                                            if (voCheck?.videoUrl && voCheck.videoUrl !== d.videoUrl) {
                                                setVideoJobs(prev => ({ ...prev, [vid]: { ...prev[vid], videoUrl: voCheck.videoUrl, voiceoverStatus: 'done' } }))
                                                clearInterval(pollRefs.current[`${vid}_vo`])
                                                if (onVideoComplete) onVideoComplete()
                                            } else if (voPollCount >= maxVoPolls) {
                                                setVideoJobs(prev => ({ ...prev, [vid]: { ...prev[vid], voiceoverStatus: 'timeout' } }))
                                                clearInterval(pollRefs.current[`${vid}_vo`])
                                            }
                                        } catch { if (voPollCount >= maxVoPolls) clearInterval(pollRefs.current[`${vid}_vo`]) }
                                    }, 5000)
                                }
                                if (status === 'done' && onVideoComplete) onVideoComplete()
                            }
                        }
                    } catch (_) {}
                }, 5000)
            }
        } catch (e) {
            const isTimeout = e.message && (e.message.includes('Network request timed out') || e.message.includes('504'));
            const errorMsg = isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : e.message;
            setVideoJobs(prev => ({ ...prev, [vid]: { status: 'failed', error: errorMsg } }))
        }
    }, [selP, productImgs, avatarUrl, duration, format, resolution, selectedModel, hookShot, activeBrand, language, productData, canCreateVideo, onUpgradeRequired, onVideoComplete])

    useEffect(() => {
        return () => Object.values(pollRefs.current).forEach(clearInterval)
    }, [])

    const handleReuse = useCallback((project) => {
        if (project.settings?.duration) setDuration(project.settings.duration)
        if (project.settings?.format) setFormat(project.settings.format)
        if (project.settings?.hookShot !== undefined) setHookShot(project.settings.hookShot)
        if (project.categoryId) setSelP(project.categoryId)
        setUserBrief(project.title || '')
    }, [])

    const selectedPreset = presets.find(p => (p.presetCode || p.id) === selP)

    return <div className="qv2-root">
        <style>{css}</style>

        {/* Hero Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--sys-primary)', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>VIDEO Q-ADS</div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: '#fff', textTransform: 'uppercase', lineHeight: 1.1, margin: 0, letterSpacing: -1 }}>TURN ANY PRODUCT<br/>INTO A VIDEO Q-AD</h1>
        </div>

        <div className="qv2-lay">

            {/* Error banner */}
            {error && <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '10px 16px', margin: '0 0 8px', color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>{error}
            </div>}

            {/* Generating prompts loader */}
            {isGeneratingPrompts && <div className="scott-output-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' }}>
                <span className="material-symbols-outlined spin" style={{ fontSize: 36, color: '#10b981' }}>auto_awesome</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{promptStage || 'Writing cinematic prompts...'}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Claude is channeling 13 engine rules + your brand DNA</div>
            </div>}

            {/* 1 Variant Card */}
            {variants.length > 0 && !isGeneratingPrompts && (
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {variants.map(v => {
                        const job = videoJobs[v.variantId] || {}
                        return (
                            <div key={v.variantId} style={{ flex: '0 0 320px', background: 'rgba(20,20,20,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Variant label + word count */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#10b981' }}>VARIANT {v.variantId}</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{v.prompt?.split(/\s+/).length || 0}w</div>
                                </div>

                                {/* Prompt preview (scrollable) */}
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'pre-wrap' }}>
                                    {v.prompt}
                                </div>

                                {/* Video output or generate button */}
                                {job.status === 'done' && job.videoUrl ? (
                                    <div>
                                        <div className="has-vha" style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                                            <video src={job.videoUrl} controls loop playsInline style={{ width: '100%', borderRadius: 10, background: '#000', maxHeight: 180, display: 'block' }} />
                                            <VideoHoverActions videoUrl={job.videoUrl} onPreview={setPreviewVideo} project={job} />
                                        </div>
                                        {job.voiceoverStatus === 'processing' && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined spin" style={{ fontSize: 14, color: '#f59e0b' }}>mic</span>
                                                <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>Adding {language} voiceover...</span>
                                            </div>
                                        )}
                                        {job.voiceoverStatus === 'done' && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#10b981' }}>mic</span>
                                                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>Voiceover added ✓</span>
                                            </div>
                                        )}
                                        <a href={job.videoUrl} download target="_blank" rel="noreferrer" style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '6px 12px', borderRadius: 8, textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Download
                                        </a>
                                        <ViralityMiniPanel contentType="video" mediaUrl={job.videoUrl} brandId={activeBrand?._id} platform="instagram" />
                                    </div>
                                ) : job.status === 'generating' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                                        <span className="material-symbols-outlined spin" style={{ fontSize: 28, color: job.isLongForm ? '#f59e0b' : '#10b981' }}>{job.isLongForm ? 'movie_creation' : 'autorenew'}</span>
                                        <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${job.progress || 5}%`, background: job.isLongForm ? 'linear-gradient(90deg, #f59e0b, #ef4444)' : '#10b981', transition: 'width 1.5s linear' }} />
                                        </div>
                                        {job.isLongForm ? (
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>{job.phaseLabel || 'Starting...'}</div>
                                                {job.detail && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{job.detail}</div>}
                                                {job.segments && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{job.segments} scenes · ~{job.estimatedMinutes || '?'} min</div>}
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{(VIDEO_MODELS.find(m => m.value === selectedModel)?.label || 'AI')} is generating...</div>
                                        )}
                                    </div>
                                ) : job.status === 'failed' ? (
                                    <div style={{ color: '#ef4444', fontSize: 12, padding: '8px 0' }}>{job.error || 'Generation failed'}</div>
                                ) : (
                                    <button
                                        onClick={() => generateVideo(v)}
                                        style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: 0.5 }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>videocam</span>
                                        Generate Video · {getCredits(selectedModel, duration, resolution)} credits
                                    </button>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Scott Panel — two row layout */}
            <div className="scott-panel" style={{ flexDirection: 'column', gap: 8, padding: '12px 16px', maxWidth: '1050px' }}>

                {/* Row 1: Brief input */}
                <div className="scott-input-wrapper" style={{ width: '100%' }}>
                    <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.3)', marginRight: 10, fontSize: 18 }}>edit</span>
                    <DebouncedInput
                        className="scott-input"
                        placeholder="Describe the ad — what should happen, who stars in it, the mood..."
                        value={userBrief}
                        onChange={setUserBrief}
                        disabled={isGeneratingPrompts}
                    />
                    {(productImgs.length > 0 || avatarUrl) && (
                        <button
                            onClick={analyzeAssets}
                            disabled={isAnalyzingAssets}
                            style={{
                                background: 'rgba(16,185,129,0.1)',
                                color: '#10b981',
                                border: '1px solid rgba(16,185,129,0.3)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap',
                                marginLeft: 8
                            }}
                        >
                            {isAnalyzingAssets ? (
                                <><span className="material-symbols-outlined spin" style={{ fontSize: 14 }}>autorenew</span> Analyzing...</>
                            ) : (
                                <>✨ Smart Direction</>
                            )}
                        </button>
                    )}
                </div>

                {/* Row 2: Config + blocks + generate */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap', rowGap: 8 }}>

                    {/* Format picker */}
                    <button type="button" className="scott-btn-cfg" onClick={() => setShowCats(true)} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 12px', whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{selectedPreset?.msIcon || 'movie'}</span>
                        <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedPreset?.name || 'Format'}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.5 }}>expand_more</span>
                    </button>

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <CfgMenu value={format} onChange={setFormat} options={FMTS} icon="crop" />
                    <CfgMenu value={resolution} onChange={setResolution} options={RES} icon="hd" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 12px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px', height: '36px', border: '1px solid rgba(255,255,255,0.08)', flex: '0 0 auto' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>timer</span>
                        <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, minWidth: '24px' }}>{duration}s</span>
                        <input
                            type="range"
                            min={selectedModel.startsWith('seedance') ? 4 : 5}
                            max={selectedModel === 'seedance-2.0-mini' ? 15 : 120}
                            step={1}
                            value={duration}
                            onChange={e => {
                                let val = Number(e.target.value);
                                if (!selectedModel.startsWith('seedance')) {
                                    val = DURS.map(o => o.value).reduce((prev, curr) => Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev);
                                }
                                setDuration(val);
                            }}
                            style={{ width: '70px', accentColor: '#10b981', cursor: 'pointer', height: '3px', background: 'rgba(255,255,255,0.1)', border: 'none', outline: 'none' }}
                        />
                    </div>

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <CfgMenu value={selectedModel} onChange={setSelectedModel} options={VIDEO_MODELS} icon="smart_toy" />

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <button className="scott-btn-cfg" onClick={() => setHookShot(!hookShot)} style={{ background: hookShot ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 12px', whiteSpace: 'nowrap', flex: '0 0 auto', border: hookShot ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent', color: hookShot ? '#10b981' : '#fff' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>bolt</span>
                        <span>Hook</span>
                    </button>

                    <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                    <CfgMenu value={language} onChange={setLanguage} options={LANGUAGES} icon="translate" />

                    <div style={{ flex: 1 }} />

                    {/* Product block — shows first image + count badge if multiple */}
                    <button className={`scott-block-btn ${productData || productImgs.length ? 'active' : ''}`} onClick={() => setShowProduct(true)} style={{ width: 64, height: 56, position: 'relative', flexShrink: 0 }}>
                        {productImgs?.[0] ? (
                            <>
                                <img src={productImgs[0]} className="scott-block-img" alt="" style={{ opacity: 1 }} />
                                {productImgs.length > 1 && (
                                    <span style={{ position: 'absolute', top: 4, right: 4, background: '#10b981', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
                                        {productImgs.length}
                                    </span>
                                )}
                            </>
                        ) : productData ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))', borderRadius: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981', zIndex: 2 }}>check_circle</span>
                                <span style={{ zIndex: 2, fontSize: 8, letterSpacing: 0.5, color: '#10b981', fontWeight: 700, marginTop: 2, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{(productData.productName || 'READY').substring(0, 8)}</span>
                            </div>
                        ) : (
                            <>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>inventory_2</span>
                                <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>PRODUCT</span>
                            </>
                        )}
                    </button>

                    {/* Avatar block */}
                    <button className={`scott-block-btn ${avatarUrl ? 'active' : ''}`} onClick={() => setShowAvatar(true)} style={{ width: 64, height: 56, position: 'relative', flexShrink: 0 }}>
                        {avatarUrl ? (
                            <img src={avatarUrl} className="scott-block-img" alt="" style={{ opacity: 1 }} />
                        ) : (
                            <>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>person</span>
                                <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>AVATAR</span>
                            </>
                        )}
                    </button>

                    {/* Generate */}
                    <button className="scott-generate" onClick={generatePrompts} disabled={isGeneratingPrompts || (!productUrl && !productImgs.length)} style={{ height: 56, padding: '0 20px', fontSize: 13, flexShrink: 0 }}>
                        {isGeneratingPrompts
                            ? <><span className="material-symbols-outlined spin" style={{ fontSize: 16 }}>autorenew</span> Writing...</>
                            : <>GET 1 VARIANT <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span></>}
                    </button>
                </div>
            </div>

            {/* Product image strip — visible below the panel when multiple images are loaded */}
            {productImgs.length > 1 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 0 2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
                        {productImgs.length} reference images
                    </span>
                    {productImgs.map((u, i) => (
                        <div key={i} style={{ position: 'relative', width: 40, height: 40, flexShrink: 0 }}>
                            <img
                                src={u}
                                alt={`ref ${i + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: i === 0 ? '1.5px solid #10b981' : '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}
                                onClick={() => setShowProduct(true)}
                                title={`Image ${i + 1} — click to manage`}
                            />
                            <span style={{ position: 'absolute', bottom: 1, right: 1, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 7, fontWeight: 800, borderRadius: 3, padding: '1px 3px', lineHeight: 1.2 }}>
                                @{i + 1}
                            </span>
                        </div>
                    ))}
                    <button onClick={() => setShowProduct(true)} style={{ background: 'transparent', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: 6, width: 40, height: 40, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                    </button>
                </div>
            )}
            {templates.length > 0 && !isGeneratingPrompts && (
                <div style={{ width: '100%', maxWidth: 900, marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>bolt</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>Generate across formats</span>
                    </div>

                    {/* Category pills */}
                    {templateCategories.length > 1 && (
                        <div className="qv2-cat-pills">
                            <button className={`qv2-cat-pill ${selectedTemplateCategory === 'all' ? 'active' : ''}`}
                                onClick={() => setSelectedTemplateCategory('all')}>All</button>
                            {templateCategories.map(cat => (
                                <button key={cat} className={`qv2-cat-pill ${selectedTemplateCategory === cat ? 'active' : ''}`}
                                    onClick={() => setSelectedTemplateCategory(cat)}>{cat}</button>
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16, scrollbarWidth: 'none', justifyContent: 'center' }}>
                        {templates
                            .filter(t => selectedTemplateCategory === 'all' || t.categoryId?.name === selectedTemplateCategory)
                            .map(t => (
                            <div key={t._id} className="qv2-temp-card" style={{ flex: '0 0 180px', height: 280 }} onClick={() => handleTemplateClick(t)}>
                                {/* Video or Image preview */}
                                {t.previewUrl === 'pending' ? (
                                    <div style={{ position: 'absolute', inset: 0, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span className="material-symbols-outlined spin" style={{ color: 'var(--sys-primary)', fontSize: 24, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                    </div>
                                ) : t.previewUrl === 'failed' ? (
                                    <div style={{ position: 'absolute', inset: 0, background: '#331111', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4 }}>
                                        <span className="material-symbols-outlined" style={{ color: '#ef4444', fontSize: 24 }}>error</span>
                                        <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>FAILED</span>
                                    </div>
                                ) : t.previewType === 'video' && (t.previewVideoUrl || t.previewUrl) ? (
                                    <video src={t.previewVideoUrl || t.previewUrl} muted autoPlay loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (t.previewUrl || t.previewImageUrl) ? (
                                    <img src={t.previewUrl || t.previewImageUrl} alt={t.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, background: '#222' }} />
                                )}
                                <div className="overlay" />
                                <div className="qv2-temp-name">{t.name}</div>
                                <div className="qv2-temp-btn">
                                    <span>Recreate</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* History Videos */}
            <div className="qv2-bg">
                {(() => {
                    // Source 1: DB projects tagged as q-ads-v2 (or matching by title pattern as fallback)
                    const dbVideos = projects.filter(p =>
                        (p.studioMode === 'q-ads-v2' || p.title?.startsWith('Q-Ad')) &&
                        (p.generation?.videoUrl || p.finalVideoUrl)
                    );
                    // Source 2: Session videos not already in source 1 (dedup only against source 1)
                    const sessionVideos = Object.entries(videoJobs)
                        .filter(([, j]) => j.status === 'done' && j.videoUrl &&
                            !dbVideos.some(p => (p.generation?.videoUrl || '').includes(j.videoUrl?.split('?')[0]?.slice(-30) || '___')))
                        .map(([variantId, j]) => ({ _id: variantId, title: `Variant ${variantId}`, generation: { videoUrl: j.videoUrl }, studioMode: 'q-ads-v2' }));
                    return [...sessionVideos, ...dbVideos];
                })().map(p => (
                    <GridVideo key={p._id} project={{ ...p, generation: { ...p.generation, videoUrl: p.generation?.videoUrl || p.finalVideoUrl } }} onPreview={setPreviewVideo} onSaveTemplate={setSavingTemplate} isAdmin={isAdmin} />
                ))}
            </div>

        </div>

        {/* ── Video Preview Modal ── */}
        {previewVideo && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreviewVideo(null)}>
                <div style={{ position: 'relative', maxWidth: 720, width: '90%' }} onClick={e => e.stopPropagation()}>
                    <video src={previewVideo} controls autoPlay playsInline muted={false} ref={el => { if(el){ el.muted = false; el.volume = 1; const p = el.play(); if(p!==undefined) p.catch(()=>{}); } }} style={{ maxWidth: '100%', maxHeight: '85vh', margin: '0 auto', display: 'block', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', objectFit: 'contain', background: '#000' }} />
                    <div style={{ position: 'absolute', top: -44, right: 0, display: 'flex', gap: 8 }}>
                        <a href={previewVideo} download="q-ads-video.mp4" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download
                        </a>
                        <button onClick={() => setPreviewVideo(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* ── Save as Template Modal (Admin Only) ── */}
        {savingTemplate && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSavingTemplate(null)}>
                <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24 }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>bookmark_add</span>
                            Save as Q-Ads Template
                        </h2>
                        <button onClick={() => setSavingTemplate(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <SaveTemplateForm
                        project={savingTemplate}
                        onClose={() => setSavingTemplate(null)}
                        api={api}
                    />
                </div>
            </div>
        )}

        {/* Product Modal */}
        {showProduct && (
            <div className="scott-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShowProduct(false) }}>
                <div className="scott-modal" style={{ maxWidth: 520, maxHeight: '85vh', overflowY: 'auto' }}>
                    <div className="scott-modal-hdr">
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Add Product</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Add a URL and analyze, or upload product images directly</div>
                        </div>
                        <button className="scott-modal-close" onClick={() => setShowProduct(false)}><span className="material-symbols-outlined">close</span></button>
                    </div>

                    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* URL + Analyze */}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' }}>Product URL</div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    type="text"
                                    value={productUrl}
                                    onChange={e => setProductUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                                    placeholder="https://example.com/product"
                                    style={{ flex: 1, background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 14px', color: '#fff', outline: 'none', fontSize: 13 }}
                                />
                                <button
                                    onClick={handleAnalyze}
                                    disabled={isAnalyzing || !productUrl.trim()}
                                    style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: isAnalyzing ? 0.6 : 1 }}
                                >
                                    {isAnalyzing
                                        ? <><span className="material-symbols-outlined spin" style={{ fontSize: 16 }}>autorenew</span> Analyzing...</>
                                        : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>search</span> Analyze</>}
                                </button>
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>OR</div>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                        </div>

                        {/* Image upload */}
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase' }}>Upload Product Images</div>
                            <input type="file" ref={prodImgRef} accept="image/*" multiple style={{ display: 'none' }}
                                onChange={e => { Array.from(e.target.files).forEach(f => handleProductImageUpload(f)); e.target.value = '' }}
                            />
                            <button
                                onClick={() => prodImgRef.current?.click()}
                                disabled={isAnalyzing}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 12, padding: '20px', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.2s' }}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#10b981' }}>cloud_upload</span>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Click to upload product photos</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>JPG, PNG, WebP — multiple allowed</div>
                            </button>
                        </div>

                        {/* Uploaded image preview row */}
                        {productImgs.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {productImgs.map((u, i) => (
                                    <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
                                        <img src={u} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} alt="" />
                                        <button onClick={() => setProductImgs(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 18, height: 18, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✕</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Product info if analyzed */}
                        {productData && (
                            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, padding: '12px 14px' }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>✓ Product Analyzed</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{productData.productName}</div>
                                {productData.mainUSP && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{productData.mainUSP}</div>}
                            </div>
                        )}

                        <button onClick={() => setShowProduct(false)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Done</button>
                    </div>
                </div>
            </div>
        )}

        {/* Avatar Picker */}
        <AvatarPicker
            isOpen={showAvatar}
            onClose={() => setShowAvatar(false)}
            onSelect={(avatar) => setAvatarUrl(avatar.imageUrl)}
            activeBrand={activeBrand}
        />

        {/* Categories Modal */}
        {showCats && (
            <div className="scott-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { setShowCats(false); setSelectedCategory(null); } }}>
                <div className="scott-modal" style={{ maxWidth: 900 }}>
                    <div className="scott-modal-hdr">
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {selectedCategory && (
                                    <button onClick={() => setSelectedCategory(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
                                    </button>
                                )}
                                <div style={{ fontSize: 20, fontWeight: 800, textTransform: 'uppercase', color: '#fff' }}>
                                    {selectedCategory ? 'Pick a preset' : 'Pick the format that hits'}
                                </div>
                            </div>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
                                {selectedCategory ? 'Select a specific style for your video.' : 'From unboxing to UGC - choose the type of video that fits your product and audience.'}
                            </div>
                        </div>
                        <button className="scott-modal-close" onClick={() => { setShowCats(false); setSelectedCategory(null); }}><span className="material-symbols-outlined">close</span></button>
                    </div>
                    <div className="cat-grid">
                    {!selectedCategory ? (
                        categories.map(c => (
                            <div key={c.id} className="cat-card" onClick={() => setSelectedCategory(c)}>
                                {c.previewMediaUrl ? (
                                    c.previewMediaType === 'video' ? (
                                        <video src={c.previewMediaUrl} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} />
                                    ) : (
                                        <img src={c.previewMediaUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} alt={c.name} />
                                    )
                                ) : (
                                    <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${c.color || '#4f46e5'} 0%, #1a1a1a 100%)`, opacity: 0.45, borderRadius: 12 }} />
                                )}
                                <div className="cat-card-ov" />
                                <div style={{ zIndex: 2, color: '#fff', position: 'relative' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: c.color || '#4f46e5', marginBottom: 4, textTransform: 'uppercase' }}>
                                        Category
                                    </div>
                                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{c.name}</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        presets.filter(p => p.group === selectedCategory.name).map(p => {
                            const isExclusive = p.isMantramExclusive;
                            const pId = p.presetCode || p.id || p._id;
                            return (
                                <div key={pId} className={`cat-card ${selP === pId ? 'active' : ''}`} onClick={() => { setSelP(pId); setShowCats(false); setSelectedCategory(null); }}>
                                    {p.previewMediaUrl ? (
                                        p.previewMediaType === 'video' ? (
                                            <video src={p.previewMediaUrl} autoPlay muted loop playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} />
                                        ) : (
                                            <img src={p.previewMediaUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, borderRadius: 12 }} alt={p.name} />
                                        )
                                    ) : (
                                        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${p.color || '#4f46e5'} 0%, #1a1a1a 100%)`, opacity: 0.45, borderRadius: 12 }} />
                                    )}
                                    <div className="cat-card-ov" />
                                    <div style={{ zIndex: 2, color: '#fff', position: 'relative' }}>
                                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: isExclusive ? '#fbbf24' : (p.color || '#4f46e5'), marginBottom: 4, textTransform: 'uppercase' }}>
                                            {isExclusive ? '★ Mantram Exclusive' : (p.categoryName || p.group || 'Format')}
                                        </div>
                                        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 6 }}>{p.tagline}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>{p.threeWordCamera || p.categoryName || 'Dynamic'}</div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                    </div>
                </div>
            </div>
        )}

        {/* Publish Modal */}
        <PublishModal 
            isOpen={!!publishUrl} 
            onClose={() => setPublishUrl('')} 
            defaultVideo={publishUrl}
            brandId={activeBrand?._id}
        />

    </div>
}

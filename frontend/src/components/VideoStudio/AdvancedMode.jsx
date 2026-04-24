import { useState, useEffect, useRef, useCallback } from 'react'
import { creatives as creativesAPI } from '../../services/api'
import { CreditTooltipWrapper } from '../CreditBadge'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
const MAX_CONCURRENT = 3

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) throw new Error(`Server returned ${res.status}`)
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

const MODELS = {
    'kling-3.0-o': { id: 'kling-3.0-o', name: 'Kling 3.O Omni', msIcon: 'all_inclusive', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: false, lastFrame: false, audio: true, quality: true, multishot: true, refImages: true, refVideo: false, refAudio: false }, cost: 0.12, desc: "Ultimate cinematic omni-model. Supports multi-shot & dynamic ref images." },
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', durs: [5, 10, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], res: ['1080p', '720p'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true, quality: true, multiRefImages: 9, negativePrompt: true, seed: true, cfgScale: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking. Supports up to 9 reference images." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', durs: [5], ratios: ['16:9', '9:16'], res: ['1080p'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', durs: [5], ratios: ['16:9', '9:16', '1:1', '4:3'], res: ['720p'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', durs: [5, 15], ratios: ['16:9', '9:16', '1:1'], res: ['1080p'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." }
}

/* ── CSS ── */
const css = `
/* Layout */
.vm-studio-root { 
  --sys-surface-glass: color-mix(in srgb, var(--sys-surface) 85%, transparent);
  --sys-surface-raised: color-mix(in srgb, var(--sys-text) 4%, var(--sys-surface));
  --sys-surface-hover: color-mix(in srgb, var(--sys-text) 8%, var(--sys-surface));
  position: relative; width: 100%; min-height: calc(100vh - 80px); display: flex; flex-direction: column; background: transparent; 
}
.vm-layout { position: fixed; bottom: 0; left: 0; width: 100%; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 16px 24px 16px; pointer-events: none; transition: transform 0.4s ease; }
.vm-layout.layout-scrolled { transform: translateY(120px); }
.vm-layout:hover { transform: translateY(0); }
.vm-layout * { pointer-events: auto; }

/* Background Grid */
.vm-bg-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 24px; padding-bottom: 400px; pointer-events: auto; opacity: 0.9; }
@media(max-width: 1024px) { .vm-bg-grid { grid-template-columns: repeat(3, 1fr); padding-bottom: 500px; } }
@media(max-width: 768px) { .vm-bg-grid { grid-template-columns: repeat(2, 1fr); padding-bottom: 500px; } }
.vm-bg-item { aspect-ratio: 16/9; width: 100%; object-fit: cover; border-radius: 8px; opacity: 1.0; transition: opacity .4s, transform .5s; position: relative; overflow: hidden; pointer-events: auto; background: var(--sys-surface); border: 1px solid var(--sys-border); }
.vm-bg-item video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }
.vm-bg-item:hover { opacity: 0.88; transform: scale(1.02); z-index: 2; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }

/* Overlay — pointer-events: none so video hover still works */
.vm-bg-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.05) 100%); opacity: 0; transition: opacity .3s ease; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; gap: 6px; z-index: 3; pointer-events: none; }
.vm-bg-item:hover .vm-bg-overlay { opacity: 1; }
.vm-bg-overlay-btns { display: flex; gap: 4px; flex-wrap: wrap; pointer-events: auto; }
.vm-bg-overlay-btn { display: flex; align-items: center; gap: 3px; padding: 5px 8px; border-radius: 6px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; color: #fff; background: rgba(255,255,255,0.12); backdrop-filter: blur(8px); transition: all .15s; white-space: nowrap; }
.vm-bg-overlay-btn:hover { background: rgba(255,255,255,0.28); transform: translateY(-1px); }
.vm-bg-overlay-btn.primary { background: var(--sys-primary); color: #111; }
.vm-bg-overlay-btn.primary:hover { opacity: 0.85; }

/* Generating grid item */
.vm-job-item { aspect-ratio: 16/9; width: 100%; border-radius: 8px; position: relative; overflow: hidden; pointer-events: auto; background: linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(234,179,8,0.08) 100%); border: 1px solid rgba(124,58,237,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.vm-job-thumb { position: absolute; inset: 0; }
.vm-job-thumb img { width: 100%; height: 100%; object-fit: cover; opacity: 0.25; }
.vm-job-overlay { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; width: 100%; }
.vm-job-label { font-size: 11px; font-weight: 700; color: #fff; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%; }
.vm-job-bar { width: 80%; max-width: 140px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden; }
.vm-job-bar-fill { height: 100%; border-radius: 2px; background: #eab308; transition: width 1.2s ease; }
.vm-job-pct { font-size: 10px; font-weight: 700; color: #eab308; }
.vm-job-cancel { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.5); border: none; border-radius: 4px; color: rgba(255,255,255,0.6); cursor: pointer; padding: 2px 5px; font-size: 10px; z-index: 5; }
.vm-job-cancel:hover { color: #fff; background: rgba(239,68,68,0.5); }

/* Director Panel (Floating Card) */
.vm-card { margin-top: auto; margin-bottom: 0; width: 100%; max-width: 860px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 24px; padding: 0; backdrop-filter: blur(36px); box-shadow: 0 15px 40px rgba(0,0,0,0.15); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); font-family: 'Inter', sans-serif; position: relative; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
.vm-card.collapsed { transform: translateY(30%); opacity: 0.8; }
.vm-card.collapsed:hover { transform: translateY(0); opacity: 1; }
.vm-card.collapsed .vm-upper-controls, .vm-card.collapsed .vm-bottom { display: none; }

/* Panel Header */
.vm-card-header { padding: 6px 16px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 12px; color: var(--sys-text); background: transparent; }

/* Upper Controls */
.vm-upper-controls { padding: 8px 16px; display: flex; gap: 8px; border-bottom: 1px solid var(--sys-border); align-items: center; flex-wrap: nowrap; background: transparent; }
.vm-thumb-group { display: flex; align-items: center; gap: 6px; }
.vm-thumb-box { width: 36px; height: 36px; border-radius: 8px; border: 1px dashed var(--sys-border); background: var(--sys-surface); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; transition: all .2s; flex-shrink: 0; }
.vm-thumb-box:hover { border-color: var(--sys-primary); background: var(--sys-surface-raised); }
.vm-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
.vm-thumb-label { font-size: 9px; font-weight: 600; color: var(--sys-text-muted); text-align: center; margin-top: 2px; }
.vm-quality-group { display: flex; align-items: center; gap: 3px; margin-left: auto; background: var(--sys-surface-raised); padding: 2px; border-radius: 8px; border: 1px solid var(--sys-border); }
.vm-quality-pill { padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--sys-text-muted); transition: all .2s; display: flex; align-items: center; gap: 4px; }
.vm-quality-pill:hover { color: var(--sys-text); }
.vm-quality-pill.active { background: var(--sys-surface-glass); color: var(--sys-text); box-shadow: 0 2px 8px rgba(0,0,0,0.15); border: 1px solid var(--sys-border); }

/* Prompt area */
.vm-prompt { padding: 0; position: relative; flex: 1; background: transparent; margin: 0 16px 8px; }
.vm-card.collapsed .vm-prompt { margin: 0 16px 8px; }
.vm-prompt-row { display: flex; gap: 8px; align-items: flex-end; }
.vm-prompt-box { padding: 8px 12px; background: var(--sys-surface-raised); border-radius: 10px; border: 1px solid var(--sys-border); position: relative; transition: border-color .2s; flex: 1; }
.vm-prompt-box:focus-within { border-color: var(--sys-primary); }
.vm-card.collapsed .vm-prompt-box { padding: 6px 12px; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: vertical; color: var(--sys-text); font-size: 14px; line-height: 1.5; font-family: inherit; min-height: 64px; max-height: 280px; display: block; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; font-weight: 500; margin: 0; padding: 0; letter-spacing: 0.2px; }
.vm-card.collapsed .vm-textarea { min-height: 24px; max-height: 50px; }
.vm-textarea::placeholder { color: var(--sys-text-muted); font-weight: 500; opacity: 0.8; }
.vm-textarea::-webkit-scrollbar { width: 4px; }
.vm-textarea::-webkit-scrollbar-track { background: transparent; }
.vm-textarea::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
.vm-textarea::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }

/* Config modules */
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid transparent; background: transparent; color: var(--sys-text); transition: all .15s; }
.vm-config-trigger:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.vm-config-menu { position: absolute; bottom: -8px; left: -8px; min-width: 200px; max-height: 320px; overflow-y: auto; background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 16px; padding: 8px; z-index: 100; box-shadow: 0 15px 40px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 2px; }
.vm-config-opt { display: flex; align-items: center; width: 100%; padding: 10px 12px; border: none; background: transparent; color: var(--sys-text-muted); font-size: 13px; cursor: pointer; border-radius: 8px; text-align: left; transition: all .2s; }
.vm-config-opt.sel { color: var(--sys-text); background: var(--sys-surface-raised); }
.vm-config-opt:hover { background: var(--sys-surface-hover); color: var(--sys-text); }

/* Bottom Bar */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 6px 16px; border-top: 1px solid var(--sys-border); background: transparent; flex-wrap: nowrap; }
.vm-bottom-left { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; flex: 1; }
.vm-btn-icon-label { display: flex; align-items: center; gap: 3px; padding: 4px 8px; background: transparent; border: 1px solid transparent; color: var(--sys-text); cursor: pointer; font-size: 11px; font-weight: 600; border-radius: 8px; transition: 0.2s; white-space: nowrap; }
.vm-btn-icon-label:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.vm-generate { padding: 10px 20px; border-radius: 10px; font-weight: 700; font-size: 13px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--sys-surface); background: var(--sys-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.1); transition: all .2s; flex-shrink: 0; align-self: stretch; }
.vm-generate:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.2); opacity: 0.9; }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Error */
.vm-err { margin: 6px 16px; padding: 8px 12px; border-radius: 10px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); color: #fca5a5; font-size: 12px; display: flex; align-items: center; gap: 6px; }

/* Viewer Modal */
.vm-viewer-modal { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,0.88); backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center; padding: 24px; }
.vm-viewer-inner { max-width: 960px; width: 100%; position: relative; display: flex; flex-direction: column; gap: 16px; }
.vm-viewer-close { position: absolute; top: -44px; right: 0; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; color: #fff; cursor: pointer; padding: 6px 12px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; transition: all .2s; }
.vm-viewer-close:hover { background: rgba(255,255,255,0.18); }
.vm-viewer-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.vm-viewer-btn { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.08); color: #fff; transition: all .15s; }
.vm-viewer-btn:hover { background: rgba(255,255,255,0.18); transform: translateY(-1px); }
.vm-viewer-btn.accent { background: var(--sys-primary); color: #111; border-color: transparent; }
.vm-viewer-btn.accent:hover { opacity: 0.9; }

/* Extend */
.vm-extend { padding: 16px; border-radius: 14px; background: rgba(255, 77, 0,0.05); border: 1px solid rgba(255, 77, 0,0.18); margin-top: 16px; max-width: 680px; margin-left: auto; margin-right: auto; z-index: 20; position: relative; }
.vm-extend h4 { font-size: 13px; font-weight: 700; color: #c4b5fd; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.vm-extend-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.vm-extend-input { flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); font-size: 13px; }
.vm-btn-extend { padding: 10px 16px; border-radius: 10px; border: none; background: #eab308; color: #111; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Autocomplete & Library */
.vm-autocomplete { position: absolute; bottom: calc(100% + 8px); left: 24px; right: 24px; background: var(--sys-surface-glass); backdrop-filter: blur(20px); border: 1px solid var(--sys-border); border-radius: 12px; padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 200; box-shadow: 0 -10px 30px rgba(0,0,0,0.6); pointer-events: auto; }
.vm-ac-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); border: 1px solid transparent; font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-ac-item:hover { border-color: var(--sys-border); background: rgba(255,255,255,0.05); }
.vm-library { margin: 0 24px 16px; background: var(--sys-surface-glass); backdrop-filter: blur(20px); border: 1px solid var(--sys-border); border-radius: 14px; padding: 14px; color: var(--sys-text); position: absolute; bottom: 100%; max-width: calc(100% - 48px); z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-library-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.vm-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.vm-library-grid img:hover { border-color: #eab308; }
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }
@keyframes vm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.vm-spin { animation: vm-spin 1s linear infinite; }
@keyframes vm-pulse-border { 0%,100% { border-color: rgba(124,58,237,0.3); } 50% { border-color: rgba(124,58,237,0.7); } }
.vm-job-item { animation: vm-pulse-border 2s ease-in-out infinite; }
@keyframes vm-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
.vm-skeleton { aspect-ratio: 16/9; width: 100%; border-radius: 8px; background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%); background-size: 200% 100%; animation: vm-shimmer 1.8s ease-in-out infinite; border: 1px solid var(--sys-border); }

/* Film Format Toggle */
.vm-format-toggle { display: flex; gap: 2px; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 10px; padding: 3px; }
.vm-format-btn { display: flex; align-items: center; gap: 5px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: var(--sys-text-muted); transition: all .2s; white-space: nowrap; }
.vm-format-btn.active { background: var(--sys-surface); color: var(--sys-text); box-shadow: 0 2px 8px rgba(0,0,0,0.2); border: 1px solid var(--sys-border); }
.vm-format-btn.active.adfilm { background: linear-gradient(135deg, rgba(234,179,8,0.15), rgba(124,58,237,0.1)); color: #eab308; border-color: rgba(234,179,8,0.3); }

/* Ad Film Plan Card */
.vm-adfilm-plan { margin: 0 24px 16px; border-radius: 14px; background: linear-gradient(135deg, rgba(234,179,8,0.06) 0%, rgba(124,58,237,0.04) 100%); border: 1px solid rgba(234,179,8,0.2); overflow: hidden; }
.vm-adfilm-plan-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; cursor: pointer; }
.vm-adfilm-plan-title { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: #eab308; }
.vm-adfilm-plan-body { padding: 0 16px 14px; display: flex; flex-direction: column; gap: 8px; }
.vm-adfilm-beat { display: flex; gap: 10px; align-items: flex-start; }
.vm-adfilm-beat-label { font-size: 10px; font-weight: 800; color: rgba(234,179,8,0.7); min-width: 72px; padding-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
.vm-adfilm-beat-text { font-size: 12px; color: var(--sys-text); line-height: 1.5; flex: 1; }
.vm-adfilm-meta { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 8px; border-top: 1px solid rgba(234,179,8,0.12); margin-top: 4px; }
.vm-adfilm-meta-item { display: flex; align-items: flex-start; gap: 5px; background: rgba(255,255,255,0.03); border: 1px solid var(--sys-border); border-radius: 8px; padding: 6px 10px; flex: 1; min-width: 0; }
.vm-adfilm-meta-label { font-size: 9px; font-weight: 800; color: var(--sys-text-muted); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
.vm-adfilm-meta-value { font-size: 11px; color: var(--sys-text); line-height: 1.4; }
.vm-mcot-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: #7c3aed; background: rgba(124,58,237,0.08); border: 1px solid rgba(124,58,237,0.2); border-radius: 6px; padding: 2px 7px; }
`;

function ConfigDropdown({ value, onChange, options, label }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [])
    const sel = options.find(o => o.value === value) || options[0]
    return (
        <div className="vm-config-item" ref={ref}>
            <button type="button" className={`vm-config-trigger ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
                {sel?.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{sel.msIcon}</span>}
                <span>{sel?.label}</span>
                <span className="material-symbols-outlined" style={{ transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>
            {open && (
                <div className="vm-config-menu">
                    {options.map(o => (
                        <button key={o.value} type="button" className={`vm-config-opt ${o.value === value ? 'sel' : ''}`} onClick={() => { onChange(o.value); setOpen(false) }}>
                            {o.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{o.msIcon}</span>} {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Lazy Video Thumbnail ──
// ── Smart Thumbnail: poster-first when available, video-frame fallback when not ──
// Videos WITH poster: show image instantly, load video only on hover (saves bandwidth)
// Videos WITHOUT poster: load video with preload=metadata to grab frame 1
const PosterThumbnail = ({ src, poster }) => {
    const ref = useRef()
    const videoRef = useRef()
    const [isVisible, setIsVisible] = useState(false)
    const [isHovered, setIsHovered] = useState(false)

    const posterUrl = poster || ''
    const hasPoster = !!posterUrl

    useEffect(() => {
        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                setIsVisible(true)
                observer.disconnect()
            }
        }, { rootMargin: '200px' })
        if (ref.current) observer.observe(ref.current)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (isHovered && videoRef.current) videoRef.current.play().catch(() => {})
        else if (!isHovered && videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 }
    }, [isHovered])

    return (
        <div ref={ref} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Layer 1: Poster image (fades out on hover) */}
            {isVisible && hasPoster && (
                <img src={posterUrl} loading="lazy" alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none',
                        opacity: isHovered ? 0 : 1, transition: 'opacity 0.3s ease', position: 'absolute', inset: 0, zIndex: 2 }} />
            )}

            {/* Layer 2: Video element
                 - Has poster: only mount on hover
                 - No poster: always mount with preload=metadata to grab a frame */}
            {isVisible && src && (hasPoster ? isHovered : true) && (
                <video ref={videoRef} src={src}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                    muted loop playsInline
                    preload={hasPoster ? 'auto' : 'metadata'}
                    onLoadedData={e => { if (!hasPoster) e.target.currentTime = 1 }}
                />
            )}

            {/* Layer 3: Loading skeleton */}
            {!isVisible && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.02)' }} />
            )}
        </div>
    )
}

// Keep old name as alias for backward compatibility
const LazyVideoThumbnail = PosterThumbnail

export default function AdvancedMode({ activeBrand, initialData, projects = [], projectsLoaded = false }) {
    // ── Completed videos grid (local state, prepend new ones) ──
    const hasVideo = p => p.generation?.videoUrl || p.finalVideoUrl
    const isCompleted = p => (p.status === 'done' || p.status === 'critique' || p.status === 'completed') && hasVideo(p)
    
    const [gridVideos, setGridVideos] = useState(() => {
        return projects.filter(isCompleted)
    })

    // Sync if parent projects prop updates (on mount / history refresh)
    // Also updates existing entries that transitioned from generating → completed
    useEffect(() => {
        setGridVideos(prev => {
            const incoming = projects.filter(isCompleted)
            const existingMap = new Map(prev.map(p => [p._id, p]))
            // Update existing entries + add new ones
            const newItems = []
            incoming.forEach(p => {
                if (!existingMap.has(p._id)) newItems.push(p)
                existingMap.set(p._id, p) // Always update with latest data
            })
            if (newItems.length === 0 && incoming.length === prev.length) return prev // No changes
            // Prepend new items, update existing ones in place
            return [...newItems, ...prev.map(p => existingMap.get(p._id) || p).filter(p => !newItems.some(n => n._id === p._id))]
        })
    }, [projects])

    // ── Concurrent jobs (up to MAX_CONCURRENT) ──
    // Each job: { id, projectId, prompt, model, duration, aspectRatio, quality, thumbUrl, progress, status, videoUrl, error }
    const [jobs, setJobs] = useState([])
    const pollRefs = useRef({}) // jobId → intervalId
    const [showAdvancedHighTraffic, setShowAdvancedHighTraffic] = useState(false)
    const [highTrafficJobId, setHighTrafficJobId] = useState(null)

    function updateJob(id, patch) {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
    }

    function cancelJob(id) {
        if (pollRefs.current[id]) { clearInterval(pollRefs.current[id]); delete pollRefs.current[id] }
        setJobs(prev => prev.filter(j => j.id !== id))
    }

    function startJobPolling(jobId, projectId) {
        if (pollRefs.current[jobId]) clearInterval(pollRefs.current[jobId])
        pollRefs.current[jobId] = setInterval(async () => {
            try {
                const d = await api(`/video-studio/${projectId}/status`)
                const gen = d.project.generation
                updateJob(jobId, { progress: gen?.progress || 5 })
                
                // Handle IN_QUEUE (background task still initializing — prompt enhancement + provider submission)
                if (gen?.status === 'IN_QUEUE') {
                    updateJob(jobId, { progress: Math.max(gen?.progress || 3, 3), status: 'generating' })
                    return // Keep polling — generation hasn't been submitted to provider yet
                }
                
                if (gen?.status === 'COMPLETED' || d.project.status === 'critique' || d.project.status === 'completed' || d.project.status === 'done') {
                    clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                    const videoUrl = `${API_BASE}/video-studio/${projectId}/video`
                    updateJob(jobId, { status: 'done', videoUrl, progress: 100 })
                    // Prepend to grid
                    const syntheticProject = { _id: projectId, status: 'critique', generation: { videoUrl }, routing: {}, advancedConfig: {} }
                    setGridVideos(prev => [syntheticProject, ...prev])
                    // Remove from active jobs after a short delay
                    setTimeout(() => setJobs(prev => prev.filter(j => j.id !== jobId)), 3000)
                } else if (gen?.status === 'FAILED' || d.project.status === 'failed') {
                    clearInterval(pollRefs.current[jobId]); delete pollRefs.current[jobId]
                    updateJob(jobId, { status: 'failed', error: gen?.error || 'Generation failed' })
                }

                // High traffic check (5 minutes = 300000ms) with closure-safe state access
                setJobs(prev => {
                    const currentJob = prev.find(j => j.id === jobId);
                    if (currentJob && currentJob.startTime && Date.now() - currentJob.startTime > 300000 && !currentJob.highTrafficNotified) {
                        setShowAdvancedHighTraffic(true);
                        setHighTrafficJobId(jobId);
                        return prev.map(j => j.id === jobId ? { ...j, highTrafficNotified: true } : j);
                    }
                    return prev;
                });
            } catch { /* keep polling */ }
        }, 5000)
    }

    // Persist active generating projects across reloads/navigation
    // Only re-hydrate projects that are recently active (< 30 min old)
    const REHYDRATE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
    const handledGenerating = useRef(new Set());
    useEffect(() => {
        let added = false;
        const newJobs = [];
        const now = Date.now();
        projects.forEach(p => {
            const isGenerating = p.status === 'advanced-generating' || p.status === 'generating';
            if (!isGenerating || handledGenerating.current.has(p._id)) return;

            // Skip stale projects — they are dead generations that never completed
            const updatedAt = p.updatedAt || p.createdAt;
            const age = updatedAt ? now - new Date(updatedAt).getTime() : Infinity;
            if (age > REHYDRATE_MAX_AGE_MS) {
                handledGenerating.current.add(p._id); // Mark as handled so we don't re-check
                return;
            }

            handledGenerating.current.add(p._id);
            // Make sure we only add projects not already manually submitted in this active session
            if (!jobs.some(j => j.projectId === p._id)) {
                const jobId = `job-${p._id}`;
                newJobs.push({
                    id: jobId,
                    projectId: p._id,
                    prompt: p.advancedConfig?.prompt || p.backendPrompt || p.title || '',
                    model: p.routing?.selectedModel || '',
                    duration: p.advancedConfig?.duration || 5,
                    aspectRatio: p.advancedConfig?.aspectRatio || '16:9',
                    quality: p.routing?.mode || 'fast',
                    thumbUrl: p.advancedConfig?.firstImageUrl || '',
                    progress: p.generation?.progress || 5,
                    status: 'generating',
                    videoUrl: null,
                    error: null,
                    startTime: p.generation?.startedAt ? new Date(p.generation.startedAt).getTime() : Date.now(),
                    highTrafficNotified: false
                });
                if (!pollRefs.current[jobId]) {
                    startJobPolling(jobId, p._id);
                }
                added = true;
            }
        });
        if (added) {
            setJobs(prev => [...newJobs, ...prev]);
        }
    }, [projects, jobs]);

    // Cleanup all polls on unmount
    useEffect(() => () => {
        Object.values(pollRefs.current).forEach(clearInterval)
    }, [])

    // ── Compose form state ──
    const [showAdvancedOpts, setShowAdvancedOpts] = useState(false)
    const [model, setModel] = useState('seedance-2.0')
    const [prompt, setPrompt] = useState('')
    const [negativePrompt, setNegativePrompt] = useState('')
    const [seed, setSeed] = useState(-1)
    const [cfgScale, setCfgScale] = useState(7)
    const [zhPrompt, setZhPrompt] = useState('')
    const [duration, setDuration] = useState(6)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [resolution, setResolution] = useState('1080p')
    const [videoMode, setVideoMode] = useState('t2v')
    const [shots, setShots] = useState([{ prompt: '' }])
    const [viewVideo, setViewVideo] = useState(null) // { url, prompt, model, duration, firstImageUrl, lastImageUrl, refImages }
    const hlRef = useRef(null)
    const [i2vImage, setI2vImage] = useState(null)
    const [isScrolled, setIsScrolled] = useState(false)
    const i2vRef = useRef(null)
    const [firstFrame, setFirstFrame] = useState(null)
    const [lastFrame, setLastFrame] = useState(null)
    const [refImages, setRefImages] = useState([])
    const [refVideo, setRefVideo] = useState(null)
    const [refAudio, setRefAudio] = useState(null)
    const [filmFormat, setFilmFormat] = useState('shortvideo') // 'shortvideo' | 'adfilm'
    const [adFilmPlan, setAdFilmPlan] = useState(null)
    const [adFilmPlanOpen, setAdFilmPlanOpen] = useState(true)
    const [mcotUsed, setMcotUsed] = useState(false)
    const [enhancing, setEnhancing] = useState(false)
    const [generatingFrame, setGeneratingFrame] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [showLibrary, setShowLibrary] = useState(false)
    const [libraryFor, setLibraryFor] = useState(null)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [showAutocomplete, setShowAutocomplete] = useState(false)
    const [extendJobId, setExtendJobId] = useState(null)
    const [extendPrompt, setExtendPrompt] = useState('')
    const [extendDuration, setExtendDuration] = useState(5)
    const [extending, setExtending] = useState(false)

    const firstFrameRef = useRef(null)
    const lastFrameRef = useRef(null)
    const refImgRef = useRef(null)
    const refVideoRef = useRef(null)
    const refAudioRef = useRef(null)
    const promptRef = useRef(null)
    const bgRef = useRef(null)
    const observerRef = useRef(null)

    const m = MODELS[model] || MODELS['seedance-2.0']
    const credits = Math.max(Math.ceil(m.cost * (quality === 'quality' ? 2 : 1) * duration * 70), 5)
    const activeJobCount = jobs.filter(j => j.status === 'generating').length
    const canGenerate = activeJobCount < MAX_CONCURRENT

    // Scroll observer for bottom panel collapse
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => {
            setIsScrolled(!entry.isIntersecting)
        }, { threshold: 0, rootMargin: '-80px 0px 0px 0px' })
        if (observerRef.current) observer.observe(observerRef.current)
        return () => observer.disconnect()
    }, [])

    // Model constraints
    useEffect(() => {
        if (duration < m.durs[0]) setDuration(m.durs[0])
        if (duration > m.durs[m.durs.length - 1]) setDuration(m.durs[m.durs.length - 1])
        if (!m.ratios.includes(aspectRatio)) setAspectRatio(m.ratios[0])
        if (!m.res.includes(resolution)) setResolution(m.res[0])
        if (!m.has.lastFrame) setLastFrame(null)
        if (!m.has.refVideo) setRefVideo(null)
        if (!m.has.refAudio) setRefAudio(null)
        if (!m.has.refImages) setRefImages([])
        if (!m.has.firstFrame && videoMode !== 'i2v') setFirstFrame(null)
    }, [model])

    // Refill from initialData (storyboard → advanced handoff)
    useEffect(() => {
        if (!initialData) return
        if (initialData.prompt) {
            let pStr = initialData.prompt;
            try {
                if (pStr.trim().startsWith('[')) {
                    const parsed = JSON.parse(pStr);
                    if (Array.isArray(parsed) && parsed.some(p => p.lang === 'en')) {
                        pStr = parsed.find(p => p.lang === 'en').prompt;
                        const zh = parsed.find(p => p.lang === 'zh')?.prompt;
                        if (zh) setZhPrompt(zh);
                    }
                }
            } catch { }
            setPrompt(pStr);
        }
        if (initialData.model && MODELS[initialData.model]) setModel(initialData.model)
        if (initialData.duration) setDuration(initialData.duration)
        if (initialData.aspectRatio) setAspectRatio(initialData.aspectRatio)
        if (initialData.quality) setQuality(initialData.quality)
        if (initialData.firstImageUrl) setFirstFrame({ url: initialData.firstImageUrl, source: 'refill' })
        if (initialData.lastImageUrl) setLastFrame({ url: initialData.lastImageUrl, source: 'refill' })
        if (initialData.referenceImages?.length > 0) {
            setRefImages(initialData.referenceImages.map((r, i) => ({
                id: `refill-${i}-${Date.now()}`, url: r.url || r, label: `@image${i + 1}`, uploading: false
            })))
        }
        setError('')
    }, [initialData])

    // ── Library ──
    async function loadLibrary(target) {
        setLibraryFor(target); setShowLibrary(true)
        if (libraryImages.length > 0) return
        setLibraryLoading(true)
        try {
            const data = await creativesAPI.imageBank({ limit: 30, brandId: activeBrand?._id || '' })
            setLibraryImages(data.images || data.creatives || [])
        } catch { setLibraryImages([]) }
        setLibraryLoading(false)
    }
    function pickFromLibrary(img) {
        const url = img.url || img.imageUrl || img.outputUrl
        if (!url) return
        if (libraryFor === 'first') setFirstFrame({ url, source: 'library' })
        else if (libraryFor === 'last') setLastFrame({ url, source: 'library' })
        else if (libraryFor === 'ref') setRefImages(prev => [...prev, { id: `r${Date.now()}`, url, label: `@image${prev.length + 1}` }])
        setShowLibrary(false)
    }

    // ── Upload ──
    async function uploadImage(base64DataUri) {
        try {
            const d = await api('/video-studio/upload-image', { method: 'POST', body: JSON.stringify({ imageData: base64DataUri }) })
            return d.url || base64DataUri
        } catch { return base64DataUri }
    }
    function onFile(e, setter) {
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader()
        r.onload = async () => {
            setter({ url: r.result, source: 'upload', uploading: true })
            const hostedUrl = await uploadImage(r.result)
            setter({ url: hostedUrl, source: 'upload', uploading: false })
        }
        r.readAsDataURL(f)
    }
    function onRefFile(e) {
        const files = Array.from(e.target.files || [])
        if (!files.length) return
        const maxRefs = m.has.multiRefImages || 1
        const remaining = maxRefs - refImages.length
        const toProcess = files.slice(0, remaining)
        toProcess.forEach(f => {
            const r = new FileReader()
            r.onload = async () => {
                const id = `r${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
                setRefImages(prev => [...prev, { id, url: r.result, uploading: true }])
                const hostedUrl = await uploadImage(r.result)
                setRefImages(prev => prev.map(img => img.id === id ? { ...img, url: hostedUrl, uploading: false } : img))
            }
            r.readAsDataURL(f)
        })
    }
    function onMediaFile(e, setter) {
        const f = e.target.files?.[0]; if (!f) return
        setter(prev => {
            if (prev?.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url)
            return { url: URL.createObjectURL(f), name: f.name }
        })
    }
    function onI2VFile(e) {
        const file = e.target.files?.[0]; if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = reader.result
            setI2vImage({ url: base64, source: 'upload', uploading: true })
            const hosted = await uploadImage(base64)
            setI2vImage({ url: hosted || base64, source: 'upload', uploading: false })
        }
        reader.readAsDataURL(file)
    }

    // ── Autocomplete & Highlighting ──
    function renderRichPrompt(text) {
        if (!text) return null;
        // Split by exactly the tags we use
        const regex = /(@image\d+|@video|@audio)/g;
        const parts = text.split(regex);
        return parts.map((part, i) => {
            if (part.match(regex)) {
                return <span key={i} style={{ color: '#3b82f6', background: 'rgba(59,130,246,0.15)', textDecoration: 'underline' }}>{part}</span>
            }
            return part;
        });
    }

    function handlePromptChange(e) {
        const val = e.target.value
        setPrompt(val)
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = val.substring(0, cursorPos)
        // Trigger autocomplete whenever user types @ — even if no assets yet (show hint)
        if (textBeforeCursor.endsWith('@')) setShowAutocomplete(true)
        else setShowAutocomplete(false)
    }
    function insertTag(tag) {
        const textarea = promptRef.current
        const currentPrompt = m.has.multishot ? shots[0].prompt : prompt
        if (textarea) {
            const cursorPos = textarea.selectionStart
            const before = currentPrompt.substring(0, cursorPos - 1)
            const after = currentPrompt.substring(cursorPos)
            const newPrompt = before + tag + ' ' + after
            if (m.has.multishot) { const n = [...shots]; n[0].prompt = newPrompt; setShots(n) }
            else setPrompt(newPrompt)
        } else {
            if (m.has.multishot) { const n = [...shots]; n[0].prompt = n[0].prompt + tag + ' '; setShots(n) }
            else setPrompt(prev => prev + tag + ' ')
        }
        setShowAutocomplete(false)
    }
    const imgOffset = firstFrame ? 1 : 0
    const acItems = [
        ...(firstFrame ? [{ tag: '@image1', type: 'image', thumb: firstFrame.url, label: 'image1' }] : []),
        ...refImages.map((r, i) => ({ tag: `@image${i + 1 + imgOffset}`, type: 'image', thumb: r.url, label: `image${i + 1 + imgOffset}` })),
        ...(refVideo ? [{ tag: '@video1', type: 'video', msIcon: 'video_file', label: 'video1' }] : []),
        ...(refAudio ? [{ tag: '@audio1', type: 'audio', msIcon: 'audio_file', label: 'audio1' }] : []),
    ]

    // ── Enhance (2-stage MCoT) ──
    async function handleEnhance() {
        const rawPrompt = m.has.multishot ? shots[0].prompt : prompt
        if (!rawPrompt.trim()) return
        setEnhancing(true); setError(''); setAdFilmPlan(null); setMcotUsed(false)
        try {
            const d = await api('/video-studio/enhance-prompt', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: rawPrompt,
                    model,
                    duration,
                    aspectRatio,
                    brandId: activeBrand?._id,
                    filmFormat,
                    firstImageUrl: firstFrame?.url || '',
                    lastImageUrl: lastFrame?.url || '',
                    referenceImageUrls: refImages.map(r => r.url).filter(Boolean),
                }),
            })
            let finalUI = d.enhancedPrompt || rawPrompt
            setZhPrompt('')
            try {
                if (typeof finalUI === 'string' && finalUI.trim().startsWith('[')) {
                    const parsed = JSON.parse(finalUI)
                    if (Array.isArray(parsed) && parsed.some(p => p.lang === 'en')) {
                        finalUI = parsed.find(p => p.lang === 'en').prompt
                        const zh = parsed.find(p => p.lang === 'zh')?.prompt
                        if (zh) setZhPrompt(zh)
                    }
                }
            } catch { }

            if (m.has.multishot) {
                const n = [...shots]; n[0].prompt = finalUI; setShots(n)
            } else {
                setPrompt(finalUI)
            }
            if (d.adFilmPlan) { setAdFilmPlan(d.adFilmPlan); setAdFilmPlanOpen(true) }
            if (d.mcotUsed) setMcotUsed(true)
        } catch (e) { setError(e.message) }
        setEnhancing(false)
    }

    // ── Generate — adds a job instead of replacing the panel ──
    async function handleGenerate() {
        if (!canGenerate) { setError(`Max ${MAX_CONCURRENT} concurrent generations. Wait for one to finish.`); return }
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setLoading(true); setError('')
        const jobId = `job-${Date.now()}`
        const thumbUrl = videoMode === 'i2v' ? i2vImage?.url : firstFrame?.url

        let finalSubmissionPrompt = m.has.multishot ? shots.map(s => s.prompt).join(' | ') : prompt.trim();
        if (!m.has.multishot && zhPrompt) {
            finalSubmissionPrompt = JSON.stringify([{ lang: 'en', prompt: finalSubmissionPrompt }, { lang: 'zh', prompt: zhPrompt }]);
        }

        const newJob = {
            id: jobId, projectId: null, prompt: finalSubmissionPrompt,
            model, duration, aspectRatio, quality, thumbUrl, progress: 3, status: 'generating', videoUrl: null, error: null,
            startTime: Date.now(),
        }
        setJobs(prev => [newJob, ...prev])
        try {
            const allRefUrls = refImages.map(r => r.url).filter(Boolean)
            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: newJob.prompt, model, duration, resolution, aspectRatio,
                    mode: m.has.quality ? quality : 'fast',
                    shots: m.has.multishot ? shots : [],
                    firstImageUrl: firstFrame?.url || '',
                    lastImageUrl: lastFrame?.url || '',
                    generateAudio: !!m.has.audio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: allRefUrls,
                    ...(m.has.negativePrompt && negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
                    ...(m.has.seed && seed >= 0 ? { seed } : {}),
                    ...(m.has.cfgScale ? { cfgScale } : {}),
                }),
            })
            updateJob(jobId, { projectId: d.project._id })
            startJobPolling(jobId, d.project._id)
        } catch (e) {
            setError(e.message)
            setJobs(prev => prev.filter(j => j.id !== jobId))
        }
        setLoading(false)
    }

    async function handleI2VGenerate() {
        if (!canGenerate) { setError(`Max ${MAX_CONCURRENT} concurrent generations`); return }
        if (!i2vImage?.url) { setError('Upload an image first'); return }
        setLoading(true); setError('')
        const jobId = `job-${Date.now()}`
        setJobs(prev => [{ id: jobId, projectId: null, prompt: prompt.trim() || 'Animate this image', model, duration, aspectRatio, quality, thumbUrl: i2vImage.url, progress: 3, status: 'generating', videoUrl: null, error: null, startTime: Date.now() }, ...prev])
        try {
            const d = await api('/video-studio/advanced/image-to-video', {
                method: 'POST',
                body: JSON.stringify({ imageUrl: i2vImage.url, prompt: prompt.trim() || 'Animate this image with natural cinematic motion', duration, aspectRatio, qualityMode: quality, brandId: activeBrand?._id || null, referenceImages: refImages.map(r => r.url).filter(Boolean) }),
            })
            updateJob(jobId, { projectId: d.project._id })
            startJobPolling(jobId, d.project._id)
        } catch (e) {
            setError(e.message)
            setJobs(prev => prev.filter(j => j.id !== jobId))
        }
        setLoading(false)
    }

    // ── Extend ──
    async function handleExtend() {
        const job = jobs.find(j => j.id === extendJobId)
        if (!job?.projectId) return
        setExtending(true); setError('')
        try {
            const d = await api('/video-studio/extend-video', {
                method: 'POST', body: JSON.stringify({ projectId: job.projectId, prompt: extendPrompt.trim(), duration: extendDuration, qualityMode: quality }),
            })
            const newJobId = `job-${Date.now()}`
            setJobs(prev => [{ id: newJobId, projectId: d.project._id, prompt: extendPrompt || job.prompt, model: job.model, duration: extendDuration, aspectRatio: job.aspectRatio, quality, thumbUrl: job.thumbUrl, progress: 3, status: 'generating', videoUrl: null, error: null }, ...prev])
            startJobPolling(newJobId, d.project._id)
            setExtendJobId(null); setExtendPrompt('')
        } catch (e) { setError(e.message) }
        setExtending(false)
    }

    // ── Reuse: restore all settings INCLUDING images into the Scott Panel ──
    function handleReuse(p) {
        const ac = p.advancedConfig || {}
        const thePrompt = ac.enhancedPrompt || ac.prompt || p.input?.brief || p.title || ''
        const theModel = p.routing?.selectedModel || ac.model || 'seedance-2.0'
        const theDuration = Number(ac.duration) || 5
        const theAspect = ac.aspectRatio || '16:9'
        const theQuality = ac.qualityMode || ac.mode || 'fast'

        let finalUI = thePrompt
            setZhPrompt('')
            try {
                if (typeof finalUI === 'string' && finalUI.trim().startsWith('[')) {
                    const parsed = JSON.parse(finalUI)
                    if (Array.isArray(parsed) && parsed.some(p => p.lang === 'en')) {
                        finalUI = parsed.find(p => p.lang === 'en').prompt
                        const zh = parsed.find(p => p.lang === 'zh')?.prompt
                        if (zh) setZhPrompt(zh)
                    }
                }
            } catch { }
        setPrompt(finalUI)
        if (MODELS[theModel]) setModel(theModel)
        setDuration(theDuration)
        setAspectRatio(theAspect)
        setQuality(theQuality)

        // Restore images
        if (ac.firstImageUrl) setFirstFrame({ url: ac.firstImageUrl, source: 'refill' })
        else setFirstFrame(null)
        if (ac.lastImageUrl) setLastFrame({ url: ac.lastImageUrl, source: 'refill' })
        else setLastFrame(null)
        if (ac.referenceImages?.length > 0) {
            setRefImages(ac.referenceImages.map((r, i) => ({
                id: `reuse-${i}-${Date.now()}`, url: typeof r === 'string' ? r : r.url, uploading: false
            })))
        } else setRefImages([])

        setError('')
        // Scroll down to the panel
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100)
    }

    // ── Tags row ──
    const tagOffset = firstFrame ? 1 : 0
    const allTags = [
        ...(firstFrame ? [{ id: 'ff', label: '@image1', type: 'frame', thumb: firstFrame.url, uploading: firstFrame.uploading }] : []),
        ...(lastFrame ? [{ id: 'lf', label: 'End Frame', type: 'frame', thumb: lastFrame.url, uploading: lastFrame.uploading }] : []),
        ...refImages.map((r, i) => ({ id: r.id, label: `@image${i + 1 + tagOffset}`, type: 'image', thumb: r.url, uploading: r.uploading })),
        ...(refVideo ? [{ id: 'rv', label: '@video1', type: 'video', name: refVideo.name }] : []),
        ...(refAudio ? [{ id: 'ra', label: '@audio1', type: 'audio', name: refAudio.name }] : []),
    ]
    function removeTag(tag) {
        if (tag.id === 'ff') setFirstFrame(null)
        else if (tag.id === 'lf') setLastFrame(null)
        else if (tag.id === 'rv') setRefVideo(null)
        else if (tag.id === 'ra') setRefAudio(null)
        else setRefImages(prev => prev.filter(r => r.id !== tag.id))
    }

    // ── Download helper ──
    async function downloadVideo(url, title) {
        try {
            const resp = await fetch(url)
            const blob = await resp.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl; a.download = `${(title || 'video').replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`
            document.body.appendChild(a); a.click()
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
        } catch { window.open(url, '_blank') }
    }

    // =========================
    // RENDER
    // =========================
    return (
        <div className="vm-studio-root">
            <style>{css}</style>
            <div ref={observerRef} style={{ position: 'absolute', top: 0, left: 0, height: 1, width: '100%', pointerEvents: 'none' }} />

            {/* ── Video Viewer Modal ── */}
            {viewVideo && (
                <div className="vm-viewer-modal" onClick={() => setViewVideo(null)}>
                    <div className="vm-viewer-inner" onClick={e => e.stopPropagation()}>
                        <button className="vm-viewer-close" onClick={() => setViewVideo(null)}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span> Back
                        </button>
                        <video src={viewVideo.url} controls autoPlay loop style={{ width: '100%', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)' }} />
                        <div className="vm-viewer-actions">
                            <button className="vm-viewer-btn accent" onClick={() => {
                                setModel(viewVideo.model || 'seedance-2.0')
                                let finalUI = viewVideo.prompt || ''
                                setZhPrompt('')
                                try {
                                    if (typeof finalUI === 'string' && finalUI.trim().startsWith('[')) {
                                        const parsed = JSON.parse(finalUI)
                                        if (Array.isArray(parsed) && parsed.some(p => p.lang === 'en')) {
                                            finalUI = parsed.find(p => p.lang === 'en').prompt
                                            const zh = parsed.find(p => p.lang === 'zh')?.prompt
                                            if (zh) setZhPrompt(zh)
                                        }
                                    }
                                } catch { }
                                setPrompt(finalUI)
                                setDuration(Number(viewVideo.duration) || 5)
                                if (viewVideo.aspectRatio) setAspectRatio(viewVideo.aspectRatio)
                                if (viewVideo.firstImageUrl) setFirstFrame({ url: viewVideo.firstImageUrl, source: 'refill' })
                                else setFirstFrame(null)
                                if (viewVideo.lastImageUrl) setLastFrame({ url: viewVideo.lastImageUrl, source: 'refill' })
                                else setLastFrame(null)
                                if (viewVideo.refImages?.length > 0) {
                                    setRefImages(viewVideo.refImages.map((r, i) => ({ id: `view-reuse-${i}-${Date.now()}`, url: r, uploading: false })))
                                } else setRefImages([])
                                setViewVideo(null)
                                setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100)
                            }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_fix_high</span> Reuse Settings
                            </button>
                            {viewVideo.prompt && (
                                <button className="vm-viewer-btn" onClick={() => navigator.clipboard.writeText(viewVideo.prompt)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span> Copy Prompt
                                </button>
                            )}
                            <button className="vm-viewer-btn" onClick={() => downloadVideo(viewVideo.url, 'video')}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span> Download
                            </button>
                            <button className="vm-viewer-btn" onClick={() => setViewVideo(null)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span> Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main Grid ── */}
            <div className="vm-bg-grid">
                {/* Active generation jobs — appear first */}
                {jobs.map(job => (
                    <div key={job.id} className="vm-job-item">
                        {job.thumbUrl && (
                            <div className="vm-job-thumb">
                                <img src={job.thumbUrl} alt="" />
                            </div>
                        )}
                        <button className="vm-job-cancel" onClick={() => cancelJob(job.id)} title="Cancel">✕</button>
                        <div className="vm-job-overlay">
                            {job.status === 'generating' ? (
                                <>
                                    <span className="material-symbols-outlined vm-spin" style={{ fontSize: 28, color: '#7c3aed' }}>progress_activity</span>
                                    <div className="vm-job-label" title={job.prompt}>{job.prompt?.slice(0, 50) || 'Generating…'}</div>
                                    <div className="vm-job-bar"><div className="vm-job-bar-fill" style={{ width: `${job.progress || 3}%` }} /></div>
                                    <div className="vm-job-pct">{job.progress || 3}%</div>
                                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{job.model} · {job.duration}s</div>
                                    {job.startTime && Date.now() - job.startTime > 360000 && (
                                        <div className="mt-2 text-[9px] font-bold text-orange-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px] animate-pulse">traffic</span>
                                            High Traffic Load
                                        </div>
                                    )}
                                </>
                            ) : job.status === 'done' ? (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#22c55e' }}>check_circle</span>
                                    <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>Done! Added to grid</div>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#ef4444' }}>error</span>
                                    <div style={{ fontSize: 10, color: '#fca5a5', textAlign: 'center', maxWidth: '90%' }}>{job.error || 'Failed'}</div>
                                </>
                            )}
                        </div>
                    </div>
                ))}

                {/* Completed videos — uses CDN URLs directly (no proxy DB queries) */}
                {gridVideos.slice(0, Math.max(0, 16 - jobs.length)).map((p, i) => {
                    // Use CDN URL directly from API response — eliminates N+1 DB proxy queries
                    const cdnUrl = p.generation?.videoUrl || p.finalVideoUrl || ''
                    const proxyUrl = p._id ? `${API_BASE}/video-studio/${p._id}/video` : ''
                    const videoSrc = cdnUrl || proxyUrl
                    const ac = p.advancedConfig || {}
                    const promptText = ac.enhancedPrompt || ac.prompt || p.input?.brief || p.title || ''
                    const posterUrl = p.generation?.thumbnailUrl || p.thumbUrl || ac.firstImageUrl || ''
                    const viewData = {
                        url: videoSrc,
                        prompt: promptText,
                        model: p.routing?.selectedModel || ac.model,
                        duration: ac.duration || 5,
                        aspectRatio: ac.aspectRatio,
                        firstImageUrl: ac.firstImageUrl || '',
                        lastImageUrl: ac.lastImageUrl || '',
                        refImages: ac.referenceImages || [],
                    }
                    return (
                        <div key={p._id || i} className="vm-bg-item">
                            <PosterThumbnail
                                src={videoSrc}
                                poster={posterUrl}
                            />
                            {/* pointer-events: none on overlay, auto on buttons only */}
                            <div className="vm-bg-overlay">
                                <div className="vm-bg-overlay-btns">
                                    <button className="vm-bg-overlay-btn primary" onClick={() => setViewVideo(viewData)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>play_circle</span> View
                                    </button>
                                    <button className="vm-bg-overlay-btn" onClick={() => downloadVideo(videoSrc, p.title || 'video')}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>download</span> Download
                                    </button>
                                    <button className="vm-bg-overlay-btn" onClick={() => handleReuse(p)}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>replay</span> Reuse
                                    </button>
                                    {promptText && (
                                        <button className="vm-bg-overlay-btn" onClick={() => navigator.clipboard.writeText(promptText)}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>content_copy</span> Copy
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}

                {/* Skeleton loading placeholders while projects load */}
                {!projectsLoaded && gridVideos.length === 0 && jobs.length === 0 && (
                    [...Array(8)].map((_, i) => (
                        <div key={`skel-${i}`} className="vm-skeleton" />
                    ))
                )}

                {/* Empty placeholder slots (only after loaded) */}
                {projectsLoaded && [...Array(Math.max(0, 12 - jobs.length - Math.min(gridVideos.length, Math.max(0, 16 - jobs.length))))].map((_, i) => (
                    <div key={`empty-${i}`} className="vm-bg-item" style={{ background: 'rgba(0,0,0,0.02)', border: '1px dashed var(--sys-border)' }} />
                ))}
            </div>

            {/* ══════════ COMPOSE — Floating Card at Bottom ══════════ */}
            <div className="vm-layout">
                <div className={`vm-card ${isScrolled ? 'collapsed' : ''}`}>
                    {/* Panel Header */}
                    <div className="vm-card-header">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#eab308' }}>movie_creation</span> Scott Panel
                        </span>
                        {/* Active job counter */}
                        {activeJobCount > 0 && (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7c3aed', fontWeight: 700 }}>
                                <span className="material-symbols-outlined vm-spin" style={{ fontSize: 14 }}>progress_activity</span>
                                {activeJobCount}/{MAX_CONCURRENT} generating
                            </span>
                        )}
                    </div>

                    {error && (
                        <div className="vm-err">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
                            <span style={{ flex: 1 }}>{error}</span>
                            <button onClick={() => setError('')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                        </div>
                    )}

                    {/* Upper Controls — compact single row */}
                    <div className="vm-upper-controls">
                        {m.has.firstFrame && (
                            <div className="vm-thumb-group">
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div className="vm-thumb-box" onClick={() => videoMode === 'i2v' ? (!i2vImage && i2vRef.current?.click()) : firstFrameRef.current?.click()} title={videoMode === 'i2v' ? "Upload Image to Animate" : "Start Frame"}>
                                        {(videoMode === 'i2v' && i2vImage) ? <img src={i2vImage.url} alt="" /> : (firstFrame ? <img src={firstFrame.url} alt="" /> : <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>add_photo_alternate</span>)}
                                    </div>
                                    <span className="vm-thumb-label">Start</span>
                                </div>
                                {m.has.lastFrame && (
                                    <>
                                        <span className="material-symbols-outlined" style={{ color: 'var(--sys-border)', fontSize: 12 }}>arrow_forward_ios</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div className="vm-thumb-box" onClick={() => lastFrameRef.current?.click()} title="End Frame">
                                                {lastFrame ? <img src={lastFrame.url} alt="" /> : <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>add_photo_alternate</span>}
                                            </div>
                                            <span className="vm-thumb-label">End</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {m.has.refAudio && (
                            <button className="vm-btn-icon-label" style={{ opacity: refAudio ? 1 : 0.5, background: refAudio ? 'var(--sys-primary-dim)' : 'transparent' }} onClick={() => refAudioRef.current?.click()}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{refAudio ? 'audio_file' : 'music_note'}</span> {refAudio ? 'Audio' : 'Audio'}
                            </button>
                        )}
                        {m.has.refVideo && (
                            <button className="vm-btn-icon-label" style={{ opacity: refVideo ? 1 : 0.5, background: refVideo ? 'var(--sys-primary-dim)' : 'transparent' }} onClick={() => refVideoRef.current?.click()}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>video_library</span> {refVideo ? 'Ref' : 'Video'}
                            </button>
                        )}

                        {/* Seedance toggle — only when model has advanced options */}
                        {m.has.multiRefImages && (
                            <button
                                className="vm-btn-icon-label"
                                onClick={() => setShowAdvancedOpts(v => !v)}
                                style={{ background: showAdvancedOpts ? 'var(--sys-primary-dim)' : 'transparent', color: showAdvancedOpts ? 'var(--sys-primary)' : 'var(--sys-text-muted)' }}
                                title="Reference Images & Advanced Options"
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>tune</span>
                                <span>Options</span>
                                {refImages.length > 0 && <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--sys-primary)', color: '#fff', borderRadius: 4, padding: '1px 4px', lineHeight: 1.2 }}>{refImages.length}</span>}
                            </button>
                        )}

                        {m.has.quality && (
                            <div className="vm-quality-group" style={{ marginLeft: 'auto' }}>
                                <button className={`vm-quality-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}><span className="material-symbols-outlined" style={{ fontSize: '12px' }}>bolt</span> Fast</button>
                                <button className={`vm-quality-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}><span className="material-symbols-outlined" style={{ fontSize: '12px' }}>auto_awesome</span> Pro</button>
                            </div>
                        )}

                        {videoMode === 'i2v' && <span style={{ fontSize: 9, background: 'var(--sys-primary-dim)', padding: '2px 6px', borderRadius: 6, color: 'var(--sys-text)', fontWeight: 700 }}>I2V</span>}
                    </div>

                    {/* ── Seedance 2.0 Collapsible Advanced Options ── */}
                    {m.has.multiRefImages && showAdvancedOpts && (
                        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid var(--sys-border)', animation: 'traySlideUp 0.15s ease-out' }}>
                            {/* Ref images row + Neg/Seed/CFG inline */}
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                {/* Ref images */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 2 }}>Refs {refImages.length}/{m.has.multiRefImages}</span>
                                    {refImages.map((img, i) => (
                                        <div key={img.id} style={{ position: 'relative', width: 32, height: 32 }}>
                                            <img src={img.url} alt="" style={{ width: '100%', height: '100%', borderRadius: 6, objectFit: 'cover', border: '1px solid var(--sys-border)', opacity: img.uploading ? 0.5 : 1 }} />
                                            <button style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }} onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                        </div>
                                    ))}
                                    {refImages.length < m.has.multiRefImages && (
                                        <>
                                            <button onClick={() => refImgRef.current?.click()} style={{ width: 32, height: 32, borderRadius: 6, border: '1px dashed var(--sys-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sys-text-muted)' }} title="Upload">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                                            </button>
                                            <button onClick={() => loadLibrary('ref')} style={{ width: 32, height: 32, borderRadius: 6, border: '1px dashed var(--sys-border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sys-text-muted)' }} title="Image Bank">
                                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>photo_library</span>
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Divider */}
                                <div style={{ width: 1, height: 28, background: 'var(--sys-border)', flexShrink: 0, alignSelf: 'center' }} />

                                {/* Neg prompt + seed + cfg inline */}
                                {m.has.negativePrompt && (
                                    <div style={{ flex: '1 1 140px', minWidth: 100 }}>
                                        <input
                                            type="text"
                                            value={negativePrompt}
                                            onChange={e => setNegativePrompt(e.target.value)}
                                            placeholder="Negative: blur, distortion..."
                                            style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 11, outline: 'none' }}
                                        />
                                    </div>
                                )}
                                {m.has.seed && (
                                    <div style={{ width: 64 }}>
                                        <input
                                            type="number"
                                            value={seed}
                                            onChange={e => setSeed(Number(e.target.value))}
                                            placeholder="Seed"
                                            title="Seed (-1 = random)"
                                            style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', color: 'var(--sys-text)', fontSize: 11, outline: 'none' }}
                                        />
                                    </div>
                                )}
                                {m.has.cfgScale && (
                                    <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: 9, color: 'var(--sys-text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>CFG {cfgScale}</span>
                                        <input
                                            type="range"
                                            min={1} max={20} step={0.5}
                                            value={cfgScale}
                                            onChange={e => setCfgScale(Number(e.target.value))}
                                            style={{ width: '100%', accentColor: 'var(--sys-primary)', height: 4 }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Prompt area — textarea + generate inline */}
                    <div className="vm-prompt">
                      <div className="vm-prompt-row">
                        <div className="vm-prompt-box">
                            <textarea
                                ref={promptRef}
                                className="vm-textarea"
                                value={m.has.multishot ? shots[0].prompt : prompt}
                                onChange={e => {
                                    if (m.has.multishot) { const n = [...shots]; n[0].prompt = e.target.value; setShots(n) }
                                    else handlePromptChange(e)
                                }}
                                placeholder={activeBrand?.name ? `What's your ${activeBrand.name} ad about? Type @ to tag assets...` : `What's your ad about? Type @ to tag images, video, audio...`}
                                style={{}}
                            />
                        </div>
                        {/* GENERATE — inline right of prompt */}
                        {videoMode === 'i2v' ? (
                            <button className="vm-generate" onClick={handleI2VGenerate} disabled={loading || !i2vImage?.url || !canGenerate}>
                                {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 16 }}>progress_activity</span></>
                                    : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>animation</span><span style={{ fontSize: 11 }}>{credits}</span></>}
                            </button>
                        ) : (
                            <button className="vm-generate" onClick={handleGenerate} disabled={loading || !(m.has.multishot ? shots[0].prompt : prompt).trim() || !canGenerate}>
                                {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 16 }}>progress_activity</span></>
                                    : <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>movie_creation</span><span style={{ fontSize: 11 }}>{credits}</span></>}
                            </button>
                        )}
                      </div>
                        {m.has.multishot && (
                            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {shots.slice(1).map((s, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                                        <div 
                                            style={{ 
                                                position: 'relative', 
                                                flex: 1,
                                                padding: 0, 
                                                overflow: 'hidden',
                                                border: '1px solid var(--sys-border)',
                                                background: 'var(--sys-surface-raised)',
                                                borderRadius: '8px',
                                                minHeight: '40px',
                                                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                                fontSize: '14px',
                                                lineHeight: '1.5',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    margin: 0, border: 0, background: 'none', boxSizing: 'inherit', display: 'inherit',
                                                    fontFamily: 'inherit', fontSize: 'inherit', fontStyle: 'inherit', fontWeight: 'inherit',
                                                    letterSpacing: 'inherit', lineHeight: 'inherit', tabSize: 'inherit', textIndent: 'inherit',
                                                    textRendering: 'inherit', textTransform: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'break-word',
                                                    position: 'relative', pointerEvents: 'none',
                                                    padding: '12px 16px',
                                                    color: 'var(--sys-text)',
                                                }}
                                            >
                                                {renderRichPrompt(s.prompt)}
                                                <br />
                                            </div>
                                            <textarea
                                                spellCheck={false}
                                                style={{
                                                    margin: 0, border: 0, background: 'none', boxSizing: 'inherit', display: 'inherit',
                                                    fontFamily: 'inherit', fontSize: 'inherit', fontStyle: 'inherit', fontWeight: 'inherit',
                                                    letterSpacing: 'inherit', lineHeight: 'inherit', tabSize: 'inherit', textIndent: 'inherit',
                                                    textRendering: 'inherit', textTransform: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'break-word',
                                                    position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', resize: 'none',
                                                    color: 'transparent', caretColor: 'var(--sys-text)', overflow: 'hidden', WebkitTextFillColor: 'transparent',
                                                    padding: '12px 16px',
                                                    outline: 'none',
                                                }}
                                                value={s.prompt}
                                                onChange={(e) => { const n = [...shots]; n[idx + 1].prompt = e.target.value; setShots(n) }}
                                                placeholder={`Shot ${idx + 2} Prompt`}
                                            />
                                        </div>
                                        <button className="vm-config-trigger" style={{ color: 'var(--sys-error)', marginTop: '4px' }} onClick={() => setShots(shots.filter((_, i) => i !== idx + 1))}><span className="material-symbols-outlined">delete</span></button>
                                    </div>
                                ))}
                                {shots.length < 6 && <button className="vm-btn-icon-label" style={{ alignSelf: 'flex-start' }} onClick={() => setShots([...shots, { prompt: '' }])}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add Shot</button>}
                            </div>
                        )}
                    </div>

                    {/* Autocomplete — positioned relative to vm-card, outside vm-prompt so overflow:hidden doesn't clip it */}
                    {showAutocomplete && (
                        <div className="vm-autocomplete">
                            {acItems.length === 0 ? (
                                <span style={{ fontSize: 12, color: 'var(--sys-text-muted)', padding: '4px 8px' }}>No assets attached yet — upload images or video first</span>
                            ) : (
                                acItems.map(item => (
                                    <button key={item.tag} className="vm-ac-item" onClick={() => insertTag(item.tag)}>
                                        {item.thumb ? <img src={item.thumb} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} /> : <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{item.msIcon || 'attach_file'}</span>}
                                        <span>{item.tag}</span>
                                    </button>
                                ))
                            )}
                        </div>
                    )}

                    {/* Library panel — position relative to vm-card, floats above prompt */}
                    {showLibrary && (
                        <div className="vm-library">
                            <div className="vm-library-head">
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span> Image Library</span>
                                <button onClick={() => setShowLibrary(false)}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span></button>
                            </div>
                            {libraryLoading ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>Loading...</p>
                                : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>No images yet</p>
                                    : <div className="vm-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                            }
                        </div>
                    )}

                    {/* Tags row */}
                    {allTags.length > 0 && (
                        <div style={{ padding: '0 24px 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {allTags.map(tag => (
                                <div key={tag.id} className="vm-tag">
                                    {tag.thumb && <img src={tag.thumb} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />}
                                    <span>{tag.label}</span>
                                    <button style={{ background: 'none', border: 'none', color: 'var(--sys-text-muted)', padding: 0, marginLeft: 4, cursor: 'pointer', fontSize: 14 }} onClick={() => removeTag(tag)}>×</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Ad Film Plan Card — shown when adfilm format + AI returned plan */}
                    {adFilmPlan && (
                        <div className="vm-adfilm-plan">
                            <div className="vm-adfilm-plan-header" onClick={() => setAdFilmPlanOpen(o => !o)}>
                                <div className="vm-adfilm-plan-title">
                                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>movie_creation</span>
                                    Ad Film Structure
                                    {mcotUsed && <span className="vm-mcot-badge"><span className="material-symbols-outlined" style={{ fontSize: 11 }}>psychology</span> Visual AI</span>}
                                </div>
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)', transition: 'transform .2s', transform: adFilmPlanOpen ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                            </div>
                            {adFilmPlanOpen && (
                                <div className="vm-adfilm-plan-body">
                                    {adFilmPlan.hook && <div className="vm-adfilm-beat"><span className="vm-adfilm-beat-label">🎣 Hook</span><span className="vm-adfilm-beat-text">{adFilmPlan.hook}</span></div>}
                                    {adFilmPlan.story && <div className="vm-adfilm-beat"><span className="vm-adfilm-beat-label">📖 Story</span><span className="vm-adfilm-beat-text">{adFilmPlan.story}</span></div>}
                                    {adFilmPlan.productReveal && <div className="vm-adfilm-beat"><span className="vm-adfilm-beat-label">✨ Reveal</span><span className="vm-adfilm-beat-text">{adFilmPlan.productReveal}</span></div>}
                                    {adFilmPlan.cta && <div className="vm-adfilm-beat"><span className="vm-adfilm-beat-label">🏁 CTA</span><span className="vm-adfilm-beat-text">{adFilmPlan.cta}</span></div>}
                                    <div className="vm-adfilm-meta">
                                        {adFilmPlan.voiceOver && (
                                            <div className="vm-adfilm-meta-item" style={{ flexDirection: 'column', gap: 2 }}>
                                                <span className="vm-adfilm-meta-label">🎙 VO</span>
                                                <span className="vm-adfilm-meta-value">"{adFilmPlan.voiceOver}"</span>
                                            </div>
                                        )}
                                        {adFilmPlan.bgMusic && (
                                            <div className="vm-adfilm-meta-item" style={{ flexDirection: 'column', gap: 2 }}>
                                                <span className="vm-adfilm-meta-label">🎵 BGM</span>
                                                <span className="vm-adfilm-meta-value">{adFilmPlan.bgMusic}</span>
                                            </div>
                                        )}
                                        {adFilmPlan.ctaText && (
                                            <div className="vm-adfilm-meta-item" style={{ flexDirection: 'column', gap: 2 }}>
                                                <span className="vm-adfilm-meta-label">💬 CTA Text</span>
                                                <span className="vm-adfilm-meta-value">{adFilmPlan.ctaText}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Hidden file inputs */}
                    <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                    <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                    <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} multiple={!!(m.has.multiRefImages && m.has.multiRefImages > 1)} style={{ display: 'none' }} />
                    <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                    <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />
                    <input ref={i2vRef} type="file" accept="image/*" onChange={onI2VFile} style={{ display: 'none' }} />

                    {/* Bottom Bar */}
                    <div className="vm-bottom">
                        <div className="vm-bottom-left">
                            <ConfigDropdown value={model} onChange={setModel} options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))} label="Model" />
                            <ConfigDropdown value={aspectRatio} onChange={setAspectRatio} options={m.ratios.map(r => ({ value: r, label: r }))} label="Ratio" />
                            <ConfigDropdown value={resolution} onChange={setResolution} options={m.res.map(r => ({ value: r, label: r }))} label="Resolution" />
                            <ConfigDropdown value={duration} onChange={setDuration} options={m.durs.map(d => ({ value: d, label: `${d}s` }))} label="Duration" />
                        </div>

                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }}>
                            {/* Format Toggle */}
                            <div className="vm-format-toggle">
                                <button
                                    className={`vm-format-btn ${filmFormat === 'shortvideo' ? 'active' : ''}`}
                                    onClick={() => { setFilmFormat('shortvideo'); setAdFilmPlan(null) }}
                                    title="Single optimised video prompt"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>smartphone</span> Short
                                </button>
                                <button
                                    className={`vm-format-btn ${filmFormat === 'adfilm' ? 'active adfilm' : ''}`}
                                    onClick={() => setFilmFormat('adfilm')}
                                    title="Full ad film with hook, story, reveal & CTA"
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>movie</span> Ad Film
                                </button>
                            </div>

                            <CreditTooltipWrapper action="promptEnhance">
                                <button
                                    className="vm-btn-icon-label"
                                    onClick={handleEnhance}
                                    disabled={enhancing || !(m.has.multishot ? shots[0].prompt : prompt).trim()}
                                    style={{ color: filmFormat === 'adfilm' ? '#eab308' : 'var(--sys-primary)' }}
                                    title={filmFormat === 'adfilm' ? 'Enhance as full Ad Film' : 'Enhance for best model output'}
                                >
                                    {enhancing
                                        ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 14 }}>progress_activity</span> Thinking…</>
                                        : <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>{filmFormat === 'adfilm' ? 'movie' : 'auto_awesome'}</span> Enhance</>}
                                </button>
                            </CreditTooltipWrapper>
                        </div>
                    </div>
                </div>
            </div>
            {/* ── High Traffic Modal ── */}
            {showAdvancedHighTraffic && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAdvancedHighTraffic(false)}>
                    <div className="glass-panel max-w-md w-full p-8 rounded-3xl border border-[#FF4D00]/30 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
                        <div className="size-20 bg-[#FF4D00]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="material-symbols-outlined text-4xl text-[#FF4D00] animate-pulse">traffic</span>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">High Traffic Alert</h3>
                        <p className="text-gray-400 text-sm leading-relaxed mb-6">
                            The provider is currently under heavy load. Your video generation is still active and in progress, but it's taking longer than usual.
                            <br /><br />
                            <span className="text-[#FF7A00] font-bold underline">Please do not refresh.</span> Our system will automatically update when the video is ready.
                        </p>
                        <button 
                            onClick={() => setShowAdvancedHighTraffic(false)}
                            className="w-full py-3.5 rounded-xl bg-[#FF4D00]/20 text-[#FF7A00] font-bold text-sm border border-[#FF4D00]/30 hover:bg-[#FF4D00]/30 transition-all cursor-pointer"
                        >
                            Understood
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

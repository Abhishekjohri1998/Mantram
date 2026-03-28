import { useState, useEffect, useRef, useCallback } from 'react'
import { creatives as creativesAPI } from '../../services/api'
import { CreditTooltipWrapper } from '../CreditBadge'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

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

/* ── Models ── */
const MODELS = {
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', icon: '🎞️', dur: [4, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true }, cost: 0.08 },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true }, cost: 0.07 },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', icon: '🎬', dur: [4, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true }, cost: 0.15 },
    'veo-3.1-fast': { id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', dur: [4, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, refImages: true, audio: true }, cost: 0.08 },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', icon: '🌱', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3'], has: { firstFrame: true, lastFrame: true }, cost: 0.05 },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', dur: [1, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true }, cost: 0.08 },
}

/* ── CSS-in-JS (Safari + Chrome + Firefox safe) ── */
const css = `
.adv-wrap { max-width: 920px; margin: 0 auto; padding: 0 4px 32px; }
.adv-wrap * { box-sizing: border-box; }
.adv-err { padding: 14px 18px; border-radius: 14px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15); color: #fca5a5; font-size: 14px; display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
.adv-err button { background: none; border: none; color: #fca5a5; cursor: pointer; padding: 0; }

/* Prompt Card */
.adv-prompt-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; padding: 24px; margin-bottom: 24px; }
.adv-textarea { width: 100%; background: transparent; border: none; outline: none; resize: vertical; color: #f1f5f9; font-size: 16px; line-height: 1.7; font-family: inherit; min-height: 120px; }
.adv-textarea::placeholder { color: rgba(148,163,184,0.35); }
.adv-prompt-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.04); flex-wrap: wrap; gap: 10px; }
@media (max-width: 640px) { .adv-prompt-footer { flex-direction: column; align-items: stretch; } }

/* Ref tags row */
.adv-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.04); }
.adv-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 10px; background: rgba(139,92,246,0.08); border: 1px solid rgba(139,92,246,0.18); }
.adv-tag img { width: 26px; height: 26px; border-radius: 7px; object-fit: cover; }
.adv-tag span { font-size: 12px; color: #c4b5fd; font-weight: 600; }
.adv-tag button { background: none; border: none; color: #f87171; cursor: pointer; padding: 0; font-size: 13px; margin-left: 2px; }
.adv-tag .uploading { font-size: 11px; color: #64748b; font-style: italic; }

/* @ Autocomplete */
.adv-autocomplete { position: absolute; bottom: 100%; left: 12px; background: #1e1e26; border: 1px solid rgba(139,92,246,0.3); border-radius: 12px; padding: 8px; display: flex; gap: 8px; z-index: 10; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
.adv-ac-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 10px; cursor: pointer; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); min-width: 64px; -webkit-appearance: none; appearance: none; }
.adv-ac-item:hover { border-color: rgba(139,92,246,0.4); background: rgba(139,92,246,0.08); }
.adv-ac-item img { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
.adv-ac-item span { font-size: 11px; color: #c4b5fd; font-weight: 600; }

/* Enhance Button */
.adv-enhance { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 24px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid rgba(139,92,246,0.3); background: linear-gradient(135deg, rgba(124,58,237,0.15), rgba(6,182,212,0.15)); color: #d8b4fe; -webkit-appearance: none; appearance: none; transition: all .2s; box-shadow: 0 4px 14px rgba(124,58,237,0.1); }
.adv-enhance:hover { border-color: rgba(139,92,246,0.6); background: linear-gradient(135deg, rgba(124,58,237,0.25), rgba(6,182,212,0.25)); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(124,58,237,0.2); }
.adv-enhance:disabled { opacity: 0.4; cursor: default; transform: none; box-shadow: none; }
.adv-chars { font-size: 12px; color: #475569; }

/* Config Row */
.adv-config { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; margin-bottom: 28px; padding: 20px 24px; border-radius: 18px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); }
@media (max-width: 640px) { .adv-config { gap: 14px; padding: 16px; } }
.adv-config-item { display: flex; flex-direction: column; gap: 6px; }
.adv-config-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; }

/* Custom Select */
.adv-select-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px 14px; color: #e2e8f0; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .2s; }
.adv-select-btn:hover { background: rgba(255,255,255,0.07); border-color: rgba(255,255,255,0.15); }
.adv-select-btn.open { background: rgba(139,92,246,0.08); border-color: rgba(139,92,246,0.4); box-shadow: 0 0 0 2px rgba(139,92,246,0.15); }
.adv-select-menu { position: absolute; top: calc(100% + 6px); left: 0; width: 100%; max-height: 240px; overflow-y: auto; background: #1e1e26; border: 1px solid rgba(139,92,246,0.25); border-radius: 12px; padding: 6px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 2px; }
.adv-select-menu::-webkit-scrollbar { width: 6px; }
.adv-select-menu::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
.adv-select-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 12px; border: none; background: transparent; color: #94a3b8; font-size: 14px; font-weight: 500; cursor: pointer; border-radius: 8px; text-align: left; transition: all .15s; }
.adv-select-item:hover { background: rgba(255,255,255,0.05); color: #e2e8f0; }
.adv-select-item.selected { background: rgba(139,92,246,0.15); color: #c4b5fd; font-weight: 600; }

.adv-quality-row { display: flex; gap: 6px; }
.adv-pill { padding: 10px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); color: #94a3b8; -webkit-appearance: none; appearance: none; transition: all .2s; }
.adv-pill:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: #e2e8f0; }
.adv-pill.active { background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.15)); color: #d8b4fe; border-color: rgba(139,92,246,0.4); box-shadow: 0 4px 12px rgba(139,92,246,0.1); }

/* Feature Cards Grid */
.adv-features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 28px; }
@media (max-width: 768px) { .adv-features { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .adv-features { grid-template-columns: 1fr; } }
.adv-fcard { padding: 20px; border-radius: 18px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); }
.adv-fcard:hover { border-color: rgba(139,92,246,0.25); background: rgba(255,255,255,0.03); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(139,92,246,0.05); }
.adv-fcard.has-content { background: linear-gradient(135deg, rgba(139,92,246,0.04), rgba(6,182,212,0.04)); border-color: rgba(139,92,246,0.2); }
.adv-fcard-head { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.adv-fcard-head .icon { font-size: 20px; }
.adv-fcard-head .title { font-size: 15px; font-weight: 700; color: #e2e8f0; }
.adv-fcard-head .remove { margin-left: auto; background: none; border: none; color: #f87171; cursor: pointer; font-size: 18px; padding: 2px; }
.adv-fcard-head .hint { margin-left: auto; font-size: 11px; color: #64748b; }
.adv-fcard-preview { width: 100%; height: 100px; border-radius: 12px; object-fit: cover; border: 1px solid rgba(255,255,255,0.06); display: block; }
.adv-fcard-btns { display: flex; gap: 10px; }
.adv-fcard-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 12px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); color: #94a3b8; -webkit-appearance: none; appearance: none; transition: all .15s; }
.adv-fcard-btn:hover { border-color: rgba(139,92,246,0.3); color: #c4b5fd; background: rgba(139,92,246,0.04); }
.adv-fcard-btn.ai { background: linear-gradient(135deg, rgba(124,58,237,0.1), rgba(6,182,212,0.1)); color: #c4b5fd; border-color: rgba(139,92,246,0.2); }
.adv-fcard-btn.ai:disabled { opacity: 0.5; }
.adv-fcard-attached { font-size: 13px; color: #94a3b8; }

/* Ref Images specific */
.adv-ref-grid { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.adv-ref-thumb { position: relative; width: 60px; height: 60px; flex-shrink: 0; }
.adv-ref-thumb img { width: 100%; height: 100%; border-radius: 10px; object-fit: cover; border: 1px solid rgba(255,255,255,0.08); display: block; }
.adv-ref-thumb .label { position: absolute; bottom: -3px; left: 0; right: 0; text-align: center; font-size: 9px; color: #c4b5fd; font-weight: 700; }
.adv-ref-thumb .del { position: absolute; top: -4px; right: -4px; width: 18px; height: 18px; border-radius: 50%; background: #ef4444; color: #fff; border: none; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1; }
.adv-ref-add { width: 60px; height: 60px; border-radius: 10px; border: 2px dashed rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; background: none; -webkit-appearance: none; appearance: none; transition: border-color .2s; }
.adv-ref-add:hover { border-color: rgba(139,92,246,0.3); }

/* Library */
.adv-library { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 20px; margin-bottom: 24px; }
.adv-library-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.adv-library-head span { font-size: 14px; font-weight: 700; color: #e2e8f0; }
.adv-library-head button { background: none; border: none; color: #94a3b8; cursor: pointer; }
.adv-library-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; max-height: 180px; overflow-y: auto; }
@media (max-width: 900px) { .adv-library-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 640px) { .adv-library-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 480px) { .adv-library-grid { grid-template-columns: repeat(2, 1fr); } }
.adv-library-grid img { width: 100%; height: 64px; border-radius: 10px; object-fit: cover; cursor: pointer; border: 1px solid rgba(255,255,255,0.05); display: block; transition: border-color .15s; }
.adv-library-grid img:hover { border-color: rgba(139,92,246,0.4); }

/* Generate Button */
.adv-generate { width: 100%; padding: 18px; border-radius: 18px; font-weight: 700; font-size: 16px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 10px; color: #fff; background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%); box-shadow: 0 6px 28px rgba(124,58,237,0.25); -webkit-appearance: none; appearance: none; transition: all .2s; }
.adv-generate:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(124,58,237,0.35); }
.adv-generate:disabled { opacity: 0.4; cursor: default; background: rgba(255,255,255,0.04); color: #475569; box-shadow: none; transform: none; }

/* Generating / Done phases */
.adv-gen-card { max-width: 560px; margin: 0 auto; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; }
.adv-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: linear-gradient(135deg, #0f172a, #1e293b); }
.adv-gen-preview img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; }
.adv-gen-preview .badges { position: absolute; top: 14px; left: 14px; display: flex; gap: 8px; }
.adv-gen-badge { padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
.adv-gen-info { padding: 20px 24px; }
.adv-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.05); overflow: hidden; }
.adv-progress-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #7c3aed, #06b6d4); transition: width 1s ease; }

.adv-done-card { max-width: 680px; margin: 0 auto; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; margin-bottom: 20px; }
.adv-done-card video { width: 100%; display: block; }
.adv-done-btns { display: flex; gap: 14px; max-width: 680px; margin: 0 auto; }
@media (max-width: 640px) { .adv-done-btns { flex-direction: column; } .adv-done-btns button, .adv-done-btns a { width: 100%; text-align: center; justify-content: center; } }
.adv-btn-secondary { flex: 1; padding: 14px; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(139,92,246,0.2); background: rgba(139,92,246,0.08); color: #c4b5fd; -webkit-appearance: none; appearance: none; transition: all .15s; }
.adv-btn-secondary:hover { background: rgba(139,92,246,0.14); }
.adv-btn-primary { padding: 14px 24px; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; text-decoration: none; -webkit-appearance: none; appearance: none; transition: all .15s; }
.adv-btn-primary:hover { transform: translateY(-1px); }

@keyframes adv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.adv-spin { animation: adv-spin 1s linear infinite; }

/* Mode Tabs */
.adv-mode-tabs { display: flex; gap: 4px; margin-bottom: 24px; padding: 5px; border-radius: 16px; background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.05); overflow-x: auto; scrollbar-width: none; }
.adv-mode-tabs::-webkit-scrollbar { display: none; }
.adv-mode-tab { flex: 1; padding: 12px 16px; border-radius: 12px; border: none; background: transparent; color: #64748b; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; }
.adv-mode-tab:hover { color: #94a3b8; background: rgba(255,255,255,0.02); }
.adv-mode-tab.active { background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(6,182,212,0.08)); color: #e2e8f0; border: 1px solid rgba(139,92,246,0.25); }
.adv-mode-tab .badge-new { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 6px; background: linear-gradient(135deg, #f59e0b, #ef4444); color: #fff; text-transform: uppercase; }

/* I2V Upload Zone */
.adv-i2v-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 48px 24px; border-radius: 20px; border: 2px dashed rgba(139,92,246,0.2); background: rgba(139,92,246,0.03); cursor: pointer; transition: all 0.2s; margin-bottom: 20px; }
.adv-i2v-zone:hover { border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.06); }
.adv-i2v-zone.has-image { border-style: solid; border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.03); padding: 14px; }
.adv-i2v-zone .preview { width: 100%; max-height: 300px; border-radius: 14px; object-fit: contain; }
.adv-i2v-zone .icon { font-size: 40px; color: #7c3aed; }
.adv-i2v-zone .label { font-size: 15px; color: #94a3b8; font-weight: 500; }
.adv-i2v-zone .sublabel { font-size: 12px; color: #475569; }
.adv-i2v-remove { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.6); border: none; border-radius: 50%; width: 30px; height: 30px; color: #f87171; cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center; }

/* Extend Panel */
.adv-extend-panel { padding: 20px; border-radius: 18px; background: rgba(139,92,246,0.05); border: 1px solid rgba(139,92,246,0.18); margin-top: 16px; }
.adv-extend-panel h4 { font-size: 14px; font-weight: 700; color: #c4b5fd; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
.adv-extend-row { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.adv-extend-input { flex: 1; min-width: 180px; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); color: #e2e8f0; font-size: 14px; }
.adv-extend-input::placeholder { color: #475569; }
.adv-btn-extend { padding: 12px 20px; border-radius: 12px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; white-space: nowrap; transition: all .15s; }
.adv-btn-extend:hover { transform: translateY(-1px); }
.adv-btn-extend:disabled { opacity: 0.4; cursor: default; transform: none; }
`

function CustomSelect({ value, onChange, options, minWidth = '140px' }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        function handleClickOutside(event) {
            if (ref.current && !ref.current.contains(event.target)) setOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [ref])

    const selectedOpt = options.find(o => o.value === value) || options[0]

    return (
        <div ref={ref} style={{ position: 'relative', minWidth }}>
            <button 
                type="button"
                onClick={() => setOpen(!open)}
                className={`adv-select-btn ${open ? 'open' : ''}`}
            >
                <span style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    {selectedOpt?.icon && <span>{selectedOpt.icon}</span>}
                    {selectedOpt?.label}
                </span>
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#64748b', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>expand_more</span>
            </button>
            {open && (
                <div className="adv-select-menu">
                    {options.map(opt => (
                        <button 
                            key={opt.value} 
                            type="button"
                            className={`adv-select-item ${opt.value === value ? 'selected' : ''}`}
                            onClick={() => { onChange(opt.value); setOpen(false) }}
                        >
                            {opt.icon && <span>{opt.icon}</span>}
                            {opt.label}
                            {opt.value === value && <span className="material-symbols-outlined" style={{ fontSize: '14px', marginLeft:'auto', color:'#c4b5fd' }}>check</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function AdvancedMode({ activeBrand, initialData }) {
    const [model, setModel] = useState('seedance-2.0')
    const [prompt, setPrompt] = useState('')
    const [duration, setDuration] = useState(6)
    const [aspectRatio, setAspectRatio] = useState('16:9')
    const [quality, setQuality] = useState('fast')
    const [phase, setPhase] = useState('compose')
    const [videoMode, setVideoMode] = useState('t2v') // 't2v' | 'i2v'
    const [i2vImage, setI2vImage] = useState(null) // { url, source }
    const [extending, setExtending] = useState(false)
    const [showExtendPanel, setShowExtendPanel] = useState(false)
    const [extendPrompt, setExtendPrompt] = useState('')
    const [extendDuration, setExtendDuration] = useState(5)
    const i2vRef = useRef(null)

    const [firstFrame, setFirstFrame] = useState(null)
    const [lastFrame, setLastFrame] = useState(null)
    const [refImages, setRefImages] = useState([])
    const [refVideo, setRefVideo] = useState(null)
    const [refAudio, setRefAudio] = useState(null)

    const [enhancing, setEnhancing] = useState(false)
    const [generatingFrame, setGeneratingFrame] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [generation, setGeneration] = useState(null)
    const [projectId, setProjectId] = useState(null)
    const [showLibrary, setShowLibrary] = useState(false)
    const [libraryFor, setLibraryFor] = useState(null)
    const [libraryImages, setLibraryImages] = useState([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [showAutocomplete, setShowAutocomplete] = useState(false)

    const firstFrameRef = useRef(null)
    const lastFrameRef = useRef(null)
    const refImgRef = useRef(null)
    const refVideoRef = useRef(null)
    const refAudioRef = useRef(null)
    const pollRef = useRef(null)
    const promptRef = useRef(null)

    const m = MODELS[model] || MODELS['seedance-2.0']
    const credits = Math.ceil(m.cost * duration * 30)

    // ── Refill from initialData (history re-use) ──
    useEffect(() => {
        if (!initialData) return
        if (initialData.prompt) setPrompt(initialData.prompt)
        if (initialData.model && MODELS[initialData.model]) setModel(initialData.model)
        if (initialData.duration) setDuration(initialData.duration)
        if (initialData.aspectRatio) setAspectRatio(initialData.aspectRatio)
        if (initialData.quality) setQuality(initialData.quality)
        if (initialData.firstImageUrl) setFirstFrame({ url: initialData.firstImageUrl, source: 'refill' })
        if (initialData.lastImageUrl) setLastFrame({ url: initialData.lastImageUrl, source: 'refill' })
        if (initialData.referenceImages?.length > 0) {
            setRefImages(initialData.referenceImages.map((r, i) => ({
                id: `refill-${i}-${Date.now()}`, url: r.url || r, label: r.label || `@image${i + 1}`, uploading: false
            })))
        }
        setPhase('compose')
        setGeneration(null)
        setError('')
    }, [initialData])

    useEffect(() => {
        if (duration < m.dur[0]) setDuration(m.dur[0])
        if (duration > m.dur[1]) setDuration(m.dur[1])
        if (!m.ratios.includes(aspectRatio)) setAspectRatio(m.ratios[0])
        if (!m.has.lastFrame) setLastFrame(null)
        if (!m.has.refVideo) setRefVideo(null)
        if (!m.has.refAudio) setRefAudio(null)
        if (!m.has.refImages) setRefImages([])
    }, [model])

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

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

    // ── Upload base64 → hosted URL ──
    async function uploadImage(base64DataUri) {
        try {
            const d = await api('/video-studio/upload-image', {
                method: 'POST', body: JSON.stringify({ imageData: base64DataUri }),
            })
            return d.url || base64DataUri
        } catch { return base64DataUri }
    }

    // ── File uploads (auto-upload to get hosted URLs) ──
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
        const f = e.target.files?.[0]; if (!f) return
        const r = new FileReader()
        r.onload = async () => {
            const id = `r${Date.now()}`
            setRefImages(prev => [...prev, { id, url: r.result, label: `@image${prev.length + 1}`, uploading: true }])
            const hostedUrl = await uploadImage(r.result)
            setRefImages(prev => prev.map(img => img.id === id ? { ...img, url: hostedUrl, uploading: false } : img))
        }
        r.readAsDataURL(f)
    }
    function onMediaFile(e, setter) {
        const f = e.target.files?.[0]; if (!f) return
        setter(prev => {
            if (prev?.url?.startsWith('blob:')) URL.revokeObjectURL(prev.url)
            return { url: URL.createObjectURL(f), name: f.name }
        })
    }

    // ── @ Autocomplete ──
    function handlePromptChange(e) {
        const val = e.target.value
        setPrompt(val)
        // Check if user just typed @
        const cursorPos = e.target.selectionStart
        const textBeforeCursor = val.substring(0, cursorPos)
        if (textBeforeCursor.endsWith('@') && refImages.length > 0) {
            setShowAutocomplete(true)
        } else {
            setShowAutocomplete(false)
        }
    }
    function insertTag(index) {
        const tag = `@image${index + 1}`
        const textarea = promptRef.current
        if (textarea) {
            const cursorPos = textarea.selectionStart
            // Replace the @ with the full tag
            const before = prompt.substring(0, cursorPos - 1) // remove the @
            const after = prompt.substring(cursorPos)
            setPrompt(before + tag + ' ' + after)
        } else {
            setPrompt(prev => prev + tag + ' ')
        }
        setShowAutocomplete(false)
    }

    // ── AI First Frame ──
    async function generateFirstFrame() {
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setGeneratingFrame(true); setError('')
        try {
            const d = await api('/video-studio/generate-first-frame', {
                method: 'POST', body: JSON.stringify({ prompt: prompt.trim(), brandId: activeBrand?._id }),
            })
            if (d.imageUrl) setFirstFrame({ url: d.imageUrl, source: 'ai' })
            else setError('Could not generate image')
        } catch (e) { setError(e.message) }
        setGeneratingFrame(false)
    }

    // ── Enhance ──
    async function handleEnhance() {
        if (!prompt.trim()) return
        setEnhancing(true); setError('')
        try {
            const d = await api('/video-studio/enhance-prompt', {
                method: 'POST', body: JSON.stringify({ prompt, model, duration, aspectRatio, brandId: activeBrand?._id, style: 'adfilm' }),
            })
            setPrompt(d.enhancedPrompt || prompt)
        } catch (e) { setError(e.message) }
        setEnhancing(false)
    }

    // ── Build prompt — leave @image tags as descriptive context ──
    // Images are sent separately via referenceImages array → PiAPI's image_urls
    function buildFinalPrompt() {
        return prompt.trim()
    }

    // ── Generate (T2V) ──
    async function handleGenerate() {
        if (!prompt.trim()) { setError('Write your ad idea first'); return }
        setLoading(true); setError('')
        try {
            const allRefUrls = refImages.map(r => r.url).filter(Boolean)
            console.log(`🎬 Sending ${allRefUrls.length} ref images to backend`)

            const d = await api('/video-studio/advanced/generate', {
                method: 'POST',
                body: JSON.stringify({
                    prompt: buildFinalPrompt(), model, duration, resolution: '1080p', aspectRatio,
                    firstImageUrl: firstFrame?.url || '',
                    lastImageUrl: lastFrame?.url || '',
                    generateAudio: !!m.has.audio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: allRefUrls,
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // ── Generate (I2V) ──
    async function handleI2VGenerate() {
        if (!i2vImage?.url) { setError('Upload an image first'); return }
        setLoading(true); setError('')
        try {
            const d = await api('/video-studio/advanced/image-to-video', {
                method: 'POST',
                body: JSON.stringify({
                    imageUrl: i2vImage.url,
                    prompt: prompt.trim() || 'Animate this image with natural cinematic motion',
                    duration, aspectRatio, qualityMode: quality,
                    brandId: activeBrand?._id || null,
                    referenceImages: refImages.map(r => r.url).filter(Boolean),
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
        } catch (e) { setError(e.message) }
        setLoading(false)
    }

    // ── Extend Video ──
    async function handleExtend() {
        if (!projectId) return
        setExtending(true); setError('')
        try {
            const d = await api('/video-studio/extend-video', {
                method: 'POST',
                body: JSON.stringify({
                    projectId,
                    prompt: extendPrompt.trim(),
                    duration: extendDuration,
                    qualityMode: quality,
                }),
            })
            setProjectId(d.project._id); setGeneration(d.project.generation); setPhase('generating'); startPolling(d.project._id)
            setShowExtendPanel(false); setExtendPrompt('')
        } catch (e) { setError(e.message) }
        setExtending(false)
    }

    // ── I2V file handler ──
    function onI2VFile(e) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = reader.result
            setI2vImage({ url: base64, source: 'upload', uploading: true })
            const hosted = await uploadImage(base64)
            if (hosted) setI2vImage({ url: hosted, source: 'upload', uploading: false })
            else setI2vImage({ url: base64, source: 'upload', uploading: false })
        }
        reader.readAsDataURL(file)
    }

    const startPolling = useCallback((pid) => {
        if (pollRef.current) clearInterval(pollRef.current)
        pollRef.current = setInterval(async () => {
            try {
                const d = await api(`/video-studio/${pid}/status`)
                setGeneration(d.project.generation)
                if (['COMPLETED'].includes(d.project.generation?.status) || d.project.status === 'critique') { clearInterval(pollRef.current); setPhase('done') }
                else if (d.project.generation?.status === 'FAILED') { clearInterval(pollRef.current); setError(d.project.generation?.error || 'Failed'); setPhase('done') }
            } catch { }
        }, 5000)
    }, [])

    // Build dynamic feature list based on model
    const features = []
    if (m.has.firstFrame) features.push('firstFrame')
    if (m.has.lastFrame) features.push('lastFrame')
    if (m.has.refImages) features.push('refImages')
    if (m.has.refVideo) features.push('refVideo')
    if (m.has.refAudio) features.push('refAudio')

    // ════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════
    return (
        <>
            <style>{css}</style>

            {/* ── GENERATING ── */}
            {phase === 'generating' && (
                <div style={{ padding: '60px 20px' }}>
                    <div className="adv-gen-card">
                        <div className="adv-gen-preview">
                            {(firstFrame?.url || i2vImage?.url) && <img src={i2vImage?.url || firstFrame?.url} alt="" />}
                            <div className="badges">
                                <span className="adv-gen-badge" style={{ background: 'rgba(139,92,246,0.85)', color: '#fff' }}>{generation?.progress || 5}%</span>
                                <span className="adv-gen-badge" style={{ background: 'rgba(0,0,0,0.5)', color: '#ccc' }}>{videoMode === 'i2v' ? '🖼️→🎬 I2V' : m.name}</span>
                            </div>
                        </div>
                        <div className="adv-gen-info">
                            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>{videoMode === 'i2v' ? '🖼️ Animating your image — usually 1-3 minutes' : '🎬 Creating your ad film — usually 1-3 minutes'}</p>
                            <div className="adv-progress-bar"><div className="adv-progress-fill" style={{ width: `${generation?.progress || 5}%` }} /></div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── DONE ── */}
            {phase === 'done' && (
                <div style={{ padding: '20px' }}>
                    {generation?.videoUrl ? (
                        <>
                            <div className="adv-done-card"><video controls src={projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl} /></div>
                            <div className="adv-done-btns">
                                <button className="adv-btn-secondary" onClick={() => { setPhase('compose'); setGeneration(null); setShowExtendPanel(false) }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit</span> Edit & Retry
                                </button>
                                {generation?.provider === 'piapi' && (
                                    <button className="adv-btn-secondary" onClick={() => setShowExtendPanel(v => !v)} style={showExtendPanel ? { borderColor: 'rgba(139,92,246,0.4)', background: 'rgba(139,92,246,0.08)' } : {}}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span> Extend Video
                                    </button>
                                )}
                                <button className="adv-btn-primary" onClick={async () => {
                                    try {
                                        const videoSrc = projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl
                                        const resp = await fetch(videoSrc)
                                        const blob = await resp.blob()
                                        const blobUrl = URL.createObjectURL(blob)
                                        const a = document.createElement('a')
                                        a.href = blobUrl
                                        a.download = 'video.mp4'
                                        document.body.appendChild(a)
                                        a.click()
                                        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl) }, 100)
                                    } catch { const videoSrc = projectId ? `${API_BASE}/video-studio/${projectId}/video` : generation.videoUrl; window.open(videoSrc, '_blank') }
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span> Download
                                </button>
                            </div>
                            {/* Extend Panel */}
                            {showExtendPanel && (
                                <div className="adv-extend-panel">
                                    <h4><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_circle</span> Extend this video</h4>
                                    <div className="adv-extend-row">
                                        <input className="adv-extend-input" value={extendPrompt} onChange={e => setExtendPrompt(e.target.value)} placeholder="What should happen next? (optional)" />
                                        <CustomSelect 
                                            value={extendDuration} 
                                            onChange={setExtendDuration} 
                                            options={[4, 5, 6, 7, 8, 9, 10].map(d => ({ value: d, label: `${d}s` }))} 
                                            minWidth="100px" 
                                        />
                                        <button className="adv-btn-extend" onClick={handleExtend} disabled={extending}>
                                            {extending ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '14px' }}>progress_activity</span> Extending...</>
                                                : <>🔗 Extend +{extendDuration}s</>}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#475569' }}>videocam_off</span>
                            <p style={{ color: '#64748b', fontSize: '14px', margin: '12px 0 16px' }}>{error || 'Generation failed'}</p>
                            <button className="adv-btn-secondary" onClick={() => { setPhase('compose'); setError('') }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span> Try Again
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── COMPOSE ── */}
            {phase === 'compose' && (
                <div className="adv-wrap">
                    {error && (
                        <div className="adv-err">
                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>error</span>
                            <span style={{ flex: 1 }}>{error}</span>
                            <button onClick={() => setError('')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span></button>
                        </div>
                    )}

                    {/* Mode Toggle */}
                    <div className="adv-mode-tabs">
                        <button className={`adv-mode-tab ${videoMode === 't2v' ? 'active' : ''}`} onClick={() => setVideoMode('t2v')}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>text_fields</span> Text to Video
                        </button>
                        <button className={`adv-mode-tab ${videoMode === 'i2v' ? 'active' : ''}`} onClick={() => setVideoMode('i2v')}>
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>image</span> Image to Video <span className="badge-new">New</span>
                        </button>
                    </div>

                    {/* ═══ I2V MODE ═══ */}
                    {videoMode === 'i2v' && (
                        <>
                            {/* Image Upload Zone */}
                            <div className={`adv-i2v-zone ${i2vImage ? 'has-image' : ''}`} onClick={() => !i2vImage && i2vRef.current?.click()} style={{ position: 'relative' }}>
                                {i2vImage ? (
                                    <>
                                        <img className="preview" src={i2vImage.url} alt="Source" />
                                        {i2vImage.uploading && <p style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>Uploading...</p>}
                                        <button className="adv-i2v-remove" onClick={e => { e.stopPropagation(); setI2vImage(null) }}>×</button>
                                    </>
                                ) : (
                                    <>
                                        <span className="icon material-symbols-outlined">add_photo_alternate</span>
                                        <span className="label">Upload image to animate</span>
                                        <span className="sublabel">Product photo, brand image, or any still — Seedance will bring it to life</span>
                                    </>
                                )}
                            </div>
                            <input ref={i2vRef} type="file" accept="image/*" onChange={onI2VFile} style={{ display: 'none' }} />

                            {/* Motion Prompt */}
                            <div className="adv-prompt-card">
                                <textarea
                                    className="adv-textarea"
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    placeholder="Describe the motion... e.g. 'Camera slowly zooms in, product rotates 360°, soft light sweep'"
                                    style={{ minHeight: '80px' }}
                                />
                                <div className="adv-prompt-footer">
                                    <span style={{ fontSize: '11px', color: '#475569' }}>💡 Describe how the image should move, not what it looks like</span>
                                    <span className="adv-chars">{prompt.length} chars</span>
                                </div>
                            </div>

                            {/* Ref Images for I2V */}
                            <div className="adv-features" style={{ marginTop: '8px' }}>
                                <div className={`adv-fcard ${refImages.length > 0 ? 'has-content' : ''}`}>
                                    <div className="adv-fcard-head">
                                        <span className="icon">🎨</span>
                                        <span className="title">Reference Images</span>
                                        <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 'auto' }}>Style, scene, or character refs</span>
                                    </div>
                                    {refImages.length > 0 && (
                                        <div className="adv-tags" style={{ padding: '8px 12px' }}>
                                            {refImages.map((img, i) => (
                                                <div key={img.id} className="adv-tag">
                                                    <img src={img.url} alt="" />
                                                    <span>ref {i + 1}</span>
                                                    {img.uploading && <span className="uploading">uploading...</span>}
                                                    <button onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => refImgRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add_photo_alternate</span> Add Ref
                                        </button>
                                        <button className="adv-fcard-btn" onClick={() => openLibrary('ref')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span> Library
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ═══ T2V MODE (original) ═══ */}
                    {videoMode === 't2v' && (
                        <div className="adv-prompt-card" style={{ position: 'relative' }}>
                            <textarea
                                ref={promptRef}
                                className="adv-textarea"
                                value={prompt}
                                onChange={handlePromptChange}
                                placeholder={activeBrand?.name
                                    ? `What's your ${activeBrand.name} ad about? Type @ to tag ref images...`
                                    : `What's your ad about? Type @ to tag ref images...`}
                            />
                            {/* @ Autocomplete popup */}
                            {showAutocomplete && refImages.length > 0 && (
                                <div className="adv-autocomplete">
                                    {refImages.map((img, i) => (
                                        <button key={img.id} className="adv-ac-item" onClick={() => insertTag(i)}>
                                            <img src={img.url} alt="" />
                                            <span>@image{i + 1}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            {/* Ref image tags */}
                            {refImages.length > 0 && (
                                <div className="adv-tags">
                                    {refImages.map((img, i) => {
                                        const isLinked = prompt.includes(`@image${i + 1}`)
                                        return (
                                            <div key={img.id} className="adv-tag" style={isLinked ? { borderColor: 'rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.08)' } : {}}>
                                                <img src={img.url} alt="" />
                                                <span style={isLinked ? { color: '#4ade80' } : {}}>@image{i + 1}</span>
                                                {isLinked && <span style={{ fontSize: 10 }}>🔗</span>}
                                                {!isLinked && !img.uploading && <span style={{ fontSize: 9, color: '#64748b' }}>type @ to link</span>}
                                                {img.uploading && <span className="uploading">uploading...</span>}
                                                <button onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            <div className="adv-prompt-footer">
                                <span className="adv-chars">{prompt.length} chars</span>
                                <CreditTooltipWrapper action="promptEnhance">
                                    <button className="adv-enhance" onClick={handleEnhance} disabled={enhancing || !prompt.trim()}>
                                        {enhancing ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '14px' }}>progress_activity</span> Enhancing...</> : <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>auto_awesome</span> Enhance as Ad Film</>}
                                    </button>
                                </CreditTooltipWrapper>
                            </div>
                        </div>
                    )}

                    {/* §2 — CONFIG ROW */}
                    <div className="adv-config">
                        <div className="adv-config-item" style={{ zIndex: 40 }}>
                            <span className="adv-config-label">Model</span>
                            <CustomSelect 
                                value={model} 
                                onChange={setModel} 
                                options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, icon: mod.icon }))} 
                                minWidth="180px" 
                            />
                        </div>
                        <div className="adv-config-item" style={{ zIndex: 30 }}>
                            <span className="adv-config-label">Ratio</span>
                            <CustomSelect 
                                value={aspectRatio} 
                                onChange={setAspectRatio} 
                                options={m.ratios.map(r => ({ value: r, label: r }))} 
                                minWidth="100px" 
                            />
                        </div>
                        <div className="adv-config-item" style={{ zIndex: 20 }}>
                            <span className="adv-config-label">Duration</span>
                            <CustomSelect 
                                value={duration} 
                                onChange={setDuration} 
                                options={Array.from({ length: m.dur[1] - m.dur[0] + 1 }, (_, i) => m.dur[0] + i).map(d => ({ value: d, label: `${d}s` }))} 
                                minWidth="100px" 
                            />
                        </div>
                        <div className="adv-config-item">
                            <span className="adv-config-label">Quality</span>
                            <div className="adv-quality-row">
                                <button className={`adv-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}>⚡ Fast</button>
                                <button className={`adv-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}>✨ Quality</button>
                            </div>
                        </div>
                    </div>

                    {/* §3 — DYNAMIC FEATURE CARDS (T2V only) */}
                    {videoMode === 't2v' && <div className="adv-features">
                        {/* First Frame */}
                        {m.has.firstFrame && (
                            <div className={`adv-fcard ${firstFrame ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">📸</span>
                                    <span className="title">First Frame</span>
                                    {firstFrame && <button className="remove" onClick={() => setFirstFrame(null)}>×</button>}
                                </div>
                                {firstFrame ? (
                                    <img className="adv-fcard-preview" src={firstFrame.url} alt="First frame" />
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => firstFrameRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload
                                        </button>
                                        <button className="adv-fcard-btn ai" onClick={generateFirstFrame} disabled={generatingFrame}>
                                            {generatingFrame ? <span className="material-symbols-outlined adv-spin" style={{ fontSize: '16px' }}>progress_activity</span> : '✨'} AI
                                        </button>
                                        <button className="adv-fcard-btn" onClick={() => loadLibrary('first')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span>
                                        </button>
                                    </div>
                                )}
                                <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Last Frame */}
                        {m.has.lastFrame && (
                            <div className={`adv-fcard ${lastFrame ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎬</span>
                                    <span className="title">Last Frame</span>
                                    {lastFrame && <button className="remove" onClick={() => setLastFrame(null)}>×</button>}
                                </div>
                                {lastFrame ? (
                                    <img className="adv-fcard-preview" src={lastFrame.url} alt="Last frame" />
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => lastFrameRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload
                                        </button>
                                        <button className="adv-fcard-btn" onClick={() => loadLibrary('last')}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span>
                                        </button>
                                    </div>
                                )}
                                <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Images */}
                        {m.has.refImages && (
                            <div className={`adv-fcard ${refImages.length > 0 ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎞️</span>
                                    <span className="title">Ref Images</span>
                                    <span className="hint">Use @image1 in prompt</span>
                                </div>
                                <div className="adv-ref-grid">
                                    {refImages.map((img, i) => (
                                        <div key={img.id} className="adv-ref-thumb">
                                            <img src={img.url} alt="" />
                                            <span className="label">@image{i + 1}</span>
                                            <button className="del" onClick={() => setRefImages(prev => prev.filter(r => r.id !== img.id))}>×</button>
                                        </div>
                                    ))}
                                    <button className="adv-ref-add" onClick={() => refImgRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>add</span>
                                    </button>
                                </div>
                                <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Video */}
                        {m.has.refVideo && (
                            <div className={`adv-fcard ${refVideo ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🎥</span>
                                    <span className="title">Ref Video</span>
                                    {refVideo && <button className="remove" onClick={() => setRefVideo(null)}>×</button>}
                                </div>
                                {refVideo ? (
                                    <p className="adv-fcard-attached">📎 {refVideo.name || 'Video attached'}</p>
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => refVideoRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload Video
                                        </button>
                                    </div>
                                )}
                                <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                            </div>
                        )}

                        {/* Ref Audio */}
                        {m.has.refAudio && (
                            <div className={`adv-fcard ${refAudio ? 'has-content' : ''}`}>
                                <div className="adv-fcard-head">
                                    <span className="icon">🔊</span>
                                    <span className="title">Ref Audio</span>
                                    {refAudio && <button className="remove" onClick={() => setRefAudio(null)}>×</button>}
                                </div>
                                {refAudio ? (
                                    <p className="adv-fcard-attached">🎵 {refAudio.name || 'Audio attached'}</p>
                                ) : (
                                    <div className="adv-fcard-btns">
                                        <button className="adv-fcard-btn" onClick={() => refAudioRef.current?.click()}>
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span> Upload Audio
                                        </button>
                                    </div>
                                )}
                                <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />
                            </div>
                        )}
                    </div>}

                    {/* Library Modal */}
                    {showLibrary && (
                        <div className="adv-library">
                            <div className="adv-library-head">
                                <span>📚 Image Library</span>
                                <button onClick={() => setShowLibrary(false)}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                </button>
                            </div>
                            {libraryLoading ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>Loading...</p>
                                : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px 0' }}>No images yet</p>
                                    : <div className="adv-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                            }
                        </div>
                    )}

                    {/* §4 — GENERATE BUTTON */}
                    {videoMode === 'i2v' ? (
                        <button className="adv-generate" onClick={handleI2VGenerate} disabled={loading || !i2vImage?.url}>
                            {loading ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '18px' }}>progress_activity</span> Animating image...</> : <>🖼️→🎬 Animate Image · {credits} credits · ~2 min</>}
                        </button>
                    ) : (
                        <button className="adv-generate" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                            {loading ? <><span className="material-symbols-outlined adv-spin" style={{ fontSize: '18px' }}>progress_activity</span> Submitting to {m.name}...</> : <>🎬 Generate Ad Film · {credits} credits · ~2 min</>}
                        </button>
                    )}
                </div>
            )}
        </>
    )
}

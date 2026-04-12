/**
 * YouTubeStudioSettings — Settings Tab for YouTube Studio
 *
 * Features:
 * 1. Channel Profile (name, logo, niche, language defaults)
 * 2. Thumbnail Templates (gallery: starters + user's own, with CRUD)
 * 3. Title & Description Preferences
 * 4. Language Configuration (title, description, thumbnail text language)
 */

import { useState, useEffect, useCallback } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`

async function api(path, opts = {}) {
    const token = localStorage.getItem('mantram_token')
    const res = await fetch(`${API_BASE}${path}`, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || 'Request failed')
    return data
}

// ── Constants ────────────────────────────────────────────────────────────────

const THEMES = [
    { value: 'general', label: 'General', emoji: '🎨' },
    { value: 'drama', label: 'Drama', emoji: '🎬' },
    { value: 'music', label: 'Music', emoji: '🎵' },
    { value: 'news', label: 'News', emoji: '📰' },
    { value: 'education', label: 'Education', emoji: '🎓' },
    { value: 'comedy', label: 'Comedy', emoji: '😂' },
    { value: 'lifestyle', label: 'Lifestyle', emoji: '🌅' },
    { value: 'sports', label: 'Sports', emoji: '⚡' },
    { value: 'tech', label: 'Tech', emoji: '💻' },
    { value: 'reality-tv', label: 'Reality TV', emoji: '😱' },
    { value: 'finance', label: 'Finance', emoji: '📈' },
    { value: 'devotional', label: 'Devotional', emoji: '🙏' },
    { value: 'politics', label: 'Politics', emoji: '🏛️' },
]

const LANGUAGES = [
    { value: 'english', label: 'English', script: 'Latin' },
    { value: 'hindi', label: 'हिंदी (Hindi)', script: 'Devanagari' },
    { value: 'hinglish', label: 'Hinglish', script: 'Mixed' },
    { value: 'marathi', label: 'मराठी (Marathi)', script: 'Devanagari' },
    { value: 'tamil', label: 'தமிழ் (Tamil)', script: 'Tamil' },
    { value: 'telugu', label: 'తెలుగు (Telugu)', script: 'Telugu' },
    { value: 'bengali', label: 'বাংলা (Bengali)', script: 'Bengali' },
    { value: 'kannada', label: 'ಕನ್ನಡ (Kannada)', script: 'Kannada' },
    { value: 'gujarati', label: 'ગુજરાતી (Gujarati)', script: 'Gujarati' },
    { value: 'punjabi', label: 'ਪੰਜਾਬੀ (Punjabi)', script: 'Gurmukhi' },
    { value: 'urdu', label: 'اردو (Urdu)', script: 'Nastaliq' },
    { value: 'arabic', label: 'العربية (Arabic)', script: 'Arabic' },
    { value: 'french', label: 'Français (French)', script: 'Latin' },
    { value: 'spanish', label: 'Español (Spanish)', script: 'Latin' },
    { value: 'japanese', label: '日本語 (Japanese)', script: 'Kanji' },
]

const COMPOSITIONS = [
    { value: 'center', label: 'Center', desc: 'Subject centered' },
    { value: 'left-subject', label: 'Left', desc: 'Subject on left, text right' },
    { value: 'right-subject', label: 'Right', desc: 'Subject on right, text left' },
    { value: 'split-dual', label: 'Split', desc: 'Two subjects facing each other' },
    { value: 'full-bleed', label: 'Full Bleed', desc: 'Subject fills the frame' },
    { value: 'portrait-crop', label: 'Portrait Crop', desc: 'Close-up face focus' },
]

const BG_STYLES = [
    { value: 'dramatic-dark', label: 'Dramatic Dark', preview: 'linear-gradient(135deg,#1a0000,#000)' },
    { value: 'vibrant-gradient', label: 'Vibrant Gradient', preview: 'linear-gradient(135deg,#7c3aed,#ec4899)' },
    { value: 'cinematic-blur', label: 'Cinematic Blur', preview: 'linear-gradient(135deg,#0a0a1a,#1a1a3a)' },
    { value: 'solid-color', label: 'Solid Color', preview: 'linear-gradient(135deg,#1e3a8a,#1e3a8a)' },
    { value: 'editorial-white', label: 'Editorial White', preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
    { value: 'neon-glow', label: 'Neon Glow', preview: 'linear-gradient(135deg,#0d0d1a,#1a003a)' },
    { value: 'bold-flat', label: 'Bold Flat', preview: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
    { value: 'watercolor', label: 'Watercolor', preview: 'linear-gradient(135deg,#fef9f0,#fde68a)' },
]

const LOGO_PLACEMENTS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'none']

// ── Section Component ────────────────────────────────────────────────────────

function SettingSection({ title, icon, children, subtitle }) {
    return (
        <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>{icon}</span>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h3>
            </div>
            {subtitle && <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--sys-text-muted)', paddingLeft: 26 }}>{subtitle}</p>}
            <div style={{ paddingLeft: 0 }}>{children}</div>
        </div>
    )
}

function Field({ label, hint, children }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--sys-text)' }}>{label}</label>
            {children}
            {hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{hint}</p>}
        </div>
    )
}

function TextInput({ value, onChange, placeholder, maxLength, type = 'text' }) {
    return (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} maxLength={maxLength}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13 }}
        />
    )
}

function Select({ value, onChange, options }) {
    return (
        <select value={value || ''} onChange={e => onChange(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13, cursor: 'pointer' }}>
            {options.map(o => (
                <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
            ))}
        </select>
    )
}

function Toggle({ value, onChange, label }) {
    return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
            <div onClick={() => onChange(!value)}
                style={{ width: 40, height: 22, borderRadius: 11, background: value ? 'var(--sys-primary)' : 'var(--sys-border)', transition: 'all .2s', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'all .2s' }} />
            </div>
            {label}
        </label>
    )
}

// ── Template Card ────────────────────────────────────────────────────────────

function TemplateCard({ template, isActive, onSelect, onEdit, onClone, onDelete, onSetDefault }) {
    const v = template.visual || {}
    const isStarter = template.isStarter
    const isDefault = template.isDefault

    return (
        <div style={{
            border: `2px solid ${isActive ? 'var(--sys-primary)' : isDefault ? '#22c55e' : 'var(--sys-border)'}`,
            borderRadius: 14, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', background: 'var(--sys-surface)', position: 'relative',
        }}
            onClick={() => onSelect(template)}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--sys-primary)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = isDefault ? '#22c55e' : 'var(--sys-border)' }}>

            {/* Color preview bar */}
            <div style={{ height: 6, background: v.primaryColor || '#ff0000' }} />

            {/* Preview palette strip */}
            <div style={{ height: 52, background: v.backgroundColor || '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0 }}
                    style={{ background: `linear-gradient(135deg, ${v.backgroundColor || '#000'} 0%, ${v.primaryColor || '#ff0000'}44 100%)`, height: '100%' }} />
                <span style={{ fontSize: 28, position: 'relative', zIndex: 1 }}>{template.emoji || '🎨'}</span>
            </div>

            <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</p>
                        <p style={{ margin: 0, fontSize: 10, color: 'var(--sys-text-muted)' }}>
                            {template.classification?.theme} · {template.classification?.language}
                        </p>
                    </div>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                    {isStarter && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: '#6366f115', color: '#6366f1', fontWeight: 700 }}>⭐ Starter</span>}
                    {isDefault && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: '#22c55e15', color: '#22c55e', fontWeight: 700 }}>✓ Default</span>}
                    {isActive && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 20, background: 'var(--sys-primary)', color: 'white', fontWeight: 700 }}>Selected</span>}
                </div>

                {/* Color swatches */}
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    {[v.primaryColor, v.secondaryColor, v.backgroundColor].filter(Boolean).map((c, i) => (
                        <div key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid var(--sys-border)' }} title={c} />
                    ))}
                    <span style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginLeft: 4, alignSelf: 'center' }}>{v.composition}</span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}
                    onClick={e => e.stopPropagation()}>
                    {!isDefault && (
                        <button onClick={() => onSetDefault(template._id)}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer' }}>
                            Set Default
                        </button>
                    )}
                    {isStarter ? (
                        <button onClick={() => onClone(template._id)}
                            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid var(--sys-primary)', background: 'transparent', color: 'var(--sys-primary)', cursor: 'pointer' }}>
                            Clone & Edit
                        </button>
                    ) : (
                        <>
                            <button onClick={() => onEdit(template)}
                                style={{ flex: 1, padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid var(--sys-border)', background: 'transparent', color: 'var(--sys-text)', cursor: 'pointer' }}>
                                Edit
                            </button>
                            <button onClick={() => onDelete(template._id)}
                                style={{ padding: '5px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #ef444433', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}>
                                🗑
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Template Editor Modal ─────────────────────────────────────────────────────

function TemplateEditor({ template, onSave, onClose }) {
    const isNew = !template?._id
    const [form, setForm] = useState({
        name: '', emoji: '🎨', description: '', tags: '',
        classification: { theme: 'general', language: 'english', showName: '', channel: '' },
        visual: {
            primaryColor: '#FF0000', secondaryColor: '#FFFFFF', backgroundColor: '#000000',
            backgroundStyle: 'dramatic-dark', composition: 'center',
            titleFont: 'poppins-black', titleColor: '#FFFFFF', titleShadow: 'hard-black',
            overlayMood: 'dramatic-vignette', energyLevel: 'energetic',
            logoPlacement: 'top-right', logoSize: 'small',
        },
        outputLanguage: { title: 'english', description: 'english' },
        generationPromptSuffix: '',
        ...(template || {}),
        tags: (template?.tags || []).join(', '),
    })

    const [saving, setSaving] = useState(false)

    const set = (path, value) => {
        setForm(prev => {
            const clone = JSON.parse(JSON.stringify(prev))
            const keys = path.split('.')
            let obj = clone
            for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
            obj[keys[keys.length - 1]] = value
            return clone
        })
    }

    async function handleSave() {
        setSaving(true)
        try {
            const payload = {
                ...form,
                tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
            }
            if (isNew) {
                await api('/youtube-studio/settings/templates', { method: 'POST', body: JSON.stringify(payload) })
            } else {
                await api(`/youtube-studio/settings/templates/${template._id}`, { method: 'PUT', body: JSON.stringify(payload) })
            }
            onSave()
        } catch (e) { alert('Save failed: ' + e.message) }
        setSaving(false)
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 16px', overflowY: 'auto' }}>
            <div style={{ background: 'var(--sys-surface)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px #00000066' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{isNew ? '✨ New Template' : '✏️ Edit Template'}</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--sys-text-muted)' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {/* Left column */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Template Name *">
                            <TextInput value={form.name} onChange={v => set('name', v)} placeholder="e.g. Sunday Special Drama" maxLength={60} />
                        </Field>
                    </div>

                    <Field label="Emoji Icon">
                        <TextInput value={form.emoji} onChange={v => set('emoji', v)} placeholder="🎨" maxLength={4} />
                    </Field>
                    <Field label="Tags (comma separated)">
                        <TextInput value={form.tags} onChange={v => set('tags', v)} placeholder="drama, hindi, reality-tv" />
                    </Field>

                    <Field label="Theme">
                        <Select value={form.classification?.theme} onChange={v => set('classification.theme', v)}
                            options={THEMES.map(t => ({ value: t.value, label: `${t.emoji} ${t.label}` }))} />
                    </Field>
                    <Field label="Language">
                        <Select value={form.classification?.language} onChange={v => set('classification.language', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>

                    <Field label="Show Name" hint="For specific shows (optional)">
                        <TextInput value={form.classification?.showName} onChange={v => set('classification.showName', v)} placeholder="e.g. Kaun Banega Crorepati" />
                    </Field>
                    <Field label="Channel" hint="Channel name or ID">
                        <TextInput value={form.classification?.channel} onChange={v => set('classification.channel', v)} placeholder="My Channel Name" />
                    </Field>

                    {/* Visual section */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ margin: '8px 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--sys-primary)', borderBottom: '1px solid var(--sys-border)', paddingBottom: 8 }}>
                            🎨 Visual Style
                        </p>
                    </div>

                    <Field label="Primary Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.primaryColor || '#FF0000'} onChange={e => set('visual.primaryColor', e.target.value)}
                                style={{ width: 44, height: 36, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <TextInput value={form.visual?.primaryColor} onChange={v => set('visual.primaryColor', v)} placeholder="#FF0000" maxLength={7} />
                        </div>
                    </Field>
                    <Field label="Secondary / Text Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.secondaryColor || '#FFFFFF'} onChange={e => set('visual.secondaryColor', e.target.value)}
                                style={{ width: 44, height: 36, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <TextInput value={form.visual?.secondaryColor} onChange={v => set('visual.secondaryColor', v)} placeholder="#FFFFFF" maxLength={7} />
                        </div>
                    </Field>
                    <Field label="Background Base Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.backgroundColor || '#000000'} onChange={e => set('visual.backgroundColor', e.target.value)}
                                style={{ width: 44, height: 36, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <TextInput value={form.visual?.backgroundColor} onChange={v => set('visual.backgroundColor', v)} placeholder="#000000" maxLength={7} />
                        </div>
                    </Field>
                    <Field label="Logo Placement">
                        <Select value={form.visual?.logoPlacement} onChange={v => set('visual.logoPlacement', v)}
                            options={LOGO_PLACEMENTS.map(p => ({ value: p, label: p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} />
                    </Field>

                    <Field label="Background Style" hint="Visual treatment for the scene">
                        <Select value={form.visual?.backgroundStyle} onChange={v => set('visual.backgroundStyle', v)}
                            options={BG_STYLES.map(s => ({ value: s.value, label: s.label }))} />
                    </Field>
                    <Field label="Composition">
                        <Select value={form.visual?.composition} onChange={v => set('visual.composition', v)}
                            options={COMPOSITIONS.map(c => ({ value: c.value, label: `${c.label} — ${c.desc}` }))} />
                    </Field>

                    <Field label="Energy Level">
                        <Select value={form.visual?.energyLevel} onChange={v => set('visual.energyLevel', v)}
                            options={['calm', 'energetic', 'intense', 'dramatic'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} />
                    </Field>
                    <Field label="Title Shadow Style">
                        <Select value={form.visual?.titleShadow} onChange={v => set('visual.titleShadow', v)}
                            options={['none', 'soft', 'hard-black', 'neon-glow', 'outlined'].map(v => ({ value: v, label: v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} />
                    </Field>

                    {/* Language output */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <p style={{ margin: '8px 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--sys-primary)', borderBottom: '1px solid var(--sys-border)', paddingBottom: 8 }}>
                            🌐 Output Language
                        </p>
                    </div>
                    <Field label="Title Language">
                        <Select value={form.outputLanguage?.title} onChange={v => set('outputLanguage.title', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                    <Field label="Description Language">
                        <Select value={form.outputLanguage?.description} onChange={v => set('outputLanguage.description', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>

                    {/* AI Prompt suffix */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="AI Style Directive" hint="Extra instructions injected into the thumbnail generation prompt for this template. Describe the visual style, mood, aesthetic in detail.">
                            <textarea value={form.generationPromptSuffix || ''} onChange={e => set('generationPromptSuffix', e.target.value)}
                                rows={3} placeholder="e.g. Cinematic Bollywood aesthetic, rich gold and deep red tones, dramatic theatrical lighting..."
                                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 12, resize: 'vertical' }} />
                        </Field>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose}
                        style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving || !form.name.trim()}
                        style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer' }}>
                        {saving ? 'Saving...' : isNew ? '✨ Create Template' : '✓ Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main Settings Component ───────────────────────────────────────────────────

export default function YouTubeStudioSettings({ brandId, onTemplateSelect, activeTemplateId }) {
    const [config, setConfig] = useState({})
    const [templates, setTemplates] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [seeding, setSeeding] = useState(false)
    const [editingTemplate, setEditingTemplate] = useState(null)
    const [showEditor, setShowEditor] = useState(false)
    const [filterTheme, setFilterTheme] = useState('all')

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [{ config: cfg }, { templates: tmpl }] = await Promise.all([
                api(`/youtube-studio/settings/channel-config${brandId ? `?brandId=${brandId}` : ''}`),
                api('/youtube-studio/settings/templates'),
            ])
            setConfig(cfg || {})
            setTemplates(tmpl || [])
        } catch (e) { console.error('Settings load failed:', e.message) }
        setLoading(false)
    }, [brandId])

    useEffect(() => { loadData() }, [loadData])

    async function seedStarters() {
        setSeeding(true)
        try {
            await api('/youtube-studio/settings/templates/seed-starters', { method: 'POST' })
            await loadData()
        } catch (e) { alert('Seed failed: ' + e.message) }
        setSeeding(false)
    }

    async function saveConfig() {
        setSaving(true)
        try {
            const { config: updated } = await api('/youtube-studio/settings/channel-config', {
                method: 'PUT', body: JSON.stringify({ ...config, brandId }),
            })
            setConfig(updated || config)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch (e) { alert('Save failed: ' + e.message) }
        setSaving(false)
    }

    const setConfigField = (path, value) => {
        setConfig(prev => {
            const clone = JSON.parse(JSON.stringify(prev))
            const keys = path.split('.')
            let obj = clone
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) obj[keys[i]] = {}
                obj = obj[keys[i]]
            }
            obj[keys[keys.length - 1]] = value
            return clone
        })
    }

    async function handleSetDefault(id) {
        try {
            await api(`/youtube-studio/settings/templates/${id}/set-default`, { method: 'POST' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleDelete(id) {
        if (!confirm('Archive this template?')) return
        try {
            await api(`/youtube-studio/settings/templates/${id}`, { method: 'DELETE' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleClone(id) {
        try {
            await api(`/youtube-studio/settings/templates/${id}/clone`, { method: 'POST', body: JSON.stringify({ brandId }) })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    const filteredTemplates = filterTheme === 'all' ? templates : templates.filter(t => t.classification?.theme === filterTheme)
    const starterTemplates = filteredTemplates.filter(t => t.isStarter)
    const myTemplates = filteredTemplates.filter(t => !t.isStarter)
    const hasStarters = templates.some(t => t.isStarter)

    if (loading) return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '3px solid var(--sys-border)', borderTopColor: 'var(--sys-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ margin: 0, color: 'var(--sys-text-muted)', fontSize: 13 }}>Loading settings...</p>
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {showEditor && (
                <TemplateEditor
                    template={editingTemplate}
                    onSave={async () => { setShowEditor(false); setEditingTemplate(null); await loadData() }}
                    onClose={() => { setShowEditor(false); setEditingTemplate(null) }}
                />
            )}

            {/* ── Channel Profile ── */}
            <SettingSection title="Channel Profile" icon="manage_accounts" subtitle="Configure your YouTube channel identity and defaults">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Channel Name">
                        <TextInput value={config.channelName} onChange={v => setConfigField('channelName', v)} placeholder="My YouTube Channel" />
                    </Field>
                    <Field label="Niche / Category">
                        <Select value={config.niche || ''} onChange={v => setConfigField('niche', v)}
                            options={[{ value: '', label: 'Select niche...' }, ...THEMES.map(t => ({ value: t.label, label: `${t.emoji} ${t.label}` }))]} />
                    </Field>
                    <Field label="Channel URL / Handle" hint="e.g. youtube.com/@MyChannel">
                        <TextInput value={config.channelUrl} onChange={v => setConfigField('channelUrl', v)} placeholder="https://youtube.com/@channel" />
                    </Field>
                    <Field label="YouTube Channel ID" hint="UCxxxxxx format (optional)">
                        <TextInput value={config.channelId} onChange={v => setConfigField('channelId', v)} placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxx" />
                    </Field>
                </div>

                {/* Logo */}
                <div style={{ border: '1px solid var(--sys-border)', borderRadius: 10, padding: 14, marginTop: 4, background: 'var(--sys-bg)' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700 }}>🔲 Logo / Watermark</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <Field label="Logo URL" hint="Public URL of your channel logo/watermark">
                            <TextInput value={config.logoUrl} onChange={v => setConfigField('logoUrl', v)} placeholder="https://..." />
                        </Field>
                        <Field label="Default Logo Placement">
                            <Select value={config.logoPlacement || 'top-right'} onChange={v => setConfigField('logoPlacement', v)}
                                options={LOGO_PLACEMENTS.map(p => ({ value: p, label: p.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} />
                        </Field>
                    </div>
                    {config.logoUrl && (
                        <img src={config.logoUrl} alt="logo preview" style={{ height: 40, borderRadius: 6, border: '1px solid var(--sys-border)', marginTop: 8, objectFit: 'contain' }}
                            onError={e => e.target.style.display = 'none'} />
                    )}
                </div>
            </SettingSection>

            <div style={{ borderBottom: '1px solid var(--sys-border)', marginBottom: 24 }} />

            {/* ── Language & Output Preferences ── */}
            <SettingSection title="Language & Output" icon="language" subtitle="Set default language for generated titles, descriptions, and thumbnail text">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <Field label="Title Language">
                        <Select value={config.defaultLanguage?.title || 'english'} onChange={v => setConfigField('defaultLanguage.title', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                    <Field label="Description Language">
                        <Select value={config.defaultLanguage?.description || 'english'} onChange={v => setConfigField('defaultLanguage.description', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                    <Field label="Thumbnail Text Language">
                        <Select value={config.defaultLanguage?.thumbnail || 'english'} onChange={v => setConfigField('defaultLanguage.thumbnail', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                </div>
                {/* Language info box */}
                {(config.defaultLanguage?.title === 'hindi' || config.defaultLanguage?.description === 'hindi') && (
                    <div style={{ padding: '10px 14px', borderRadius: 8, background: '#f59e0b15', border: '1px solid #f59e0b33', marginTop: 8 }}>
                        <p style={{ margin: 0, fontSize: 12, color: '#f59e0b' }}>
                            🇮🇳 Hindi selected — titles and descriptions will be generated in Devanagari script. Thumbnail text will use appropriate Hindi fonts.
                        </p>
                    </div>
                )}
            </SettingSection>

            <div style={{ borderBottom: '1px solid var(--sys-border)', marginBottom: 24 }} />

            {/* ── Title Preferences ── */}
            <SettingSection title="Title & SEO Preferences" icon="title" subtitle="Default behavior for AI-generated titles and SEO copy">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Default Title Mode">
                        <Select value={config.titlePreferences?.defaultMode || 'auto'} onChange={v => setConfigField('titlePreferences.defaultMode', v)}
                            options={[{ value: 'auto', label: '🔒 Auto (Original YouTube Title)' }, { value: 'manual', label: '✏️ Manual (AI-Suggested + Edit)' }]} />
                    </Field>
                    <Field label="Title Style Preference">
                        <Select value={config.titlePreferences?.style || 'auto'} onChange={v => setConfigField('titlePreferences.style', v)}
                            options={[{ value: 'auto', label: 'Auto (AI decides)' }, { value: 'curiosity', label: 'Curiosity Gap' }, { value: 'number', label: 'Number-led' }, { value: 'how-to', label: 'How-To' }, { value: 'bold-claim', label: 'Bold Claim' }]} />
                    </Field>
                    <Field label="Max Title Length (chars)">
                        <Select value={String(config.titlePreferences?.maxLength || 65)} onChange={v => setConfigField('titlePreferences.maxLength', Number(v))}
                            options={[{ value: '50', label: '50 chars' }, { value: '60', label: '60 chars (safe)' }, { value: '65', label: '65 chars (YouTube max)' }, { value: '80', label: '80 chars (extended)' }]} />
                    </Field>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 20 }}>
                        <Toggle value={config.seoPreferences?.includeChapters !== false} onChange={v => setConfigField('seoPreferences.includeChapters', v)} label="Include chapters in description" />
                        <Toggle value={config.seoPreferences?.includeHashtags !== false} onChange={v => setConfigField('seoPreferences.includeHashtags', v)} label="Include hashtags" />
                        <Toggle value={config.thumbnailPreferences?.alwaysIncludeLogo !== false} onChange={v => setConfigField('thumbnailPreferences.alwaysIncludeLogo', v)} label="Always include logo on thumbnail" />
                    </div>
                </div>
            </SettingSection>

            {/* Save config button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 32 }}>
                <button onClick={saveConfig} disabled={saving}
                    style={{ padding: '11px 28px', borderRadius: 10, background: saving ? 'var(--sys-border)' : 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Channel Settings'}
                </button>
            </div>

            <div style={{ borderBottom: '1px solid var(--sys-border)', marginBottom: 24 }} />

            {/* ── Thumbnail Templates ── */}
            <SettingSection title="Thumbnail Templates" icon="collections" subtitle="Each template locks the visual style — color palette, font, layout, energy — while the content (characters, peak moment, title) comes from the video analysis">

                {/* Template filter bar */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                    <button onClick={() => setFilterTheme('all')}
                        style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            borderColor: filterTheme === 'all' ? 'var(--sys-primary)' : 'var(--sys-border)',
                            background: filterTheme === 'all' ? 'var(--sys-primary)' : 'var(--sys-surface)',
                            color: filterTheme === 'all' ? 'white' : 'var(--sys-text)' }}>
                        All
                    </button>
                    {THEMES.filter(t => t.value !== 'general').map(t => (
                        <button key={t.value} onClick={() => setFilterTheme(filterTheme === t.value ? 'all' : t.value)}
                            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                borderColor: filterTheme === t.value ? 'var(--sys-primary)' : 'var(--sys-border)',
                                background: filterTheme === t.value ? 'var(--sys-primary)' : 'var(--sys-surface)',
                                color: filterTheme === t.value ? 'white' : 'var(--sys-text)' }}>
                            {t.emoji} {t.label}
                        </button>
                    ))}
                </div>

                {/* New Template button */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    <button onClick={() => { setEditingTemplate(null); setShowEditor(true) }}
                        style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                        Create New Template
                    </button>
                    {!hasStarters && (
                        <button onClick={seedStarters} disabled={seeding}
                            style={{ padding: '10px 20px', borderRadius: 10, background: '#6366f115', color: '#6366f1', fontWeight: 700, fontSize: 13, border: '1px solid #6366f133', cursor: seeding ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
                            {seeding ? 'Loading...' : 'Load Starter Templates (10 pre-built)'}
                        </button>
                    )}
                </div>

                {/* My Templates */}
                {myTemplates.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Templates ({myTemplates.length})</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                            {myTemplates.map(t => (
                                <TemplateCard key={t._id} template={t}
                                    isActive={t._id === activeTemplateId}
                                    onSelect={onTemplateSelect}
                                    onEdit={tpl => { setEditingTemplate(tpl); setShowEditor(true) }}
                                    onClone={handleClone}
                                    onDelete={handleDelete}
                                    onSetDefault={handleSetDefault}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Starter Templates */}
                {starterTemplates.length > 0 && (
                    <div>
                        <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            ⭐ Starter Templates ({starterTemplates.length}) — Click to use, "Clone & Edit" to customize
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                            {starterTemplates.map(t => (
                                <TemplateCard key={t._id} template={t}
                                    isActive={t._id === activeTemplateId}
                                    onSelect={onTemplateSelect}
                                    onEdit={() => {}}
                                    onClone={handleClone}
                                    onDelete={handleDelete}
                                    onSetDefault={handleSetDefault}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {templates.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--sys-border)', borderRadius: 12 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--sys-text-muted)', display: 'block', marginBottom: 12 }}>collections</span>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>No templates yet</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--sys-text-muted)' }}>Create your own or load 10 pre-built starter templates</p>
                    </div>
                )}
            </SettingSection>
        </div>
    )
}

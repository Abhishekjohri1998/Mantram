/**
 * YouTubeStudioSettings — Settings Tab for YouTube Studio
 *
 * Features:
 * 1. Multi-Channel Setup — add/edit/delete/set-default multiple YouTube channels
 * 2. Per-Channel: name, ID, URL, niche, logo upload, language, template default
 * 3. Thumbnail Templates — 10 starter templates + user CRUD (no emojis → Material icons)
 * 4. Logo Upload via /api/media/upload (base64 → S3 URL)
 */

import { useState, useEffect, useCallback, useRef } from 'react'

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
    { value: 'general',    label: 'General',        icon: 'palette' },
    { value: 'drama',      label: 'Drama',           icon: 'theaters' },
    { value: 'music',      label: 'Music',           icon: 'queue_music' },
    { value: 'news',       label: 'News',            icon: 'breaking_news' },
    { value: 'education',  label: 'Education',       icon: 'school' },
    { value: 'comedy',     label: 'Comedy',          icon: 'sentiment_very_satisfied' },
    { value: 'lifestyle',  label: 'Lifestyle',       icon: 'explore' },
    { value: 'sports',     label: 'Sports',          icon: 'sports_soccer' },
    { value: 'tech',       label: 'Tech',            icon: 'devices' },
    { value: 'reality-tv', label: 'Reality TV',      icon: 'live_tv' },
    { value: 'finance',    label: 'Finance',         icon: 'trending_up' },
    { value: 'devotional', label: 'Devotional',      icon: 'self_improvement' },
    { value: 'politics',   label: 'Politics',        icon: 'account_balance' },
]

const LANGUAGES = [
    { value: 'english',   label: 'English',                   flag: 'EN' },
    { value: 'hindi',     label: 'हिंदी (Hindi)',              flag: 'HI' },
    { value: 'hinglish',  label: 'Hinglish',                  flag: 'HIN' },
    { value: 'marathi',   label: 'मराठी (Marathi)',            flag: 'MR' },
    { value: 'tamil',     label: 'தமிழ் (Tamil)',              flag: 'TA' },
    { value: 'telugu',    label: 'తెలుగు (Telugu)',             flag: 'TE' },
    { value: 'bengali',   label: 'বাংলা (Bengali)',            flag: 'BN' },
    { value: 'kannada',   label: 'ಕನ್ನಡ (Kannada)',           flag: 'KN' },
    { value: 'gujarati',  label: 'ગુજરાતી (Gujarati)',        flag: 'GU' },
    { value: 'punjabi',   label: 'ਪੰਜਾਬੀ (Punjabi)',          flag: 'PA' },
    { value: 'urdu',      label: 'اردو (Urdu)',               flag: 'UR' },
    { value: 'arabic',    label: 'العربية (Arabic)',           flag: 'AR' },
    { value: 'french',    label: 'Français (French)',         flag: 'FR' },
    { value: 'spanish',   label: 'Español (Spanish)',         flag: 'ES' },
    { value: 'japanese',  label: '日本語 (Japanese)',          flag: 'JA' },
]

const COMPOSITIONS = [
    { value: 'center',        label: 'Center',       icon: 'center_focus_strong' },
    { value: 'left-subject',  label: 'Left Subject', icon: 'align_horizontal_left' },
    { value: 'right-subject', label: 'Right Subject',icon: 'align_horizontal_right' },
    { value: 'split-dual',    label: 'Split / Dual', icon: 'view_column' },
    { value: 'full-bleed',    label: 'Full Bleed',   icon: 'open_with' },
    { value: 'portrait-crop', label: 'Portrait Crop',icon: 'portrait' },
]

const BG_STYLES = [
    { value: 'dramatic-dark',    label: 'Dramatic Dark',     preview: 'linear-gradient(135deg,#1a0000,#000)' },
    { value: 'vibrant-gradient', label: 'Vibrant Gradient',  preview: 'linear-gradient(135deg,#7c3aed,#ec4899)' },
    { value: 'cinematic-blur',   label: 'Cinematic Blur',    preview: 'linear-gradient(135deg,#0a0a1a,#1a1a3a)' },
    { value: 'solid-color',      label: 'Solid Color',       preview: 'linear-gradient(135deg,#1e3a8a,#1e3a8a)' },
    { value: 'editorial-white',  label: 'Editorial White',   preview: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
    { value: 'neon-glow',        label: 'Neon Glow',         preview: 'linear-gradient(135deg,#0d0d1a,#1a003a)' },
    { value: 'bold-flat',        label: 'Bold Flat',         preview: 'linear-gradient(135deg,#ef4444,#b91c1c)' },
    { value: 'watercolor',       label: 'Watercolor',        preview: 'linear-gradient(135deg,#fef9f0,#fde68a)' },
]

const LOGO_PLACEMENTS = [
    { value: 'top-left',     label: 'Top Left',     icon: 'north_west' },
    { value: 'top-right',    label: 'Top Right',    icon: 'north_east' },
    { value: 'bottom-left',  label: 'Bottom Left',  icon: 'south_west' },
    { value: 'bottom-right', label: 'Bottom Right', icon: 'south_east' },
    { value: 'none',         label: 'No Logo',      icon: 'block' },
]

const NICHES = ['Drama & Entertainment', 'Music', 'News & Politics', 'Education & Learning', 'Comedy', 'Lifestyle & Vlog', 'Sports', 'Tech & Gadgets', 'Reality TV', 'Finance & Business', 'Devotional & Spiritual', 'Gaming', 'Health & Fitness', 'Food & Cooking', 'Travel', 'Fashion & Beauty']

// ── Micro helpers ────────────────────────────────────────────────────────────

function MIcon({ name, size = 18, color, style = {} }) {
    return <span className="material-symbols-outlined" style={{ fontSize: size, color: color || 'inherit', lineHeight: 1, ...style }}>{name}</span>
}

function Field({ label, hint, children }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, marginBottom: 4, color: 'var(--sys-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
            {children}
            {hint && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--sys-text-muted)' }}>{hint}</p>}
        </div>
    )
}

function TextInput({ value, onChange, placeholder, maxLength, type = 'text', disabled = false }) {
    return (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} maxLength={maxLength} disabled={disabled}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: disabled ? 'var(--sys-border)' : 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13 }}
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
                style={{ width: 38, height: 20, borderRadius: 10, background: value ? 'var(--sys-primary)' : 'var(--sys-border)', transition: 'all .2s', position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: value ? 19 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'all .2s', boxShadow: '0 1px 3px #0003' }} />
            </div>
            <span style={{ fontSize: 12 }}>{label}</span>
        </label>
    )
}

// ── Logo Uploader ────────────────────────────────────────────────────────────

function LogoUploader({ logoUrl, onChange }) {
    const inputRef = useRef(null)
    const [uploading, setUploading] = useState(false)

    async function handleFile(e) {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) return alert('Please select an image file')
        if (file.size > 5 * 1024 * 1024) return alert('Max 5MB')

        setUploading(true)
        try {
            const reader = new FileReader()
            reader.onload = async (ev) => {
                try {
                    const imageData = ev.target.result
                    const d = await api('/media/upload', {
                        method: 'POST',
                        body: JSON.stringify({ imageData, folder: 'yt-logos' }),
                    })
                    onChange(d.url)
                } catch (err) { alert('Upload failed: ' + err.message) }
                setUploading(false)
            }
            reader.readAsDataURL(file)
        } catch { setUploading(false) }
    }

    return (
        <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                {/* Preview */}
                <div style={{ width: 64, height: 64, borderRadius: 10, border: '2px dashed var(--sys-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sys-bg)', flexShrink: 0, overflow: 'hidden' }}>
                    {logoUrl ? (
                        <img src={logoUrl} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={e => { e.target.style.display = 'none' }} />
                    ) : (
                        <MIcon name="image" size={28} color="var(--sys-text-muted)" />
                    )}
                </div>
                {/* Actions */}
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        <button onClick={() => inputRef.current?.click()} disabled={uploading}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--sys-border)', background: 'var(--sys-surface)', fontSize: 12, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', color: 'var(--sys-text)' }}>
                            <MIcon name={uploading ? 'hourglass_empty' : 'upload'} size={14} />
                            {uploading ? 'Uploading...' : 'Upload Logo'}
                        </button>
                        {logoUrl && (
                            <button onClick={() => onChange('')}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid #ef444433', background: 'transparent', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#ef4444' }}>
                                <MIcon name="delete" size={14} />Remove
                            </button>
                        )}
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>PNG, WebP, JPG · Max 5MB · Transparent PNG recommended</p>
                    {/* Or paste URL */}
                    <input value={logoUrl || ''} onChange={e => onChange(e.target.value)}
                        placeholder="Or paste logo URL..."
                        style={{ marginTop: 6, width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 11 }} />
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </div>
    )
}

// ── Channel Editor Modal ──────────────────────────────────────────────────────

function ChannelEditor({ channel, templates, onSave, onClose }) {
    const isNew = !channel?._id
    const [form, setForm] = useState({
        channelName: '', channelId: '', channelUrl: '', niche: '',
        logoUrl: '', logoPlacement: 'top-right',
        defaultLanguage: { title: 'english', description: 'english', tags: 'english', thumbnail: 'english' },
        defaultTemplateId: '',
        titlePreferences: { defaultMode: 'auto', maxLength: 65, style: 'auto' },
        thumbnailPreferences: { alwaysIncludeLogo: true, showTitleText: true, textLines: 2 },
        seoPreferences: { includeChapters: true, includeHashtags: true, hashtagCount: 5 },
        ...(channel || {}),
        defaultTemplateId: channel?.defaultTemplateId?._id || channel?.defaultTemplateId || '',
    })
    const [saving, setSaving] = useState(false)

    const set = (path, value) => {
        setForm(prev => {
            const clone = JSON.parse(JSON.stringify(prev))
            const keys = path.split('.')
            let obj = clone
            for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]] }
            obj[keys[keys.length - 1]] = value
            return clone
        })
    }

    async function handleSave() {
        if (!form.channelName?.trim()) return alert('Channel name is required')
        setSaving(true)
        try {
            if (isNew) await api('/yt-studio-settings/channel-configs', { method: 'POST', body: JSON.stringify(form) })
            else await api(`/yt-studio-settings/channel-configs/${channel._id}`, { method: 'PUT', body: JSON.stringify(form) })
            onSave()
        } catch (e) { alert('Save failed: ' + e.message) }
        setSaving(false)
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
            <div style={{ background: 'var(--sys-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 580, boxShadow: '0 20px 60px #00000066' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MIcon name="tv" size={22} color="var(--sys-primary)" />
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{isNew ? 'Add YouTube Channel' : 'Edit Channel'}</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--sys-text-muted)' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Channel Name *">
                            <TextInput value={form.channelName} onChange={v => set('channelName', v)} placeholder="My YouTube Channel" maxLength={80} />
                        </Field>
                    </div>
                    <Field label="YouTube Channel ID" hint="UCxxxxxx format — find in YouTube Studio settings">
                        <TextInput value={form.channelId} onChange={v => set('channelId', v)} placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxx" />
                    </Field>
                    <Field label="Channel Handle / URL">
                        <TextInput value={form.channelUrl} onChange={v => set('channelUrl', v)} placeholder="https://youtube.com/@handle" />
                    </Field>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Niche">
                            <Select value={form.niche} onChange={v => set('niche', v)}
                                options={[{ value: '', label: 'Select niche...' }, ...NICHES.map(n => ({ value: n, label: n }))]} />
                        </Field>
                    </div>

                    {/* Logo */}
                    <div style={{ gridColumn: '1 / -1', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <MIcon name="image" size={15} color="var(--sys-primary)" />
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Channel Logo / Watermark</p>
                        </div>
                        <LogoUploader logoUrl={form.logoUrl} onChange={v => set('logoUrl', v)} />
                        <div style={{ marginTop: 10 }}>
                            <Field label="Logo Position on Thumbnails">
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {LOGO_PLACEMENTS.map(p => (
                                        <button key={p.value} onClick={() => set('logoPlacement', p.value)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid', cursor: 'pointer', transition: 'all .15s',
                                                borderColor: form.logoPlacement === p.value ? 'var(--sys-primary)' : 'var(--sys-border)',
                                                background: form.logoPlacement === p.value ? 'var(--sys-primary)' : 'var(--sys-surface)',
                                                color: form.logoPlacement === p.value ? 'white' : 'var(--sys-text)' }}>
                                            <MIcon name={p.icon} size={12} />
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                        </div>
                    </div>

                    {/* Languages */}
                    <div style={{ gridColumn: '1 / -1', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <MIcon name="language" size={15} color="var(--sys-primary)" />
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700 }}>Output Languages</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <Field label="Title Language">
                                <Select value={form.defaultLanguage?.title || 'english'} onChange={v => set('defaultLanguage.title', v)}
                                    options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                            </Field>
                            <Field label="Description Language">
                                <Select value={form.defaultLanguage?.description || 'english'} onChange={v => set('defaultLanguage.description', v)}
                                    options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                            </Field>
                            <Field label="Tags Language">
                                <Select value={form.defaultLanguage?.tags || 'english'} onChange={v => set('defaultLanguage.tags', v)}
                                    options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                            </Field>
                            <Field label="Thumbnail Text Language">
                                <Select value={form.defaultLanguage?.thumbnail || 'english'} onChange={v => set('defaultLanguage.thumbnail', v)}
                                    options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                            </Field>
                        </div>
                    </div>

                    {/* Default template */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Default Thumbnail Template" hint="Applied automatically when analysing videos on this channel">
                            <Select value={form.defaultTemplateId || ''} onChange={v => set('defaultTemplateId', v)}
                                options={[{ value: '', label: 'No default (choose per video)' }, ...templates.map(t => ({ value: t._id, label: t.name }))]} />
                        </Field>
                    </div>

                    {/* Preferences */}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Toggle value={form.thumbnailPreferences?.alwaysIncludeLogo !== false} onChange={v => set('thumbnailPreferences.alwaysIncludeLogo', v)} label="Always include logo watermark on thumbnails" />
                        <Toggle value={form.seoPreferences?.includeChapters !== false} onChange={v => set('seoPreferences.includeChapters', v)} label="Include chapter timestamps in video description" />
                        <Toggle value={form.seoPreferences?.includeHashtags !== false} onChange={v => set('seoPreferences.includeHashtags', v)} label="Include hashtags in video description" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={onClose}
                        style={{ flex: 1, padding: '11px', borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <MIcon name={saving ? 'hourglass_empty' : 'save'} size={16} />
                        {saving ? 'Saving...' : isNew ? 'Add Channel' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Channel Card ──────────────────────────────────────────────────────────────

function ChannelCard({ channel, onEdit, onDelete, onSetDefault }) {
    const [deleting, setDeleting] = useState(false)

    async function handleDelete() {
        if (!confirm(`Delete channel "${channel.channelName}"? This cannot be undone.`)) return
        setDeleting(true)
        try { await onDelete(channel._id) } finally { setDeleting(false) }
    }

    return (
        <div style={{ border: `2px solid ${channel.isDefault ? 'var(--sys-primary)' : 'var(--sys-border)'}`, borderRadius: 12, padding: '14px 16px', background: 'var(--sys-surface)', transition: 'border-color .2s' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Logo */}
                <div style={{ width: 52, height: 52, borderRadius: 10, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {channel.logoUrl ? (
                        <img src={channel.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
                    ) : (
                        <MIcon name="tv" size={24} color="var(--sys-text-muted)" />
                    )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{channel.channelName}</p>
                        {channel.isDefault && (
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'var(--sys-primary)', color: 'white', fontWeight: 700 }}>
                                Default
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: 'var(--sys-text-muted)', flexWrap: 'wrap' }}>
                        {channel.niche && <span>{channel.niche}</span>}
                        {channel.channelId && <span style={{ fontFamily: 'monospace' }}>{channel.channelId.substring(0, 14)}…</span>}
                        {channel.defaultLanguage?.title && <span><MIcon name="language" size={11} /> {channel.defaultLanguage.title}</span>}
                        {channel.logoPlacement && channel.logoPlacement !== 'none' && <span><MIcon name="image" size={11} /> Logo: {channel.logoPlacement.replace(/-/g, ' ')}</span>}
                    </div>
                    {channel.defaultTemplateId && (
                        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <MIcon name="collections" size={12} color="var(--sys-primary)" />
                            <span style={{ fontSize: 11, color: 'var(--sys-primary)', fontWeight: 600 }}>{channel.defaultTemplateId?.name || 'Template set'}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {!channel.isDefault && (
                        <button onClick={() => onSetDefault(channel._id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid #22c55e44', color: '#22c55e', background: 'transparent', cursor: 'pointer' }}>
                            <MIcon name="star" size={12} />Set Default
                        </button>
                    )}
                    <button onClick={() => onEdit(channel)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid var(--sys-border)', color: 'var(--sys-text)', background: 'transparent', cursor: 'pointer' }}>
                        <MIcon name="edit" size={12} />Edit
                    </button>
                    <button onClick={handleDelete} disabled={deleting}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1px solid #ef444433', color: '#ef4444', background: 'transparent', cursor: deleting ? 'wait' : 'pointer' }}>
                        <MIcon name="delete" size={12} />
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ template, isActive, onSelect, onEdit, onClone, onDelete, onSetDefault }) {
    const v = template.visual || {}
    const iconName = template.icon || 'palette'

    return (
        <div style={{
            border: `2px solid ${isActive ? 'var(--sys-primary)' : template.isDefault ? '#22c55e' : 'var(--sys-border)'}`,
            borderRadius: 14, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', background: 'var(--sys-surface)',
        }}
            onClick={() => onSelect(template)}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--sys-primary)40' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = template.isDefault ? '#22c55e' : 'var(--sys-border)' }}>

            {/* Color bar */}
            <div style={{ height: 5, background: v.primaryColor || '#ff0000' }} />

            {/* Preview area */}
            <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${v.backgroundColor || '#000'} 0%, ${v.primaryColor || '#ff0000'}55 100%)` }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: v.secondaryColor || '#fff' }}>{iconName}</span>
                </div>
            </div>

            <div style={{ padding: '10px 12px 12px' }}>
                <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.name}</p>
                <p style={{ margin: 0, fontSize: 10, color: 'var(--sys-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {template.classification?.theme} · {template.classification?.language}
                </p>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 6 }}>
                    {template.isStarter && <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 20, background: '#6366f115', color: '#6366f1', fontWeight: 700 }}>Starter</span>}
                    {template.isDefault && <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 20, background: '#22c55e15', color: '#22c55e', fontWeight: 700 }}>Default</span>}
                    {isActive && <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 20, background: 'var(--sys-primary)', color: 'white', fontWeight: 700 }}>Active</span>}
                </div>

                {/* Color swatches */}
                <div style={{ display: 'flex', gap: 3, marginTop: 7 }}>
                    {[v.primaryColor, v.secondaryColor, v.backgroundColor].filter(Boolean).map((c, i) => (
                        <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid var(--sys-border)' }} title={c} />
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5, marginTop: 10 }} onClick={e => e.stopPropagation()}>
                    {!template.isDefault && (
                        <button onClick={() => onSetDefault(template._id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, padding: '5px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #22c55e44', color: '#22c55e', background: 'transparent', cursor: 'pointer', justifyContent: 'center' }}>
                            <MIcon name="star" size={11} />Default
                        </button>
                    )}
                    {template.isStarter ? (
                        <button onClick={() => onClone(template._id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, padding: '5px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid var(--sys-primary)', color: 'var(--sys-primary)', background: 'transparent', cursor: 'pointer', justifyContent: 'center' }}>
                            <MIcon name="content_copy" size={11} />Clone
                        </button>
                    ) : (
                        <>
                            <button onClick={() => onEdit(template)}
                                style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 1, padding: '5px 6px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid var(--sys-border)', color: 'var(--sys-text)', background: 'transparent', cursor: 'pointer', justifyContent: 'center' }}>
                                <MIcon name="edit" size={11} />Edit
                            </button>
                            <button onClick={() => onDelete(template._id)}
                                style={{ padding: '5px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid #ef444433', color: '#ef4444', background: 'transparent', cursor: 'pointer' }}>
                                <MIcon name="delete" size={11} />
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
        name: '', icon: 'palette', description: '', tags: '',
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
            for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]] }
            obj[keys[keys.length - 1]] = value
            return clone
        })
    }

    async function handleSave() {
        if (!form.name.trim()) return alert('Template name required')
        setSaving(true)
        try {
            const payload = { ...form, tags: form.tags.split(',').map(t => t.trim()).filter(Boolean) }
            if (isNew) await api('/yt-studio-settings/templates', { method: 'POST', body: JSON.stringify(payload) })
            else await api(`/yt-studio-settings/templates/${template._id}`, { method: 'PUT', body: JSON.stringify(payload) })
            onSave()
        } catch (e) { alert('Save failed: ' + e.message) }
        setSaving(false)
    }

    const ICONS_LIST = ['palette', 'theaters', 'queue_music', 'breaking_news', 'school', 'explore', 'sports_soccer', 'devices', 'live_tv', 'trending_up', 'self_improvement', 'account_balance', 'sentiment_very_satisfied', 'star', 'flash_on', 'favorite', 'diamond', 'local_fire_department', 'movie', 'mic']

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#00000088', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
            <div style={{ background: 'var(--sys-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px #00000066' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MIcon name={form.icon || 'palette'} size={22} color="var(--sys-primary)" />
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{isNew ? 'New Template' : 'Edit Template'}</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--sys-text-muted)' }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Template Name *">
                            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Sunday Special Drama" maxLength={60}
                                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13 }} />
                        </Field>
                    </div>

                    {/* Icon picker */}
                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="Icon">
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {ICONS_LIST.map(ic => (
                                    <button key={ic} onClick={() => set('icon', ic)}
                                        style={{ width: 34, height: 34, borderRadius: 8, border: `2px solid ${form.icon === ic ? 'var(--sys-primary)' : 'var(--sys-border)'}`, background: form.icon === ic ? 'var(--sys-primary)15' : 'var(--sys-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <MIcon name={ic} size={16} color={form.icon === ic ? 'var(--sys-primary)' : 'var(--sys-text-muted)'} />
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </div>

                    <Field label="Tags (comma separated)">
                        <input value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="drama, hindi, reality-tv"
                            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13 }} />
                    </Field>
                    <Field label="Theme">
                        <Select value={form.classification?.theme} onChange={v => set('classification.theme', v)}
                            options={THEMES.map(t => ({ value: t.value, label: t.label }))} />
                    </Field>
                    <Field label="Default Language">
                        <Select value={form.classification?.language} onChange={v => set('classification.language', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                    <Field label="Show Name (optional)">
                        <input value={form.classification?.showName || ''} onChange={e => set('classification.showName', e.target.value)} placeholder="e.g. Tech Talk Weekly"
                            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 13 }} />
                    </Field>

                    {/* Visual */}
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--sys-border)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <MIcon name="palette" size={16} color="var(--sys-primary)" />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-primary)' }}>Visual Style</span>
                    </div>

                    <Field label="Primary Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.primaryColor || '#FF0000'} onChange={e => set('visual.primaryColor', e.target.value)}
                                style={{ width: 40, height: 34, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <input value={form.visual?.primaryColor || ''} onChange={e => set('visual.primaryColor', e.target.value)} placeholder="#FF0000" maxLength={7}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 12 }} />
                        </div>
                    </Field>
                    <Field label="Secondary Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.secondaryColor || '#FFFFFF'} onChange={e => set('visual.secondaryColor', e.target.value)}
                                style={{ width: 40, height: 34, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <input value={form.visual?.secondaryColor || ''} onChange={e => set('visual.secondaryColor', e.target.value)} placeholder="#FFFFFF" maxLength={7}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 12 }} />
                        </div>
                    </Field>
                    <Field label="Background Base Color">
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input type="color" value={form.visual?.backgroundColor || '#000000'} onChange={e => set('visual.backgroundColor', e.target.value)}
                                style={{ width: 40, height: 34, padding: 2, borderRadius: 6, border: '1px solid var(--sys-border)', cursor: 'pointer', background: 'none' }} />
                            <input value={form.visual?.backgroundColor || ''} onChange={e => set('visual.backgroundColor', e.target.value)} placeholder="#000000" maxLength={7}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--sys-border)', background: 'var(--sys-bg)', color: 'var(--sys-text)', fontSize: 12 }} />
                        </div>
                    </Field>
                    <Field label="Logo Placement">
                        <Select value={form.visual?.logoPlacement} onChange={v => set('visual.logoPlacement', v)}
                            options={LOGO_PLACEMENTS.map(p => ({ value: p.value, label: p.label }))} />
                    </Field>

                    <Field label="Background Style">
                        <Select value={form.visual?.backgroundStyle} onChange={v => set('visual.backgroundStyle', v)}
                            options={BG_STYLES.map(s => ({ value: s.value, label: s.label }))} />
                    </Field>
                    <Field label="Composition">
                        <Select value={form.visual?.composition} onChange={v => set('visual.composition', v)}
                            options={COMPOSITIONS.map(c => ({ value: c.value, label: c.label }))} />
                    </Field>
                    <Field label="Energy Level">
                        <Select value={form.visual?.energyLevel} onChange={v => set('visual.energyLevel', v)}
                            options={['calm', 'energetic', 'intense', 'dramatic'].map(v => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }))} />
                    </Field>
                    <Field label="Title Shadow Style">
                        <Select value={form.visual?.titleShadow} onChange={v => set('visual.titleShadow', v)}
                            options={['none', 'soft', 'hard-black', 'neon-glow', 'outlined'].map(v => ({ value: v, label: v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }))} />
                    </Field>

                    <Field label="Title Language">
                        <Select value={form.outputLanguage?.title} onChange={v => set('outputLanguage.title', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>
                    <Field label="Description Language">
                        <Select value={form.outputLanguage?.description} onChange={v => set('outputLanguage.description', v)}
                            options={LANGUAGES.map(l => ({ value: l.value, label: l.label }))} />
                    </Field>

                    <div style={{ gridColumn: '1 / -1' }}>
                        <Field label="AI Style Directive" hint="Additional description injected into the thumbnail generation prompt — describe the visual mood, aesthetic, style in detail">
                            <textarea value={form.generationPromptSuffix || ''} onChange={e => set('generationPromptSuffix', e.target.value)} rows={3}
                                placeholder="e.g. Cinematic Bollywood aesthetic, rich gold and deep red tones, dramatic theatrical lighting..."
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
                        style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <MIcon name={saving ? 'hourglass_empty' : 'save'} size={16} />
                        {saving ? 'Saving...' : isNew ? 'Create Template' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Main Settings Component ───────────────────────────────────────────────────

export default function YouTubeStudioSettings({ brandId, onTemplateSelect, activeTemplateId }) {
    const [channels, setChannels]           = useState([])
    const [templates, setTemplates]         = useState([])
    const [loading, setLoading]             = useState(true)
    const [seeding, setSeeding]             = useState(false)
    const [editingChannel, setEditingChannel] = useState(null)
    const [showChannelEditor, setShowChannelEditor] = useState(false)
    const [editingTemplate, setEditingTemplate]   = useState(null)
    const [showTemplateEditor, setShowTemplateEditor] = useState(false)
    const [filterTheme, setFilterTheme]     = useState('all')

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [{ channels: ch }, { templates: tmpl }] = await Promise.all([
                api('/yt-studio-settings/channel-configs'),
                api('/yt-studio-settings/templates'),
            ])
            setChannels(ch || [])
            setTemplates(tmpl || [])
        } catch (e) { console.error('Settings load failed:', e.message) }
        setLoading(false)
    }, [])

    useEffect(() => { loadData() }, [loadData])

    async function seedStarters() {
        setSeeding(true)
        try {
            await api('/yt-studio-settings/templates/seed-starters', { method: 'POST' })
            await loadData()
        } catch (e) { alert('Seed failed: ' + e.message) }
        setSeeding(false)
    }

    async function handleSetDefaultChannel(id) {
        try {
            await api(`/yt-studio-settings/channel-configs/${id}/default`, { method: 'POST' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleDeleteChannel(id) {
        try {
            await api(`/yt-studio-settings/channel-configs/${id}`, { method: 'DELETE' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleSetDefaultTemplate(id) {
        try {
            await api(`/yt-studio-settings/templates/${id}/set-default`, { method: 'POST' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleDeleteTemplate(id) {
        if (!confirm('Archive this template?')) return
        try {
            await api(`/yt-studio-settings/templates/${id}`, { method: 'DELETE' })
            await loadData()
        } catch (e) { alert(e.message) }
    }

    async function handleCloneTemplate(id) {
        try {
            await api(`/yt-studio-settings/templates/${id}/clone`, { method: 'POST', body: JSON.stringify({ brandId }) })
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
            {/* Modals */}
            {showChannelEditor && (
                <ChannelEditor
                    channel={editingChannel}
                    templates={templates.filter(t => !t.isArchived)}
                    onSave={async () => { setShowChannelEditor(false); setEditingChannel(null); await loadData() }}
                    onClose={() => { setShowChannelEditor(false); setEditingChannel(null) }}
                />
            )}
            {showTemplateEditor && (
                <TemplateEditor
                    template={editingTemplate}
                    onSave={async () => { setShowTemplateEditor(false); setEditingTemplate(null); await loadData() }}
                    onClose={() => { setShowTemplateEditor(false); setEditingTemplate(null) }}
                />
            )}

            {/* ── Channels Section ── */}
            <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MIcon name="tv" size={20} color="var(--sys-primary)" />
                        <div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>YouTube Channels</h3>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>Configure multiple channels — each with its own logo, language, and template</p>
                        </div>
                    </div>
                    <button onClick={() => { setEditingChannel(null); setShowChannelEditor(true) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                        <MIcon name="add" size={16} />Add Channel
                    </button>
                </div>

                {channels.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed var(--sys-border)', borderRadius: 14 }}>
                        <MIcon name="tv" size={48} color="var(--sys-text-muted)" style={{ display: 'block', margin: '0 auto 12px' }} />
                        <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>No channels configured</p>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--sys-text-muted)' }}>Add your YouTube channel to unlock per-channel defaults for language, logo, and templates</p>
                        <button onClick={() => { setEditingChannel(null); setShowChannelEditor(true) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                            <MIcon name="add_circle" size={16} />Add Your First Channel
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {channels.map(ch => (
                            <ChannelCard key={ch._id} channel={ch}
                                onEdit={c => { setEditingChannel(c); setShowChannelEditor(true) }}
                                onDelete={handleDeleteChannel}
                                onSetDefault={handleSetDefaultChannel}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div style={{ borderBottom: '1px solid var(--sys-border)', marginBottom: 28 }} />

            {/* ── Templates Section ── */}
            <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MIcon name="collections" size={20} color="var(--sys-primary)" />
                        <div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Thumbnail Templates</h3>
                            <p style={{ margin: 0, fontSize: 11, color: 'var(--sys-text-muted)' }}>Templates lock the visual style — characters and peak moment content always come from the video</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {!hasStarters && (
                            <button onClick={seedStarters} disabled={seeding}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, background: '#6366f115', color: '#6366f1', fontWeight: 700, fontSize: 12, border: '1px solid #6366f133', cursor: seeding ? 'wait' : 'pointer' }}>
                                <MIcon name="auto_awesome" size={15} />{seeding ? 'Loading...' : 'Load 10 Starter Templates'}
                            </button>
                        )}
                        <button onClick={() => { setEditingTemplate(null); setShowTemplateEditor(true) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, background: 'var(--sys-primary)', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' }}>
                            <MIcon name="add" size={16} />New Template
                        </button>
                    </div>
                </div>

                {/* Theme filter pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    <button onClick={() => setFilterTheme('all')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            borderColor: filterTheme === 'all' ? 'var(--sys-primary)' : 'var(--sys-border)',
                            background: filterTheme === 'all' ? 'var(--sys-primary)' : 'var(--sys-surface)',
                            color: filterTheme === 'all' ? 'white' : 'var(--sys-text)' }}>
                        <MIcon name="apps" size={12} />All
                    </button>
                    {THEMES.filter(t => t.value !== 'general').map(t => (
                        <button key={t.value} onClick={() => setFilterTheme(filterTheme === t.value ? 'all' : t.value)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 20, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                borderColor: filterTheme === t.value ? 'var(--sys-primary)' : 'var(--sys-border)',
                                background: filterTheme === t.value ? 'var(--sys-primary)' : 'var(--sys-surface)',
                                color: filterTheme === t.value ? 'white' : 'var(--sys-text)' }}>
                            <MIcon name={t.icon} size={12} />{t.label}
                        </button>
                    ))}
                </div>

                {/* My Templates */}
                {myTemplates.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <MIcon name="person" size={14} color="var(--sys-text-muted)" />
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>My Templates ({myTemplates.length})</p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                            {myTemplates.map(t => (
                                <TemplateCard key={t._id} template={t}
                                    isActive={t._id === activeTemplateId}
                                    onSelect={onTemplateSelect}
                                    onEdit={tpl => { setEditingTemplate(tpl); setShowTemplateEditor(true) }}
                                    onClone={handleCloneTemplate}
                                    onDelete={handleDeleteTemplate}
                                    onSetDefault={handleSetDefaultTemplate}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {/* Starter Templates */}
                {starterTemplates.length > 0 && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <MIcon name="auto_awesome" size={14} color="#6366f1" />
                            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'var(--sys-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Starter Templates ({starterTemplates.length}) — Click to use · Clone to customise
                            </p>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                            {starterTemplates.map(t => (
                                <TemplateCard key={t._id} template={t}
                                    isActive={t._id === activeTemplateId}
                                    onSelect={onTemplateSelect}
                                    onEdit={() => {}}
                                    onClone={handleCloneTemplate}
                                    onDelete={handleDeleteTemplate}
                                    onSetDefault={handleSetDefaultTemplate}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {templates.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '48px 20px', border: '2px dashed var(--sys-border)', borderRadius: 14 }}>
                        <MIcon name="collections" size={52} color="var(--sys-text-muted)" style={{ display: 'block', margin: '0 auto 12px' }} />
                        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>No templates yet</p>
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--sys-text-muted)' }}>Load 10 pre-built starter templates or create your own</p>
                        <button onClick={seedStarters} disabled={seeding}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 10, background: '#6366f1', color: 'white', fontWeight: 700, fontSize: 13, border: 'none', cursor: seeding ? 'wait' : 'pointer' }}>
                            <MIcon name="auto_awesome" size={16} />{seeding ? 'Loading...' : 'Load Starter Templates'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

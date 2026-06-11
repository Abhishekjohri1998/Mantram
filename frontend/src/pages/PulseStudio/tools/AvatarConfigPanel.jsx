/**
 * AvatarConfigPanel — Pulse Studio Human Presence Configurator
 *
 * Compact collapsible UI for configuring the "Add Human" layer in Pulse tools.
 * Session-persistent (config lifted to PulseStudio/index.jsx state).
 * Each tool inherits the global config but can toggle on/off individually.
 *
 * Design: consistent with PulseStudio grey design system (ps-* classes).
 */

import React, { useState } from 'react'
import { User, ChevronDown, ChevronUp, CheckCircle2, X } from 'lucide-react'

// ── Config options ─────────────────────────────────────────────────────────────
export const AVATAR_OPTIONS = {
    origin: [
        { id: 'south-asian',     label: 'South Asian',      emoji: '🇮🇳' },
        { id: 'southeast-asian', label: 'Southeast Asian',  emoji: '🌏' },
        { id: 'middle-eastern',  label: 'Middle Eastern',   emoji: '🌙' },
        { id: 'african',         label: 'African',          emoji: '🌍' },
        { id: 'western',         label: 'Western',          emoji: '🌎' },
    ],
    gender: [
        { id: 'feminine',   label: 'Feminine'  },
        { id: 'masculine',  label: 'Masculine' },
        { id: 'neutral',    label: 'Neutral'   },
    ],
    age: [
        { id: 'young-adult',   label: '18–25' },
        { id: 'adult',         label: '26–40' },
        { id: 'mature-adult',  label: '41–55' },
    ],
    clothing: [
        { id: 'casual',        label: 'Casual'        },
        { id: 'smart-casual',  label: 'Smart Casual'  },
        { id: 'professional',  label: 'Professional'  },
        { id: 'athletic',      label: 'Athletic'      },
        { id: 'traditional',   label: 'Traditional'   },
    ],
    intent: [
        { id: 'in-use',       label: 'Using product',   desc: 'Active hands-on engagement with the product' },
        { id: 'lifestyle',    label: 'Lifestyle scene',  desc: 'Product fits naturally in their world'       },
        { id: 'spokesperson', label: 'Spokesperson',     desc: 'Faces camera, confident — hero of the frame' },
        { id: 'ambient',      label: 'Background',       desc: 'Human presence without stealing focus'       },
    ],
}

const DEFAULT_CONFIG = {
    enabled: false,
    origin:   'south-asian',
    gender:   'feminine',
    age:      'adult',
    clothing: 'smart-casual',
    intent:   'lifestyle',
}

// ── Mini chip selector ─────────────────────────────────────────────────────────
function ChipGroup({ label, options, value, onChange, disabled }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 6 }}>
                {label}
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {options.map(opt => (
                    <button
                        key={opt.id}
                        onClick={() => onChange(opt.id)}
                        disabled={disabled}
                        style={{
                            padding:      '5px 10px',
                            borderRadius:  6,
                            fontSize:      11,
                            fontWeight:    value === opt.id ? 700 : 400,
                            cursor:        disabled ? 'default' : 'pointer',
                            border:        `1px solid ${value === opt.id ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                            background:    value === opt.id ? 'var(--sys-primary-ghost)' : 'var(--sys-surface)',
                            color:         value === opt.id ? 'var(--sys-primary)' : 'var(--sys-text-muted)',
                            transition:    'all 0.15s ease',
                            whiteSpace:    'nowrap',
                        }}
                    >
                        {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
                    </button>
                ))}
            </div>
        </div>
    )
}

// ── Main component ─────────────────────────────────────────────────────────────
/**
 * @param {Object}   config           — current avatar config state (from parent)
 * @param {Function} onChange         — called with updated config object
 * @param {boolean}  compact          — if true, shows a collapsed summary chip (for use in tool toolbar)
 * @param {boolean}  disabled         — disables all inputs during generation
 */
export default function AvatarConfigPanel({ config = DEFAULT_CONFIG, onChange, compact = false, disabled = false }) {
    const [expanded, setExpanded] = useState(false)

    const update = (key, value) => onChange({ ...config, [key]: value })
    const toggleEnabled = () => onChange({ ...config, enabled: !config.enabled })

    const activeIntent = AVATAR_OPTIONS.intent.find(i => i.id === config.intent)

    // ── Compact toolbar chip (collapsed state) ─────────────────────────────────
    if (compact && !expanded) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Toggle */}
                <button
                    onClick={toggleEnabled}
                    disabled={disabled}
                    style={{
                        display:       'inline-flex',
                        alignItems:    'center',
                        gap:            5,
                        padding:       '6px 11px',
                        borderRadius:   7,
                        fontSize:       11,
                        fontWeight:     600,
                        cursor:         disabled ? 'default' : 'pointer',
                        border:        `1px solid ${config.enabled ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                        background:     config.enabled ? 'var(--sys-primary-ghost)' : 'var(--sys-surface)',
                        color:          config.enabled ? 'var(--sys-primary)' : 'var(--sys-text-muted)',
                        transition:    'all 0.15s ease',
                    }}
                >
                    {config.enabled ? <CheckCircle2 size={12} /> : <User size={12} />}
                    Add Human
                </button>

                {/* Summary chip when enabled */}
                {config.enabled && (
                    <button
                        onClick={() => setExpanded(true)}
                        disabled={disabled}
                        style={{
                            display:       'inline-flex',
                            alignItems:    'center',
                            gap:            4,
                            padding:       '5px 9px',
                            borderRadius:   6,
                            fontSize:       10,
                            fontWeight:     500,
                            cursor:         disabled ? 'default' : 'pointer',
                            border:        '1px solid var(--sys-border)',
                            background:    'var(--sys-surface)',
                            color:         'var(--sys-text-muted)',
                        }}
                    >
                        {AVATAR_OPTIONS.origin.find(o => o.id === config.origin)?.emoji || '👤'}{' '}
                        {AVATAR_OPTIONS.gender.find(g => g.id === config.gender)?.label} ·{' '}
                        {AVATAR_OPTIONS.age.find(a => a.id === config.age)?.label} · {activeIntent?.label}
                        <ChevronDown size={10} style={{ marginLeft: 2 }} />
                    </button>
                )}
            </div>
        )
    }

    // ── Full panel ─────────────────────────────────────────────────────────────
    return (
        <div
            style={{
                borderRadius:   10,
                border:        `1px solid ${config.enabled ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                background:    'var(--sys-surface)',
                overflow:      'hidden',
                marginBottom:   12,
                transition:    'border-color 0.2s ease',
            }}
        >
            {/* Header row */}
            <div
                style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:             8,
                    padding:        '10px 14px',
                    cursor:         disabled ? 'default' : 'pointer',
                    background:     config.enabled ? 'var(--sys-primary-ghost)' : 'transparent',
                    borderBottom:  (config.enabled && expanded) ? '1px solid var(--sys-border)' : 'none',
                }}
                onClick={!disabled ? () => setExpanded(e => !e) : undefined}
            >
                {/* Toggle */}
                <button
                    onClick={e => { e.stopPropagation(); toggleEnabled() }}
                    disabled={disabled}
                    style={{
                        display:       'inline-flex',
                        alignItems:    'center',
                        gap:            5,
                        padding:       '4px 9px',
                        borderRadius:   6,
                        fontSize:       11,
                        fontWeight:     700,
                        cursor:         disabled ? 'default' : 'pointer',
                        border:        `1px solid ${config.enabled ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                        background:     config.enabled ? 'var(--sys-primary)' : 'var(--sys-bg)',
                        color:          config.enabled ? '#fff' : 'var(--sys-text-muted)',
                        flexShrink:     0,
                        transition:    'all 0.15s ease',
                    }}
                >
                    {config.enabled ? <CheckCircle2 size={11} /> : <User size={11} />}
                    {config.enabled ? 'Human ON' : 'Add Human'}
                </button>

                {config.enabled && (
                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', flex: 1 }}>
                        {AVATAR_OPTIONS.origin.find(o => o.id === config.origin)?.emoji} {AVATAR_OPTIONS.gender.find(g => g.id === config.gender)?.label} · {AVATAR_OPTIONS.age.find(a => a.id === config.age)?.label} · {activeIntent?.label}
                    </span>
                )}
                {!config.enabled && (
                    <span style={{ fontSize: 11, color: 'var(--sys-text-muted)', flex: 1 }}>
                        Add a real person to make posts feel human, not AI-generated
                    </span>
                )}

                {compact && (
                    <button
                        onClick={e => { e.stopPropagation(); setExpanded(false) }}
                        disabled={disabled}
                        style={{ padding: '2px', background: 'none', border: 'none', color: 'var(--sys-text-muted)', cursor: 'pointer' }}
                    >
                        <X size={13} />
                    </button>
                )}

                {expanded
                    ? <ChevronUp size={14} style={{ color: 'var(--sys-text-muted)', flexShrink: 0 }} />
                    : <ChevronDown size={14} style={{ color: 'var(--sys-text-muted)', flexShrink: 0 }} />
                }
            </div>

            {/* Config body */}
            {config.enabled && expanded && (
                <div style={{ padding: '14px 14px 6px' }}>
                    <ChipGroup label="Origin & Market" options={AVATAR_OPTIONS.origin}   value={config.origin}   onChange={v => update('origin', v)}   disabled={disabled} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <ChipGroup label="Gender"   options={AVATAR_OPTIONS.gender}   value={config.gender}   onChange={v => update('gender', v)}   disabled={disabled} />
                        <ChipGroup label="Age Range" options={AVATAR_OPTIONS.age}      value={config.age}      onChange={v => update('age', v)}      disabled={disabled} />
                    </div>
                    <ChipGroup label="Clothing Style" options={AVATAR_OPTIONS.clothing} value={config.clothing} onChange={v => update('clothing', v)} disabled={disabled} />

                    {/* Intent — radio-style with desc */}
                    <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sys-text-muted)', marginBottom: 8 }}>
                            Presence Mode
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                            {AVATAR_OPTIONS.intent.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => update('intent', opt.id)}
                                    disabled={disabled}
                                    style={{
                                        padding:        '8px 10px',
                                        borderRadius:    7,
                                        fontSize:        11,
                                        textAlign:      'left',
                                        cursor:          disabled ? 'default' : 'pointer',
                                        border:         `1px solid ${config.intent === opt.id ? 'var(--sys-primary)' : 'var(--sys-border)'}`,
                                        background:      config.intent === opt.id ? 'var(--sys-primary-ghost)' : 'var(--sys-bg)',
                                        color:          'var(--sys-text)',
                                        transition:     'all 0.15s ease',
                                    }}
                                >
                                    <div style={{ fontWeight: config.intent === opt.id ? 700 : 500, color: config.intent === opt.id ? 'var(--sys-primary)' : 'var(--sys-text)' }}>
                                        {opt.label}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', marginTop: 2, lineHeight: 1.3 }}>
                                        {opt.desc}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ fontSize: 10, color: 'var(--sys-text-muted)', padding: '6px 8px', background: 'var(--sys-bg)', borderRadius: 6, marginBottom: 10, lineHeight: 1.5 }}>
                        💡 This config persists across all tools in this session. Change it per-tool using the "Add Human" toggle.
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Export default config for external state initialization ────────────────────
export { DEFAULT_CONFIG }

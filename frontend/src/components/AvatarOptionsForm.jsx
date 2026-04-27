/**
 * AvatarOptionsForm — Mantram AI Avatar Studio
 *
 * SINGLE SOURCE OF TRUTH for all 7 avatar option groups.
 * Imported by both AvatarGenerator.jsx (standalone page) and
 * AvatarPicker.jsx (modal embed). Add new options here only.
 *
 * Props:
 *   options       {Object}   — controlled state from parent
 *   onChange      {Function} — (key, value) => void
 *   errors        {Object}   — { genderExpression?: string }
 *   compact       {boolean}  — true = compact mode for AvatarPicker modal
 */

import React from 'react';

// ─── Option Definitions ───────────────────────────────────────────────────────

const ORIGIN_OPTIONS = [
    { value: 'south-asian',     label: 'South Asian',     emoji: '🌿', swatch: 'linear-gradient(135deg, #c8a882, #8b6344)' },
    { value: 'southeast-asian', label: 'SE Asian',         emoji: '🌺', swatch: 'linear-gradient(135deg, #d4a77a, #7a5230)' },
    { value: 'east-asian',      label: 'East Asian',       emoji: '🌸', swatch: 'linear-gradient(135deg, #f5e6d3, #c9a882)' },
    { value: 'middle-eastern',  label: 'Middle Eastern',   emoji: '🌙', swatch: 'linear-gradient(135deg, #c09060, #7a5020)' },
    { value: 'african',         label: 'African',          emoji: '🌍', swatch: 'linear-gradient(135deg, #8b4513, #4a1c00)' },
    { value: 'western',         label: 'Western',          emoji: '🌾', swatch: 'linear-gradient(135deg, #f4d9b8, #c8a070)' },
    { value: 'latin',           label: 'Latin',            emoji: '🌶️', swatch: 'linear-gradient(135deg, #c88040, #8b4515)' },
    { value: 'mixed',           label: 'Mixed',            emoji: '🌐', swatch: 'linear-gradient(135deg, #d4a060, #8b6040)' },
];

const AGE_OPTIONS = [
    { value: 'young-adult',  label: 'Young Adult',   sub: 'Early 20s' },
    { value: 'adult',        label: 'Adult',          sub: 'Late 20s–30s' },
    { value: 'mature-adult', label: 'Mature',         sub: 'Distinguished' },
];

const GENDER_OPTIONS = [
    { value: 'feminine',  label: 'Feminine',    icon: 'female' },
    { value: 'masculine', label: 'Masculine',   icon: 'male' },
    { value: 'neutral',   label: 'Neutral',     icon: 'person' },
];

const CLOTHING_OPTIONS = [
    { value: 'casual',       label: 'Casual',       icon: 'checkroom' },
    { value: 'smart-casual', label: 'Smart Casual', icon: 'business_center' },
    { value: 'professional', label: 'Professional', icon: 'work' },
    { value: 'streetwear',   label: 'Streetwear',   icon: 'style' },
    { value: 'athletic',     label: 'Athletic',     icon: 'fitness_center' },
    { value: 'traditional',  label: 'Traditional',  icon: 'museum' },
];

const ENVIRONMENT_OPTIONS = [
    { value: 'minimalist',   label: 'Studio',       icon: 'photo_camera', color: '#6b7280' },
    { value: 'home',         label: 'Home',          icon: 'home', color: '#f59e0b' },
    { value: 'office',       label: 'Office',        icon: 'apartment', color: '#3b82f6' },
    { value: 'outdoor-urban',label: 'Urban',         icon: 'location_city', color: '#10b981' },
    { value: 'nature',       label: 'Nature',        icon: 'park', color: '#22c55e' },
    { value: 'gym',          label: 'Gym',           icon: 'sports_gymnastics', color: '#f97316' },
];

const LIGHTING_OPTIONS = [
    { value: 'natural-daylight',  label: 'Daylight',    icon: 'wb_sunny', color: '#fbbf24' },
    { value: 'golden-hour',       label: 'Golden Hour', icon: 'wb_twilight', color: '#f97316' },
    { value: 'studio-bright',     label: 'Studio',      icon: 'light_mode', color: '#e5e7eb' },
    { value: 'moody-cinematic',   label: 'Cinematic',   icon: 'movie', color: '#8b5cf6' },
    { value: 'cool-professional', label: 'Cool Pro',    icon: 'ac_unit', color: '#60a5fa' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function GroupLabel({ children, error }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: error ? '#f97316' : 'rgba(255,255,255,0.4)',
            }}>
                {children}
                {error && <span style={{ marginLeft: 6, color: '#f97316' }}>✕ Required</span>}
            </span>
        </div>
    );
}

function OptionCard({ value, selected, onClick, children, compact, ariaLabel }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={ariaLabel}
            tabIndex={0}
            onClick={onClick}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: compact ? '6px 8px' : '8px 10px',
                borderRadius: 10,
                border: selected
                    ? '2px solid #f97316'
                    : '1.5px solid rgba(255,255,255,0.08)',
                background: selected
                    ? 'rgba(249,115,22,0.15)'
                    : 'rgba(255,255,255,0.03)',
                color: selected ? '#f97316' : 'rgba(255,255,255,0.65)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                minWidth: compact ? 52 : 60,
                outline: 'none',
                flexShrink: 0,
            }}
        >
            {children}
        </button>
    );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function AvatarOptionsForm({
    options = {},
    onChange,
    errors = {},
    compact = false,
}) {
    const gap = compact ? 6 : 8;
    const rowStyle = {
        display: 'flex',
        flexWrap: 'wrap',
        gap,
    };
    const groupStyle = {
        marginBottom: compact ? 12 : 18,
    };
    const iconSize = compact ? 16 : 20;
    const labelFontSize = compact ? 9 : 10;

    return (
        <div>
            {/* ── 1. GENDER EXPRESSION (required) ── */}
            <div style={groupStyle}>
                <GroupLabel error={!!errors.genderExpression}>Gender Expression</GroupLabel>
                <div style={rowStyle}>
                    {GENDER_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.genderExpression === opt.value}
                            onClick={() => onChange('genderExpression', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: iconSize, marginBottom: 3 }}>{opt.icon}</span>
                            <span style={{ fontSize: labelFontSize, fontWeight: 700, whiteSpace: 'nowrap' }}>{opt.label}</span>
                        </OptionCard>
                    ))}
                </div>
                {errors.genderExpression && (
                    <div style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>
                        {errors.genderExpression}
                    </div>
                )}
            </div>

            {/* ── 2. REGIONAL ORIGIN ── */}
            <div style={groupStyle}>
                <GroupLabel>Regional Appearance</GroupLabel>
                <div style={rowStyle}>
                    {ORIGIN_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.origin === opt.value}
                            onClick={() => onChange('origin', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <div style={{
                                width: compact ? 18 : 22,
                                height: compact ? 18 : 22,
                                borderRadius: '50%',
                                background: opt.swatch,
                                marginBottom: 3,
                                border: options.origin === opt.value ? '2px solid #f97316' : '1.5px solid rgba(255,255,255,0.15)',
                            }} />
                            <span style={{ fontSize: labelFontSize, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center' }}>{opt.label}</span>
                        </OptionCard>
                    ))}
                </div>
            </div>

            {/* ── 3. AGE RANGE ── */}
            <div style={groupStyle}>
                <GroupLabel>Age Bearing</GroupLabel>
                <div style={rowStyle}>
                    {AGE_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.ageRange === opt.value}
                            onClick={() => onChange('ageRange', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <span style={{ fontSize: compact ? 11 : 12, fontWeight: 700 }}>{opt.label}</span>
                            {!compact && (
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{opt.sub}</span>
                            )}
                        </OptionCard>
                    ))}
                </div>
            </div>

            {/* ── 4. CLOTHING STYLE ── */}
            <div style={groupStyle}>
                <GroupLabel>Clothing Style</GroupLabel>
                <div style={rowStyle}>
                    {CLOTHING_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.clothingStyle === opt.value}
                            onClick={() => onChange('clothingStyle', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: iconSize, marginBottom: 3 }}>{opt.icon}</span>
                            <span style={{ fontSize: labelFontSize, fontWeight: 700, whiteSpace: 'nowrap' }}>{opt.label}</span>
                        </OptionCard>
                    ))}
                </div>
            </div>

            {/* ── 5. ENVIRONMENT ── */}
            <div style={groupStyle}>
                <GroupLabel>Background Setting</GroupLabel>
                <div style={rowStyle}>
                    {ENVIRONMENT_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.environment === opt.value}
                            onClick={() => onChange('environment', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <span
                                className="material-symbols-outlined"
                                style={{
                                    fontSize: iconSize,
                                    marginBottom: 3,
                                    color: options.environment === opt.value ? '#f97316' : opt.color,
                                }}
                            >
                                {opt.icon}
                            </span>
                            <span style={{ fontSize: labelFontSize, fontWeight: 700 }}>{opt.label}</span>
                        </OptionCard>
                    ))}
                </div>
            </div>

            {/* ── 6. LIGHTING MOOD ── */}
            <div style={groupStyle}>
                <GroupLabel>Lighting Mood</GroupLabel>
                <div style={rowStyle}>
                    {LIGHTING_OPTIONS.map(opt => (
                        <OptionCard
                            key={opt.value}
                            value={opt.value}
                            selected={options.lightingMood === opt.value}
                            onClick={() => onChange('lightingMood', opt.value)}
                            compact={compact}
                            ariaLabel={opt.label}
                        >
                            <span
                                className="material-symbols-outlined"
                                style={{
                                    fontSize: iconSize,
                                    marginBottom: 3,
                                    color: options.lightingMood === opt.value ? '#f97316' : opt.color,
                                }}
                            >
                                {opt.icon}
                            </span>
                            <span style={{ fontSize: labelFontSize, fontWeight: 700 }}>{opt.label}</span>
                        </OptionCard>
                    ))}
                </div>
            </div>

            {/* ── 7. ADDITIONAL DETAILS (free text) ── */}
            <div style={groupStyle}>
                <GroupLabel>Additional Details</GroupLabel>
                <textarea
                    value={options.additionalDetails || ''}
                    onChange={e => onChange('additionalDetails', e.target.value)}
                    maxLength={200}
                    rows={compact ? 2 : 3}
                    placeholder={compact
                        ? 'e.g. red headband, holding coffee, curly hair'
                        : 'e.g. red headband, holding a coffee cup, smiling, curly hair, natural makeup'
                    }
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1.5px solid rgba(255,255,255,0.1)',
                        borderRadius: 10,
                        padding: '10px 12px',
                        color: '#fff',
                        fontSize: 12,
                        lineHeight: 1.5,
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                        boxSizing: 'border-box',
                    }}
                    onFocus={e => e.target.style.borderColor = 'rgba(249,115,22,0.5)'}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, textAlign: 'right' }}>
                    {(options.additionalDetails || '').length}/200
                </div>
            </div>
        </div>
    );
}

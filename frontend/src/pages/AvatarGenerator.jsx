/**
 * AvatarGenerator — Mantram AI
 * Standalone page at /avatar-generator
 *
 * Two-column layout:
 *  Left column — AvatarOptionsForm + Generate button + credits indicator
 *  Right column — 3-up variant result grid + action buttons
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SEOHead from '../components/SEOHead';
import AvatarOptionsForm from '../components/AvatarOptionsForm';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

// ─── Default option state ─────────────────────────────────────────────────────
const DEFAULT_OPTIONS = {
    origin: 'south-asian',
    ageRange: 'adult',
    genderExpression: 'feminine', // pre-filled so generate works immediately
    clothingStyle: 'smart-casual',
    environment: 'minimalist',
    lightingMood: 'natural-daylight',
    additionalDetails: '',
};

// ─── Variant Card ─────────────────────────────────────────────────────────────
function VariantCard({ variant, selected, onSelect, generating }) {
    if (generating) {
        return (
            <div style={shimmerCardStyle}>
                <div style={shimmerInnerStyle} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>Generating...</span>
                </div>
            </div>
        );
    }

    if (!variant || variant.failed || !variant.url) {
        return (
            <div style={{ ...shimmerCardStyle, background: 'rgba(239,68,68,0.05)', border: '1.5px solid rgba(239,68,68,0.2)', cursor: 'default' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(239,68,68,0.5)' }}>broken_image</span>
                    <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.7)', fontWeight: 600 }}>Failed</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '0 12px' }}>
                        {variant?.error?.substring(0, 60) || 'Generation failed'}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={() => onSelect(variant.slot)}
            style={{
                ...shimmerCardStyle,
                border: selected ? '2.5px solid #f97316' : '1.5px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                background: 'transparent',
                boxShadow: selected ? '0 0 0 4px rgba(249,115,22,0.12)' : 'none',
                transition: 'all 0.2s ease',
            }}
        >
            <img
                src={variant.url}
                alt={`Avatar variant ${variant.slot + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 13 }}
                loading="lazy"
            />
            {/* Slot label */}
            <div style={{
                position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.7)', borderRadius: 20, padding: '3px 10px',
                fontSize: 10, fontWeight: 700, color: selected ? '#f97316' : 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
            }}>
                {selected ? '✓ Selected' : `Option ${variant.slot + 1}`}
            </div>
        </div>
    );
}

const shimmerCardStyle = {
    position: 'relative',
    aspectRatio: '9/16',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.04)',
    border: '1.5px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
};
const shimmerInnerStyle = {
    position: 'absolute', inset: 0,
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%)',
    animation: 'shimmer 1.5s infinite',
};

// ─── Save as Template Modal ───────────────────────────────────────────────────
function SaveTemplateModal({ imageUrl, prompt, onClose, onSaved }) {
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!name.trim()) { setError('Template name is required'); return; }
        setSaving(true);
        try {
            await api('/superadmin/templates/promote-from-generated', {
                method: 'POST',
                body: JSON.stringify({
                    name: name.trim(),
                    previewUrl: imageUrl,
                    savedPrompt: prompt,
                    studioOrigin: 'avatar',
                }),
            });
            onSaved();
        } catch (e) {
            setError(e.message || 'Failed to save template');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={onClose}>
            <div style={{ background: '#13131e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}
                onClick={e => e.stopPropagation()}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Save as Template</h3>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Saved as inactive — activate in Template Manager.</p>
                <img src={imageUrl} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', objectPosition: 'top', borderRadius: 10, marginBottom: 16 }} />
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Template name (e.g. South Asian Professional Female)"
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 10, color: '#fff', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                />
                {error && <div style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={primaryBtnStyle}>
                        {saving ? 'Saving...' : 'Save Template'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const primaryBtnStyle = {
    background: '#f97316', color: '#fff', border: 'none', padding: '10px 20px',
    borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
};
const secondaryBtnStyle = {
    background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.1)',
    padding: '10px 16px', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AvatarGenerator() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isSuperAdmin = user?.role === 'superadmin';

    const [options, setOptions] = useState({ ...DEFAULT_OPTIONS });
    const [errors, setErrors] = useState({});
    const [promptMode, setPromptMode] = useState('structured'); // 'structured' | 'custom'
    const [customPrompt, setCustomPrompt] = useState('');
    const [generating, setGenerating] = useState(false);
    const [variants, setVariants] = useState([]);
    const [selectedSlot, setSelectedSlot] = useState(null);
    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [creditsUsed, setCreditsUsed] = useState(0);
    const [saveModal, setSaveModal] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [studioMenuOpen, setStudioMenuOpen] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleOptionChange = useCallback((key, value) => {
        setOptions(prev => ({ ...prev, [key]: value }));
        if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
    }, [errors]);

    const handleGenerate = async () => {
        if (promptMode === 'custom') {
            if (!customPrompt.trim() || customPrompt.trim().length < 10) {
                showToast('Please enter a more detailed prompt (at least 10 characters)', 'error');
                return;
            }
        } else {
            if (!options.genderExpression) {
                setErrors({ genderExpression: 'Please select a gender expression to continue' });
                return;
            }
        }

        setGenerating(true);
        setVariants([null, null, null]);
        setSelectedSlot(null);
        setErrors({});

        try {
            const body = promptMode === 'custom'
                ? { directPrompt: customPrompt.trim() }
                : { ...options };

            const data = await api('/avatar-studio/generate', {
                method: 'POST',
                body: JSON.stringify(body),
            });

            setVariants(data.variants || []);
            setGeneratedPrompt(data.prompt || '');
            setCreditsUsed(data.creditsUsed || 4);

            const firstOk = (data.variants || []).find(v => !v.failed && v.url);
            if (firstOk) setSelectedSlot(firstOk.slot);
        } catch (err) {
            showToast(err.message || 'Generation failed. Please try again.', 'error');
            setVariants([]);
        } finally {
            setGenerating(false);
        }
    };

    const handleUseInStudio = (studio) => {
        if (selectedSlot === null || !variants[selectedSlot]?.url) return;
        const url = variants[selectedSlot].url;
        sessionStorage.setItem('mantram_pending_avatar_url', url);
        setStudioMenuOpen(false);

        const routes = {
            'video': '/video-studio',
            'qads': '/video-studio?tab=qads',
            'creative': '/creative-studio',
        };
        navigate(routes[studio] || '/dashboard');
    };

    const handleDownload = () => {
        if (selectedSlot === null || !variants[selectedSlot]?.url) return;
        const a = document.createElement('a');
        a.href = variants[selectedSlot].url;
        a.download = `mantram-avatar-${Date.now()}.jpg`;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
    };

    const selectedUrl = selectedSlot !== null ? variants[selectedSlot]?.url : null;
    const hasResults = variants.length > 0 && !generating;

    return (
        <DashboardLayout>
            <SEOHead title="Avatar Generator — Mantram AI" description="Generate photorealistic AI avatars for your UGC campaigns and creative studio." />

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 9999,
                    padding: '12px 18px', borderRadius: 12, fontSize: 13, fontWeight: 700,
                    background: toast.type === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                    border: `1px solid ${toast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    color: toast.type === 'error' ? '#f87171' : '#6ee7b7',
                    backdropFilter: 'blur(8px)',
                }}>
                    {toast.msg}
                </div>
            )}

            {/* Save Template Modal */}
            {saveModal && selectedUrl && (
                <SaveTemplateModal
                    imageUrl={selectedUrl}
                    prompt={generatedPrompt}
                    onClose={() => setSaveModal(false)}
                    onSaved={() => {
                        setSaveModal(false);
                        setSaveSuccess(true);
                        showToast('Saved to Template Library (inactive — activate in Template Manager)', 'success');
                    }}
                />
            )}

            {/* ── Page Header ── */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#f97316' }}>face</span>
                    <div>
                        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>Avatar Generator</h1>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                            Create photorealistic 9:16 portrait avatars — 3 variants per generation
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Two-column layout ── */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

                {/* ── Left Column — Options ── */}
                <div style={{ width: 360, flexShrink: 0 }}>
                    <div style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 16,
                        padding: 20,
                    }}>

                        {/* Mode toggle */}
                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, marginBottom: 18 }}>
                            {[{ id: 'structured', label: 'Guided Options', icon: 'tune' }, { id: 'custom', label: 'Custom Prompt', icon: 'edit_note' }].map(m => (
                                <button key={m.id} onClick={() => setPromptMode(m.id)} style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                    padding: '7px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                                    background: promptMode === m.id ? 'rgba(249,115,22,0.15)' : 'transparent',
                                    color: promptMode === m.id ? '#f97316' : 'rgba(255,255,255,0.4)',
                                    transition: 'all 0.15s',
                                }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{m.icon}</span>{m.label}
                                </button>
                            ))}
                        </div>

                        {promptMode === 'structured' ? (
                            <AvatarOptionsForm
                                options={options}
                                onChange={handleOptionChange}
                                errors={errors}
                                compact={false}
                            />
                        ) : (
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Describe your character</div>
                                <textarea
                                    value={customPrompt}
                                    onChange={e => setCustomPrompt(e.target.value)}
                                    rows={7}
                                    placeholder={'Examples:\n"A confident South Asian woman in her 30s wearing a red silk saree, dramatic studio lighting"\n\n"Young athletic man with curly hair, casual streetwear, urban outdoor setting"'}
                                    style={{
                                        width: '100%', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)',
                                        borderRadius: 12, padding: '12px 14px', color: '#fff', fontSize: 13, resize: 'vertical',
                                        outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.6,
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(249,115,22,0.4)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.5 }}>
                                    Write freely — describe appearance, clothing, setting, mood. The AI will generate a photorealistic 9:16 portrait.
                                </p>
                            </div>
                        )}

                        {/* Generate button */}
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            style={{
                                width: '100%', padding: '13px 0',
                                background: generating ? 'rgba(249,115,22,0.4)' : 'linear-gradient(135deg, #f97316, #ea580c)',
                                color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800,
                                cursor: generating ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                marginTop: 4, transition: 'opacity 0.2s ease',
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                {generating ? 'progress_activity' : 'auto_awesome'}
                            </span>
                            {generating ? 'Generating 3 Variants...' : 'Generate 3 Variants'}
                        </button>

                        {/* Credits indicator */}
                        {!isSuperAdmin && (
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>token</span>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>4 credits · covers all 3 variants</span>
                            </div>
                        )}
                        {isSuperAdmin && (
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#f97316' }}>shield</span>
                                <span style={{ fontSize: 11, color: 'rgba(249,115,22,0.7)', fontWeight: 600 }}>Super Admin · Free generation</span>
                            </div>
                        )}
                        {hasResults && creditsUsed > 0 && !isSuperAdmin && (
                            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                {creditsUsed} credits used
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right Column — Results ── */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {!hasResults && !generating && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 400,
                            border: '1.5px dashed rgba(255,255,255,0.1)',
                            borderRadius: 16,
                            color: 'rgba(255,255,255,0.2)',
                            gap: 12,
                        }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>face</span>
                            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Configure options and click Generate</p>
                            <p style={{ fontSize: 12, margin: 0 }}>3 photorealistic variants will appear here</p>
                        </div>
                    )}

                    {/* 3-up Variant Grid */}
                    {(generating || hasResults) && (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                                {[0, 1, 2].map(slot => (
                                    <VariantCard
                                        key={slot}
                                        variant={variants[slot]}
                                        selected={selectedSlot === slot}
                                        onSelect={setSelectedSlot}
                                        generating={generating}
                                    />
                                ))}
                            </div>

                            {/* Action Buttons */}
                            {hasResults && selectedSlot !== null && variants[selectedSlot]?.url && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>

                                    {/* Regenerate */}
                                    <button onClick={handleGenerate} style={secondaryBtnStyle}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 15, marginRight: 4 }}>refresh</span>
                                        Regenerate
                                    </button>

                                    {/* Download */}
                                    <button onClick={handleDownload} style={secondaryBtnStyle}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 15, marginRight: 4 }}>download</span>
                                        Download
                                    </button>

                                    {/* Save as Template — superadmin only */}
                                    {isSuperAdmin && (
                                        <button onClick={() => setSaveModal(true)} style={secondaryBtnStyle}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 15, marginRight: 4 }}>save</span>
                                            Save as Template
                                        </button>
                                    )}

                                    {/* Use in Studio dropdown */}
                                    <div style={{ position: 'relative' }}>
                                        <button
                                            onClick={() => setStudioMenuOpen(prev => !prev)}
                                            style={{ ...primaryBtnStyle, display: 'flex', alignItems: 'center', gap: 6 }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>open_in_new</span>
                                            Use in Studio
                                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>expand_more</span>
                                        </button>
                                        {studioMenuOpen && (
                                            <div style={{
                                                position: 'absolute', bottom: 'calc(100% + 6px)', right: 0,
                                                background: '#1a1a28', border: '1px solid rgba(255,255,255,0.12)',
                                                borderRadius: 12, padding: '6px 0', minWidth: 180, zIndex: 50,
                                                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                                            }}>
                                                {[
                                                    { id: 'video', label: 'Video Studio', icon: 'videocam' },
                                                    { id: 'qads', label: 'Q-Ads Studio', icon: 'movie' },
                                                    { id: 'creative', label: 'Creative Studio', icon: 'image' },
                                                ].map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleUseInStudio(item.id)}
                                                        style={{
                                                            width: '100%', padding: '9px 16px', background: 'transparent',
                                                            border: 'none', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600,
                                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                                            textAlign: 'left',
                                                        }}
                                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f97316' }}>{item.icon}</span>
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Prompt reveal (collapsed) */}
                            {hasResults && generatedPrompt && (
                                <details style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                                    <summary style={{ cursor: 'pointer', userSelect: 'none', fontWeight: 600 }}>
                                        View assembled prompt
                                    </summary>
                                    <pre style={{
                                        marginTop: 8, padding: 12, background: 'rgba(255,255,255,0.04)',
                                        borderRadius: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        lineHeight: 1.6, fontSize: 11, color: 'rgba(255,255,255,0.5)',
                                    }}>
                                        {generatedPrompt}
                                    </pre>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Shimmer + spin keyframes */}
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </DashboardLayout>
    );
}

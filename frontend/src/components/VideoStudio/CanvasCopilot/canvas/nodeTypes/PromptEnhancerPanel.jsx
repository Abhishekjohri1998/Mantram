import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Check, X, RotateCw, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../../../../services/api';

export default function PromptEnhancerPanel({ nodeId, rawPrompt: initialRawPrompt, sessionId, onAccept, onClose }) {
    const [rawPrompt, setRawPrompt] = useState(initialRawPrompt || '');
    const [enhancedPrompt, setEnhancedPrompt] = useState('');
    const [changes, setChanges] = useState([]);
    const [presets, setPresets] = useState([]);
    const [selectedPresetId, setSelectedPresetId] = useState('auto');
    const [loading, setLoading] = useState(false);
    const [enhancing, setEnhancing] = useState(false);
    const [error, setError] = useState('');
    const [showCustomForm, setShowCustomForm] = useState(false);

    // Custom preset form state
    const [customName, setCustomName] = useState('');
    const [customPrompt, setCustomPrompt] = useState('');
    const [customLimit, setCustomLimit] = useState(2000);
    const [savingCustom, setSavingCustom] = useState(false);

    // Fetch presets on load
    const fetchPresets = useCallback(() => {
        setLoading(true);
        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/presets`)
            .then(res => {
                if (res.success) {
                    setPresets(res.presets);
                } else {
                    setError('Failed to load presets');
                }
            })
            .catch(() => setError('Failed to load presets'))
            .finally(() => setLoading(false));
    }, [sessionId]);

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]);

    const activePreset = presets.find(p => p.id === selectedPresetId) || { char_limit: 2000, name: 'Auto-detect' };

    const handleEnhance = () => {
        if (!rawPrompt.trim()) {
            setError('Please enter a raw prompt first.');
            return;
        }
        setEnhancing(true);
        setError('');
        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/enhance-prompt`, {
            method: 'POST',
            body: JSON.stringify({ nodeId, presetId: selectedPresetId, rawPrompt }),
        })
            .then(res => {
                if (res.success) {
                    setEnhancedPrompt(res.enhancedPrompt);
                    setChanges(res.changes || []);
                } else {
                    setError(res.error || 'Failed to enhance prompt');
                }
            })
            .catch(err => setError(err.message || 'Enhancement failed'))
            .finally(() => setEnhancing(false));
    };

    const handleSaveCustom = (e) => {
        e.preventDefault();
        if (!customName.trim() || !customPrompt.trim()) return;
        setSavingCustom(true);
        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/presets`, {
            method: 'POST',
            body: JSON.stringify({
                name: customName,
                system_prompt: customPrompt,
                char_limit: Number(customLimit),
                category: 'task',
            }),
        })
            .then(res => {
                if (res.success) {
                    setShowCustomForm(false);
                    setCustomName('');
                    setCustomPrompt('');
                    setCustomLimit(2000);
                    fetchPresets();
                } else {
                    setError(res.error || 'Failed to create preset');
                }
            })
            .catch(err => setError(err.message || 'Failed to create preset'))
            .finally(() => setSavingCustom(false));
    };

    const handleDeletePreset = (e, presetId) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this custom preset?')) return;
        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/presets/${presetId}`, {
            method: 'DELETE',
        })
            .then(res => {
                if (res.success) {
                    if (selectedPresetId === presetId) {
                        setSelectedPresetId('auto');
                    }
                    fetchPresets();
                }
            })
            .catch(() => setError('Failed to delete preset'));
    };

    const handleAccept = () => {
        onAccept(enhancedPrompt, rawPrompt, selectedPresetId);
    };

    const charCount = enhancedPrompt.length;
    const limitExceeded = charCount > activePreset.char_limit;

    return (
        <div className="prompt-enhancer-panel glassmorphic nodrag nowheel" onMouseDown={e => e.stopPropagation()}>
            <div className="enhancer-header">
                <div className="title-area">
                    <Sparkles className="icon-sparkle animate-float" size={16} />
                    <span>Prompt Enhancer</span>
                </div>
                <button className="close-btn" onClick={onClose}>
                    <X size={14} />
                </button>
            </div>

            {error && <div className="enhancer-error">{error}</div>}

            <div className="enhancer-body">
                {/* Presets Chips Selection */}
                <div className="section-label">Select Preset / Target:</div>
                {loading ? (
                    <div className="presets-loading">Loading presets...</div>
                ) : (
                    <div className="preset-chips">
                        <button
                            className={`preset-chip ${selectedPresetId === 'auto' ? 'active' : ''}`}
                            onClick={() => setSelectedPresetId('auto')}
                        >
                            ✨ Auto-detect
                        </button>
                        {presets.map(p => (
                            <button
                                key={p.id}
                                className={`preset-chip ${selectedPresetId === p.id ? 'active' : ''}`}
                                onClick={() => setSelectedPresetId(p.id)}
                            >
                                {p.name}
                                {p.editable && (
                                    <span className="delete-preset-icon" onClick={(e) => handleDeletePreset(e, p.id)}>
                                        <Trash2 size={10} />
                                    </span>
                                )}
                            </button>
                        ))}
                        <button
                            className="preset-chip preset-chip--add"
                            onClick={() => setShowCustomForm(!showCustomForm)}
                        >
                            <Plus size={10} /> Custom Preset
                        </button>
                    </div>
                )}

                {/* Custom Preset Creation Form */}
                {showCustomForm && (
                    <form className="custom-preset-form" onSubmit={handleSaveCustom}>
                        <input
                            type="text"
                            placeholder="Preset Name (e.g. Cinematic Macro)"
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                            required
                        />
                        <textarea
                            placeholder="System Instructions (e.g. Rewrite the prompt focusing on dynamic close-up details...)"
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value)}
                            required
                            rows={3}
                        />
                        <div className="form-row">
                            <label>Char Limit:</label>
                            <input
                                type="number"
                                value={customLimit}
                                onChange={e => setCustomLimit(e.target.value)}
                                min={100}
                                max={5000}
                            />
                            <button type="submit" disabled={savingCustom}>
                                {savingCustom ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Inputs & Outputs */}
                <div className="prompts-grid">
                    <div className="prompt-box">
                        <label>Original Idea / Raw Prompt</label>
                        <textarea
                            value={rawPrompt}
                            onChange={e => setRawPrompt(e.target.value)}
                            placeholder="Write your raw generation concept here..."
                            rows={4}
                        />
                    </div>

                    {enhancedPrompt && (
                        <div className="prompt-box">
                            <label>Enhanced Prompt Result</label>
                            <textarea
                                value={enhancedPrompt}
                                onChange={e => setEnhancedPrompt(e.target.value)}
                                placeholder="Enhanced prompt output..."
                                rows={4}
                            />
                            <div className={`char-counter ${limitExceeded ? 'exceeded' : ''}`}>
                                {charCount} / {activePreset.char_limit} characters
                                {limitExceeded && <span className="warning-text"> (Cap Exceeded)</span>}
                            </div>
                        </div>
                    )}
                </div>

                {/* Applied Changes List */}
                {changes.length > 0 && (
                    <div className="enhancements-list-box">
                        <div className="section-label">Applied Enhancements:</div>
                        <ul>
                            {changes.map((c, i) => (
                                <li key={i}>✓ {c}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Action Bar */}
            <div className="enhancer-footer">
                {!enhancedPrompt ? (
                    <button className="enhance-btn" onClick={handleEnhance} disabled={enhancing}>
                        {enhancing ? (
                            <>
                                <RotateCw className="animate-spin" size={14} />
                                Enhancing...
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} />
                                Enhance Prompt
                            </>
                        )}
                    </button>
                ) : (
                    <div className="action-row">
                        <button className="btn-secondary" onClick={handleEnhance} disabled={enhancing}>
                            {enhancing ? 'Enhancing...' : 'Regenerate'}
                        </button>
                        <button className="btn-accept" onClick={handleAccept} disabled={limitExceeded || enhancing}>
                            <Check size={14} />
                            Accept
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

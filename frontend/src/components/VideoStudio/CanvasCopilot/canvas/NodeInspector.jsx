/**
 * NodeInspector.jsx — Slide-in properties panel for the selected node.
 * Shows params as editable fields; emits update_params on change.
 * Also shows: port connections, cost estimate, run-this-node button.
 */

import { useState, useEffect } from 'react';
import useGraphStore from '../state/useGraphStore';
import { useCommandBus } from '../state/useCommandBus';
import { getNodeIcon } from './nodeTypes/nodeIcons';

/* ── Param renderers ─────────────────────────────────────── */
const PARAM_TYPES = {
    string: ({ value, onChange, multiline }) =>
        multiline
            ? <textarea
                className="inspector-input inspector-input--ta"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                rows={4}
              />
            : <input
                className="inspector-input"
                type="text"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
              />,
    number: ({ value, onChange, schema }) =>
        <input
            className="inspector-input"
            type="number"
            value={value ?? ''}
            min={schema?.min}
            max={schema?.max}
            step={schema?.step || 1}
            onChange={e => onChange(Number(e.target.value))}
        />,
    enum: ({ value, onChange, schema }) =>
        <select
            className="inspector-input"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
        >
            {(schema?.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>,
    string_list: ({ value, onChange }) =>
        <textarea
            className="inspector-input inspector-input--ta"
            value={(value || []).join('\n')}
            rows={3}
            onChange={e => onChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        />,
};

import { NODE_PARAM_SCHEMAS } from './nodeTypes/nodeParamSchemas';

/* ── Node type icons ─────────────────────────────────────── */
const NODE_ICONS = {
    video_generate: '🎬', image_generate: '🖼️', text_input: '📝',
    asset_input: '📎', prompt_expand: '✨', output: '🏁',
    concat: '🔗', voiceover: '🎙️', character_ref: '👤', style_ref: '🎨',
    batch: '🔁', frame_interpolate: '🎞️', lipsync: '👄', music_sfx: '🎵',
    upscale: '🔍', reframe: '🔄', trim: '✂️', resize: '📐',
};

/* ── State colors ────────────────────────────────────────── */
const STATE_COLORS = {
    idle:    'var(--sys-text-muted)',
    queued:  '#f59e0b',
    running: '#818cf8',
    done:    '#10b981',
    error:   '#ef4444',
    cached:  '#06b6d4',
    stale:   '#a78bfa',
};

/* ── Component ───────────────────────────────────────────── */
export default function NodeInspector({ onRunNode }) {
    const store = useGraphStore();
    const { graph, selectedNodeId } = store;
    const { emit } = useCommandBus();

    const node = graph?.nodes?.find(n => n.id === selectedNodeId);
    const [localParams, setLocalParams] = useState({});
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (node) { setLocalParams({ ...node.params }); setDirty(false); }
    }, [selectedNodeId]); // eslint-disable-line

    if (!node) return null;

    const schema     = NODE_PARAM_SCHEMAS[node.type] || {};
    const icon       = getNodeIcon(node.type, 20);
    const stateColor = STATE_COLORS[node.state] || 'var(--sys-text-muted)';
    const titleLabel = node.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

    function handleChange(key, val) {
        setLocalParams(p => ({ ...p, [key]: val }));
        setDirty(true);
    }

    async function handleSave() {
        setSaving(true);
        const res = await emit({
            type: 'update_params',
            payload: { nodeId: node.id, params: localParams },
            author: 'user',
        });
        setSaving(false);
        if (res.ok) setDirty(false);
    }

    return (
        <div className="node-inspector">
            {/* ── Sticky Header ── */}
            <div className="inspector-header">
                <button
                    className="inspector-close-btn"
                    onClick={() => store.clearSelection()}
                    title="Close Inspector (Escape)"
                >
                    ✕
                </button>

                <span className="inspector-node-icon">{icon}</span>
                <div className="inspector-title">{titleLabel}</div>
                <div className="inspector-id">{node.id}</div>

                <div className="inspector-state" style={{ color: stateColor }}>
                    <span className="inspector-state-dot" style={{ background: stateColor }} />
                    <span style={{ textTransform: 'capitalize' }}>{node.state || 'idle'}</span>
                    {node.author === 'agent' && (
                        <span className="inspector-agent-badge">✦ AI</span>
                    )}
                </div>
            </div>

            {/* ── Error ── */}
            {node.error && (
                <div className="inspector-error">⚠ {node.error}</div>
            )}

            {/* ── Parameters ── */}
            <div className="inspector-section">
                <div className="inspector-section-title">Parameters</div>

                {Object.keys(schema).length === 0 && (
                    <div className="inspector-empty">No configurable parameters</div>
                )}

                {Object.entries(schema).map(([key, s]) => {
                    const Renderer = PARAM_TYPES[s.type];
                    if (!Renderer) return null;
                    return (
                        <div key={key} className="inspector-field">
                            <label className="inspector-label">{s.label || key}</label>
                            <Renderer
                                value={localParams[key]}
                                schema={s}
                                multiline={s.multiline}
                                onChange={val => handleChange(key, val)}
                            />
                        </div>
                    );
                })}

                {dirty && (
                    <button
                        className="inspector-save-btn"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : '✓ Save Changes'}
                    </button>
                )}
            </div>

            {/* ── Output preview ── */}
            {node.state === 'done' && node.outputRef && (
                <div className="inspector-section">
                    <div className="inspector-section-title">Output</div>
                    {node.outputRef.match(/\.(mp4|webm|mov)$/i)
                        ? <video src={node.outputRef} className="inspector-media" controls />
                        : <img   src={node.outputRef} className="inspector-media" alt="output" />
                    }
                    <a href={node.outputRef} download className="inspector-download-btn">
                        ⬇ Download
                    </a>
                </div>
            )}

            {/* ── Actions ── */}
            <div className="inspector-section">
                <div className="inspector-section-title">Actions</div>
                <div className="inspector-actions">
                    <button
                        className="inspector-action-btn inspector-action-btn--run"
                        onClick={() => onRunNode?.(node.id)}
                        disabled={node.state === 'running' || node.state === 'queued'}
                        title="Run just this node"
                    >
                        ▶ Run node
                    </button>
                    <button
                        className="inspector-action-btn inspector-action-btn--delete"
                        onClick={() => emit({ type: 'delete_node', payload: { nodeId: node.id }, author: 'user' })}
                        title="Delete this node"
                    >
                        🗑 Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

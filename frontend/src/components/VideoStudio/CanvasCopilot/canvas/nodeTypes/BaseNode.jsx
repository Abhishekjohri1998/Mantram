import { useState, useEffect, useCallback, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
    Type,
    Image,
    Film,
    Music,
    Palette,
    List,
    Hash,
    HelpCircle
} from 'lucide-react';
import { getPortColor } from './portColors';
import { getNodeIcon } from './nodeIcons';
import { NODE_PARAM_SCHEMAS } from './nodeParamSchemas';
import { useCommandBus } from '../../state/useCommandBus';
import { apiFetch } from '../../../../../services/api';
import useGraphStore from '../../state/useGraphStore';

const STATE_CONFIG = {
    idle:    { color: 'var(--sys-text-muted)', label: '',          dot: false },
    queued:  { color: '#f59e0b',               label: 'Queued',    dot: true  },
    running: { color: '#FF4D00',               label: 'Running…',  dot: true  },
    done:    { color: '#10b981',               label: 'Done',      dot: false },
    error:   { color: '#ef4444',               label: 'Error',     dot: false },
    cached:  { color: '#06b6d4',               label: 'Cached',    dot: false },
    stale:   { color: '#a78bfa',               label: 'Stale',     dot: false },
};

const COST_CLASS_CONFIG = {
    free:   { label: 'FREE',   color: '#10b981', bg: 'rgba(16,185,129,0.12)'  },
    low:    { label: 'LOW',    color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
    billed: { label: 'BILLED', color: '#FF4D00', bg: 'rgba(255,77,0,0.12)'   },
};

function getPortIcon(type, size = 11) {
    switch (type) {
        case 'text':
            return <Type size={size} />;
        case 'image':
            return <Image size={size} />;
        case 'video':
            return <Film size={size} />;
        case 'audio':
            return <Music size={size} />;
        case 'ref':
            return <Palette size={size} />;
        case 'asset_list':
            return <List size={size} />;
        case 'number':
            return <Hash size={size} />;
        default:
            return <HelpCircle size={size} />;
    }
}

function InlineField({ paramKey, fieldSchema, initialValue, onChange }) {
    const [localVal, setLocalVal] = useState(initialValue);
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        setLocalVal(initialValue);
    }, [initialValue]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const triggerSave = useCallback((val) => {
        let finalVal = val;
        if (fieldSchema.type === 'number') {
            finalVal = Number(val);
            if (isNaN(finalVal)) return;
        } else if (fieldSchema.type === 'string_list') {
            finalVal = typeof val === 'string'
                ? val.split('\n').map(s => s.trim()).filter(Boolean)
                : val;
        }
        if (finalVal !== initialValue) {
            onChange(finalVal);
        }
    }, [fieldSchema.type, initialValue, onChange]);

    const handleLocalChange = (val) => {
        setLocalVal(val);

        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }

        debounceTimerRef.current = setTimeout(() => {
            triggerSave(val);
        }, 500);
    };

    const handleBlur = () => {
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
        }
        triggerSave(localVal);
    };

    const isMultiline = fieldSchema.multiline || fieldSchema.type === 'string_list';

    // Stop propagation of events to prevent dragging the node or zooming the canvas
    const eventHandlers = {
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation(),
        onPointerDown: (e) => e.stopPropagation(),
        onKeyDown: (e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !isMultiline && !e.shiftKey) {
                e.currentTarget.blur();
            }
        }
    };

    if (fieldSchema.type === 'enum') {
        return (
            <div className="node-inline-field">
                <span className="node-inline-label">{fieldSchema.label || paramKey}</span>
                <select
                    className="node-inline-input"
                    value={localVal || ''}
                    onChange={e => {
                        setLocalVal(e.target.value);
                        triggerSave(e.target.value);
                    }}
                    {...eventHandlers}
                >
                    {(fieldSchema.options || []).map(o => (
                        <option key={o} value={o}>{o}</option>
                    ))}
                </select>
            </div>
        );
    }

    if (isMultiline) {
        const displayVal = Array.isArray(localVal) ? localVal.join('\n') : (localVal || '');
        return (
            <div className="node-inline-field node-inline-field--vertical">
                <span className="node-inline-label">{fieldSchema.label || paramKey}</span>
                <textarea
                    className="node-inline-input node-inline-input--full"
                    placeholder={`Enter ${fieldSchema.label || paramKey}...`}
                    value={displayVal}
                    onChange={e => handleLocalChange(e.target.value)}
                    onBlur={handleBlur}
                    {...eventHandlers}
                    rows={2}
                />
            </div>
        );
    }

    return (
        <div className="node-inline-field">
            <span className="node-inline-label">{fieldSchema.label || paramKey}</span>
            <input
                className="node-inline-input"
                type={fieldSchema.type === 'number' ? 'number' : 'text'}
                value={localVal ?? ''}
                onChange={e => handleLocalChange(e.target.value)}
                onBlur={handleBlur}
                {...eventHandlers}
            />
        </div>
    );
}

export default function BaseNode({
    data,
    children,
    icon,
    costClass   = 'free',
    accentColor = '#FF4D00',
    inputPorts  = [],
    outputPorts = [],
    selected,
}) {
    const state     = data?.state  || 'idle';
    const author    = data?.author;
    const stateConf = STATE_CONFIG[state]          || STATE_CONFIG.idle;
    const costConf  = COST_CLASS_CONFIG[costClass] || COST_CLASS_CONFIG.free;

    const { emit } = useCommandBus();
    const store = useGraphStore();

    // Do not render duplicate inline fields for custom TextInputNode, Image/Video generators
    const schema = (data?.type !== 'text_input' && data?.type !== 'image_generate' && data?.type !== 'video_generate') ? NODE_PARAM_SCHEMAS[data?.type] : null;

    // Generator nodes have their own inline run + preview — suppress duplicates
    const isGeneratorNode = data?.type === 'image_generate' || data?.type === 'video_generate';

    const handleParamChange = useCallback((key, val) => {
        emit({
            type: 'update_params',
            payload: {
                nodeId: data.id,
                params: { ...data.params, [key]: val }
            },
            author: 'user'
        });
    }, [data.id, data.params, emit]);

    const handleRunFromHere = useCallback((e) => {
        e.stopPropagation();
        const sessionId = store.sessionId;
        if (!sessionId) return;

        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run`, {
            method: 'POST',
            body: JSON.stringify({ fromNodeId: data.id, confirmed: false }),
        })
            .then(resData => {
                if (resData.gated)        store.setCreditGate(resData);
                else if (resData.success) store.setActiveRun(resData.runId, 'running');
            })
            .catch(err => store.setError(err.message));
    }, [data.id, store]);

    const classes = [
        'canvas-node',
        selected                        ? 'canvas-node--selected'                   : '',
        state === 'running'             ? 'canvas-node--running'                    : '',
        data?.type === 'image_generate' ? 'canvas-node--image-generate'             : '',
        data?.type === 'video_generate' ? 'canvas-node--video-generate'             : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={classes} style={{ '--node-accent': accentColor }}>

            {/* AI author badge */}
            {author === 'agent' && (
                <div className="canvas-node__agent-badge" title="Built by AI Copilot">✦</div>
            )}

            {/* Accent colour strip at top */}
            <div
                className="canvas-node__accent-strip"
                style={{ background: accentColor }}
            />

            {/* Header */}
            <div className="canvas-node__header">
                <span className="canvas-node__icon">{getNodeIcon(data?.type)}</span>
                <span className="canvas-node__title">
                    {data?.label || (data?.type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                <span
                    className="canvas-node__cost-pill"
                    style={{
                        color: costConf.color,
                        background: costConf.bg,
                        borderColor: costConf.color + '44',
                    }}
                >
                    {costConf.label}
                </span>
            </div>

            {/* State badge — only when not idle */}
            {stateConf.label && (
                <>
                    <div className="canvas-node__divider" />
                    <div
                        className="canvas-node__state"
                        style={{
                            background: stateConf.color + '18',
                            color: stateConf.color,
                        }}
                    >
                        {stateConf.dot && (
                            <span className="canvas-node__dot" style={{ background: stateConf.color }} />
                        )}
                        {stateConf.label}
                    </div>
                </>
            )}

            {/* Error */}
            {state === 'error' && data?.error && (
                <div className="canvas-node__error">⚠ {data.error}</div>
            )}

            {/* Batch item execution states */}
            {data?.params?._batchRuns && data.params._batchRuns.length > 0 && (
                <div className="canvas-node__body" style={{ paddingBottom: '4px' }}>
                    <div className="batch-status-list" style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', background: 'rgba(0,0,0,0.15)', padding: '6px 8px', borderRadius: '4px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--sys-text-muted)' }}>Batch Progress:</div>
                        {data.params._batchRuns.map((run, idx) => (
                            <div key={run.id || idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                    Item #{run.id}
                                </span>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: run.state === 'done' ? '#10b981' : run.state === 'error' ? '#ef4444' : '#f59e0b'
                                }}>
                                    {run.state === 'done' ? '✓' : run.state === 'error' ? '✗' : '● Running'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Node-specific body */}
            {children && <div className="canvas-node__body">{children}</div>}

            {/* Inline node parameters */}
            {schema && Object.keys(schema).length > 0 && (
                <>
                    <div className="canvas-node__divider" />
                    <div className="canvas-node__body">
                        <div className="node-inline-params nodrag nowheel">
                            {Object.entries(schema).map(([key, fieldSchema]) => (
                                <InlineField
                                    key={key}
                                    paramKey={key}
                                    fieldSchema={fieldSchema}
                                    initialValue={data?.params?.[key]}
                                    onChange={(val) => handleParamChange(key, val)}
                                />
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Action buttons (only when selected) */}
            {selected && (
                <>
                    <div className="canvas-node__divider" />
                    <div className="canvas-node__body" style={{ paddingTop: 0, paddingBottom: 8 }}>
                        <div className="node-inline-actions nodrag nowheel">
                            {/* Generator nodes have their own inline Run button — skip here */}
                            {!isGeneratorNode && (
                                <button
                                    className="node-action-btn node-action-btn--run"
                                    onClick={handleRunFromHere}
                                    disabled={state === 'running' || state === 'queued'}
                                    title="Run graph from this node"
                                >
                                    ▶ Run
                                </button>
                            )}
                            <button
                                className="node-action-btn node-action-btn--delete"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    emit({ type: 'delete_node', payload: { nodeId: data.id }, author: 'user' });
                                }}
                                title="Delete this node"
                            >
                                🗑 Delete
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Output preview when done — suppressed for generator nodes (they render their own) */}
            {!isGeneratorNode && state === 'done' && data?.outputRef && (() => {
                let urls = [];
                try {
                    if (typeof data.outputRef === 'string' && data.outputRef.startsWith('[')) {
                        const parsed = JSON.parse(data.outputRef);
                        if (Array.isArray(parsed)) {
                            urls = parsed.map(item => (item && typeof item === 'object') ? item.value : item).filter(Boolean);
                        }
                    } else {
                        urls = [data.outputRef];
                    }
                } catch (e) {
                    urls = [data.outputRef];
                }

                if (urls.length === 0) return null;

                return (
                    <div className="canvas-node__preview-gallery" style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '8px', background: 'rgba(0,0,0,0.2)' }}>
                        {urls.map((url, idx) => (
                            <div key={idx} className="canvas-node__preview-item" style={{ width: '100px', flexShrink: 0 }}>
                                {url.match(/\.(mp4|webm|mov)$/i)
                                    ? <video src={url} className="canvas-node__media" muted loop autoPlay playsInline style={{ width: '100%', borderRadius: '4px', objectFit: 'cover' }} />
                                    : <img   src={url} className="canvas-node__media" alt="output" style={{ width: '100%', borderRadius: '4px', objectFit: 'cover' }} />
                                }
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* Input port handles */}
            {inputPorts.map((port, i) => (
                <Handle
                    key={port.id}
                    type="target"
                    position={Position.Left}
                    id={port.id}
                    className="canvas-node__handle canvas-node__handle--target"
                    style={{
                        top: `${((i + 1) / (inputPorts.length + 1)) * 100}%`,
                        '--port-color': getPortColor(port.type),
                        borderColor: getPortColor(port.type),
                    }}
                    title={`${port.label} (${port.type})${port.required ? ' — required' : ''}`}
                >
                    <div className="canvas-node__handle-icon" style={{ color: getPortColor(port.type) }}>
                        {getPortIcon(port.type)}
                    </div>
                </Handle>
            ))}

            {/* Output port handles */}
            {outputPorts.map((port, i) => (
                <Handle
                    key={port.id}
                    type="source"
                    position={Position.Right}
                    id={port.id}
                    className="canvas-node__handle canvas-node__handle--source"
                    style={{
                        top: `${((i + 1) / (outputPorts.length + 1)) * 100}%`,
                        '--port-color': getPortColor(port.type),
                        borderColor: getPortColor(port.type),
                    }}
                    title={`${port.label} (${port.type})`}
                >
                    <div className="canvas-node__handle-icon" style={{ color: getPortColor(port.type) }}>
                        {getPortIcon(port.type)}
                    </div>
                </Handle>
            ))}
        </div>
    );
}

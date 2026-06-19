import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Play, Film, Volume2, VolumeX } from 'lucide-react';
import BaseNode from './BaseNode';
import PromptFieldWithMentions from './PromptFieldWithMentions';
import PromptEnhancerPanel from './PromptEnhancerPanel';
import { useCommandBus } from '../../state/useCommandBus';
import useGraphStore from '../../state/useGraphStore';
import { apiFetch } from '../../../../../services/api';

export default function VideoGenerateNode({ data, selected }) {
    const { emit } = useCommandBus();
    const store = useGraphStore();

    const [promptText, setPromptText] = useState(data?.params?.prompt || '');
    const [showEnhancer, setShowEnhancer] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [running, setRunning] = useState(false);
    const debounceTimerRef = useRef(null);

    // Sync prompt text parameter
    useEffect(() => {
        setPromptText(data?.params?.prompt || '');
    }, [data?.params?.prompt]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    // Check if prompt port is connected upstream
    const isPromptConnected = store.graph?.edges?.some(
        e => e.to.node === data.id && e.to.port === 'prompt'
    );

    // Get upstream prompt text if connected
    const getUpstreamPrompt = useCallback(() => {
        const edge = store.graph?.edges?.find(e => e.to.node === data.id && e.to.port === 'prompt');
        if (!edge) return '';
        const upstreamNode = store.graph?.nodes?.find(n => n.id === edge.from.node);
        return upstreamNode?.params?.text || upstreamNode?.params?.prompt || '';
    }, [data.id, store.graph]);

    const displayPrompt = isPromptConnected ? getUpstreamPrompt() : promptText;

    const triggerSave = useCallback((val) => {
        if (val !== (data?.params?.prompt || '')) {
            emit({
                type: 'update_params',
                payload: { nodeId: data.id, params: { ...data.params, prompt: val } },
                author: 'user',
            });
        }
    }, [data.id, data?.params, emit]);

    const handlePromptChange = (val) => {
        setPromptText(val);
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
        triggerSave(promptText);
    };

    const updateParam = (key, val) => {
        emit({
            type: 'update_params',
            payload: { nodeId: data.id, params: { ...data.params, [key]: val } },
            author: 'user',
        });
    };

    const handleRunNode = (e) => {
        e.stopPropagation();
        const sessionId = store.sessionId;
        if (!sessionId) return;
        setRunning(true);
        apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run`, {
            method: 'POST',
            body: JSON.stringify({ fromNodeId: data.id, confirmed: false }),
        })
            .then(resData => {
                if (resData.gated) store.setCreditGate(resData);
                else if (resData.success) store.setActiveRun(resData.runId, 'running');
            })
            .catch(err => store.setError(err.message))
            .finally(() => setRunning(false));
    };

    const handleCountChange = (delta) => {
        const currentCount = data?.params?.count || 1;
        const newCount = Math.max(1, Math.min(4, currentCount + delta));
        updateParam('count', newCount);
    };

    const soundEnabled = data?.params?.sound !== false; // defaults true
    const toggleSound = () => updateParam('sound', !soundEnabled);

    const isRunning = running || data.state === 'running' || data.state === 'queued';

    return (
        <BaseNode
            data={data}
            selected={selected}
            icon="🎬"
            costClass="billed"
            accentColor="#FF4D00"
            inputPorts={[
                { id: 'prompt',    type: 'text',  label: 'Prompt',           required: true  },
                { id: 'image',     type: 'image', label: 'Start Frame',      required: false },
                { id: 'end_image', type: 'image', label: 'End Frame',        required: false },
                { id: 'style_ref', type: 'ref',   label: 'Style Ref',        required: false },
                { id: 'char_ref',  type: 'ref',   label: 'Character Ref',    required: false },
                { id: 'audio',     type: 'audio', label: 'Audio (Veo only)', required: false },
            ]}
            outputPorts={[
                { id: 'video',     type: 'video', label: 'Video' },
                { id: 'end_frame', type: 'image', label: 'End Frame' }
            ]}
        >
            <div className="generator-node-body nowheel">

                {/* Output Preview Area */}
                <div className="node-media-preview-container">
                    {data?.outputRef ? (
                        <video src={data.outputRef} className="node-media-preview" muted loop autoPlay playsInline />
                    ) : (
                        <div className="node-media-placeholder">
                            <Film size={32} className="placeholder-icon" />
                            <span>Video Preview</span>
                        </div>
                    )}
                </div>

                {/* Inline Prompt Field */}
                <div className="node-prompt-field-container">
                    {isPromptConnected && (
                        <span className="badge badge--connected">Connected prompt. Use @ to add references.</span>
                    )}
                    <PromptFieldWithMentions
                        nodeId={data.id}
                        value={displayPrompt}
                        onChange={handlePromptChange}
                        onBlur={handleBlur}
                        disabled={isPromptConnected}
                        placeholder="Describe the video you want to generate..."
                        onEnhanceTrigger={() => setShowEnhancer(true)}
                    />
                </div>

                {/* ── Control Row 1: Count / Model / Ratio / Duration ── */}
                <div className="node-control-rows-container">
                    <div className="node-control-row">
                        {/* Count stepper */}
                        <div className="ctrl-pill ctrl-stepper nodrag">
                            <button
                                className="stepper-btn"
                                onClick={() => handleCountChange(-1)}
                                disabled={(data?.params?.count || 1) <= 1}
                                onMouseDown={e => e.stopPropagation()}
                            >−</button>
                            <span className="stepper-val">x{data?.params?.count || 1}</span>
                            <button
                                className="stepper-btn"
                                onClick={() => handleCountChange(1)}
                                disabled={(data?.params?.count || 1) >= 4}
                                onMouseDown={e => e.stopPropagation()}
                            >+</button>
                        </div>

                        {/* Model select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.model || 'seedance-2.0'}
                            onChange={e => updateParam('model', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Model"
                        >
                            <option value="auto">Auto</option>
                            <option value="seedance-2.0">Seedance 2</option>
                            <option value="kling-3.0">Kling 3.0</option>
                            <option value="veo-3.1">Veo 3.1</option>
                            <option value="veo-3.1-fast">Veo Fast</option>
                            <option value="grok-imagine">Grok</option>
                            <option value="gemini-flash">Gemini</option>
                        </select>

                        {/* Aspect ratio select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.aspectRatio || '16:9'}
                            onChange={e => updateParam('aspectRatio', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Aspect Ratio"
                        >
                            <option value="9:16">9:16</option>
                            <option value="16:9">16:9</option>
                            <option value="1:1">1:1</option>
                            <option value="4:5">4:5</option>
                            <option value="21:9">21:9</option>
                        </select>

                        {/* Duration select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.duration || 6}
                            onChange={e => updateParam('duration', Number(e.target.value))}
                            onMouseDown={e => e.stopPropagation()}
                            title="Duration"
                        >
                            <option value={4}>4s</option>
                            <option value={6}>6s</option>
                            <option value={8}>8s</option>
                            <option value={10}>10s</option>
                            <option value={15}>15s</option>
                        </select>
                    </div>

                    {/* ── Control Row 2: Resolution / Sound / Settings / Run ── */}
                    <div className="node-control-row node-control-row--actions">
                        {/* Resolution select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.resolution || '1080p'}
                            onChange={e => updateParam('resolution', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Resolution"
                        >
                            <option value="auto">Auto Res</option>
                            <option value="720p">720p</option>
                            <option value="1080p">1080p</option>
                            <option value="4K">4K</option>
                        </select>

                        {/* Sound toggle — custom pill switch */}
                        <button
                            className={`ctrl-pill ctrl-sound-toggle nodrag ${soundEnabled ? 'active' : ''}`}
                            onClick={toggleSound}
                            onMouseDown={e => e.stopPropagation()}
                            title={soundEnabled ? 'Sound On — click to mute' : 'Sound Off — click to enable'}
                        >
                            {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
                            <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
                        </button>

                        {/* Settings gear */}
                        <button
                            className={`ctrl-pill ctrl-icon-btn nodrag ${showSettings ? 'active' : ''}`}
                            onClick={() => setShowSettings(!showSettings)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Extra Settings"
                        >
                            <Settings size={12} />
                            <span>Settings</span>
                        </button>

                        {/* Run button */}
                        <button
                            className="ctrl-pill ctrl-run-btn nodrag"
                            onClick={handleRunNode}
                            disabled={isRunning}
                            onMouseDown={e => e.stopPropagation()}
                            title="Run this node"
                        >
                            <Play size={11} fill="currentColor" />
                            <span>{isRunning ? 'Running…' : 'Run'}</span>
                        </button>
                    </div>
                </div>

                {/* Collapsible Extra Settings */}
                {showSettings && (
                    <div className="node-extra-settings nodrag">
                        <div className="extra-row">
                            <label>Motion</label>
                            <select
                                className="ctrl-pill ctrl-select"
                                value={data?.params?.motionMode || 'balanced'}
                                onChange={e => updateParam('motionMode', e.target.value)}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="subtle">Subtle</option>
                                <option value="balanced">Balanced</option>
                                <option value="dynamic">Dynamic</option>
                            </select>
                        </div>
                        <div className="extra-row">
                            <label>Seed</label>
                            <input
                                type="number"
                                value={data?.params?.seed ?? -1}
                                onChange={e => updateParam('seed', Number(e.target.value))}
                                onMouseDown={e => e.stopPropagation()}
                            />
                        </div>
                        <div className="extra-row">
                            <label>Guidance</label>
                            <input
                                type="number"
                                value={data?.params?.guidanceScale ?? 7.5}
                                onChange={e => updateParam('guidanceScale', Number(e.target.value))}
                                step="0.5"
                                onMouseDown={e => e.stopPropagation()}
                            />
                        </div>
                    </div>
                )}

                {/* Enhancer Dialog Modal */}
                {showEnhancer && (
                    <PromptEnhancerPanel
                        nodeId={data.id}
                        rawPrompt={data.params?.rawPrompt || promptText}
                        sessionId={store.sessionId}
                        onAccept={(enhanced, raw, preset) => {
                            emit({
                                type: 'update_params',
                                payload: {
                                    nodeId: data.id,
                                    params: {
                                        ...data.params,
                                        prompt: enhanced,
                                        rawPrompt: raw,
                                        enhancedPrompt: enhanced,
                                        selectedPresetId: preset
                                    }
                                },
                                author: 'user'
                            });
                            setPromptText(enhanced);
                            setShowEnhancer(false);
                        }}
                        onClose={() => setShowEnhancer(false)}
                    />
                )}
            </div>
        </BaseNode>
    );
}

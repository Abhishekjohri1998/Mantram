import { useState, useEffect, useCallback } from 'react';
import { Settings, Play, Image as ImageIcon, ChevronRight } from 'lucide-react';
import BaseNode from './BaseNode';
import PromptFieldWithMentions from './PromptFieldWithMentions';
import PromptEnhancerPanel from './PromptEnhancerPanel';
import { useCommandBus } from '../../state/useCommandBus';
import useGraphStore from '../../state/useGraphStore';
import { apiFetch } from '../../../../../services/api';

export default function ImageGenerateNode({ data, selected }) {
    const { emit } = useCommandBus();
    const store = useGraphStore();

    const [promptText, setPromptText] = useState(data?.params?.prompt || '');
    const [showEnhancer, setShowEnhancer] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [running, setRunning] = useState(false);

    // Sync prompt text parameter
    useEffect(() => {
        setPromptText(data?.params?.prompt || '');
    }, [data?.params?.prompt]);

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

    const handlePromptChange = (val) => {
        setPromptText(val);
        emit({
            type: 'update_params',
            payload: { nodeId: data.id, params: { ...data.params, prompt: val } },
            author: 'user',
        });
    };

    // Control bar parameters updates
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

    // Increments/Decrements count parameter (1-4)
    const handleCountChange = (delta) => {
        const currentCount = data?.params?.count || 1;
        const newCount = Math.max(1, Math.min(4, currentCount + delta));
        updateParam('count', newCount);
    };

    const isRunning = running || data.state === 'running' || data.state === 'queued';

    return (
        <BaseNode
            data={data}
            selected={selected}
            icon="🖼️"
            costClass="billed"
            accentColor="#FF4D00"
            inputPorts={[
                { id: 'prompt',    type: 'text',  label: 'Prompt',    required: true  },
                { id: 'style_ref', type: 'ref',   label: 'Style Ref', required: false },
                { id: 'char_ref',  type: 'ref',   label: 'Character', required: false },
            ]}
            outputPorts={[{ id: 'image', type: 'image', label: 'Image' }]}
        >
            <div className="generator-node-body nodrag nowheel">

                {/* Output Preview Area */}
                <div className="node-media-preview-container">
                    {data?.outputRef ? (
                        <img src={data.outputRef} className="node-media-preview" alt="generated" />
                    ) : (
                        <div className="node-media-placeholder">
                            <ImageIcon size={32} className="placeholder-icon" />
                            <span>Image Preview</span>
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
                        disabled={isPromptConnected}
                        placeholder="Describe the image you want to generate..."
                        onEnhanceTrigger={() => setShowEnhancer(true)}
                    />
                </div>

                {/* ── Control Bar Row 1: Count / Model / Ratio / Quality ── */}
                <div className="node-control-rows-container">
                    <div className="node-control-row">
                        {/* Count stepper */}
                        <div className="ctrl-pill ctrl-stepper nodrag">
                            <button
                                className="stepper-btn"
                                onClick={() => handleCountChange(-1)}
                                disabled={data?.params?.count <= 1}
                                onMouseDown={e => e.stopPropagation()}
                            >−</button>
                            <span className="stepper-val">x{data?.params?.count || 1}</span>
                            <button
                                className="stepper-btn"
                                onClick={() => handleCountChange(1)}
                                disabled={data?.params?.count >= 4}
                                onMouseDown={e => e.stopPropagation()}
                            >+</button>
                        </div>

                        {/* Model select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.model || 'gemini-flash'}
                            onChange={e => updateParam('model', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Model"
                        >
                            <option value="auto">Auto</option>
                            <option value="gemini-flash">Gemini Flash</option>
                            <option value="gpt-image-2">GPT Image 2</option>
                            <option value="flux-pro">Flux Pro</option>
                        </select>

                        {/* Aspect ratio select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.aspectRatio || '9:16'}
                            onChange={e => updateParam('aspectRatio', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Aspect Ratio"
                        >
                            <option value="9:16">9:16</option>
                            <option value="16:9">16:9</option>
                            <option value="1:1">1:1</option>
                            <option value="4:5">4:5</option>
                        </select>

                        {/* Quality select */}
                        <select
                            className="ctrl-pill ctrl-select nodrag"
                            value={data?.params?.quality || 'standard'}
                            onChange={e => updateParam('quality', e.target.value)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Quality"
                        >
                            <option value="draft">Draft</option>
                            <option value="standard">Std</option>
                            <option value="hd">HD</option>
                        </select>
                    </div>

                    {/* ── Control Bar Row 2: Settings + Run ── */}
                    <div className="node-control-row node-control-row--actions">
                        <button
                            className={`ctrl-pill ctrl-icon-btn nodrag ${showSettings ? 'active' : ''}`}
                            onClick={() => setShowSettings(!showSettings)}
                            onMouseDown={e => e.stopPropagation()}
                            title="Extra Settings"
                        >
                            <Settings size={12} />
                            <span>Settings</span>
                        </button>

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
                        <div className="extra-row">
                            <label>Unlimited</label>
                            <input
                                type="checkbox"
                                checked={data?.params?.unlimitedMode === true}
                                onChange={e => updateParam('unlimitedMode', e.target.checked)}
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

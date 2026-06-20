import { useState, useCallback, useEffect, useRef } from 'react';
import BaseNode from './BaseNode';
import { useCommandBus } from '../../state/useCommandBus';
import useGraphStore from '../../state/useGraphStore';
import PromptFieldWithMentions from './PromptFieldWithMentions';
import PromptEnhancerPanel from './PromptEnhancerPanel';

export default function TextInputNode({ data, selected }) {
    const [text, setText] = useState(data?.params?.text || '');
    const [showEnhancer, setShowEnhancer] = useState(false);
    const { emit } = useCommandBus();
    const store = useGraphStore();
    const debounceTimerRef = useRef(null);

    // Sync state with incoming graph data updates (e.g. from copilot)
    useEffect(() => {
        const activeEl = document.activeElement;
        const isFocusedInThisNode = activeEl && 
            (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT') &&
            activeEl.closest('.react-flow__node')?.getAttribute('data-id') === data.id;

        if (!isFocusedInThisNode) {
            setText(data?.params?.text || '');
        }
    }, [data?.params?.text, data.id]);

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const triggerSave = useCallback((val) => {
        if (val !== (data?.params?.text || '')) {
            emit({
                type: 'update_params',
                payload: { nodeId: data.id, params: { text: val } },
                author: 'user',
            });
        }
    }, [data.id, data?.params?.text, emit]);

    const handleTextChange = (val) => {
        setText(val);
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
        triggerSave(text);
    };

    return (
        <BaseNode data={data} selected={selected} icon="📝" costClass="free" accentColor="#8b5cf6"
            inputPorts={[]} outputPorts={[{ id: 'text', type: 'text', label: 'Text' }]}
        >
            <div className="node-inline-input-wrapper nodrag nowheel">
                <PromptFieldWithMentions
                    nodeId={data.id}
                    value={text}
                    onChange={handleTextChange}
                    onBlur={handleBlur}
                    placeholder="Type prompt or text here..."
                    onEnhanceTrigger={() => setShowEnhancer(true)}
                />
                {showEnhancer && (
                    <PromptEnhancerPanel
                        nodeId={data.id}
                        rawPrompt={data.params?.rawPrompt || text}
                        sessionId={store.sessionId}
                        onAccept={(enhanced, raw, preset) => {
                            emit({
                                type: 'update_params',
                                payload: {
                                    nodeId: data.id,
                                    params: {
                                        text: enhanced,
                                        prompt: enhanced,
                                        rawPrompt: raw,
                                        enhancedPrompt: enhanced,
                                        selectedPresetId: preset
                                    }
                                },
                                author: 'user'
                            });
                            setText(enhanced);
                            setShowEnhancer(false);
                        }}
                        onClose={() => setShowEnhancer(false)}
                    />
                )}
            </div>
        </BaseNode>
    );
}


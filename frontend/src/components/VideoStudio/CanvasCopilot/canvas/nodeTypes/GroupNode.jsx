import { useState, useEffect, useRef, useCallback } from 'react';
import { useCommandBus } from '../../state/useCommandBus';

export default function GroupNode({ data, selected }) {
    const labelVal = data?.params?.label || 'Group';
    const colorVal = data?.params?.color || '#3f3f46';

    const [label, setLabel] = useState(labelVal);
    const { emit } = useCommandBus();
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        setLabel(labelVal);
    }, [labelVal]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const triggerSave = useCallback((val, newColor = colorVal) => {
        emit({
            type: 'update_params',
            payload: {
                nodeId: data.id,
                params: { label: val, color: newColor }
            },
            author: 'user',
        });
    }, [data.id, colorVal, emit]);

    const handleLabelChange = (val) => {
        setLabel(val);
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
        triggerSave(label);
    };

    const eventHandlers = {
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation(),
        onPointerDown: (e) => e.stopPropagation(),
    };

    return (
        <div
            className={`group-container-node ${selected ? 'group-container-node--selected' : ''}`}
            style={{
                borderColor: selected ? 'var(--cc-orange)' : colorVal,
                '--group-color': colorVal,
            }}
        >
            <div className="group-container-node__header">
                <input
                    type="text"
                    className="group-container-node__input nodrag nowheel"
                    value={label}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={(e) => e.stopPropagation()}
                    {...eventHandlers}
                />
                
                {selected && (
                    <div className="group-container-node__actions nodrag nowheel" {...eventHandlers}>
                        {/* Color presets */}
                        <div className="group-container-node__colors">
                            {['#3f3f46', '#2563eb', '#16a34a', '#ca8a04', '#dc2626'].map(c => (
                                <button
                                    key={c}
                                    className={`group-container-node__color-dot ${colorVal === c ? 'active' : ''}`}
                                    style={{ background: c }}
                                    onClick={() => triggerSave(label, c)}
                                />
                            ))}
                        </div>
                        {/* Delete */}
                        <button
                            className="group-container-node__delete"
                            onClick={() => emit({ type: 'delete_node', payload: { nodeId: data.id } })}
                        >
                            🗑
                        </button>
                    </div>
                )}
            </div>
            {/* The body is empty, serving as a frame */}
            <div className="group-container-node__body" />
        </div>
    );
}

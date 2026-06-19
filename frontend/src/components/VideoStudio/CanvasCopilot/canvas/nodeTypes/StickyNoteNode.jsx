import { useState, useEffect, useRef, useCallback } from 'react';
import { useCommandBus } from '../../state/useCommandBus';

const COLOR_THEMES = {
    yellow: { bg: 'rgba(253, 224, 71, 0.12)', border: 'rgba(253, 224, 71, 0.3)', text: '#fef08a', header: 'rgba(253, 224, 71, 0.2)' },
    purple: { bg: 'rgba(192, 132, 252, 0.12)', border: 'rgba(192, 132, 252, 0.3)', text: '#e9d5ff', header: 'rgba(192, 132, 252, 0.2)' },
    blue:   { bg: 'rgba(96, 165, 250, 0.12)', border: 'rgba(96, 165, 250, 0.3)', text: '#bfdbfe', header: 'rgba(96, 165, 250, 0.2)' },
    green:  { bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.3)', text: '#bbf7d0', header: 'rgba(74, 222, 128, 0.2)' },
};

export default function StickyNoteNode({ data, selected }) {
    const textVal = data?.params?.text || '';
    const colorTheme = data?.params?.color || 'yellow';
    const fontSize = data?.params?.fontSize || 14;

    const [text, setText] = useState(textVal);
    const { emit } = useCommandBus();
    const debounceTimerRef = useRef(null);

    useEffect(() => {
        setText(textVal);
    }, [textVal]);

    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current);
            }
        };
    }, []);

    const triggerSave = useCallback((val, newColor = colorTheme, newSize = fontSize) => {
        emit({
            type: 'update_params',
            payload: {
                nodeId: data.id,
                params: { text: val, color: newColor, fontSize: newSize }
            },
            author: 'user',
        });
    }, [data.id, colorTheme, fontSize, emit]);

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

    const theme = COLOR_THEMES[colorTheme] || COLOR_THEMES.yellow;

    const eventHandlers = {
        onMouseDown: (e) => e.stopPropagation(),
        onClick: (e) => e.stopPropagation(),
        onPointerDown: (e) => e.stopPropagation(),
    };

    return (
        <div
            className={`sticky-note-node ${selected ? 'sticky-note-node--selected' : ''}`}
            style={{
                background: theme.bg,
                borderColor: selected ? 'var(--cc-orange)' : theme.border,
                color: theme.text,
            }}
        >
            {/* Note toolbar (only when selected) */}
            {selected && (
                <div className="sticky-note-node__toolbar nodrag nowheel" {...eventHandlers}>
                    {/* Color circles */}
                    <div className="sticky-note-node__colors">
                        {Object.keys(COLOR_THEMES).map(c => (
                            <button
                                key={c}
                                className={`sticky-note-node__color-dot sticky-note-node__color-dot--${c} ${colorTheme === c ? 'active' : ''}`}
                                onClick={() => triggerSave(text, c, fontSize)}
                            />
                        ))}
                    </div>
                    {/* Font size selectors */}
                    <select
                        className="sticky-note-node__size-select"
                        value={fontSize}
                        onChange={(e) => triggerSave(text, colorTheme, Number(e.target.value))}
                    >
                        <option value={11}>Small</option>
                        <option value={14}>Medium</option>
                        <option value={18}>Large</option>
                        <option value={24}>X-Large</option>
                    </select>

                    {/* Delete button */}
                    <button
                        className="sticky-note-node__delete-btn"
                        title="Delete note"
                        onClick={() => emit({ type: 'delete_node', payload: { nodeId: data.id } })}
                    >
                        🗑
                    </button>
                </div>
            )}

            <textarea
                className="sticky-note-node__textarea nodrag nowheel"
                style={{ fontSize: `${fontSize}px` }}
                placeholder="Write note..."
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.stopPropagation()}
                {...eventHandlers}
            />
        </div>
    );
}

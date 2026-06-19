import { useState, useRef, useEffect } from 'react';
import { Sparkles, HelpCircle } from 'lucide-react';
import useGraphStore from '../../state/useGraphStore';
import { getNodeIcon } from './nodeIcons';

export default function PromptFieldWithMentions({
    nodeId,
    value,
    onChange,
    onBlur,
    placeholder = 'Describe what you want to generate...',
    disabled = false,
    onEnhanceTrigger,
}) {
    const [text, setText] = useState(value || '');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    const textareaRef = useRef(null);
    const store = useGraphStore();

    useEffect(() => {
        setText(value || '');
    }, [value]);

    // Track cursor position to trigger suggestion popup
    const handleInputChange = (e) => {
        const val = e.target.value;
        setText(val);
        onChange(val);

        const selectionStart = e.target.selectionStart;
        const textBeforeCursor = val.slice(0, selectionStart);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1 && !/\s/.test(textBeforeCursor.slice(lastAtIndex + 1))) {
            const query = textBeforeCursor.slice(lastAtIndex + 1);
            setSearchQuery(query);
            setShowSuggestions(true);
            setSelectedIndex(0);

            // Calculate caret coordinates for suggestions menu placement
            const caret = getCaretCoordinates(e.target, selectionStart);
            const rect = e.target.getBoundingClientRect();
            setCoords({
                top: caret.top + e.target.scrollTop + 20,
                left: Math.min(caret.left, rect.width - 210),
            });
        } else {
            setShowSuggestions(false);
        }
    };

    // Filter available nodes on the canvas
    useEffect(() => {
        if (!showSuggestions) return;

        const allNodes = store.graph?.nodes || [];
        const otherNodes = allNodes.filter(n => n.id !== nodeId);

        const filtered = otherNodes
            .map(n => {
                const label = n.params?.label || n.params?.title || n.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return {
                    id: n.id,
                    type: n.type,
                    label: `${label} (#${n.id})`,
                };
            })
            .filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()));

        setSuggestions(filtered);
    }, [showSuggestions, searchQuery, store.graph?.nodes, nodeId]);

    const selectSuggestion = (node) => {
        const val = textareaRef.current.value;
        const selectionStart = textareaRef.current.selectionStart;
        const textBeforeCursor = val.slice(0, selectionStart);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');

        if (lastAtIndex !== -1) {
            const newText = val.slice(0, lastAtIndex) + `@${node.id} ` + val.slice(selectionStart);
            setText(newText);
            onChange(newText);
            setShowSuggestions(false);
            textareaRef.current.focus();
        }
    };

    const handleKeyDown = (e) => {
        // Prevent React Flow deletion hotkeys when typing in field
        e.stopPropagation();

        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                selectSuggestion(suggestions[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setShowSuggestions(false);
            }
        } else {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.currentTarget.blur();
            }
        }
    };

    return (
        <div className="prompt-field-with-mentions-wrapper" style={{ position: 'relative' }}>
            <textarea
                ref={textareaRef}
                className="node-inline-textarea nodrag"
                placeholder={disabled ? 'Connected prompt...' : placeholder}
                value={text}
                onChange={handleInputChange}
                onBlur={onBlur}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                style={{ paddingRight: '32px' }}
            />

            {/* ✨ Enhance Affordance Button inside textarea */}
            <button
                className="inline-enhance-btn nodrag nowheel"
                onClick={(e) => {
                    e.stopPropagation();
                    onEnhanceTrigger();
                }}
                title="Enhance Prompt using AI Presets"
                style={{
                    position: 'absolute',
                    right: '8px',
                    bottom: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--cc-orange)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px',
                    borderRadius: '4px',
                    transition: 'all 0.15s'
                }}
                onMouseEnter={e => {
                    e.target.style.background = 'rgba(255,77,0,0.1)';
                    e.target.style.transform = 'scale(1.1)';
                }}
                onMouseLeave={e => {
                    e.target.style.background = 'none';
                    e.target.style.transform = 'scale(1)';
                }}
            >
                <Sparkles size={14} />
            </button>

            {/* Autocomplete Suggestion Popup */}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    className="mention-picker-popup nodrag nowheel"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                    }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    {suggestions.map((s, idx) => (
                        <button
                            key={s.id}
                            className={`mention-picker-item ${selectedIndex === idx ? 'selected' : ''}`}
                            onClick={() => selectSuggestion(s)}
                        >
                            <span className="node-icon">{getNodeIcon(s.type)}</span>
                            <span className="node-label">{s.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// Minimal Caret Position Helper (approximates cursor position inside textarea)
function getCaretCoordinates(element, position) {
    const { offsetLeft, offsetTop, clientHeight } = element;
    // Basic approximation since canvas layout is relatively positioned
    return {
        top: offsetTop + (clientHeight / 3),
        left: offsetLeft + 20 + (position * 4) % 150,
    };
}

/**
 * NodeMenu.jsx — Floating menu to add nodes.
 * Appears on right-click of canvas or click of the + button.
 * Includes live search filtering.
 */

import { useEffect, useRef, useState } from 'react';
import { getNodeIcon } from './nodeTypes/nodeIcons';
import useGraphStore from '../state/useGraphStore';

const STATIC_CATEGORIES = [
    {
        label: 'Input',
        items: [
            { type: 'text_input',    icon: '📝', label: 'Text Input' },
            { type: 'asset_input',   icon: '📎', label: 'Asset Input' },
            { type: 'character_ref', icon: '👤', label: 'Character Ref' },
            { type: 'style_ref',     icon: '🎨', label: 'Style Ref' },
        ],
    },
    {
        label: 'Generate',
        items: [
            { type: 'video_generate',    icon: '🎬', label: 'Video Generate',    cost: '~40 cr' },
            { type: 'image_generate',    icon: '🖼️', label: 'Image Generate',   cost: '~5 cr'  },
            { type: 'frame_interpolate', icon: '🎞️', label: 'Frame Interpolate', cost: '~20 cr' },
            { type: 'voiceover',         icon: '🎙️', label: 'Voiceover',         cost: '~8 cr'  },
            { type: 'lipsync',           icon: '👄', label: 'Lip Sync',          cost: '~15 cr' },
            { type: 'music_sfx',         icon: '🎵', label: 'Music / SFX',       cost: '~10 cr' },
        ],
    },
    {
        label: 'Enhance',
        items: [
            { type: 'upscale', icon: '🔍', label: 'Upscale', cost: '~12 cr' },
            { type: 'reframe', icon: '🔄', label: 'Reframe', cost: '~18 cr' },
        ],
    },
    {
        label: 'Transform',
        items: [
            { type: 'prompt_expand', icon: '✨', label: 'Prompt Expand' },
            { type: 'trim',          icon: '✂️', label: 'Trim' },
            { type: 'resize',        icon: '📐', label: 'Resize / Crop' },
            { type: 'concat',        icon: '🔗', label: 'Concat / Stitch' },
            { type: 'batch',         icon: '🔁', label: 'Batch Iterator' },
        ],
    },
    {
        label: 'Output',
        items: [
            { type: 'output', icon: '🏁', label: 'Output' },
        ],
    },
];

export default function NodeMenu({ position, onSelect, onClose }) {
    const menuRef   = useRef(null);
    const inputRef  = useRef(null);
    const [query, setQuery] = useState('');
    const nodeCatalog = useGraphStore(state => state.nodeCatalog);

    // Group items by category dynamically if nodeCatalog is available
    let categoriesList = STATIC_CATEGORIES;
    if (nodeCatalog && Object.keys(nodeCatalog).length > 0) {
        const groups = {};
        Object.entries(nodeCatalog).forEach(([key, node]) => {
            const cat = node.category || 'utility';
            if (!groups[cat]) {
                groups[cat] = [];
            }
            groups[cat].push({
                type: key,
                label: node.label || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                cost: node.creditEstimate ? `~${node.creditEstimate} cr` : undefined,
            });
        });

        const CATEGORY_ORDER = ['input', 'generate', 'enhance', 'transform', 'text', 'utility', 'output'];
        const CATEGORY_LABELS = {
            input: 'Input',
            generate: 'Generate',
            enhance: 'Enhance',
            transform: 'Transform',
            text: 'Text',
            utility: 'Utility',
            output: 'Output',
        };

        const dynamicCategories = [];
        const processed = new Set();

        CATEGORY_ORDER.forEach(cat => {
            if (groups[cat] && groups[cat].length > 0) {
                dynamicCategories.push({
                    label: CATEGORY_LABELS[cat] || (cat.charAt(0).toUpperCase() + cat.slice(1)),
                    items: groups[cat],
                });
                processed.add(cat);
            }
        });

        Object.keys(groups).forEach(cat => {
            if (!processed.has(cat) && groups[cat].length > 0) {
                dynamicCategories.push({
                    label: cat.charAt(0).toUpperCase() + cat.slice(1),
                    items: groups[cat],
                });
            }
        });

        categoriesList = dynamicCategories;
    }

    const allItems = categoriesList.flatMap(c => c.items.map(i => ({ ...i, category: c.label })));

    // Close on outside click
    useEffect(() => {
        function handler(e) {
            if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Auto-focus search on open
    useEffect(() => { inputRef.current?.focus(); }, []);

    // Close on Escape
    useEffect(() => {
        function handler(e) { if (e.key === 'Escape') onClose(); }
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const filtered = query.trim()
        ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) || i.type.includes(query.toLowerCase()))
        : null;

    return (
        <div
            ref={menuRef}
            className="node-menu"
            style={{ left: position.x, top: position.y }}
        >
            <div className="node-menu__header">Add Node</div>

            {/* Search input */}
            <div style={{ padding: '8px 10px 4px' }}>
                <input
                    ref={inputRef}
                    className="inspector-input"
                    style={{ fontSize: '12px', padding: '6px 10px' }}
                    placeholder="Search nodes…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
            </div>

            <div className="node-menu__scroll">
                {filtered ? (
                    /* Flat search results */
                    filtered.length === 0 ? (
                        <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--sys-text-muted)', fontStyle: 'italic' }}>
                            No nodes found
                        </div>
                    ) : (
                        <div className="node-menu__category">
                            {filtered.map(item => (
                                <NodeMenuItem key={item.type} item={item} onSelect={onSelect} />
                            ))}
                        </div>
                    )
                ) : (
                    /* Categorised full list */
                    categoriesList.map(cat => (
                        <div key={cat.label} className="node-menu__category">
                            <div className="node-menu__cat-label">{cat.label}</div>
                            {cat.items.map(item => (
                                <NodeMenuItem key={item.type} item={item} onSelect={onSelect} />
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function NodeMenuItem({ item, onSelect }) {
    return (
        <button
            className="node-menu__item"
            onClick={() => onSelect(item.type)}
        >
            <span className="node-menu__item-icon">{getNodeIcon(item.type, 13)}</span>
            <span className="node-menu__item-label">{item.label}</span>
            {item.cost && <span className="node-menu__item-cost">{item.cost}</span>}
        </button>
    );
}

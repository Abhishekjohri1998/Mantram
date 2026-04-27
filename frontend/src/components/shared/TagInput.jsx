import React, { useState } from 'react';

export default function TagInput({ tags, setTags }) {
    const [input, setInput] = useState('');

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const val = input.trim().replace(/^,|,$/g, '');
            if (val && !tags.includes(val)) {
                setTags([...tags, val]);
            }
            setInput('');
        } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            setTags(tags.slice(0, -1));
        }
    };

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, alignItems: 'center' }}>
            {tags.map((tag, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: 16, fontSize: 12 }}>
                    <span>{tag}</span>
                    <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                </div>
            ))}
            <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={tags.length === 0 ? "Type and press Enter to add tags..." : ""}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, flex: 1, minWidth: 120 }}
            />
        </div>
    );
}

import React, { useState } from 'react';
import api from '../../utils/api';
import { useUI } from '../../context/UIContext';
import TagInput from '../shared/TagInput';

// --- Prompt Display Block ---
function PromptBlock({ text }) {
    const { addToast } = useUI();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        addToast('Copied to clipboard', 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    if (!text) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No prompt available.</div>;

    return (
        <div style={{ position: 'relative' }}>
            <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '200px',
                overflowY: 'auto',
                fontSize: '11px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '6px',
                padding: '10px',
                margin: 0,
                color: 'rgba(255,255,255,0.8)',
                fontFamily: 'monospace',
                lineHeight: 1.5
            }}>
                {text}
            </pre>
            <button
                type="button"
                onClick={handleCopy}
                style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10
                }}
            >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{copied ? 'check' : 'content_copy'}</span>
                {copied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}

export default function SaveAsTemplateButton({ jobId, jobType, studioOrigin, prompt }) {
    const { addToast } = useUI();
    const [isOpen, setIsOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);

    // Derived default name
    const getDefaultName = (p) => {
        if (!p) return 'New Template';
        const str = p.trim();
        if (str.length <= 60) return str;
        const truncated = str.substring(0, 60);
        // Find last space to avoid cutting mid-word
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 0) {
            return truncated.substring(0, lastSpace).replace(/\.{3,}$/, '').trim();
        }
        return truncated.replace(/\.{3,}$/, '').trim();
    };

    const openModal = async () => {
        setIsOpen(true);
        try {
            const res = await api('/superadmin/templates/categories');
            if (res.categories) {
                setCategories(res.categories);
            }
        } catch (err) {
            addToast(`Failed to load categories: ${err.message}`, 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        const fd = new FormData(e.target);
        const payload = {
            sourceJobId: jobId,
            sourceType: jobType,
            name: fd.get('name'),
            categoryId: fd.get('categoryId'),
            description: fd.get('description'),
            tags,
            studioOrigin
        };

        try {
            await api('/superadmin/templates/promote-from-job', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            addToast('Saved as template draft — activate it in Super Admin › Template Manager', 'success');
            setIsOpen(false);
        } catch (err) {
            addToast(err.message || 'Failed to save template', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button 
                onClick={openModal} 
                className="px-3 py-1.5 rounded-lg border border-[var(--sys-border)] bg-[rgba(255,255,255,0.05)] text-xs font-medium hover:bg-[rgba(255,255,255,0.1)] transition-all cursor-pointer flex items-center gap-1"
                style={{ color: '#E84118', borderColor: 'rgba(232, 65, 24, 0.3)' }}
                title="Super Admin Only: Save to Template Library"
            >
                <span className="material-symbols-outlined text-[14px]">auto_awesome</span> 
                Save as Template
            </button>

            {isOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }} onClick={() => setIsOpen(false)}>
                    <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 600, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Promote to Template</h2>
                            <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            <div style={{ display: 'flex', gap: 16 }}>
                                <label style={labelStyle}>
                                    Template Name
                                    <input name="name" defaultValue={getDefaultName(prompt)} required style={inputStyle} />
                                </label>
                                <label style={{ ...labelStyle, flex: 0.6 }}>
                                    Category
                                    <select name="categoryId" required style={inputStyle}>
                                        <option value="">Select Category</option>
                                        {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <label style={labelStyle}>
                                Description
                                <textarea name="description" required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                            </label>

                            <label style={labelStyle}>
                                Tags
                                <TagInput tags={tags} setTags={setTags} />
                            </label>

                            <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }} />

                            <div>
                                <span style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Prompt Preview (Read-Only)</span>
                                <PromptBlock text={prompt} />
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                                    This prompt will be locked to the template once created.
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <button type="submit" disabled={loading} style={{ background: '#E84118', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                                    {loading ? 'Saving...' : 'Save Template'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', width: '100%', fontSize: 13, outline: 'none' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 };

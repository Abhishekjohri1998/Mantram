import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useUI } from '../context/UIContext';
import TagInput from '../components/shared/TagInput';

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

    if (!text) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No prompt saved.</div>;

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

const TemplateManager = () => {
    const { addToast } = useUI();
    
    // Data
    const [templates, setTemplates] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtering state
    const [studioFilter, setStudioFilter] = useState('All');
    const [catFilter, setCatFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'active', 'inactive'

    // Modal state
    const [modal, setModal] = useState({ open: false, data: null });
    const [tags, setTags] = useState([]);
    
    // Inline confirmation tracking
    const [deletingId, setDeletingId] = useState(null);

    // Submission states
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tempRes, catRes] = await Promise.all([
                api('/superadmin/templates'), // fetched without pagination limit
                api('/superadmin/templates/categories')
            ]);
            setTemplates(tempRes.templates || []);
            setCategories(catRes.categories || []);
        } catch (err) {
            addToast(`Error loading data: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Formatted date helper
    const formatDate = (dateString) => {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const toggleField = async (template, field) => {
        try {
            const res = await api(`/superadmin/templates/${template._id}`, {
                method: 'PUT',
                body: JSON.stringify({ [field]: !template[field] })
            });
            setTemplates(prev => prev.map(t => t._id === template._id ? res.template : t));
            addToast(`Template ${field} updated`);
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const handleDeleteClick = (template) => {
        setDeletingId(template._id);
    };

    const cancelDelete = () => {
        setDeletingId(null);
    };

    const confirmDelete = async (template) => {
        try {
            const usageCount = template.usageCount || 0;
            if (usageCount > 0) {
                // Soft delete by deactivating
                const res = await api(`/superadmin/templates/${template._id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ isActive: false })
                });
                setTemplates(prev => prev.map(t => t._id === template._id ? res.template : t));
                addToast('Template deactivated due to existing usage.');
            } else {
                // Hard delete
                await api(`/superadmin/templates/${template._id}?permanent=true`, { method: 'DELETE' });
                setTemplates(prev => prev.filter(t => t._id !== template._id));
                addToast('Template permanently deleted.');
            }
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setDeletingId(null);
        }
    };

    const openEditModal = (template) => {
        setTags(template.tags || []);
        setModal({ open: true, data: template });
    };

    const saveTemplate = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        
        setIsSubmitting(true);
        try {
            if (modal.isNew) {
                // Must have a file
                const file = fd.get('file');
                if (!file || file.size === 0) {
                    setIsSubmitting(false);
                    return addToast('Please select a preview image or video', 'error');
                }
                
                setSubmitStatus('Uploading...');
                const uploadFd = new FormData();
                uploadFd.append('file', file);
                uploadFd.append('name', fd.get('name'));
                uploadFd.append('categoryId', fd.get('categoryId'));
                uploadFd.append('description', fd.get('description'));
                uploadFd.append('tags', JSON.stringify(tags));
                uploadFd.append('savedPrompt', fd.get('savedPrompt'));
                uploadFd.append('studioOrigin', fd.get('studioOrigin'));
                uploadFd.append('isFeatured', fd.get('isFeatured') === 'on');
                uploadFd.append('isActive', fd.get('isActive') === 'on');

                const res = await api('/superadmin/templates/upload', {
                    method: 'POST',
                    body: uploadFd,
                    headers: {} // let fetch set multipart
                });
                
                setTemplates(prev => [res.template, ...prev]);
                addToast('Template created and uploaded successfully', 'success');
            } else {
                setSubmitStatus('Saving...');
                const data = {
                    name: fd.get('name'),
                    categoryId: fd.get('categoryId'),
                    description: fd.get('description'),
                    tags: tags,
                    isFeatured: fd.get('isFeatured') === 'on',
                    isActive: fd.get('isActive') === 'on'
                };

                const res = await api(`/superadmin/templates/${modal.data._id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                setTemplates(prev => prev.map(t => t._id === modal.data._id ? res.template : t));
                addToast('Template updated successfully', 'success');
            }
            setModal({ open: false, data: null });
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setIsSubmitting(false);
            setSubmitStatus('');
        }
    };

    // Client-side filtering
    const filteredTemplates = templates.filter(t => {
        if (studioFilter !== 'All' && t.studioOrigin !== studioFilter.toLowerCase()) return false;
        if (catFilter && t.categoryId !== catFilter) return false;
        if (activeFilter === 'active' && !t.isActive) return false;
        if (activeFilter === 'inactive' && t.isActive) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q);
        }
        return true;
    });

    const getStudioBadgeStyle = (studio) => {
        switch (studio?.toLowerCase()) {
            case 'creative': return { bg: '#E84118', color: '#fff' };
            case 'video': return { bg: '#7C3AED', color: '#fff' };
            case 'content': return { bg: '#00D4AA', color: '#000' }; // dark text on teal
            default: return { bg: '#475569', color: '#fff' };
        }
    };

    if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading Template Manager...</div>;

    return (
        <div style={{ padding: '32px 40px', color: '#fff', maxWidth: 1400, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Template Manager</h1>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Manage and govern platform templates</div>
                </div>
                <button onClick={() => { setTags([]); setModal({ open: true, data: {}, isNew: true }); }} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
                    + Upload Template
                </button>
            </div>

            {/* Filter Bar */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', background: '#12121A', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                {/* Studio Pills */}
                <div style={{ display: 'flex', gap: 8, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 8 }}>
                    {['All', 'Creative', 'Video', 'Content'].map(s => (
                        <button 
                            key={s} 
                            onClick={() => setStudioFilter(s)}
                            style={{ 
                                background: studioFilter === s ? 'rgba(255,255,255,0.15)' : 'transparent', 
                                color: studioFilter === s ? '#fff' : 'rgba(255,255,255,0.5)', 
                                border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' 
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>

                {/* Category Dropdown */}
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 200, padding: '8px 12px' }}>
                    <option value="">All Categories</option>
                    {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>

                {/* Active Filter Toggle */}
                <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{ ...inputStyle, width: 150, padding: '8px 12px' }}>
                    <option value="all">All Status</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                </select>

                <div style={{ flex: 1 }} />

                {/* Search */}
                <div style={{ position: 'relative', width: 260 }}>
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: 10, fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>search</span>
                    <input 
                        type="text" 
                        placeholder="Search templates..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: 36, padding: '8px 12px 8px 36px' }}
                    />
                </div>
            </div>

            {/* Templates Table */}
            <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <th style={{ padding: '14px 20px', textAlign: 'left', width: 80 }}>Preview</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Name</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Category</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Studio</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Status</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Usage</th>
                            <th style={{ padding: '14px 20px', textAlign: 'left' }}>Created</th>
                            <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredTemplates.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No templates found matching the criteria.</td></tr>
                        ) : filteredTemplates.map(t => {
                            const catName = categories.find(c => c._id === t.categoryId)?.name || 'Uncategorized';
                            const badge = getStudioBadgeStyle(t.studioOrigin);
                            const isDeleting = deletingId === t._id;
                            
                            return (
                                <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '14px 20px' }}>
                                        {(t.previewUrl || t.previewImageUrl) ? (
                                            t.previewType === 'video' 
                                                ? <video src={t.previewUrl || t.previewImageUrl} autoPlay muted loop style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} />
                                                : <img src={t.previewUrl || t.previewImageUrl} style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover' }} alt="" />
                                        ) : (
                                            <div style={{ width: 64, height: 64, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.2)', fontSize: 24 }}>image</span>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '14px 20px', fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {t.name}
                                            {t.sourceJobId && (
                                                <div title={`Promoted from ${t.studioOrigin} generation`} style={{ display: 'flex', alignItems: 'center', cursor: 'help' }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f97316' }}>link</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ padding: '14px 20px' }}>
                                        <span style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{catName}</span>
                                    </td>
                                    <td style={{ padding: '14px 20px' }}>
                                        <span style={{ background: badge.bg, color: badge.color, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t.studioOrigin}</span>
                                    </td>
                                    <td style={{ padding: '14px 20px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                                            <button onClick={() => toggleField(t, 'isActive')} style={toggleBtnStyle(t.isActive)}>
                                                {t.isActive ? 'Active' : 'Inactive'}
                                            </button>
                                            <button onClick={() => toggleField(t, 'isFeatured')} style={toggleBtnStyle(t.isFeatured, '#fbbf24')}>
                                                {t.isFeatured ? '★ Featured' : 'Not Featured'}
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ padding: '14px 20px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{t.usageCount || 0}</td>
                                    <td style={{ padding: '14px 20px', color: 'rgba(255,255,255,0.5)' }}>{formatDate(t.createdAt)}</td>
                                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                        {isDeleting ? (
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginRight: 4 }}>
                                                    {(t.usageCount || 0) > 0 ? 'Deactivate?' : 'Permanent?'}
                                                </span>
                                                <button onClick={cancelDelete} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                                                <button onClick={() => confirmDelete(t)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Confirm Delete</button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                <button onClick={() => openEditModal(t)} style={actionBtnStyle}>Edit</button>
                                                <button onClick={() => handleDeleteClick(t)} style={{ ...actionBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>Delete</button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* EDIT MODAL */}
            {modal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal({ open: false, data: null })}>
                    <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 640, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{modal.isNew ? 'Upload New Template' : 'Edit Template'}</h2>
                            <button type="button" onClick={() => setModal({ open: false, data: null })} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        
                        <form onSubmit={saveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {modal.isNew && (
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <label style={{ ...labelStyle, flex: 2 }}>
                                        Preview Media (Image/Video)
                                        <input type="file" name="file" accept="image/*,video/*" required={modal.isNew} style={{ ...inputStyle, padding: '8px 10px' }} />
                                    </label>
                                    <label style={{ ...labelStyle, flex: 1 }}>
                                        Studio Origin
                                        <select name="studioOrigin" required defaultValue="creative" style={inputStyle}>
                                            <option value="creative">Creative</option>
                                            <option value="video">Video</option>
                                            <option value="content">Content</option>
                                        </select>
                                    </label>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 16 }}>
                                <label style={{ ...labelStyle, flex: 2 }}>
                                    Name
                                    <input name="name" defaultValue={modal.data?.name} required style={inputStyle} />
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>
                                    Category
                                    <select name="categoryId" defaultValue={modal.data?.categoryId} required style={inputStyle}>
                                        <option value="">Select Category</option>
                                        {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <label style={labelStyle}>
                                Description
                                <textarea name="description" defaultValue={modal.data?.description} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                            </label>

                            <label style={labelStyle}>
                                Tags
                                <TagInput tags={tags} setTags={setTags} />
                            </label>

                            <div style={{ display: 'flex', gap: 24, alignItems: 'center', marginTop: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                    <input type="checkbox" name="isFeatured" defaultChecked={modal.data?.isFeatured ?? false} />
                                    Featured
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                    <input type="checkbox" name="isActive" defaultChecked={modal.data?.isActive ?? true} />
                                    Active
                                </label>
                            </div>

                            <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                            
                            <div>
                                {modal.isNew ? (
                                    <label style={labelStyle}>
                                        Prompt Formula (Template)
                                        <textarea name="savedPrompt" required rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5 }} placeholder="Enter the exact prompt to use when generating from this template..." />
                                    </label>
                                ) : (
                                    <>
                                        <span style={{ ...labelStyle, marginBottom: 8, display: 'block' }}>Saved Prompt (Read-Only)</span>
                                        <PromptBlock text={modal.data?.savedPrompt} />
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                                            To change the prompt, create a new template from a studio generation.
                                        </div>
                                    </>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <button 
                                    type="submit" 
                                    disabled={isSubmitting}
                                    style={{ 
                                        background: isSubmitting ? 'rgba(249, 115, 22, 0.5)' : '#f97316', 
                                        color: '#fff', 
                                        border: 'none', 
                                        padding: '10px 20px', 
                                        borderRadius: 8, 
                                        fontWeight: 700, 
                                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                >
                                    {isSubmitting ? (
                                        <>
                                            <span className="material-symbols-outlined ugc2-spin" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                            {submitStatus}
                                        </>
                                    ) : (
                                        modal.isNew ? 'Upload & Create' : 'Save Template'
                                    )}
                                </button>
                                <style>{`
                                    @keyframes spin {
                                        from { transform: rotate(0deg); }
                                        to { transform: rotate(360deg); }
                                    }
                                `}</style>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Shared Styles ---
const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', width: '100%', fontSize: 13, outline: 'none' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 };
const actionBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 };

const toggleBtnStyle = (isActive, activeColor = '#10b981') => ({
    background: isActive ? `${activeColor}22` : 'rgba(255,255,255,0.05)',
    color: isActive ? activeColor : 'rgba(255,255,255,0.4)',
    border: `1px solid ${isActive ? `${activeColor}44` : 'rgba(255,255,255,0.1)'}`,
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer'
});

export default TemplateManager;

import { useState, useEffect } from 'react';
import { templates as templatesAPI } from '../services/api';

import TemplateGenerationModal from '../components/Templates/TemplateGenerationModal';

// Lightweight role check from stored JWT
function getStoredRole() {
    try {
        const token = localStorage.getItem('mantram_token')
        if (!token) return null
        const payload = JSON.parse(atob(token.split('.')[1]))
        return payload?.role || null
    } catch { return null }
}

import { useAuth } from '../context/AuthContext';

export default function TemplateLibrary({ overlayMode = false, onCloseOverlay, studioFilter = '' }) {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'superadmin';
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [studioOrigin, setStudioOrigin] = useState(studioFilter); // 'creative', 'video', 'content'
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [mobileTappedTemplateId, setMobileTappedTemplateId] = useState(null);

    useEffect(() => {
        loadTemplates();
    }, [studioOrigin]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const params = {};
            if (studioOrigin) params.studioOrigin = studioOrigin;
            // Get a large limit for client-side text filtering 
            params.limit = 200;
            const res = await templatesAPI.list(params);
            setTemplates(res.templates || []);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const [activeSection, setActiveSection] = useState('All');
    const sections = Array.from(new Set(templates.map(t => t.categoryId?.name).filter(Boolean)));

    const filteredTemplates = templates.filter(t => {
        const matchesSearch = !search || 
            t.name.toLowerCase().includes(search.toLowerCase()) || 
            t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase())) ||
            t.categoryId?.name?.toLowerCase().includes(search.toLowerCase());
        const matchesSection = activeSection === 'All' || t.categoryId?.name === activeSection;
        return matchesSearch && matchesSection;
    });
    const handleTemplateClick = (template) => {
        // Simple tap-to-reveal on mobile
        if (window.innerWidth < 768 && mobileTappedTemplateId !== template._id) {
            setMobileTappedTemplateId(template._id);
            return;
        }
        setSelectedTemplate(template);
    };

    const containerClasses = overlayMode
        ? "fixed inset-0 z-[9999] bg-[var(--sys-background)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        : "max-w-[1600px] mx-auto px-4 md:px-6 py-6 pb-24";

    return (
        <div className={containerClasses}>
            {overlayMode ? (
                <div className="flex items-center justify-between p-4 border-b border-[var(--sys-border)] bg-[var(--sys-surface)]">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onCloseOverlay}
                            className="p-2 rounded-lg hover:bg-[var(--sys-primary-dim)] transition-colors"
                        >
                            <span className="material-symbols-outlined text-[var(--sys-on-surface-variant)]">close</span>
                        </button>
                        <h2 className="text-xl font-semibold text-[var(--sys-on-surface)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-purple-500">grid_view</span>
                            {studioFilter === 'creative' ? 'Image Templates' : studioFilter === 'video' ? 'Video Templates' : studioFilter === 'content' ? 'Content Templates' : 'All Templates'}
                        </h2>
                    </div>
                </div>
            ) : (
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-[var(--sys-on-surface)] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--sys-primary)]">grid_view</span>
                        Template Library
                    </h1>
                    <p className="text-[var(--sys-on-surface-variant)] mt-1">Discover and use high-quality creative templates</p>
                </div>
            )}

            <div className={`flex flex-col gap-6 ${overlayMode ? 'p-6 overflow-y-auto flex-1' : 'mt-6'}`}>
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {['All', ...sections].map(sec => (
                            <button
                                key={sec}
                                onClick={() => setActiveSection(sec)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: 20,
                                    border: `0.5px solid ${activeSection === sec ? '#E84118' : 'var(--color-border-secondary)'}`,
                                    fontSize: 12,
                                    fontWeight: activeSection === sec ? 600 : 500,
                                    color: activeSection === sec ? '#E84118' : 'var(--color-text-secondary)',
                                    background: activeSection === sec ? 'rgba(232,65,24,0.06)' : 'transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {sec}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full sm:w-72">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sys-on-surface-variant)]">search</span>
                        <input
                            type="text"
                            placeholder="Search templates..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-[var(--sys-surface)] border border-[var(--sys-border)] rounded-xl text-[var(--sys-on-surface)] focus:ring-2 focus:ring-[var(--sys-primary)]/50 focus:border-[var(--sys-primary)] transition-all outline-none"
                        />
                    </div>
                </div>

                {/* Grid */}
                <style dangerouslySetInnerHTML={{__html: `
                    .t-shimmer {
                        background: linear-gradient(90deg, var(--color-background-secondary) 25%, var(--color-background-primary) 50%, var(--color-background-secondary) 75%);
                        background-size: 200% 100%;
                        animation: shimmer 1.5s infinite;
                    }
                    @keyframes shimmer {
                        0% { background-position: -200% 0; }
                        100% { background-position: 200% 0; }
                    }
                `}} />
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[1,2,3,4,5,6,7,8].map(i => (
                            <div key={i} className="aspect-[1/1] rounded-xl t-shimmer border border-[var(--sys-border)]" />
                        ))}
                    </div>
                ) : filteredTemplates.length === 0 ? (
                    <div className="text-center py-24 bg-[var(--sys-surface)] rounded-2xl border border-[var(--sys-border)]">
                        <span className="material-symbols-outlined text-4xl text-[var(--sys-on-surface-variant)] mb-4 block">search_off</span>
                        <h3 className="text-lg font-medium text-[var(--sys-on-surface)]">No templates found</h3>
                        <p className="text-[var(--sys-on-surface-variant)]">Try adjusting your search or filters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredTemplates.map(template => {
                            const isTapped = mobileTappedTemplateId === template._id;
                            const isNew = template.isNew || (new Date() - new Date(template.createdAt)) < 7 * 24 * 60 * 60 * 1000;
                            return (
                                <button
                                    key={template._id}
                                    className="group"
                                    onClick={() => handleTemplateClick(template)}
                                    onMouseLeave={() => setMobileTappedTemplateId(null)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        textAlign: 'left',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: 0,
                                        cursor: 'pointer',
                                        position: 'relative'
                                    }}
                                >
                                    <div style={{ 
                                        width: '100%', 
                                        aspectRatio: '1/1', 
                                        borderRadius: 12, 
                                        overflow: 'hidden', 
                                        position: 'relative',
                                        marginBottom: 10,
                                        background: 'var(--color-background-secondary)',
                                        border: '1.5px solid var(--color-border-tertiary)'
                                    }}>
                                        {template.previewType === 'video' && template.previewUrl ? (
                                            <video 
                                                src={template.previewUrl} 
                                                muted autoPlay loop playsInline
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                className="transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : template.previewUrl ? (
                                            <img 
                                                src={template.previewUrl} 
                                                alt={template.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                className="transition-transform duration-500 group-hover:scale-105"
                                                onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.classList.add('t-shimmer'); }}
                                            />
                                        ) : (
                                            <div className="t-shimmer" style={{ width: '100%', height: '100%' }} />
                                        )}

                                        {/* Badges */}
                                        {template.isMantramExclusive ? (
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8,
                                                background: 'rgba(232,65,24,0.9)', color: '#fff',
                                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                padding: '3px 8px', borderRadius: 20, zIndex: 10
                                            }}>Exclusive</div>
                                        ) : isNew ? (
                                            <div style={{
                                                position: 'absolute', top: 8, left: 8,
                                                background: 'rgba(0,212,170,0.9)', color: '#fff',
                                                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                                                padding: '3px 8px', borderRadius: 20, zIndex: 10
                                            }}>New</div>
                                        ) : null}

                                        {/* Hover / Tap Overlay */}
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            background: 'rgba(0,0,0,0.35)',
                                            display: 'flex', alignItems: 'flex-end', padding: 12
                                        }}
                                        className={`transition-opacity duration-200 ${isTapped ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}
                                        >
                                            <div style={{
                                                width: '100%', background: '#E84118', color: '#fff',
                                                fontSize: 11, fontWeight: 600, textAlign: 'center',
                                                padding: '7px 0', borderRadius: 8
                                            }}>
                                                Use this template
                                            </div>
                                        </div>

                                        {/* Selected Checkmark */}
                                        {selectedTemplate?._id === template._id && (
                                            <div style={{
                                                position: 'absolute', top: 10, right: 10,
                                                width: 20, height: 20, borderRadius: '50%',
                                                background: '#E84118', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                zIndex: 10
                                            }}>
                                                <span className="material-symbols-outlined" style={{ color: '#fff', fontSize: 14, fontWeight: 800 }}>check</span>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                                        {template.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                        <span>{template.categoryId?.name || 'Template'}</span>
                                        {template.usageCount > 0 && <span>{template.usageCount} uses</span>}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {selectedTemplate && (
                <TemplateGenerationModal 
                    template={selectedTemplate} 
                    onClose={() => setSelectedTemplate(null)} 
                />
            )}
        </div>
    );
}

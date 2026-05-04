import { useState, useEffect } from 'react';
import { templates as templatesAPI } from '../services/api';
import DashboardLayout from '../components/DashboardLayout';

import TemplateGenerationModal from '../components/Templates/TemplateGenerationModal';

import { useNavigate } from 'react-router-dom';

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
    const navigate = useNavigate();
    const isSuperAdmin = user?.role === 'superadmin';
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [studioOrigin, setStudioOrigin] = useState(studioFilter); // 'creative', 'video', 'content'
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [mobileTappedTemplateId, setMobileTappedTemplateId] = useState(null);
    // Image/Video Preview Lightbox
    const [previewModal, setPreviewModal] = useState({ open: false, src: '', type: 'image', name: '' });

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

        const categoryName = (template.categoryId?.name || '').toLowerCase().trim();
        const studioOrigin = (template.studioOrigin || '').toLowerCase().trim();
        let targetRoute = null;
        let targetMode = null;

        // ── Video Studio categories ──
        if (categoryName === 'video q-ads' || categoryName === 'video qads' || studioOrigin === 'video') {
            targetRoute = '/video-studio';
            targetMode = 'q-ads';
        }
        // ── Creative Studio categories ──
        else if (categoryName === 'ai create' || categoryName === 'ai creative') {
            targetRoute = '/creative-studio';
            targetMode = 'create';
        } else if (categoryName === 'campaign shot' || categoryName === 'campaignshot') {
            targetRoute = '/creative-studio';
            targetMode = 'campaignshot';
        } else if (categoryName === 'carousel' || categoryName === 'carousels') {
            targetRoute = '/creative-studio';
            targetMode = 'carousel';
        } else if (categoryName === 'campaigns' || categoryName === 'campaign') {
            targetRoute = '/creative-studio';
            targetMode = 'campaigns';
        } else if (categoryName === 'logo' || categoryName === 'logo gen' || categoryName === 'campaign logo') {
            targetRoute = '/creative-studio';
            targetMode = 'campaignlogo';
        } else if (categoryName === 'photoshoot' || categoryName === 'ai photoshoot') {
            targetRoute = '/creative-studio';
            targetMode = 'photoshoot';
        } else if (categoryName === 'try-on' || categoryName === 'tryon' || categoryName === 'virtual try-on') {
            targetRoute = '/creative-studio';
            targetMode = 'tryon';
        } else if (categoryName === 'mockups' || categoryName === 'mockup') {
            targetRoute = '/creative-studio';
            targetMode = 'mockups';
        }
        // ── Fallback: use studioSection to determine mode ──
        else if (template.studioSection) {
            const section = template.studioSection.toLowerCase().trim();
            targetRoute = '/creative-studio';
            if (section === 'carousel') targetMode = 'carousel';
            else if (section === 'campaign_shot') targetMode = 'campaignshot';
            else if (section === 'campaign') targetMode = 'campaigns';
            else if (section === 'ai_create') targetMode = 'create';
            else if (section === 'avatar') targetMode = 'photoshoot';
            else targetMode = 'create';
        }
        // ── Fallback: route to Creative Studio 'create' for any image-oriented template ──
        else if (studioOrigin === 'creative' || studioOrigin === 'image') {
            targetRoute = '/creative-studio';
            targetMode = 'create';
        }
        // ── Content Studio categories ──
        else if (studioOrigin === 'content') {
            targetRoute = '/content-studio';
        }
        // ── Ultimate fallback: route to Creative Studio ──
        else {
            targetRoute = '/creative-studio';
            targetMode = 'create';
        }

        if (targetRoute) {
            let url = `${targetRoute}?templateId=${template._id}`;
            if (targetMode) url += `&mode=${targetMode}`;
            navigate(url);
            if (overlayMode && onCloseOverlay) {
                onCloseOverlay();
            }
        } else {
            setSelectedTemplate(template);
        }
    };

    const containerClasses = overlayMode
        ? "fixed inset-0 z-[9999] bg-[var(--sys-background)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        : "max-w-[1600px] mx-auto px-4 md:px-6 py-6 pb-24 w-full";

    const content = (
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
                                        {template.previewType === 'video' && (template.previewVideoUrl || template.previewUrl) ? (
                                            <video 
                                                src={template.previewVideoUrl || template.previewUrl} 
                                                muted autoPlay loop playsInline
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                className="transition-transform duration-500 group-hover:scale-105"
                                            />
                                        ) : (template.previewUrl || template.previewImageUrl) ? (
                                            <img 
                                                src={template.previewUrl || template.previewImageUrl} 
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

                                        {/* Category Badge */}
                                        <div style={{
                                            position: 'absolute', top: 8, right: 8,
                                            background: 'rgba(0,0,0,0.6)', color: '#fff',
                                            fontSize: 10, fontWeight: 700,
                                            padding: '3px 8px', borderRadius: 20, zIndex: 10,
                                            backdropFilter: 'blur(4px)'
                                        }}>
                                            {template.categoryId?.name || 'Template'}
                                        </div>

                                        {/* Hover / Tap Overlay */}
                                        <div style={{
                                            position: 'absolute', inset: 0,
                                            background: 'rgba(0,0,0,0.35)',
                                            display: 'flex', alignItems: 'flex-end', padding: 12,
                                            gap: 8,
                                        }}
                                        className={`transition-opacity duration-200 ${isTapped ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}
                                        >
                                            {/* Preview button */}
                                            <div
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const src = template.previewType === 'video'
                                                        ? (template.previewVideoUrl || template.previewUrl)
                                                        : (template.previewUrl || template.previewImageUrl);
                                                    if (src) setPreviewModal({ open: true, src, type: template.previewType === 'video' ? 'video' : 'image', name: template.name });
                                                }}
                                                style={{
                                                    width: 36, height: 36, borderRadius: 8,
                                                    background: 'rgba(255,255,255,0.15)',
                                                    backdropFilter: 'blur(4px)',
                                                    border: '1px solid rgba(255,255,255,0.2)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    cursor: 'pointer', flexShrink: 0,
                                                    transition: 'background 0.2s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                                title="Preview"
                                            >
                                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>zoom_in</span>
                                            </div>
                                            {/* Use template button */}
                                            <div style={{
                                                flex: 1, background: '#E84118', color: '#fff',
                                                fontSize: 11, fontWeight: 600, textAlign: 'center',
                                                padding: '7px 0', borderRadius: 8,
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
                                        <span></span>
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

            {/* ===== IMAGE/VIDEO PREVIEW LIGHTBOX ===== */}
            {previewModal.open && (
                <div
                    onClick={() => setPreviewModal({ open: false, src: '', type: 'image', name: '' })}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10000, cursor: 'zoom-out',
                        animation: 'fadeIn 0.2s ease-out',
                    }}>
                    {/* Close button */}
                    <button
                        onClick={() => setPreviewModal({ open: false, src: '', type: 'image', name: '' })}
                        style={{
                            position: 'absolute', top: 20, right: 20,
                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%', width: 40, height: 40,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', zIndex: 10001,
                        }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>close</span>
                    </button>
                    {/* Template name */}
                    {previewModal.name && (
                        <div style={{
                            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                            padding: '8px 20px', borderRadius: 10,
                            color: '#fff', fontSize: 14, fontWeight: 600,
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            {previewModal.name}
                        </div>
                    )}
                    {/* Media content */}
                    <div onClick={e => e.stopPropagation()} style={{ cursor: 'default', maxWidth: '90vw', maxHeight: '85vh' }}>
                        {previewModal.type === 'video' ? (
                            <video
                                src={previewModal.src}
                                controls autoPlay loop
                                style={{
                                    maxWidth: '90vw', maxHeight: '85vh',
                                    borderRadius: 12,
                                    boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            />
                        ) : (
                            <img
                                src={previewModal.src}
                                alt={previewModal.name}
                                style={{
                                    maxWidth: '90vw', maxHeight: '85vh',
                                    borderRadius: 12, objectFit: 'contain',
                                    boxShadow: '0 16px 64px rgba(0,0,0,0.5)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            />
                        )}
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            `}} />
        </div>
    );

    return overlayMode ? content : (
        <DashboardLayout title="Explore Templates" subtitle="Discover and use high-quality creative templates">
            {content}
        </DashboardLayout>
    );
}

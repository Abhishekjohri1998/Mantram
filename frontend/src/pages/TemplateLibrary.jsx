import { useState, useEffect } from 'react';
import { templates as templatesAPI } from '../services/api';

import TemplateGenerationModal from '../components/Templates/TemplateGenerationModal';

export default function TemplateLibrary({ overlayMode = false, onCloseOverlay, studioFilter = '' }) {
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

    const filteredTemplates = templates.filter(t => 
        !search || 
        t.name.toLowerCase().includes(search.toLowerCase()) || 
        t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase())) ||
        t.categoryId?.name?.toLowerCase().includes(search.toLowerCase())
    );

    const handleTemplateClick = (template) => {
        // Simple tap-to-reveal on mobile
        if (window.innerWidth < 768 && mobileTappedTemplateId !== template._id) {
            setMobileTappedTemplateId(template._id);
            return;
        }
        setSelectedTemplate(template);
    };

    const containerClasses = overlayMode
        ? "fixed inset-0 z-[150] bg-[var(--sys-background)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
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
                    <div className="flex gap-2 p-1 bg-[var(--sys-surface)] rounded-xl border border-[var(--sys-border)]">
                        {['', 'creative', 'video', 'content'].map(origin => (
                            <button
                                key={origin}
                                onClick={() => setStudioOrigin(origin)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                    studioOrigin === origin
                                        ? 'bg-[var(--sys-primary)] text-white shadow-sm'
                                        : 'text-[var(--sys-on-surface-variant)] hover:bg-[var(--sys-primary-dim)] hover:text-[var(--sys-on-surface)]'
                                }`}
                            >
                                {origin === '' ? 'All Studios' : origin.charAt(0).toUpperCase() + origin.slice(1)}
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
                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[1,2,3,4,5,6,7,8].map(i => (
                            <div key={i} className="aspect-[4/5] rounded-2xl bg-[var(--sys-surface)] animate-pulse border border-[var(--sys-border)]" />
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
                            return (
                                <div
                                    key={template._id}
                                    className="group relative aspect-[4/5] rounded-2xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-surface)] shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer"
                                    onClick={() => handleTemplateClick(template)}
                                    onMouseLeave={() => setMobileTappedTemplateId(null)} // Reset tap on leave
                                >
                                    {template.previewUrl ? (
                                        <img 
                                            src={template.previewUrl} 
                                            alt={template.name}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-[var(--sys-primary-dim)] to-[var(--sys-surface)] flex items-center justify-center">
                                            <span className="material-symbols-outlined text-4xl text-[var(--sys-primary)]/30">image</span>
                                        </div>
                                    )}

                                    {/* Badges */}
                                    <div className="absolute top-3 left-3 flex gap-2">
                                        {template.isFeatured && (
                                            <div className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-semibold rounded-md shadow-sm flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">verified</span>
                                                Mantram Exclusive
                                            </div>
                                        )}
                                    </div>

                                    <div className="absolute top-3 right-3">
                                        <div className="px-2 py-1 bg-black/50 backdrop-blur-md text-white text-xs font-medium rounded-md shadow-sm capitalize border border-white/10">
                                            {template.studioOrigin}
                                        </div>
                                    </div>

                                    {/* Hover / Tap Overlay */}
                                    <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-5 transition-opacity duration-300 ${isTapped ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'}`}>
                                        <h3 className="text-white font-semibold text-lg line-clamp-2 mb-1">{template.name}</h3>
                                        <p className="text-white/80 text-sm mb-3">{template.categoryId?.name}</p>
                                        
                                        <button 
                                            className="w-full py-2.5 bg-[var(--sys-primary)] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[var(--sys-primary)]/90 transition-colors shadow-lg active:scale-95"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedTemplate(template);
                                            }}
                                        >
                                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                            Use Template
                                        </button>
                                    </div>
                                    
                                    {/* Always-visible title bar (fades out on hover) */}
                                    <div className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300 ${isTapped ? 'opacity-0' : 'opacity-100 md:group-hover:opacity-0'}`}>
                                        <h3 className="text-white font-medium truncate">{template.name}</h3>
                                        <p className="text-white/70 text-xs">{template.categoryId?.name}</p>
                                    </div>
                                </div>
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

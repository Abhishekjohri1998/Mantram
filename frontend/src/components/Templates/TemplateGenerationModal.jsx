import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { templates as templatesAPI } from '../../services/api';

const STUDIO_CREDIT_COSTS = {
    creative: 4,
    video: 8,
    content: 2
};

export default function TemplateGenerationModal({ template, onClose }) {
    const navigate = useNavigate();
    const [userPrompt, setUserPrompt] = useState('');
    const [productPreview, setProductPreview] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const cost = STUDIO_CREDIT_COSTS[template.studioOrigin] || 0;

    const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });

    const handleImageUpload = async (e, setPreview) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (file.size > 5 * 1024 * 1024) {
            setError('Image must be under 5MB');
            return;
        }

        try {
            const base64 = await toBase64(file);
            setPreview(base64);
            setError('');
        } catch (err) {
            setError('Failed to process image');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const userInputs = {
                userPrompt,
                userProductImageBase64: productPreview,
                userAvatarImageBase64: avatarPreview
            };

            const res = await templatesAPI.use(template._id, { userInputs });

            if (res.success && res.jobId) {
                // Register with global background jobs if it exists
                if (window.__bgJobs__ && window.__bgJobs__.addJob) {
                    window.__bgJobs__.addJob(res.jobId, {
                        prompt: `Template: ${template.name}`,
                        startedAt: Date.now(),
                        steps: [{ agent: 'system', message: 'Template execution started...', status: 'working' }]
                    });
                }

                // Redirect
                onClose();
                if (template.studioOrigin === 'creative') {
                    navigate(`/creative-studio?jobId=${res.jobId}`);
                } else if (template.studioOrigin === 'video') {
                    navigate(`/video-studio`);
                } else if (template.studioOrigin === 'content') {
                    navigate(`/content-studio`);
                } else {
                    navigate('/');
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to start generation');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[var(--sys-surface)] rounded-2xl border border-[var(--sys-border)] w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--sys-border)]">
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--sys-on-surface)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[var(--sys-primary)]">magic_button</span>
                            Use Template
                        </h2>
                        <p className="text-sm text-[var(--sys-on-surface-variant)] mt-1 truncate max-w-md">
                            {template.name}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--sys-surface-variant)] text-[var(--sys-on-surface-variant)] transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
                    {error && (
                        <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-sm flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">error</span>
                            {error}
                        </div>
                    )}

                    <form id="template-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
                        
                        <div>
                            <label className="block text-sm font-medium text-[var(--sys-on-surface)] mb-2">
                                Brief / Custom Prompt (Optional)
                            </label>
                            <textarea
                                value={userPrompt}
                                onChange={(e) => setUserPrompt(e.target.value)}
                                placeholder="Add specific details, colors, or subjects to guide the template..."
                                className="w-full h-24 p-3 bg-[var(--sys-background)] border border-[var(--sys-border)] rounded-xl text-sm text-[var(--sys-on-surface)] focus:ring-2 focus:ring-[var(--sys-primary)] focus:border-transparent outline-none transition-all resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Product Image */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[var(--sys-on-surface)] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">inventory_2</span>
                                    Product Image
                                </label>
                                <div className="relative aspect-square rounded-xl border-2 border-dashed border-[var(--sys-border)] bg-[var(--sys-background)] hover:border-[var(--sys-primary)]/50 transition-colors group overflow-hidden flex flex-col items-center justify-center">
                                    {productPreview ? (
                                        <>
                                            <img src={productPreview} alt="Product" className="w-full h-full object-cover" />
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); setProductPreview(null); }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-red-500 transition-colors backdrop-blur-sm"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-3xl text-[var(--sys-on-surface-variant)] mb-2 group-hover:text-[var(--sys-primary)] transition-colors">add_photo_alternate</span>
                                            <span className="text-xs text-[var(--sys-on-surface-variant)] font-medium">Upload Product</span>
                                        </>
                                    )}
                                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setProductPreview)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title=" " />
                                </div>
                            </div>

                            {/* Avatar Image */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-[var(--sys-on-surface)] flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">face</span>
                                    Avatar / Face Ref
                                </label>
                                <div className="relative aspect-square rounded-xl border-2 border-dashed border-[var(--sys-border)] bg-[var(--sys-background)] hover:border-[var(--sys-primary)]/50 transition-colors group overflow-hidden flex flex-col items-center justify-center">
                                    {avatarPreview ? (
                                        <>
                                            <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                                            <button 
                                                type="button"
                                                onClick={(e) => { e.preventDefault(); setAvatarPreview(null); }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-red-500 transition-colors backdrop-blur-sm"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-3xl text-[var(--sys-on-surface-variant)] mb-2 group-hover:text-[var(--sys-primary)] transition-colors">add_photo_alternate</span>
                                            <span className="text-xs text-[var(--sys-on-surface-variant)] font-medium">Upload Face</span>
                                        </>
                                    )}
                                    <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setAvatarPreview)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" title=" " />
                                </div>
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-[var(--sys-border)] bg-[var(--sys-surface-variant)] flex items-center justify-between">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <span className="material-symbols-outlined text-amber-500 text-sm">token</span>
                        <span className="text-sm font-semibold text-amber-500">{cost} Credits</span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-sm font-medium text-[var(--sys-on-surface)] hover:bg-[var(--sys-surface)] border border-transparent hover:border-[var(--sys-border)] transition-all"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button 
                            form="template-form"
                            type="submit"
                            disabled={isSubmitting}
                            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/90 transition-all flex items-center gap-2 shadow-sm shadow-[var(--sys-primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                    Starting...
                                </>
                            ) : (
                                <>
                                    Generate
                                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

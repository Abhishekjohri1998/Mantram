import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { templates as templatesAPI } from '../../services/api';

const STUDIO_CREDIT_COSTS = {
    creative: 4,
    video: 8,
    content: 2
};

// BUG-03 FIX: Pre-upload image to S3 before generation — never send base64
async function uploadImageReference(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/media/image-reference', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` },
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Image upload failed');
    }
    const data = await res.json();
    return data.url; // S3 URL
}

export default function TemplateGenerationModal({ template, onClose }) {
    const navigate = useNavigate();
    const [userPrompt, setUserPrompt] = useState('');

    // Product image state — stores { preview: localObjectUrl, s3Url, uploading, error }
    const [productImg, setProductImg] = useState({ preview: null, s3Url: null, uploading: false, error: '' });
    // Avatar image state
    const [avatarImg, setAvatarImg] = useState({ preview: null, s3Url: null, uploading: false, error: '' });

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const cost = STUDIO_CREDIT_COSTS[template.studioOrigin] || 0;

    const handleImageSelect = async (e, setState) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            setState(prev => ({ ...prev, error: 'Image must be under 10MB' }));
            return;
        }

        const preview = URL.createObjectURL(file);
        setState({ preview, s3Url: null, uploading: true, error: '' });

        try {
            const s3Url = await uploadImageReference(file);
            setState({ preview, s3Url, uploading: false, error: '' });
        } catch (err) {
            setState({ preview, s3Url: null, uploading: false, error: err.message || 'Upload failed' });
        }
    };

    const clearImage = (setState, previewUrl) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setState({ preview: null, s3Url: null, uploading: false, error: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Block if images are still uploading
        if (productImg.uploading || avatarImg.uploading) {
            setError('Please wait for image uploads to complete.');
            return;
        }
        // Block if an image was selected but upload failed (no S3 URL)
        if (productImg.preview && !productImg.s3Url) {
            setError('Product image upload failed. Please try again.');
            return;
        }
        if (avatarImg.preview && !avatarImg.s3Url) {
            setError('Avatar image upload failed. Please try again.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            // BUG-03 FIX: send S3 URLs, never base64
            const userInputs = {
                userPrompt,
                productImageUrl: productImg.s3Url || null,
                avatarImageUrl: avatarImg.s3Url || null,
            };

            const res = await templatesAPI.use(template._id, { userInputs });

            if (res.success && res.jobId) {
                if (window.__bgJobs__?.addJob) {
                    window.__bgJobs__.addJob(res.jobId, {
                        prompt: `Template: ${template.name}`,
                        startedAt: Date.now(),
                        steps: [{ agent: 'system', message: 'Template execution started...', status: 'working' }]
                    });
                }

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

    const ImageSlot = ({ label, icon, state, setState }) => (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--sys-on-surface)] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">{icon}</span>
                {label}
            </label>
            <div className="relative aspect-square rounded-xl border-2 border-dashed border-[var(--sys-border)] bg-[var(--sys-background)] hover:border-[var(--sys-primary)]/50 transition-colors group overflow-hidden flex flex-col items-center justify-center">
                {state.preview ? (
                    <>
                        <img src={state.preview} alt={label} className="w-full h-full object-cover" />
                        {/* Upload progress overlay */}
                        {state.uploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                                <div className="flex flex-col items-center gap-2">
                                    <span className="material-symbols-outlined animate-spin text-white text-2xl">sync</span>
                                    <span className="text-xs text-white font-medium">Uploading…</span>
                                </div>
                            </div>
                        )}
                        {/* Success indicator */}
                        {!state.uploading && state.s3Url && (
                            <div className="absolute top-2 left-2 bg-green-500 rounded-md px-1.5 py-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-white text-[10px]">check</span>
                                <span className="text-[10px] text-white font-bold">Uploaded</span>
                            </div>
                        )}
                        {/* Error indicator */}
                        {!state.uploading && state.error && (
                            <div className="absolute top-2 left-2 bg-red-500 rounded-md px-1.5 py-0.5">
                                <span className="text-[10px] text-white font-bold">Upload failed</span>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => clearImage(setState, state.preview)}
                            className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg text-white hover:bg-red-500 transition-colors backdrop-blur-sm"
                        >
                            <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-3xl text-[var(--sys-on-surface-variant)] mb-2 group-hover:text-[var(--sys-primary)] transition-colors">add_photo_alternate</span>
                        <span className="text-xs text-[var(--sys-on-surface-variant)] font-medium">Upload {label}</span>
                    </>
                )}
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => handleImageSelect(e, setState)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title=" "
                    disabled={state.uploading}
                />
            </div>
            {state.error && (
                <p className="text-xs text-red-500">{state.error}</p>
            )}
        </div>
    );

    const anyUploading = productImg.uploading || avatarImg.uploading;

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
                                Brief / Custom Prompt <span className="text-[var(--sys-on-surface-variant)] font-normal">(Optional)</span>
                            </label>
                            <textarea
                                value={userPrompt}
                                onChange={(e) => setUserPrompt(e.target.value)}
                                placeholder="Add specific details, colors, or subjects to guide the template..."
                                className="w-full h-24 p-3 bg-[var(--sys-background)] border border-[var(--sys-border)] rounded-xl text-sm text-[var(--sys-on-surface)] focus:ring-2 focus:ring-[var(--sys-primary)] focus:border-transparent outline-none transition-all resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <ImageSlot
                                label="Product Image"
                                icon="inventory_2"
                                state={productImg}
                                setState={setProductImg}
                            />
                            <ImageSlot
                                label="Avatar / Face Ref"
                                icon="face"
                                state={avatarImg}
                                setState={setAvatarImg}
                            />
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
                            disabled={isSubmitting || anyUploading}
                            className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--sys-primary)] hover:bg-[var(--sys-primary)]/90 transition-all flex items-center gap-2 shadow-sm shadow-[var(--sys-primary)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                    Starting...
                                </>
                            ) : anyUploading ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                                    Uploading...
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

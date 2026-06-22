import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useUI } from '../context/UIContext';
import TagInput from '../components/shared/TagInput';
import { useModelStatus } from '../hooks/useModelStatus';

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

const SECTION_OPTIONS = [
    { value: 'ai_create',    label: 'AI Create' },
    { value: 'carousel',     label: 'Carousel' },
    { value: 'campaign',     label: 'Campaign' },
    { value: 'campaign_shot',label: 'Campaign Shot' },
    { value: 'video_ugc',    label: 'Video UGC' },
    { value: 'video_qads',   label: 'Video Q-Ads' },
    { value: 'avatar',       label: 'Avatar Studio' },
    { value: 'general',      label: 'General / Uncategorized' },
    { value: 'homepage',     label: 'Homepage Featured' },
];

const STUDIO_SECTIONS = [
    { value: 'ai_create',    label: 'AI Create' },
    { value: 'carousel',     label: 'Carousel' },
    { value: 'campaign',     label: 'Campaign' },
    { value: 'campaign_shot',label: 'Campaign Shot' },
    { value: 'logo',         label: 'Logo' },
    { value: 'video_ugc',    label: 'Video UGC' },
    { value: 'video_qads',   label: 'Video Q-Ads' },
    { value: 'avatar',       label: 'Avatar' },
    { value: 'general',      label: 'General' },
    { value: 'homepage',     label: 'Homepage Featured' },
];

// Studio → allowed sections mapping
const SECTIONS_BY_STUDIO = {
    creative: ['ai_create', 'carousel', 'campaign', 'campaign_shot', 'logo', 'avatar', 'general', 'homepage'],
    video:    ['video_ugc', 'video_qads', 'general', 'homepage'],
    content:  ['general'],
};

const TemplateManager = () => {
    const { addToast } = useUI();
    const modelStatuses = useModelStatus();

    // Top-level tab
    const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'categories'

    // Data
    const [templates, setTemplates] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filtering
    const [studioFilter, setStudioFilter] = useState('All');
    const [catFilter, setCatFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('all');

    // Modal
    const [modal, setModal] = useState({ open: false, data: null });
    // Image Preview Lightbox
    const [previewModal, setPreviewModal] = useState({ open: false, src: '', type: 'image', name: '' });
    const [tags, setTags] = useState([]);
    const [deletingId, setDeletingId] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState('');

    // Controlled modal form state
    const [selectedStudio, setSelectedStudio] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSection, setSelectedSection] = useState('general');
    const [formErrors, setFormErrors] = useState({});

    // AI auto-analyze state (for Upload New Template modal)
    const [analyzingPrompt, setAnalyzingPrompt] = useState(false);
    const [analyzedDna, setAnalyzedDna] = useState(null);
    const [autoPrompt, setAutoPrompt] = useState('');

    // Derived: sections filtered by selected studio
    const filteredSections = selectedStudio
        ? STUDIO_SECTIONS.filter(s => (SECTIONS_BY_STUDIO[selectedStudio] || []).includes(s.value))
        : [];

    // Bulk selection (FIX 8)
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkBusy, setBulkBusy] = useState(false);

    // Category Manager state (FIX 4)
    const [catLoading, setCatLoading] = useState(false);
    const [catModal, setCatModal] = useState({ open: false, data: null });
    const [catSubmitting, setCatSubmitting] = useState(false);

    // Generate Template modal state
    const [genModal, setGenModal] = useState(false);
    const [genForm, setGenForm] = useState({ name: '', categoryId: '', description: '', prompt: '', model: 'seedance-2.0', studioOrigin: 'video', studioSection: 'video_qads', productImageUrls: [], avatarUrl: '', duration: 8, format: '9:16', quality: 'high' });
    const [genStatus, setGenStatus] = useState('idle'); // idle | generating | polling | done | error
    const [genProgress, setGenProgress] = useState(0);
    const [genTaskId, setGenTaskId] = useState(null);
    const [genResult, setGenResult] = useState(null);
    const [genError, setGenError] = useState('');
    const [genAssetInputs, setGenAssetInputs] = useState({ productUrl: '', avatarUrl: '' });
    const [mentionMenu, setMentionMenu] = useState({ visible: false, query: '', cursor: 0 });

    // Edit modal regeneration states
    const [editPrompt, setEditPrompt] = useState('');
    const [editModel, setEditModel] = useState('seedance-2.0');
    const [editDuration, setEditDuration] = useState(8);
    const [editFormat, setEditFormat] = useState('9:16');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editProductImageUrls, setEditProductImageUrls] = useState([]);
    const [editGenStatus, setEditGenStatus] = useState('idle'); // idle | generating | polling | done | error
    const [editGenProgress, setEditGenProgress] = useState(0);
    const [editGenTaskId, setEditGenTaskId] = useState(null);
    const [editGenError, setEditGenError] = useState('');
    const [editAssetInputs, setEditAssetInputs] = useState({ productUrl: '' });

    const handleFileUpload = async (e, type, isEdit = false) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = event.target.result;
            try {
                addToast('Uploading image...', 'info');
                const res = await api('/media/upload', {
                    method: 'POST',
                    body: JSON.stringify({ imageData: base64, folder: 'templates' })
                });
                if (res && res.url) {
                    if (isEdit) {
                        if (type === 'avatar') {
                            setEditAvatarUrl(res.url);
                        } else if (type === 'product') {
                            setEditProductImageUrls(urls => [...urls, res.url]);
                        }
                    } else {
                        if (type === 'avatar') {
                            setGenForm(f => ({ ...f, avatarUrl: res.url }));
                        } else if (type === 'product') {
                            setGenForm(f => ({ ...f, productImageUrls: [...f.productImageUrls, res.url] }));
                        }
                    }
                    addToast('Image uploaded', 'success');
                } else {
                    throw new Error('Upload failed');
                }
            } catch (err) {
                addToast('Failed to upload image', 'error');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset input
    };

    const VIDEO_MODELS = [
        { value: 'seedance-2.0', label: 'Seedance 2.0', type: 'video' },
        { value: 'kling-v2-master', label: 'Kling V2 Master', type: 'video' },
        { value: 'wan-2.1', label: 'Wan 2.1', type: 'video' },
        { value: 'luma-ray-2', label: 'Luma Ray 2', type: 'video' },
        { value: 'happyhorse-1.0', label: 'HappyHorse 1.0', type: 'video' },
        { value: 'happyhorse-1.1', label: 'HappyHorse 1.1', type: 'video' },
        { value: 'gemini-flash', label: 'Gemini Flash Video', type: 'video' },
    ];
    const IMAGE_MODELS = [
        { value: 'gemini-image', label: 'Gemini Image', type: 'image' },
        { value: 'gpt-image-2', label: 'GPT Image 2', type: 'image' },
    ];
    const ALL_MODELS = [...VIDEO_MODELS, ...IMAGE_MODELS];
    const isVideoModel = (m) => VIDEO_MODELS.some(vm => m.includes(vm.value));

    const fetchData = async () => {
        setLoading(true);
        try {
            const [tempRes, catRes] = await Promise.all([
                api('/superadmin/templates'),
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

    const fetchCategories = async () => {
        setCatLoading(true);
        try {
            const res = await api('/superadmin/templates/categories');
            setCategories(res.categories || []);
        } catch (err) { addToast(err.message, 'error'); }
        finally { setCatLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { if (activeTab === 'categories') fetchCategories(); }, [activeTab]);

    // Poll for active generation status (from modal)
    useEffect(() => {
        if (genStatus !== 'polling' || !genTaskId) return;
        const interval = setInterval(async () => {
            try {
                const res = await api(`/superadmin/templates/generate/status/${genTaskId}`);
                setGenProgress(res.progress || 0);
                if (res.status === 'COMPLETED') {
                    setGenStatus('done');
                    setGenResult(res);
                    addToast('Template video generated successfully!', 'success');
                    fetchData();
                    clearInterval(interval);
                } else if (res.status === 'FAILED') {
                    setGenStatus('error');
                    setGenError(res.error || 'Generation failed');
                    clearInterval(interval);
                }
            } catch (err) {
                console.warn('Poll error:', err.message);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [genStatus, genTaskId]);

    // Poll for regeneration status inside Edit Modal
    useEffect(() => {
        if (editGenStatus !== 'polling' || !editGenTaskId) return;

        const interval = setInterval(async () => {
            try {
                const res = await api(`/superadmin/templates/generate/status/${editGenTaskId}`);
                setEditGenProgress(res.progress || 0);
                if (res.status === 'COMPLETED') {
                    setEditGenStatus('done');
                    setEditGenProgress(100);
                    setEditGenTaskId(null);
                    fetchData();
                    // Update current modal data with the completed video preview
                    setModal(m => {
                        if (!m.open || !m.data) return m;
                        return {
                            ...m,
                            data: {
                                ...m.data,
                                previewUrl: res.videoUrl,
                                previewVideoUrl: res.videoUrl,
                                previewType: 'video'
                            }
                        };
                    });
                    addToast('Video regenerated successfully!', 'success');
                    clearInterval(interval);
                } else if (res.status === 'FAILED') {
                    setEditGenStatus('error');
                    setEditGenError(res.error || 'Video generation failed');
                    setEditGenTaskId(null);
                    addToast('Video generation failed', 'error');
                    clearInterval(interval);
                }
            } catch (err) {
                console.warn('Poll error:', err.message);
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [editGenStatus, editGenTaskId]);

    // Global poll for any stuck "pending" templates
    useEffect(() => {
        const pendingTemplates = templates.filter(t => t.previewUrl === 'pending' && t.sourceJobId);
        if (pendingTemplates.length === 0) return;

        const interval = setInterval(() => {
            let updated = false;
            Promise.all(pendingTemplates.map(async (t) => {
                try {
                    const res = await api(`/superadmin/templates/generate/status/${t.sourceJobId}`);
                    if (res.status === 'COMPLETED' || res.status === 'FAILED') {
                        updated = true;
                    }
                } catch (e) {
                    console.warn(`Poll error for template ${t._id}:`, e.message);
                }
            })).then(() => {
                if (updated) fetchData();
            });
        }, 5000);

        return () => clearInterval(interval);
    }, [templates]);

    const handleGenerate = async () => {
        if (!genForm.name.trim()) return addToast('Template name is required', 'error');
        if (!genForm.categoryId) return addToast('Category is required', 'error');
        if (!genForm.prompt.trim()) return addToast('Prompt is required', 'error');

        // URL validation
        const hasAvatarUrl = genForm.avatarUrl && genForm.avatarUrl.trim().startsWith('http');
        const validProductUrls = genForm.productImageUrls.filter(u => u && u.trim().startsWith('http'));

        // Check tags vs uploaded images (Removed strict blocking validation)
        const promptText = genForm.prompt || '';
        const hasImage1Tag = promptText.includes('@Image1') || promptText.includes('<<<image_1>>>');
        const hasImage2Tag = promptText.includes('@Image2') || promptText.includes('<<<image_2>>>');

        // Allow generation even if tags are present but images are missing.
        // The backend will strip the tags and generate a generic preview.

        setGenStatus('generating');
        setGenError('');
        setGenProgress(0);
        try {
            const res = await api('/superadmin/templates/generate', {
                method: 'POST',
                body: JSON.stringify({
                    name: genForm.name,
                    categoryId: genForm.categoryId,
                    description: genForm.description,
                    tags: [],
                    studioOrigin: genForm.studioOrigin,
                    studioSection: genForm.studioSection,
                    prompt: genForm.prompt,
                    model: genForm.model,
                    productImageUrls: validProductUrls,
                    avatarUrl: hasAvatarUrl ? genForm.avatarUrl.trim() : '',
                    duration: genForm.duration,
                    format: genForm.format,
                    quality: genForm.quality,
                }),
            });

            if (res.status === 'done') {
                // Image generation — done immediately
                setGenStatus('done');
                setGenResult(res);
                addToast('Template image generated successfully!', 'success');
                fetchData();
            } else if (res.taskId) {
                // Video generation — need to poll
                setGenTaskId(res.taskId);
                setGenStatus('polling');
                addToast('Video generation started — polling for results...', 'success');
            }
        } catch (err) {
            setGenStatus('error');
            setGenError(err.message || 'Generation failed');
            addToast(err.message, 'error');
        }
    };

    const addProductImageUrl = () => {
        const url = genAssetInputs.productUrl.trim();
        if (url && url.startsWith('http')) {
            setGenForm(f => ({ ...f, productImageUrls: [...f.productImageUrls, url] }));
            setGenAssetInputs(a => ({ ...a, productUrl: '' }));
        }
    };

    const removeProductImageUrl = (i) => {
        setGenForm(f => ({ ...f, productImageUrls: f.productImageUrls.filter((_, idx) => idx !== i) }));
    };

    const handleRegenerate = async () => {
        if (!editPrompt.trim()) return addToast('Prompt formula is required to regenerate', 'error');

        setEditGenStatus('generating');
        setEditGenError('');
        setEditGenProgress(0);
        try {
            const res = await api('/superadmin/templates/generate', {
                method: 'POST',
                body: JSON.stringify({
                    templateId: modal.data._id, // Pass existing template ID to update it
                    name: modal.data.name,      // Keep name
                    categoryId: selectedCategory,
                    description: modal.data.description,
                    tags: tags,
                    studioOrigin: selectedStudio || modal.data.studioOrigin,
                    studioSection: selectedSection || modal.data.studioSection,
                    prompt: editPrompt,
                    model: editModel,
                    productImageUrls: editProductImageUrls,
                    avatarUrl: editAvatarUrl,
                    duration: editDuration,
                    format: editFormat,
                }),
            });

            if (res.status === 'done') {
                // Image generation - done immediately
                setEditGenStatus('done');
                // Update modal.data preview url
                setModal(m => {
                    if (!m.open || !m.data) return m;
                    return {
                        ...m,
                        data: {
                            ...m.data,
                            previewUrl: res.previewUrl,
                            previewImageUrl: res.previewUrl,
                            previewType: 'image'
                        }
                    };
                });
                addToast('Template image regenerated successfully!', 'success');
                fetchData();
            } else if (res.taskId) {
                // Video generation - poll
                setEditGenTaskId(res.taskId);
                setEditGenStatus('polling');
                addToast('Video regeneration started — polling for results...', 'success');
            }
        } catch (err) {
            setEditGenStatus('error');
            setEditGenError(err.message || 'Regeneration failed');
            addToast(err.message, 'error');
        }
    };

    const addEditProductImageUrl = () => {
        const url = editAssetInputs.productUrl.trim();
        if (url && url.startsWith('http')) {
            setEditProductImageUrls(urls => [...urls, url]);
            setEditAssetInputs({ productUrl: '' });
        }
    };

    const removeEditProductImageUrl = (i) => {
        setEditProductImageUrls(urls => urls.filter((_, idx) => idx !== i));
    };

    // ── Bulk publish helpers (FIX 8) ──
    const bulkAction = async (action) => {
        if (!selectedIds.size) return;
        setBulkBusy(true);
        const ids = [...selectedIds];
        try {
            if (action === 'publish' || action === 'unpublish') {
                await Promise.all(ids.map(id =>
                    api(`/superadmin/templates/${id}`, { method: 'PUT', body: JSON.stringify({ isPublished: action === 'publish' }) })
                ));
                setTemplates(prev => prev.map(t => ids.includes(t._id) ? { ...t, isPublished: action === 'publish' } : t));
                addToast(`${ids.length} template${ids.length > 1 ? 's' : ''} ${action === 'publish' ? 'published' : 'unpublished'}`, 'success');
            } else if (action === 'deactivate') {
                await Promise.all(ids.map(id =>
                    api(`/superadmin/templates/${id}`, { method: 'PUT', body: JSON.stringify({ isActive: false }) })
                ));
                setTemplates(prev => prev.map(t => ids.includes(t._id) ? { ...t, isActive: false } : t));
                addToast(`${ids.length} template${ids.length > 1 ? 's' : ''} deactivated`, 'success');
            }
            setSelectedIds(new Set());
        } catch (err) { addToast(err.message, 'error'); }
        finally { setBulkBusy(false); }
    };

    // ── Category CRUD (FIX 4) ──
    const saveCategory = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const payload = { name: fd.get('name'), color: fd.get('color'), description: fd.get('description'), sortOrder: Number(fd.get('sortOrder') || 0) };
        setCatSubmitting(true);
        try {
            if (catModal.data?._id) {
                await api(`/superadmin/templates/categories/${catModal.data._id}`, { method: 'PUT', body: JSON.stringify(payload) });
                addToast('Category updated', 'success');
            } else {
                await api('/superadmin/templates/categories', { method: 'POST', body: JSON.stringify(payload) });
                addToast('Category created', 'success');
            }
            setCatModal({ open: false, data: null });
            fetchCategories();
            fetchData(); // refresh template list too (category names)
        } catch (err) { addToast(err.message, 'error'); }
        finally { setCatSubmitting(false); }
    };

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
        setSelectedStudio(template.studioOrigin || '');
        setSelectedCategory(template.categoryId || '');
        setSelectedSection(template.studioSection || 'general');
        setFormErrors({});

        // Initialize regeneration states
        setEditPrompt(template.savedPrompt || template.promptTemplate || '');
        setEditModel(template.generationModel || 'seedance-2.0');
        setEditDuration(template.savedVideoSettings?.duration || 8);
        setEditFormat(template.savedVideoSettings?.format || '9:16');
        setEditAvatarUrl(template.savedAvatarUrl || '');
        setEditProductImageUrls(template.savedProductImageUrls || []);
        setEditGenStatus('idle');
        setEditGenProgress(0);
        setEditGenTaskId(null);
        setEditGenError('');
        setEditAssetInputs({ productUrl: '' });

        setModal({ open: true, data: template });
    };

    const saveTemplate = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);

        // ── Validation ──
        const errors = {};
        if (modal.isNew) {
            const file = fd.get('file');
            if (!file || file.size === 0) errors.file = 'Please select a preview image or video';
            if (!selectedStudio) errors.studioOrigin = 'Please select a studio';
            if (!fd.get('savedPrompt')?.trim()) errors.savedPrompt = 'Prompt formula is required';
        }
        if (!fd.get('name')?.trim()) errors.name = 'Template name is required';
        if (!selectedCategory) errors.categoryId = 'Please select a category';
        if (!fd.get('description')?.trim()) errors.description = 'Description is required';

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }
        setFormErrors({});
        setIsSubmitting(true);
        try {
            if (modal.isNew) {
                setSubmitStatus('Uploading...');
                const uploadFd = new FormData();
                uploadFd.append('file', fd.get('file'));
                uploadFd.append('name', fd.get('name'));
                uploadFd.append('categoryId', selectedCategory);
                uploadFd.append('description', fd.get('description'));
                uploadFd.append('tags', JSON.stringify(tags));
                uploadFd.append('savedPrompt', fd.get('savedPrompt'));
                uploadFd.append('studioOrigin', selectedStudio);
                uploadFd.append('studioSection', selectedSection);
                uploadFd.append('isFeatured', fd.get('isFeatured') === 'on');
                uploadFd.append('showOnHomeScreen', fd.get('showOnHomeScreen') === 'on');
                uploadFd.append('isActive', fd.get('isActive') === 'on');
                uploadFd.append('isPublished', fd.get('isPublished') === 'on');

                // Include AI-analyzed DNA if available
                if (analyzedDna) {
                    uploadFd.append('dna', JSON.stringify(analyzedDna));
                }

                const res = await api('/superadmin/templates/upload', {
                    method: 'POST',
                    body: uploadFd,
                    headers: {} // let fetch set multipart
                });

                // Ensure new template is visible in the table immediately
                const newTemplate = { ...res.template, isActive: res.template.isActive ?? true };
                setTemplates(prev => [newTemplate, ...prev]);
                // Reset filters if they would hide the new template
                if (activeFilter === 'inactive') setActiveFilter('all');
                addToast('Template created and uploaded successfully', 'success');
            } else {
                setSubmitStatus('Saving...');
                const data = {
                    name: fd.get('name'),
                    categoryId: selectedCategory,
                    studioSection: selectedSection,
                    description: fd.get('description'),
                    tags: tags,
                    isFeatured: fd.get('isFeatured') === 'on',
                    showOnHomeScreen: fd.get('showOnHomeScreen') === 'on',
                    isActive: fd.get('isActive') === 'on',
                    isPublished: fd.get('isPublished') === 'on',
                    savedPrompt: editPrompt,
                    promptTemplate: editPrompt,
                    generationModel: editModel,
                    savedAvatarUrl: editAvatarUrl,
                    savedProductImageUrls: editProductImageUrls,
                    savedVideoSettings: {
                        duration: editDuration,
                        format: editFormat,
                        model: editModel
                    },
                    templateAssets: [
                        ...(editAvatarUrl ? [{ role: 'avatar', label: 'Avatar / Model', url: editAvatarUrl, swappable: true }] : []),
                        ...editProductImageUrls.map(url => ({ role: 'product', label: 'Product Image', url, swappable: true }))
                    ]
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
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Template Manager</h1>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Manage and govern platform templates</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    {activeTab === 'categories'
                        ? <button onClick={() => setCatModal({ open: true, data: null })} style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>+ New Category</button>
                        : <>
                            <button onClick={() => { setGenForm({ name: '', categoryId: '', description: '', prompt: '', model: 'seedance-2.0', studioOrigin: 'video', studioSection: 'video_qads', productImageUrls: [], avatarUrl: '', duration: 8, format: '9:16', quality: 'high' }); setGenStatus('idle'); setGenError(''); setGenResult(null); setGenModal(true); }} style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>Generate Template</button>
                            <button onClick={() => { setTags([]); setSelectedStudio(''); setSelectedCategory(''); setSelectedSection('general'); setFormErrors({}); setAutoPrompt(''); setAnalyzedDna(null); setAnalyzingPrompt(false); setModal({ open: true, data: {}, isNew: true }); }} style={{ background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>+ Upload Template</button>
                        </>
                    }
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {[{ id: 'templates', label: 'Templates', count: templates.length }, { id: 'categories', label: 'Categories', count: categories.length }].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: '10px 20px', fontWeight: 700, fontSize: 13, border: 'none', background: 'transparent', color: activeTab === tab.id ? '#f97316' : 'rgba(255,255,255,0.45)', borderBottom: activeTab === tab.id ? '2px solid #f97316' : '2px solid transparent', cursor: 'pointer' }}>
                        {tab.label} ({tab.count})
                    </button>
                ))}
            </div>

            {/* ===== CATEGORIES TAB ===== */}
            {activeTab === 'categories' && (
                <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
                    {catLoading ? <div style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Loading categories…</div> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                    <th style={{ padding: '12px 20px', textAlign: 'left', width: 40 }}>Color</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>Name</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>Slug</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>Sort</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>Active</th>
                                    <th style={{ padding: '12px 20px', textAlign: 'right' }}>Edit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.length === 0 && <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No categories yet.</td></tr>}
                                {categories.map(c => (
                                    <tr key={c._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <td style={{ padding: '12px 20px' }}><div style={{ width: 22, height: 22, borderRadius: 6, background: c.color || '#888' }} /></td>
                                        <td style={{ padding: '12px 20px', fontWeight: 700 }}>{c.name}</td>
                                        <td style={{ padding: '12px 20px' }}><code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 4, fontSize: 11 }}>{c.slug}</code></td>
                                        <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)' }}>{c.sortOrder}</td>
                                        <td style={{ padding: '12px 20px' }}><span style={toggleBtnStyle(c.isActive !== false)}>{c.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                                        <td style={{ padding: '12px 20px', textAlign: 'right' }}><button onClick={() => setCatModal({ open: true, data: c })} style={actionBtnStyle}>Edit</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ===== TEMPLATES TAB ===== */}
            {activeTab === 'templates' && (<>
                {/* Bulk toolbar */}
                {selectedIds.size > 0 && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, padding: '10px 16px', background: 'rgba(232,65,24,0.08)', border: '1px solid rgba(232,65,24,0.2)', borderRadius: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedIds.size} selected</span>
                        <button disabled={bulkBusy} onClick={() => bulkAction('publish')} style={{ ...actionBtnStyle, color: '#E84118', borderColor: 'rgba(232,65,24,0.3)' }}>Publish Selected</button>
                        <button disabled={bulkBusy} onClick={() => bulkAction('unpublish')} style={actionBtnStyle}>Unpublish Selected</button>
                        <button disabled={bulkBusy} onClick={() => bulkAction('deactivate')} style={{ ...actionBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)' }}>Deactivate Selected</button>
                        <button onClick={() => setSelectedIds(new Set())} style={{ ...actionBtnStyle, marginLeft: 'auto' }}>Clear</button>
                    </div>
                )}

                {/* Filter Bar */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', background: '#12121A', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', gap: 6, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 8 }}>
                        {['All', 'Creative', 'Video', 'Content'].map(s => (
                            <button key={s} onClick={() => setStudioFilter(s)} style={{ background: studioFilter === s ? 'rgba(255,255,255,0.15)' : 'transparent', color: studioFilter === s ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
                        ))}
                    </div>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inputStyle, width: 180, padding: '7px 10px' }}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                    </select>
                    <select value={activeFilter} onChange={e => setActiveFilter(e.target.value)} style={{ ...inputStyle, width: 140, padding: '7px 10px' }}>
                        <option value="all">All Status</option>
                        <option value="active">Active Only</option>
                        <option value="inactive">Inactive Only</option>
                    </select>
                    <div style={{ flex: 1 }} />
                    <div style={{ position: 'relative', width: 240 }}>
                        <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: 9, fontSize: 18, color: 'rgba(255,255,255,0.4)' }}>search</span>
                        <input type="text" placeholder="Search templates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ ...inputStyle, paddingLeft: 36, padding: '7px 12px 7px 34px' }} />
                    </div>
                </div>

                {/* Table */}
                <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                                <th style={{ padding: '12px 16px', width: 32 }}>
                                    <input type="checkbox"
                                        onChange={e => setSelectedIds(e.target.checked ? new Set(filteredTemplates.map(t => t._id)) : new Set())}
                                        checked={selectedIds.size === filteredTemplates.length && filteredTemplates.length > 0}
                                    />
                                </th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: 80 }}>Preview</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Name</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Category</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Section</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#10B981' }}>Homescreen</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Active</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#E84118' }}>Published</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Usage</th>
                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTemplates.length === 0 ? (
                                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No templates found.</td></tr>
                            ) : filteredTemplates.map(t => {
                                const catName = categories.find(c => c._id === t.categoryId)?.name || 'Uncategorized';
                                const isDeleting = deletingId === t._id;
                                const isSelected = selectedIds.has(t._id);
                                const previewSrc = t.previewUrl || t.previewImageUrl;
                                return (
                                    <tr key={t._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isSelected ? 'rgba(232,65,24,0.04)' : 'transparent' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <input type="checkbox" checked={isSelected} onChange={e => {
                                                const s = new Set(selectedIds);
                                                e.target.checked ? s.add(t._id) : s.delete(t._id);
                                                setSelectedIds(s);
                                            }} />
                                        </td>
                                        {/* Preview with hover popup + click-to-lightbox */}
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ position: 'relative', width: 56, height: 56 }}
                                                onMouseEnter={e => { const p = e.currentTarget.querySelector('.tmpl-pop'); if (p) p.style.display = 'block'; }}
                                                onMouseLeave={e => { const p = e.currentTarget.querySelector('.tmpl-pop'); if (p) p.style.display = 'none'; }}>
                                                {previewSrc === 'pending' ? (
                                                    <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(124,58,237,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined spin" style={{ fontSize: 20, color: '#7C3AED', animation: 'spin 1s linear infinite' }}>progress_activity</span></div>
                                                ) : previewSrc === 'failed' ? (
                                                    <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ef4444' }}>error</span></div>
                                                ) : previewSrc ? (
                                                    <div
                                                        onClick={() => setPreviewModal({ open: true, src: t.previewType === 'video' ? (t.previewVideoUrl || previewSrc) : previewSrc, type: t.previewType === 'video' ? 'video' : 'image', name: t.name })}
                                                        style={{ cursor: 'pointer', position: 'relative', width: 56, height: 56 }}
                                                        title="Click to preview">
                                                        {t.previewType === 'video' ? (
                                                            <video src={t.previewVideoUrl || previewSrc} muted autoPlay loop playsInline style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                                                        ) : (
                                                            <img src={previewSrc} style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover', display: 'block' }} alt="" />
                                                        )}
                                                        <div style={{ position: 'absolute', inset: 0, borderRadius: 8, background: 'rgba(0,0,0,0)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.querySelector('.zoom-icon').style.opacity = '1'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0)'; e.currentTarget.querySelector('.zoom-icon').style.opacity = '0'; }}>
                                                            <span className="material-symbols-outlined zoom-icon" style={{ fontSize: 22, color: '#fff', opacity: 0, transition: 'opacity 0.2s' }}>zoom_in</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 20, color: 'rgba(255,255,255,0.2)' }}>image</span></div>
                                                )}
                                                {previewSrc && previewSrc !== 'pending' && previewSrc !== 'failed' && (
                                                    <div className="tmpl-pop" style={{ display: 'none', position: 'absolute', top: 0, left: 64, width: 200, height: 260, zIndex: 50, borderRadius: 10, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                                        {t.previewType === 'video' ? (
                                                            <video src={t.previewVideoUrl || previewSrc} muted autoPlay loop playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        ) : (
                                                            <img src={previewSrc} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{t.name}</td>
                                        <td style={{ padding: '12px 16px' }}><span style={{ background: 'rgba(255,255,255,0.05)', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{catName}</span></td>
                                        <td style={{ padding: '12px 16px' }}><code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{t.studioSection || 'general'}</code></td>
                                        {/* Homescreen toggle (green) */}
                                        <td style={{ padding: '12px 16px' }}><button onClick={() => toggleField(t, 'showOnHomeScreen')} style={toggleBtnStyle(t.showOnHomeScreen, '#10B981')}>{t.showOnHomeScreen ? 'Shown' : 'Hidden'}</button></td>
                                        {/* Active toggle (green) */}
                                        <td style={{ padding: '12px 16px' }}><button onClick={() => toggleField(t, 'isActive')} style={toggleBtnStyle(t.isActive)}>{t.isActive ? 'Active' : 'Inactive'}</button></td>
                                        {/* Publish toggle (orange — FIX 7) */}
                                        <td style={{ padding: '12px 16px' }}><button onClick={() => toggleField(t, 'isPublished')} style={toggleBtnStyle(t.isPublished, '#E84118')}>{t.isPublished ? 'Published' : 'Draft'}</button></td>
                                        <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{t.usageCount || 0}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            {isDeleting ? (
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{(t.usageCount || 0) > 0 ? 'Deactivate?' : 'Permanent?'}</span>
                                                    <button onClick={cancelDelete} style={actionBtnStyle}>Cancel</button>
                                                    <button onClick={() => confirmDelete(t)} style={{ ...actionBtnStyle, color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}>Confirm</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
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
            </>)}

            {/* ===== TEMPLATE EDIT MODAL ===== */}
            {modal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal({ open: false, data: null })}>
                    <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 640, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{modal.isNew ? 'Upload New Template' : 'Edit Template'}</h2>
                            <button type="button" onClick={() => setModal({ open: false, data: null })} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={saveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* ── Validation errors summary ── */}
                            {Object.keys(formErrors).length > 0 && (
                                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ef4444', marginTop: 1 }}>error</span>
                                    <div style={{ fontSize: 12, color: '#ef4444', lineHeight: 1.6 }}>
                                        {Object.values(formErrors).map((msg, i) => <div key={i}>• {msg}</div>)}
                                    </div>
                                </div>
                            )}

                            {!modal.isNew && (
                                <div style={{ display: 'flex', gap: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 14, alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <span style={labelStyle}>Current Preview</span>
                                        <div style={{ width: '100%', height: 120, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6, position: 'relative' }}>
                                            {editGenStatus === 'polling' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#7C3AED' }}>
                                                    <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                                    <span style={{ fontSize: 11, fontWeight: 'bold' }}>Generating {editGenProgress}%</span>
                                                </div>
                                            ) : editGenStatus === 'generating' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#7C3AED' }}>
                                                    <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                                    <span style={{ fontSize: 11, fontWeight: 'bold' }}>Submitting...</span>
                                                </div>
                                            ) : modal.data?.previewUrl === 'pending' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)' }}>
                                                    <span className="material-symbols-outlined" style={{ animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                                    <span style={{ fontSize: 11 }}>Generating video...</span>
                                                </div>
                                            ) : modal.data?.previewType === 'video' || modal.data?.previewUrl?.endsWith('.mp4') ? (
                                                <video src={modal.data.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} controls />
                                            ) : modal.data?.previewUrl ? (
                                                <img src={modal.data.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Preview" />
                                            ) : (
                                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>No preview available</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <span style={labelStyle}>Design Studio Origin</span>
                                        <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                            {selectedStudio?.toUpperCase() || modal.data?.studioOrigin?.toUpperCase() || 'CREATIVE'} - {selectedSection || modal.data?.studioSection || 'General'}
                                        </div>
                                        <span style={{ ...labelStyle, marginTop: 4 }}>Model used</span>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>
                                            {editModel || modal.data?.generationModel || 'gpt-image-2'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {modal.isNew && (
                                <div style={{ display: 'flex', gap: 14 }}>
                                    <label style={{ ...labelStyle, flex: 2 }}>Preview Media
                                        <input type="file" name="file" accept="image/*,video/*" style={{ ...inputStyle, padding: '7px 10px', marginTop: 6, borderColor: formErrors.file ? 'rgba(239,68,68,0.5)' : undefined }}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file || !file.type.startsWith('image/')) return;

                                                // Reset any previous analysis
                                                setAnalyzingPrompt(true);
                                                setAnalyzedDna(null);
                                                setAutoPrompt('');

                                                // Upload to S3 first via a temporary upload
                                                try {
                                                    const uploadFd = new FormData();
                                                    uploadFd.append('file', file);
                                                    uploadFd.append('folder', 'template-references');
                                                    const uploadRes = await api('/media/image-reference', {
                                                        method: 'POST',
                                                        body: uploadFd,
                                                        headers: {},
                                                    });
                                                    const s3Url = uploadRes?.url || uploadRes?.s3Url || uploadRes?.imageUrl;
                                                    if (!s3Url) throw new Error('No URL returned');

                                                    // Now trigger AI analysis
                                                    addToast('✨ Analyzing template design...', 'info');
                                                    const analysisRes = await api('/superadmin/templates/analyze-image', {
                                                        method: 'POST',
                                                        body: JSON.stringify({ imageUrl: s3Url }),
                                                    });
                                                    if (analysisRes?.success && analysisRes.promptFormula) {
                                                        setAutoPrompt(analysisRes.promptFormula);
                                                        setAnalyzedDna(analysisRes.dna || null);
                                                        addToast('✨ AI prompt generated successfully!', 'success');
                                                    } else {
                                                        addToast('Analysis completed but no prompt generated. Please write manually.', 'warning');
                                                    }
                                                } catch (err) {
                                                    console.error('Auto-analyze failed:', err);
                                                    addToast('AI analysis failed — you can write the prompt manually.', 'warning');
                                                } finally {
                                                    setAnalyzingPrompt(false);
                                                }
                                            }}
                                        />
                                    </label>
                                    <label style={{ ...labelStyle, flex: 1 }}>Studio Origin *
                                        <select
                                            name="studioOrigin"
                                            value={selectedStudio}
                                            onChange={e => { setSelectedStudio(e.target.value); setSelectedCategory(''); setSelectedSection('general'); }}
                                            style={{ ...inputStyle, marginTop: 6, borderColor: formErrors.studioOrigin ? 'rgba(239,68,68,0.5)' : undefined }}
                                        >
                                            <option value="">Select Studio</option>
                                            <option value="creative">Creative</option>
                                            <option value="video">Video</option>
                                            <option value="content">Content</option>
                                        </select>
                                    </label>
                                </div>
                            )}
                            <div style={{ display: 'flex', gap: 14 }}>
                                <label style={{ ...labelStyle, flex: 2 }}>Name *
                                    <input name="name" defaultValue={modal.data?.name} style={{ ...inputStyle, marginTop: 6, borderColor: formErrors.name ? 'rgba(239,68,68,0.5)' : undefined }} />
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>Category *
                                    {!selectedStudio && modal.isNew ? (
                                        <select disabled style={{ ...inputStyle, marginTop: 6, opacity: 0.4, cursor: 'not-allowed' }}>
                                            <option>Select studio first</option>
                                        </select>
                                    ) : (
                                        <select
                                            name="categoryId"
                                            value={selectedCategory}
                                            onChange={e => setSelectedCategory(e.target.value)}
                                            style={{ ...inputStyle, marginTop: 6, borderColor: formErrors.categoryId ? 'rgba(239,68,68,0.5)' : undefined }}
                                        >
                                            <option value="">Select Category</option>
                                            {categories.filter(c => c.isActive !== false).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                        </select>
                                    )}
                                </label>
                            </div>
                            {/* Studio Section — filtered by selected studio */}
                            <label style={labelStyle}>Studio Section
                                {!selectedStudio && modal.isNew ? (
                                    <select disabled style={{ ...inputStyle, marginTop: 6, opacity: 0.4, cursor: 'not-allowed' }}>
                                        <option>Select studio first</option>
                                    </select>
                                ) : (
                                    <select
                                        name="studioSection"
                                        value={selectedSection}
                                        onChange={e => setSelectedSection(e.target.value)}
                                        style={{ ...inputStyle, marginTop: 6 }}
                                    >
                                        {(selectedStudio ? filteredSections : STUDIO_SECTIONS).map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                )}
                            </label>
                            <label style={labelStyle}>Description *
                                <textarea name="description" defaultValue={modal.data?.description} rows={2} style={{ ...inputStyle, resize: 'vertical', marginTop: 6, borderColor: formErrors.description ? 'rgba(239,68,68,0.5)' : undefined }} />
                            </label>
                            <label style={labelStyle}>Tags
                                <TagInput tags={tags} setTags={setTags} />
                            </label>
                            <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginTop: 4 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><input type="checkbox" name="isFeatured" defaultChecked={modal.data?.isFeatured ?? false} /> Featured</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><input type="checkbox" name="showOnHomeScreen" defaultChecked={modal.data?.showOnHomeScreen ?? false} /> Show on Homescreen</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><input type="checkbox" name="isActive" defaultChecked={modal.data?.isActive ?? true} /> Active</label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}><input type="checkbox" name="isPublished" defaultChecked={modal.data?.isPublished ?? false} /> Published</label>
                            </div>
                            <div style={{ margin: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                            <div>
                                {modal.isNew ? (
                                    <label style={labelStyle}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            Prompt Formula *
                                            {analyzingPrompt && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f97316', fontWeight: 600 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                                    AI is analyzing the design...
                                                </span>
                                            )}
                                            {!analyzingPrompt && autoPrompt && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
                                                    AI-generated
                                                </span>
                                            )}
                                        </div>
                                        <textarea
                                            name="savedPrompt"
                                            rows={6}
                                            value={autoPrompt}
                                            onChange={e => setAutoPrompt(e.target.value)}
                                            disabled={analyzingPrompt}
                                            style={{
                                                ...inputStyle,
                                                resize: 'vertical',
                                                fontFamily: 'monospace',
                                                fontSize: 12,
                                                lineHeight: 1.5,
                                                marginTop: 6,
                                                borderColor: formErrors.savedPrompt ? 'rgba(239,68,68,0.5)' : analyzingPrompt ? 'rgba(249,115,22,0.4)' : autoPrompt ? 'rgba(16,185,129,0.4)' : undefined,
                                                opacity: analyzingPrompt ? 0.6 : 1,
                                            }}
                                            placeholder={analyzingPrompt ? '✨ Analyzing template design — writing prompt formula...' : 'Enter the exact prompt to use when generating from this template...'}
                                        />
                                    </label>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16 }}>
                                        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#7C3AED', letterSpacing: 0.5, marginBottom: 4 }}>AI Generation Parameters</div>

                                        {/* AI Model & Sections */}
                                        <div style={{ display: 'flex', gap: 14 }}>
                                            <label style={{ ...labelStyle, flex: 1 }}>AI Model
                                                <select value={editModel} onChange={e => setEditModel(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
                                                    <optgroup label="Video Models">
                                                        {VIDEO_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                    </optgroup>
                                                    <optgroup label="Image Models">
                                                        {IMAGE_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                    </optgroup>
                                                </select>
                                            </label>

                                            {/* Video specific controls */}
                                            {isVideoModel(editModel) && (
                                                <>
                                                    <label style={{ ...labelStyle, flex: 1 }}>Duration (sec)
                                                        <input type="number" min={3} max={15} value={editDuration} onChange={e => setEditDuration(parseInt(e.target.value) || 8)} style={{ ...inputStyle, marginTop: 6 }} />
                                                    </label>
                                                    <label style={{ ...labelStyle, flex: 1 }}>Format
                                                        <select value={editFormat} onChange={e => setEditFormat(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}>
                                                            <option value="9:16">9:16 (Vertical)</option>
                                                            <option value="16:9">16:9 (Landscape)</option>
                                                            <option value="1:1">1:1 (Square)</option>
                                                        </select>
                                                    </label>
                                                </>
                                            )}
                                        </div>

                                        {/* Prompt Formula */}
                                        <label style={labelStyle}>Prompt Formula *
                                            <textarea
                                                value={editPrompt}
                                                onChange={e => setEditPrompt(e.target.value)}
                                                rows={4}
                                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, marginTop: 6 }}
                                                placeholder="Describe design style. Use @Image1 for avatar, @Image2 for product..."
                                            />
                                        </label>

                                        {/* Assets section */}
                                        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, background: 'rgba(0,0,0,0.1)' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Reference Assets</div>
                                            
                                            {/* Avatar upload */}
                                            <label style={{ ...labelStyle, marginBottom: 10 }}>Avatar / Model Image (@Image1)
                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                    <input value={editAvatarUrl} onChange={e => setEditAvatarUrl(e.target.value)} style={{ ...inputStyle, flex: 1 }} placeholder="https://... avatar image URL" />
                                                    <label style={{ ...actionBtnStyle, color: '#7C3AED', borderColor: 'rgba(124,58,237,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span> Upload
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'avatar', true)} />
                                                    </label>
                                                </div>
                                                {editAvatarUrl && (
                                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: 11 }}>
                                                            <img src={editAvatarUrl} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="" />
                                                            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)' }}>{editAvatarUrl.split('/').pop()}</span>
                                                            <button type="button" onClick={() => setEditAvatarUrl('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                                                        </div>
                                                    </div>
                                                )}
                                            </label>

                                            {/* Product images list */}
                                            <label style={labelStyle}>Product Images (@Image2, @Image3...)
                                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                    <input value={editAssetInputs.productUrl} onChange={e => setEditAssetInputs({ productUrl: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditProductImageUrl(); } }} style={{ ...inputStyle, flex: 1 }} placeholder="https://... product image URL" />
                                                    <button type="button" onClick={addEditProductImageUrl} style={{ ...actionBtnStyle, color: '#7C3AED', borderColor: 'rgba(124,58,237,0.3)' }}>Add URL</button>
                                                    <label style={{ ...actionBtnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span> Upload
                                                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'product', true)} />
                                                    </label>
                                                </div>
                                            </label>
                                            {editProductImageUrls.length > 0 && (
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                                    {editProductImageUrls.map((url, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: 11 }}>
                                                            <img src={url} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="" />
                                                            <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)' }}>{url.split('/').pop()}</span>
                                                            <button type="button" onClick={() => removeEditProductImageUrl(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Regenerate Trigger Button inside Parameters */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                                            <button
                                                type="button"
                                                onClick={handleRegenerate}
                                                disabled={editGenStatus === 'generating' || editGenStatus === 'polling'}
                                                style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
                                            >
                                                {editGenStatus === 'generating' ? <><span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>progress_activity</span>Submitting...</> :
                                                 editGenStatus === 'polling' ? <><span className="material-symbols-outlined" style={{ fontSize: 14, animation: 'spin 1s linear infinite' }}>progress_activity</span>Regenerating {editGenProgress}%...</> :
                                                 editGenStatus === 'done' ? <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>Regenerate Again</> :
                                                 <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>Regenerate Media</>}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <button type="submit" disabled={isSubmitting || editGenStatus === 'generating' || editGenStatus === 'polling'} style={{ background: isSubmitting || editGenStatus === 'generating' || editGenStatus === 'polling' ? 'rgba(249,115,22,0.5)' : '#f97316', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isSubmitting ? <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>{submitStatus}</> : (modal.isNew ? 'Upload & Create' : 'Save Template')}
                                </button>
                                <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== CATEGORY MODAL (FIX 4) ===== */}
            {catModal.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => setCatModal({ open: false, data: null })}>
                    <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 480, padding: 24 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{catModal.data?._id ? 'Edit Category' : 'New Category'}</h2>
                            <button type="button" onClick={() => setCatModal({ open: false, data: null })} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <form onSubmit={saveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <label style={labelStyle}>Name
                                <input name="name" defaultValue={catModal.data?.name} required style={{ ...inputStyle, marginTop: 6 }} />
                            </label>
                            <label style={labelStyle}>Color
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
                                    <input type="color" name="color" defaultValue={catModal.data?.color || '#888888'} style={{ width: 44, height: 36, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                                    <span style={{ ...inputStyle, flex: 1, fontSize: 12, fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}>{catModal.data?.color || '#888888'}</span>
                                </div>
                            </label>
                            <label style={labelStyle}>Description
                                <textarea name="description" defaultValue={catModal.data?.description} rows={2} style={{ ...inputStyle, resize: 'vertical', marginTop: 6 }} />
                            </label>
                            <label style={labelStyle}>Sort Order
                                <input type="number" name="sortOrder" defaultValue={catModal.data?.sortOrder ?? 0} style={{ ...inputStyle, marginTop: 6, width: 100 }} />
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button type="submit" disabled={catSubmitting} style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' }}>{catSubmitting ? 'Saving…' : 'Save Category'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ===== GENERATE TEMPLATE MODAL ===== */}
            {genModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }} onClick={() => { if (genStatus === 'idle' || genStatus === 'done' || genStatus === 'error') setGenModal(false); }}>
                    <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: 680, padding: 24, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ color: '#7C3AED' }}>auto_awesome</span>
                                Generate Template via AI
                            </h2>
                            <button type="button" onClick={() => setGenModal(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
                        </div>

                        {/* Status banner */}
                        {genStatus === 'polling' && (
                            <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#7C3AED', animation: 'spin 1s linear infinite' }}>progress_activity</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Generating video… {genProgress}%</div>
                                    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginTop: 4 }}>
                                        <div style={{ width: `${genProgress}%`, height: '100%', background: '#7C3AED', borderRadius: 2, transition: 'width 0.3s ease' }} />
                                    </div>
                                </div>
                            </div>
                        )}
                        {genStatus === 'done' && (
                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#10b981' }}>check_circle</span>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>Generation complete! Template saved as draft.</span>
                            </div>
                        )}
                        {genStatus === 'error' && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>Generation failed: {genError}</div>
                            </div>
                        )}

                        {/* Form */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', gap: 14 }}>
                                <label style={{ ...labelStyle, flex: 2 }}>Template Name *
                                    <input value={genForm.name} onChange={e => setGenForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, marginTop: 6 }} placeholder="e.g., Luxury Watch Showcase" />
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>Category *
                                    <select value={genForm.categoryId} onChange={e => {
                                        const cId = e.target.value;
                                        const c = categories.find(cat => cat._id === cId);
                                        const cName = c ? c.name.toLowerCase() : '';
                                        const isVidCat = cName.includes('video') || cName.includes('animation') || cName.includes('ugc');
                                        const isImgCat = cName.includes('image') || cName.includes('photo') || cName.includes('carousel') || cName.includes('campaign') || cName.includes('logo') || cName.includes('creative');
                                        
                                        setGenForm(f => {
                                            let newF = { ...f, categoryId: cId };
                                            // Auto-switch model and section if category explicitly restricts it
                                            if (isVidCat && !isVideoModel(newF.model)) {
                                                newF.model = VIDEO_MODELS[0].value;
                                                newF.studioOrigin = 'video';
                                                newF.studioSection = 'video_qads';
                                            } else if (isImgCat && isVideoModel(newF.model)) {
                                                newF.model = IMAGE_MODELS[0].value;
                                                newF.studioOrigin = 'creative';
                                                newF.studioSection = 'ai_create';
                                            }
                                            return newF;
                                        });
                                    }} style={{ ...inputStyle, marginTop: 6 }}>
                                        <option value="">Select Category</option>
                                        {categories.filter(c => c.isActive !== false).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div style={{ display: 'flex', gap: 14 }}>
                                <label style={{ ...labelStyle, flex: 1 }}>AI Model *
                                    <select value={genForm.model} onChange={e => {
                                        const m = e.target.value;
                                        const isVid = isVideoModel(m);
                                        setGenForm(f => ({ ...f, model: m, studioOrigin: isVid ? 'video' : 'creative', studioSection: isVid ? 'video_qads' : 'ai_create' }));
                                    }} style={{ ...inputStyle, marginTop: 6 }}>
                                        {(() => {
                                            const c = categories.find(cat => cat._id === genForm.categoryId);
                                            const cName = c ? c.name.toLowerCase() : '';
                                            const isVidCat = cName.includes('video') || cName.includes('animation') || cName.includes('ugc');
                                            const isImgCat = cName.includes('image') || cName.includes('photo') || cName.includes('carousel') || cName.includes('campaign') || cName.includes('logo') || cName.includes('creative');
                                            
                                            return (
                                                <>
                                                    {(!isImgCat) && (
                                                        <optgroup label="Video Models">
                                                            {VIDEO_MODELS.map(m => {
                                                                const s = modelStatuses[m.value];
                                                                const label = s && s.status !== 'healthy'
                                                                    ? `${m.label} (${s.status === 'overloaded' ? '⚡ Heavy Load' : '⏳ Busy'})`
                                                                    : m.label;
                                                                return <option key={m.value} value={m.value}>{label}</option>
                                                            })}
                                                        </optgroup>
                                                    )}
                                                    {(!isVidCat) && (
                                                        <optgroup label="Image Models">
                                                            {IMAGE_MODELS.map(m => {
                                                                const s = modelStatuses[m.value];
                                                                const label = s && s.status !== 'healthy'
                                                                    ? `${m.label} (${s.status === 'overloaded' ? '⚡ Heavy Load' : '⏳ Busy'})`
                                                                    : m.label;
                                                                return <option key={m.value} value={m.value}>{label}</option>
                                                            })}
                                                        </optgroup>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </select>
                                </label>
                                <label style={{ ...labelStyle, flex: 1 }}>Studio Section
                                    <select value={genForm.studioSection} onChange={e => setGenForm(f => ({ ...f, studioSection: e.target.value }))} style={{ ...inputStyle, marginTop: 6 }}>
                                        {STUDIO_SECTIONS.filter(s => (SECTIONS_BY_STUDIO[genForm.studioOrigin] || []).includes(s.value)).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </label>
                            </div>

                            {/* Video-only settings */}
                            {isVideoModel(genForm.model) && (
                                <div style={{ display: 'flex', gap: 14 }}>
                                    <label style={{ ...labelStyle, flex: 1 }}>Duration (sec)
                                        <input type="number" min={3} max={15} value={genForm.duration} onChange={e => setGenForm(f => ({ ...f, duration: parseInt(e.target.value) || 8 }))} style={{ ...inputStyle, marginTop: 6 }} />
                                    </label>
                                    <label style={{ ...labelStyle, flex: 1 }}>Format
                                        <select value={genForm.format} onChange={e => setGenForm(f => ({ ...f, format: e.target.value }))} style={{ ...inputStyle, marginTop: 6 }}>
                                            <option value="9:16">9:16 (Vertical)</option>
                                            <option value="16:9">16:9 (Landscape)</option>
                                            <option value="1:1">1:1 (Square)</option>
                                        </select>
                                    </label>
                                </div>
                            )}

                            <label style={{ ...labelStyle, position: 'relative' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Prompt *</span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" onClick={() => setGenForm(f => ({ ...f, prompt: f.prompt + (f.prompt.endsWith(' ') ? '' : ' ') + '@Image1' }))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>+ @Image1 (Avatar)</button>
                                        <button type="button" onClick={() => setGenForm(f => ({ ...f, prompt: f.prompt + (f.prompt.endsWith(' ') ? '' : ' ') + '@Image2' }))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}>+ @Image2 (Product)</button>
                                    </div>
                                </div>
                                <textarea 
                                    value={genForm.prompt} 
                                    onChange={e => {
                                        const val = e.target.value;
                                        setGenForm(f => ({ ...f, prompt: val }));
                                        const cursor = e.target.selectionStart;
                                        const textBeforeCursor = val.slice(0, cursor);
                                        const match = textBeforeCursor.match(/@(\w*)$/);
                                        if (match) {
                                            setMentionMenu({ visible: true, query: match[1].toLowerCase(), cursor });
                                        } else {
                                            setMentionMenu({ visible: false, query: '', cursor: 0 });
                                        }
                                    }} 
                                    rows={5} 
                                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, marginTop: 6 }} 
                                    placeholder="Describe the video/image to generate. Use @Image1 for avatar, @Image2 for product..." 
                                />
                                {mentionMenu.visible && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        width: 250,
                                        background: '#1e293b',
                                        border: '1px solid #334155',
                                        borderRadius: 8,
                                        padding: 6,
                                        zIndex: 50,
                                        marginTop: 4,
                                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2
                                    }}>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', padding: '4px 8px', textTransform: 'uppercase', fontWeight: 'bold' }}>Select Tag to Insert</div>
                                        {[
                                            ...(genForm.avatarUrl ? [{ id: 'Image1', label: 'Avatar / Model' }] : []),
                                            ...genForm.productImageUrls.map((_, i) => ({ id: `Image${i + 2}`, label: `Product Image ${i + 1}` }))
                                        ].filter(tag => tag.id.toLowerCase().includes(mentionMenu.query) || tag.label.toLowerCase().includes(mentionMenu.query)).length > 0 ? [
                                            ...(genForm.avatarUrl ? [{ id: 'Image1', label: 'Avatar / Model' }] : []),
                                            ...genForm.productImageUrls.map((_, i) => ({ id: `Image${i + 2}`, label: `Product Image ${i + 1}` }))
                                        ].filter(tag => tag.id.toLowerCase().includes(mentionMenu.query) || tag.label.toLowerCase().includes(mentionMenu.query)).map(tag => (
                                            <div 
                                                key={tag.id}
                                                onClick={() => {
                                                    const val = genForm.prompt;
                                                    const textBeforeCursor = val.slice(0, mentionMenu.cursor);
                                                    const textAfterCursor = val.slice(mentionMenu.cursor);
                                                    const match = textBeforeCursor.match(/@(\w*)$/);
                                                    if (match) {
                                                        const newVal = textBeforeCursor.slice(0, match.index) + '@' + tag.id + ' ' + textAfterCursor;
                                                        setGenForm(f => ({ ...f, prompt: newVal }));
                                                    }
                                                    setMentionMenu({ visible: false, query: '', cursor: 0 });
                                                }}
                                                style={{
                                                    padding: '6px 8px',
                                                    fontSize: 12,
                                                    cursor: 'pointer',
                                                    color: '#fff',
                                                    borderRadius: 4,
                                                    display: 'flex',
                                                    justifyContent: 'space-between'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <span style={{ color: '#a78bfa', fontWeight: 'bold' }}>@{tag.id}</span>
                                                <span style={{ color: 'rgba(255,255,255,0.6)' }}>{tag.label}</span>
                                            </div>
                                        )) : (
                                            <div style={{ padding: '6px 8px', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                                Upload images first to tag them!
                                            </div>
                                        )}
                                    </div>
                                )}
                            </label>

                            <label style={labelStyle}>Description
                                <input value={genForm.description} onChange={e => setGenForm(f => ({ ...f, description: e.target.value }))} style={{ ...inputStyle, marginTop: 6 }} placeholder="Brief description for users" />
                            </label>

                            {/* Asset URLs */}
                            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }}>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 10, letterSpacing: 0.5 }}>Template Assets (Swappable by Users)</div>

                                <label style={{ ...labelStyle, marginBottom: 10 }}>Avatar / Model Image (@Image1)
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <input value={genForm.avatarUrl} onChange={e => setGenForm(f => ({ ...f, avatarUrl: e.target.value }))} style={{ ...inputStyle, flex: 1 }} placeholder="https://... avatar image URL" />
                                        <label style={{ ...actionBtnStyle, color: '#7C3AED', borderColor: 'rgba(124,58,237,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span> Upload
                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'avatar')} />
                                        </label>
                                    </div>
                                    {genForm.avatarUrl && (
                                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: 11 }}>
                                                <img src={genForm.avatarUrl} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="Avatar" />
                                                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)' }}>{genForm.avatarUrl.split('/').pop()}</span>
                                                <button type="button" onClick={() => setGenForm(f => ({ ...f, avatarUrl: '' }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                                            </div>
                                        </div>
                                    )}
                                </label>

                                <label style={labelStyle}>Product Images (@Image2, @Image3...)
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                        <input value={genAssetInputs.productUrl} onChange={e => setGenAssetInputs(a => ({ ...a, productUrl: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProductImageUrl(); } }} style={{ ...inputStyle, flex: 1 }} placeholder="https://... product image URL" />
                                        <button type="button" onClick={addProductImageUrl} style={{ ...actionBtnStyle, color: '#7C3AED', borderColor: 'rgba(124,58,237,0.3)' }}>Add URL</button>
                                        <label style={{ ...actionBtnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload</span> Upload
                                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'product')} />
                                        </label>
                                    </div>
                                </label>
                                {genForm.productImageUrls.length > 0 && (
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                                        {genForm.productImageUrls.map((url, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 6, fontSize: 11 }}>
                                                <img src={url} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} alt="" />
                                                <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.6)' }}>{url.split('/').pop()}</span>
                                                <button type="button" onClick={() => removeProductImageUrl(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Generate Button */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)', gap: 10 }}>
                                {genStatus === 'done' && <button type="button" onClick={() => setGenModal(false)} style={{ ...actionBtnStyle, color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>Close</button>}
                                <button type="button" onClick={handleGenerate} disabled={genStatus === 'generating' || genStatus === 'polling'} style={{ background: genStatus === 'generating' || genStatus === 'polling' ? 'rgba(124,58,237,0.5)' : '#7C3AED', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {genStatus === 'generating' ? <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>Submitting...</> :
                                     genStatus === 'polling' ? <><span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>progress_activity</span>Generating {genProgress}%...</> :
                                     genStatus === 'done' ? <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>Regenerate</> :
                                     <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>Generate</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ===== IMAGE/VIDEO PREVIEW LIGHTBOX ===== */}
            {previewModal.open && (
                <div
                    onClick={() => setPreviewModal({ open: false, src: '', type: 'image', name: '' })}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 2000, cursor: 'zoom-out',
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
                            cursor: 'pointer', zIndex: 2001,
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
    padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, cursor: 'pointer'
});

export default TemplateManager;

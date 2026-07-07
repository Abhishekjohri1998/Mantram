import { useState, useRef, useCallback, useEffect } from 'react';
import './Storyboard.css';
import AvatarPicker from './AvatarPicker';
import { products, API_BASE } from '../../services/api';
import VideoHoverActions from './VideoHoverActions';

// --- Internal Component to prevent massive re-renders on keystroke ---
const DebouncedInput = ({ value, onChange, placeholder, className, disabled, style }) => {
    const [local, setLocal] = useState(value || '');
    useEffect(() => { setLocal(value || '') }, [value]);
    return (
        <input 
            type="text" 
            className={className}
            style={style}
            placeholder={placeholder}
            value={local}
            onChange={e => setLocal(e.target.value)}
            onBlur={() => { if (local !== value) onChange(local) }}
            onKeyDown={e => { if (e.key === 'Enter' && local !== value) onChange(local) }}
            disabled={disabled}
        />
    )
}

const API = `${API_BASE}/video-studio`;

/**
 * Safe JSON parser — returns a clean error when the backend is unreachable
 * and the CDN/Nginx serves the SPA index.html (<!DOCTYPE html>) instead of JSON.
 */
async function safeJson(res) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        const text = (await res.text()).substring(0, 200);
        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            throw new Error('Backend unreachable — the server may be restarting. Please try again in a moment.');
        }
        throw new Error(`Server returned non-JSON response (${res.status})`);
    }
    return res.json();
}

const STYLES = [
    { id: 'hyperrealistic', label: 'Hyperrealistic', icon: 'camera', desc: 'Photorealistic DSLR commercial' },
    { id: '3d', label: '3D Animated', icon: 'deployed_code', desc: 'Pixar/Unreal Engine style' },
    { id: '2d', label: '2D Illustrated', icon: 'brush', desc: 'Flat design / anime style' },
];

const FORMATS = [
    { value: '9:16', label: '9:16 Vertical' },
    { value: '16:9', label: '16:9 Widescreen' },
    { value: '1:1', label: '1:1 Square' },
    { value: '4:3', label: '4:3 Classic' }
];

// Duration slider: 5s to 120s in 5s steps
const MIN_DURATION = 5;
const MAX_DURATION = 120;
const DURATION_STEP = 5;

function getDurationLabel(d) {
    if (d <= 15) return 'Short';
    if (d <= 30) return 'Standard';
    if (d <= 90) return 'Long-Form';
    return 'Epic';
}

const MODELS = [
    { value: 'seedance-2.0-fast', label: 'Seedance Fast' },
    { value: 'seedance-2.0', label: 'Seedance 2.0' },
    { value: 'seedance-2.0-mini', label: 'Seedance 2.0 Mini' },
    { value: 'kling-3.0', label: 'Kling 3.0' },
    { value: 'veo-3.1-lite', label: 'Veo 3.1 Lite' },
    { value: 'gemini-flash', label: 'Gemini Flash Video' }
];

const RESOLUTIONS = [
    { value: '480p', label: '480p SD' },
    { value: '720p', label: '720p HD' },
    { value: '1080p', label: '1080p FHD' },
    { value: '2k', label: '2K QHD' },
    { value: '4k', label: '4K UHD' }
];

const DIRECTOR_MODELS = [
    { value: 'claude', label: 'Claude Director' },
    { value: 'gemini', label: 'Gemini Director' }
];

const IMAGE_MODELS = [
    { value: 'gpt-image-2', label: 'GPT Image 2' },
    { value: 'nanobanana-2', label: 'NanoBanana 2' }
];

const LANGUAGES = [
    { value: 'English', label: 'English' },
    { value: 'Hindi', label: 'Hindi (हिंदी)' },
    { value: 'Spanish', label: 'Spanish (Español)' },
    { value: 'French', label: 'French (Français)' },
    { value: 'German', label: 'German (Deutsch)' },
    { value: 'Mandarin', label: 'Mandarin (中文)' },
    { value: 'Japanese', label: 'Japanese (日本語)' },
    { value: 'Arabic', label: 'Arabic (العربية)' }
];

function CfgMenu({ value, onChange, options, icon }) {
    const [open, setOpen] = useState(false); 
    const ref = useRef(null);
    useEffect(() => { 
        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }; 
        document.addEventListener('mousedown', h); 
        return () => document.removeEventListener('mousedown', h);
    }, []);
    const sel = options.find(o => o.value === value) || options[0];
    return (
        <div style={{ position: 'relative' }} ref={ref}>
            <button type="button" className="scott-btn-cfg" onClick={() => setOpen(!open)}>
                {icon && <span className="material-symbols-outlined">{icon}</span>}
                <span>{sel?.label || value}</span>
            </button>
            {open && (
                <div className="qv2-cmenu">
                    {options.map(o => (
                        <button key={o.value || o} type="button" className="qv2-copt" onClick={() => { onChange(o.value || o); setOpen(false) }}>
                            {o.label || o}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Single Poster Display (Inline below) ──

// ── Main Storyboard Component ────────────────────────────────────────────────
export default function Storyboard({
    activeBrand,
    projects = [],
    onVideoComplete,
    canCreateVideo,
    onUpgradeRequired,
    user,
    initialBrief = '',
    initialCuts = null,
    initialDuration = 30,
    initialFormat = '9:16',
    initialProjectId = null,
    onProjectIdCreated = null,
}) {
    // ── Input state ──
    const [brief, setBrief] = useState(initialBrief || '');
    const [productName, setProductName] = useState('');
    const [productImages, setProductImages] = useState([]); // { file, preview }
    const [productUrlInput, setProductUrlInput] = useState('');
    const [isScrapingUrl, setIsScrapingUrl] = useState(false);
    // Multi-avatar support (up to 4 named characters)
    const [avatarImages, setAvatarImages] = useState([]);   // [{ file, preview, name }]
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatarPickerTargetIdx, setAvatarPickerTargetIdx] = useState(null); // which slot to fill
    // Location/element reference images (up to 3)
    const [refImages, setRefImages] = useState([]);          // [{ file, preview, label }]
    // Visual branding toggle (default ON)
    const [includeBranding, setIncludeBranding] = useState(true);
    const [defaultStyle, setDefaultStyle] = useState('hyperrealistic');
    const [format, setFormat] = useState(initialFormat || '9:16');
    const [duration, setDuration] = useState(initialDuration || 10);
    const [model, setModel] = useState('seedance-2.0-fast');
    const [resolution, setResolution] = useState('480p');
    const [directorModel, setDirectorModel] = useState('claude');
    const [imageModel, setImageModel] = useState('nanobanana-2');
    const [dialogueLanguage, setDialogueLanguage] = useState('English');
    const [audioSync, setAudioSync] = useState(true);
    const [projectAudioBriefUrl, setProjectAudioBriefUrl] = useState('');

    useEffect(() => {
        if (initialBrief) setBrief(initialBrief);
        if (initialDuration) setDuration(initialDuration);
        if (initialFormat) setFormat(initialFormat);
    }, [initialBrief, initialDuration, initialFormat]);

    // Legacy compat: avatarImage getter (first avatar) — kept for AvatarPicker
    const avatarImage = avatarImages[0] || null;

    // ── Generated storyboard state ──
    const [phase, setPhase] = useState('input'); // 'input' | 'directing' | 'storyboarding' | 'review' | 'animating' | 'complete'
    const [plan, setPlan] = useState(null);       // full storyboard plan from API
    const [structuredPlan, setStructuredPlan] = useState(null); // 4-section structured plan
    const [imageUrl, setImageUrl] = useState('');
    const [imagePrompt, setImagePrompt] = useState('');
    const [generatedVideoPrompt, setGeneratedVideoPrompt] = useState(''); // set after animate starts
    
    const [projectId, setProjectId] = useState(null);
    const [projectTitle, setProjectTitle] = useState('Untitled');
    const [error, setError] = useState('');
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);
    const [previewVideo, setPreviewVideo] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [overallProgress, setOverallProgress] = useState(0);
    const [regenLoading, setRegenLoading] = useState(false);
    const [isLongForm, setIsLongForm] = useState(false);
    const [phaseLabel, setPhaseLabel] = useState('');
    const [phaseDetail, setPhaseDetail] = useState('');
    const [segmentInfo, setSegmentInfo] = useState(null); // { completed, total }
    const [eta, setEta] = useState('');
    // Manual mode — generation mode toggle
    const [generateMode, setGenerateMode] = useState('automatic'); // 'automatic' | 'manual'
    // Manual mode — per-segment items for the gallery
    const [segmentItems, setSegmentItems] = useState([]); // [{index, status, videoUrl, prompt, duration, error}]
    const [regenSegIdx, setRegenSegIdx] = useState(null); // which segment is being regen'd
    const [showRegenOptionModal, setShowRegenOptionModal] = useState(false);
    const [targetRegenIdx, setTargetRegenIdx] = useState(null);
    const [editedPrompts, setEditedPrompts] = useState({}); // {segIdx: editedPrompt}
    const [editedVoiceovers, setEditedVoiceovers] = useState({}); // {segIdx: editedVoiceover}
    const [characterRefSheetUrl, setCharacterRefSheetUrl] = useState('');
    const [activeMediaTab, setActiveMediaTab] = useState('poster'); // 'poster' | 'character'
    const [scenes, setScenes] = useState([]); // pre-generated segments/scenes
    const [isCompiling, setIsCompiling] = useState(false);
    const [isBatchGeneratingSegments, setIsBatchGeneratingSegments] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false); // stop generation in progress
    const longFormJobIdRef = useRef(null); // stores the active sb-lf-* job ID for cancel
    
    const pollRef = useRef(null);
    const projectIdRef = useRef(null);

    const getStoryboardCredits = (m, d, r) => {
        // Flat rate based on CREDITS_PER_SECOND
        // e.g. 15 seconds = 255 credits -> 17 credits / second
        return Math.ceil(d * 17);
    };

    const hasAttemptedReconnect = useRef(false);
    const lastBrandId = useRef(activeBrand?._id);

    const productInputRef = useRef();
    const avatarInputRef = useRef();
    const directAvatarInputRef = useRef();
    const refInputRef = useRef();

    // ── Brief-from-media state (Image / Audio input modes) ──
    const [inputMode, setInputMode] = useState('text'); // 'text' | 'image' | 'audio'
    const [briefSourceFile, setBriefSourceFile] = useState(null); // { file, preview, name, type }
    const [isAnalyzingBrief, setIsAnalyzingBrief] = useState(false);
    const [briefAnalysisResult, setBriefAnalysisResult] = useState(null); // last API response
    const [preSeededCuts, setPreSeededCuts] = useState(null); // from long audio
    const [briefAudioDuration, setBriefAudioDuration] = useState(null); // set for long audio
    const briefSourceInputRef = useRef(); // hidden file input for brief source

    // ── Reuse Project Settings ──
    const handleReuse = useCallback((project) => {
        if (!project) return;
        
        // 1. Brief/Prompt
        if (project.input?.brief) setBrief(project.input.brief);
        else if (project.storyboard?.videoPrompt || project.storyboard?.imagePrompt) {
            setBrief(project.storyboard.videoPrompt || project.storyboard.imagePrompt);
        } else if (project.title) {
            setBrief(project.title);
        }

        // 2. Images
        if (project.input?.images?.length > 0) {
            setProductImages(project.input.images.map(img => ({ file: img.url, preview: img.url })));
        } else if (project.storyboard?.imageUrl) {
            setProductImages([{ file: project.storyboard.imageUrl, preview: project.storyboard.imageUrl }]);
        }

        // Multi-avatar: restore from DB
        if (project.input?.avatarUrls?.length > 0) {
            const names = project.input.avatarNames || [];
            setAvatarImages(project.input.avatarUrls.map((url, i) => ({ file: url, preview: url, name: names[i] || '' })));
        } else if (project.input?.avatarUrl) {
            setAvatarImages([{ file: project.input.avatarUrl, preview: project.input.avatarUrl, name: '' }]);
        } else {
            setAvatarImages([]);
        }

        // Ref images: restore from DB
        if (project.input?.refImageUrls?.length > 0) {
            setRefImages(project.input.refImageUrls.map((url, i) => ({ file: url, preview: url, label: `Ref ${i + 1}` })));
        } else {
            setRefImages([]);
        }

        // Branding
        if (project.storyboard?.includeBranding !== undefined) {
            setIncludeBranding(project.storyboard.includeBranding);
        }

        // 3. Config (format, model, etc)
        if (project.storyboard?.format) setFormat(project.storyboard.format);
        if (project.routing?.selectedModel) setModel(project.routing.selectedModel);
        if (project.routing?.resolution) setResolution(project.routing.resolution);
        if (project.generation?.duration) setDuration(project.generation.duration);
        if (project.storyboard?.dialogueLanguage) setDialogueLanguage(project.storyboard.dialogueLanguage);

        // Reset to input phase so the Scott box is visible
        setPhase('input');
        
        // Scroll to the Scott box
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, []);

    // ── Product image upload ──
    const handleProductImages = (e) => {
        const files = Array.from(e.target.files || []);
        setProductImages(prev => [...prev, ...files.map(f => ({ file: f, preview: URL.createObjectURL(f) }))]);
    };

    // ── Avatar upload handlers (multi-avatar, up to 4) ──
    const handleAvatarFileUpload = (e, idx = null) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setAvatarImages(prev => {
            const next = [...prev];
            if (idx !== null && idx < next.length) {
                // Replace a specific slot
                if (next[idx].preview?.startsWith('blob:')) URL.revokeObjectURL(next[idx].preview);
                next[idx] = { ...next[idx], file: files[0], preview: URL.createObjectURL(files[0]) };
            } else {
                // Append up to 4
                const remaining = 4 - next.length;
                files.slice(0, remaining).forEach(f => next.push({ file: f, preview: URL.createObjectURL(f), name: '' }));
            }
            return next;
        });
    };

    const handleAvatarPickerSelect = (avatar) => {
        if (!avatar?.imageUrl) return;
        setAvatarImages(prev => {
            const next = [...prev];
            const idx = avatarPickerTargetIdx;
            const newEntry = { file: avatar.imageUrl, preview: avatar.imageUrl, name: avatar.name || '' };
            if (idx !== null && idx < next.length) {
                next[idx] = newEntry;
            } else if (next.length < 4) {
                next.push(newEntry);
            }
            return next;
        });
        setAvatarPickerTargetIdx(null);
    };

    const handleAvatarNameChange = (idx, name) => {
        setAvatarImages(prev => prev.map((a, i) => i === idx ? { ...a, name } : a));
    };

    const handleAddAvatar = () => {
        if (avatarImages.length >= 9) return;
        setAvatarPickerTargetIdx(null);
        setShowAvatarPicker(true);
    };

    const handleRemoveAvatar = (idx) => {
        setAvatarImages(prev => {
            const entry = prev[idx];
            if (entry?.preview?.startsWith('blob:')) URL.revokeObjectURL(entry.preview);
            return prev.filter((_, i) => i !== idx);
        });
    };

    // ── Direct avatar upload from device ────────────────────────────────────────
    // Stores the raw File object — sent as binary to storyboard/create (no S3 pre-upload).
    // This avoids the S3 URL download round-trip which silently fails when filenames
    // contain spaces/special characters (URL encoding key mismatch in presigning).
    const handleDirectAvatarUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        // Reset input so the same file can be re-selected
        if (directAvatarInputRef.current) directAvatarInputRef.current.value = '';
        setAvatarImages(prev => {
            const remaining = 9 - prev.length;
            if (remaining <= 0) return prev;
            return [
                ...prev,
                ...files.slice(0, remaining).map(f => ({
                    file: f,                           // raw File object → sent as avatarImages binary
                    preview: URL.createObjectURL(f),  // local blob for thumbnail
                    name: f.name.split('.')[0] || 'Character',
                }))
            ];
        });
    };

    // ── Ref image upload (location/element) ──
    const handleRefImages = (e) => {
        const files = Array.from(e.target.files || []);
        setRefImages(prev => {
            const remaining = 9 - prev.length;
            const toAdd = files.slice(0, remaining).map(f => ({ file: f, preview: URL.createObjectURL(f), label: '' }));
            return [...prev, ...toAdd];
        });
    };

    const handleRemoveRef = (idx) => {
        setRefImages(prev => {
            const entry = prev[idx];
            if (entry?.preview?.startsWith('blob:')) URL.revokeObjectURL(entry.preview);
            return prev.filter((_, i) => i !== idx);
        });
    };

    // ── Brief from Media: upload + analyze ───────────────────────────────────
    const handleBriefMediaAnalysis = async (file) => {
        if (!file) return;
        const isImg = file.type.startsWith('image/');
        const isAud = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|mp4)$/i.test(file.name);
        if (!isImg && !isAud) {
            setError('Unsupported file type. Upload an image (JPG/PNG/WEBP) or audio (MP3/WAV/M4A).');
            return;
        }

        const preview = isImg ? URL.createObjectURL(file) : null;
        setBriefSourceFile({ file, preview, name: file.name, type: isImg ? 'image' : 'audio' });
        // Auto-switch inputMode to match file type (covers cross-type drag-and-drop)
        setInputMode(isImg ? 'image' : 'audio');
        setIsAnalyzingBrief(true);
        setError('');

        try {
            const fd = new FormData();
            fd.append('file', file);
            if (activeBrand?._id) fd.append('brandId', activeBrand._id);

            const res = await fetch(`${API}/storyboard/analyze-brief-media`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('mantram_token')}` },
                body: fd,
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Analysis failed');

            setBriefAnalysisResult(data);

            // Pre-fill brief (always editable) — keep it clean and concise.
            // productFeatures and extractedText are sent SEPARATELY to the backend
            // so the director LLM gets full verbatim document content without truncation.
            if (data.brief) {
                setBrief(data.brief);
            }

            // Pre-fill product name if not already set
            if (data.productName && !productName) setProductName(data.productName);

            // Pre-fill format
            if (data.suggestedFormat) setFormat(data.suggestedFormat);

            // Pre-fill duration (rounded to nearest 5s slider step)
            if (data.suggestedDuration) setDuration(data.suggestedDuration);

            // Long audio: store preSeededCuts + display duration notice
            if (data.preSeededCuts?.length) {
                setPreSeededCuts(data.preSeededCuts);
                setBriefAudioDuration(data.audioDuration || null);
            } else {
                setPreSeededCuts(null);
                setBriefAudioDuration(null);
            }

            // NOTE: We intentionally do NOT add the brief source image to productImages.
            // A brochure/flyer/document uploaded here is for text content extraction only.
            // Adding it as a product image causes frame-generation models (Gemini/GPT-Image)
            // to embed the literal brochure page inside video frames, which is wrong.
            // Users who want a product photo as a visual reference should upload it in the
            // Products section on the left column.

        } catch (err) {
            console.error('[BriefMedia]', err);
            setError(err.message || 'Failed to analyze file. You can still type your brief manually.');
        } finally {
            setIsAnalyzingBrief(false);
        }
    };

    const handleBriefSourceDrop = (e) => {
        e.preventDefault();
        if (isAnalyzingBrief) return; // ignore drops while analysis is in-flight
        const file = e.dataTransfer.files?.[0];
        if (file) handleBriefMediaAnalysis(file);
    };

    const handleClearBriefSource = () => {
        if (briefSourceFile?.preview?.startsWith('blob:')) URL.revokeObjectURL(briefSourceFile.preview);
        setBriefSourceFile(null);
        setBriefAnalysisResult(null);
        setPreSeededCuts(null);
        setBriefAudioDuration(null);
        if (briefSourceInputRef.current) briefSourceInputRef.current.value = '';
    };

    const handleProductUrlAdd = async () => {
        if (!productUrlInput.trim() || isScrapingUrl) return;
        const url = productUrlInput.trim();
        setIsScrapingUrl(true);
        try {
            const r = await products.scrapeUrl(url);
            if (r?.product) {
                // ✅ FIX: Use all gallery images from Shopify API, not just og:image
                const galleryImages = r.product.images?.length > 0
                    ? r.product.images
                    : r.product.image ? [r.product.image] : [];

                if (galleryImages.length > 0) {
                    setProductImages(prev => [
                        ...prev,
                        ...galleryImages.map(imgUrl => ({ file: imgUrl, preview: imgUrl }))
                    ]);
                    console.log(`[Storyboard] Scraped ${galleryImages.length} product images from URL`);
                } else {
                    alert("Could not extract a product image from this URL. Please upload the image manually.");
                }
                if (r.product.title && !productName) setProductName(r.product.title);
            } else {
                alert("Could not extract a product image from this URL. Please upload the image manually.");
            }
        } catch (e) {
            console.error('Failed to scrape URL:', e);
            alert(e.message || "Failed to scrape URL. The website might be blocking bots. Please upload the image manually.");
        } finally {
            setIsScrapingUrl(false);
            setProductUrlInput('');
        }
    };


    // ── Download helper for storyboard image ──
    const handleDownloadImage = async (url) => {
        try {
            const response = await fetch(url, { mode: 'cors' });
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `storyboard-${projectId || 'master'}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
        } catch (e) {
            console.error('Failed to download image directly:', e);
            window.open(url, '_blank');
        }
    };

    // ── Regen single poster ──
    const handleRegenPoster = useCallback(async () => {
        setRegenLoading(true);
        try {
            const res = await fetch(`${API}/storyboard/regen-poster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({ projectId, imagePrompt, style: defaultStyle, format, imageModel, dialogueLanguage }),
            });
            const data = await safeJson(res);
            if (data.success) {
                if (data.imageUrl) setImageUrl(data.imageUrl);
                // videoPrompt is generated fresh at animate-time; not needed here
            }
        } catch (e) {
            console.error('Regen poster error:', e);
            const isTimeout = e.message && (e.message.includes('Network request timed out') || e.message.includes('504'));
            setError(isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : 'Failed to regenerate poster');
        } finally {
            setRegenLoading(false);
        }
    }, [projectId, imagePrompt, defaultStyle, format, imageModel, dialogueLanguage]);

    // ── Generate storyboard ──
    const handleGenerate = async () => {
        if (!canCreateVideo) return onUpgradeRequired?.();
        if (!brief.trim() && productImages.length === 0) {
            setError('Add a brief or upload a product image to get started.');
            return;
        }
        setError('');
        setPhase('directing');

        try {
            const fd = new FormData();
            fd.append('brandId', activeBrand?._id || '');
            fd.append('brief', brief);
            fd.append('productName', productName);
            fd.append('style', defaultStyle);
            fd.append('duration', String(duration));
            fd.append('format', format);
            fd.append('resolution', resolution);
            fd.append('includeBranding', String(includeBranding));
            productImages.forEach(pi => {
                if (typeof pi.file === 'string') fd.append('productImageUrls', pi.file);
                else fd.append('productImages', pi.file);
            });
            // Multi-avatar: send each avatar
            const avatarNamesArr = avatarImages.map(a => a.name || '');
            fd.append('avatarNames', JSON.stringify(avatarNamesArr));
            avatarImages.forEach(ai => {
                if (typeof ai.file === 'string') {
                    // Pre-existing URL from DB/picker
                    fd.append('avatarUrls', ai.file);
                } else {
                    // New file upload — use avatarImages field (multi, up to 4)
                    fd.append('avatarImages', ai.file);
                }
            });
            // Ref images (location/element)
            refImages.forEach(ri => {
                if (typeof ri.file === 'string') fd.append('refImageUrls', ri.file);
                else fd.append('refImages', ri.file);
            });
            fd.append('directorModel', directorModel);
            fd.append('imageModel', imageModel);
            fd.append('videoModel', model);
            fd.append('dialogueLanguage', dialogueLanguage);
            fd.append('audioSync', String(audioSync));
            // Brochure/document analysis data — send FULL content, no truncation
            // briefAnalysisResult is persisted in state from handleBriefMediaAnalysis
            if (briefAnalysisResult?.productFeatures) {
                fd.append('productFeatures', briefAnalysisResult.productFeatures);
            }
            if (briefAnalysisResult?.extractedText) {
                // Full verbatim text from brochure — NOT truncated, sent as dedicated field
                fd.append('brochureExtractedText', briefAnalysisResult.extractedText);
                fd.append('isBrochure', 'true');
            }
            if (briefAnalysisResult?.briefAudioUrl) {
                fd.append('briefAudioUrl', briefAnalysisResult.briefAudioUrl);
            }
            // preSeededCuts: from long-audio analysis (takes precedence over initialCuts)
            if (preSeededCuts?.length) {
                fd.append('preSeededCuts', JSON.stringify(preSeededCuts));
            } else if (initialCuts) {
                fd.append('preSeededCuts', JSON.stringify(initialCuts));
            }

            setPhase('storyboarding');

            const res = await fetch(`${API}/storyboard/create`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: fd,
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Storyboard generation failed');

            setProjectId(data.projectId);
            projectIdRef.current = data.projectId;
            setProjectTitle('Untitled');
            if (onProjectIdCreated) {
                onProjectIdCreated(data.projectId);
            }
            if (data.plan?.audioSync !== undefined) {
                setAudioSync(data.plan.audioSync);
            }
            if (briefAnalysisResult?.briefAudioUrl) {
                setProjectAudioBriefUrl(briefAnalysisResult.briefAudioUrl);
            }

            setPlan(data.plan);
            setEditedPrompts({});
            setEditedVoiceovers({});
            setActiveMediaTab('poster');
            if (data.plan) {
                setImageUrl(data.plan.imageUrl);
                setImagePrompt(data.plan.imagePrompt);
                setCharacterRefSheetUrl(data.plan.characterRefSheetUrl || '');
                setScenes(data.plan.scenes || []);
                // videoPrompt is NOT stored at creation time — generated fresh at animate-time
                if (data.plan.dialogueLanguage) setDialogueLanguage(data.plan.dialogueLanguage);
                // Store the 4-section structured plan for display + animate-time use
                if (data.plan.cuts?.length || data.plan.colorPalette?.length) {
                    setStructuredPlan({
                        colorPalette:           data.plan.colorPalette || [],
                        paletteNames:           data.plan.paletteNames || [],
                        materialNotes:          data.plan.materialNotes || '',
                        environmentFingerprint: data.plan.environmentFingerprint || '',
                        cuts:                   data.plan.cuts || [],
                        moodKeywords:           data.plan.moodKeywords || [],
                        cinematographyRules:    data.plan.cinematographyRules || '',
                        emotionalArc:           data.plan.emotionalArc || '',
                        narrativeArc:           data.plan.narrativeArc || '',
                    });
                }
            }
            // Clean up brief-media state now that generation has consumed it
            if (briefSourceFile?.preview?.startsWith('blob:')) URL.revokeObjectURL(briefSourceFile.preview);
            setBriefSourceFile(null);
            setBriefAnalysisResult(null);
            // Keep preSeededCuts + briefAudioDuration cleared ONLY after successful submit
            // (they were already sent to the backend; keep them visible in UI until now)
            setPreSeededCuts(null);
            setBriefAudioDuration(null);
            setPhase('review');
        } catch (e) {
            setError(e.message || 'Failed to generate storyboard');
            setPhase('input');
        }
    };

    // ── Animate single poster ──
    const handleAnimate = async () => {
        if (!projectId || !imageUrl) return;
        setPhase('animating');
        setError('');
        setIsLongForm(false);
        setPhaseLabel('Writing video prompt...');
        setPhaseDetail('Claude is composing the cinematic animation prompt');
        setSegmentInfo(null);
        setSegmentItems([]);
        setGeneratedVideoPrompt('');

        try {
            const res = await fetch(`${API}/storyboard/animate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({
                    projectId,
                    imageUrl,
                    duration,
                    format,
                    resolution,
                    productImageUrls: productImages
                        .map(pi => typeof pi.file === 'string' ? pi.file : null)
                        .filter(Boolean),
                    // Multi-avatar: send all avatar URLs
                    avatarUrls: avatarImages
                        .filter(ai => typeof ai.file === 'string')
                        .map(ai => ai.file),
                    avatarUrl: (avatarImages[0] && typeof avatarImages[0].file === 'string')
                        ? avatarImages[0].file
                        : undefined,
                    model,
                    brandId: activeBrand?._id,
                    generateMode, // 'automatic' | 'manual'
                    audioSync,
                    voiceoverScript: plan?.voiceoverScript || '',
                    editedPrompts,
                    editedVoiceovers,
                }),
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Animation failed to start');

            // Show the generated video prompt so user knows what was created
            if (data.videoPrompt) setGeneratedVideoPrompt(data.videoPrompt);

            if (data.longForm) {
                setIsLongForm(true);
                longFormJobIdRef.current = data.jobId || null; // store for Stop Generation
                setPhaseLabel('Planning segments...');
                setPhaseDetail(`${data.segments || Math.ceil(duration / 10)} segments will be generated`);
            } else {
                setPhaseLabel('Animating film...');
                setPhaseDetail('');
            }

            // Start polling — long-form uses 10s interval, single-shot uses 4s
            startPolling(!!data.longForm);
        } catch (e) {
            const isTimeout = e.message && (e.message.includes('Network request timed out') || e.message.includes('504'));
            setError(isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : e.message);
            setPhase('review');
        }
    };

    // ── Polling for animation status ──
    const startPolling = useCallback((longForm = false) => {
        if (pollRef.current) clearInterval(pollRef.current);
        // Long-form jobs can take hours — poll less aggressively to avoid backend hammering
        const intervalMs = longForm ? 10000 : 4000;
        pollRef.current = setInterval(async () => {
            if (!projectIdRef.current) return;
            try {
                const res = await fetch(`${API}/storyboard/status/${projectIdRef.current}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` }
                });
                const data = await safeJson(res);
                if (!data.success) return;

                setOverallProgress(data.overallProgress || 0);

                // Rich progress for long-form
                if (data.isLongForm) {
                    setIsLongForm(true);
                    if (data.phaseLabel) setPhaseLabel(data.phaseLabel);
                    if (data.detail)     setPhaseDetail(data.detail);
                    if (data.segments)   setSegmentInfo(data.segments);
                    // Manual mode: update segment gallery cards with per-segment data
                    if (data.segments?.items?.length > 0) {
                        setSegmentItems(data.segments.items);
                    }
                    if (data.startedAt && data.overallProgress > 0) {
                        const elapsed = (Date.now() - new Date(data.startedAt).getTime()) / 1000;
                        const velocity = elapsed / data.overallProgress;
                        const remaining = velocity * (100 - data.overallProgress);
                        if (remaining > 0) {
                            const mins = Math.floor(remaining / 60);
                            const secs = Math.floor(remaining % 60);
                            setEta(`~ ${mins}m ${secs}s remaining`);
                        } else {
                            setEta('Finishing up...');
                        }
                    }
                }

                if (data.finalVideoUrl) setFinalVideoUrl(data.finalVideoUrl);

                if (data.allDone || data.status === 'COMPLETED') {
                    clearInterval(pollRef.current);
                    setPhase('complete');
                    onVideoComplete?.({
                        finalVideoUrl: data.finalVideoUrl,
                        imageUrl: data.imageUrl || data.plan?.imageUrl || data.storyboard?.imageUrl
                    });
                } else if (data.status === 'FAILED') {
                    clearInterval(pollRef.current);
                    const isTimeout = data.error && (data.error.includes('Network request timed out') || data.error.includes('504'));
                    setError(isTimeout ? 'Video generation modal servers are overloaded or experiencing downtime please try after sometime' : (data.error || 'Animation generation failed.'));
                    setPhase('review');
                }
            } catch (e) {
                console.warn('Poll error:', e.message);
            }
        }, intervalMs);
    }, [projectId, onVideoComplete]);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    // ── Reconnect to a running storyboard project ──
    const reconnectToProject = useCallback(async (proj) => {
        const id = proj._id;
        console.log('🔄 Reconnecting to active storyboard project:', id);
        setProjectId(id);
        projectIdRef.current = id;
        setProjectTitle(proj.title || 'Untitled');
        
        // Restore plan & basic info
        const sb = proj.storyboard || {};
        setPlan(sb);
        setImageUrl(sb.imageUrl || '');
        setImagePrompt(sb.imagePrompt || '');
        setGeneratedVideoPrompt(sb.videoPrompt || '');
        setCharacterRefSheetUrl(sb.characterRefSheetUrl || '');
        setScenes(sb.scenes || []);
        setEditedPrompts({});
        setEditedVoiceovers({});
        setActiveMediaTab('poster');
        if (sb.dialogueLanguage) setDialogueLanguage(sb.dialogueLanguage);
        if (sb.format) setFormat(sb.format);
        if (proj.routing?.selectedModel) setModel(proj.routing.selectedModel);
        if (proj.routing?.resolution) setResolution(proj.routing.resolution);
        if (proj.generation?.duration) setDuration(proj.generation.duration);
        else if (sb.totalDuration) setDuration(sb.totalDuration);
        if (sb.generateMode) setGenerateMode(sb.generateMode);
        
        if (sb.audioSync !== undefined) setAudioSync(sb.audioSync);
        else setAudioSync(true);
        if (proj.refAudio) setProjectAudioBriefUrl(proj.refAudio);
        else setProjectAudioBriefUrl('');
        
        // Restore structured plan if present
        if (sb.structuredPlan) {
            setStructuredPlan(sb.structuredPlan);
        } else if (sb.cuts?.length || sb.colorPalette?.length) {
            setStructuredPlan({
                colorPalette:           sb.colorPalette || [],
                paletteNames:           sb.paletteNames || [],
                materialNotes:          sb.materialNotes || '',
                environmentFingerprint: sb.environmentFingerprint || '',
                cuts:                   sb.cuts || [],
                moodKeywords:           sb.moodKeywords || [],
                cinematographyRules:    sb.cinematographyRules || '',
                emotionalArc:           sb.emotionalArc || '',
                narrativeArc:           sb.narrativeArc || '',
            });
        }
        
        const isLf = !!sb.longFormJobId;
        setIsLongForm(isLf);
        if (isLf) longFormJobIdRef.current = sb.longFormJobId; // restore job ID for Stop Generation
        
        if (proj.status === 'storyboard-ready') {
            setPhase('review');
        } else {
            // Animating phase
            setPhase('animating');
            if (isLf) {
                setPhaseLabel('Planning segments...');
                setPhaseDetail('Restoring active generation...');
            } else {
                setPhaseLabel('Animating film...');
                setPhaseDetail('Restoring active generation...');
            }
            
            // Perform one immediate check to update progress and segment gallery
            try {
                const res = await fetch(`${API}/storyboard/status/${id}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` }
                });
                const data = await safeJson(res);
                if (data.success) {
                    setOverallProgress(data.overallProgress || 0);
                    if (data.isLongForm) {
                        if (data.phaseLabel) setPhaseLabel(data.phaseLabel);
                        if (data.detail)     setPhaseDetail(data.detail);
                        if (data.segments)   setSegmentInfo(data.segments);
                        if (data.segments?.items?.length > 0) {
                            setSegmentItems(data.segments.items);
                        }
                        if (data.startedAt && data.overallProgress > 0) {
                            const elapsed = (Date.now() - new Date(data.startedAt).getTime()) / 1000;
                            const velocity = elapsed / data.overallProgress;
                            const remaining = velocity * (100 - data.overallProgress);
                            if (remaining > 0) {
                                const mins = Math.floor(remaining / 60);
                                const secs = Math.floor(remaining % 60);
                                setEta(`~ ${mins}m ${secs}s remaining`);
                            } else {
                                setEta('Finishing up...');
                            }
                        }
                    }
                    if (data.finalVideoUrl) setFinalVideoUrl(data.finalVideoUrl);
                    if (data.allDone || data.status === 'COMPLETED') {
                        setPhase('complete');
                        onVideoComplete?.({
                            finalVideoUrl: data.finalVideoUrl,
                            imageUrl: data.imageUrl || data.plan?.imageUrl || data.storyboard?.imageUrl
                        });
                        return; // no need to start polling loop
                    }
                }
            } catch (e) {
                console.warn('Initial reconnect status check failed:', e.message);
            }
            
            // Start the regular polling loop
            startPolling(isLf);
        }
    }, [onVideoComplete, startPolling]);

    const handleUpdateTitle = async (newTitle) => {
        setProjectTitle(newTitle);
        if (!projectId) return;
        try {
            const res = await fetch(`${API}/storyboard/${projectId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mantram_token')}`
                },
                body: JSON.stringify({ title: newTitle }),
            });
            const data = await safeJson(res);
            if (data.success) {
                onVideoComplete?.();
            }
        } catch (e) {
            console.warn('Failed to update title:', e.message);
        }
    };

    const handleSaveStoryboardDraft = useCallback(async () => {
        if (!projectId) return;
        
        // Build updated scenes list from local states
        const activeScenes = scenes.map((scene, i) => {
            const visualPrompt = editedPrompts[i] !== undefined ? editedPrompts[i] : (scene.visualPrompt || '');
            const voiceoverVal = editedVoiceovers[i] !== undefined ? editedVoiceovers[i] : (scene.dialogue?.[0]?.text || scene.voiceoverText || '');
            
            return {
                ...scene,
                visualPrompt,
                voiceoverText: voiceoverVal,
                dialogue: [{ text: voiceoverVal, emotion: 'natural' }]
            };
        });

        try {
            await fetch(`${API}/storyboard/${projectId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mantram_token')}`
                },
                body: JSON.stringify({
                    scenes: activeScenes,
                    format,
                    dialogueLanguage,
                    audioSync,
                    includeBranding,
                    model,
                    resolution
                })
            });
        } catch (err) {
            console.warn('Failed to save storyboard draft:', err.message);
        }
    }, [projectId, scenes, editedPrompts, editedVoiceovers, format, dialogueLanguage, audioSync, includeBranding, model, resolution]);

    // Auto-save debounced effect
    useEffect(() => {
        if (!projectId) return;
        const timer = setTimeout(() => {
            handleSaveStoryboardDraft();
        }, 1000);
        return () => clearTimeout(timer);
    }, [format, dialogueLanguage, audioSync, includeBranding, model, resolution, editedPrompts, editedVoiceovers, projectId]);

    // Reset reconnect trigger if brand changes
    useEffect(() => {
        if (activeBrand?._id !== lastBrandId.current) {
            lastBrandId.current = activeBrand?._id;
            hasAttemptedReconnect.current = false;
        }
    }, [activeBrand?._id]);

    // Scan projects list for active project on load
    useEffect(() => {
        if (hasAttemptedReconnect.current || initialProjectId || !projects || projects.length === 0) return;
        
        const activeProj = projects.find(p => 
            p.brand === activeBrand?._id &&
            p.studioMode === 'storyboard' &&
            (p.status === 'storyboard-ready' || p.status === 'animating' || p.storyboard?.status === 'animating')
        );
        
        hasAttemptedReconnect.current = true;
        
        if (activeProj) {
            reconnectToProject(activeProj);
        }
    }, [projects, activeBrand?._id, reconnectToProject, initialProjectId]);

    // Handle initialProjectId reconnect
    useEffect(() => {
        if (initialProjectId) {
            const fetchAndLoad = async () => {
                try {
                    const res = await fetch(`${API_BASE}/video-studio/${initialProjectId}`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` }
                    });
                    const data = await safeJson(res);
                    if (data.success && data.project) {
                        reconnectToProject(data.project);
                    }
                } catch (e) {
                    console.error('[Storyboard] Failed to fetch initialProjectId:', e);
                }
            };
            fetchAndLoad();
        }
    }, [initialProjectId, reconnectToProject]);

    // ── Manual mode: Regenerate one segment (async — backend responds immediately) ──
    const handleRegenSegment = useCallback(async (segIdx) => {
        if (!projectIdRef.current) return;
        setRegenSegIdx(segIdx);
        // Optimistically mark card as generating so user gets instant feedback
        setSegmentItems(prev => prev.map((item, i) =>
            i === segIdx ? { ...item, status: 'generating', videoUrl: null, progress: 0 } : item
        ));
        try {
            const prompt = editedPrompts[segIdx] !== undefined
                ? editedPrompts[segIdx]
                : (segmentItems[segIdx]?.prompt || '');
            const res = await fetch(`${API}/storyboard/regenerate-segment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({ projectId: projectIdRef.current, segmentIndex: segIdx, prompt }),
            });
            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Regeneration failed to start');
            // Backend is now polling Atlas in the background.
            // Our existing polling loop (startPolling) will call /storyboard/status every 10s
            // and update segmentItems via segments.items[] when the segment completes.
            // Nothing more to do here except clear the local "regen in progress" flag.
        } catch (e) {
            setError(e.message);
            // Restore previous status on error
            setSegmentItems(prev => prev.map((item, i) =>
                i === segIdx ? { ...item, status: 'failed', error: e.message } : item
            ));
        } finally {
            setRegenSegIdx(null);
        }
    }, [projectIdRef, segmentItems, editedPrompts]);

    const handleRegenSequenceFrom = useCallback(async (segIdx) => {
        if (!projectIdRef.current) return;
        
        // 1. Build updated segmentUrls map where index >= segIdx are cleared (set to null)
        const newSegmentUrls = {};
        segmentItems.forEach((seg, idx) => {
            if (idx < segIdx) {
                newSegmentUrls[String(idx)] = seg.videoUrl;
            } else {
                newSegmentUrls[String(idx)] = null;
            }
        });

        // Optimistically update segmentItems state in the UI
        setSegmentItems(prev => prev.map((item, idx) => {
            if (idx >= segIdx) {
                return { ...item, status: 'pending', videoUrl: null, progress: 0 };
            }
            return item;
        }));

        setPhase('animating');
        setError('');
        
        try {
            // 2. PATCH the DB to clear these segment URLs and reset finalVideoUrl
            const patchRes = await fetch(`${API}/storyboard/${projectIdRef.current}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('mantram_token')}`
                },
                body: JSON.stringify({
                    segmentUrls: newSegmentUrls,
                    finalVideoUrl: null,
                    status: 'animating'
                })
            });
            const patchData = await safeJson(patchRes);
            if (!patchData.success) throw new Error(patchData.error || 'Failed to update project sequence in DB');

            // 3. Trigger /storyboard/animate to start the long form generator
            const res = await fetch(`${API}/storyboard/animate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({
                    projectId: projectIdRef.current,
                    imageUrl,
                    duration,
                    format,
                    resolution,
                    productImageUrls: productImages
                        .map(pi => typeof pi.file === 'string' ? pi.file : null)
                        .filter(Boolean),
                    avatarUrls: avatarImages
                        .filter(ai => typeof ai.file === 'string')
                        .map(ai => ai.file),
                    avatarUrl: (avatarImages[0] && typeof avatarImages[0].file === 'string')
                        ? avatarImages[0].file
                        : undefined,
                    model,
                    brandId: activeBrand?._id,
                    generateMode,
                    audioSync,
                    voiceoverScript: plan?.voiceoverScript || '',
                    editedPrompts,
                    editedVoiceovers,
                }),
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Animation failed to start');

            if (data.videoPrompt) setGeneratedVideoPrompt(data.videoPrompt);

            if (data.longForm) {
                setIsLongForm(true);
                longFormJobIdRef.current = data.jobId || null;
                setPhaseLabel('Planning segments...');
                setPhaseDetail(`${data.segments || Math.ceil(duration / 10)} segments will be generated`);
            } else {
                setIsLongForm(false);
                setPhaseLabel('Animating film...');
                setPhaseDetail('');
            }

            // Start polling (long form)
            startPolling(true);
        } catch (e) {
            setError(e.message);
            setPhase('review');
        }
    }, [projectIdRef, segmentItems, imageUrl, duration, format, resolution, productImages, avatarImages, model, activeBrand?._id, generateMode, audioSync, plan?.voiceoverScript, editedPrompts, editedVoiceovers, startPolling]);

    // ── Manual mode: Generate/Regenerate all incomplete segments in parallel ──
    const handleGenerateAllSegments = useCallback(async () => {
        if (!projectIdRef.current || isBatchGeneratingSegments) return;
        
        // Find indices of all segments that are NOT completed
        const pendingIndices = segmentItems
            .map((seg, i) => (seg.status !== 'completed' ? i : -1))
            .filter(i => i !== -1);

        if (pendingIndices.length === 0) return;

        setIsBatchGeneratingSegments(true);
        setError('');

        // Optimistically set all target segments to 'generating' status
        setSegmentItems(prev => prev.map((item, i) =>
            pendingIndices.includes(i) ? { ...item, status: 'generating', videoUrl: null, progress: 0 } : item
        ));

        try {
            await Promise.all(pendingIndices.map(async (segIdx) => {
                const prompt = editedPrompts[segIdx] !== undefined
                    ? editedPrompts[segIdx]
                    : (segmentItems[segIdx]?.prompt || '');
                const res = await fetch(`${API}/storyboard/regenerate-segment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                    body: JSON.stringify({ projectId: projectIdRef.current, segmentIndex: segIdx, prompt }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Segment ${segIdx + 1} generation failed to start`);
            }));
        } catch (e) {
            setError(e.message || 'Failed to start batch segment generation');
            // Revert status of pending indices to failed
            setSegmentItems(prev => prev.map((item, i) =>
                pendingIndices.includes(i) && item.status === 'generating'
                    ? { ...item, status: 'failed', error: e.message }
                    : item
            ));
        } finally {
            setIsBatchGeneratingSegments(false);
        }
    }, [projectIdRef, segmentItems, editedPrompts, isBatchGeneratingSegments]);

    // ── Manual mode: Compile all ready segments into final video ──
    const handleCompile = useCallback(async () => {
        if (!projectIdRef.current) return;
        setIsCompiling(true);
        setError('');
        try {
            const res = await fetch(`${API}/storyboard/compile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({ projectId: projectIdRef.current }),
            });
            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Compile failed');
            setFinalVideoUrl(data.finalVideoUrl);
            setPhase('complete');
            onVideoComplete?.({
                finalVideoUrl: data.finalVideoUrl,
                imageUrl: plan?.imageUrl || imageUrl
            });
        } catch (e) {
            setError(e.message);
        } finally {
            setIsCompiling(false);
        }
    }, [projectIdRef, onVideoComplete]);

    // ── Stop long-form storyboard generation ──
    const handleStopGeneration = useCallback(async () => {
        const jobId = longFormJobIdRef.current;
        if (!jobId) {
            // Fallback: no jobId in memory, just reset the phase
            if (pollRef.current) clearInterval(pollRef.current);
            setPhase('review');
            return;
        }
        if (!window.confirm('Stop video generation? Segments already completed will be preserved in Manual mode, but the pipeline will not generate new ones.')) return;
        setIsCancelling(true);
        try {
            await fetch(`${API}/storyboard/cancel/${jobId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
            });
        } catch (e) {
            console.warn('[Storyboard] Cancel request failed:', e.message);
        } finally {
            setIsCancelling(false);
            if (pollRef.current) clearInterval(pollRef.current);
            longFormJobIdRef.current = null;
            setPhase('review');
            setPhaseLabel('');
            setPhaseDetail('');
        }
    }, []);

    // ── Render helpers ──
    const isLoading = phase === 'directing' || phase === 'storyboarding';

    return (
        <>
        <div className="sb-root">
            {/* ── HEADER ── */}
            <div className="sb-header">
                <div className="sb-header-left">
                    <span className="material-symbols-outlined sb-header-icon">movie</span>
                    <div>
                        {projectId ? (
                            <>
                                <DebouncedInput
                                    value={projectTitle}
                                    onChange={handleUpdateTitle}
                                    className="sb-editable-title-input"
                                    placeholder="Untitled"
                                    style={{
                                        fontSize: 20,
                                        fontWeight: 'bold',
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: '1px dashed rgba(255,255,255,0.3)',
                                        color: '#fff',
                                        outline: 'none',
                                        padding: '2px 6px',
                                        width: '320px'
                                    }}
                                />
                                <p className="sb-subtitle" style={{ marginTop: 4 }}>Rename project · Claude writes your shot plan · Gemini generates frames</p>
                            </>
                        ) : (
                            <>
                                <h2 className="sb-title">Storyboard Director</h2>
                                <p className="sb-subtitle">Claude writes your shot plan · Gemini generates frames · Seedance animates</p>
                            </>
                        )}
                    </div>
                </div>
                {plan && (
                    <div className="sb-header-meta">
                        <span>1 Master Poster</span>
                        <span>·</span>
                        <span>{duration}s</span>
                        <span>·</span>
                        <span>{format}</span>
                    </div>
                )}
            </div>

            {/* ── ERROR ── */}
            {error && (
                <div className="sb-error">
                    <span className="material-symbols-outlined">error</span>
                    {error}
                    <button onClick={() => setError('')}><span className="material-symbols-outlined">close</span></button>
                </div>
            )}

            {/* ════════════ INPUT PANEL (Scott Panel style) ════════════ */}
            <AvatarPicker
                isOpen={showAvatarPicker}
                onClose={() => setShowAvatarPicker(false)}
                onSelect={handleAvatarPickerSelect}
                activeBrand={activeBrand}
            />

            {(phase === 'input' || phase === 'directing' || phase === 'storyboarding') && (
                <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '24px', zIndex: 10 }}>
                    <div className="scott-panel">

                        {/* ── Row 1: Brief Input (full width) ── */}
                        <div className="scott-brief-row">

                            {/* Input mode toggle pills */}
                            <div className="sb-input-mode-bar">
                                <button
                                    type="button"
                                    className={`sb-mode-source-btn ${inputMode === 'text' ? 'active' : ''}`}
                                    onClick={() => { setInputMode('text'); handleClearBriefSource(); }}
                                    title="Type your brief"
                                >
                                    <span className="material-symbols-outlined">edit</span>
                                    Write
                                </button>
                                <button
                                    type="button"
                                    className={`sb-mode-source-btn ${inputMode === 'image' ? 'active' : ''}`}
                                    onClick={() => setInputMode('image')}
                                    title="Upload a brochure, flyer, or product image"
                                >
                                    <span className="material-symbols-outlined">image</span>
                                    Image
                                </button>
                                <button
                                    type="button"
                                    className={`sb-mode-source-btn ${inputMode === 'audio' ? 'active' : ''}`}
                                    onClick={() => setInputMode('audio')}
                                    title="Upload a voice brief or audio pitch"
                                >
                                    <span className="material-symbols-outlined">mic</span>
                                    Audio
                                </button>
                            </div>

                            {/* Brief text input (always visible, editable) */}
                            <div className="sb-brief-input-area">
                                {briefAnalysisResult && (
                                    <div className="sb-brief-ai-badge">
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        AI-generated · editable
                                    </div>
                                )}
                                <DebouncedInput
                                    className="scott-input"
                                    placeholder={inputMode === 'image' ? 'Upload an image below — AI will fill this brief for you...' : inputMode === 'audio' ? 'Upload audio below — AI will transcribe and create your brief...' : "Describe your ad film... e.g. 'Create a 30s emotional ad for our protein powder targeting young fitness enthusiasts...'"}
                                    value={brief}
                                    onChange={setBrief}
                                    disabled={isLoading || isAnalyzingBrief}
                                />
                            </div>

                            {/* Drop zone (image/audio modes only) */}
                            {inputMode !== 'text' && (
                                <div
                                    className={`sb-brief-source-zone ${isAnalyzingBrief ? 'analyzing' : ''} ${briefSourceFile ? 'has-file' : ''}`}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={handleBriefSourceDrop}
                                    onClick={() => !briefSourceFile && !isAnalyzingBrief && briefSourceInputRef.current?.click()}
                                >
                                    {isAnalyzingBrief ? (
                                        <div className="sb-brief-source-loading">
                                            <div className="sb-brief-shimmer" />
                                            <div className="sb-brief-source-loading-text">
                                                <span className="material-symbols-outlined spin" style={{ fontSize: 18, color: 'var(--sys-primary)' }}>autorenew</span>
                                                {briefSourceFile?.type === 'audio' ? 'Transcribing audio & building shot plan…' : 'Analyzing image & extracting brief…'}
                                            </div>
                                        </div>
                                    ) : briefSourceFile ? (
                                        <div className="sb-brief-source-preview">
                                            {briefSourceFile.type === 'image' && briefSourceFile.preview && (
                                                <img src={briefSourceFile.preview} alt="Source" className="sb-brief-source-thumb" />
                                            )}
                                            {briefSourceFile.type === 'audio' && (
                                                <div className="sb-brief-source-audio-icon">
                                                    <span className="material-symbols-outlined">graphic_eq</span>
                                                </div>
                                            )}
                                            <div className="sb-brief-source-meta">
                                                <span className="sb-brief-source-filename">{briefSourceFile.name}</span>
                                                {briefAudioDuration && (
                                                    <span className="sb-brief-source-chip">
                                                        <span className="material-symbols-outlined">schedule</span>
                                                        {preSeededCuts?.length} shots · {Math.round(briefAudioDuration)}s audio
                                                    </span>
                                                )}
                                                {briefAnalysisResult && !preSeededCuts && (
                                                    <span className="sb-brief-source-chip sb-brief-source-chip--done">
                                                        <span className="material-symbols-outlined">check_circle</span>
                                                        Brief extracted
                                                    </span>
                                                )}
                                                {briefSourceFile.type === 'audio' && (
                                                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            type="button"
                                                            className={`scott-style-pill ${audioSync ? 'active' : ''}`}
                                                            onClick={(e) => { e.stopPropagation(); setAudioSync(true); }}
                                                            style={{ cursor: 'pointer', padding: '3px 8px', fontSize: 10, height: 22 }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>sync</span>
                                                            Sync Audio
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`scott-style-pill ${!audioSync ? 'active' : ''}`}
                                                            onClick={(e) => { e.stopPropagation(); setAudioSync(false); }}
                                                            style={{ cursor: 'pointer', padding: '3px 8px', fontSize: 10, height: 22 }}
                                                        >
                                                            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>videocam</span>
                                                            Just Video
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="sb-brief-source-clear"
                                                onClick={e => { e.stopPropagation(); handleClearBriefSource(); }}
                                                title="Remove file"
                                            >
                                                <span className="material-symbols-outlined">close</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="sb-brief-source-empty">
                                            <span className="material-symbols-outlined">{inputMode === 'image' ? 'add_photo_alternate' : 'upload_file'}</span>
                                            <span className="sb-brief-source-empty-title">
                                                {inputMode === 'image' ? 'Drop brochure, flyer, or product image' : 'Drop voice brief or audio pitch'}
                                            </span>
                                            <span className="sb-brief-source-empty-hint">
                                                {inputMode === 'image' ? 'JPG · PNG · WEBP — AI reads all text & creates brief' : 'MP3 · WAV · M4A · OGG — AI transcribes & maps shots'}
                                            </span>
                                            <button type="button" className="sb-brief-source-browse-btn">
                                                Browse Files
                                            </button>
                                        </div>
                                    )}
                                    {/* Hidden file input */}
                                    <input
                                        ref={briefSourceInputRef}
                                        type="file"
                                        accept={inputMode === 'image' ? 'image/*' : 'audio/*,.mp3,.wav,.m4a,.ogg,.mp4,.webm'}
                                        hidden
                                        onChange={e => {
                                            const f = e.target.files?.[0];
                                            // Reset so same file can be re-selected after clearing
                                            if (briefSourceInputRef.current) briefSourceInputRef.current.value = '';
                                            if (f) handleBriefMediaAnalysis(f);
                                        }}
                                    />
                                </div>
                            )}

                        </div>

                        {/* ── Row 2: 3-column settings grid ── */}
                        <div className="scott-main-grid">

                            {/* ════ MEDIA COLUMN ════ */}
                            <div className="scott-section">
                                <div className="scott-section-header">
                                    <span className="material-symbols-outlined">photo_library</span>
                                    MEDIA
                                </div>

                                {/* Product Images */}
                                <div className="scott-media-group">
                                    <div className="scott-media-label-row">
                                        <span className="scott-media-type">Product</span>
                                        <button className="scott-media-add-btn" onClick={() => productInputRef.current?.click()} title="Upload product image">
                                            <span className="material-symbols-outlined">add_photo_alternate</span>
                                        </button>
                                    </div>
                                    <div className="scott-media-strip">
                                        {productImages.length === 0 ? (
                                            <div className="scott-media-empty" onClick={() => productInputRef.current?.click()}>
                                                <span className="material-symbols-outlined">inventory_2</span>
                                            </div>
                                        ) : productImages.map((pi, idx) => (
                                            <div key={idx} className="scott-thumb-wrap">
                                                <img src={pi.preview} alt={`product-${idx+1}`} className="scott-media-thumb" />
                                                <button className="scott-thumb-remove" onClick={() => {
                                                    const removed = productImages[idx];
                                                    if (removed?.preview?.startsWith('blob:')) URL.revokeObjectURL(removed.preview);
                                                    setProductImages(prev => prev.filter((_, i) => i !== idx));
                                                }}>✕</button>
                                            </div>
                                        ))}
                                        {productImages.length > 0 && (
                                            <button className="scott-media-add-btn" onClick={() => productInputRef.current?.click()} title="Add more">
                                                <span className="material-symbols-outlined">add</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Cast / Avatars */}
                                <div className="scott-media-group">
                                    <div className="scott-media-label-row">
                                        <span className="scott-media-type">Cast</span>
                                        <div style={{ display: 'flex', gap: 3 }}>
                                            <button className="scott-media-add-btn" onClick={() => directAvatarInputRef.current?.click()} title="Upload photo from device">
                                                <span className="material-symbols-outlined">upload</span>
                                            </button>
                                            <button className="scott-media-add-btn" onClick={handleAddAvatar} title="Pick from avatar library">
                                                <span className="material-symbols-outlined">person_search</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="scott-media-strip">
                                        {avatarImages.length === 0 ? (
                                            <div className="scott-media-empty" onClick={handleAddAvatar}>
                                                <span className="material-symbols-outlined">person</span>
                                            </div>
                                        ) : avatarImages.map((ai, idx) => (
                                            <div key={idx} className="scott-thumb-wrap">
                                                <img
                                                    src={ai.preview}
                                                    alt={`avatar-${idx+1}`}
                                                    title={ai.name || `Character ${idx+1}`}
                                                    className="scott-media-thumb scott-media-thumb-avatar"
                                                    onClick={() => { setAvatarPickerTargetIdx(idx); setShowAvatarPicker(true); }}
                                                />
                                                {ai.name && <span className="scott-avatar-name">{ai.name.slice(0, 7)}</span>}
                                                <button className="scott-thumb-remove" onClick={() => handleRemoveAvatar(idx)}>✕</button>
                                            </div>
                                        ))}
                                        {avatarImages.length > 0 && avatarImages.length < 9 && (
                                            <button className="scott-media-add-btn" onClick={() => { setAvatarPickerTargetIdx(null); setShowAvatarPicker(true); }} title="Add another character">
                                                <span className="material-symbols-outlined">add</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Location / Ref Images */}
                                <div className="scott-media-group">
                                    <div className="scott-media-label-row">
                                        <span className="scott-media-type">Location</span>
                                        {refImages.length < 9 && (
                                            <button className="scott-media-add-btn" onClick={() => refInputRef.current?.click()} title="Upload location reference">
                                                <span className="material-symbols-outlined">add_location_alt</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="scott-media-strip">
                                        {refImages.length === 0 ? (
                                            <div className="scott-media-empty" onClick={() => refInputRef.current?.click()}>
                                                <span className="material-symbols-outlined">landscape</span>
                                            </div>
                                        ) : refImages.map((ri, idx) => (
                                            <div key={idx} className="scott-thumb-wrap">
                                                <img src={ri.preview} alt={`ref-${idx+1}`} className="scott-media-thumb" style={{ border: '2px solid rgba(234,179,8,0.45)' }} />
                                                <button className="scott-thumb-remove" onClick={() => handleRemoveRef(idx)}>✕</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* URL scraper */}
                                <div className="scott-url-row">
                                    <span className="material-symbols-outlined">link</span>
                                    <input
                                        type="text"
                                        className="scott-url-input"
                                        placeholder="Paste product URL…"
                                        value={productUrlInput}
                                        onChange={e => setProductUrlInput(e.target.value)}
                                        disabled={isScrapingUrl}
                                        onKeyDown={e => { if (e.key === 'Enter' && productUrlInput) handleProductUrlAdd(); }}
                                    />
                                    {productUrlInput && (
                                        <button className="scott-url-btn" onClick={handleProductUrlAdd} disabled={isScrapingUrl}>
                                            {isScrapingUrl ? '…' : 'Add'}
                                        </button>
                                    )}
                                </div>

                                {/* Hidden file inputs */}
                                <input ref={productInputRef} type="file" accept="image/*" multiple hidden onChange={handleProductImages} />
                                <input ref={directAvatarInputRef} type="file" accept="image/*" hidden onChange={handleDirectAvatarUpload} />
                                <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={(e) => handleAvatarFileUpload(e)} />
                                <input ref={refInputRef} type="file" accept="image/*" multiple hidden onChange={handleRefImages} />
                            </div>

                            {/* ════ OUTPUT COLUMN ════ */}
                            <div className="scott-section">
                                <div className="scott-section-header">
                                    <span className="material-symbols-outlined">movie</span>
                                    OUTPUT
                                </div>

                                <div className="scott-output-pair">
                                    <div className="scott-labeled-control">
                                        <span className="scott-ctrl-label">Format</span>
                                        <CfgMenu value={format} onChange={setFormat} options={FORMATS} icon="crop" />
                                    </div>
                                    <div className="scott-labeled-control">
                                        <span className="scott-ctrl-label">Resolution</span>
                                        <CfgMenu value={resolution} onChange={setResolution} options={RESOLUTIONS} icon="hd" />
                                    </div>
                                </div>

                                <div className="scott-duration-block">
                                    <div className="scott-duration-header">
                                        <span className="scott-ctrl-label">Duration</span>
                                        <span className="scott-duration-value">
                                            {duration}s<span className="scott-duration-tag">{getDurationLabel(duration)}</span>
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        className="sb-dur-slider"
                                        min={model.startsWith('seedance') ? 4 : 5}
                                        max={model === 'seedance-2.0-mini' ? 45 : 120}
                                        step={model.startsWith('seedance') ? 1 : 5}
                                        value={duration}
                                        onChange={e => { setDuration(Number(e.target.value)); setBriefAudioDuration(null); }}
                                        disabled={isLoading}
                                    />
                                    <div className="scott-duration-range">
                                        <span>{model.startsWith('seedance') ? '4s' : '5s'}</span><span>{model === 'seedance-2.0-mini' ? '45s' : '120s'}</span>
                                    </div>
                                    {briefAudioDuration && preSeededCuts?.length && (
                                        <div className="sb-audio-dur-notice">
                                            <span className="material-symbols-outlined">timer</span>
                                            Set to match your audio ({Math.round(briefAudioDuration)}s). Drag to adjust.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ════ AI MODELS COLUMN ════ */}
                            <div className="scott-section">
                                <div className="scott-section-header">
                                    <span className="material-symbols-outlined">smart_toy</span>
                                    AI MODELS
                                </div>

                                <div className="scott-model-row">
                                    <span className="scott-ctrl-label">Video</span>
                                    <CfgMenu value={model} onChange={setModel} options={MODELS} icon="play_circle" />
                                </div>
                                <div className="scott-model-row">
                                    <span className="scott-ctrl-label">Director</span>
                                    <CfgMenu value={directorModel} onChange={setDirectorModel} options={DIRECTOR_MODELS} icon="movie_filter" />
                                </div>
                                <div className="scott-model-row">
                                    <span className="scott-ctrl-label">Language</span>
                                    <CfgMenu value={dialogueLanguage} onChange={setDialogueLanguage} options={LANGUAGES} icon="translate" />
                                </div>
                                <div className="scott-model-row">
                                    <span className="scott-ctrl-label">Image</span>
                                    <CfgMenu value={imageModel} onChange={setImageModel} options={IMAGE_MODELS} icon="image" />
                                </div>
                            </div>
                        </div>

                        {/* ── Row 3: Footer — Style / Brand / Mode / Generate ── */}
                        <div className="scott-footer-row">
                            {/* Visual style pills */}
                            <div className="scott-style-pills">
                                {STYLES.map(s => (
                                    <button
                                        key={s.id}
                                        className={`scott-style-pill ${defaultStyle === s.id ? 'active' : ''}`}
                                        onClick={() => setDefaultStyle(s.id)}
                                        title={s.desc}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{s.icon}</span>
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* Brand DNA toggle */}
                            <button
                                className={`scott-brand-toggle ${includeBranding ? 'active' : ''}`}
                                onClick={() => setIncludeBranding(v => !v)}
                                title={includeBranding ? 'Brand DNA ON — click to disable' : 'Brand DNA OFF — click to enable'}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 13 }}>verified</span>
                                BRAND
                            </button>

                            <div style={{ flex: 1 }} />

                            {/* Generation mode toggle */}
                            <div className="sb-mode-toggle" title="Auto: full video at once. Manual: review each segment.">
                                <button
                                    type="button"
                                    className={`sb-mode-btn ${generateMode === 'automatic' ? 'active' : ''}`}
                                    onClick={() => setGenerateMode('automatic')}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_mode</span> Auto
                                </button>
                                <button
                                    type="button"
                                    className={`sb-mode-btn ${generateMode === 'manual' ? 'active' : ''}`}
                                    onClick={() => setGenerateMode('manual')}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>tune</span> Manual
                                </button>
                            </div>

                            {/* Generate CTA */}
                            <button className="scott-generate" onClick={handleGenerate} disabled={isLoading || isAnalyzingBrief}>
                                {isLoading ? (
                                    <><span className="material-symbols-outlined spin" style={{ fontSize: 15 }}>autorenew</span> Writing…</>
                                ) : (
                                    <>GET STORYBOARD <span className="material-symbols-outlined" style={{ fontSize: 15 }}>auto_awesome</span></>
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {/* ════════════ STORYBOARD POSTER ════════════ */}
            {(phase === 'review' || phase === 'animating' || phase === 'complete') && (
                <div className="sb-board">
                    {/* Narrative arc banner */}
                    {plan?.narrativeArc && (
                        <div className="sb-narrative-banner">
                            <span className="material-symbols-outlined">auto_stories</span>
                            <span>{plan.narrativeArc}</span>
                        </div>
                    )}

                    {/* Section title (like reference image) */}
                    <div className="sb-board-title">
                        <span className="sb-board-brand">{productName || activeBrand?.name || 'AD FILM'}</span>
                        <span className="sb-board-sub">— MASTER POSTER · {duration}S —</span>
                    </div>

                    {/* Master Poster Layout */}
                    <div className="sb-poster-layout">
                        <div className="sb-poster-left">
                            {characterRefSheetUrl && (
                                <div className="sb-media-tabs" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveMediaTab('poster')}
                                        className={`sb-media-tab-btn ${activeMediaTab === 'poster' ? 'active' : ''}`}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: activeMediaTab === 'poster' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                                            color: activeMediaTab === 'poster' ? '#C084FC' : 'rgba(255,255,255,0.6)',
                                            fontWeight: 600,
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        Storyboard Poster
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setActiveMediaTab('character')}
                                        className={`sb-media-tab-btn ${activeMediaTab === 'character' ? 'active' : ''}`}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            background: activeMediaTab === 'character' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                                            color: activeMediaTab === 'character' ? '#C084FC' : 'rgba(255,255,255,0.6)',
                                            fontWeight: 600,
                                            fontSize: '13px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        Character consistency sheet
                                    </button>
                                </div>
                            )}
                            <div className="sb-poster-wrap">
                                {activeMediaTab === 'character' ? (
                                    characterRefSheetUrl ? (
                                        <>
                                            <img 
                                                src={characterRefSheetUrl} 
                                                className="sb-poster-img" 
                                                alt="Character Consistency Sheet" 
                                                onClick={() => setPreviewImage(characterRefSheetUrl)}
                                                style={{ cursor: 'zoom-in' }}
                                            />
                                            <div className="sb-poster-actions">
                                                <button 
                                                    type="button" 
                                                    className="sb-poster-action-btn"
                                                    onClick={() => setPreviewImage(characterRefSheetUrl)}
                                                    title="Zoom / View Full Size"
                                                >
                                                    <span className="material-symbols-outlined">zoom_in</span>
                                                </button>
                                                <button 
                                                    type="button" 
                                                    className="sb-poster-action-btn"
                                                    onClick={() => handleDownloadImage(characterRefSheetUrl)}
                                                    title="Download Character Sheet"
                                                >
                                                    <span className="material-symbols-outlined">download</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="sb-poster-img" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.2)', marginBottom: 16 }}>broken_image</span>
                                            <p style={{ color: 'rgba(255,255,255,0.5)' }}>Character sheet failed to load.</p>
                                        </div>
                                    )
                                ) : imageUrl ? (
                                    <>
                                        <img 
                                            src={imageUrl} 
                                            className="sb-poster-img" 
                                            alt="Master Storyboard Poster" 
                                            onClick={() => setPreviewImage(imageUrl)}
                                            style={{ cursor: 'zoom-in' }}
                                        />
                                        <div className="sb-poster-actions">
                                            <button 
                                                type="button" 
                                                className="sb-poster-action-btn"
                                                onClick={() => setPreviewImage(imageUrl)}
                                                title="Zoom / View Full Size"
                                            >
                                                <span className="material-symbols-outlined">zoom_in</span>
                                            </button>
                                            <button 
                                                type="button" 
                                                className="sb-poster-action-btn"
                                                onClick={() => handleDownloadImage(imageUrl)}
                                                title="Download Storyboard Image"
                                            >
                                                <span className="material-symbols-outlined">download</span>
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="sb-poster-img" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'rgba(255,255,255,0.2)', marginBottom: 16 }}>broken_image</span>
                                        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Master poster generation failed.</p>
                                        <button className="scott-btn-cfg" onClick={handleRegenPoster} style={{ marginTop: 16 }}>
                                            <span className="material-symbols-outlined">refresh</span> Retry Generation
                                        </button>
                                    </div>
                                )}
                                {regenLoading && (
                                    <div className="sb-frame-overlay loading">
                                        <div className="sb-spinner" />
                                        <span>Generating Poster...</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="sb-poster-right">
                            <div className="sb-prompt-group">
                                <label className="sb-prompt-label">
                                    <span className="material-symbols-outlined">image</span>
                                    Image Generation Prompt
                                </label>
                                <textarea
                                    className="sb-prompt-textarea"
                                    rows={5}
                                    value={imagePrompt}
                                    onChange={e => setImagePrompt(e.target.value)}
                                    placeholder="Prompt for the Master Storyboard Grid..."
                                />
                                <button className="sb-btn-ghost sb-regen-btn" onClick={handleRegenPoster} disabled={regenLoading || phase === 'animating'}>
                                    <span className="material-symbols-outlined">refresh</span>
                                    Regenerate Poster
                                </button>
                            </div>

                            {/* Dialogue Language selector */}
                            <div className="sb-prompt-group">
                                <label className="sb-prompt-label">
                                    <span className="material-symbols-outlined">translate</span>
                                    Dialogue Language
                                </label>
                                <CfgMenu value={dialogueLanguage} onChange={setDialogueLanguage} options={LANGUAGES} icon="translate" />
                                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                                    Video prompt with dialogues in this language is auto-generated when you click Animate.
                                </p>
                            </div>

                            {/* Audio sync toggle in review stage if project has audio brief */}
                            {projectAudioBriefUrl && (
                                <div className="sb-prompt-group">
                                    <label className="sb-prompt-label">
                                        <span className="material-symbols-outlined">music_note</span>
                                        Audio Sync Mode
                                    </label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            type="button"
                                            className={`scott-style-pill ${audioSync ? 'active' : ''}`}
                                            onClick={() => setAudioSync(true)}
                                            style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>sync</span>
                                            Sync Audio
                                        </button>
                                        <button
                                            type="button"
                                            className={`scott-style-pill ${!audioSync ? 'active' : ''}`}
                                            onClick={() => setAudioSync(false)}
                                            style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>videocam</span>
                                            Just Video
                                        </button>
                                    </div>
                                    <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                                        {audioSync 
                                            ? 'Compiled video will stitch with the uploaded audio brief.' 
                                            : 'Just Video: Compiled video will be silent / video-only (no audio brief mixed).'}
                                    </p>
                                </div>
                            )}

                            {/* Voiceover Script Editor */}
                            <div className="sb-prompt-group">
                                <label className="sb-prompt-label">
                                    <span className="material-symbols-outlined">record_voice_over</span>
                                    Voiceover Script ({dialogueLanguage})
                                </label>
                                <textarea
                                    className="sb-prompt-textarea"
                                    rows={4}
                                    value={plan?.voiceoverScript || ''}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setPlan(prev => ({
                                            ...prev,
                                            voiceoverScript: val
                                        }));
                                    }}
                                    placeholder="Enter the voiceover script for the video..."
                                />
                                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>
                                    This script will be generated as a voiceover using TTS in the selected dialogue language.
                                </p>
                            </div>

                             {/* ── 4-Section Structured Storyboard Plan ── */}
                             {structuredPlan && (
                                 <div style={{ marginTop: 4 }}>

                                     {/* Section 1 — Color Palette + Materials */}
                                     {(structuredPlan.colorPalette?.length > 0 || structuredPlan.materialNotes) && (
                                         <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                                             <p style={{ margin: '0 0 7px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>§1 — Color Palette + Materials</p>
                                             {structuredPlan.colorPalette?.length > 0 && (
                                                 <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                                                     {structuredPlan.colorPalette.map((hex, i) => (
                                                         <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                             <div style={{ width: 14, height: 14, borderRadius: '50%', background: hex, border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }} title={hex} />
                                                             <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{structuredPlan.paletteNames?.[i] || hex}</span>
                                                         </div>
                                                     ))}
                                                 </div>
                                             )}
                                             {structuredPlan.materialNotes && (
                                                 <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>{structuredPlan.materialNotes}</p>
                                             )}
                                         </div>
                                     )}

                                     {/* Section 2 — Environment */}
                                     {structuredPlan.environmentFingerprint && (
                                         <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                                             <p style={{ margin: '0 0 4px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>§2 — Environment (constant across all cuts)</p>
                                             <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, fontStyle: 'italic' }}>"{structuredPlan.environmentFingerprint}"</p>
                                         </div>
                                     )}

                                     {/* Section 3 — Cut Plan (Prompts & Dialogues Editor) */}
                                     {scenes?.length > 0 ? (
                                         <div style={{ marginBottom: 10 }}>
                                             <p style={{ margin: '0 0 10px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>§3 — Detailed Video Segment Prompts ({scenes.length} segments · {duration}s)</p>
                                             <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                 {scenes.map((scene, i) => {
                                                     const displayPrompt = editedPrompts[i] !== undefined ? editedPrompts[i] : (scene.visualPrompt || '');
                                                     const voiceoverVal = scene.dialogue?.[0]?.text || scene.voiceoverText || '';
                                                     const displayVoiceover = editedVoiceovers[i] !== undefined ? editedVoiceovers[i] : voiceoverVal;
                                                     return (
                                                         <div key={i} style={{ padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                                 <span style={{ fontSize: 11, fontWeight: 600, color: '#C084FC' }}>Segment {i + 1} ({scene.duration}s)</span>
                                                                 <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>{scene.camerawork || 'Cinematic'}</span>
                                                             </div>

                                                             {/* Visual Prompt Textarea */}
                                                             <div style={{ marginBottom: 8 }}>
                                                                 <label style={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Visual Scene Prompt</label>
                                                                 <textarea
                                                                     rows={3}
                                                                     value={displayPrompt}
                                                                     onChange={e => setEditedPrompts(prev => ({ ...prev, [i]: e.target.value }))}
                                                                     placeholder="Visual prompt details..."
                                                                     style={{
                                                                         width: '100%',
                                                                         background: 'rgba(0,0,0,0.2)',
                                                                         border: '1px solid rgba(255,255,255,0.08)',
                                                                         borderRadius: '6px',
                                                                         color: '#fff',
                                                                         padding: '8px',
                                                                         fontSize: '11px',
                                                                         lineHeight: '1.4',
                                                                         fontFamily: 'inherit',
                                                                         resize: 'vertical',
                                                                     }}
                                                                 />
                                                             </div>

                                                             {/* Voiceover Textarea */}
                                                             <div>
                                                                 <label style={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Voiceover / Dialogue Text</label>
                                                                 <textarea
                                                                     rows={2}
                                                                     value={displayVoiceover}
                                                                     onChange={e => setEditedVoiceovers(prev => ({ ...prev, [i]: e.target.value }))}
                                                                     placeholder="Narrator or character speech..."
                                                                     style={{
                                                                         width: '100%',
                                                                         background: 'rgba(0,0,0,0.2)',
                                                                         border: '1px solid rgba(255,255,255,0.08)',
                                                                         borderRadius: '6px',
                                                                         color: '#38BDF8',
                                                                         padding: '6px 8px',
                                                                         fontSize: '11px',
                                                                         lineHeight: '1.4',
                                                                         fontFamily: 'inherit',
                                                                         resize: 'vertical',
                                                                     }}
                                                                 />
                                                             </div>
                                                         </div>
                                                     );
                                                 })}
                                             </div>
                                         </div>
                                     ) : structuredPlan.cuts?.length > 0 ? (
                                         <div style={{ marginBottom: 10 }}>
                                             <p style={{ margin: '0 0 6px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>§3 — Cut Plan ({structuredPlan.cuts.length} cuts · {duration}s)</p>
                                             <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                 {(() => {
                                                     let elapsed = 0;
                                                     const moveColors = { STEADICAM: '#6ee7b7', 'DOLLY-IN': '#93c5fd', 'DOLLY-OUT': '#93c5fd', 'RACK-FOCUS': '#fca5a5', ARC: '#c4b5fd', 'PULL-OUT': '#fdba74', CRANE: '#f9a8d4', HANDHELD: '#fde68a', STATIC: '#e2e8f0', 'WHIP-PAN': '#f87171', 'PUSH-IN': '#93c5fd' };
                                                     return structuredPlan.cuts.map((cut, i) => {
                                                         const start = elapsed;
                                                         const end = elapsed + cut.duration;
                                                         elapsed = end;
                                                         const moveColor = moveColors[cut.move] || 'rgba(255,255,255,0.5)';
                                                         return (
                                                             <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 9px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                                                                 <div style={{ width: 18, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginTop: 1 }}>{cut.id}</div>
                                                                 <div style={{ flex: 1, minWidth: 0 }}>
                                                                     <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 3, alignItems: 'center' }}>
                                                                         <span style={{ fontSize: 9, color: 'rgba(255,200,50,0.75)', background: 'rgba(255,200,50,0.08)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{cut.lens}</span>
                                                                         <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>{cut.shot}</span>
                                                                         <span style={{ fontSize: 9, color: moveColor, background: `${moveColor}18`, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{cut.move}</span>
                                                                         <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{start}s–{end}s</span>
                                                                     </div>
                                                                     <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.42)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cut.scene}</p>
                                                                     {cut.voiceover && (
                                                                         <p style={{ margin: '2px 0 0', fontSize: 10, color: 'rgba(56,189,248,0.75)', lineHeight: 1.4, fontStyle: 'italic' }}>VO: "{cut.voiceover}"</p>
                                                                     )}
                                                                 </div>
                                                             </div>
                                                         );
                                                     });
                                                 })()}
                                             </div>
                                         </div>
                                     ) : null}

                                     {/* Section 4 — Mood + Arc */}
                                     {(structuredPlan.moodKeywords?.length > 0 || structuredPlan.emotionalArc || structuredPlan.cinematographyRules) && (
                                         <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}>
                                             <p style={{ margin: '0 0 6px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 700 }}>§4 — Lighting / Mood / Style</p>
                                             {structuredPlan.moodKeywords?.length > 0 && (
                                                 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                                                     {structuredPlan.moodKeywords.map((kw, i) => (
                                                         <span key={i} style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: 'rgba(139,92,246,0.12)', color: 'rgba(196,181,253,0.8)', border: '1px solid rgba(139,92,246,0.18)', fontWeight: 500 }}>{kw}</span>
                                                     ))}
                                                 </div>
                                             )}
                                             {structuredPlan.emotionalArc && (
                                                 <p style={{ margin: '0 0 4px', fontSize: 10, color: 'rgba(255,200,50,0.6)', fontStyle: 'italic' }}>Arc: {structuredPlan.emotionalArc}</p>
                                             )}
                                             {structuredPlan.cinematographyRules && (
                                                 <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.32)', lineHeight: 1.5 }}>{structuredPlan.cinematographyRules}</p>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             )}

                         </div>
                     </div>

                    {/* Settings Confirmation Panel */}
                    {phase === 'review' && (
                        <div className="sb-settings-confirm-panel" style={{
                            margin: '24px auto 0',
                            maxWidth: '1200px',
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            padding: '16px 24px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '20px',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: '#C084FC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>settings</span>
                                    Verify Production Settings
                                </div>
                                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                                    Confirm target AI model, output resolution, and sync parameters before initiating rendering
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
                                {/* Model Selector */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Generation Model</label>
                                    <CfgMenu value={model} onChange={setModel} options={MODELS} icon="play_circle" />
                                </div>

                                {/* Resolution Selector */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Resolution</label>
                                    <CfgMenu value={resolution} onChange={setResolution} options={RESOLUTIONS} icon="aspect_ratio" />
                                </div>

                                {/* Audio Sync Toggle */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Audio ASR Sync</label>
                                    <button 
                                        type="button"
                                        onClick={() => setAudioSync(!audioSync)}
                                        style={{
                                            height: '38px',
                                            padding: '0 16px',
                                            borderRadius: '8px',
                                            background: audioSync ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                            border: audioSync ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                            color: audioSync ? '#34d399' : '#f87171',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                            {audioSync ? 'sync' : 'sync_disabled'}
                                        </span>
                                        {audioSync ? 'Sync Enabled' : 'Sync Disabled'}
                                    </button>
                                </div>

                                {/* Branding Toggle */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Brand DNA Close</label>
                                    <button 
                                        type="button"
                                        onClick={() => setIncludeBranding(!includeBranding)}
                                        style={{
                                            height: '38px',
                                            padding: '0 16px',
                                            borderRadius: '8px',
                                            background: includeBranding ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                            border: includeBranding ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                                            color: includeBranding ? '#A78BFA' : 'rgba(255,255,255,0.4)',
                                            fontSize: '13px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                            {includeBranding ? 'verified' : 'circle'}
                                        </span>
                                        {includeBranding ? 'Branding ON' : 'Branding OFF'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action bar */}
                    <div className="sb-action-bar">
                        {phase === 'review' && (
                            <>
                                <button className="sb-btn-ghost" onClick={() => setPhase('input')}>
                                    <span className="material-symbols-outlined">arrow_back</span>
                                    Edit Brief
                                </button>
                                <div className="sb-action-right">
                                    <span className="sb-credits-hint">
                                        {duration > 15
                                            ? `~${getStoryboardCredits(model, duration, resolution)} credits · ${Math.ceil(duration / (model === 'gemini-flash' ? 6 : (['veo-3.1', 'veo-3.1-fast', 'hunyuan'].includes(model) ? 8 : 10)))} segments`
                                            : `~${getStoryboardCredits(model, duration, resolution)} credits · 1 I2V shot`}
                                    </span>
                                    <button className="sb-animate-btn" onClick={handleAnimate}>
                                        <span className="material-symbols-outlined">play_circle</span>
                                        {duration > 15 ? 'Generate Long Film' : 'Animate Full Film'}
                                    </button>
                                </div>
                            </>
                        )}

                        {phase === 'animating' && (
                            <div className="sb-animating-bar">
                                <div className="sb-overall-progress">
                                    <span>{phaseLabel || 'Animating film...'}</span>
                                    <div className="sb-progress-track">
                                        <div className="sb-progress-fill-overall" style={{ width: `${overallProgress}%` }} />
                                    </div>
                                    <span>{overallProgress}%</span>
                                </div>
                                {eta && (
                                    <div style={{ marginTop: '6px', fontSize: '12px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-start' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>schedule</span>
                                        {eta}
                                    </div>
                                )}
                                {phaseDetail && !isLongForm && (
                                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{phaseDetail}</p>
                                )}
                                {isLongForm && generateMode === 'automatic' && (
                                    <div className="sb-lf-progress-detail">
                                        {segmentInfo && segmentInfo.total > 0 && (
                                            <div className="sb-lf-segments">
                                                {Array.from({ length: segmentInfo.total }, (_, i) => (
                                                    <span
                                                        key={i}
                                                        className={`sb-lf-seg-dot ${i < segmentInfo.completed ? 'done' : i === segmentInfo.completed ? 'active' : ''}`}
                                                        title={`Segment ${i + 1}`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {phaseDetail && <span className="sb-lf-detail">{phaseDetail}</span>}
                                    </div>
                                )}
                                {/* Stop Generation button — only for long-form */}
                                {isLongForm && (
                                    <button
                                        className="sb-stop-btn"
                                        onClick={handleStopGeneration}
                                        disabled={isCancelling}
                                        title="Stop video generation"
                                    >
                                        <span className="material-symbols-outlined">{isCancelling ? 'hourglass_empty' : 'stop_circle'}</span>
                                        {isCancelling ? 'Stopping...' : 'Stop Generation'}
                                    </button>
                                )}
                                {/* Show the generated video prompt so user can see what Claude wrote */}
                                {generatedVideoPrompt && (
                                    <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}>
                                        <p style={{ margin: '0 0 6px', fontSize: 10, color: 'rgba(255,200,50,0.7)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 4 }}>auto_awesome</span>
                                            Generated Video Prompt
                                        </p>
                                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {generatedVideoPrompt.substring(0, 400)}{generatedVideoPrompt.length > 400 ? '...' : ''}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Manual Mode: Segment Gallery ─────────────────────────────────── */}
                        {isLongForm && (phase === 'animating' || phase === 'complete' || phase === 'review') && segmentItems.length > 0 && (
                            <div className="sb-segment-gallery">
                                <div className="sb-seg-gallery-header">
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(139,92,246,0.8)' }}>view_module</span>
                                    <span>Segment Review</span>
                                    <span className="sb-seg-gallery-count" style={{ marginLeft: 8 }}>
                                        {segmentItems.filter(s => s.status === 'completed').length}/{segmentItems.length} ready
                                    </span>
                                    {segmentItems.some(s => s.status !== 'completed') && (
                                        <button
                                            type="button"
                                            className="scott-btn-cfg"
                                            style={{
                                                marginLeft: 'auto',
                                                padding: '5px 12px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontSize: '11px',
                                                background: 'linear-gradient(90deg, #ec4899, #8b5cf6)',
                                                border: 'none',
                                                color: '#fff',
                                                cursor: 'pointer',
                                                borderRadius: '8px',
                                                fontWeight: 'bold',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 4px 12px rgba(236, 72, 153, 0.2)'
                                            }}
                                            onClick={handleGenerateAllSegments}
                                            disabled={isBatchGeneratingSegments}
                                        >
                                            {isBatchGeneratingSegments ? (
                                                <>
                                                    <span className="material-symbols-outlined animate-spin" style={{ fontSize: 14 }}>sync</span>
                                                    <span>Generating All...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>auto_awesome</span>
                                                    <span>Generate All Segments</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div className="sb-seg-grid">
                                    {segmentItems.map((seg, i) => {
                                        const isRegen = regenSegIdx === i;
                                        const isDone  = seg.status === 'completed';
                                        const isFail  = seg.status === 'failed';
                                        const isGen   = seg.status === 'generating' || seg.status === 'pending';
                                        const editP   = editedPrompts[i] !== undefined ? editedPrompts[i] : (seg.prompt || '');
                                        return (
                                            <div key={i} className={`sb-seg-card ${isDone ? 'done' : isFail ? 'failed' : ''}`}>
                                                {/* Video / placeholder */}
                                                <div className="sb-seg-card__media">
                                                    {isDone && seg.videoUrl ? (
                                                         (() => {
                                                             const proxiedUrl = seg.videoUrl.startsWith('http') && !seg.videoUrl.includes('localhost')
                                                                 ? `${API.replace('/video-studio', '')}/media/proxy?url=${encodeURIComponent(seg.videoUrl)}`
                                                                 : seg.videoUrl;
                                                             return (
                                                                 <>
                                                                     <video
                                                                         src={proxiedUrl}
                                                                         autoPlay muted loop playsInline
                                                                         style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }}
                                                                     />
                                                                     <div className="sb-seg-media-overlay">
                                                                         <button className="sb-seg-overlay-btn" onClick={(e) => { e.stopPropagation(); setPreviewVideo(proxiedUrl); }} title="Play Fullscreen">
                                                                             <span className="material-symbols-outlined">play_arrow</span>
                                                                         </button>
                                                                         <a href={proxiedUrl} download={`segment-${i + 1}.mp4`} className="sb-seg-overlay-btn" title="Download Video" target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                                                             <span className="material-symbols-outlined">download</span>
                                                                         </a>
                                                                     </div>
                                                                 </>
                                                             );
                                                         })()
                                                    ) : isRegen ? (
                                                        <div className="sb-seg-card__spin">
                                                            <span className="material-symbols-outlined spin" style={{ fontSize: 28, color: 'rgba(139,92,246,0.7)' }}>sync</span>
                                                            <span>Regenerating…</span>
                                                        </div>
                                                    ) : isGen ? (
                                                        <div className="sb-seg-card__spin">
                                                            <span className="material-symbols-outlined spin" style={{ fontSize: 28, color: 'rgba(255,255,255,0.3)' }}>autorenew</span>
                                                            <span>{seg.progress > 0 ? `${seg.progress}%` : 'Queued'}</span>
                                                        </div>
                                                    ) : isFail ? (
                                                        <div className="sb-seg-card__spin">
                                                            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'rgba(239,68,68,0.7)' }}>error</span>
                                                            <span>Failed</span>
                                                        </div>
                                                    ) : (
                                                        <div className="sb-seg-card__spin">
                                                            <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'rgba(255,255,255,0.15)' }}>videocam</span>
                                                            <span>Pending</span>
                                                        </div>
                                                    )}
                                                    {/* Badge */}
                                                    <div className="sb-seg-card__badge">
                                                        Seg {i + 1}{seg.duration ? ` · ${seg.duration}s` : ''}
                                                    </div>
                                                </div>

                                                {/* Prompt editor */}
                                                <div className="sb-seg-card__prompt-wrap">
                                                    <textarea
                                                        className="sb-seg-card__prompt"
                                                        rows={3}
                                                        value={editP}
                                                        onChange={e => setEditedPrompts(prev => ({ ...prev, [i]: e.target.value }))}
                                                        placeholder="Edit prompt before regenerating…"
                                                        disabled={isRegen}
                                                    />
                                                </div>

                                                {/* Actions */}
                                                <div className="sb-seg-card__actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
                                                     {isDone && seg.videoUrl && (
                                                         (() => {
                                                             const proxiedUrl = seg.videoUrl.startsWith('http') && !seg.videoUrl.includes('localhost')
                                                                 ? `${API.replace('/video-studio', '')}/media/proxy?url=${encodeURIComponent(seg.videoUrl)}`
                                                                 : seg.videoUrl;
                                                             return (
                                                                 <>
                                                                     <button
                                                                         className="sb-seg-action-btn-secondary"
                                                                         onClick={() => setPreviewVideo(proxiedUrl)}
                                                                         title="Play Fullscreen"
                                                                         style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                                                                     >
                                                                         <span className="material-symbols-outlined" style={{ fontSize: 14 }}>play_arrow</span>
                                                                         Play
                                                                     </button>
                                                                     <a
                                                                         href={proxiedUrl}
                                                                         download={`segment-${i + 1}.mp4`}
                                                                         className="sb-seg-action-btn-secondary"
                                                                         title="Download Video"
                                                                         target="_blank"
                                                                         rel="noreferrer"
                                                                         style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 9px', borderRadius: 7, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
                                                                     >
                                                                         <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
                                                                         Download
                                                                     </a>
                                                                 </>
                                                             );
                                                         })()
                                                     )}
                                                    <button
                                                        className="sb-seg-regen-btn"
                                                        onClick={() => {
                                                            setTargetRegenIdx(i);
                                                            setShowRegenOptionModal(true);
                                                        }}
                                                        disabled={isRegen || isCompiling}
                                                        title="Regenerate this segment"
                                                    >
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                                                        {isRegen ? 'Regenerating…' : 'Regenerate'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Compile bar */}
                                <div className="sb-compile-bar">
                                    <span className="sb-compile-info">
                                        {segmentItems.filter(s => s.status === 'completed').length < segmentItems.length
                                            ? `${segmentItems.filter(s => s.status === 'completed').length}/${segmentItems.length} segments ready`
                                            : 'All segments ready ✓'}
                                    </span>
                                    <button
                                        className="sb-compile-btn"
                                        onClick={handleCompile}
                                        disabled={isCompiling || segmentItems.filter(s => s.status === 'completed').length === 0}
                                    >
                                        {isCompiling ? (
                                            <><span className="material-symbols-outlined spin" style={{ fontSize: 14 }}>autorenew</span> Compiling…</>
                                        ) : (
                                            <><span className="material-symbols-outlined" style={{ fontSize: 14 }}>merge</span> Compile Final Film</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {phase === 'complete' && (
                            <div className="sb-complete-bar">
                                <div className="sb-complete-left">
                                    <span className="material-symbols-outlined sb-complete-icon">check_circle</span>
                                    <span>Ad film complete!</span>
                                </div>
                                <div className="sb-complete-right">
                                    {finalVideoUrl && (
                                        <a href={finalVideoUrl} download className="sb-btn-primary" target="_blank" rel="noreferrer">
                                            <span className="material-symbols-outlined">download</span>
                                            Download Final Film
                                        </a>
                                    )}
                                    <button className="sb-btn-ghost" onClick={() => {
                                        setPhase('input'); setPlan(null); setImageUrl(''); setImagePrompt(''); setGeneratedVideoPrompt(''); setStructuredPlan(null);
                                        setProjectId(null); setFinalVideoUrl(null); setProjectTitle('Untitled');
                                        // Clear any lingering brief-media state so next job starts clean
                                        if (briefSourceFile?.preview?.startsWith('blob:')) URL.revokeObjectURL(briefSourceFile.preview);
                                        setBriefSourceFile(null); setBriefAnalysisResult(null);
                                        setPreSeededCuts(null); setBriefAudioDuration(null);
                                    }}>
                                        <span className="material-symbols-outlined">add</span>
                                        New Storyboard
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Final film player */}
                    {phase === 'complete' && finalVideoUrl && (
                        <div className="sb-final-player has-vha" style={{ position: 'relative', display: 'inline-block' }}>
                            <h3 className="sb-final-title">🎬 Final Ad Film</h3>
                            <video src={finalVideoUrl} controls className="sb-final-video" />
                            <VideoHoverActions videoUrl={finalVideoUrl} onPreview={setPreviewVideo} project={projects?.find(p => (p.storyboard?.finalVideoUrl || p.finalVideoUrl) === finalVideoUrl)} onReuse={handleReuse} />
                        </div>
                    )}
                </div>
            )}

            {/* History Grid */}
            {projects && projects.length > 0 && (
                <div style={{ width: '100%', maxWidth: '1200px', marginTop: '40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>Previously Generated</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', width: '100%' }}>
                        {projects.filter(p => p.studioMode === 'storyboard' && (p.storyboard?.finalVideoUrl || p.finalVideoUrl)).map(p => {
                            const url = p.storyboard?.finalVideoUrl || p.finalVideoUrl;
                            
                            return (
                                <div key={p._id} className="has-vha" style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#111', cursor: 'pointer', height: '320px', flex: '0 0 auto', width: 'auto' }} onClick={() => setPreviewVideo(url)}>
                                    <video src={url} autoPlay loop muted playsInline style={{ height: '100%', width: 'auto', objectFit: 'contain', display: 'block', minWidth: '180px' }} />
                                    <VideoHoverActions videoUrl={url} onPreview={setPreviewVideo} project={p} onReuse={handleReuse} />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

        </div>
        
        {/* Video Preview Modal */}
        {previewVideo && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }} onClick={() => setPreviewVideo(null)}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }} onClick={e => e.stopPropagation()}>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', maxWidth: '100%', maxHeight: '100%' }}>
                        <video src={previewVideo} controls autoPlay playsInline muted={false} ref={el => { if(el){ el.muted = false; el.volume = 1; const p = el.play(); if(p!==undefined) p.catch(()=>{}); } }} style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 16, boxShadow: '0 20px 80px rgba(0,0,0,0.6)', objectFit: 'contain' }} />
                        <div style={{ position: 'absolute', top: -48, right: 0, display: 'flex', gap: 8 }}>
                            <a href={previewVideo} download="storyboard-video.mp4" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Download
                            </a>
                            <button onClick={() => setPreviewVideo(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Image Preview Modal (Lightbox) */}
        {previewImage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }} onClick={() => setPreviewImage(null)}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }} onClick={e => e.stopPropagation()}>
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', maxWidth: '100%', maxHeight: '100%' }}>
                        <img src={previewImage} style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 16, boxShadow: '0 20px 80px rgba(0,0,0,0.6)', objectFit: 'contain' }} alt="Storyboard Zoom Preview" />
                        <div style={{ position: 'absolute', top: -48, right: 0, display: 'flex', gap: 8 }}>
                            <button onClick={() => handleDownloadImage(previewImage)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span> Download
                            </button>
                            <button onClick={() => setPreviewImage(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 8, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', backdropFilter: 'blur(8px)' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Storyboard Option Modal for Segment/Sequence Regeneration */}
        {showRegenOptionModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                <div style={{ background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px', maxWidth: '420px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700, color: '#fff' }}>Regenerate Options</h3>
                    <p style={{ margin: '0 0 24px', fontSize: 13, lineHeight: '1.5', color: 'rgba(255,255,255,0.6)' }}>
                        Choose whether to regenerate only this clip, or start generating the entire remaining sequence from this clip onward.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                            onClick={() => {
                                setShowRegenOptionModal(false);
                                handleRegenSegment(targetRegenIdx);
                            }}
                            className="sb-btn-primary"
                            style={{ justifyContent: 'center', width: '100%', gap: 8 }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>filter_1</span>
                            Regenerate only this clip
                        </button>
                        <button
                            onClick={() => {
                                setShowRegenOptionModal(false);
                                handleRegenSequenceFrom(targetRegenIdx);
                            }}
                            className="sb-btn-primary"
                            style={{ justifyContent: 'center', width: '100%', gap: 8, background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)' }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>fast_forward</span>
                            Regenerate sequence from here
                        </button>
                        <button
                            onClick={() => setShowRegenOptionModal(false)}
                            className="sb-btn-ghost"
                            style={{ justifyContent: 'center', width: '100%', border: '1px solid rgba(255,255,255,0.08)', background: 'transparent', color: '#fff', cursor: 'pointer' }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

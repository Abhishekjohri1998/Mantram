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

const DURATIONS = [
    { value: 5,   label: '5s (Short)' },
    { value: 10,  label: '10s (Bumper)' },
    { value: 15,  label: '15s (Standard)' },
    { value: 30,  label: '30s (Hero)' },
    { value: 60,  label: '60s (Long)' },
    { value: 90,  label: '90s (Extended) ★' },
    { value: 120, label: '2 min (Epic) ★' },
];

const MODELS = [
    { value: 'seedance-2.0-fast', label: 'Seedance Fast' },
    { value: 'seedance-2.0', label: 'Seedance 2.0' },
    { value: 'kling-3.0', label: 'Kling 3.0' },
    { value: 'gemini-flash', label: 'Gemini Flash Video' }
];

const RESOLUTIONS = [
    { value: '480p', label: '480p SD' },
    { value: '720p', label: '720p HD' },
    { value: '1080p', label: '1080p FHD' },
    { value: '2k', label: '2K QHD' }
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
export default function Storyboard({ activeBrand, projects = [], onVideoComplete, canCreateVideo, onUpgradeRequired, user }) {
    // ── Input state ──
    const [brief, setBrief] = useState('');
    const [productName, setProductName] = useState('');
    const [productImages, setProductImages] = useState([]); // { file, preview }
    const [productUrlInput, setProductUrlInput] = useState('');
    const [isScrapingUrl, setIsScrapingUrl] = useState(false);
    const [avatarImage, setAvatarImage] = useState(null);  // { file, preview }
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [defaultStyle, setDefaultStyle] = useState('hyperrealistic');
    const [format, setFormat] = useState('9:16'); // Default to 9:16 for storyboard grids
    const [duration, setDuration] = useState(5);
    const [model, setModel] = useState('seedance-2.0-fast');
    const [resolution, setResolution] = useState('480p');
    const [directorModel, setDirectorModel] = useState('claude'); // 'claude' or 'gemini'
    const [imageModel, setImageModel] = useState('gpt-image-2'); // default: GPT Image 2
    const [dialogueLanguage, setDialogueLanguage] = useState('English');

    // ── Generated storyboard state ──
    const [phase, setPhase] = useState('input'); // 'input' | 'directing' | 'storyboarding' | 'review' | 'animating' | 'complete'
    const [plan, setPlan] = useState(null);       // full storyboard plan from API
    const [imageUrl, setImageUrl] = useState('');
    const [imagePrompt, setImagePrompt] = useState('');
    const [videoPrompt, setVideoPrompt] = useState('');
    
    const [projectId, setProjectId] = useState(null);
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
    
    const pollRef = useRef(null);

    const productInputRef = useRef();
    const avatarInputRef = useRef();

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
        setProductImages(files.map(f => ({ file: f, preview: URL.createObjectURL(f) })));
    };

    const handleAvatarImage = (e) => {
        const f = e.target.files?.[0];
        if (f) setAvatarImage({ file: f, preview: URL.createObjectURL(f) });
    };

    const handleAvatarPickerSelect = (avatar) => {
        if (avatar && avatar.imageUrl) {
            setAvatarImage({ file: avatar.imageUrl, preview: avatar.imageUrl, name: avatar.name });
        }
    };

    const handleAvatarUrl = (e) => {
        e.stopPropagation();
        const url = window.prompt("Enter Avatar Image URL:");
        if (url) setAvatarImage({ file: url, preview: url });
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
            alert("Failed to scrape URL. The website might be blocking bots. Please upload the image manually.");
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
                if (data.videoPrompt) setVideoPrompt(data.videoPrompt);
            }
        } catch (e) {
            console.error('Regen poster error:', e);
            setError('Failed to regenerate poster');
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
            fd.append('resolution', resolution); // ✅ Pass resolution so NanoBanana uses correct imageSize
            productImages.forEach(pi => {
                if (typeof pi.file === 'string') fd.append('productImageUrls', pi.file);
                else fd.append('productImages', pi.file);
            });
            if (avatarImage) {
                if (typeof avatarImage.file === 'string') fd.append('avatarUrl', avatarImage.file);
                else fd.append('avatarImage', avatarImage.file);
            }
            fd.append('directorModel', directorModel);
            fd.append('imageModel', imageModel);
            fd.append('dialogueLanguage', dialogueLanguage);

            setPhase('storyboarding');

            const res = await fetch(`${API}/storyboard/create`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: fd,
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Storyboard generation failed');

            setProjectId(data.projectId);
            setPlan(data.plan);
            if (data.plan) {
                setImageUrl(data.plan.imageUrl);
                setImagePrompt(data.plan.imagePrompt);
                setVideoPrompt(data.plan.videoPrompt);
                if (data.plan.dialogueLanguage) setDialogueLanguage(data.plan.dialogueLanguage);
            }
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
        setPhaseLabel('');
        setPhaseDetail('');
        setSegmentInfo(null);

        try {
            const res = await fetch(`${API}/storyboard/animate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({
                    projectId,
                    imageUrl,
                    videoPrompt,
                    duration,
                    format,
                    resolution,
                    productImageUrls: productImages
                        .map(pi => typeof pi.file === 'string' ? pi.file : null)
                        .filter(Boolean),
                    avatarUrl: avatarImage && typeof avatarImage.file === 'string' ? avatarImage.file : undefined,
                    model,
                    brandId: activeBrand?._id,
                }),
            });

            const data = await safeJson(res);
            if (!data.success) throw new Error(data.error || 'Animation failed to start');

            if (data.longForm) {
                setIsLongForm(true);
                setPhaseLabel('Planning segments...');
                setPhaseDetail(`${data.segments || Math.ceil(duration / 10)} segments will be generated`);
            }

            // Start polling — long-form uses 10s interval, single-shot uses 4s
            startPolling(!!data.longForm);
        } catch (e) {
            setError(e.message);
            setPhase('review');
        }
    };

    // ── Polling for animation status ──
    const startPolling = useCallback((longForm = false) => {
        if (pollRef.current) clearInterval(pollRef.current);
        // Long-form jobs can take hours — poll less aggressively to avoid backend hammering
        const intervalMs = longForm ? 10000 : 4000;
        pollRef.current = setInterval(async () => {
            if (!projectId) return;
            try {
                const res = await fetch(`${API}/storyboard/status/${projectId}`, {
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
                }

                if (data.finalVideoUrl) setFinalVideoUrl(data.finalVideoUrl);

                if (data.allDone || data.status === 'COMPLETED') {
                    clearInterval(pollRef.current);
                    setPhase('complete');
                    onVideoComplete?.();
                } else if (data.status === 'FAILED') {
                    clearInterval(pollRef.current);
                    setError('Animation generation failed.');
                    setPhase('review');
                }
            } catch (e) {
                console.warn('Poll error:', e.message);
            }
        }, intervalMs);
    }, [projectId, onVideoComplete]);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
                        <h2 className="sb-title">Storyboard Director</h2>
                        <p className="sb-subtitle">Claude writes your shot plan · Gemini generates frames · Seedance animates</p>
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
                    <div className="scott-panel" style={{ flexDirection: 'column', gap: 8, padding: '12px 16px', maxWidth: '1050px' }}>
                        
                        {/* Row 1: Brief input */}
                        <div className="scott-input-wrapper" style={{ width: '100%' }}>
                            <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.3)', marginRight: 10, fontSize: 18 }}>edit</span>
                            <DebouncedInput
                                className="scott-input"
                                placeholder="Describe your ad film... e.g. 'Create a 30s emotional ad for our protein powder targeting young fitness enthusiasts...'"
                                value={brief}
                                onChange={setBrief}
                                disabled={isLoading}
                            />
                        </div>

                        {/* Row 2: Config + blocks + generate */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', flexWrap: 'wrap' }}>
                            
                            <CfgMenu value={format} onChange={setFormat} options={FORMATS} icon="crop" />
                            <CfgMenu value={resolution} onChange={setResolution} options={RESOLUTIONS} icon="hd" />
                            <CfgMenu value={duration} onChange={setDuration} options={DURATIONS} icon="timer" />
                            
                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />
                            
                            <CfgMenu value={model} onChange={setModel} options={MODELS} icon="smart_toy" />
                            <CfgMenu value={directorModel} onChange={setDirectorModel} options={DIRECTOR_MODELS} icon="movie_filter" />
                            <CfgMenu value={imageModel} onChange={setImageModel} options={IMAGE_MODELS} icon="image" />
                            <CfgMenu value={dialogueLanguage} onChange={setDialogueLanguage} options={LANGUAGES} icon="translate" />

                            <div style={{ flex: 1 }} />
                            
                            {/* Product Block */}
                            {productImages.length === 0 ? (
                                <button className="scott-block-btn" onClick={() => productInputRef.current?.click()}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>inventory_2</span>
                                    <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>PRODUCT</span>
                                </button>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '3px 6px 3px 4px', maxWidth: 240, overflowX: 'auto', flexShrink: 0 }}>
                                    {productImages.map((pi, idx) => (
                                        <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                                            <img
                                                src={pi.preview}
                                                alt={`product-${idx + 1}`}
                                                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 5, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setProductImages(prev => prev.filter((_, i) => i !== idx)); }}
                                                style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#ef4444', border: 'none', color: '#fff', fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1, padding: 0, zIndex: 3 }}
                                            >✕</button>
                                        </div>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => productInputRef.current?.click()}
                                        style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 5, background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        title="Add more images"
                                    >+</button>
                                </div>
                            )}
                            <input ref={productInputRef} type="file" accept="image/*" multiple hidden onChange={handleProductImages} />

                            {/* Avatar Block */}
                            <button className={`scott-block-btn ${avatarImage ? 'active' : ''}`} onClick={() => setShowAvatarPicker(true)}>
                                {avatarImage ? (
                                    <img src={avatarImage.preview} className="scott-block-img" alt="avatar" />
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>person</span>
                                        <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>AVATAR</span>
                                    </>
                                )}
                            </button>

                            {/* Generate */}
                            <button className="scott-generate" onClick={handleGenerate} disabled={isLoading}>
                                {isLoading ? (
                                    <><span className="material-symbols-outlined spin" style={{ fontSize: 16 }}>autorenew</span> Writing...</>
                                ) : (
                                    <>GET STORYBOARD <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span></>
                                )}
                            </button>
                        </div>
                        
                        {/* URL input row for product */}
                        <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'center', padding: '4px 8px 0', borderTop: '1px dashed rgba(255,255,255,0.05)', marginTop: 4 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>link</span>
                            <DebouncedInput 
                                className="scott-input" 
                                style={{ padding: '4px 0', fontSize: 12, flex: 1 }}
                                placeholder="Paste product URL (optional)..." 
                                value={productUrlInput}
                                onChange={setProductUrlInput}
                                disabled={isScrapingUrl}
                            />
                            {productUrlInput && (
                                <button className="sb-url-add-btn" onClick={handleProductUrlAdd} disabled={isScrapingUrl}>
                                    {isScrapingUrl ? 'Scraping...' : 'Add URL'}
                                </button>
                            )}
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
                            <div className="sb-poster-wrap">
                                {imageUrl ? (
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

                            <div className="sb-prompt-group">
                                <label className="sb-prompt-label">
                                    <span className="material-symbols-outlined">translate</span>
                                    Dialogue Language
                                </label>
                                <CfgMenu value={dialogueLanguage} onChange={setDialogueLanguage} options={LANGUAGES} icon="translate" />
                            </div>

                            <div className="sb-prompt-group">
                                <label className="sb-prompt-label">
                                    <span className="material-symbols-outlined">movie</span>
                                    Seedance Video Prompt
                                </label>
                                <textarea
                                    className="sb-prompt-textarea"
                                    rows={5}
                                    value={videoPrompt}
                                    onChange={e => setVideoPrompt(e.target.value)}
                                    placeholder="Prompt for animating the poster into a cohesive long-duration film..."
                                />
                            </div>
                        </div>
                    </div>

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
                                            ? `~${Math.ceil(duration / 10) * 15} credits · ${Math.ceil(duration / 10)} segments`
                                            : '~15 credits · 1 I2V shot'}
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
                                {isLongForm && (
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
                                        setPhase('input'); setPlan(null); setImageUrl(''); setImagePrompt(''); setVideoPrompt('');
                                        setProjectId(null); setFinalVideoUrl(null);
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
        </>
    );
}

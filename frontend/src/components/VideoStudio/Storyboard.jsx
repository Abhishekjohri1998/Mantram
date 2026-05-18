import { useState, useRef, useCallback, useEffect } from 'react';
import './Storyboard.css';
import AvatarPicker from './AvatarPicker';
import { products } from '../../services/api';

const API = '/api/video-studio';

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
    { value: 5, label: '5s (Short)' },
    { value: 10, label: '10s (Bumper)' },
    { value: 15, label: '15s (Standard)' },
    { value: 30, label: '30s (Hero)' },
    { value: 60, label: '60s (Long)' }
];

const MODELS = [
    { value: 'seedance-2.0-fast', label: 'Seedance Fast' },
    { value: 'seedance-2.0', label: 'Seedance 2.0' },
    { value: 'kling-3.0', label: 'Kling 3.0' }
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
export default function Storyboard({ activeBrand, canCreateVideo, onUpgradeRequired, user }) {
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
    const [resolution, setResolution] = useState('2k');
    const [directorModel, setDirectorModel] = useState('claude'); // 'claude' or 'gemini'
    const [imageModel, setImageModel] = useState('gpt-image-2'); // 'nanobanana' or 'gemini'

    // ── Generated storyboard state ──
    const [phase, setPhase] = useState('input'); // 'input' | 'directing' | 'storyboarding' | 'review' | 'animating' | 'complete'
    const [plan, setPlan] = useState(null);       // full storyboard plan from API
    const [imageUrl, setImageUrl] = useState('');
    const [imagePrompt, setImagePrompt] = useState('');
    const [videoPrompt, setVideoPrompt] = useState('');
    
    const [projectId, setProjectId] = useState(null);
    const [error, setError] = useState('');
    const [finalVideoUrl, setFinalVideoUrl] = useState(null);
    const [overallProgress, setOverallProgress] = useState(0);
    const [regenLoading, setRegenLoading] = useState(false);
    
    const pollRef = useRef(null);

    const productInputRef = useRef();
    const avatarInputRef = useRef();

    // ── Product image upload ──
    const handleProductImages = (e) => {
        const files = Array.from(e.target.files || []).slice(0, 4);
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
            if (r?.product?.image) {
                setProductImages(prev => [...prev, { file: r.product.image, preview: r.product.image }]);
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

    // ── Regen single poster ──
    const handleRegenPoster = useCallback(async () => {
        setRegenLoading(true);
        try {
            const res = await fetch(`${API}/storyboard/regen-poster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: JSON.stringify({ projectId, imagePrompt, style: defaultStyle, format, imageModel }),
            });
            const data = await res.json();
            if (data.success && data.imageUrl) {
                setImageUrl(data.imageUrl);
            }
        } catch (e) {
            console.error('Regen poster error:', e);
            setError('Failed to regenerate poster');
        } finally {
            setRegenLoading(false);
        }
    }, [projectId, imagePrompt, defaultStyle, format, imageModel]);

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

            setPhase('storyboarding');

            const res = await fetch(`${API}/storyboard/create`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` },
                body: fd,
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Storyboard generation failed');

            setProjectId(data.projectId);
            setPlan(data.plan);
            if (data.plan) {
                setImageUrl(data.plan.imageUrl);
                setImagePrompt(data.plan.imagePrompt);
                setVideoPrompt(data.plan.videoPrompt);
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
                    productImageUrls: productImages.filter(pi => typeof pi === 'string'),
                    model,
                    brandId: activeBrand?._id,
                }),
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Animation failed to start');

            // Start polling
            startPolling();
        } catch (e) {
            setError(e.message);
            setPhase('review');
        }
    };

    // ── Polling for animation status ──
    const startPolling = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            if (!projectId) return;
            try {
                const res = await fetch(`${API}/storyboard/status/${projectId}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('mantram_token')}` }
                });
                const data = await res.json();
                if (!data.success) return;

                setOverallProgress(data.overallProgress || 0);

                if (data.finalVideoUrl) setFinalVideoUrl(data.finalVideoUrl);

                if (data.allDone || data.status === 'COMPLETED') {
                    clearInterval(pollRef.current);
                    setPhase('complete');
                } else if (data.status === 'FAILED') {
                    clearInterval(pollRef.current);
                    setError('Animation generation failed.');
                    setPhase('review');
                }
            } catch (e) {
                console.warn('Poll error:', e.message);
            }
        }, 4000);
    }, [projectId]);

    useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

    // ── Render helpers ──
    const isLoading = phase === 'directing' || phase === 'storyboarding';

    return (
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
                            <input
                                type="text"
                                className="scott-input"
                                placeholder="Describe your ad film... e.g. 'Create a 30s emotional ad for our protein powder targeting young fitness enthusiasts...'"
                                value={brief}
                                onChange={e => setBrief(e.target.value)}
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

                            <div style={{ flex: 1 }} />
                            
                            {/* Product Block */}
                            <button className={`scott-block-btn ${productImages.length > 0 ? 'active' : ''}`} onClick={() => productInputRef.current?.click()}>
                                {productImages.length > 0 ? (
                                    <>
                                        <img src={productImages[0].preview} className="scott-block-img" alt="product" />
                                        {productImages.length > 1 && (
                                            <span style={{ position: 'absolute', top: 4, right: 4, background: '#10b981', color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3 }}>
                                                {productImages.length}
                                            </span>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, zIndex: 2 }}>inventory_2</span>
                                        <span style={{ zIndex: 2, fontSize: 9, letterSpacing: 0.5 }}>PRODUCT</span>
                                    </>
                                )}
                            </button>
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
                            <input 
                                type="text" 
                                className="scott-input" 
                                style={{ padding: '4px 0', fontSize: 12, flex: 1 }}
                                placeholder="Paste product URL (optional)..." 
                                value={productUrlInput}
                                onChange={(e) => setProductUrlInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleProductUrlAdd()}
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
                                    <img src={imageUrl} className="sb-poster-img" alt="Master Storyboard Poster" />
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
                                        ~15 credits · 1 I2V shot
                                    </span>
                                    <button className="sb-animate-btn" onClick={handleAnimate}>
                                        <span className="material-symbols-outlined">play_circle</span>
                                        Animate Full Film
                                    </button>
                                </div>
                            </>
                        )}

                        {phase === 'animating' && (
                            <div className="sb-animating-bar">
                                <div className="sb-overall-progress">
                                    <span>Animating film...</span>
                                    <div className="sb-progress-track">
                                        <div className="sb-progress-fill-overall" style={{ width: `${overallProgress}%` }} />
                                    </div>
                                    <span>{overallProgress}%</span>
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
                        <div className="sb-final-player">
                            <h3 className="sb-final-title">🎬 Final Ad Film</h3>
                            <video src={finalVideoUrl} controls className="sb-final-video" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

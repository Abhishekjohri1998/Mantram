/**
 * ViralityPredictor.jsx — Neural Virality Engine v2
 *
 * A dedicated studio for AI-powered virality analysis.
 * Upload any image or video (via direct S3 presign) → 3-model AI pipeline produces a Neural Virality Score Map.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useBrand } from '../context/BrandContext';
import { viralityPredictor, apiFetch } from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import './ViralityPredictor.css';

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONFIG = {
    viral_ready:    { label: '🔥 Viral Ready',    color: 'var(--sys-primary)', glow: 'var(--sys-primary-dim)',  bg: 'var(--sys-primary-dim)' },
    high_potential: { label: '⚡ High Potential', color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.1)' },
    growing:        { label: '📈 Growing',         color: '#3b82f6', glow: 'rgba(59,130,246,0.4)',  bg: 'rgba(59,130,246,0.1)' },
    needs_work:     { label: '💡 Needs Work',      color: '#6366f1', glow: 'rgba(99,102,241,0.3)',  bg: 'rgba(99,102,241,0.1)' },
};

const PLATFORMS = [
    { id: 'instagram', label: 'Instagram', icon: 'photo_camera' },
    { id: 'tiktok',    label: 'TikTok',    icon: 'music_note' },
    { id: 'youtube',   label: 'YouTube',   icon: 'play_circle' },
    { id: 'linkedin',  label: 'LinkedIn',  icon: 'work' },
    { id: 'twitter',   label: 'Twitter / X', icon: 'tag' },
    { id: 'facebook',  label: 'Facebook',  icon: 'thumb_up' },
];

const NEURAL_REGIONS = [
    { id: 'visualCortex', label: 'Visual Cortex', desc: 'Visual quality, motion, text overlay' },
    { id: 'auditoryCortex', label: 'Auditory Cortex', desc: 'Audio energy, beat sync, voice clarity' },
    { id: 'attentionControl', label: 'Attention Control', desc: 'Hook strength, pattern interrupts' },
    { id: 'limbicSystem', label: 'Limbic System', desc: 'Emotional pull, social currency' },
    { id: 'languageNetwork', label: 'Language Network', desc: 'Narrative velocity, brand clarity' },
];

// ── SVG Brain Heatmap ─────────────────────────────────────────────────────
function BrainHeatmap({ scores }) {
    // Determine which regions have high activation to trigger CSS pulse animations
    const highAct = (score) => score > 75 ? 'pulse-high' : score > 50 ? 'pulse-med' : '';
    
    return (
        <div className="vp-brain-wrap">
            <svg viewBox="0 0 400 400" className="vp-brain-svg">
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                    <linearGradient id="brain-base" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.05)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
                    </linearGradient>
                </defs>
                
                {/* Base Brain Outline (Abstracted) */}
                <path d="M 200 40 C 120 40, 60 100, 50 180 C 40 260, 100 320, 180 340 L 200 360 L 220 340 C 300 320, 360 260, 350 180 C 340 100, 280 40, 200 40 Z" 
                    fill="url(#brain-base)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinejoin="round"/>
                
                {/* Internal Folds (Abstract) */}
                <path d="M 120 100 Q 160 140 200 80 Q 240 140 280 100 M 80 160 Q 140 180 200 140 Q 260 180 320 160 M 70 240 Q 150 220 200 260 Q 250 220 330 240 M 140 300 Q 200 280 260 300" 
                    fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />

                {/* Region Hotspots */}
                {/* Visual Cortex (Back/Bottom) */}
                <circle cx="200" cy="300" r="35" className={`vp-hotspot visual ${highAct(scores.visualCortex)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.visualCortex || 0)/100 }} />
                
                {/* Auditory Cortex (Sides) */}
                <circle cx="100" cy="220" r="30" className={`vp-hotspot auditory ${highAct(scores.auditoryCortex)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.auditoryCortex || 0)/100 }} />
                <circle cx="300" cy="220" r="30" className={`vp-hotspot auditory ${highAct(scores.auditoryCortex)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.auditoryCortex || 0)/100 }} />

                {/* Attention Control (Frontal Lobe) */}
                <circle cx="200" cy="100" r="45" className={`vp-hotspot attention ${highAct(scores.attentionControl)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.attentionControl || 0)/100 }} />

                {/* Limbic System (Deep Center) */}
                <circle cx="200" cy="190" r="40" className={`vp-hotspot limbic ${highAct(scores.limbicSystem)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.limbicSystem || 0)/100 }} />

                {/* Language Network (Temporal/Frontal crossover) */}
                <circle cx="140" cy="150" r="35" className={`vp-hotspot language ${highAct(scores.languageNetwork)}`} filter="url(#glow)" 
                    style={{ opacity: (scores.languageNetwork || 0)/100 }} />
            </svg>
            <div className="vp-brain-scanline" />
        </div>
    );
}

// ── Retention Curve Chart ─────────────────────────────────────────────────
function RetentionCurve({ curve }) {
    if (!curve || curve.length === 0) return null;
    
    // Normalize data to 100x100 SVG space
    const maxSec = curve[curve.length - 1].second || 1;
    const points = curve.map(p => {
        const x = (p.second / maxSec) * 100;
        const y = 100 - p.score; // Invert Y (0 at top in SVG)
        return `${x},${y}`;
    }).join(' L ');
    
    // Add bottom corners to close the path for the fill area
    const areaPoints = `0,100 L ${points} L 100,100 Z`;

    return (
        <div className="vp-curve-container">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="vp-curve-svg">
                <defs>
                    <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="100%">
                        <stop offset="0%" stopColor="var(--sys-primary)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--sys-primary)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                
                {/* Grid lines */}
                <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.05)" />
                <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" />
                <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.05)" />
                
                <path d={`M ${areaPoints}`} fill="url(#curve-fill)" className="vp-curve-area" />
                <path d={`M ${points}`} fill="none" stroke="var(--sys-primary)" strokeWidth="2" strokeLinejoin="round" className="vp-curve-line" />
            </svg>
            <div className="vp-curve-labels">
                <span>0s</span>
                <span>{maxSec}s</span>
            </div>
            <div className="vp-curve-y-labels">
                <span>100%</span>
                <span>50%</span>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function ViralityPredictor() {
    const { brand }  = useBrand();
    const fileRef    = useRef();

    const [file,        setFile]        = useState(null);
    const [previewUrl,  setPreviewUrl]  = useState(null);
    const [mediaUrl,    setMediaUrl]    = useState('');
    const [contentType, setContentType] = useState('image');
    const [platform,    setPlatform]    = useState('instagram');
    const [caption,     setCaption]     = useState('');
    
    const [isDragging,  setIsDragging]  = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [loading,     setLoading]     = useState(false);
    const [stage,       setStage]       = useState('');
    const [result,      setResult]      = useState(null);
    const [error,       setError]       = useState('');

    // ── File handling ───────────────────────────────────────────────────
    const handleFile = useCallback((f) => {
        if (!f) return;
        const isVid = f.type.startsWith('video/');
        setFile(f);
        setContentType(isVid ? 'video' : 'image');
        setPreviewUrl(URL.createObjectURL(f));
        setMediaUrl(''); // clear URL if user selected local file
        setResult(null);
        setError('');
        setUploadProgress(0);
    }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    }, [handleFile]);

    // ── Upload via Presigned S3 ─────────────────────────────────────────
    const uploadFileToS3 = async (f) => {
        setStage('Uploading file securely...');
        setUploadProgress(10);
        
        try {
            // Upload directly via backend to bypass S3 CORS issues
            const formData = new FormData();
            formData.append('file', f);

            // Need to use XMLHttpRequest to track upload progress with FormData
            const token = localStorage.getItem('mantram_token') || localStorage.getItem('token');
            const apiUrl = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '') + '/virality/upload';
            
            const s3Url = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', apiUrl, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const p = Math.round((e.loaded / e.total) * 100);
                        setUploadProgress(10 + Math.floor(p * 0.8)); // 10-90% range
                    }
                };
                
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const res = JSON.parse(xhr.responseText);
                            if (res.success && res.s3Url) resolve(res.s3Url);
                            else reject(new Error(res.error || 'Upload failed'));
                        } catch (e) {
                            reject(new Error('Invalid response from server'));
                        }
                    } else {
                        reject(new Error(`Server error: ${xhr.status}`));
                    }
                };
                
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(formData);
            });

            setUploadProgress(100);
            return s3Url;
        } catch (err) {
            console.error(err);
            throw new Error('File upload failed. ' + err.message);
        }
    };

    // ── Submit for analysis ─────────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!file && !mediaUrl) return;
        setLoading(true);
        setError('');
        setResult(null);
        setUploadProgress(0);

        try {
            let finalMediaUrl = mediaUrl;
            
            // Phase 1: Upload if local file
            if (file) {
                finalMediaUrl = await uploadFileToS3(file);
                setMediaUrl(finalMediaUrl); // Save for re-runs
            }

            // Phase 2: AI Analysis pipeline
            const stages = [
                '🎬 Gemini Neural Analysis in progress...',
                '🌐 Grok scanning real-time algorithms...',
                '🧠 Claude synthesizing Neural Score Map...',
            ];
            let stageIdx = 0;
            setStage(stages[0]);
            
            const stageTimer = setInterval(() => {
                stageIdx = Math.min(stageIdx + 1, stages.length - 1);
                setStage(stages[stageIdx]);
            }, 15000); // Slower interval for video processing

            const data = await viralityPredictor.predict({
                contentType,
                mediaUrl: finalMediaUrl,
                brandId: brand?._id,
                platform,
                contentText: caption || undefined,
            });

            clearInterval(stageTimer);
            setResult(data.prediction);
        } catch (err) {
            setError(err.message || 'Analysis failed. Please try again.');
        } finally {
            setLoading(false);
            setStage('');
            setUploadProgress(0);
        }
    };

    const tier = result ? (TIER_CONFIG[result.tier] || TIER_CONFIG.growing) : null;

    return (
        <DashboardLayout title="Neural Virality Engine">
        <div className="vp-root dark-neural">
            {/* Header */}
            <div className="vp-header">
                <div className="vp-header-title">
                    <span className="material-symbols-outlined vp-header-icon">network_node</span>
                    <div>
                        <h1>Neural Virality Engine</h1>
                        <p>20-dimension content analysis via Gemini Files API + Grok Real-Time Intelligence</p>
                    </div>
                </div>
                <div className="vp-credit-badge">
                    <span className="material-symbols-outlined">toll</span>
                    3 credits
                </div>
            </div>

            <div className="vp-layout">
                {/* Left — Upload + Config */}
                <div className="vp-left">
                    <div className="vp-card">
                        <div className="vp-card-label">
                            <span className="material-symbols-outlined">upload</span>
                            Content Source
                        </div>

                        {previewUrl || mediaUrl ? (
                            <div className="vp-preview-wrap">
                                {contentType === 'video' ? (
                                    <video src={previewUrl || mediaUrl} className="vp-preview-media" controls muted />
                                ) : (
                                    <img src={previewUrl || mediaUrl} className="vp-preview-media" alt="Preview" />
                                )}
                                <button className="vp-preview-remove" onClick={() => { setFile(null); setPreviewUrl(null); setMediaUrl(''); setResult(null); }}>
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                                <div className="vp-preview-badge">{contentType === 'video' ? '🎬 Video' : '🖼 Image'}</div>
                            </div>
                        ) : (
                            <div
                                className={`vp-dropzone ${isDragging ? 'is-dragging' : ''}`}
                                onClick={() => fileRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={onDrop}
                            >
                                <span className="material-symbols-outlined vp-drop-icon">cloud_upload</span>
                                <p className="vp-drop-title">Drop video or image here</p>
                                <p className="vp-drop-sub">Direct S3 upload • Supports large video files up to 200MB</p>
                                <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
                            </div>
                        )}

                        <div className="vp-url-row">
                            <span className="vp-url-divider">OR</span>
                            <input
                                type="url"
                                className="vp-url-input"
                                placeholder="Paste platform S3 or CDN URL"
                                value={mediaUrl}
                                onChange={(e) => { setMediaUrl(e.target.value); setFile(null); setPreviewUrl(null); }}
                            />
                        </div>
                    </div>

                    {/* Platform selector */}
                    <div className="vp-card">
                        <div className="vp-card-label">
                            <span className="material-symbols-outlined">devices</span>
                            Target Algorithm
                        </div>
                        <div className="vp-platform-grid">
                            {PLATFORMS.map(p => (
                                <button key={p.id}
                                    className={`vp-platform-btn ${platform === p.id ? 'active' : ''}`}
                                    onClick={() => setPlatform(p.id)}>
                                    <span className="material-symbols-outlined">{p.icon}</span>
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Caption */}
                    <div className="vp-card">
                        <div className="vp-card-label">
                            <span className="material-symbols-outlined">edit_note</span>
                            Caption / Copy
                        </div>
                        <textarea
                            className="vp-caption-input"
                            placeholder="Optional: Paste caption text to include Language Network analysis..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* CTA */}
                    {error && <div className="vp-error"><span className="material-symbols-outlined">error</span>{error}</div>}
                    <button
                        className={`vp-analyze-btn ${loading ? 'loading' : ''}`}
                        disabled={loading || (!file && !mediaUrl)}
                        onClick={handleAnalyze}
                    >
                        {loading ? (
                            <>
                                <div className="vp-spinner" />
                                {uploadProgress > 0 && uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : stage}
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">psychology</span>
                                Run Neural Analysis
                            </>
                        )}
                        {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="vp-btn-progress" style={{ width: `${uploadProgress}%` }} />
                        )}
                    </button>
                </div>

                {/* Right — Results */}
                <div className="vp-right">
                    {!result && !loading && (
                        <div className="vp-empty-state">
                            <div className="vp-empty-glow" />
                            <span className="material-symbols-outlined vp-empty-icon">network_node</span>
                            <h2>Upload content to generate a Neural Score Map</h2>
                            <p>Our V2 pipeline analyzes 20 dimensions of visual, auditory, and narrative mechanics natively via Gemini Pro, combined with real-time Grok algorithm trend data.</p>
                        </div>
                    )}

                    {loading && (
                        <div className="vp-loading-state">
                            <div className="vp-loading-orb" />
                            <h2>{stage || 'Initializing Engine...'}</h2>
                            <div className="vp-loading-scanline" />
                        </div>
                    )}

                    {result && tier && (
                        <div className="vp-results">
                            
                            {/* Top Hero: Score + Metrics + Brain */}
                            <div className="vp-hero-card" style={{ '--tier-color': tier.color, '--tier-glow': tier.glow }}>
                                <div className="vp-hero-left">
                                    <div className="vp-score-wrapper">
                                        <div className="vp-score-label">Viral Potential</div>
                                        <div className="vp-score-huge">
                                            {result.overallScore}<span>/100</span>
                                        </div>
                                        <div className="vp-tier-badge" style={{ backgroundColor: tier.bg, color: tier.color, border: `1px solid ${tier.color}40` }}>
                                            {tier.label}
                                        </div>
                                    </div>
                                    <div className="vp-metrics-row">
                                        <div className="vp-metric">
                                            <div className="vp-metric-val">{result.metrics?.hookScore || 0}</div>
                                            <div className="vp-metric-lbl">Hook Score</div>
                                        </div>
                                        <div className="vp-metric">
                                            <div className="vp-metric-val">{result.metrics?.holdRate || 0}%</div>
                                            <div className="vp-metric-lbl">Est. Hold Rate</div>
                                        </div>
                                        {contentType === 'video' && result.metrics?.peakHookTimestamp > 0 && (
                                            <div className="vp-metric">
                                                <div className="vp-metric-val">0:0{result.metrics?.peakHookTimestamp}</div>
                                                <div className="vp-metric-lbl">Peak Timestamp</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="vp-hero-right">
                                    <BrainHeatmap scores={result.scores || {}} />
                                </div>
                            </div>

                            {/* Neural Activation Grid + Retention */}
                            <div className="vp-neural-grid">
                                <div className="vp-activation-panel">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">psychology</span>
                                        Neural Activation Maps
                                    </div>
                                    {NEURAL_REGIONS.map(reg => {
                                        const score = result.scores?.[reg.id] || 0;
                                        // Auditory is 0 for images, handle gracefully
                                        if (contentType === 'image' && reg.id === 'auditoryCortex') return null;
                                        
                                        return (
                                            <div key={reg.id} className="vp-act-row">
                                                <div className="vp-act-info">
                                                    <div className="vp-act-name">{reg.label}</div>
                                                    <div className="vp-act-desc">{reg.desc}</div>
                                                </div>
                                                <div className="vp-act-bar-wrap">
                                                    <div className="vp-act-track">
                                                        <div className="vp-act-fill" style={{ width: `${score}%` }} />
                                                    </div>
                                                    <div className="vp-act-score">{score}%</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {result.scores?.focusDrift > 0 && (
                                        <div className="vp-act-row drift">
                                            <div className="vp-act-info">
                                                <div className="vp-act-name text-red">Focus Drift Risk</div>
                                                <div className="vp-act-desc">Likelihood of audience swiping away</div>
                                            </div>
                                            <div className="vp-act-bar-wrap">
                                                <div className="vp-act-track drift-track">
                                                    <div className="vp-act-fill drift-fill" style={{ width: `${result.scores.focusDrift}%` }} />
                                                </div>
                                                <div className="vp-act-score text-red">{result.scores.focusDrift}%</div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                {contentType === 'video' && result.retentionCurve && (
                                    <div className="vp-retention-panel">
                                        <div className="vp-section-label">
                                            <span className="material-symbols-outlined">show_chart</span>
                                            Predicted Retention Curve
                                        </div>
                                        <RetentionCurve curve={result.retentionCurve} />
                                    </div>
                                )}
                            </div>

                            {/* Verdict */}
                            <div className="vp-verdict-box">
                                <span className="material-symbols-outlined">quick_reference_all</span>
                                <p>{result.verdict}</p>
                            </div>

                            {/* Grok Trend Intelligence */}
                            {result.trendContext && (
                                <div className="vp-trend-box">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">travel_explore</span>
                                        Real-Time Algorithm Intel (Grok)
                                    </div>
                                    <p>{result.trendContext}</p>
                                    
                                    {result.trendingSounds?.length > 0 && (
                                        <div className="vp-intel-row mt-3">
                                            <strong>Trending Audio:</strong>
                                            <div className="vp-intel-tags">
                                                {result.trendingSounds.map(s => <span key={s} className="vp-tag-audio"><span className="material-symbols-outlined">music_note</span>{s}</span>)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Strengths + Improvements */}
                            <div className="vp-two-col">
                                <div className="vp-insight-card vp-strengths">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">thumb_up</span>
                                        Activation Strengths
                                    </div>
                                    <ul>
                                        {(result.strengths || []).map((s, i) => (
                                            <li key={i}><span className="material-symbols-outlined">check_circle</span>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="vp-insight-card vp-improvements">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">build</span>
                                        Friction Points
                                    </div>
                                    <ul>
                                        {(result.improvements || []).map((s, i) => (
                                            <li key={i}><span className="material-symbols-outlined">arrow_upward</span>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Viral Tips */}
                            <div className="vp-tips-section">
                                <div className="vp-section-label">
                                    <span className="material-symbols-outlined">tips_and_updates</span>
                                    Viral Hooks & Tips — {brand?.dna?.industry || 'Your Category'}
                                </div>
                                <div className="vp-tips-grid">
                                    {(result.tipsToGoViral || []).map((tip, i) => (
                                        <div key={i} className="vp-tip-card">
                                            <div className="vp-tip-num">0{i + 1}</div>
                                            <p>{tip}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </DashboardLayout>
    );
}

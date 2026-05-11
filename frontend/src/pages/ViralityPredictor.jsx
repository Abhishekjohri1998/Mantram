/**
 * ViralityPredictor.jsx — Full Studio Page
 *
 * A dedicated studio for AI-powered virality analysis.
 * Upload any image or video → 3-model AI pipeline produces a Virality Score Map.
 *
 * Models used:
 *  - Gemini 2.5 Flash  → native video/image analysis
 *  - Grok 3            → real-time web research (what's viral NOW)
 *  - Claude Sonnet 4   → synthesis, scoring, brand-specific tips
 *
 * Route: /virality-predictor
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useBrand } from '../context/BrandContext';
import { viralityPredictor } from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import './ViralityPredictor.css';

// ── Tier config ───────────────────────────────────────────────────────────
const TIER_CONFIG = {
    viral_ready:    { label: '🔥 Viral Ready',    color: '#ff4d00', glow: 'rgba(255,77,0,0.4)',    bg: 'rgba(255,77,0,0.12)' },
    high_potential: { label: '⚡ High Potential', color: '#f59e0b', glow: 'rgba(245,158,11,0.4)',  bg: 'rgba(245,158,11,0.12)' },
    growing:        { label: '📈 Growing',         color: '#10b981', glow: 'rgba(16,185,129,0.3)',  bg: 'rgba(16,185,129,0.10)' },
    needs_work:     { label: '💡 Needs Work',      color: '#6366f1', glow: 'rgba(99,102,241,0.3)',  bg: 'rgba(99,102,241,0.10)' },
};

const PLATFORMS = [
    { id: 'instagram', label: 'Instagram', icon: 'photo_camera' },
    { id: 'tiktok',    label: 'TikTok',    icon: 'music_note' },
    { id: 'youtube',   label: 'YouTube',   icon: 'play_circle' },
    { id: 'linkedin',  label: 'LinkedIn',  icon: 'work' },
    { id: 'twitter',   label: 'Twitter / X', icon: 'tag' },
    { id: 'facebook',  label: 'Facebook',  icon: 'thumb_up' },
];

const SCORE_LABELS = {
    hookStrength:    { label: 'Hook Strength',   icon: 'anchor',           desc: 'Will it stop the scroll in the first 3 seconds?' },
    emotionalPull:   { label: 'Emotional Pull',  icon: 'favorite',         desc: 'Does it trigger a shareable emotion?' },
    trendAlignment:  { label: 'Trend Alignment', icon: 'trending_up',      desc: 'Is it riding what\'s viral RIGHT NOW?' },
    visualQuality:   { label: 'Visual Quality',  icon: 'auto_awesome',     desc: 'Composition, lighting, color, motion quality' },
    brandClarity:    { label: 'Brand Clarity',   icon: 'verified',         desc: 'Clear brand message without being salesy' },
    platformFit:     { label: 'Platform Fit',    icon: 'devices',          desc: 'Format & style matches platform algorithm' },
};

// ── Animated Score Bar ────────────────────────────────────────────────────
function ScoreBar({ score, color }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(score), 100);
        return () => clearTimeout(t);
    }, [score]);

    const barColor = score >= 80 ? '#ff4d00' : score >= 65 ? '#f59e0b' : score >= 50 ? '#10b981' : '#6366f1';
    return (
        <div className="vp-score-bar-track">
            <div className="vp-score-bar-fill" style={{ width: `${width}%`, backgroundColor: color || barColor }} />
        </div>
    );
}

// ── Radar Chart (SVG) ────────────────────────────────────────────────────
function RadarChart({ scores }) {
    const keys   = Object.keys(SCORE_LABELS);
    const values = keys.map(k => (scores[k] || 0) / 100);
    const n      = keys.length;
    const cx     = 150; const cy = 150; const r = 110;

    const angle  = (i) => (i * 2 * Math.PI) / n - Math.PI / 2;
    const point  = (i, v) => ({
        x: cx + r * v * Math.cos(angle(i)),
        y: cy + r * v * Math.sin(angle(i)),
    });

    const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
    const dataPath   = values.map((v, i) => {
        const p = point(i, v);
        return `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    }).join(' ') + ' Z';

    const gridPath = (v) => keys.map((_, i) => {
        const p = point(i, v);
        return `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`;
    }).join(' ') + ' Z';

    return (
        <svg viewBox="0 0 300 300" className="vp-radar">
            <defs>
                <radialGradient id="radarGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff4d00" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.08" />
                </radialGradient>
            </defs>

            {/* Grid circles */}
            {gridLevels.map((v, gi) => (
                <path key={gi} d={gridPath(v)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            ))}

            {/* Axis lines */}
            {keys.map((_, i) => {
                const p = point(i, 1);
                return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />;
            })}

            {/* Data area */}
            <path d={dataPath} fill="url(#radarGrad)" stroke="#ff4d00" strokeWidth="2" strokeLinejoin="round" />

            {/* Data dots */}
            {values.map((v, i) => {
                const p = point(i, v);
                return <circle key={i} cx={p.x} cy={p.y} r="4" fill="#ff4d00" stroke="#fff" strokeWidth="1.5" />;
            })}

            {/* Labels */}
            {keys.map((k, i) => {
                const p = point(i, 1.25);
                return (
                    <text key={k} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central"
                        fontSize="9" fill="rgba(255,255,255,0.7)" fontFamily="Inter, sans-serif">
                        {SCORE_LABELS[k].label}
                    </text>
                );
            })}
        </svg>
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
    const [loading,     setLoading]     = useState(false);
    const [stage,       setStage]       = useState('');   // loading stage text
    const [result,      setResult]      = useState(null);
    const [error,       setError]       = useState('');

    // ── File handling ───────────────────────────────────────────────────
    const handleFile = useCallback((f) => {
        if (!f) return;
        const isVid = f.type.startsWith('video/');
        setFile(f);
        setContentType(isVid ? 'video' : 'image');
        setPreviewUrl(URL.createObjectURL(f));
        setResult(null);
        setError('');
    }, []);

    const onDrop = useCallback((e) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    }, [handleFile]);

    // ── Convert file to base64 ──────────────────────────────────────────
    const toBase64 = (f) => new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result?.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(f);
    });

    // ── Submit for analysis ─────────────────────────────────────────────
    const handleAnalyze = async () => {
        if (!file && !mediaUrl) return;
        setLoading(true);
        setError('');
        setResult(null);

        const stages = [
            '🎬 Gemini is analyzing your content...',
            '🌐 Grok is researching real-time trends...',
            '🧠 Claude is synthesizing your virality score...',
        ];
        let stageIdx = 0;
        setStage(stages[0]);
        const stageTimer = setInterval(() => {
            stageIdx = Math.min(stageIdx + 1, stages.length - 1);
            setStage(stages[stageIdx]);
        }, 12000);

        try {
            let mediaBase64 = null;
            let uploadedUrl = mediaUrl || null;

            if (file && !mediaUrl) {
                mediaBase64 = await toBase64(file);
            }

            const data = await viralityPredictor.predict({
                contentType,
                mediaUrl: uploadedUrl || undefined,
                mediaBase64: mediaBase64 || undefined,
                brandId: brand?._id,
                platform,
                contentText: caption || undefined,
            });

            setResult(data.prediction);
        } catch (err) {
            setError(err.message || 'Analysis failed. Please try again.');
        } finally {
            clearInterval(stageTimer);
            setLoading(false);
            setStage('');
        }
    };

    const tier = result ? (TIER_CONFIG[result.tier] || TIER_CONFIG.growing) : null;

    return (
        <DashboardLayout
            title="Virality Predictor"
            subtitle="3-model AI analysis — Gemini Vision · Grok Trends · Claude Intelligence"
        >
        <div className="vp-root">
            {/* Sub-header with credit badge */}
            <div className="vp-header">
                <div className="vp-header-title">
                    <span className="material-symbols-outlined vp-header-icon">local_fire_department</span>
                    <div>
                        <h1>Virality Predictor</h1>
                        <p>Upload content → AI predicts viral potential with actionable brand-specific tips</p>
                    </div>
                </div>
                <div className="vp-credit-badge">
                    <span className="material-symbols-outlined">toll</span>
                    3 credits per analysis
                </div>
            </div>

            <div className="vp-layout">
                {/* Left — Upload + Config */}
                <div className="vp-left">
                    {/* Upload Zone */}
                    <div className="vp-card">
                        <div className="vp-card-label">
                            <span className="material-symbols-outlined">upload</span>
                            Upload Content
                        </div>

                        {previewUrl ? (
                            <div className="vp-preview-wrap">
                                {contentType === 'video' ? (
                                    <video src={previewUrl} className="vp-preview-media" controls muted />
                                ) : (
                                    <img src={previewUrl} className="vp-preview-media" alt="Preview" />
                                )}
                                <button className="vp-preview-remove" onClick={() => { setFile(null); setPreviewUrl(null); setResult(null); }}>
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
                                <p className="vp-drop-title">Drop your image or video here</p>
                                <p className="vp-drop-sub">or click to browse • JPG, PNG, MP4, MOV</p>
                                <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
                            </div>
                        )}

                        {/* OR URL input */}
                        <div className="vp-url-row">
                            <span className="vp-url-divider">OR</span>
                            <input
                                type="url"
                                className="vp-url-input"
                                placeholder="Paste a content URL (S3, CDN, video link...)"
                                value={mediaUrl}
                                onChange={(e) => { setMediaUrl(e.target.value); setFile(null); setPreviewUrl(null); }}
                            />
                        </div>
                    </div>

                    {/* Platform selector */}
                    <div className="vp-card">
                        <div className="vp-card-label">
                            <span className="material-symbols-outlined">devices</span>
                            Target Platform
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
                            Caption / Copy <span className="vp-optional">(optional)</span>
                        </div>
                        <textarea
                            className="vp-caption-input"
                            placeholder="Paste the caption or text you're posting with this content..."
                            value={caption}
                            onChange={(e) => setCaption(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* CTA */}
                    {error && <div className="vp-error"><span className="material-symbols-outlined">error</span>{error}</div>}
                    <button
                        className="vp-analyze-btn"
                        disabled={loading || (!file && !mediaUrl)}
                        onClick={handleAnalyze}
                    >
                        {loading ? (
                            <>
                                <div className="vp-spinner" />
                                {stage}
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">local_fire_department</span>
                                Predict Virality — 3 Credits
                            </>
                        )}
                    </button>
                </div>

                {/* Right — Results */}
                <div className="vp-right">
                    {!result && !loading && (
                        <div className="vp-empty-state">
                            <div className="vp-empty-glow" />
                            <span className="material-symbols-outlined vp-empty-icon">local_fire_department</span>
                            <h2>Upload content to predict its virality</h2>
                            <p>Our 3-model AI pipeline analyzes visual quality, emotional pull, and real-time trend alignment to score your content's viral potential.</p>
                            <ul className="vp-feature-list">
                                <li><span className="material-symbols-outlined">check_circle</span> Full video analysis (not just frames)</li>
                                <li><span className="material-symbols-outlined">check_circle</span> Real-time Grok trend research</li>
                                <li><span className="material-symbols-outlined">check_circle</span> Brand-specific viral tips</li>
                                <li><span className="material-symbols-outlined">check_circle</span> Platform-optimized recommendations</li>
                            </ul>
                        </div>
                    )}

                    {loading && (
                        <div className="vp-loading-state">
                            <div className="vp-loading-orb" />
                            <h2>Analyzing your content...</h2>
                            <p className="vp-loading-stage">{stage}</p>
                            <div className="vp-loading-steps">
                                <div className={`vp-step ${stage.includes('Gemini') ? 'active' : stage ? 'done' : ''}`}>
                                    <span className="material-symbols-outlined">auto_awesome</span>
                                    Gemini Vision Analysis
                                </div>
                                <div className={`vp-step ${stage.includes('Grok') ? 'active' : stage.includes('Claude') ? 'done' : ''}`}>
                                    <span className="material-symbols-outlined">travel_explore</span>
                                    Grok Real-Time Research
                                </div>
                                <div className={`vp-step ${stage.includes('Claude') ? 'active' : ''}`}>
                                    <span className="material-symbols-outlined">psychology</span>
                                    Claude Synthesis
                                </div>
                            </div>
                        </div>
                    )}

                    {result && tier && (
                        <div className="vp-results">
                            {/* Overall Score Hero */}
                            <div className="vp-score-hero" style={{ '--tier-color': tier.color, '--tier-glow': tier.glow, '--tier-bg': tier.bg }}>
                                <div className="vp-score-circle">
                                    <svg viewBox="0 0 120 120">
                                        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                                        <circle cx="60" cy="60" r="52" fill="none" stroke={tier.color}
                                            strokeWidth="8" strokeLinecap="round"
                                            strokeDasharray={`${2 * Math.PI * 52 * result.overallScore / 100} ${2 * Math.PI * 52}`}
                                            strokeDashoffset={2 * Math.PI * 52 * 0.25}
                                            style={{ transition: 'stroke-dasharray 1.5s ease' }} />
                                    </svg>
                                    <div className="vp-score-number">{result.overallScore}</div>
                                </div>
                                <div className="vp-score-info">
                                    <div className="vp-tier-badge" style={{ backgroundColor: tier.bg, color: tier.color, border: `1px solid ${tier.color}40` }}>
                                        {tier.label}
                                    </div>
                                    <p className="vp-verdict">{result.verdict}</p>
                                    {result.comparedToBenchmark && (
                                        <div className="vp-benchmark">
                                            <span className="material-symbols-outlined">bar_chart</span>
                                            {result.comparedToBenchmark === 'above' ? 'Above' : result.comparedToBenchmark === 'at' ? 'At' : 'Below'} category benchmark ({result.categoryBenchmark}/100)
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Radar + Score Bars */}
                            <div className="vp-score-grid">
                                <div className="vp-radar-wrap">
                                    <RadarChart scores={result.scores} />
                                </div>
                                <div className="vp-score-bars">
                                    {Object.entries(SCORE_LABELS).map(([key, meta]) => {
                                        const score = result.scores?.[key] ?? 0;
                                        const barColor = score >= 80 ? '#ff4d00' : score >= 65 ? '#f59e0b' : score >= 50 ? '#10b981' : '#6366f1';
                                        return (
                                            <div key={key} className="vp-score-row">
                                                <div className="vp-score-meta">
                                                    <span className="material-symbols-outlined">{meta.icon}</span>
                                                    <div>
                                                        <div className="vp-score-name">{meta.label}</div>
                                                        <div className="vp-score-desc">{meta.desc}</div>
                                                    </div>
                                                </div>
                                                <div className="vp-score-right">
                                                    <ScoreBar score={score} color={barColor} />
                                                    <span className="vp-score-num" style={{ color: barColor }}>{score}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Trend Context */}
                            {result.trendContext && (
                                <div className="vp-trend-box">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">travel_explore</span>
                                        Real-Time Trend Intelligence (Grok)
                                    </div>
                                    <p>{result.trendContext}</p>
                                    {result.competitorContext && (
                                        <p className="vp-competitor-line">
                                            <span className="material-symbols-outlined">insights</span>
                                            {result.competitorContext}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Strengths + Improvements */}
                            <div className="vp-two-col">
                                <div className="vp-insight-card vp-strengths">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">thumb_up</span>
                                        What's Working
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
                                        What to Improve
                                    </div>
                                    <ul>
                                        {(result.improvements || []).map((s, i) => (
                                            <li key={i}><span className="material-symbols-outlined">arrow_upward</span>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Quick Win */}
                            {result.quickWin && (
                                <div className="vp-quick-win">
                                    <span className="material-symbols-outlined">bolt</span>
                                    <div>
                                        <strong>Quick Win</strong>
                                        <p>{result.quickWin}</p>
                                    </div>
                                </div>
                            )}

                            {/* Viral Tips */}
                            <div className="vp-tips-section">
                                <div className="vp-section-label">
                                    <span className="material-symbols-outlined">tips_and_updates</span>
                                    Tips to Go Viral — {brand?.dna?.industry || 'Your Category'} Specific
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

                            {/* Posting Strategy */}
                            <div className="vp-strategy-row">
                                {result.bestPlatforms?.length > 0 && (
                                    <div className="vp-strategy-card">
                                        <div className="vp-section-label">
                                            <span className="material-symbols-outlined">devices</span>
                                            Best Platforms
                                        </div>
                                        <div className="vp-platform-tags">
                                            {result.bestPlatforms.map(p => (
                                                <span key={p} className="vp-ptag">{p}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {result.bestPostTime && (
                                    <div className="vp-strategy-card">
                                        <div className="vp-section-label">
                                            <span className="material-symbols-outlined">schedule</span>
                                            Best Post Time
                                        </div>
                                        <p className="vp-strategy-value">{result.bestPostTime}</p>
                                    </div>
                                )}
                                {result.estimatedReach && (
                                    <div className="vp-strategy-card">
                                        <div className="vp-section-label">
                                            <span className="material-symbols-outlined">groups</span>
                                            Estimated Reach
                                        </div>
                                        <p className="vp-strategy-value vp-reach">{result.estimatedReach}</p>
                                    </div>
                                )}
                            </div>

                            {/* Hashtags */}
                            {result.recommendedHashtags?.length > 0 && (
                                <div className="vp-card vp-hashtag-section">
                                    <div className="vp-section-label">
                                        <span className="material-symbols-outlined">tag</span>
                                        Recommended Hashtags
                                    </div>
                                    <div className="vp-hashtag-grid">
                                        {result.recommendedHashtags.map(h => (
                                            <span key={h} className="vp-hashtag">{h}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Analysis Metadata */}
                            <div className="vp-meta-footer">
                                <span className="material-symbols-outlined">info</span>
                                Analyzed on {new Date(result.analysisMetadata?.analysisDate).toLocaleDateString()} using {result.analysisMetadata?.modelsUsed?.join(' · ')}
                            </div>

                            {/* Re-analyze */}
                            <button className="vp-reanalyze-btn" onClick={() => setResult(null)}>
                                <span className="material-symbols-outlined">refresh</span>
                                Analyze Another Piece of Content
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </DashboardLayout>
    );
}

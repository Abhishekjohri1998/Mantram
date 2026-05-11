/**
 * ViralityMiniPanel.jsx — Inline post-generation virality check
 *
 * Compact panel that appears on generated content cards.
 * Shows a score pill → expands to mini radar + top 3 tips.
 * 
 * Props:
 *   mediaUrl     {string}  — S3/CDN URL of the generated content
 *   contentType  {string}  — 'image' | 'video'
 *   platform     {string}  — Target platform (optional)
 *   brandId      {string}  — Brand ID for category-specific tips
 *   contentText  {string}  — Caption (optional)
 *   className    {string}  — Additional class names
 */

import { useState } from 'react';
import { viralityPredictor } from '../services/api';
import './ViralityMiniPanel.css';

const TIER_COLORS = {
    viral_ready:    { color: '#ff4d00', bg: 'rgba(255,77,0,0.12)',   label: '🔥 Viral Ready' },
    high_potential: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: '⚡ High Potential' },
    growing:        { color: '#10b981', bg: 'rgba(16,185,129,0.10)', label: '📈 Growing' },
    needs_work:     { color: '#6366f1', bg: 'rgba(99,102,241,0.10)', label: '💡 Needs Work' },
};

const MINI_SCORE_KEYS = ['hookStrength', 'trendAlignment', 'emotionalPull', 'visualQuality'];
const MINI_SCORE_LABELS = {
    hookStrength:   'Hook',
    trendAlignment: 'Trend',
    emotionalPull:  'Emotion',
    visualQuality:  'Visual',
};

function MiniScoreBar({ score }) {
    const color = score >= 80 ? '#ff4d00' : score >= 65 ? '#f59e0b' : score >= 50 ? '#10b981' : '#6366f1';
    return (
        <div className="vmp-bar-track">
            <div className="vmp-bar-fill" style={{ width: `${score}%`, backgroundColor: color }} />
        </div>
    );
}

export default function ViralityMiniPanel({ mediaUrl, contentType = 'image', platform, brandId, contentText, className = '' }) {
    const [state,    setState]    = useState('idle');   // idle | loading | done | error
    const [expanded, setExpanded] = useState(false);
    const [result,   setResult]   = useState(null);
    const [error,    setError]    = useState('');

    const handleCheck = async (e) => {
        e.stopPropagation();
        if (state === 'done') { setExpanded(x => !x); return; }
        // Need at least a media URL or some content text to analyze
        if (!mediaUrl && !contentText) return;

        setState('loading');
        setError('');

        try {
            const data = await viralityPredictor.predict({
                contentType,
                mediaUrl: mediaUrl || undefined,
                brandId,
                platform: platform || 'instagram',
                contentText,
            });
            setResult(data.prediction);
            setState('done');
            setExpanded(true);
        } catch (err) {
            setError(err.message || 'Analysis failed');
            setState('error');
        }
    };

    const tier = result ? (TIER_COLORS[result.tier] || TIER_COLORS.growing) : null;

    return (
        <div className={`vmp-root ${className} ${state}`}>
            {/* Trigger button */}
            <button className="vmp-trigger" onClick={handleCheck} disabled={state === 'loading'}>
                {state === 'loading' && (
                    <>
                        <div className="vmp-spinner" />
                        Analyzing...
                    </>
                )}
                {state === 'idle' && (
                    <>
                        <span className="material-symbols-outlined">local_fire_department</span>
                        Check Virality
                        <span className="vmp-credit-tag">3 cr</span>
                    </>
                )}
                {state === 'done' && tier && (
                    <>
                        <span className="material-symbols-outlined">local_fire_department</span>
                        <span className="vmp-score-pill" style={{ color: tier.color, backgroundColor: tier.bg }}>
                            {result.overallScore}/100
                        </span>
                        {tier.label}
                        <span className="material-symbols-outlined vmp-chevron">{expanded ? 'expand_less' : 'expand_more'}</span>
                    </>
                )}
                {state === 'error' && (
                    <>
                        <span className="material-symbols-outlined">error</span>
                        Retry Virality Check
                    </>
                )}
            </button>

            {/* Expanded results */}
            {state === 'done' && result && expanded && (
                <div className="vmp-expanded">
                    {/* Mini scores */}
                    <div className="vmp-scores">
                        {MINI_SCORE_KEYS.map(k => (
                            <div key={k} className="vmp-score-row">
                                <span className="vmp-score-label">{MINI_SCORE_LABELS[k]}</span>
                                <MiniScoreBar score={result.scores?.[k] ?? 0} />
                                <span className="vmp-score-num">{result.scores?.[k] ?? 0}</span>
                            </div>
                        ))}
                    </div>

                    {/* Verdict */}
                    <p className="vmp-verdict">{result.verdict}</p>

                    {/* Quick Win */}
                    {result.quickWin && (
                        <div className="vmp-quick-win">
                            <span className="material-symbols-outlined">bolt</span>
                            <span>{result.quickWin}</span>
                        </div>
                    )}

                    {/* Top 3 tips */}
                    {result.tipsToGoViral?.length > 0 && (
                        <div className="vmp-tips">
                            <div className="vmp-tips-label">Tips to Go Viral</div>
                            {result.tipsToGoViral.slice(0, 3).map((tip, i) => (
                                <div key={i} className="vmp-tip">
                                    <span className="vmp-tip-num">{i + 1}</span>
                                    <span>{tip}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Best post time */}
                    {result.bestPostTime && (
                        <div className="vmp-post-time">
                            <span className="material-symbols-outlined">schedule</span>
                            Best time: {result.bestPostTime}
                        </div>
                    )}
                </div>
            )}

            {error && state === 'error' && (
                <div className="vmp-error">{error}</div>
            )}
        </div>
    );
}

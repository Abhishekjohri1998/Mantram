import React, { useState, useEffect, useMemo } from 'react';

/**
 * GlobalLoader — Premium agentic pipeline loading overlay
 * Shows real-time AI agent steps with animated status indicators
 *
 * Props:
 *  - isActive         (bool)    Show/hide
 *  - title            (string)  Main heading
 *  - stages           (array)   Static stage labels (fallback)
 *  - pipelineSteps    (array)   Real-time steps from backend: [{ agent, message, status, detail, durationMs }]
 *  - currentStage     (string)  Active stage label (fallback)
 *  - elapsed          (number)  Optional parent-supplied elapsed seconds
 *  - estimatedDuration(number)  Expected total seconds (default 30)
 *  - icon             (string)  Material icon name
 */

// Agent metadata for display
const AGENT_META = {
    'brand-intel':      { icon: 'psychology', label: 'Brand Intelligence', color: '#8b5cf6' },
    'art-director':     { icon: 'palette', label: 'Art Director', color: '#ec4899' },
    'prompt-engineer':  { icon: 'code', label: 'Prompt Engineer', color: '#06b6d4' },
    'style-critic':     { icon: 'verified', label: 'Style Critic', color: '#f59e0b' },
    'image-inject':     { icon: 'photo_library', label: 'Image Grounding', color: '#10b981' },
    'generating':       { icon: 'auto_awesome', label: 'AI Generation', color: '#6366f1' },
    'complete':         { icon: 'check_circle', label: 'Complete', color: '#22c55e' },
};

export default function GlobalLoader({
    isActive,
    title = 'Processing Request...',
    stages = [],
    pipelineSteps = [],
    currentStage = '',
    elapsed = 0,
    estimatedDuration = 30,
    icon = 'troubleshoot',
}) {
    if (!isActive) return null;

    const [localElapsed, setLocalElapsed] = useState(0);

    // Reset timer when the loader becomes active or title changes (new task)
    useEffect(() => {
        setLocalElapsed(0);
    }, [title]);

    useEffect(() => {
        if (elapsed > 0) { setLocalElapsed(elapsed); return; }
        const timer = setInterval(() => setLocalElapsed(prev => prev + 1), 1000);
        return () => clearInterval(timer);
    }, [elapsed]);

    // Determine if we have real pipeline steps
    const hasRealSteps = pipelineSteps.length > 0;

    // Deduplicate steps — keep latest per agent
    const uniqueSteps = useMemo(() => {
        const map = new Map();
        for (const step of pipelineSteps) {
            map.set(step.agent, step);
        }
        return [...map.values()];
    }, [pipelineSteps]);

    // Current active step (the last 'working' step)
    const activeStep = useMemo(() => {
        return [...uniqueSteps].reverse().find(s => s.status === 'working');
    }, [uniqueSteps]);

    // Progress calculation — based on completed steps if real steps exist
    const doneCount = uniqueSteps.filter(s => s.status === 'done').length;
    const totalExpected = 6; // brand-intel, art-director, prompt-engineer, image-inject, generating, complete
    const rawPct = hasRealSteps
        ? (doneCount / totalExpected) * 100
        : estimatedDuration > 0 ? (localElapsed / estimatedDuration) * 100 : 0;
    const pct = Math.min(95, rawPct < 60 ? rawPct : 60 + (rawPct - 60) * 0.35);
    const displayPct = Math.round(pct);

    // ETA remaining
    const etaRemaining = Math.max(0, estimatedDuration - localElapsed);
    const etaLabel = etaRemaining > 60
        ? `~${Math.ceil(etaRemaining / 60)} min remaining`
        : etaRemaining > 0
            ? `~${etaRemaining}s remaining`
            : 'Almost done...';

    const elapsedLabel = `${Math.floor(localElapsed / 60)}:${String(localElapsed % 60).padStart(2, '0')}`;

    // Determine the dynamic title based on active step
    const dynamicTitle = activeStep
        ? AGENT_META[activeStep.agent]?.label || activeStep.message
        : title;

    return (
        <div className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[400px] animate-fade-in w-full">
            {/* Animated mesh spinner */}
            <div className="loader-mesh mb-5">
                <div className="mesh-ring mesh-ring-1"></div>
                <div className="mesh-ring mesh-ring-2"></div>
                <div className="mesh-ring mesh-ring-3"></div>
                <span className="material-symbols-outlined text-3xl text-primary relative z-10 animate-pulse">
                    {activeStep ? (AGENT_META[activeStep.agent]?.icon || icon) : icon}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-lg font-black text-white mb-1">{dynamicTitle}</h3>
            {activeStep && (
                <p className="text-sm text-primary/80 animate-pulse mb-4 max-w-md">{activeStep.message}</p>
            )}
            {!activeStep && currentStage && (
                <p className="text-sm text-primary animate-pulse mb-4">{currentStage}</p>
            )}

            {/* ── Real-time Pipeline Steps ── */}
            {hasRealSteps && (
                <div className="w-full max-w-md mt-2 mb-4 text-left">
                    {uniqueSteps.map((step, i) => {
                        const meta = AGENT_META[step.agent] || { icon: 'circle', label: step.agent, color: '#8b5cf6' };
                        const isDone = step.status === 'done';
                        const isWorking = step.status === 'working';
                        const duration = step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : '';

                        return (
                            <div key={step.agent + i} 
                                className={`flex items-center gap-3 py-2 px-3 rounded-lg mb-1 transition-all duration-500 ${
                                    isWorking ? 'bg-white/[0.06] border border-white/[0.08]' : isDone ? 'opacity-70' : 'opacity-40'
                                }`}
                            >
                                {/* Status icon */}
                                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                    {isDone ? (
                                        <span className="material-symbols-outlined text-base" style={{ color: '#22c55e' }}>check_circle</span>
                                    ) : isWorking ? (
                                        <span className="material-symbols-outlined text-base animate-spin" style={{ color: meta.color }}>progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-base text-slate-600">circle</span>
                                    )}
                                </div>

                                {/* Agent icon */}
                                <span className="material-symbols-outlined text-sm" style={{ color: isDone ? '#64748b' : meta.color }}>{meta.icon}</span>

                                {/* Message */}
                                <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-semibold ${isWorking ? 'text-white' : isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                                        {step.message}
                                    </span>
                                    {step.detail && isDone && (
                                        <span className="text-[10px] text-slate-500 ml-2">— {step.detail}</span>
                                    )}
                                </div>

                                {/* Duration */}
                                {isDone && duration && (
                                    <span className="text-[10px] font-mono text-slate-600 flex-shrink-0">{duration}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Progress Bar ── */}
            <div className="w-full max-w-sm mt-2">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-black text-white">{displayPct}%</span>
                    <span className="text-xs text-slate-500 font-mono">{elapsedLabel} elapsed</span>
                </div>
                <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                            width: `${displayPct}%`,
                            background: 'linear-gradient(90deg, #8b5cf6, #6366f1, #06b6d4)',
                            boxShadow: '0 0 12px rgba(139,92,246,0.4)',
                        }}
                    />
                </div>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-slate-500">{etaLabel}</span>
                    {hasRealSteps && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-violet-400">smart_toy</span>
                            Agentic Pipeline
                        </span>
                    )}
                </div>
            </div>

            {/* Stage dots (fallback when no real pipeline steps) */}
            {!hasRealSteps && stages.length > 0 && (
                <div className="flex gap-1.5 mt-6 justify-center flex-wrap">
                    {stages.map((s, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                                stages.indexOf(currentStage) >= i
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-white/[0.04] text-slate-600'
                            }`}
                        >
                            {stages.indexOf(currentStage) > i ? (
                                <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            ) : stages.indexOf(currentStage) === i ? (
                                <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                            ) : (
                                <span className="material-symbols-outlined text-[12px]">circle</span>
                            )}
                            {s}
                        </div>
                    ))}
                </div>
            )}

            {/* Inline CSS for mesh rings */}
            <style dangerouslySetInnerHTML={{__html: `
                .loader-mesh { position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
                .mesh-ring { position: absolute; border-radius: 50%; border: 2px solid transparent; border-top-color: #8b5cf6; }
                .mesh-ring-1 { width: 100%; height: 100%; animation: spin 2s linear infinite; opacity: 0.6; }
                .mesh-ring-2 { width: 80%; height: 80%; animation: spin 1.5s linear infinite reverse; border-top-color: #6366f1; opacity: 0.8; }
                .mesh-ring-3 { width: 60%; height: 60%; animation: spin 1s linear infinite; border-top-color: #e2e8f0; opacity: 0.3; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}} />
        </div>
    );
}

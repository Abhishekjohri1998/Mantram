import React, { useState, useEffect, useMemo, useRef } from 'react';

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
 *  - thinkingContext  (string)  Studio context for simulated thinking steps: 'content'|'creative'|'video'|'seo'|'social'|'performance'|'conversation'|'analytics'|'strategy'
 */

// Agent metadata for display
const AGENT_META = {
    'brand-intel':       { icon: 'psychology',       label: 'Brand Intelligence',    color: '#FF4D00' },
    'art-director':      { icon: 'palette',           label: 'Art Director',          color: '#ec4899' },
    'prompt-engineer':   { icon: 'code',              label: 'Prompt Engineer',       color: '#06b6d4' },
    'style-critic':      { icon: 'verified',          label: 'Style Critic',          color: '#f59e0b' },
    'image-inject':      { icon: 'photo_library',     label: 'Image Grounding',       color: '#10b981' },
    'visual-grounding':  { icon: 'image_search',      label: 'Visual Grounding (MCoT)',color: '#14b8a6' },
    'copywriter':        { icon: 'edit_note',          label: 'Copywriter Agent',      color: '#f97316' },
    'generating':        { icon: 'auto_awesome',      label: 'AI Generation',         color: '#6366f1' },
    'complete':          { icon: 'check_circle',      label: 'Complete',              color: '#22c55e' },
    'queued':            { icon: 'schedule',          label: 'Queued',                color: '#64748b' },
    'processing':        { icon: 'sync',              label: 'Processing',            color: '#FF4D00' },
};

// ── Thinking Step Definitions per Studio Context ────────────────────────────
const THINKING_STEPS = {
    content: [
        { icon: 'psychology',       label: 'Loading Brand DNA & voice profile...', color: '#FF4D00' },
        { icon: 'group',            label: 'Analyzing target audience segments...', color: '#8b5cf6' },
        { icon: 'trending_up',      label: 'Researching trending topics & hooks...', color: '#06b6d4' },
        { icon: 'edit_note',        label: 'Crafting hook line & opening...', color: '#f97316' },
        { icon: 'auto_awesome',     label: 'Writing body copy with brand voice...', color: '#ec4899' },
        { icon: 'tag',              label: 'Adding hashtags, CTA & formatting...', color: '#10b981' },
        { icon: 'verified',         label: 'Running quality & tone check...', color: '#f59e0b' },
    ],
    creative: [
        { icon: 'psychology',       label: 'Loading brand visual identity...', color: '#FF4D00' },
        { icon: 'description',      label: 'Analyzing creative brief...', color: '#8b5cf6' },
        { icon: 'palette',          label: 'Building art direction & composition...', color: '#ec4899' },
        { icon: 'code',             label: 'Engineering generation prompt...', color: '#06b6d4' },
        { icon: 'auto_awesome',     label: 'Generating visual with AI model...', color: '#6366f1' },
        { icon: 'tune',             label: 'Applying style refinements...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Final quality review...', color: '#22c55e' },
    ],
    video: [
        { icon: 'movie',            label: 'Analyzing storyboard structure...', color: '#FF4D00' },
        { icon: 'psychology',       label: 'Loading brand assets & guidelines...', color: '#8b5cf6' },
        { icon: 'view_in_ar',       label: 'Composing scene layouts...', color: '#ec4899' },
        { icon: 'subtitles',        label: 'Aligning script with visuals...', color: '#06b6d4' },
        { icon: 'auto_awesome',     label: 'Generating video frames...', color: '#6366f1' },
        { icon: 'layers',           label: 'Compositing & rendering...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Final review & encoding...', color: '#22c55e' },
    ],
    seo: [
        { icon: 'language',         label: 'Crawling page structure...', color: '#FF4D00' },
        { icon: 'search',           label: 'Analyzing keyword opportunities...', color: '#8b5cf6' },
        { icon: 'groups',           label: 'Benchmarking against competitors...', color: '#ec4899' },
        { icon: 'build',            label: 'Running technical SEO audit...', color: '#06b6d4' },
        { icon: 'analytics',        label: 'Calculating ranking signals...', color: '#6366f1' },
        { icon: 'lightbulb',        label: 'Building optimization recommendations...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Compiling report...', color: '#22c55e' },
    ],
    social: [
        { icon: 'psychology',       label: 'Loading brand intelligence...', color: '#FF4D00' },
        { icon: 'analytics',        label: 'Analyzing social media metrics...', color: '#8b5cf6' },
        { icon: 'groups',           label: 'Studying audience behavior...', color: '#ec4899' },
        { icon: 'trending_up',      label: 'Building growth strategy...', color: '#06b6d4' },
        { icon: 'lightbulb',        label: 'Generating actionable insights...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Compiling analysis...', color: '#22c55e' },
    ],
    performance: [
        { icon: 'campaign',         label: 'Loading campaign performance data...', color: '#FF4D00' },
        { icon: 'analytics',        label: 'Analyzing conversion metrics...', color: '#8b5cf6' },
        { icon: 'groups',           label: 'Benchmarking against industry...', color: '#ec4899' },
        { icon: 'trending_up',      label: 'Identifying optimization opportunities...', color: '#06b6d4' },
        { icon: 'auto_awesome',     label: 'Building AI recommendations...', color: '#6366f1' },
        { icon: 'check_circle',     label: 'Generating optimization plan...', color: '#22c55e' },
    ],
    conversation: [
        { icon: 'psychology',       label: 'Loading brand context & persona...', color: '#FF4D00' },
        { icon: 'chat',             label: 'Analyzing conversation intent...', color: '#8b5cf6' },
        { icon: 'auto_awesome',     label: 'Building intelligent response...', color: '#06b6d4' },
        { icon: 'verified',         label: 'Running tone & accuracy check...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Finalizing response...', color: '#22c55e' },
    ],
    analytics: [
        { icon: 'database',         label: 'Loading D2C analytics data...', color: '#FF4D00' },
        { icon: 'analytics',        label: 'Processing business metrics...', color: '#8b5cf6' },
        { icon: 'trending_up',      label: 'Identifying trends & patterns...', color: '#06b6d4' },
        { icon: 'lightbulb',        label: 'Generating strategic insights...', color: '#f59e0b' },
        { icon: 'check_circle',     label: 'Building report...', color: '#22c55e' },
    ],
    strategy: [
        { icon: 'psychology',       label: 'Loading Brand DNA & market position...', color: '#FF4D00' },
        { icon: 'travel_explore',   label: 'Scanning competitive landscape...', color: '#8b5cf6' },
        { icon: 'trending_up',      label: 'Analyzing market trends...', color: '#ec4899' },
        { icon: 'architecture',     label: 'Building strategy framework...', color: '#06b6d4' },
        { icon: 'edit_note',        label: 'Writing execution playbook...', color: '#f97316' },
        { icon: 'calendar_month',   label: 'Mapping content calendar...', color: '#6366f1' },
        { icon: 'check_circle',     label: 'Final review & scoring...', color: '#22c55e' },
    ],
};

// ── Hook: Simulated thinking steps timer ─────────────────────────────────────
function useThinkingSimulator(isActive, thinkingContext, estimatedDuration, hasRealSteps) {
    const [simulatedSteps, setSimulatedSteps] = useState([]);
    const timerRef = useRef(null);
    const indexRef = useRef(0);

    useEffect(() => {
        // Reset when loader activates
        if (!isActive) {
            setSimulatedSteps([]);
            indexRef.current = 0;
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        // Don't simulate if we have real pipeline steps or no context
        if (hasRealSteps || !thinkingContext) return;

        const steps = THINKING_STEPS[thinkingContext];
        if (!steps || steps.length === 0) return;

        // Calculate interval: spread steps across ~70% of estimated duration
        // First step shows immediately, rest are staggered
        const totalTime = Math.max(20, estimatedDuration) * 0.7; // use 70% of estimated time
        const interval = Math.max(2500, (totalTime / steps.length) * 1000); // min 2.5s per step

        // Show first step immediately
        indexRef.current = 0;
        setSimulatedSteps([{
            agent: `sim-${steps[0].icon}`,
            message: steps[0].label,
            status: 'working',
            _icon: steps[0].icon,
            _color: steps[0].color,
        }]);

        timerRef.current = setInterval(() => {
            indexRef.current += 1;
            const nextIdx = indexRef.current;

            if (nextIdx >= steps.length) {
                // All steps shown — mark last as working, stop timer
                clearInterval(timerRef.current);
                return;
            }

            setSimulatedSteps(prev => {
                // Mark all previous as done, add new one as working
                const updated = prev.map(s => ({ ...s, status: 'done' }));
                updated.push({
                    agent: `sim-${steps[nextIdx].icon}`,
                    message: steps[nextIdx].label,
                    status: 'working',
                    _icon: steps[nextIdx].icon,
                    _color: steps[nextIdx].color,
                });
                return updated;
            });
        }, interval);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isActive, thinkingContext, estimatedDuration, hasRealSteps]);

    return simulatedSteps;
}

export default function GlobalLoader({
    isActive,
    title = 'Processing Request...',
    stages = [],
    pipelineSteps = [],
    currentStage = '',
    elapsed = 0,
    estimatedDuration = 120, // ← Bumped default: real generation takes 60-180s
    icon = 'troubleshoot',
    startedAt = null, // Unix timestamp (ms) — if provided, elapsed is calculated from this
    thinkingContext = null, // Studio context for simulated thinking: 'content'|'creative'|'video'|'seo'|etc.
}) {
    if (!isActive) return null;

    const [localElapsed, setLocalElapsed] = useState(() => {
        // If we have a startedAt anchor, compute elapsed immediately (survives re-renders)
        if (startedAt) return Math.floor((Date.now() - startedAt) / 1000);
        return 0;
    });

    // Stable elapsed timer: anchor to startedAt if provided, so it never resets on re-render
    useEffect(() => {
        if (elapsed > 0) { setLocalElapsed(elapsed); return; }
        const timer = setInterval(() => {
            if (startedAt) {
                setLocalElapsed(Math.floor((Date.now() - startedAt) / 1000));
            } else {
                setLocalElapsed(prev => prev + 1);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [elapsed, startedAt]);

    // Determine if we have real pipeline steps
    const hasRealSteps = pipelineSteps.length > 0;

    // Simulated thinking steps (only when no real steps AND thinkingContext provided)
    const simulatedSteps = useThinkingSimulator(isActive, thinkingContext, estimatedDuration, hasRealSteps);

    // Use real steps if available, otherwise simulated
    const displaySteps = hasRealSteps ? pipelineSteps : simulatedSteps;
    const hasDisplaySteps = displaySteps.length > 0;

    // Deduplicate steps — keep latest per agent
    const uniqueSteps = useMemo(() => {
        const map = new Map();
        for (const step of displaySteps) {
            map.set(step.agent, step);
        }
        return [...map.values()];
    }, [displaySteps]);

    // Current active step (the last 'working' step)
    const activeStep = useMemo(() => {
        return [...uniqueSteps].reverse().find(s => s.status === 'working');
    }, [uniqueSteps]);

    // Progress calculation — smooth asymptotic curve that never looks frozen
    const doneCount = uniqueSteps.filter(s => s.status === 'done').length;
    const workingCount = uniqueSteps.filter(s => s.status === 'working').length;
    const allDone = hasDisplaySteps && doneCount > 0 && workingCount === 0;
    
    let pct;
    if (allDone) {
        pct = 100;
    } else if (hasDisplaySteps && doneCount > 0) {
        const totalExpected = Math.max(6, uniqueSteps.length);
        pct = Math.min(95, (doneCount / totalExpected) * 100);
    } else {
        // Time-based asymptotic curve (the common path)
        const t = localElapsed;
        const T = Math.max(60, estimatedDuration);
        const k = 2.0 / T;
        pct = Math.min(97, (1 - Math.exp(-k * t)) * 100);
    }
    const displayPct = Math.round(pct);
    const isNearlyDone = displayPct >= 90;

    // ETA remaining
    const etaRemaining = Math.max(0, estimatedDuration - localElapsed);
    const etaLabel = localElapsed < estimatedDuration * 0.25
        ? `~${Math.ceil(etaRemaining / 60) || 1} min remaining`
        : localElapsed < estimatedDuration
            ? `~${etaRemaining}s remaining`
            : displayPct >= 95
                ? 'Hang tight, finalizing…'
                : 'Finishing up…';

    const elapsedLabel = `${Math.floor(localElapsed / 60)}:${String(localElapsed % 60).padStart(2, '0')}`;

    // Determine the dynamic title based on active step
    const dynamicTitle = activeStep
        ? (hasRealSteps ? (AGENT_META[activeStep.agent]?.label || activeStep.message) : activeStep.message)
        : title;

    return (
        <div className="glass-panel rounded-2xl p-8 text-center flex flex-col items-center justify-center min-h-[400px] animate-fade-in w-full">
            {/* Animated mesh spinner */}
            <div className="loader-mesh mb-5">
                <div className="mesh-ring mesh-"></div>
                <div className="mesh-ring mesh-ring-2"></div>
                <div className="mesh-ring mesh-ring-3"></div>
                <span className="material-symbols-outlined text-3xl text-primary relative z-10 animate-pulse">
                    {activeStep
                        ? (hasRealSteps ? (AGENT_META[activeStep.agent]?.icon || icon) : (activeStep._icon || icon))
                        : icon}
                </span>
            </div>

            {/* Title */}
            <h3 className="text-lg font-black text-[var(--sys-text)] mb-1">{dynamicTitle}</h3>
            {activeStep && hasRealSteps && (
                <p className="text-sm text-[var(--sys-text-muted)] animate-pulse mb-4 max-w-md">{activeStep.message}</p>
            )}
            {/* Fidato thinking label for simulated steps */}
            {activeStep && !hasRealSteps && thinkingContext && (
                <div className="flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-sm text-primary animate-pulse">psychology</span>
                    <span className="text-xs font-semibold text-[var(--sys-text-muted)] tracking-wide">Fidato is thinking...</span>
                </div>
            )}
            {!activeStep && currentStage && (
                <p className="text-sm text-[var(--sys-text)] animate-pulse mb-4">{currentStage}</p>
            )}

            {/* ── Real-time / Simulated Pipeline Steps ── */}
            {hasDisplaySteps && (
                <div className="w-full max-w-md mt-2 mb-4 text-left">
                    {uniqueSteps.map((step, i) => {
                        const isSimulated = !hasRealSteps;
                        const meta = isSimulated
                            ? { icon: step._icon || 'circle', label: step.message, color: step._color || '#FF4D00' }
                            : AGENT_META[step.agent] || { icon: 'circle', label: step.agent, color: '#FF4D00' };
                        const isDone = step.status === 'done';
                        const isWorking = step.status === 'working';
                        const duration = step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : '';

                        return (
                            <div key={step.agent + i} 
                                className={`flex items-center gap-3 py-2 px-3 rounded-lg mb-1 transition-all duration-500 ${
                                    isWorking ? 'bg-[var(--sys-surface)] border border-[var(--sys-border)]' : isDone ? 'opacity-70' : 'opacity-40'
                                }`}
                                style={{ animation: `glStepSlideIn 0.4s ease-out ${i * 0.06}s both` }}
                            >
                                {/* Status icon */}
                                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                    {isDone ? (
                                        <span className="material-symbols-outlined text-base" style={{ color: '#22c55e' }}>check_circle</span>
                                    ) : isWorking ? (
                                        <span className="material-symbols-outlined text-base animate-spin" style={{ color: meta.color }}>progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-base text-[var(--sys-text-muted)]">circle</span>
                                    )}
                                </div>

                                {/* Agent icon */}
                                <span className="material-symbols-outlined text-sm" style={{ color: isDone ? '#64748b' : meta.color }}>{meta.icon}</span>

                                {/* Message */}
                                <div className="flex-1 min-w-0">
                                    <span className={`text-xs font-semibold ${isWorking ? 'text-[var(--sys-text)]' : isDone ? 'text-[var(--sys-text-muted)]' : 'text-[var(--sys-text-muted)]'}`}>
                                        {step.message}
                                    </span>
                                    {step.detail && isDone && (
                                        <span className="text-[10px] text-[var(--sys-text-muted)] ml-2">— {step.detail}</span>
                                    )}
                                </div>

                                {/* Duration */}
                                {isDone && duration && (
                                    <span className="text-[10px] font-mono text-[var(--sys-text-muted)] flex-shrink-0">{duration}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Progress Bar ── */}
            <div className="w-full max-w-sm mt-2">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-black text-[var(--sys-text)]">{displayPct}%</span>
                    <span className="text-xs text-[var(--sys-text-muted)] font-mono">{elapsedLabel} elapsed</span>
                </div>
                <div className="w-full h-2 bg-[var(--sys-surface)] rounded-full overflow-hidden relative">
                    <div
                        className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                            width: `${displayPct}%`,
                            background: 'var(--sys-primary)',
                            boxShadow: '0 0 12px rgba(255, 77, 0,0.4)',
                        }}
                    />
                    {/* Shimmer animation when nearly done — signals it's still working */}
                    {isNearlyDone && (
                        <div
                            className="absolute inset-0 rounded-full"
                            style={{
                                background: 'var(--sys-primary) 50%, transparent 100%)',
                                backgroundSize: '200% 100%',
                                animation: 'progressShimmer 1.8s linear infinite',
                            }}
                        />
                    )}
                </div>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px] text-[var(--sys-text-muted)] flex items-center gap-1">
                        {isNearlyDone && <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00] animate-pulse flex-shrink-0" />}
                        {etaLabel}
                    </span>
                    {hasDisplaySteps && (
                        <span className="text-[10px] text-[var(--sys-text-muted)] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px] text-[#FF4D00]">smart_toy</span>
                            {hasRealSteps ? 'Agentic Pipeline' : 'Fidato AI'}
                        </span>
                    )}
                </div>
            </div>

            {/* Stage dots (fallback when no real pipeline steps AND no simulated steps) */}
            {!hasDisplaySteps && stages.length > 0 && (
                <div className="flex gap-1.5 mt-6 justify-center flex-wrap">
                    {stages.map((s, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                                stages.indexOf(currentStage) >= i
                                    ? 'bg-primary/15 text-primary'
                                    : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'
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

            {/* Inline CSS for mesh rings + shimmer + step slide-in */}
            <style dangerouslySetInnerHTML={{__html: `
                .loader-mesh { position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; }
                .mesh-ring { position: absolute; border-radius: 50%; border: 2px solid transparent; border-top-color: #FF4D00; }
                .mesh- { width: 100%; height: 100%; animation: spin 2s linear infinite; opacity: 0.6; }
                .mesh-ring-2 { width: 80%; height: 80%; animation: spin 1.5s linear infinite reverse; border-top-color: #6366f1; opacity: 0.8; }
                .mesh-ring-3 { width: 60%; height: 60%; animation: spin 1s linear infinite; border-top-color: #e2e8f0; opacity: 0.3; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes progressShimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes glStepSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </div>
    );
}

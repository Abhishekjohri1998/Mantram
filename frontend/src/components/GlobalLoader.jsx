import React, { useState, useEffect } from 'react';

/**
 * GlobalLoader — Premium loading overlay with animated progress bar, %, and ETA.
 *
 * Props:
 *  - isActive         (bool)    Show/hide
 *  - title            (string)  Main heading
 *  - stages           (array)   Pipeline stage labels
 *  - currentStage     (string)  Active stage label
 *  - elapsed          (number)  Optional parent-supplied elapsed seconds
 *  - estimatedDuration(number)  Expected total seconds (default 30)
 *  - icon             (string)  Material icon name
 */
export default function GlobalLoader({
    isActive,
    title = 'Processing Request...',
    stages = [],
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

    // Progress calculation — eases toward 95%, never reaches 100% until done
    const rawPct = estimatedDuration > 0 ? (localElapsed / estimatedDuration) * 100 : 0;
    // Use an ease-out curve so it slows down as it approaches 95%
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

    return (
        <div className="glass-panel rounded-2xl p-10 text-center flex flex-col items-center justify-center min-h-[360px] animate-fade-in w-full">
            {/* Animated mesh spinner */}
            <div className="loader-mesh mb-6">
                <div className="mesh-ring mesh-ring-1"></div>
                <div className="mesh-ring mesh-ring-2"></div>
                <div className="mesh-ring mesh-ring-3"></div>
                <span className="material-symbols-outlined text-4xl text-primary relative z-10 animate-pulse">{icon}</span>
            </div>

            {/* Title */}
            <h3 className="text-xl font-black text-white mb-2">{title}</h3>

            {/* Current stage label */}
            {currentStage && (
                <p className="text-sm text-primary animate-pulse mb-4">{currentStage}</p>
            )}

            {/* ── Progress Bar ── */}
            <div className="w-full max-w-sm mt-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl font-black text-white">{displayPct}%</span>
                    <span className="text-xs text-slate-500 font-mono">{elapsedLabel} elapsed</span>
                </div>
                <div className="w-full h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
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
                    {localElapsed > 15 && stages.length > 3 && (
                        <span className="text-[11px] text-slate-600">Complex task — may take a few minutes</span>
                    )}
                </div>
            </div>

            {/* Stage dots */}
            {stages.length > 0 && (
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

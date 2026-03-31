/**
 * BackgroundJobsPanel — Global floating panel showing active & completed generation jobs.
 *
 * Lives in App.jsx (always mounted). Shows:
 * - A pulsing badge/button when jobs are active or newly completed
 * - A dropdown panel listing all jobs with status, preview, and actions
 * - Toasts when jobs complete (auto-dismiss after 6s)
 *
 * Survives navigation, refresh, and tab switches because useBackgroundJobs
 * persists to localStorage and polls from any page.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJobs } from '../hooks/useBackgroundJobs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatElapsed(createdAt) {
    if (!createdAt) return '';
    const secAgo = Math.floor((Date.now() - createdAt) / 1000);
    if (secAgo < 60) return `${secAgo}s ago`;
    const minAgo = Math.floor(secAgo / 60);
    if (minAgo < 60) return `${minAgo}m ago`;
    return `${Math.floor(minAgo / 60)}h ago`;
}

function formatFormat(fmt) {
    const labels = {
        'instagram-post': 'Instagram Post',
        'instagram-story': 'Instagram Story',
        'facebook-ad': 'Facebook Ad',
        'linkedin-post': 'LinkedIn Post',
        'twitter-post': 'Twitter Post',
        'banner': 'Banner',
        'billboard': 'Billboard',
        'youtube-thumbnail': 'YouTube Thumb',
    };
    return labels[fmt] || fmt || 'Creative';
}

// ── Toast notification ────────────────────────────────────────────────────────

const toastQueue = new Set(); // prevent double-toasting same jobId

function JobToast({ job, onDismiss }) {
    const navigate = useNavigate();
    const isError = job.status === 'failed';

    return (
        <div className="bg-job-toast" data-status={isError ? 'error' : 'success'}>
            <div className="bg-job-toast-icon">
                {isError ? '✗' : '✓'}
            </div>
            <div className="bg-job-toast-body">
                <div className="bg-job-toast-title">
                    {isError ? 'Generation failed' : 'Image ready!'}
                </div>
                <div className="bg-job-toast-sub">
                    {job.prompt?.substring(0, 60)}{job.prompt?.length > 60 ? '…' : ''}
                </div>
            </div>
            <div className="bg-job-toast-actions">
                {!isError && (
                    <button
                        className="bg-job-toast-btn bg-job-btn-view"
                        onClick={() => { navigate('/creative-studio'); onDismiss(); }}
                    >
                        View
                    </button>
                )}
                <button className="bg-job-toast-btn bg-job-btn-dismiss" onClick={onDismiss}>
                    ✕
                </button>
            </div>
        </div>
    );
}

// ── Main Panel Component ──────────────────────────────────────────────────────

export default function BackgroundJobsPanel() {
    const {
        jobs,
        pendingCount,
        completedJobs,
        failedJobs,
        totalActiveOrNew,
        dismissJob,
        removeJob,
    } = useJobs();


    const [panelOpen, setPanelOpen] = useState(false);
    const [toasts, setToasts] = useState([]); // [{ job }]
    const panelRef = useRef(null);
    const seenCompletedRef = useRef(new Set());

    // ── Auto-toast on job completion & auto-cleanup ──
    useEffect(() => {
        const newlyDone = [...completedJobs, ...failedJobs].filter(job => {
            if (seenCompletedRef.current.has(job.jobId)) return false;
            if (toastQueue.has(job.jobId)) return false;
            return true;
        });

        if (newlyDone.length > 0) {
            newlyDone.forEach(job => {
                seenCompletedRef.current.add(job.jobId);
                toastQueue.add(job.jobId);
                setToasts(prev => [...prev, { job, id: Date.now() + Math.random() }]);
                // Auto-dismiss toast after 6 seconds, then auto-remove from list
                setTimeout(() => {
                    setToasts(prev => prev.filter(t => t.job.jobId !== job.jobId));
                    toastQueue.delete(job.jobId);
                    // Auto-dismiss so badge hides — completed jobs already viewed
                    dismissJob(job.jobId);
                }, 6000);
                // Auto-remove failed jobs entirely after 15 seconds
                if (job.status === 'failed') {
                    setTimeout(() => removeJob(job.jobId), 15000);
                }
            });
        }
    }, [completedJobs, failedJobs, dismissJob, removeJob]);

    // ── Close panel on outside click ──
    useEffect(() => {
        function handleClickOutside(e) {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setPanelOpen(false);
            }
        }
        if (panelOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [panelOpen]);

    // Only show badge when there's something actionable:
    // - Active jobs (pending/processing)
    // - Undismissed completed jobs
    // - Active toasts
    const hasActionableJobs = pendingCount > 0 || completedJobs.length > 0;
    if (!hasActionableJobs && toasts.length === 0) return null;

    const allJobs = [...jobs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return (
        <>
            {/* ── Toast container ── */}
            <div className="bg-jobs-toasts" aria-live="polite">
                {toasts.map(t => (
                    <JobToast
                        key={t.id}
                        job={t.job}
                        onDismiss={() => {
                            setToasts(prev => prev.filter(x => x.id !== t.id));
                            dismissJob(t.job.jobId);
                        }}
                    />
                ))}
            </div>

            {/* ── Floating trigger button ── */}
            <div className="bg-jobs-wrapper" ref={panelRef}>
                <button
                    className="bg-jobs-trigger"
                    onClick={() => setPanelOpen(p => !p)}
                    title="Background generation jobs"
                    aria-label={`${totalActiveOrNew} generation job${totalActiveOrNew !== 1 ? 's' : ''}`}
                >
                    <span className="bg-jobs-trigger-icon">
                        {pendingCount > 0 ? (
                            <span className="bg-jobs-spinner-ring" aria-hidden="true" />
                        ) : '⚡'}
                    </span>
                    <span className="bg-jobs-trigger-label">
                        {pendingCount > 0 ? `${pendingCount} generating…` : `${totalActiveOrNew} ready`}
                    </span>
                    {totalActiveOrNew > 0 && (
                        <span className="bg-jobs-badge">{totalActiveOrNew}</span>
                    )}
                </button>

                {/* ── Dropdown Panel ── */}
                {panelOpen && (
                    <div className="bg-jobs-panel" role="dialog" aria-label="Generation jobs">
                        <div className="bg-jobs-panel-header">
                            <span className="bg-jobs-panel-title">⚡ Generation Jobs</span>
                            <button className="bg-jobs-panel-close" onClick={() => setPanelOpen(false)}>✕</button>
                        </div>
                        <div className="bg-jobs-panel-list">
                            {allJobs.length === 0 ? (
                                <div className="bg-jobs-empty">No recent jobs</div>
                            ) : (
                                allJobs.map(job => (
                                    <JobRow
                                        key={job.jobId}
                                        job={job}
                                        onDismiss={() => dismissJob(job.jobId)}
                                        onRemove={() => removeJob(job.jobId)}
                                    />
                                ))
                            )}
                        </div>
                        {allJobs.length > 0 && (
                            <div className="bg-jobs-panel-footer">
                                <button
                                    className="bg-jobs-clear-btn"
                                    onClick={() => allJobs.filter(j => j.status !== 'pending' && j.status !== 'processing').forEach(j => removeJob(j.jobId))}
                                >
                                    Clear completed
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

// ── Individual job row ────────────────────────────────────────────────────────

function JobRow({ job, onDismiss, onRemove }) {
    const navigate = useNavigate();
    const isActive = job.status === 'pending' || job.status === 'processing';
    const isDone = job.status === 'completed';
    const isFailed = job.status === 'failed';
    const isCancelled = job.status === 'cancelled';

    return (
        <div className={`bg-job-row${isFailed ? ' bg-job-row--error' : ''}${isDone ? ' bg-job-row--done' : ''}`}>
            {/* Thumbnail / Status icon */}
            <div className="bg-job-thumb">
                {isDone && job.imageUrl ? (
                    <img src={job.imageUrl} alt="Generated creative" className="bg-job-img" />
                ) : (
                    <div className="bg-job-thumb-placeholder" data-status={job.status}>
                        {isActive && <span className="bg-job-spin" />}
                        {isFailed && '✗'}
                        {isCancelled && '○'}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="bg-job-info">
                <div className="bg-job-format">{formatFormat(job.format)}</div>
                <div className="bg-job-prompt">
                    {job.prompt?.substring(0, 70)}{job.prompt?.length > 70 ? '…' : ''}
                </div>
                <div className="bg-job-meta">
                    <span className={`bg-job-status-pill bg-job-status-pill--${job.status}`}>
                        {isActive ? 'Generating…' : isDone ? 'Ready' : isFailed ? 'Failed' : 'Cancelled'}
                    </span>
                    <span className="bg-job-elapsed">{formatElapsed(job.createdAt)}</span>
                    {job._reconnected && <span className="bg-job-reconnected">↺ Reconnected</span>}
                </div>
                {isFailed && job.errorMessage && (
                    <div className="bg-job-error-msg">{job.errorMessage.substring(0, 80)}</div>
                )}
            </div>

            {/* Actions */}
            <div className="bg-job-actions">
                {isDone && (
                    <button
                        className="bg-job-action-btn bg-job-action-btn--view"
                        onClick={() => { navigate('/creative-studio'); onDismiss(); }}
                        title="View in Creative Studio"
                    >
                        View
                    </button>
                )}
                {!isActive && (
                    <button
                        className="bg-job-action-btn bg-job-action-btn--remove"
                        onClick={onRemove}
                        title="Remove"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
}

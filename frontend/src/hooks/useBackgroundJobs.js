/**
 * useBackgroundJobs — Global hook for persistent generation job tracking.
 *
 * Persists active job IDs to localStorage so polling resumes after:
 * - Tab switching (navigating to other studio pages)
 * - Page refresh
 * - Browser close + reopen
 *
 * Usage:
 *   const { jobs, addJob, removeJob, pendingCount, completedCount } = useBackgroundJobs()
 */

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { creatives as creativesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'mantram_bg_jobs';
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // Don't track jobs older than 48h
const STALE_JOB_MS = 10 * 60 * 1000; // Auto-fail jobs stuck >10 minutes

// ── Persist/read from localStorage ──────────────────────────────────────────

function readStoredJobs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        // Prune expired entries
        const now = Date.now();
        const pruned = {};
        for (const [jobId, job] of Object.entries(parsed)) {
            if (job.createdAt && (now - job.createdAt) < MAX_AGE_MS) {
                pruned[jobId] = job;
            }
        }
        return pruned;
    } catch {
        return {};
    }
}

function writeStoredJobs(jobs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
    } catch { /* storage full, ignore */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useBackgroundJobs() {
    const [jobs, setJobs] = useState(() => readStoredJobs());
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);
    const { user } = useAuth(); // Guard: only reconcile when logged in

    // Sync state -> localStorage on every change
    useEffect(() => {
        writeStoredJobs(jobs);
    }, [jobs]);

    // Cleanup on unmount
    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    // ── addJob: called when user clicks Generate ──
    const addJob = useCallback((jobId, meta = {}) => {
        setJobs(prev => ({
            ...prev,
            [jobId]: {
                jobId,
                status: 'pending',
                createdAt: Date.now(),
                prompt: meta.prompt || '',
                format: meta.format || '',
                brandId: meta.brandId || '',
                imageUrl: null,
                errorMessage: null,
                _dismissed: false,
                ...meta,
            },
        }));
    }, []);

    // ── removeJob: called when user dismisses a completed/failed job ──
    const removeJob = useCallback((jobId) => {
        setJobs(prev => {
            const next = { ...prev };
            delete next[jobId];
            return next;
        });
    }, []);

    // ── dismissJob: marks a completed/failed job as seen without removing ──
    const dismissJob = useCallback((jobId) => {
        setJobs(prev => ({
            ...prev,
            [jobId]: { ...prev[jobId], _dismissed: true },
        }));
    }, []);

    // ── Poll active jobs ──────────────────────────────────────────────────────
    const pollJobs = useCallback(async () => {
        const current = readStoredJobs();
        const activeJobs = Object.values(current).filter(
            j => j.status === 'pending' || j.status === 'processing'
        );
        if (activeJobs.length === 0) return;

        const now = Date.now();

        await Promise.allSettled(
            activeJobs.map(async (job) => {
                // ── STALE JOB CHECK: Auto-fail jobs stuck too long ──
                const jobAge = now - (job.createdAt || 0);
                if (jobAge > STALE_JOB_MS) {
                    console.warn(`[BackgroundJobs] Job ${job.jobId} stale (${Math.round(jobAge / 60000)}m) — marking failed`);
                    setJobs(prev => {
                        if (!prev[job.jobId]) return prev;
                        return {
                            ...prev,
                            [job.jobId]: {
                                ...prev[job.jobId],
                                status: 'failed',
                                errorMessage: 'Generation timed out. Please try again.',
                                completedAt: now,
                            },
                        };
                    });
                    return;
                }

                try {
                    const data = await creativesAPI.pollJob(job.jobId);

                    // ── 404 or missing: job doesn't exist on server anymore ──
                    if (!data?.success || !data?.job) {
                        setJobs(prev => {
                            if (!prev[job.jobId]) return prev;
                            return {
                                ...prev,
                                [job.jobId]: {
                                    ...prev[job.jobId],
                                    status: 'failed',
                                    errorMessage: 'Job not found on server. It may have expired.',
                                    completedAt: now,
                                },
                            };
                        });
                        return;
                    }

                    const serverJob = data.job;
                    if (!mountedRef.current) return;

                    // ── Server still says processing but it's been too long → fail it ──
                    const serverCreated = serverJob.createdAt ? new Date(serverJob.createdAt).getTime() : job.createdAt;
                    const serverAge = now - serverCreated;
                    const effectiveStatus = (
                        (serverJob.status === 'pending' || serverJob.status === 'processing') &&
                        serverAge > STALE_JOB_MS
                    ) ? 'failed' : serverJob.status;

                    setJobs(prev => {
                        if (!prev[job.jobId]) return prev;
                        return {
                            ...prev,
                            [job.jobId]: {
                                ...prev[job.jobId],
                                status: effectiveStatus,
                                imageUrl: serverJob.imageUrl || prev[job.jobId].imageUrl,
                                creativeId: serverJob.creativeId,
                                errorMessage: effectiveStatus === 'failed' && !serverJob.errorMessage
                                    ? 'Generation timed out. Please try again.'
                                    : serverJob.errorMessage,
                                completedAt: serverJob.completedAt || (effectiveStatus === 'failed' ? now : undefined),
                                result: serverJob.result,
                                warnings: serverJob.warnings,
                            },
                        };
                    });
                } catch {
                    // Network error — increment strike counter; auto-fail after 3 consecutive errors
                    setJobs(prev => {
                        if (!prev[job.jobId]) return prev;
                        const strikes = (prev[job.jobId]._errorStrikes || 0) + 1;
                        if (strikes >= 3) {
                            console.warn(`[BackgroundJobs] Job ${job.jobId} — 3 poll errors, clearing ghost job`);
                            return {
                                ...prev,
                                [job.jobId]: { ...prev[job.jobId], status: 'failed', errorMessage: 'Lost connection. Please try again.', completedAt: Date.now() },
                            };
                        }
                        return { ...prev, [job.jobId]: { ...prev[job.jobId], _errorStrikes: strikes } };
                    });
                }
            })
        );
    }, []);

    // ── Start/stop polling interval ───────────────────────────────────────────
    useEffect(() => {
        const hasActiveJobs = Object.values(jobs).some(
            j => j.status === 'pending' || j.status === 'processing'
        );

        if (hasActiveJobs && !intervalRef.current) {
            // Start polling
            intervalRef.current = setInterval(pollJobs, POLL_INTERVAL_MS);
            // Poll immediately too
            pollJobs();
        } else if (!hasActiveJobs && intervalRef.current) {
            // Stop polling when no active jobs
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [jobs, pollJobs]);

    // On first mount (logged-in only), load recent jobs from server to reconnect
    useEffect(() => {
        if (!user?._id) return; // Don't fire for anonymous / logged-out users

        const reconcileFromServer = async () => {
            try {
                const data = await creativesAPI.listJobs();
                if (!data?.success || !data?.jobs) return;

                const storedJobs = readStoredJobs();
                const updates = {};

                for (const serverJob of data.jobs) {
                    const { jobId } = serverJob;
                    const existing = storedJobs[jobId];
                    const serverCreatedAt = new Date(serverJob.createdAt).getTime();
                    const isStale = (Date.now() - serverCreatedAt) > STALE_JOB_MS;
                    const isStillActive = serverJob.status === 'processing' || serverJob.status === 'pending';

                    if (existing) {
                        // Update status of known jobs — but auto-fail if stale
                        updates[jobId] = {
                            ...existing,
                            status: (isStillActive && isStale) ? 'failed' : serverJob.status,
                            imageUrl: serverJob.imageUrl || existing.imageUrl,
                            creativeId: serverJob.creativeId,
                            errorMessage: (isStillActive && isStale)
                                ? 'Generation timed out. Please try again.'
                                : serverJob.errorMessage,
                        };
                    } else if (isStillActive && !isStale) {
                        // Reconnect to recent in-progress jobs (e.g. after browser close)
                        updates[jobId] = {
                            jobId,
                            status: serverJob.status,
                            createdAt: serverCreatedAt,
                            prompt: serverJob.prompt || '',
                            format: serverJob.format || '',
                            imageUrl: serverJob.imageUrl || null,
                            _dismissed: false,
                            _reconnected: true,
                        };
                    }
                    // If stale + not in localStorage → just ignore it (don't reconnect)
                }

                if (Object.keys(updates).length > 0 && mountedRef.current) {
                    setJobs(prev => ({ ...prev, ...updates }));
                }
            } catch {
                // Network error on startup — ignore, will work on next manual trigger
            }
        };

        reconcileFromServer();

        // ── Auto-cleanup: remove old dismissed/failed jobs from localStorage ──
        const stored = readStoredJobs();
        const now = Date.now();
        let changed = false;
        for (const [jobId, job] of Object.entries(stored)) {
            const age = now - (job.createdAt || 0);
            const isDone = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
            // Remove finished jobs older than 5 minutes, or dismissed jobs
            if ((isDone && age > 5 * 60 * 1000) || job._dismissed) {
                delete stored[jobId];
                changed = true;
            }
        }
        if (changed && mountedRef.current) {
            writeStoredJobs(stored);
            setJobs(stored);
        }
    }, [user?._id]); // Only re-run if the logged-in user changes

    // ── Derived state ─────────────────────────────────────────────────────────
    const jobList = Object.values(jobs);
    const pendingCount = jobList.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const completedJobs = jobList.filter(j => j.status === 'completed' && !j._dismissed);
    const failedJobs = jobList.filter(j => j.status === 'failed' && !j._dismissed);
    const newCompletedCount = completedJobs.length;
    const totalActiveOrNew = pendingCount + newCompletedCount;

    return {
        jobs: jobList,
        addJob,
        removeJob,
        dismissJob,
        pendingCount,
        completedJobs,
        failedJobs,
        newCompletedCount,
        totalActiveOrNew,
    };
}

// ── Context for global access without prop drilling ───────────────────────────
export const BackgroundJobsContext = createContext(null);

export function useJobs() {
    const ctx = useContext(BackgroundJobsContext);
    if (!ctx) throw new Error('useJobs must be used inside BackgroundJobsContext.Provider');
    return ctx;
}


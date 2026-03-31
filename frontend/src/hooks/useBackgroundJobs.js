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

        await Promise.allSettled(
            activeJobs.map(async (job) => {
                try {
                    const data = await creativesAPI.pollJob(job.jobId);
                    if (!data?.success || !data?.job) return;
                    const serverJob = data.job;

                    if (!mountedRef.current) return;

                    setJobs(prev => {
                        if (!prev[job.jobId]) return prev; // was removed
                        return {
                            ...prev,
                            [job.jobId]: {
                                ...prev[job.jobId],
                                status: serverJob.status,
                                imageUrl: serverJob.imageUrl || prev[job.jobId].imageUrl,
                                creativeId: serverJob.creativeId,
                                errorMessage: serverJob.errorMessage,
                                completedAt: serverJob.completedAt,
                                result: serverJob.result,
                                warnings: serverJob.warnings,
                            },
                        };
                    });
                } catch {
                    // Ignore polling errors — will retry next interval
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

                    if (existing) {
                        // Update status of known jobs
                        updates[jobId] = {
                            ...existing,
                            status: serverJob.status,
                            imageUrl: serverJob.imageUrl || existing.imageUrl,
                            creativeId: serverJob.creativeId,
                            errorMessage: serverJob.errorMessage,
                        };
                    } else if (serverJob.status === 'processing' || serverJob.status === 'pending') {
                        // Reconnect to orphaned in-progress jobs (e.g. after browser close)
                        updates[jobId] = {
                            jobId,
                            status: serverJob.status,
                            createdAt: new Date(serverJob.createdAt).getTime(),
                            prompt: serverJob.prompt || '',
                            format: serverJob.format || '',
                            imageUrl: serverJob.imageUrl || null,
                            _dismissed: false,
                            _reconnected: true, // Flag so UI can show "Reconnected"
                        };
                    }
                }

                if (Object.keys(updates).length > 0 && mountedRef.current) {
                    setJobs(prev => ({ ...prev, ...updates }));
                }
            } catch {
                // Network error on startup — ignore, will work on next manual trigger
            }
        };

        reconcileFromServer();
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


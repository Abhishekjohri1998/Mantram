/**
 * useBrandSession — Per-brand session persistence
 *
 * Stores and restores:
 *   - lastActivePage  (route pathname)
 *   - lastActiveModule (module name string)
 *   - activeJobs      (array of in-progress job IDs per brand)
 *
 * Storage key format: mantram_session_{userId}_{brandId}
 */
import { useCallback } from 'react';

const SESSION_PREFIX = 'mantram_session';

function getKey(userId, brandId) {
    return `${SESSION_PREFIX}_${userId}_${brandId}`;
}

function readSession(userId, brandId) {
    if (!userId || !brandId) return {};
    try {
        const raw = localStorage.getItem(getKey(userId, brandId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function writeSession(userId, brandId, data) {
    if (!userId || !brandId) return;
    try {
        const existing = readSession(userId, brandId);
        localStorage.setItem(getKey(userId, brandId), JSON.stringify({ ...existing, ...data }));
    } catch { /* quota exceeded — silent */ }
}

export function useBrandSession(userId) {
    /**
     * Save current page for a brand before switching away
     */
    const saveSession = useCallback((brandId, patch) => {
        writeSession(userId, brandId, patch);
    }, [userId]);

    /**
     * Restore session for a brand (returns { lastActivePage, lastActiveModule, activeJobs })
     */
    const restoreSession = useCallback((brandId) => {
        return readSession(userId, brandId);
    }, [userId]);

    /**
     * Save an active job ID for a brand (video generation, content, etc.)
     */
    const saveActiveJob = useCallback((brandId, jobId, meta = {}) => {
        const session = readSession(userId, brandId);
        const existingJobs = session.activeJobs || [];
        // Avoid duplicates
        const filtered = existingJobs.filter(j => j.jobId !== jobId);
        writeSession(userId, brandId, {
            activeJobs: [...filtered, { jobId, ...meta, savedAt: Date.now() }],
        });
    }, [userId]);

    /**
     * Remove a completed / failed job from session
     */
    const removeActiveJob = useCallback((brandId, jobId) => {
        const session = readSession(userId, brandId);
        const existingJobs = (session.activeJobs || []).filter(j => j.jobId !== jobId);
        writeSession(userId, brandId, { activeJobs: existingJobs });
    }, [userId]);

    /**
     * Get all active jobs for a brand
     */
    const getActiveJobs = useCallback((brandId) => {
        const session = readSession(userId, brandId);
        // Expire jobs older than 6 hours
        const SIX_HOURS = 6 * 60 * 60 * 1000;
        return (session.activeJobs || []).filter(j => Date.now() - (j.savedAt || 0) < SIX_HOURS);
    }, [userId]);

    return { saveSession, restoreSession, saveActiveJob, removeActiveJob, getActiveJobs };
}

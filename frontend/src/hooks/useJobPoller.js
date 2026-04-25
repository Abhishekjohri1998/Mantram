/**
 * useJobPoller — Global background job tracker
 *
 * Loads active jobs from localStorage on mount, polls their status every 5s,
 * fires in-app notifications on completion/failure, and removes them from state.
 *
 * Usage: mount once in Header.jsx (or DashboardLayout)
 */
import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { jobs as jobsAPI } from '../services/api'
import { useUI } from '../context/UIContext'
import { useAuth } from '../context/AuthContext'

const POLL_INTERVAL_MS = 5000
const LS_KEY = (userId) => `mantram_active_jobs_${userId}`

// ── Persistence helpers ──────────────────────────────────────────────────────
function readPersistedJobs(userId) {
    if (!userId) return []
    try {
        const raw = localStorage.getItem(LS_KEY(userId))
        if (!raw) return []
        const parsed = JSON.parse(raw)
        // Expire jobs older than 8 hours
        const EIGHT_H = 8 * 60 * 60 * 1000
        return parsed.filter(j => Date.now() - (j.savedAt || 0) < EIGHT_H)
    } catch { return [] }
}

function persistJob(userId, job) {
    if (!userId) return
    const existing = readPersistedJobs(userId).filter(j => j.jobId !== job.jobId)
    try { localStorage.setItem(LS_KEY(userId), JSON.stringify([...existing, { ...job, savedAt: Date.now() }])) } catch { }
}

function removePersistedJob(userId, jobId) {
    if (!userId) return
    const updated = readPersistedJobs(userId).filter(j => j.jobId !== jobId)
    try { localStorage.setItem(LS_KEY(userId), JSON.stringify(updated)) } catch { }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useJobPoller() {
    const { user } = useAuth()
    const {
        activeJobs, addActiveJob, removeActiveJob,
        addNotification, fetchNotifications,
    } = useUI()
    const pollRef   = useRef(null)
    const polling   = useRef(new Set()) // jobIds currently being polled
    const navigate  = useNavigate()

    // ── Restore jobs from localStorage on mount ──
    useEffect(() => {
        if (!user?._id) return
        const saved = readPersistedJobs(user._id)
        saved.forEach(j => addActiveJob(j))
    }, [user?._id])

    // ── Save new active jobs to localStorage ──
    useEffect(() => {
        if (!user?._id) return
        activeJobs.forEach(j => persistJob(user._id, j))
    }, [activeJobs, user?._id])

    // ── Poll logic ──────────────────────────────────────────────────────────
    const pollJob = useCallback(async (job) => {
        if (polling.current.has(job.jobId)) return
        polling.current.add(job.jobId)
        try {
            const data = await jobsAPI.status(job.jobId)
            const j = data?.job
            if (!j) return

            if (j.status === 'completed') {
                removeActiveJob(job.jobId)
                removePersistedJob(user?._id, job.jobId)
                polling.current.delete(job.jobId)

                // Optimistic in-memory notification (DB version fetched next poll)
                const typeEmoji = j.type === 'monthly-strategy' ? '📅'
                    : j.type === 'research' ? '🔬'
                    : j.type === 'video'    ? '🎬'
                    : '🎨'
                addNotification({
                    _id:   `optimistic_${j.jobId}`,
                    type:  j.type,
                    title: `${typeEmoji} ${j.type === 'monthly-strategy' ? 'Strategy' : j.type === 'research' ? 'Research' : j.type === 'video' ? 'Video' : 'Creative'} Ready`,
                    body:  j.meta?.label || 'Your task has completed.',
                    link:  j.meta?.page || '/',
                    read:  false,
                    createdAt: new Date().toISOString(),
                    jobId: j.jobId,
                })
                // Sync notifications from server
                setTimeout(() => fetchNotifications(), 1500)
            }

            if (j.status === 'failed') {
                removeActiveJob(job.jobId)
                removePersistedJob(user?._id, job.jobId)
                polling.current.delete(job.jobId)
                addNotification({
                    _id:   `optimistic_fail_${j.jobId}`,
                    type:  j.type,
                    title: `⚠️ ${j.type === 'monthly-strategy' ? 'Strategy' : 'Task'} Failed`,
                    body:  j.errorMessage || 'An error occurred.',
                    link:  j.meta?.page || '/',
                    read:  false,
                    createdAt: new Date().toISOString(),
                    jobId: j.jobId,
                })
                setTimeout(() => fetchNotifications(), 1500)
            }

            if (j.status === 'cancelled') {
                removeActiveJob(job.jobId)
                removePersistedJob(user?._id, job.jobId)
                polling.current.delete(job.jobId)
            }
        } catch {
            // Network error — keep polling
        } finally {
            polling.current.delete(job.jobId)
        }
    }, [user?._id, addNotification, removeActiveJob, fetchNotifications])

    // ── Polling interval ────────────────────────────────────────────────────
    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current)
        if (!user?._id) return

        pollRef.current = setInterval(() => {
            activeJobs.forEach(job => pollJob(job))
        }, POLL_INTERVAL_MS)

        return () => clearInterval(pollRef.current)
    }, [activeJobs, user?._id, pollJob])

    // ── Expose helpers for call-sites ────────────────────────────────────────
    return {
        /** Call after POST /generate/start — saves job and starts polling */
        trackJob: useCallback((job) => {
            addActiveJob(job)
            persistJob(user?._id, job)
        }, [addActiveJob, user?._id]),
        /** Manually cancel a job */
        cancelJob: useCallback(async (jobId) => {
            await jobsAPI.cancel(jobId).catch(() => {})
            removeActiveJob(jobId)
            removePersistedJob(user?._id, jobId)
        }, [removeActiveJob, user?._id]),
    }
}

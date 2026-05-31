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

    // ── SSE Stream logic ────────────────────────────────────────────────────────
    const streamsRef = useRef(new Map())

    useEffect(() => {
        if (!user?._id) return

        activeJobs.forEach(job => {
            const jobId = job.jobId
            if (streamsRef.current.has(jobId)) return

            const url = jobsAPI.getJobStreamUrl(jobId)
            const source = new EventSource(url)
            streamsRef.current.set(jobId, source)

            source.onmessage = (event) => {
                if (event.data === 'ping') return
                try {
                    const j = JSON.parse(event.data)
                    if (j.error) {
                        source.close()
                        streamsRef.current.delete(jobId)
                        removeActiveJob(jobId)
                        removePersistedJob(user._id, jobId)
                        return
                    }

                    if (j.status === 'completed') {
                        source.close()
                        streamsRef.current.delete(jobId)
                        removeActiveJob(jobId)
                        removePersistedJob(user._id, jobId)

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
                        setTimeout(() => fetchNotifications(), 1500)
                    } else if (j.status === 'failed') {
                        source.close()
                        streamsRef.current.delete(jobId)
                        removeActiveJob(jobId)
                        removePersistedJob(user._id, jobId)

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
                    } else if (j.status === 'cancelled') {
                        source.close()
                        streamsRef.current.delete(jobId)
                        removeActiveJob(jobId)
                        removePersistedJob(user._id, jobId)
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            source.onerror = () => {
                // EventSource auto-reconnects, let it retry quietly.
            }
        })

        // Cleanup streams for jobs that are no longer active
        for (const [jobId, source] of streamsRef.current.entries()) {
            if (!activeJobs.find(j => j.jobId === jobId)) {
                source.close()
                streamsRef.current.delete(jobId)
            }
        }
    }, [activeJobs, user?._id, addNotification, removeActiveJob, fetchNotifications])

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

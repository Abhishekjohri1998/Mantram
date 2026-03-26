import { createContext, useContext, useState, useRef, useCallback } from 'react'

/* ══════════════════════════════════════════════════════════════════════════
   SEO TASK CONTEXT — Background Task Manager (max 3 concurrent)
   ══════════════════════════════════════════════════════════════════════════ */

const SeoTaskContext = createContext(null)
export const useSeoTasks = () => useContext(SeoTaskContext)

const MAX_CONCURRENT = 3

/**
 * Task shape:
 * {
 *   status: 'running' | 'done' | 'error',
 *   label: string,
 *   results: any | null,
 *   error: string | null,
 *   startedAt: number,
 *   elapsed: number,
 *   stage: string,
 *   stages: string[],
 *   estimatedDuration: number,
 * }
 */

export function SeoTaskProvider({ children, onNavigate }) {
    const [tasks, setTasks] = useState({})          // taskKey → task
    const [toasts, setToasts] = useState([])         // { id, type, message, taskKey }
    const abortControllers = useRef({})              // taskKey → AbortController
    const elapsedTimers = useRef({})                 // taskKey → intervalId
    const stageTimers = useRef({})                   // taskKey → intervalId

    // ── Helpers ──
    const pushToast = useCallback((type, message, taskKey = null) => {
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, type, message, taskKey }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5500)
    }, [])

    const dismissToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const getRunningCount = useCallback(() => {
        return Object.values(tasks).filter(t => t.status === 'running').length
    }, [tasks])

    // Must use ref-based running count for the closure inside startTask
    const tasksRef = useRef(tasks)
    tasksRef.current = tasks

    // ── Start a task ──
    const startTask = useCallback((taskKey, label, apiFn, payload, stages = [], estimatedDuration = 60) => {
        // Check: is this task already running?
        if (tasksRef.current[taskKey]?.status === 'running') {
            pushToast('warning', `${label} is already running`)
            return false
        }

        // Check concurrent limit
        const running = Object.values(tasksRef.current).filter(t => t.status === 'running').length
        if (running >= MAX_CONCURRENT) {
            pushToast('limit', `3 tasks already running — wait for one to finish`)
            return false
        }

        // Cancel any previous abort controller for this key
        if (abortControllers.current[taskKey]) {
            abortControllers.current[taskKey].abort()
        }

        // Set up abort controller
        const controller = new AbortController()
        abortControllers.current[taskKey] = controller

        // Initialize task
        const initialStage = stages[0] || 'Processing...'
        setTasks(prev => ({
            ...prev,
            [taskKey]: {
                status: 'running',
                label,
                results: null,
                error: null,
                startedAt: Date.now(),
                elapsed: 0,
                stage: initialStage,
                stages,
                estimatedDuration,
            }
        }))

        // Elapsed timer
        elapsedTimers.current[taskKey] = setInterval(() => {
            setTasks(prev => {
                if (!prev[taskKey] || prev[taskKey].status !== 'running') return prev
                return { ...prev, [taskKey]: { ...prev[taskKey], elapsed: prev[taskKey].elapsed + 1 } }
            })
        }, 1000)

        // Stage rotation timer
        let stageIdx = 0
        if (stages.length > 1) {
            stageTimers.current[taskKey] = setInterval(() => {
                stageIdx = Math.min(stageIdx + 1, stages.length - 1)
                setTasks(prev => {
                    if (!prev[taskKey] || prev[taskKey].status !== 'running') return prev
                    return { ...prev, [taskKey]: { ...prev[taskKey], stage: stages[stageIdx] } }
                })
            }, 8000)
        }

        // Fire the API call
        ;(async () => {
            try {
                const data = await apiFn(payload)
                // Clean up timers
                clearInterval(elapsedTimers.current[taskKey])
                clearInterval(stageTimers.current[taskKey])
                delete abortControllers.current[taskKey]

                if (data.success !== false) {
                    setTasks(prev => ({
                        ...prev,
                        [taskKey]: { ...prev[taskKey], status: 'done', results: data, stage: 'Complete' }
                    }))
                    pushToast('success', `${label} complete`, taskKey)
                } else {
                    setTasks(prev => ({
                        ...prev,
                        [taskKey]: { ...prev[taskKey], status: 'error', error: data.error || 'Analysis failed', stage: '' }
                    }))
                    pushToast('error', `${label} failed`, taskKey)
                }
            } catch (e) {
                clearInterval(elapsedTimers.current[taskKey])
                clearInterval(stageTimers.current[taskKey])
                delete abortControllers.current[taskKey]

                if (e.name === 'AbortError') {
                    // User cancelled — just clean up status
                    setTasks(prev => {
                        const next = { ...prev }
                        delete next[taskKey]
                        return next
                    })
                } else {
                    setTasks(prev => ({
                        ...prev,
                        [taskKey]: { ...prev[taskKey], status: 'error', error: e.message, stage: '' }
                    }))
                    pushToast('error', `${label} failed`, taskKey)
                }
            }
        })()

        return true
    }, [pushToast])

    // ── Cancel a task ──
    const cancelTask = useCallback((taskKey) => {
        if (abortControllers.current[taskKey]) {
            abortControllers.current[taskKey].abort()
        }
        clearInterval(elapsedTimers.current[taskKey])
        clearInterval(stageTimers.current[taskKey])
        setTasks(prev => {
            const next = { ...prev }
            delete next[taskKey]
            return next
        })
    }, [])

    // ── Get task state ──
    const getTask = useCallback((taskKey) => {
        return tasksRef.current[taskKey] || null
    }, [])

    // ── Clear completed task ──
    const clearTask = useCallback((taskKey) => {
        setTasks(prev => {
            const next = { ...prev }
            delete next[taskKey]
            return next
        })
    }, [])

    // ── Running tasks list ──
    const runningTasks = Object.entries(tasks)
        .filter(([, t]) => t.status === 'running')
        .map(([key, t]) => ({ key, ...t }))

    const value = {
        tasks,
        toasts,
        startTask,
        cancelTask,
        getTask,
        clearTask,
        dismissToast,
        pushToast,
        runningTasks,
        MAX_CONCURRENT,
        onNavigate,
    }

    return (
        <SeoTaskContext.Provider value={value}>
            {children}
        </SeoTaskContext.Provider>
    )
}

export default SeoTaskContext

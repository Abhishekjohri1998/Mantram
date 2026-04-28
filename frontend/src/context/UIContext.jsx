import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import { notificationsAPI } from '../services/api'

const UIContext = createContext()

export const useUI = () => {
  const context = useContext(UIContext)
  if (!context) throw new Error('useUI must be used within a UIProvider')
  return context
}

export const UIProvider = ({ children }) => {
  // ── Fidato / Intel ──────────────────────────────────────────────────────
  const [fidatoOpen, setFidatoOpen]           = useState(false)
  const [intelMissionCount, setIntelMissionCount] = useState(0)

  const toggleFidato = useCallback(() => setFidatoOpen(prev => !prev), [])
  const openFidato   = useCallback(() => setFidatoOpen(true), [])
  const closeFidato  = useCallback(() => setFidatoOpen(false), [])

  const refreshIntelCount = useCallback(async (brandId) => {
    if (!brandId) return
    try {
      const token = localStorage.getItem('mantram_token')
      const API_BASE = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      const resp = await fetch(`${API_BASE}/intel/missions?brandId=${brandId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (resp.ok) {
        const data = await resp.json()
        setIntelMissionCount((data.missions || []).filter(m => m.status === 'active').length)
      }
    } catch { /* silent */ }
  }, [])

  // ── Notifications ────────────────────────────────────────────────────────
  const [notifications, setNotifications]   = useState([])
  const [unreadCount, setUnreadCount]       = useState(0)
  const fetchingRef                         = useRef(false)

  const fetchNotifications = useCallback(async () => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    try {
      const data = await notificationsAPI.list(30)
      if (data?.notifications) {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount ?? data.notifications.filter(n => !n.read).length)
      }
    } catch { /* silent */ }
    finally { fetchingRef.current = false }
  }, [])

  const addNotification = useCallback((n) => {
    setNotifications(prev => [n, ...prev].slice(0, 50))
    setUnreadCount(c => c + 1)
  }, [])

  const markRead = useCallback(async (id) => {
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
    // Skip API call for optimistic notifications (not real DB records)
    if (typeof id === 'string' && id.startsWith('optimistic_')) return
    await notificationsAPI.read(id).catch(() => {})
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
    await notificationsAPI.readAll().catch(() => {})
  }, [])

  const deleteNotification = useCallback(async (id) => {
    setNotifications(prev => {
      const n = prev.find(x => x._id === id)
      if (n && !n.read) setUnreadCount(c => Math.max(0, c - 1))
      return prev.filter(x => x._id !== id)
    })
    // Skip API call for optimistic notifications (not real DB records)
    if (typeof id === 'string' && id.startsWith('optimistic_')) return
    await notificationsAPI.delete(id).catch(() => {})
  }, [])

  // ── Active Background Jobs ────────────────────────────────────────────────
  const [activeJobs, setActiveJobs] = useState([]) // [{ jobId, type, label, page, brandName, startedAt }]

  const addActiveJob = useCallback((job) => {
    setActiveJobs(prev => {
      if (prev.some(j => j.jobId === job.jobId)) return prev
      return [job, ...prev]
    })
  }, [])

  const removeActiveJob = useCallback((jobId) => {
    setActiveJobs(prev => prev.filter(j => j.jobId !== jobId))
  }, [])

  // ── Standard UI Toasts ───────────────────────────────────────────────────
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  return (
    <UIContext.Provider value={{
      // Fidato
      fidatoOpen, toggleFidato, openFidato, closeFidato,
      intelMissionCount, setIntelMissionCount, refreshIntelCount,
      // Notifications
      notifications, unreadCount,
      fetchNotifications, addNotification,
      markRead, markAllRead, deleteNotification,
      // Active Jobs
      activeJobs, addActiveJob, removeActiveJob,
      // Toasts
      addToast,
    }}>
      {children}
      
      {/* Standard UI Toasts */}
      <div className="toast-stack" style={{ bottom: '5rem', zIndex: 10000 }}>
        {toasts.map(t => (
          <div key={t.id} className="toast-item" style={{ 
            borderLeftColor: t.type === 'success' ? '#10b981' : t.type === 'error' ? '#ef4444' : '#3b82f6',
            background: 'var(--sys-surface, #1e293b)'
          }}>
            <div className="toast-icon">
              {t.type === 'success' ? '✅' : t.type === 'error' ? '❌' : 'ℹ️'}
            </div>
            <div className="toast-body">
              <div className="toast-title" style={{ fontSize: '0.85rem' }}>{t.message}</div>
            </div>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
            </button>
          </div>
        ))}
      </div>
    </UIContext.Provider>
  )
}

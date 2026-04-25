/**
 * NotificationToast — Bottom-right job completion toast
 * Shown automatically by useJobPoller when a job completes.
 * Mounted globally in DashboardLayout.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import './NotificationToast.css'

const AUTO_DISMISS_MS = 8000

const TYPE_CONFIG = {
    'monthly-strategy': { icon: '📅', color: '#FF4D00', label: 'Strategy Ready' },
    'research':         { icon: '🔬', color: '#6366f1', label: 'Research Done' },
    'video':            { icon: '🎬', color: '#ec4899', label: 'Video Ready' },
    'creative':         { icon: '🎨', color: '#22c55e', label: 'Creative Ready' },
    'system':           { icon: '🔔', color: '#64748b', label: 'Notification' },
}

function SingleToast({ notif, onDismiss }) {
    const navigate = useNavigate()
    const config   = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system

    useEffect(() => {
        const t = setTimeout(() => onDismiss(notif._id), AUTO_DISMISS_MS)
        return () => clearTimeout(t)
    }, [notif._id])

    return (
        <div className="toast-item" style={{ borderLeftColor: config.color }}>
            <div className="toast-icon">{config.icon}</div>
            <div className="toast-body">
                <div className="toast-title">{notif.title}</div>
                {notif.body && <div className="toast-text">{notif.body}</div>}
                {notif.link && (
                    <button
                        className="toast-cta"
                        style={{ color: config.color }}
                        onClick={() => { navigate(notif.link); onDismiss(notif._id) }}
                    >
                        View Result →
                    </button>
                )}
            </div>
            <button className="toast-close" onClick={() => onDismiss(notif._id)}>
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
            </button>
        </div>
    )
}

export default function NotificationToast() {
    const { notifications } = useUI()
    const [shown, setShown]   = useState([])
    const [seenIds, setSeenIds] = useState(new Set())

    // Watch for new unread notifications and show them as toasts
    useEffect(() => {
        const fresh = notifications.filter(
            n => !n.read && !seenIds.has(n._id) && n._id?.startsWith('optimistic_')
        )
        if (fresh.length === 0) return
        setSeenIds(prev => {
            const next = new Set(prev)
            fresh.forEach(n => next.add(n._id))
            return next
        })
        setShown(prev => [...prev, ...fresh].slice(-4)) // max 4 stacked toasts
    }, [notifications])

    const dismiss = useCallback((id) => {
        setShown(prev => prev.filter(n => n._id !== id))
    }, [])

    if (shown.length === 0) return null

    return (
        <div className="toast-stack">
            {shown.map(n => (
                <SingleToast key={n._id} notif={n} onDismiss={dismiss} />
            ))}
        </div>
    )
}

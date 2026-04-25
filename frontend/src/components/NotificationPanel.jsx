/**
 * NotificationPanel — Bell dropdown panel
 * Shows active background jobs (with Stop button) + past notifications
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../context/UIContext'
import { useJobPoller } from '../hooks/useJobPoller'
import './NotificationPanel.css'

const TYPE_ICON = {
    'monthly-strategy': '📅',
    'research':         '🔬',
    'video':            '🎬',
    'creative':         '🎨',
    'system':           '🔔',
}

function timeAgo(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1)  return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

export default function NotificationPanel({ onClose }) {
    const navigate = useNavigate()
    const { notifications, unreadCount, markRead, markAllRead, deleteNotification, activeJobs, fetchNotifications } = useUI()
    const { cancelJob } = useJobPoller()
    const panelRef = useRef(null)
    const [loadError, setLoadError] = useState(false)

    useEffect(() => {
        try { fetchNotifications() } catch { setLoadError(true) }
    }, [])

    // Close on outside click — uses a small delay to prevent race with the bell button toggle
    useEffect(() => {
        const handler = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                // Check if the click target is the bell button itself — if so, let the toggle handle it
                const bellBtn = e.target.closest('.hdr-action-btn')
                if (bellBtn) return
                onClose()
            }
        }
        // Use setTimeout to register the listener after the current click event finishes
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
    }, [onClose])

    const handleNotifClick = (n) => {
        if (!n.read) markRead(n._id)
        if (n.link) { navigate(n.link); onClose() }
    }

    return (
        <div className="notif-panel" ref={panelRef}>
            {/* Header */}
            <div className="notif-panel-header">
                <span className="notif-panel-title">Notifications</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {unreadCount > 0 && (
                        <button className="notif-mark-all" onClick={markAllRead}>Mark all read</button>
                    )}
                    <button className="notif-close-btn" onClick={onClose}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                    </button>
                </div>
            </div>

            {/* Active Jobs Section */}
            {activeJobs.length > 0 && (
                <div className="notif-section">
                    <div className="notif-section-label">
                        <span className="notif-section-dot notif-dot-active" />
                        Running Now
                    </div>
                    {activeJobs.map(job => (
                        <div key={job.jobId} className="notif-job-item">
                            <div className="notif-job-icon">
                                <span className="material-symbols-outlined notif-spin" style={{ fontSize: 16, color: 'var(--sys-primary,#FF4D00)' }}>
                                    progress_activity
                                </span>
                            </div>
                            <div className="notif-job-body">
                                <div className="notif-job-label">{job.label || job.type}</div>
                                {job.brandName && (
                                    <div className="notif-job-sub">{job.brandName}</div>
                                )}
                            </div>
                            <button
                                className="notif-stop-btn"
                                title="Stop this job"
                                onClick={() => cancelJob(job.jobId)}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>stop_circle</span>
                                Stop
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Past Notifications */}
            <div className="notif-section">
                {activeJobs.length > 0 && notifications.length > 0 && (
                    <div className="notif-section-label">Recent</div>
                )}
                {notifications.length === 0 && activeJobs.length === 0 && (
                    <div className="notif-empty">
                        <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.3 }}>notifications_none</span>
                        <p>No notifications yet</p>
                    </div>
                )}
                {notifications.map(n => (
                    <div
                        key={n._id}
                        className={`notif-item ${!n.read ? 'notif-item-unread' : ''}`}
                        onClick={() => handleNotifClick(n)}
                    >
                        <div className="notif-item-icon">{TYPE_ICON[n.type] || '🔔'}</div>
                        <div className="notif-item-body">
                            <div className="notif-item-title">{n.title}</div>
                            {n.body && <div className="notif-item-body-text">{n.body}</div>}
                            <div className="notif-item-time">{timeAgo(n.createdAt)}</div>
                        </div>
                        <button
                            className="notif-delete-btn"
                            onClick={(e) => { e.stopPropagation(); deleteNotification(n._id) }}
                            title="Dismiss"
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                        </button>
                        {!n.read && <div className="notif-unread-dot" />}
                    </div>
                ))}
            </div>
        </div>
    )
}

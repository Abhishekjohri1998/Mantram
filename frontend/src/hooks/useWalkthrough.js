import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { auth } from '../services/api'

/**
 * useWalkthrough — First-visit detection + walkthrough state management.
 *
 * Checks backend user state + localStorage fallback.
 * On first visit, auto-triggers after a delay so the page has rendered.
 *
 * @param {string} studioId — unique key for the studio (e.g. 'contentStudio')
 * @param {object} opts — options
 * @param {number} opts.delay — ms to wait before auto-showing (default 1500)
 * @param {string} opts.dependsOn — another studioId that must be completed first
 */
export default function useWalkthrough(studioId, opts = {}) {
  const { delay = 1500, dependsOn = null } = typeof opts === 'number' ? { delay: opts } : opts
  const { user } = useAuth()
  const [active, setActive] = useState(false)

  const storageKey = user?._id
    ? `mantram_wt_${studioId}_${user._id}`
    : null

  const parentKey = (dependsOn && user?._id)
    ? `mantram_wt_${dependsOn}_${user._id}`
    : null

  // Auto-trigger on first visit
  useEffect(() => {
    if (!storageKey || !user) return

    // 1. Check Backend Persistence
    const isCompletedInBackend = user.completedWalkthroughs?.includes(studioId);
    if (isCompletedInBackend) return;

    // 2. Check LocalStorage (Fallback/Cache)
    const seen = localStorage.getItem(storageKey)
    if (seen) return 

    // 3. If we depend on a parent walkthrough, check if it's done
    const parentDone = (dependsOn && user.completedWalkthroughs?.includes(dependsOn)) || 
                      (parentKey && localStorage.getItem(parentKey));
    
    if (dependsOn && !parentDone) return

    const timer = setTimeout(() => {
      setActive(true)
    }, delay)

    return () => clearTimeout(timer)
  }, [storageKey, user, dependsOn, parentKey, delay, studioId])

  const complete = useCallback(() => {
    setActive(false)
    // 1. Immediate local feedback
    if (storageKey) localStorage.setItem(storageKey, 'completed')
    
    // 2. Persist to Backend
    if (user) {
      auth.completeWalkthrough(studioId).catch(err => {
        console.warn('⚠️ [useWalkthrough] Persistence failed:', err.message);
      });
    }
  }, [storageKey, user, studioId])

  const start = useCallback(() => {
    setActive(true)
  }, [])

  return { active, start, complete }
}

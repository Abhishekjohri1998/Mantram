import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'

/**
 * useWalkthrough — First-visit detection + walkthrough state management.
 *
 * Checks localStorage for `mantram_wt_{studioId}_{userId}`.
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
    if (!storageKey) return
    const seen = localStorage.getItem(storageKey)
    if (seen) return // already completed

    // If we depend on a parent walkthrough, check if it's done
    if (parentKey && !localStorage.getItem(parentKey)) return

    const timer = setTimeout(() => {
      setActive(true)
    }, delay)

    return () => clearTimeout(timer)
  }, [storageKey, parentKey, delay])

  const complete = useCallback(() => {
    setActive(false)
    if (storageKey) localStorage.setItem(storageKey, 'completed')
  }, [storageKey])

  const start = useCallback(() => {
    setActive(true)
  }, [])

  return { active, start, complete }
}

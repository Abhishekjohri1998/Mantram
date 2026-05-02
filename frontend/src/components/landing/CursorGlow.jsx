import { useEffect, useRef } from 'react'

/**
 * Cursor-following soft glow. 200px radial blur that tracks the cursor at
 * 60fps. Adds subtle "agentic responsiveness" without performance cost on
 * desktop. Auto-disabled on touch and reduced-motion.
 */
export default function CursorGlow() {
    const ref = useRef(null)
    useEffect(() => {
        // Skip on touch and reduced-motion users
        if (typeof window === 'undefined') return
        const isTouch = matchMedia('(hover: none)').matches
        const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
        if (isTouch || reducedMotion) return

        const el = ref.current
        if (!el) return

        let raf = null
        let x = 0, y = 0
        const onMove = (e) => {
            x = e.clientX
            y = e.clientY
            if (raf == null) {
                raf = requestAnimationFrame(() => {
                    el.style.transform = `translate(${x}px, ${y}px)`
                    raf = null
                })
            }
        }
        window.addEventListener('mousemove', onMove, { passive: true })
        return () => {
            window.removeEventListener('mousemove', onMove)
            if (raf) cancelAnimationFrame(raf)
        }
    }, [])

    return <div ref={ref} className="cursor-glow" aria-hidden="true" />
}

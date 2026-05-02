import { useEffect, useRef } from 'react'

/**
 * Reveal-on-scroll hook. Adds `.is-visible` to the ref when it scrolls into
 * view. Pair with the `.reveal` class in index.css for the fade-up animation.
 *
 * Single global IntersectionObserver per page would be more efficient, but
 * the per-element approach keeps the API trivial for section components.
 *
 * @param {object} opts
 * @param {number} opts.threshold  — 0..1 visibility ratio that triggers reveal
 * @param {string} opts.rootMargin — passed to IntersectionObserver
 * @param {boolean} opts.once      — disconnect after first reveal (default true)
 */
export default function useReveal({ threshold = 0.15, rootMargin = '0px 0px -10% 0px', once = true } = {}) {
    const ref = useRef(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const io = new IntersectionObserver((entries) => {
            for (const e of entries) {
                if (e.isIntersecting) {
                    e.target.classList.add('is-visible')
                    if (once) io.unobserve(e.target)
                } else if (!once) {
                    e.target.classList.remove('is-visible')
                }
            }
        }, { threshold, rootMargin })
        io.observe(el)
        return () => io.disconnect()
    }, [threshold, rootMargin, once])
    return ref
}

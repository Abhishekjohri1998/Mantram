import { useRef } from 'react'
import { useScroll, useTransform, useSpring } from 'framer-motion'

/**
 * useScroll3D — Provides scroll-linked 3D motion values for a section.
 *
 * Returns `ref` (attach to the section DOM node) and `style` (spread onto
 * a `motion.div` wrapper) that apply:
 *   • rotateX    — tilts the section backward as it enters, resolving to 0°
 *   • translateZ — pushes the section deeper, resolving to 0
 *   • scale      — slight grow from e.g. 0.92 → 1
 *   • opacity    — fades in from 0 → 1
 *
 * All values are spring-smoothed to avoid jank.
 *
 * @param {object}  opts
 * @param {number}  opts.rotateXIn   — starting rotateX in degrees (default 6)
 * @param {number}  opts.translateZIn — starting translateZ in px  (default -120)
 * @param {number}  opts.scaleIn     — starting scale              (default 0.92)
 * @param {number}  opts.opacityIn   — starting opacity            (default 0)
 * @param {string}  opts.offsetStart — scroll start offset         (default "start end")
 * @param {string}  opts.offsetEnd   — scroll end offset           (default "center center")
 * @param {object}  opts.spring      — spring config               (default { stiffness: 80, damping: 30 })
 */
export default function useScroll3D({
    rotateXIn = 6,
    translateZIn = -120,
    scaleIn = 0.92,
    opacityIn = 0,
    offsetStart = 'start end',
    offsetEnd = 'center center',
    spring = { stiffness: 80, damping: 30, mass: 0.8 },
} = {}) {
    const ref = useRef(null)

    const { scrollYProgress } = useScroll({
        target: ref,
        offset: [offsetStart, offsetEnd],
    })

    // Raw transforms
    const rawRotateX = useTransform(scrollYProgress, [0, 1], [rotateXIn, 0])
    const rawTranslateZ = useTransform(scrollYProgress, [0, 1], [translateZIn, 0])
    const rawScale = useTransform(scrollYProgress, [0, 1], [scaleIn, 1])
    const rawOpacity = useTransform(scrollYProgress, [0, 1], [opacityIn, 1])

    // Spring-smoothed values
    const rotateX = useSpring(rawRotateX, spring)
    const translateZ = useSpring(rawTranslateZ, spring)
    const scale = useSpring(rawScale, spring)
    const opacity = useSpring(rawOpacity, spring)

    return {
        ref,
        style: { rotateX, scale, opacity, z: translateZ },
        // Expose individual values for custom compositions
        values: { rotateX, translateZ, scale, opacity, scrollYProgress },
    }
}

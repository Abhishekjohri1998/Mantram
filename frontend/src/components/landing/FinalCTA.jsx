import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import { BRAND } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * Final CTA — repeats the hero offer with stronger framing, bigger visual
 * weight. Last conversion opportunity before the footer.
 */
export default function FinalCTA() {
    const ref = useReveal()
    const sectionRef = useRef(null)

    // 3D scroll entrance — elements converge from depth
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "center center"]
    })
    const rotateX3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [6, 0]),
        { stiffness: 80, damping: 30 }
    )
    const z3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [-100, 0]),
        { stiffness: 80, damping: 30 }
    )
    const scale3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [0.92, 1]),
        { stiffness: 80, damping: 30 }
    )

    return (
        <motion.section 
            ref={sectionRef} 
            className="reveal py-20 md:py-32 relative overflow-hidden section-3d" 
            aria-labelledby="final-cta-title"
            style={{ rotateX: rotateX3D, z: z3D, scale: scale3D }}
        >
            <div ref={ref}>
                <div className="absolute inset-0 -z-10">
                    <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at center, ${BRAND.primary}15 0%, transparent 70%)` }} />
                </div>

                <div className="max-w-4xl mx-auto px-4 md:px-6 text-center" style={{ transformStyle: 'preserve-3d' }}>
                    <div className="relative size-20 mx-auto mb-8 brand-pulse rounded-2xl" style={{ transform: 'translateZ(60px)' }}>
                        <div
                            className="absolute inset-0 rounded-2xl blur-xl"
                            style={{ background: `radial-gradient(circle, ${BRAND.primary}80 0%, ${BRAND.secondary}30 60%, transparent 80%)` }}
                            aria-hidden="true"
                        />
                        <img
                            src="/mantram-logo.png"
                            alt=""
                            className="relative size-20 rounded-2xl"
                        />
                    </div>

                    <h2 id="final-cta-title" className="text-4xl md:text-6xl font-black mb-5 leading-[1.05] text-[var(--sys-text)]" style={{ transform: 'translateZ(30px)' }}>
                        Stop renting other people's AI.
                        <br />
                        <span style={{ background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                            Build your brain.
                        </span>
                    </h2>

                    <p className="text-base md:text-lg max-w-xl mx-auto mb-10" style={{ color: BRAND.textMuted, transform: 'translateZ(15px)' }}>
                        Mantram is in private early access. Limited spots. No free tier — just the real product, built for brands that take craft seriously.
                    </p>

                    <div className="flex flex-col sm:flex-row justify-center gap-3" style={{ transform: 'translateZ(40px)' }}>
                        <Link
                            to="/auth?mode=signup"
                            className="px-8 py-4 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer brand-pulse"
                            style={{ background: BRAND.primary, color: 'white' }}
                        >
                            Request Access →
                        </Link>
                        <Link
                            to="/auth?mode=signup"
                            className="px-8 py-4 rounded-full font-bold text-sm transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center"
                            style={{
                                background: 'transparent',
                                color: BRAND.secondary,
                                border: `1px solid ${BRAND.secondary}60`,
                            }}
                        >
                            Book Agency Demo
                        </Link>
                    </div>
                </div>
            </div>
        </motion.section>
    )
}

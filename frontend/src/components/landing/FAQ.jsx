import { useState, useRef } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'
import { BRAND, LANDING_FAQS } from '../../data/studios'
import useReveal from '../../hooks/useReveal'

/**
 * Landing FAQ — sources the same questions used in the page-level FAQPage
 * JSON-LD in index.html, so the schema and the visible content stay in sync.
 * Single-open accordion keeps the section visually tight.
 */
export default function FAQ() {
    const [open, setOpen] = useState(0)
    const ref = useReveal()
    const sectionRef = useRef(null)

    // 3D scroll entrance
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "center center"]
    })
    const rotateX3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [4, 0]),
        { stiffness: 80, damping: 30 }
    )
    const z3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [-60, 0]),
        { stiffness: 80, damping: 30 }
    )

    return (
        <motion.section 
            ref={sectionRef} 
            className="reveal py-20 md:py-28 section-3d" 
            aria-labelledby="faq-title"
            style={{ rotateX: rotateX3D, z: z3D }}
        >
            <div ref={ref} className="max-w-3xl mx-auto px-4 md:px-6">
                <div className="text-center mb-12">
                    <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.primary }}>
                        FAQ
                    </span>
                    <h2 id="faq-title" className="text-3xl md:text-5xl font-black mt-4 leading-tight text-[var(--sys-text)]">
                        Questions, answered.
                    </h2>
                </div>

                <div className="space-y-2.5" style={{ transformStyle: 'preserve-3d' }}>
                    {LANDING_FAQS.map((f, i) => {
                        const isOpen = open === i
                        return (
                            <div
                                key={i}
                                className="rounded-xl overflow-hidden transition-all"
                                style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${isOpen ? BRAND.primary + '40' : 'rgba(255,255,255,0.06)'}`,
                                    transform: isOpen ? 'translateZ(20px) scale(1.01)' : 'translateZ(0px)',
                                    transition: 'transform 0.4s ease, border-color 0.3s ease, box-shadow 0.4s ease',
                                    boxShadow: isOpen ? '0 10px 30px rgba(255, 77, 0, 0.06)' : 'none',
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setOpen(isOpen ? -1 : i)}
                                    aria-expanded={isOpen}
                                    aria-controls={`landing-faq-${i}`}
                                    className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                                >
                                    <span className="text-sm md:text-base font-semibold text-[var(--sys-text)]">{f.question}</span>
                                    <span
                                        className="material-symbols-outlined transition-transform duration-300 shrink-0"
                                        style={{
                                            color: isOpen ? BRAND.primary : BRAND.textMuted,
                                            transform: isOpen ? 'rotate(45deg)' : 'none',
                                        }}
                                        aria-hidden="true"
                                    >
                                        add
                                    </span>
                                </button>
                                <div
                                    id={`landing-faq-${i}`}
                                    className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                                >
                                    <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: BRAND.textMuted }}>
                                        {f.answer}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </motion.section>
    )
}

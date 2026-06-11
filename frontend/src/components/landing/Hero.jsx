import React, { useRef } from 'react';
import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BRAND } from '../../data/studios';

export default function Hero({ onAgencyDemo }) {
    const containerRef = useRef(null);
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end start"]
    });

    const yText = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);
    const opacityText = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

    // Initial stagger animation
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.15, delayChildren: 0.1 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] } }
    };

    return (
        <section ref={containerRef} className="relative pt-24 md:pt-32 pb-16 md:pb-24 overflow-hidden flex flex-col items-center text-center min-h-[85vh] justify-center">
            {/* Ambient background glow */}
            <motion.div
                style={{ y: useTransform(scrollYProgress, [0, 1], ["0%", "100%"]), opacity: opacityText }}
                className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center"
            >
                <div
                    className="w-[800px] h-[600px] rounded-full blur-[150px] opacity-20 mix-blend-screen"
                    style={{ background: 'radial-gradient(circle, #FF5A1F 0%, rgba(255,90,31,0) 70%)' }}
                />
            </motion.div>

            <motion.div
                className="max-w-4xl mx-auto px-4 md:px-6 flex flex-col items-center"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                style={{ y: yText, opacity: opacityText }}
            >
                {/* Top Pill */}
                <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 border border-[#FF5A1F]/30 bg-[#FF5A1F]/5">
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F]">
                        ★ NO SUBSCRIPTION • CREDIT PACKS FROM ₹149 • 14 SPECIALISED STUDIOS
                    </span>
                </motion.div>

                {/* H1 */}
                <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl lg:text-[84px] tracking-tight leading-[1.05] mb-8 text-white font-serif font-normal">
                    Marketing that knows your brand.<br />
                    <span className="italic text-[#FF5A1F]">Agents that do the work.</span>
                </motion.h1>

                {/* Subheadline */}
                <motion.p variants={itemVariants} className="text-lg md:text-xl text-[#a1a1aa] max-w-2xl mx-auto leading-relaxed mb-10">
                    Mantram AI is an agentic AI marketing OS. It scans your brand once — website, socials, competitors, reviews — and builds a Brand DNA that 14 AI studios read from. Then the agents plan, create, publish and optimise. In your voice. In your colours. In your language — English, Hindi, Tamil, Arabic, Bahasa, Vietnamese, or the code-switched blend your customers actually speak.
                </motion.p>

                {/* CTAs */}
                <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
                    <Link
                        to="/auth?mode=signup"
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-white transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                        style={{ background: BRAND.primary }}
                    >
                        Start with your website URL <span aria-hidden="true">→</span>
                    </Link>

                    <button
                        onClick={onAgencyDemo}
                        className="w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-[#a1a1aa] hover:text-white transition-all hover:bg-white/5 flex items-center justify-center gap-2 border border-white/10 group"
                    >
                        <Play className="w-4 h-4 text-[#a1a1aa] group-hover:text-white transition-colors" fill="currentColor" />
                        Watch the 2-minute walkthrough
                    </button>
                </motion.div>

                {/* Trust strip */}
                <motion.div variants={itemVariants} className="mt-12 text-xs md:text-sm text-[#71717a] max-w-2xl mx-auto leading-relaxed border-t border-white/5 pt-6 w-full flex flex-wrap justify-center gap-x-6 gap-y-2">
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] animate-pulse" /> No subscription</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] animate-pulse" /> Credit packs from ₹149</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] animate-pulse" /> Built in India for South Asia, SEA & Middle East</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5A1F] animate-pulse" /> DPDP & GDPR-aware</span>
                </motion.div>

            </motion.div>
        </section>
    );
}

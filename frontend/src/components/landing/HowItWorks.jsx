import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import useReveal from '../../hooks/useReveal';
import { BRAND } from '../../data/studios';

const STEPS = [
    {
        num: '01',
        title: 'Drop your brand',
        desc: 'Logo + 1 link. We parse colors, fonts and tone in 60 seconds.'
    },
    {
        num: '02',
        title: 'Pick a studio',
        desc: 'Creative, Video, Social — open any of the 16. No setup.'
    },
    {
        num: '03',
        title: 'Type the prompt',
        desc: 'Or pick a brand-locked template. First output in 30 seconds.'
    },
    {
        num: '04',
        title: 'Refine in-canvas',
        desc: 'Approve, regenerate, version. Stay in the creative seat.'
    },
    {
        num: '05',
        title: 'Publish or hand-off',
        desc: 'Export, send to ad manager, push to social. Done.'
    }
];

export default function HowItWorks() {
    const revealRef = useReveal();
    const sectionRef = useRef(null);

    // 3D scroll-linked entrance
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "center center"]
    });
    const rotateX3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [5, 0]),
        { stiffness: 80, damping: 30 }
    );
    const z3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [-80, 0]),
        { stiffness: 80, damping: 30 }
    );

    return (
        <motion.section 
            ref={sectionRef}
            className="py-24 md:py-32 bg-[#0b0b0c] relative border-b border-white/5 section-3d" 
            style={{ rotateX: rotateX3D, z: z3D }}
        >
            <div ref={revealRef} className="max-w-[1400px] mx-auto px-4 md:px-6">
                
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-16">
                    <span className="text-[11px] font-bold tracking-widest text-[#FF5A1F] uppercase mb-4 block">
                        How it works
                    </span>
                    <h2 className="text-4xl md:text-5xl tracking-tight text-white font-serif max-w-3xl leading-[1.1]">
                        From <span className="italic" style={{ color: BRAND.primary }}>kickoff</span> to first campaign in 5 minutes.
                    </h2>
                </div>

                {/* Steps Row — Z-stacking forward */}
                <div className="flex flex-wrap lg:flex-nowrap justify-center gap-4 z-step-stack" style={{ transformStyle: 'preserve-3d' }}>
                    {STEPS.map((step, i) => (
                        <motion.div 
                            key={i} 
                            className="bg-[#121214] border border-white/5 rounded-2xl p-6 md:p-8 flex-1 min-w-[240px] hover:border-white/10 transition-colors group cursor-default hover-3d-lift"
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-50px" }}
                            transition={{ duration: 0.5, delay: i * 0.08 }}
                        >
                            <span className="text-[10px] font-bold tracking-wider text-[#FF5A1F] uppercase mb-4 block">
                                Step {step.num}
                            </span>
                            <h3 className="text-white font-bold text-lg mb-2 group-hover:text-white/90 transition-colors">
                                {step.title}
                            </h3>
                            <p className="text-[#a1a1aa] text-[13px] leading-relaxed">
                                {step.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>

            </div>
        </motion.section>
    );
}

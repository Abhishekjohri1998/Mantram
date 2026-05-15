import React, { useEffect, useState, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { BRAND } from '../../data/studios';

const METRICS = [
    { value: '8.4×', label: 'Faster campaign turn-around', sub: 'VS TRADITIONAL CREATIVE CYCLE' },
    { value: '62%', label: 'Reduction in agency spend', sub: 'FIRST-QUARTER AVERAGE' },
    { value: '240+', label: 'Brand-locked templates', sub: 'CURATED AND UPDATABLE' },
    { value: '16', label: 'Studios in one OS', sub: 'FROM BRAINSTORM TO PERFORMANCE' },
];

function AnimatedNumber({ textValue }) {
    const isNumberWithSuffix = textValue.match(/^([\d.]+)(.*)$/);
    if (!isNumberWithSuffix) return <span>{textValue}</span>;

    const targetNum = parseFloat(isNumberWithSuffix[1]);
    const suffix = isNumberWithSuffix[2];
    const [display, setDisplay] = useState(0);
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    useEffect(() => {
        if (isInView) {
            let startTimestamp = null;
            const duration = 2000;
            const step = (timestamp) => {
                if (!startTimestamp) startTimestamp = timestamp;
                const progress = Math.min((timestamp - startTimestamp) / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 4);

                const currentVal = targetNum * easeProgress;
                setDisplay(Number.isInteger(targetNum) ? Math.round(currentVal) : currentVal.toFixed(1));

                if (progress < 1) {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        }
    }, [isInView, targetNum]);

    return <span ref={ref}>{display}{suffix}</span>;
}

export default function Metrics() {
    return (
        <section className="py-24 md:py-32 relative bg-[#0b0b0c]">
            <div className="max-w-7xl mx-auto px-4 md:px-6">

                {/* Section Header */}
                <div className="flex flex-col items-center text-center mb-20">
                    <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif max-w-2xl">
                        Not vanity metrics. <span className="italic" style={{ color: BRAND.primary }}>Real outcomes.</span>
                    </h2>
                    <p className="text-[#a1a1aa] mt-6 text-sm max-w-xl font-medium">
                        Numbers from brand teams running production campaigns on Mantram, last 90 days.
                    </p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-12 md:gap-8 relative">
                    {/* Divider Lines (Desktop) */}
                    <div className="hidden md:block absolute top-0 bottom-0 left-[25%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    <div className="hidden md:block absolute top-0 bottom-0 left-[50%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
                    <div className="hidden md:block absolute top-0 bottom-0 left-[75%] w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                    {METRICS.map((metric, i) => (
                        <motion.div
                            key={i}
                            className="flex flex-col items-start px-4"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-100px" }}
                            transition={{ duration: 0.6, delay: i * 0.1 }}
                        >
                            <span className="text-5xl md:text-6xl font-serif mb-4" style={{ color: BRAND.primary }}>
                                <AnimatedNumber textValue={metric.value} />
                            </span>
                            <span className="text-white font-bold text-lg mb-2 leading-tight">{metric.label}</span>
                            <span className="text-[10px] font-bold text-[#a1a1aa] uppercase tracking-wider">{metric.sub}</span>
                        </motion.div>
                    ))}
                </div>

            </div>
        </section>
    );
}

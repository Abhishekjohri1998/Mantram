import React, { useState, useRef } from 'react';
import { Play } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BRAND } from '../../data/studios';

const FILTERS = ['Full demo', 'Creative Studio', 'Video Studio', 'Pulse'];

const TIMELINE = [
    { time: '00:00', label: 'The brief' },
    { time: '00:18', label: 'Brand parse' },
    { time: '00:32', label: 'Asset generation' },
    { time: '00:54', label: 'Review & edit' },
    { time: '01:15', label: 'Export & publish' }
];

export default function ActionDemo() {
    const revealRef = useReveal();
    const [activeFilter, setActiveFilter] = useState('Full demo');
    const containerRef = useRef(null);
    
    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start end", "center center"]
    });
    
    // Scale from 0.9 to 1 as it scrolls into the center
    const scaleVideo = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
    const opacityVideo = useTransform(scrollYProgress, [0, 0.5], [0.5, 1]);

    return (
        <section className="py-24 md:py-32 relative" ref={containerRef}>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                
                {/* Header & Filters Row */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12">
                    {/* Section Header */}
                    <div>
                        <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif max-w-2xl leading-[1.1]">
                            90 seconds. <span className="italic" style={{ color: BRAND.primary }}>One campaign.</span> <br />
                            From prompt to publish.
                        </h2>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap gap-3">
                        {FILTERS.map(filter => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all border ${
                                    activeFilter === filter 
                                        ? 'bg-white text-black border-white' 
                                        : 'bg-transparent text-[#a1a1aa] border-white/10 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Full-width Video Player Section */}
            <div className="w-full px-4 md:px-8 mb-6">
                <motion.div 
                    style={{ scale: scaleVideo, opacity: opacityVideo }}
                    className="relative w-full aspect-[21/9] md:aspect-video rounded-[32px] overflow-hidden group cursor-pointer border border-white/10 bg-[#121214] shadow-2xl"
                >
                    {/* Ambient Glow */}
                    <div className="absolute inset-0 z-0">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] rounded-full blur-[100px] opacity-20 mix-blend-screen" style={{ background: BRAND.primary }} />
                    </div>

                    {/* Placeholder Video Content */}
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors duration-500">
                        {/* Play Button */}
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: BRAND.primary }} />
                            <div className="w-20 h-20 rounded-full backdrop-blur-md bg-white/10 border border-white/20 flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                                <Play className="w-8 h-8 text-white ml-1" fill="currentColor" />
                            </div>
                        </div>
                    </div>

                    {/* Top Left Badge */}
                    <div className="absolute top-6 left-6 z-20">
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-xs font-bold tracking-wider text-white">LIVE PREVIEW</span>
                        </div>
                    </div>

                    {/* Bottom Metadata */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 z-20 bg-gradient-to-t from-black/80 to-transparent">
                        <div className="flex justify-between items-end">
                            <div>
                                <h3 className="text-white text-xl font-bold mb-1">End-to-end Campaign Generation</h3>
                                <p className="text-[#a1a1aa] text-sm">Featuring: Creative Studio, Video Studio, Pulse</p>
                            </div>
                            <span className="text-white font-medium bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                                01:30
                            </span>
                        </div>
                    </div>
                </motion.div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-6">
                {/* Timeline Strip */}
                <div className="w-full grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                    {TIMELINE.map((item, idx) => (
                        <div key={idx} className="bg-[#121214] rounded-2xl p-4 border border-white/5 hover:border-white/20 transition-colors">
                            <div className="text-[11px] font-bold text-[#a1a1aa] mb-2">{item.time}</div>
                            <div className="text-sm font-bold text-white">{item.label}</div>
                        </div>
                    ))}
                </div>

            </div>
        </section>
    );
}

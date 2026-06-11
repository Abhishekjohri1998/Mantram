import React from 'react';
import { motion } from 'framer-motion';
import { BRAND } from '../../data/studios';

export default function Comparison() {
    return (
        <section className="py-24 md:py-32 relative bg-[#0b0b0c] border-b border-white/5 overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 md:px-6">

                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    className="flex flex-col items-center text-center mb-16"
                >
                    <span className="text-[11px] font-bold tracking-widest uppercase mb-4" style={{ color: BRAND.primary }}>
                        The Shift
                    </span>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl tracking-tight text-white font-serif">
                        The old way <span className="italic" style={{ color: BRAND.primary }}>vs Mantram.</span>
                    </h2>
                </motion.div>

                {/* Comparison Grid */}
                <div className="grid md:grid-cols-2 gap-6 lg:gap-8 max-w-5xl mx-auto relative">

                    {/* Left Card: The Old Way */}
                    <motion.div
                        initial={{ opacity: 0, x: -40 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ type: 'spring', stiffness: 60, delay: 0.1 }}
                        className="bg-[#121214] border border-white/5 rounded-3xl p-8 lg:p-10 flex flex-col justify-between"
                    >
                        <div>
                            <div className="flex justify-between items-center mb-10 text-[11px] font-bold text-[#a1a1aa] uppercase tracking-widest">
                                <span>The Old Way</span>
                                <span>~21 days</span>
                            </div>

                            <ul className="space-y-6 text-sm mb-16">
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 1</span>
                                    <span className="text-[#d4d4d8] font-medium">Brief the agency</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 3-5</span>
                                    <span className="text-[#d4d4d8] font-medium">Concept rounds</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 6-12</span>
                                    <span className="text-[#d4d4d8] font-medium">Production + shoot</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 13-17</span>
                                    <span className="text-[#d4d4d8] font-medium">Reviews + revisions</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 18-20</span>
                                    <span className="text-[#d4d4d8] font-medium">Localization & cuts</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span className="text-[#a1a1aa]">Day 21</span>
                                    <span className="text-[#d4d4d8] font-medium">One campaign live</span>
                                </li>
                            </ul>
                        </div>

                        <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-8">
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Cost</span>
                                <span className="text-xl md:text-2xl text-white font-serif tracking-tight">₹18-25L</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Output</span>
                                <span className="text-xl md:text-2xl text-white font-serif tracking-tight">4-6 assets</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Languages</span>
                                <span className="text-xl md:text-2xl text-white font-serif tracking-tight">1-2</span>
                            </div>
                        </div>
                    </motion.div>

                    {/* Right Card: The New Way */}
                    <motion.div
                        initial={{ opacity: 0, x: 40 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ type: 'spring', stiffness: 60, delay: 0.2 }}
                        className="bg-[#121214] border rounded-3xl p-8 lg:p-10 flex flex-col justify-between relative shadow-[0_0_40px_rgba(255,77,0,0.1)]" style={{ borderColor: `${BRAND.primary}40` }}
                    >

                        {/* With Mantram Badge */}
                        <div className="absolute -top-3.5 right-10">
                            <span className="bg-[#FF4D00] text-white text-[10px] font-bold tracking-widest uppercase px-3 py-1.5 rounded-full">
                                With Mantram
                            </span>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-10 text-[11px] font-bold uppercase tracking-widest" style={{ color: BRAND.primary }}>
                                <span>The New Way</span>
                                <span>~5 minutes</span>
                            </div>

                            <ul className="space-y-6 text-sm mb-16">
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">00:30</span>
                                    <span className="text-white font-medium">Drop logo + brief</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">01:00</span>
                                    <span className="text-white font-medium">Brand parsed automatically</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">02:30</span>
                                    <span className="text-white font-medium">First 6 assets generated</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">03:30</span>
                                    <span className="text-white font-medium">In-canvas refine + approve</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">04:30</span>
                                    <span className="text-white font-medium">Localized to 6 languages</span>
                                </li>
                                <li className="grid grid-cols-[80px_1fr] gap-4">
                                    <span style={{ color: BRAND.primary }} className="font-medium">05:00</span>
                                    <span className="text-white font-medium">Published to every channel</span>
                                </li>
                            </ul>
                        </div>

                        <div className="grid grid-cols-3 gap-4 border-t pt-8" style={{ borderColor: `${BRAND.primary}20` }}>
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Cost</span>
                                <span className="text-xl md:text-2xl font-serif tracking-tight" style={{ color: BRAND.primary }}>₹149+</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Output</span>
                                <span className="text-xl md:text-2xl font-serif tracking-tight" style={{ color: BRAND.primary }}>200+ assets</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-[#a1a1aa] mb-1">Languages</span>
                                <span className="text-xl md:text-2xl font-serif tracking-tight" style={{ color: BRAND.primary }}>22</span>
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}

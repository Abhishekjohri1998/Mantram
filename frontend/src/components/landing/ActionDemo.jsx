import React, { useState, useRef } from 'react';
import { Play } from 'lucide-react';
import useReveal from '../../hooks/useReveal';
import { motion, useScroll, useTransform } from 'framer-motion';
import { BRAND } from '../../data/studios';

export default function ActionDemo() {
    const revealRef = useReveal();
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

                    {/* Autoplaying Video */}
                    <video 
                        src="https://mantram-assets.s3.ap-south-1.amazonaws.com/videos/Homescreen+Video.mp4"
                        autoPlay 
                        loop 
                        muted 
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover z-10"
                    />


                </motion.div>
            </div>


        </section>
    );
}

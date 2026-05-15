import React, { useRef, useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import useReveal from '../../hooks/useReveal';
import api from '../../utils/api';

const VIDEOS = [
    {
        id: '1',
        campaign: 'Diwali Festive Campaign',
        duration: '0:15',
        color: '#FF5A1F', // Orange
    },
    {
        id: '2',
        campaign: 'Summer Collection Launch',
        duration: '0:30',
        color: '#3B82F6', // Blue
    },
    {
        id: '3',
        campaign: 'End of Reason Sale',
        duration: '0:10',
        color: '#10B981', // Green
    },
    {
        id: '4',
        campaign: 'New App Onboarding',
        duration: '0:45',
        color: '#EC4899', // Pink
    },
    {
        id: '5',
        campaign: 'Product Demo Series',
        duration: '1:00',
        color: '#EAB308', // Yellow
    }
];

export default function FeaturedVideos() {
    const revealRef = useReveal();
    const scrollRef = useRef(null);
    const sectionRef = useRef(null);
    const [featuredItems, setFeaturedItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // 3D scroll effect — section tilts as it enters
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ["start end", "center center"]
    });
    const rotateX3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [4, 0]),
        { stiffness: 80, damping: 30 }
    );
    const z3D = useSpring(
        useTransform(scrollYProgress, [0, 1], [-80, 0]),
        { stiffness: 80, damping: 30 }
    );

    useEffect(() => {
        const fetchHomepageTemplates = async () => {
            try {
                const res = await api('/templates/public/homepage');
                if (res.templates && res.templates.length > 0) {
                    setFeaturedItems(res.templates.map(t => ({
                        id: t._id,
                        campaign: t.name,
                        categoryName: t.categoryId?.name || t.studioOrigin || 'Creative',
                        previewUrl: t.previewType === 'video' ? (t.previewVideoUrl || t.previewUrl) : (t.previewImageUrl || t.previewUrl),
                        isVideo: t.previewType === 'video',
                        color: t.categoryId?.color || '#FF5A1F'
                    })));
                } else {
                    // Fallback to static if none published to homepage
                    setFeaturedItems(VIDEOS);
                }
            } catch (err) {
                console.error("Failed to fetch featured homepage templates:", err);
                setFeaturedItems(VIDEOS);
            } finally {
                setIsLoading(false);
            }
        };
        fetchHomepageTemplates();
    }, []);

    if (isLoading) {
        return (
            <section className="relative w-full overflow-hidden pb-20 pt-4 z-10" ref={revealRef}>
                <div className="flex gap-4 md:gap-6 px-8 md:px-24 py-4">
                    {[1,2,3].map(i => (
                        <div key={i} className="shrink-0 w-[280px] md:w-[340px] aspect-[4/5] rounded-[24px] bg-white/5 animate-pulse" />
                    ))}
                </div>
            </section>
        );
    }

    return (
        <motion.section 
            ref={sectionRef}
            className="relative w-full overflow-hidden pb-20 pt-4 z-10 section-3d" 
            style={{ rotateX: rotateX3D, z: z3D, transformOrigin: '50% 100%' }}
        >
            <div ref={revealRef}>
                {/* Gradient mask for smooth edge fading */}
                <div className="absolute inset-y-0 left-0 w-8 md:w-24 bg-gradient-to-r from-[#0b0b0c] to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-8 md:w-24 bg-gradient-to-l from-[#0b0b0c] to-transparent z-10 pointer-events-none" />

                {/* Scroll container */}
                <div 
                    ref={scrollRef}
                    className="flex gap-4 md:gap-6 px-8 md:px-24 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-4 scroll-smooth"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', transformStyle: 'preserve-3d' }}
                >
                    {featuredItems.map((item, idx) => (
                        <div 
                            key={item.id}
                            className="snap-center shrink-0 w-[280px] md:w-[340px] aspect-[4/5] rounded-[24px] relative group cursor-pointer transition-all duration-500 hover:-translate-y-4 shadow-2xl overflow-hidden card-3d-tilt"
                            style={{ 
                                backgroundColor: item.color,
                                transform: `translateZ(${idx % 2 === 0 ? 20 : 0}px)`,
                            }}
                            onMouseMove={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const x = (e.clientX - rect.left) / rect.width - 0.5;
                                const y = (e.clientY - rect.top) / rect.height - 0.5;
                                e.currentTarget.style.transform = `translateZ(${idx % 2 === 0 ? 20 : 0}px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-8px)`;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.transform = `translateZ(${idx % 2 === 0 ? 20 : 0}px)`;
                            }}
                        >
                            {/* Dynamic background if available */}
                            {item.previewUrl && (
                                <div className="absolute inset-0 z-0">
                                    {item.isVideo ? (
                                        <video src={item.previewUrl} autoPlay loop muted playsInline className="w-full h-full object-cover" />
                                    ) : (
                                        <img src={item.previewUrl} alt={item.campaign} className="w-full h-full object-cover" />
                                    )}
                                    <div className="absolute inset-0 bg-black/20" />
                                </div>
                            )}

                            {/* Top info */}
                            <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                                <span className="bg-black/20 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                    Featured
                                </span>
                                {(item.duration || item.categoryName) && (
                                    <span className="bg-black/20 backdrop-blur-md text-white text-[12px] font-medium px-2.5 py-1 rounded-full">
                                        {item.duration || item.categoryName}
                                    </span>
                                )}
                            </div>

                            {/* Always visible duration/category on resting state */}
                            <div className="absolute top-4 right-4 group-hover:hidden z-10">
                                {(item.duration || item.categoryName) && (
                                    <span className="bg-black/40 backdrop-blur-sm text-white text-[12px] font-medium px-2.5 py-1 rounded-full">
                                        {item.duration || item.categoryName}
                                    </span>
                                )}
                            </div>

                            {/* Play button (only if video or static item is intended to look like video) */}
                            {(item.isVideo || !item.previewUrl) && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all group-hover:scale-110">
                                        <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                                    </div>
                                </div>
                            )}

                            {/* Bottom Info */}
                            <div className="absolute bottom-6 left-6 right-6 z-10">
                                <h3 className="text-white font-bold text-lg leading-tight line-clamp-2 drop-shadow-md">
                                    {item.campaign}
                                </h3>
                            </div>
                            
                            {/* Hover Gradient Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[24px] pointer-events-none z-0" />
                            {/* Always-on bottom gradient for readability */}
                            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent pointer-events-none z-0" />
                        </div>
                    ))}
                </div>
            </div>
        </motion.section>
    );
}

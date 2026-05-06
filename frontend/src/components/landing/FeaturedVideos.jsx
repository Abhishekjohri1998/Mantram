import React, { useRef } from 'react';
import { Play } from 'lucide-react';
import useReveal from '../../hooks/useReveal';

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

    return (
        <section className="relative w-full overflow-hidden pb-20 pt-4 -mt-10 z-10" ref={revealRef}>
            {/* Gradient mask for smooth edge fading */}
            <div className="absolute inset-y-0 left-0 w-8 md:w-24 bg-gradient-to-r from-[#0b0b0c] to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-8 md:w-24 bg-gradient-to-l from-[#0b0b0c] to-transparent z-10 pointer-events-none" />

            {/* Scroll container */}
            <div 
                ref={scrollRef}
                className="flex gap-4 md:gap-6 px-8 md:px-24 overflow-x-auto snap-x snap-mandatory scrollbar-hide py-4"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {VIDEOS.map((video) => (
                    <div 
                        key={video.id}
                        className="snap-center shrink-0 w-[280px] md:w-[340px] aspect-[4/5] rounded-[24px] relative group cursor-pointer transition-transform duration-500 hover:-translate-y-4 shadow-2xl"
                        style={{ backgroundColor: video.color }}
                    >
                        {/* Top info */}
                        <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <span className="bg-black/20 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                                Featured
                            </span>
                            <span className="bg-black/20 backdrop-blur-md text-white text-[12px] font-medium px-2.5 py-1 rounded-full">
                                {video.duration}
                            </span>
                        </div>

                        {/* Always visible duration on resting state (if desired, or just show on hover. Let's make duration always visible) */}
                        <div className="absolute top-4 right-4 group-hover:hidden">
                            <span className="bg-black/10 text-white text-[12px] font-medium px-2.5 py-1 rounded-full">
                                {video.duration}
                            </span>
                        </div>

                        {/* Play button */}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all group-hover:scale-110">
                                <Play className="w-6 h-6 text-white ml-1" fill="currentColor" />
                            </div>
                        </div>

                        {/* Bottom Info */}
                        <div className="absolute bottom-6 left-6 right-6">
                            <h3 className="text-white font-bold text-lg leading-tight line-clamp-2">
                                {video.campaign}
                            </h3>
                        </div>
                        
                        {/* Hover Gradient Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-[24px] pointer-events-none" />
                    </div>
                ))}
            </div>
        </section>
    );
}

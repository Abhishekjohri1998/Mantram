import React from 'react';
import SEOHead from '../components/SEOHead';

const UnderConstruction = () => {
    return (
        <>
            <SEOHead title="Under Construction — Mantram AI" noIndex={true} />
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
                {/* Background Effects */}
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none" />

                <div className="z-10 flex flex-col items-center text-center max-w-3xl px-6">

                    {/* Logo Area */}
                    <div className="mb-8 p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md inline-block">
                        <svg className="w-16 h-16 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>

                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-gradient-to-r from-white via-blue-100 to-gray-400 bg-clip-text text-transparent">
                        Mantram AI is Evolving
                    </h1>

                    <p className="text-xl md:text-2xl text-gray-400 mb-10 font-light leading-relaxed">
                        We are currently upgrading our infrastructure to bring you our next-generation AI marketing suite. We will be back online shortly.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                        <div className="px-8 py-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm flex items-center justify-center gap-3">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                            <span className="text-gray-300 font-medium tracking-wide">Systems Upgrading</span>
                        </div>
                    </div>

                    <div className="mt-16 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-6 text-sm text-gray-500">
                            <a href="/privacy-policy" className="hover:text-blue-400 transition-colors">Privacy Policy</a>
                            <a href="/terms" className="hover:text-blue-400 transition-colors">Terms of Service</a>
                        </div>
                        <div className="text-sm text-gray-600">
                            &copy; {new Date().getFullYear()} Mantram AI. All rights reserved.
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default UnderConstruction;

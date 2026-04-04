import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import SEOHead from '../components/SEOHead'

export default function Landing() {
    const navigate = useNavigate()
    const { isAuthenticated } = useAuth()
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 30)
        window.addEventListener('scroll', onScroll)
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <div className="min-h-screen bg-[#08080c] font-['Inter'] selection:bg-[#ff4d00]/30 selection:text-white overflow-hidden relative">
            <SEOHead
                title="Mantram.AI | The Agentic Brand Operating System"
                description="The autonomous AI command center for brand building, content generation, and performance marketing."
            />
            
            {/* Global Ambient Glow */}
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(255,77,0,0.05)_0%,transparent_50%)]"></div>
            <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_bottom_left,rgba(143,245,255,0.03)_0%,transparent_50%)]"></div>
            
            {/* ── TOP NAV ── */}
            <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#08080c]/80 backdrop-blur-xl border-b border-[#48474c]/20' : 'bg-transparent'}`}>
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="relative group cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>
                            <div className="absolute inset-0 bg-[#ff4d00]/20 blur-xl rounded-full group-hover:bg-[#ff4d00]/40 transition-colors duration-500"></div>
                            <img src="/global-logo.png" alt="Mantram AI" className="h-8 w-auto relative z-10 brightness-150 drop-shadow-[0_0_15px_rgba(255,77,0,0.5)]" />
                        </div>
                        <span className="text-[#f3eff6] font-['Space_Grotesk'] font-bold text-xl tracking-wide ml-2 cursor-pointer" onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})}>Mantram.AI</span>
                    </div>

                    <div className="hidden md:flex items-center gap-8 pl-8 text-sm font-bold uppercase tracking-widest text-[#acaab0]">
                        <button onClick={() => document.getElementById('platform-specs').scrollIntoView({ behavior: 'smooth' })} className="hover:text-[#f3eff6] transition-colors relative group cursor-pointer">
                            Studios
                            <span className="absolute -bottom-1 inset-x-0 h-[2px] bg-[#ff4d00] scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                        </button>
                        <button onClick={() => document.getElementById('engine').scrollIntoView({ behavior: 'smooth' })} className="hover:text-[#f3eff6] transition-colors relative group cursor-pointer">
                            Brainstorm Engine
                            <span className="absolute -bottom-1 inset-x-0 h-[2px] bg-[#8ff5ff] scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                        </button>
                        <Link to="/about" className="hover:text-[#f3eff6] transition-colors">About OS</Link>
                    </div>

                    <div className="flex items-center gap-4">
                        {isAuthenticated ? (
                            <Link to="/dashboard" className="px-6 py-2.5 rounded-lg border border-[#48474c]/30 hover:border-[#ff4d00]/50 text-[#f3eff6] text-sm font-bold uppercase tracking-widest bg-[#121217] hover:bg-[#121217]/50 transition-all flex items-center gap-2 group shadow-[0_0_20px_transparent] hover:shadow-[0_0_20px_rgba(255,77,0,0.15)] cursor-pointer">
                                Command Center <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform text-[#ff4d00]">arrow_forward</span>
                            </Link>
                        ) : (
                            <>
                                <Link to="/auth" className="px-5 py-2 text-[#acaab0] hover:text-[#f3eff6] text-sm font-bold uppercase tracking-widest transition-colors hidden md:block cursor-pointer">Login</Link>
                                <Link to="/auth" className="px-6 py-2.5 rounded-lg border border-[#ff4d00]/50 text-[#f3eff6] text-sm font-bold uppercase tracking-widest bg-[#ff4d00]/10 hover:bg-[#ff4d00]/20 transition-all flex items-center gap-2 group shadow-[0_0_20px_rgba(255,77,0,0.1)] hover:shadow-[0_0_30px_rgba(255,77,0,0.2)] cursor-pointer">
                                    Initialize <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform text-[#ff4d00]">bolt</span>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </header>

            {/* ── HERO SECTION ── */}
            <main className="relative pt-32 pb-24 overflow-hidden min-h-[90vh] flex flex-col justify-center">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#ff4d00] opacity-[0.03] blur-[150px] rounded-full pointer-events-none"></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10 w-full text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#ff4d00]/30 bg-[#ff4d00]/5 text-[11px] font-bold text-[#ff4d00] uppercase tracking-widest mb-8 shadow-[0_0_20px_rgba(255,77,0,0.1)]">
                        <span className="w-2 h-2 rounded-full bg-[#ff4d00] animate-pulse"></span>
                        Antigravity Engine Active
                    </div>

                    <h1 className="text-5xl md:text-8xl font-['Space_Grotesk'] font-bold text-[#f3eff6] tracking-tighter leading-[1.05] mb-8 drop-shadow-2xl">
                        Design the Future of <br className="hidden md:block"/>
                        <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#ff4d00] via-[#ff7a00] to-[#f3eff6]">Agentic Marketing</span>.
                    </h1>

                    <p className="text-lg md:text-xl text-[#acaab0] max-w-3xl mx-auto mb-12 leading-relaxed border-l-2 border-[#ff4d00]/50 pl-6 text-left inline-block">
                        Mantram.AI is the supreme operating system for modern brands. 
                        A 10-studio ecosystem powered by autonomous agents that strategize, write, design, and direct.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
                        <button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/auth')} className="w-full sm:w-auto px-10 py-5 rounded-xl bg-[#f3eff6] text-[#08080c] font-black uppercase tracking-widest hover:bg-[#ff4d00] hover:text-white transition-all duration-300 shadow-[0_10px_40px_rgba(255,77,0,0.15)] flex items-center justify-center gap-3 group cursor-pointer">
                            Deploy Agents <span className="material-symbols-outlined group-hover:translate-x-2 transition-transform">rocket_launch</span>
                        </button>
                        <button onClick={() => document.getElementById('platform-specs').scrollIntoView({ behavior: 'smooth' })} className="w-full sm:w-auto px-10 py-5 rounded-xl bg-[#121217] border border-[#48474c]/30 text-[#f3eff6] font-bold uppercase tracking-widest hover:border-[#ff4d00]/50 transition-all flex items-center justify-center gap-3 cursor-pointer">
                            View Blueprint
                        </button>
                    </div>

                    {/* UI Mockup Display */}
                    <div className="mt-24 relative max-w-5xl mx-auto">
                        <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-transparent to-transparent z-10 pointer-events-none h-full bottom-0 mt-auto opacity-80"></div>
                        <div className="relative rounded-2xl overflow-hidden border border-[#48474c]/30 shadow-[0_20px_80px_rgba(0,0,0,0.8)] mx-4 md:mx-0 group">
                            {/* Browser/Window Header */}
                            <div className="h-8 bg-[#121217] border-b border-[#48474c]/30 flex items-center px-4 gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                            </div>
                            <img src="/screenshots/dashboard.png" alt="Platform Dashboard" className="w-full h-auto opacity-70 object-cover object-top group-hover:opacity-100 transition-opacity duration-700" style={{maxHeight:'500px'}} />
                        </div>
                    </div>
                </div>
            </main>

            {/* ── PLATFORM SPECS ── */}
            <section id="platform-specs" className="py-32 relative bg-[#0e0e12] border-y border-[#48474c]/20 z-20">
                 <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-16 gap-6">
                        <div>
                            <h2 className="text-sm font-bold text-[#ff4d00] uppercase tracking-widest mb-3 border-b-2 border-[#ff4d00] inline-block pb-1">Architecture</h2>
                            <h3 className="text-4xl md:text-5xl font-['Space_Grotesk'] font-bold text-[#f3eff6] tracking-tight">The Ten Studios</h3>
                        </div>
                        <p className="text-[#acaab0] max-w-md text-sm uppercase tracking-wide leading-relaxed">
                            A unified ecosystem. Every studio connects to your central Brand DNA engine, ensuring zero hallucinations and absolute consistency.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { icon: 'movie', title: 'Video Studio', desc: 'Direct cinematic ad films using PiAPI & multiple model pipelines (Kling, Veo 2).', color: 'hover:border-[#ff4d00]/50' },
                            { icon: 'draw', title: 'Creative Studio', desc: 'Generate high-fidelity, brand-grounded ad creatives, carousels, and banners.', color: 'hover:border-[#8ff5ff]/50' },
                            { icon: 'edit_square', title: 'Content Studio', desc: 'Draft intelligent long-form content, email sequences, and social media captions.', color: 'hover:border-[#ff906d]/50' },
                            { icon: 'speed', title: 'Performance Marketing', desc: 'Autonomous ad generation and meta-campaign analytics tracking live ROAS.', color: 'hover:border-emerald-500/50' },
                            { icon: 'search', title: 'SEO Studio', desc: 'Rank rapidly with automated keyword planning and real-time site audits.', color: 'hover:border-amber-500/50' },
                            { icon: 'view_carousel', title: 'Funnel Studio', desc: 'Build landing pages & analyze conversion vector drop-offs across your funnel.', color: 'hover:border-indigo-500/50' },
                            { icon: 'hub', title: 'Brainstorm Studio', desc: 'Collaborate with Fidato (Brand OS AI) on strategy and campaign ideation.', color: 'hover:border-pink-500/50' },
                            { icon: 'share', title: 'Social Media', desc: 'Schedule and deploy intelligent content across connected API networks.', color: 'hover:border-sky-500/50' },
                            { icon: 'analytics', title: 'D2C Analytics', desc: 'Direct Shopify integration feeding live telemetry into your Command Center.', color: 'hover:border-cyan-500/50' },
                        ].map((m, i) => (
                            <div key={i} className={`p-8 rounded-2xl bg-[#121217] border border-[#48474c]/20 relative group transition-all duration-300 ${m.color} hover:bg-[#1a1920] cursor-default`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-[#ff4d00]/10 transition-colors pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
                                <span className="material-symbols-outlined text-3xl text-[#acaab0] mb-6 group-hover:text-white transition-colors">{m.icon}</span>
                                <h4 className="text-xl font-bold text-[#f3eff6] font-['Space_Grotesk'] mb-3">{m.title}</h4>
                                <p className="text-sm text-[#48474c] group-hover:text-[#acaab0] leading-relaxed transition-colors tracking-wide">{m.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── ENGINE SECTION ── */}
            <section id="engine" className="py-32 relative bg-[#08080c]">
                <div className="absolute right-0 top-1/4 w-[600px] h-[600px] bg-[#8ff5ff] opacity-[0.02] blur-[150px] rounded-full pointer-events-none"></div>

                <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col lg:flex-row items-center gap-16">
                    <div className="lg:w-1/2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded uppercase text-[10px] font-bold text-[#8ff5ff] tracking-widest mb-6">Nexus AI</div>
                        <h2 className="text-4xl md:text-5xl font-['Space_Grotesk'] font-bold text-[#f3eff6] tracking-tight mb-8">Meet Fidato.<br />Your Brand Orchestrator.</h2>
                        <ul className="space-y-6">
                            {[
                                { icon: 'psychology', title: 'Multimodal Chain-of-Thought', text: 'Analyzes visual uploads to ground every creative prompt in your distinct brand reality.' },
                                { icon: 'auto_awesome', title: 'Global Context Memory', text: 'Reads your Brand DNA to ensure tonal and visual consistency, zero hallucinations.' },
                                { icon: 'bolt', title: 'Instinct Routing', text: 'Automatically routes tasks to Gemini, Claude, Grok, or Sarvam for the highest fidelity output.' }
                            ].map((f, i) => (
                                <li key={i} className="flex gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-[#121217] border border-[#48474c]/30 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[#8ff5ff]">{f.icon}</span>
                                    </div>
                                    <div>
                                        <h4 className="text-white font-bold mb-1 tracking-wide">{f.title}</h4>
                                        <p className="text-[#acaab0] text-sm leading-relaxed">{f.text}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="lg:w-1/2 w-full mt-12 lg:mt-0 relative group">
                         <div className="absolute inset-0 bg-gradient-to-r from-[#08080c] via-transparent to-transparent z-10 pointer-events-none"></div>
                         <img src="/screenshots/content-studio.png" alt="Brainstorm Interface" className="w-full rounded-2xl border border-[#48474c]/40 shadow-2xl relative z-0 opacity-80 group-hover:opacity-100 transition-opacity" />
                    </div>
                </div>
            </section>

            {/* ── FOOTER CTA ── */}
            <footer className="relative py-24 border-t border-[#48474c]/20 bg-[#0e0e12] overflow-hidden text-center z-20">
                 <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-[#ff4d00] opacity-[0.03] blur-[150px] rounded-full pointer-events-none translate-y-1/2"></div>
                
                 <h2 className="text-4xl md:text-5xl font-['Space_Grotesk'] font-bold text-[#f3eff6] tracking-tight mb-6">Initialize Your Ecosystem.</h2>
                 <p className="text-[#acaab0] uppercase tracking-widest text-sm mb-10 max-w-xl mx-auto">Upload your brand guidelines. Connect your data. Watch the engine build the future.</p>
                 
                 <button onClick={() => navigate('/auth')} className="px-12 py-5 rounded-xl bg-gradient-to-r from-[#ff4d00] to-[#ff7a00] text-white font-black uppercase tracking-widest hover:scale-105 hover:shadow-[0_0_40px_rgba(255,77,0,0.4)] transition-all duration-300">
                     Access Command Center
                 </button>

                 <div className="mt-20 pt-8 border-t border-[#48474c]/20 max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-xs font-bold text-[#48474c] uppercase tracking-widest">
                     <p>© 2026 MANTRAM.AI — DESIGNED FOR THE POST-HUMAN ERA</p>
                     <div className="flex gap-6 mt-4 md:mt-0">
                         <Link to="/about" className="hover:text-[#acaab0]">About OS</Link>
                         <Link to="/terms" className="hover:text-[#acaab0]">Terms</Link>
                         <Link to="/privacy-policy" className="hover:text-[#acaab0]">Privacy</Link>
                     </div>
                 </div>
            </footer>
        </div>
    )
}

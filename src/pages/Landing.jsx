import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Landing() {
    const navigate = useNavigate()
    const { isAuthenticated } = useAuth()
    const [scanUrl, setScanUrl] = useState('')

    const handleScan = (e) => {
        e.preventDefault()
        const url = scanUrl.trim()
        if (!url) return

        if (isAuthenticated) {
            // Already logged in — go straight to onboarding with URL
            navigate(`/onboarding?scanUrl=${encodeURIComponent(url)}`)
        } else {
            // Need to login first, then redirect to onboarding with URL
            navigate(`/auth?redirect=${encodeURIComponent('/onboarding')}&scanUrl=${encodeURIComponent(url)}`)
        }
    }

    const handlePricing = (planName) => {
        if (isAuthenticated) {
            navigate('/dashboard')
        } else {
            navigate(`/auth?plan=${planName.toLowerCase()}`)
        }
    }

    return (
        <div className="relative min-h-screen w-full flex flex-col overflow-x-hidden liquid-gradient">
            {/* Navbar */}
            <nav className="sticky top-0 z-50 w-full px-6 py-4 flex justify-center">
                <header className="max-w-7xl w-full flex items-center justify-between glass-panel px-8 py-3 rounded-full">
                    <div className="flex items-center gap-3">
                        <div className="size-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
                            <span className="material-symbols-outlined text-white text-xl">auto_awesome</span>
                        </div>
                        <h2 className="text-white text-xl font-bold tracking-tight">Mantram AI</h2>
                    </div>
                    <div className="hidden md:flex items-center gap-10">
                        <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Product</a>
                        <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Intelligence</a>
                        <a className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Case Studies</a>
                        <a href="#pricing" className="text-slate-400 hover:text-white text-sm font-medium transition-colors cursor-pointer">Pricing</a>
                    </div>
                    <div className="flex items-center gap-4">
                        {isAuthenticated ? (
                            <Link to="/dashboard" className="hidden sm:block text-slate-300 text-sm font-medium px-4 hover:text-white transition-colors">Dashboard</Link>
                        ) : (
                            <Link to="/auth" className="hidden sm:block text-slate-300 text-sm font-medium px-4 hover:text-white transition-colors">Login</Link>
                        )}
                        <Link to={isAuthenticated ? '/onboarding' : '/auth?redirect=%2Fonboarding'}
                            className="bg-primary hover:bg-primary-light text-white text-sm font-bold py-2.5 px-6 rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-lg shadow-primary/20">
                            Get Started Free
                        </Link>
                    </div>
                </header>
            </nav>

            {/* Hero */}
            <main className="flex-grow flex flex-col items-center justify-center px-4 py-20 relative">
                {/* Background blobs */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px]" />
                    <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]" />
                </div>

                <div className="relative z-10 max-w-4xl w-full text-center space-y-12 animate-fade-in">
                    {/* Badge */}
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel text-primary text-xs font-bold uppercase tracking-widest" style={{ borderColor: 'rgba(43,75,238,0.2)' }}>
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" style={{ animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                            </span>
                            Introducing The Source
                        </div>

                        <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-white leading-[1.1] tracking-tight">
                            Plant your <span className="text-gradient">digital seed.</span>
                        </h1>
                        <p className="text-slate-400 text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed">
                            The next evolution of brand intelligence. Enter your website URL to extract your brand DNA and begin your marketing journey with AI-powered insights.
                        </p>
                    </div>

                    {/* URL Input */}
                    <div className="max-w-2xl mx-auto w-full group">
                        <div className="glass-panel p-2 rounded-2xl md:rounded-3xl shadow-2xl transition-all duration-500 hover:border-primary/40 focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
                            <form className="flex flex-col md:flex-row gap-2" onSubmit={handleScan}>
                                <div className="flex-grow flex items-center px-4 gap-3">
                                    <span className="material-symbols-outlined text-slate-500">language</span>
                                    <input
                                        className="w-full bg-transparent border-none text-white focus:ring-0 focus:outline-none placeholder:text-slate-600 text-lg py-4"
                                        placeholder="https://your-website.com"
                                        type="url"
                                        value={scanUrl}
                                        onChange={(e) => setScanUrl(e.target.value)}
                                        required
                                    />
                                </div>
                                <button type="submit" className="bg-primary hover:bg-primary-light text-white px-10 py-4 rounded-xl md:rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20 cursor-pointer">
                                    Scan
                                    <span className="material-symbols-outlined">auto_awesome</span>
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Trust badges */}
                    <div className="flex flex-wrap justify-center gap-8 md:gap-16 pt-6 opacity-40 hover:opacity-100 transition-all duration-700">
                        <div className="flex items-center gap-2 font-bold text-slate-300 text-sm">
                            <span className="material-symbols-outlined text-lg">verified_user</span> ENTERPRISE SECURE
                        </div>
                        <div className="flex items-center gap-2 font-bold text-slate-300 text-sm">
                            <span className="material-symbols-outlined text-lg">memory</span> AI-POWERED
                        </div>
                        <div className="flex items-center gap-2 font-bold text-slate-300 text-sm">
                            <span className="material-symbols-outlined text-lg">speed</span> REAL-TIME
                        </div>
                    </div>
                </div>
            </main>

            {/* Features Section */}
            <section className="max-w-7xl mx-auto w-full px-6 py-24">
                <div className="text-center mb-16 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need, <span className="text-gradient">one platform.</span></h2>
                    <p className="text-slate-400 max-w-xl mx-auto">From brand intelligence to content creation, from social media to e-commerce — all powered by neural AI.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        { icon: 'genetics', color: 'primary', title: 'Brand DNA', desc: 'Extract your brand identity — logo, colors, fonts, voice, and tone — from your website in seconds.' },
                        { icon: 'draw', color: 'purple-400', title: 'Content Studio', desc: 'Generate blog posts, social captions, ad copy, emails, and SEO content aligned to your brand voice.' },
                        { icon: 'auto_fix_high', color: 'emerald-400', title: 'Creative Studio', desc: 'Design social media posts, stories, ads, banners, and marketing videos with AI-powered generation.' },
                    ].map((f, i) => (
                        <div key={i} className="glass-panel p-8 rounded-3xl group hover:bg-white/[0.05] transition-all duration-300" style={{ animationDelay: `${0.3 + i * 0.1}s`, animationFillMode: 'both' }}>
                            <div className={`size-12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ${f.color === 'primary' ? 'bg-primary/20 text-primary' :
                                f.color === 'purple-400' ? 'bg-purple-500/20 text-purple-400' :
                                    'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                <span className="material-symbols-outlined text-3xl">{f.icon}</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                            <p className="text-slate-400 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* How It Works */}
            <section className="max-w-7xl mx-auto w-full px-6 py-16">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How it <span className="text-gradient">works</span></h2>
                    <p className="text-slate-400 max-w-xl mx-auto">Three simple steps from zero to published content.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                        { step: '01', icon: 'language', title: 'Enter Your Website', desc: 'Paste your URL and our AI scans your entire website to extract brand assets, style, and voice.' },
                        { step: '02', icon: 'palette', title: 'Build Brand DNA', desc: 'Review and refine your extracted brand knowledge bank — colors, fonts, logos, and content style.' },
                        { step: '03', icon: 'rocket_launch', title: 'Create & Publish', desc: 'Use Content Studio and Creative Studio to generate on-brand marketing content and post directly.' },
                    ].map((s, i) => (
                        <div key={i} className="relative glass-panel p-8 rounded-3xl group hover:bg-white/[0.05] transition-all">
                            <div className="text-6xl font-black text-white/[0.04] absolute top-4 right-6">{s.step}</div>
                            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:bg-primary/20 transition-colors">
                                <span className="material-symbols-outlined text-3xl">{s.icon}</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                            <p className="text-slate-400 leading-relaxed">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Pricing Section */}
            <section id="pricing" className="max-w-7xl mx-auto w-full px-6 py-24">
                <div className="text-center mb-16">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Choose your <span className="text-gradient">plan</span></h2>
                    <p className="text-slate-400 max-w-xl mx-auto">Start free, scale as you grow. Every plan includes AI-powered brand intelligence.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                    {[
                        { name: 'Starter', price: 'Free', desc: 'Perfect for getting started', features: ['1 Brand Profile', 'Basic Content Studio', '5 AI Generations/day', 'Email Support'], popular: false },
                        { name: 'Professional', price: '$49', desc: 'For growing brands', features: ['5 Brand Profiles', 'Full Content & Creative Studio', 'Unlimited AI Generations', 'Team Dashboard (3 users)', 'Analytics Dashboard', 'Priority Support'], popular: true },
                        { name: 'Enterprise', price: '$199', desc: 'For agencies & teams', features: ['Unlimited Brands', 'Full Platform Access', 'Unlimited Everything', 'Admin Dashboard', 'API Access', 'Dedicated Account Manager'], popular: false },
                    ].map((plan, i) => (
                        <div key={i} className={`glass-panel p-8 rounded-3xl relative transition-all hover:scale-[1.02] ${plan.popular ? 'border-primary/40 ring-2 ring-primary/20' : ''}`}>
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 badge badge-primary">Most Popular</div>
                            )}
                            <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                            <p className="text-slate-500 text-sm mb-6">{plan.desc}</p>
                            <div className="mb-6">
                                <span className="text-4xl font-black text-white">{plan.price}</span>
                                {plan.price !== 'Free' && <span className="text-slate-500 text-sm">/month</span>}
                            </div>
                            <ul className="space-y-3 mb-8">
                                {plan.features.map((f, j) => (
                                    <li key={j} className="flex items-center gap-2 text-sm text-slate-300">
                                        <span className="material-symbols-outlined text-primary text-lg">check_circle</span>
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => handlePricing(plan.name)}
                                className={`w-full py-3 rounded-xl font-bold text-sm text-center block transition-all cursor-pointer ${plan.popular
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:bg-primary-light'
                                    : 'bg-white/[0.06] text-white hover:bg-white/[0.1]'
                                    }`}
                            >
                                Get Started
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* CTA Section */}
            <section className="max-w-7xl mx-auto w-full px-6 py-12">
                <div className="glass-panel rounded-[2.5rem] p-8 md:p-16 overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
                    <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        <div className="space-y-8">
                            <h2 className="text-4xl font-bold text-white leading-tight">Join the future of <br />brand intelligence.</h2>
                            <div className="flex flex-col gap-6">
                                {[
                                    { title: '2.4M+ Analyses Run', desc: 'Join a global network of digital pioneers.' },
                                    { title: '45ms Processing Speed', desc: 'Real-time extraction without the wait.' },
                                    { title: '99.9% Accuracy', desc: 'Enterprise-grade brand intelligence.' },
                                ].map((s, i) => (
                                    <div key={i} className="flex items-start gap-4">
                                        <div className="mt-1 text-primary"><span className="material-symbols-outlined">check_circle</span></div>
                                        <div>
                                            <h4 className="text-white font-bold">{s.title}</h4>
                                            <p className="text-slate-400 text-sm">{s.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-center md:justify-end">
                            <div className="relative w-full max-w-sm aspect-square">
                                <div className="absolute inset-0 bg-primary/20 rounded-full blur-3xl animate-pulse-slow" />
                                <div className="relative w-full h-full glass-panel rounded-full flex items-center justify-center" style={{ borderColor: 'rgba(255,255,255,0.15)' }}>
                                    <div className="text-center">
                                        <span className="material-symbols-outlined text-primary text-8xl">hub</span>
                                        <div className="mt-4 text-white font-black text-2xl tracking-widest">ACTIVE NODE</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="w-full border-t border-white/[0.05] py-12 px-6 mt-20">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className="size-6 bg-primary rounded flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-xs">auto_awesome</span>
                        </div>
                        <span className="text-white font-bold">Mantram AI</span>
                    </div>
                    <div className="flex gap-8 text-slate-500 text-sm">
                        <a className="hover:text-primary transition-colors cursor-pointer">Privacy</a>
                        <a className="hover:text-primary transition-colors cursor-pointer">Terms</a>
                        <a className="hover:text-primary transition-colors cursor-pointer">Security</a>
                        <a className="hover:text-primary transition-colors cursor-pointer">API</a>
                    </div>
                    <div className="flex gap-4">
                        <a className="size-10 rounded-full glass-panel flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-lg">share</span>
                        </a>
                        <a className="size-10 rounded-full glass-panel flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-lg">mail</span>
                        </a>
                    </div>
                </div>
                <p className="text-center text-slate-600 text-xs mt-8">© 2025 Mantram AI. All rights reserved.</p>
            </footer>
        </div>
    )
}

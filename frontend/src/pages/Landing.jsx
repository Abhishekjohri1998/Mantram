import { useAuth } from '../context/AuthContext'
import SEOHead from '../components/SEOHead'

import Nav from '../components/landing/Nav'
import Hero from '../components/landing/Hero'
import FeaturedVideos from '../components/landing/FeaturedVideos'
import ActionDemo from '../components/landing/ActionDemo'
import TrustLogos from '../components/landing/TrustLogos'
import IntelligenceLayer from '../components/landing/IntelligenceLayer'
import Metrics from '../components/landing/Metrics'
import Comparison from '../components/landing/Comparison'
import StudiosShowcase from '../components/landing/StudiosShowcase'
import FeaturedStudios from '../components/landing/FeaturedStudios'
import HowItWorks from '../components/landing/HowItWorks'
import CaseStudies from '../components/landing/CaseStudies'
import Testimonial from '../components/landing/Testimonial'
import Pricing from '../components/landing/Pricing'
import FAQ from '../components/landing/FAQ'
import FinalCTA from '../components/landing/FinalCTA'
import Footer from '../components/landing/Footer'
import CursorGlow from '../components/landing/CursorGlow'
import Particles3D from '../components/landing/Particles3D'

import { BRAND } from '../data/studios'

/**
 * Mantram AI — Landing page.
 *
 * The page is a pure composition of section components from /landing/.
 * Single responsibility here: orchestrate them and own the waitlist modal
 * state. Each section is independently editable; copy lives in the section
 * files (or in /data/studios.js for studio-specific content).
 *
 * 3D System: The outer wrapper uses CSS `perspective: 1200px` to create a
 * 3D rendering context. Each section component applies its own scroll-linked
 * rotateX / translateZ transforms via useScroll3D or inline Framer Motion.
 */
export default function Landing() {
    const { isAuthenticated } = useAuth()

    return (
        <>
            <SEOHead
                title="Mantram AI — Agentic AI Marketing OS for D2C Brands & Agencies"
                description="Mantram AI is an agentic AI marketing operating system. 14 studios learn your Brand DNA once, then plan, create, distribute and optimise — powered by Claude 4.6, Gemini 3, GPT Image 2, Veo 3.1, Sora 2, NanoBanana 2 and more."
                canonical="/"
                ogTitle="Mantram AI — Agentic AI Marketing OS"
                ogDescription="14 AI studios. One Brand DNA. Agentic pipelines that plan, create, distribute and optimise — powered by frontier AI models."
                ogImage="https://mantram.ai/mantram-logo.png"
                aiSummary="Mantram AI is an agentic AI marketing operating system with 14 studios — Research, Brainstorm, Monthly Strategy, Content, Creative, Video, YouTube, Avatar, Brand, Social Media, Performance Marketing, Funnel, SEO, Retention. Brand DNA captured from a website scan is shared across all studios. Models include Claude Sonnet 4.6, Gemini 3 Pro, GPT-4o, GPT Image 2, NanoBanana 2/Pro, Veo 3.1, Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0, HeyGen Avatars. Currently in early access (no free tier, credit-pack pricing from ₹149)."
            />

            {/* 3D Perspective Container — gives all children a shared vanishing point */}
            <div className="relative landing-3d-container" style={{ background: '#0b0b0c', color: 'white' }}>
                <CursorGlow />
                <Particles3D count={18} />

                <Nav
                    isAuthenticated={isAuthenticated}
                />

                <main role="main" className="relative z-[2]" style={{ transformStyle: 'preserve-3d' }}>
                    <Hero />
                    <FeaturedVideos />
                    <div id="templates"><ActionDemo /></div>
                    <TrustLogos />
                    <IntelligenceLayer />
                    <Metrics />
                    <Comparison />
                    <div id="studios"><StudiosShowcase /></div>
                    <FeaturedStudios />
                    <div id="how-it-works"><HowItWorks /></div>
                    <Testimonial />
                    <div id="pricing"><Pricing /></div>
                    <FAQ />
                    <div id="agencies"><FinalCTA /></div>
                </main>

                <Footer />

            </div>
        </>
    )
}

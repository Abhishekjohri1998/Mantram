import { useAuth } from '../context/AuthContext'
import SEOHead from '../components/SEOHead'

import Nav from '../components/landing/Nav'
import Hero from '../components/landing/Hero'
import FeaturedVideos from '../components/landing/FeaturedVideos'
import ActionDemo from '../components/landing/ActionDemo'
import TrustLogos from '../components/landing/TrustLogos'
import IntelligenceLayer from '../components/landing/IntelligenceLayer'
import StudiosShowcase from '../components/landing/StudiosShowcase'
import HowItWorks from '../components/landing/HowItWorks'
import CaseStudies from '../components/landing/CaseStudies'
import Testimonial from '../components/landing/Testimonial'
import Pricing from '../components/landing/Pricing'
import FAQ from '../components/landing/FAQ'
import FinalCTA from '../components/landing/FinalCTA'
import Footer from '../components/landing/Footer'
import CursorGlow from '../components/landing/CursorGlow'

import { BRAND } from '../data/studios'

/**
 * Mantram AI — Landing page.
 *
 * The page is a pure composition of section components from /landing/.
 * Single responsibility here: orchestrate them and own the waitlist modal
 * state. Each section is independently editable; copy lives in the section
 * files (or in /data/studios.js for studio-specific content).
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

            <div className="relative" style={{ background: '#0b0b0c', color: 'white' }}>
                <CursorGlow />

                <Nav
                    isAuthenticated={isAuthenticated}
                />

                <main role="main" className="relative z-[2]">
                    <Hero />
                    <FeaturedVideos />
                    <ActionDemo />
                    <TrustLogos />
                    <IntelligenceLayer />
                    <StudiosShowcase />
                    <HowItWorks />
                    <CaseStudies />
                    <Testimonial />
                    <Pricing />
                    <FAQ />
                    <FinalCTA />
                </main>

                <Footer />

            </div>
        </>
    )
}

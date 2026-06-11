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
                description="Mantram AI is an agentic marketing OS: 14 AI studios sharing one Brand DNA. Multilingual — English, Hindi, Arabic, Bahasa, Vietnamese. Credits from ₹149."
                canonical="/"
                ogTitle="Mantram AI — Agentic AI Marketing OS"
                ogDescription="Mantram AI is an agentic marketing OS: 14 AI studios sharing one Brand DNA. Multilingual — English, Hindi, Arabic, Bahasa, Vietnamese. Credits from ₹149."
                ogImage="https://mantram.ai/mantram-logo.png"
                aiSummary="Mantram AI is an agentic AI marketing operating system that learns a brand's DNA once and runs planning, content, creative, video, distribution and optimisation through 14 specialised AI studios — built in India for D2C brands and agencies across South Asia, Southeast Asia and the Middle East. Models include Claude Sonnet 4.6, Gemini 3 Pro, GPT-4o, GPT Image 2, NanoBanana 2/Pro, Flux Kontext Max, Veo 3.1, Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0, Hailuo, Wan 2.1, HeyGen. Credit-pack pricing from ₹149, no subscription. DPDP compliant, GDPR-aware."
            />

            <div className="relative" style={{ background: '#0b0b0c', color: 'white' }}>
                <CursorGlow />

                <Nav
                    isAuthenticated={isAuthenticated}
                />

                <main role="main" className="relative z-[2]">
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

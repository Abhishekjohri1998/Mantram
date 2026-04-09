import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-[var(--sys-surface)] text-[var(--sys-text-muted)] py-12 px-4 sm:px-6 lg:px-8">
            <SEOHead
                title="Terms of Service — Mantram AI"
                description="Mantram AI terms of service: AI content ownership, subscriptions & credits, social publishing rules, third-party integrations, intellectual property & acceptable use policy."
                canonical="/terms"
                ogTitle="Terms of Service — Mantram AI"
                ogDescription="Terms governing your use of the Mantram AI platform — 12 AI-powered marketing studios, subscriptions, content ownership & integrations."
                ogImage="https://mantram.ai/mantram-logo.png"
                aiSummary="Mantram AI Terms of Service covering account responsibilities, subscription tiers (Free, Professional, Enterprise), AI credit system, AI-generated content ownership, social media publishing rules, third-party integrations (Google, Meta, Shopify), intellectual property, acceptable use, and dispute resolution under Indian law."
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": "Terms of Service — Mantram AI",
                    "description": "Terms of Service for Mantram AI — AI-Powered Marketing Operating System",
                    "url": "https://mantram.ai/terms",
                    "isPartOf": { "@type": "WebSite", "name": "Mantram AI", "url": "https://mantram.ai/" },
                    "breadcrumb": {
                        "@type": "BreadcrumbList",
                        "itemListElement": [
                            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mantram.ai/" },
                            { "@type": "ListItem", "position": 2, "name": "Terms of Service", "item": "https://mantram.ai/terms" }
                        ]
                    }
                }}
            />
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-[var(--sys-text)] mb-4">Terms of <span className="text-primary">Service</span></h1>
                    <p className="text-[var(--sys-text-muted)]">Effective: March 1, 2026 &nbsp;·&nbsp; Last Updated: March 8, 2026</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 space-y-8 border border-[var(--sys-border)]">

                    {/* Intro */}
                    <p className="leading-relaxed">
                        Welcome to Mantram AI. These Terms of Service ("Terms") govern your access to and use of the Mantram AI platform at <a href="https://mantram.ai" className="text-primary hover:underline">mantram.ai</a>, including all AI-powered studios, integrations, and services (collectively, the "Platform"). By using the Platform, you agree to these Terms.
                    </p>

                    {/* 1 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">1. Acceptance of Terms</h2>
                        <p className="leading-relaxed mb-3">By creating an account or using Mantram AI, you confirm that you:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Are at least 18 years of age or have parental/guardian consent</li>
                            <li>Have the legal capacity to enter into a binding agreement</li>
                            <li>Accept these Terms and our <Link to="/privacy-policy" className="text-primary hover:underline">Privacy Policy</Link></li>
                            <li>Will comply with all applicable laws and regulations when using the Platform</li>
                        </ul>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">2. Description of Services</h2>
                        <p className="leading-relaxed mb-3">
                            Mantram AI is an AI-powered marketing operating system that provides:
                        </p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-[var(--sys-text)]/90">Content Studio:</strong> AI-generated blog posts, social media captions, ad copy, and email content</li>
                            <li><strong className="text-[var(--sys-text)]/90">Creative Studio:</strong> AI-powered design for social posts, stories, ads, banners, and product imagery</li>
                            <li><strong className="text-[var(--sys-text)]/90">Video Studio:</strong> Multi-model video generation using Seedance, Kling, Veo, and other providers</li>
                            <li><strong className="text-[var(--sys-text)]/90">Performance Marketing Studio:</strong> AI ad strategy, competitor research, and campaign generation for Meta and Google Ads</li>
                            <li><strong className="text-[var(--sys-text)]/90">SEO Studio:</strong> AI-powered keyword research, site audits, content gap analysis, and competitive intelligence</li>
                            <li><strong className="text-[var(--sys-text)]/90">D2C Analytics:</strong> Shopify Intelligence Hub with product velocity, abandonment signals, and e-commerce insights</li>
                            <li><strong className="text-[var(--sys-text)]/90">Conversation Studio:</strong> AI auto-responder for Instagram and Facebook DMs</li>
                            <li><strong className="text-[var(--sys-text)]/90">Brainstorm Studio:</strong> AI creative director for campaign ideas, mood boards, and content calendars</li>
                            <li><strong className="text-[var(--sys-text)]/90">Smart Calendar:</strong> Marketing intelligence calendar with trending moments and AI-suggested posting schedules</li>
                            <li><strong className="text-[var(--sys-text)]/90">Analytics:</strong> Traffic intelligence, audience insights, and Google Analytics integration</li>
                        </ul>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">3. User Accounts & Responsibilities</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>You are responsible for maintaining the confidentiality of your login credentials</li>
                            <li>You must provide accurate and up-to-date information during registration</li>
                            <li>You are responsible for all activities that occur under your account</li>
                            <li>You must notify us immediately of any unauthorized access at <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a></li>
                            <li>Team administrators are responsible for managing member permissions and access levels</li>
                        </ul>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">4. Subscriptions, Credits & Payment</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Mantram AI offers tiered subscription plans (Free, Professional, Enterprise) with varying feature limits and AI credit allocations</li>
                            <li>AI credits are consumed when using generative AI features (content generation, image creation, video production)</li>
                            <li>Payments are processed securely through Razorpay. By subscribing, you also agree to <a href="https://razorpay.com/terms/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Razorpay's Terms of Service</a></li>
                            <li>Subscriptions auto-renew unless cancelled before the renewal date</li>
                            <li>Refunds are handled on a case-by-case basis. Contact support within 7 days of payment for refund requests</li>
                            <li>Unused credits do not roll over to the next billing cycle unless specified in your plan</li>
                        </ul>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">5. AI-Generated Content</h2>
                        <p className="leading-relaxed mb-3">Mantram AI uses multiple AI models (Gemini, Claude, GPT-4o, Grok, Imagen, Seedance, and others) to generate content. By using these features, you acknowledge:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-[var(--sys-text)]/90">No Guarantee of Accuracy:</strong> AI-generated content may contain factual errors, inaccuracies, or unintended outputs. You are responsible for reviewing and verifying all content before publishing or using it commercially.</li>
                            <li><strong className="text-[var(--sys-text)]/90">Content Ownership:</strong> You retain ownership of the content you generate using Mantram AI, subject to the underlying AI model providers' terms of service.</li>
                            <li><strong className="text-[var(--sys-text)]/90">Brand Consistency:</strong> While Brand DNA alignment improves output quality, AI-generated content may not always perfectly match your brand guidelines.</li>
                            <li><strong className="text-[var(--sys-text)]/90">Third-Party Model Terms:</strong> AI outputs are subject to the terms of the underlying model providers (Google, Anthropic, OpenAI, xAI, PiAPI).</li>
                        </ul>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">6. Social Media Publishing</h2>
                        <p className="leading-relaxed mb-3">When using our social media publishing and auto-response features:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>You must comply with the terms of service of each connected platform (Meta, Instagram, YouTube)</li>
                            <li>You are solely responsible for content published through Mantram AI to your social accounts</li>
                            <li>You agree not to publish prohibited, illegal, hateful, or harmful content</li>
                            <li>Conversation Studio auto-responses are sent on your behalf — you are responsible for their content and appropriateness</li>
                            <li>We are not liable for actions taken by social platforms (account suspension, content removal) in response to content published via Mantram AI</li>
                        </ul>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">7. Third-Party Integrations</h2>
                        <p className="leading-relaxed mb-3">Mantram AI integrates with third-party services. By using these integrations, you also agree to their respective terms:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-[var(--sys-text)]/90">Google:</strong> <a href="https://www.google.com/intl/en/policies/terms/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Terms of Service</a> and <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">API Services User Data Policy</a></li>
                            <li><strong className="text-[var(--sys-text)]/90">Meta:</strong> <a href="https://www.facebook.com/terms.php" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Meta Terms of Service</a> and <a href="https://developers.facebook.com/terms/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Platform Terms</a></li>
                            <li><strong className="text-[var(--sys-text)]/90">Shopify:</strong> <a href="https://www.shopify.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Shopify Terms of Service</a></li>
                        </ul>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">8. Intellectual Property</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>The Mantram AI platform, its design, code, branding, and proprietary AI workflows are the intellectual property of Mantram AI</li>
                            <li>You may not copy, reverse-engineer, or redistribute any part of the Platform</li>
                            <li>Content you create using our tools belongs to you, subject to Section 5</li>
                            <li>Brand assets (logos, colors, guidelines) you upload remain your property — we use them solely to deliver services</li>
                        </ul>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">9. Acceptable Use Policy</h2>
                        <p className="leading-relaxed mb-3">You agree not to use Mantram AI to:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Generate, distribute, or promote illegal, harmful, defamatory, or misleading content</li>
                            <li>Violate the intellectual property rights of any third party</li>
                            <li>Attempt to bypass credit limits, rate limits, or usage restrictions</li>
                            <li>Use automated tools (bots, scrapers) to access the Platform without authorization</li>
                            <li>Interfere with or disrupt Platform infrastructure or other users' access</li>
                            <li>Resell or sublicense access to the Platform without written agreement</li>
                            <li>Generate content that promotes violence, hate speech, or discrimination</li>
                        </ul>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">10. Limitation of Liability</h2>
                        <p className="leading-relaxed mb-3">To the fullest extent permitted by applicable law:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Mantram AI shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the Platform</li>
                            <li>Our total aggregate liability shall not exceed the amount you paid to Mantram AI in the 12 months preceding the claim</li>
                            <li>We are not liable for delays or failures caused by circumstances beyond our control (force majeure), including AI model provider outages, internet disruptions, or natural disasters</li>
                            <li>We are not responsible for content published to third-party platforms or the actions of those platforms</li>
                        </ul>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">11. Disclaimer of Warranties</h2>
                        <p className="leading-relaxed">
                            The Platform is provided on an <strong className="text-[var(--sys-text)]/90">"as is"</strong> and <strong className="text-[var(--sys-text)]/90">"as available"</strong> basis without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Platform will be uninterrupted, error-free, or that AI-generated content will meet your specific requirements or achieve particular business outcomes.
                        </p>
                    </section>

                    {/* 12 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">12. Confidentiality</h2>
                        <p className="leading-relaxed">
                            We treat your Brand DNA data, creative briefs, campaign strategies, and business information as confidential. We will not disclose this information to third parties except as required to deliver the Platform services (e.g., sending prompts to AI models) or as required by law.
                        </p>
                    </section>

                    {/* 13 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">13. Governing Law & Jurisdiction</h2>
                        <p className="leading-relaxed">
                            These Terms are governed by and construed in accordance with the laws of India. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of the courts in Mumbai, Maharashtra, India.
                        </p>
                    </section>

                    {/* 14 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">14. Dispute Resolution</h2>
                        <p className="leading-relaxed">
                            In the event of a dispute, the parties agree to first attempt resolution through good-faith negotiation. If the dispute cannot be resolved within 30 days, either party may initiate arbitration under the Arbitration and Conciliation Act, 1996 (India). Arbitration shall be conducted in English in Mumbai, India.
                        </p>
                    </section>

                    {/* 15 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">15. Termination</h2>
                        <p className="leading-relaxed mb-3">We may suspend or terminate your access to the Platform:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>If you breach these Terms or our Acceptable Use Policy</li>
                            <li>If your account shows unusual or potentially fraudulent activity</li>
                            <li>If required by law or platform partner requirements</li>
                            <li>At our discretion, with or without notice</li>
                        </ul>
                        <p className="leading-relaxed mt-3 text-sm">
                            Upon termination, your right to use the Platform ceases immediately. You may request an export of your data within 30 days of termination by contacting support.
                        </p>
                    </section>

                    {/* 16 */}
                    <section>
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">16. Modifications to Terms</h2>
                        <p className="leading-relaxed">
                            We reserve the right to modify these Terms at any time. Updated Terms will be posted on this page with a revised "Last Updated" date. For material changes, we will notify you via email or in-app notification. Continued use of the Platform after modifications constitutes acceptance of the updated Terms.
                        </p>
                    </section>

                    {/* Contact */}
                    <section className="pt-6 border-t border-[var(--sys-border)]">
                        <h2 className="text-xl font-bold text-[var(--sys-text)] mb-3">17. Contact Us</h2>
                        <p className="leading-relaxed mb-3">For questions about these Terms of Service, contact us:</p>
                        <div className="p-4 rounded-xl bg-[var(--sys-surface)] border border-[#48474c]/30">
                            <p className="text-sm"><strong className="text-[var(--sys-text)]">Mantram AI</strong></p>
                            <p className="text-sm">Email: <a href="mailto:legal@mantram.ai" className="text-primary hover:underline">legal@mantram.ai</a></p>
                            <p className="text-sm">Support: <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a></p>
                        </div>
                    </section>
                </div>

                <div className="mt-12 text-center">
                    <Link to="/" className="text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] transition-colors flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    )
}

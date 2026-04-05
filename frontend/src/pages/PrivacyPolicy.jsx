import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 py-12 px-4 sm:px-6 lg:px-8">
            <SEOHead
                title="Privacy Policy — Mantram AI"
                description="Mantram AI privacy policy: how we collect, use & protect your data across 12 AI marketing studios. Covers social media integrations, Google Analytics, Shopify, AI model routing & GDPR compliance."
                canonical="/privacy-policy"
                ogTitle="Privacy Policy — Mantram AI"
                ogDescription="Learn how Mantram AI collects, uses, and protects your data across our AI-powered marketing platform."
                ogImage="https://mantram.ai/mantram-logo.png"
                aiSummary="Mantram AI Privacy Policy covering data collection, social media integrations (Meta, Instagram, YouTube), Google Analytics & Search Console data usage, Shopify integration, AI model provider data sharing (Gemini, Claude, Grok), cookies, user rights, data deletion, and GDPR compliance."
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "name": "Privacy Policy — Mantram AI",
                    "description": "Privacy Policy for Mantram AI — AI-Powered Marketing Operating System",
                    "url": "https://mantram.ai/privacy-policy",
                    "isPartOf": { "@type": "WebSite", "name": "Mantram AI", "url": "https://mantram.ai/" },
                    "breadcrumb": {
                        "@type": "BreadcrumbList",
                        "itemListElement": [
                            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://mantram.ai/" },
                            { "@type": "ListItem", "position": 2, "name": "Privacy Policy", "item": "https://mantram.ai/privacy-policy" }
                        ]
                    }
                }}
            />
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-4">Privacy <span className="text-primary">Policy</span></h1>
                    <p className="text-slate-500">Effective: March 1, 2026 &nbsp;·&nbsp; Last Updated: March 8, 2026</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 space-y-8 border border-white/[0.05]">

                    {/* Intro */}
                    <p className="leading-relaxed">
                        Mantram AI ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the Mantram AI platform (<a href="https://mantram.ai" className="text-primary hover:underline">mantram.ai</a>), including our AI-powered marketing studios, social media publishing tools, and analytics integrations.
                    </p>
                    <p className="leading-relaxed">
                        By accessing or using Mantram AI, you agree to this Privacy Policy. If you do not agree, please discontinue use immediately.
                    </p>

                    {/* 1 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">1. Information We Collect</h2>

                        <h3 className="text-lg font-semibold text-white/80 mt-4 mb-2">1.1 Information You Provide</h3>
                        <p className="leading-relaxed mb-3">We collect information you provide directly, such as when you:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Create or modify your account (name, email, password, profile photo)</li>
                            <li>Set up a brand identity via Brand DNA (website URL, logo, brand guidelines)</li>
                            <li>Subscribe to a plan or purchase credits (payment information processed via Razorpay)</li>
                            <li>Contact support or submit feedback</li>
                            <li>Fill out the early access / waitlist form</li>
                            <li>Invite team members to your workspace</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-white/80 mt-5 mb-2">1.2 Automatically Collected Information</h3>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Device Data:</strong> Browser type, OS, screen resolution, device identifiers</li>
                            <li><strong className="text-white/90">Usage Data:</strong> Pages visited, features used, content generated, session duration</li>
                            <li><strong className="text-white/90">IP Address:</strong> Approximate geographic location for analytics and security</li>
                            <li><strong className="text-white/90">Cookies:</strong> Session management, preference storage, analytics (see Section 8)</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-white/80 mt-5 mb-2">1.3 Third-Party Platform Data</h3>
                        <p className="leading-relaxed">
                            When you connect third-party accounts (Meta, Instagram, YouTube, Google, Shopify), we receive data via their APIs as described in Sections 2, 3, and 4 below.
                        </p>
                    </section>

                    {/* 2 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">2. Social Media Integration</h2>
                        <p className="leading-relaxed mb-3">
                            When you connect social media accounts (e.g., Facebook, Instagram, YouTube) to Mantram AI, we receive certain information from those platforms via their APIs. This includes:
                        </p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Account identifiers and profile information</li>
                            <li>Page/account management permissions necessary to publish content</li>
                            <li>Post performance metrics (likes, shares, comments, reach)</li>
                            <li>Audience demographics and engagement data</li>
                            <li>Direct message conversations (for Conversation Studio auto-responder)</li>
                        </ul>
                        <p className="leading-relaxed mt-3">
                            We only use this information to provide the publishing, analytics, and auto-response services you explicitly initiate. We <strong className="text-white/90">do not</strong> independently post, modify, or delete your social content without your express action.
                        </p>
                    </section>

                    {/* 3 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">3. Google Analytics & Search Console Data</h2>
                        <p className="leading-relaxed mb-3">
                            Mantram AI requests read-only access to your Google Analytics properties and Google Search Console sites. This data is used solely to:
                        </p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>Provide SEO performance reports and keyword insights within the SEO Studio</li>
                            <li>Generate AI-driven marketing recommendations based on traffic patterns</li>
                            <li>Display website analytics in your Mantram AI Dashboard</li>
                        </ul>
                        <div className="mt-4 p-4 rounded-xl bg-violet-500/5 border border-violet-500/10">
                            <p className="text-sm leading-relaxed">
                                <strong className="text-white">Google API Limited Use Disclosure:</strong> Our use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google API Services User Data Policy</a>, including the Limited Use requirements. We do not sell, share, or use this data for advertising purposes.
                            </p>
                        </div>
                    </section>

                    {/* 4 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">4. Shopify Integration</h2>
                        <p className="leading-relaxed">
                            When you connect your Shopify store, Mantram AI accesses product data, order metrics, and storefront performance data via the Shopify API. This data powers the D2C Analytics Studio, providing product velocity analysis, abandonment signals, and AI-powered e-commerce insights. We comply with all <a href="https://www.shopify.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Shopify Partner Terms</a> and GDPR webhook requirements.
                        </p>
                    </section>

                    {/* 5 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">5. How We Use Your Information</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Service Delivery:</strong> Powering AI studios, generating content, publishing to social platforms, and providing analytics</li>
                            <li><strong className="text-white/90">Brand Intelligence:</strong> Processing your Brand DNA data to ensure AI-generated content matches your brand identity</li>
                            <li><strong className="text-white/90">AI Model Routing:</strong> Selecting optimal AI models (Gemini, Claude, GPT-4o, Grok, Imagen) for each task</li>
                            <li><strong className="text-white/90">Platform Improvement:</strong> Analyzing usage patterns to optimize features and user experience</li>
                            <li><strong className="text-white/90">Communication:</strong> Sending service updates, feature announcements, and support responses</li>
                            <li><strong className="text-white/90">Security:</strong> Detecting fraud, preventing unauthorized access, and protecting platform integrity</li>
                            <li><strong className="text-white/90">Legal Compliance:</strong> Adhering to applicable laws, regulations, and legal processes</li>
                        </ul>
                    </section>

                    {/* 6 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">6. Data Sharing & Disclosure</h2>
                        <p className="leading-relaxed mb-3"><strong className="text-white/90">We do not sell, rent, or trade your personal information.</strong></p>
                        <p className="leading-relaxed mb-2">We may share information only in these circumstances:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">AI Model Providers:</strong> Content prompts and generation requests are sent to third-party AI providers (Google, Anthropic, OpenAI, xAI) to deliver services. We do not send personal account data to these providers.</li>
                            <li><strong className="text-white/90">Payment Processors:</strong> Razorpay processes payment transactions securely. We do not store credit card numbers.</li>
                            <li><strong className="text-white/90">Platform APIs:</strong> When you explicitly publish content, data is sent to the target platform (Meta, Instagram, YouTube, Shopify).</li>
                            <li><strong className="text-white/90">Legal Requirements:</strong> When required by law, court order, or governmental authority.</li>
                            <li><strong className="text-white/90">Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets.</li>
                        </ul>
                    </section>

                    {/* 7 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">7. Data Security</h2>
                        <p className="leading-relaxed mb-3">We implement industry-standard security measures to protect your data:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li>SSL/TLS encryption for all data in transit</li>
                            <li>Encrypted storage for API tokens, access keys, and sensitive credentials</li>
                            <li>HMAC signature verification for Shopify webhook payloads</li>
                            <li>Regular security audits and vulnerability assessments</li>
                            <li>Role-based access controls with team permission management</li>
                        </ul>
                        <p className="leading-relaxed mt-3 text-sm">
                            While we strive to protect your data, no electronic transmission or storage method is 100% secure. We cannot guarantee absolute security.
                        </p>
                    </section>

                    {/* 8 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">8. Cookies & Tracking</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Essential Cookies:</strong> Authentication, session management, and security</li>
                            <li><strong className="text-white/90">Functional Cookies:</strong> Remembering your preferences, active brand, and UI settings</li>
                            <li><strong className="text-white/90">Analytics Cookies:</strong> Understanding usage patterns to improve the platform</li>
                        </ul>
                        <p className="leading-relaxed mt-3 text-sm">
                            You can control cookies through your browser settings. Blocking essential cookies may prevent the platform from functioning properly.
                        </p>
                    </section>

                    {/* 9 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">9. Your Rights</h2>
                        <p className="leading-relaxed mb-3">Depending on your jurisdiction, you may have the right to:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Access:</strong> Request a copy of your personal data</li>
                            <li><strong className="text-white/90">Rectification:</strong> Request correction of inaccurate data</li>
                            <li><strong className="text-white/90">Deletion:</strong> Request deletion of your account and data (see Section 10)</li>
                            <li><strong className="text-white/90">Data Portability:</strong> Request your data in a machine-readable format</li>
                            <li><strong className="text-white/90">Opt-Out:</strong> Unsubscribe from marketing communications at any time</li>
                            <li><strong className="text-white/90">Disconnect:</strong> Revoke social media and third-party integrations via the Integrations tab</li>
                        </ul>
                        <p className="leading-relaxed mt-3 text-sm">
                            To exercise these rights, contact <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a>.
                        </p>
                    </section>

                    {/* 10 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">10. Data Deletion</h2>
                        <p className="leading-relaxed mb-3">You can request data deletion in two ways:</p>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Via Dashboard:</strong> Navigate to Settings → Integrations to disconnect social accounts and revoke access tokens immediately</li>
                            <li><strong className="text-white/90">Via Email:</strong> Send a request to <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a> with the subject "Data Deletion Request." We process requests within 48 hours.</li>
                        </ul>
                        <p className="leading-relaxed mt-3 text-sm">
                            You can also use our automated <Link to="/data-deletion" className="text-primary hover:underline">data deletion tool</Link>. Upon deletion, all generated content, brand identities, AI personas, and connectivity tokens are permanently removed.
                        </p>
                    </section>

                    {/* 11 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">11. Data Retention</h2>
                        <ul className="list-disc list-inside space-y-1.5 text-sm pl-2">
                            <li><strong className="text-white/90">Account Data:</strong> Retained while your account is active, deleted within 30 days of account deletion request</li>
                            <li><strong className="text-white/90">Generated Content:</strong> Stored until you delete it or close your account</li>
                            <li><strong className="text-white/90">Analytics Data:</strong> Aggregated and anonymized data may be retained indefinitely for platform improvement</li>
                            <li><strong className="text-white/90">Payment Records:</strong> Retained for up to 7 years for tax and legal compliance</li>
                        </ul>
                    </section>

                    {/* 12 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">12. Children's Privacy</h2>
                        <p className="leading-relaxed">
                            Mantram AI is not intended for individuals under the age of 18. We do not knowingly collect personal information from minors. If we discover that a minor has provided data, we will delete it immediately.
                        </p>
                    </section>

                    {/* 13 */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">13. Changes to This Policy</h2>
                        <p className="leading-relaxed">
                            We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date. For material changes, we will notify you via email or in-app notification. Continued use of Mantram AI after modifications constitutes acceptance of the updated policy.
                        </p>
                    </section>

                    {/* Contact */}
                    <section className="pt-6 border-t border-white/[0.05]">
                        <h2 className="text-xl font-bold text-white mb-3">14. Contact Us</h2>
                        <p className="leading-relaxed mb-3">If you have questions about this Privacy Policy or our data practices, contact us:</p>
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-[#48474c]/30">
                            <p className="text-sm"><strong className="text-white">Mantram AI</strong></p>
                            <p className="text-sm">Email: <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a></p>
                            <p className="text-sm">Privacy: <a href="mailto:privacy@mantram.ai" className="text-primary hover:underline">privacy@mantram.ai</a></p>
                        </div>
                    </section>
                </div>

                <div className="mt-12 text-center">
                    <Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Back to Home
                    </Link>
                </div>
            </div>
        </div>
    )
}

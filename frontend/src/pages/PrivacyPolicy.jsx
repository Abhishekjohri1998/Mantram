import DashboardLayout from '../components/DashboardLayout'

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-4">Privacy <span className="text-primary">Policy</span></h1>
                    <p className="text-slate-500">Last updated: March 6, 2026</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 space-y-8 border border-white/[0.05]">
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">1. Information We Collect</h2>
                        <p className="leading-relaxed">
                            We collect information you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, postal address, profile picture, payment method, and other information you choose to provide.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">2. Social Media Integration</h2>
                        <p className="leading-relaxed">
                            When you connect your social media accounts (e.g., Facebook, Instagram) to Mantram AI, we receive certain information from those platforms via their APIs. This includes account identifiers, profile information, and permissions necessary to publish content on your behalf. We only use this information to provide the publishing services you explicitly initiate.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">3. How We Use Information</h2>
                        <p className="leading-relaxed">
                            We use the information we collect to provide, maintain, and improve our services, develop new features, protect Mantram AI and our users, and provide personalized content.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">4. Data Deletion</h2>
                        <p className="leading-relaxed">
                            You have the right to request the deletion of your data. You can disconnect your social accounts at any time via the Integrations tab. To request full account deletion and removal of all associated data, please contact us at <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a> or use our automated data deletion tool.
                        </p>
                    </section>

                    <section className="pt-6 border-t border-white/[0.05]">
                        <p className="text-sm text-slate-500">
                            If you have any questions about this Privacy Policy, please contact us at support@mantram.ai
                        </p>
                    </section>
                </div>

                <div className="mt-12 text-center">
                    <a href="/" className="text-sm text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-sm">arrow_back</span>
                        Back to Home
                    </a>
                </div>
            </div>
        </div>
    )
}

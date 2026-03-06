export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-4">Terms of <span className="text-primary">Service</span></h1>
                    <p className="text-slate-500">Last updated: March 6, 2026</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 space-y-8 border border-white/[0.05]">
                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h2>
                        <p className="leading-relaxed">
                            By accessing or using Mantram AI, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this site.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">2. Use License</h2>
                        <p className="leading-relaxed">
                            Permission is granted to temporarily use the materials (information or software) on Mantram AI's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">3. AI-Generated Content</h2>
                        <p className="leading-relaxed">
                            Mantram AI provides tools for generating content using artificial intelligence. While we strive for accuracy and quality, we do not guarantee the correctness or legal compliance of any generated content. Users are responsible for reviewing and verifying all content before publication.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">4. Social Media Publishing</h2>
                        <p className="leading-relaxed">
                            When using our social media publishing features, you must comply with the terms of service of the respective platforms (e.g., Meta, Instagram). You agree not to use our services to publish prohibited, illegal, or harmful content.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-bold text-white mb-3">5. Termination</h2>
                        <p className="leading-relaxed">
                            We may terminate or suspend access to our service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                        </p>
                    </section>

                    <section className="pt-6 border-t border-white/[0.05]">
                        <p className="text-sm text-slate-500">
                            For any inquiries regarding these terms, please contact us at legal@mantram.ai
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

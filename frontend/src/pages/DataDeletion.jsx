import { useSearchParams } from "react-router-dom"
import SEOHead from '../components/SEOHead'

export default function DataDeletion() {
    const [searchParams] = useSearchParams()
    const code = searchParams.get('code')

    return (
        <div className="min-h-screen bg-[#08080C] text-slate-300 py-12 px-4 sm:px-6 lg:px-8">
            <SEOHead
                title="Data Deletion — Mantram AI"
                description="Request deletion of your Mantram AI account data, brand identities, generated content, and connected social media accounts. We process requests within 48 hours."
                canonical="/data-deletion"
                ogTitle="Data Deletion — Mantram AI"
                ogDescription="Request deletion of your Mantram AI account and all associated data."
                ogImage="https://mantram.ai/mantram-logo.png"
                aiSummary="Mantram AI Data Deletion page. Users can request deletion of their account, generated content, brand identities, AI personas, and social media connectivity tokens via dashboard or email. Requests processed within 48 hours."
            />
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-extrabold text-white mb-4">Data <span className="text-rose-500">Deletion</span></h1>
                    <p className="text-slate-500">Request account or platform data removal</p>
                </div>

                <div className="glass-panel rounded-3xl p-8 space-y-8 border border-white/[0.05]">
                    {code ? (
                        <div className="text-center py-8">
                            <div className="size-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                                <span className="material-symbols-outlined text-4xl text-emerald-500">check_circle</span>
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Request Received</h2>
                            <p className="text-slate-400 mb-6">Your data deletion request has been registered successfully.</p>
                            <div className="p-4 bg-white/[0.03] rounded-2xl border border-white/[0.05] inline-block">
                                <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Confirmation Code</p>
                                <p className="text-xl font-mono text-primary">{code}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            <section>
                                <h2 className="text-xl font-bold text-white mb-3">How to delete your data</h2>
                                <p className="leading-relaxed mb-4">
                                    At Mantram AI, we value your privacy. You can request the deletion of your account and all associated data in two ways:
                                </p>
                                <ul className="space-y-4">
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-primary">logout</span>
                                        <div>
                                            <p className="font-bold text-white text-sm">Via Dashboard</p>
                                            <p className="text-sm">Go to Settings &gt; Integrations and disconnect your social accounts. This removes our access tokens immediately.</p>
                                        </div>
                                    </li>
                                    <li className="flex gap-3">
                                        <span className="material-symbols-outlined text-primary">mail</span>
                                        <div>
                                            <p className="font-bold text-white text-sm">Via Email</p>
                                            <p className="text-sm">Send an email to <a href="mailto:support@mantram.ai" className="text-primary hover:underline">support@mantram.ai</a> with the subject "Data Deletion Request". We will process your request within 48 hours.</p>
                                        </div>
                                    </li>
                                </ul>
                            </section>

                            <section className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-2xl">
                                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined">warning</span>
                                    What happens when you delete data?
                                </h3>
                                <p className="text-sm leading-relaxed">
                                    This action is irreversible. All your generated content, connected brand identities, AI personas, and social media connectivity tokens will be permanently removed from our servers.
                                </p>
                            </section>
                        </>
                    )}
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

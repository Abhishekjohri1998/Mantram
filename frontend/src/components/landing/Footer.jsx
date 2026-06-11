import { Link } from 'react-router-dom'
import { BRAND, STUDIOS } from '../../data/studios'
import GlowThread from './GlowThread'

/**
 * Footer — also serves as a sitemap for crawlers, with internal links to
 * all 14 studio sub-pages so they're discoverable from every page.
 */
export default function Footer() {
    const planStudios = STUDIOS.filter(s => s.group === 'Plan')
    const createStudios = STUDIOS.filter(s => s.group === 'Create')
    const distStudios = STUDIOS.filter(s => s.group === 'Distribute')
    const optStudios = STUDIOS.filter(s => s.group === 'Optimize')

    return (
        <footer className="relative pt-16 pb-10 overflow-hidden" role="contentinfo">
            {/* ── GlowThread: replaces the static top border ── */}
            <div className="absolute top-0 left-0 right-0 pointer-events-none" aria-hidden="true">
                <GlowThread
                    d="M -100 38 C 640 12, 1280 64, 2100 28"
                    height={76}
                    speed={5.5}
                    dashLen={4}
                    gap={58}
                    opacity={0.28}
                    strokeW={1.5}
                    nodes={[
                        { x: 960, y: 38, r: 3.5, delay: 0 },
                    ]}
                />
            </div>
            <div className="max-w-7xl mx-auto px-4 md:px-6">
                <div className="grid md:grid-cols-7 gap-8 mb-12">
                    <div className="md:col-span-2">
                        <Link to="/" className="flex items-center gap-2.5 mb-4" aria-label="Mantram AI home">
                            <img src="/mantram-logo.png" alt="" className="size-9 rounded-xl" width="36" height="36" />
                            <span className="text-[var(--sys-text)] text-xl font-bold tracking-tight">
                                Mantram <span style={{ color: BRAND.primary }}>AI</span>
                            </span>
                        </Link>
                        <p className="text-xs leading-relaxed mb-5" style={{ color: BRAND.textMuted }}>
                            Mantram (Sanskrit: <em>mantra</em> — a phrase repeated until it becomes truth). Teach the machine your brand once. Let it repeat you, perfectly, everywhere.
                        </p>
                        <div className="flex gap-2">
                            <a href="https://twitter.com/mantramai" target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="size-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span className="text-xs" style={{ color: BRAND.textMuted }}>𝕏</span>
                            </a>
                            <a href="https://www.linkedin.com/company/mantram-ai" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="size-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span className="text-[10px] font-bold" style={{ color: BRAND.textMuted }}>in</span>
                            </a>
                        </div>
                    </div>

                    <FooterLinkGroup title="Plan" items={planStudios.map(s => ({ name: s.name, to: `/studio/${s.slug}` }))} />
                    <FooterLinkGroup title="Create" items={createStudios.map(s => ({ name: s.name, to: `/studio/${s.slug}` }))} />
                    <FooterLinkGroup title="Distribute" items={distStudios.map(s => ({ name: s.name, to: `/studio/${s.slug}` }))} />
                    <FooterLinkGroup title="Optimize" items={optStudios.map(s => ({ name: s.name, to: `/studio/${s.slug}` }))} />
                    <FooterLinkGroup
                        title="Resources"
                        items={[
                            { name: 'AEO Guide 2026', to: '/ai-search-optimization' },
                            { name: 'Privacy Policy', to: '/privacy-policy' },
                            { name: 'Terms', to: '/terms' },
                            { name: 'Data Deletion', to: '/data-deletion' },
                        ]}
                    />
                </div>

                <div className="pt-8 border-t flex flex-col md:flex-row md:items-center md:justify-between gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>
                        © {new Date().getFullYear()} Mantram AI. All rights reserved.
                    </p>
                    <div className="flex flex-wrap gap-5 text-xs" style={{ color: BRAND.textMuted }}>
                        <Link to="/privacy-policy" className="hover:text-[var(--sys-text)]">Privacy Policy</Link>
                        <Link to="/terms" className="hover:text-[var(--sys-text)]">Terms of Service</Link>
                        <Link to="/data-deletion" className="hover:text-[var(--sys-text)]">Data Deletion</Link>
                        <a href="mailto:support@mantram.ai" className="hover:text-[var(--sys-text)]">support@mantram.ai</a>
                    </div>
                </div>
            </div>
        </footer>
    )
}

function FooterLinkGroup({ title, items }) {
    return (
        <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] mb-4" style={{ color: BRAND.primary }}>
                {title}
            </h3>
            <ul className="space-y-2">
                {items.map((it) => (
                    <li key={it.to}>
                        <Link to={it.to} className="text-xs hover:text-[var(--sys-text)] transition-colors" style={{ color: BRAND.textMuted }}>
                            {it.name}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    )
}

import React, { useState, lazy, Suspense } from 'react'
import {
    FileText, Globe, Mail, BarChart2,
    Share2, Layers, Package, ChevronLeft,
    Sparkles, Loader2, CheckCircle2, Image as ImageIcon, User, Clock
} from 'lucide-react'
import { useBrand } from '../../../context/BrandContext'
import AvatarConfigPanel from '../tools/AvatarConfigPanel'
import PulseHistoryPanel from '../PulseHistoryPanel'

// Lazy load tools — only mount when selected
const AplusTool         = lazy(() => import('../tools/AplusTool'))
const QuickPostTool     = lazy(() => import('../tools/QuickPostTool'))
const DeckTool          = lazy(() => import('../tools/DeckTool'))
const EmailTool         = lazy(() => import('../tools/EmailTool'))
const LandingPageTool   = lazy(() => import('../tools/LandingPageTool'))
const SocialKitTool     = lazy(() => import('../tools/SocialKitTool'))
const BrochureTool      = lazy(() => import('../tools/BrochureTool'))

const CATEGORIES = [
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'social',      label: 'Social Media' },
    { id: 'print',       label: 'Print & PDF'  },
    { id: 'digital',     label: 'Digital'      },
]

const TOOLS = [
    {
        id:       'aplus',
        label:    'A+ Content',
        meta:     'Amazon A+',
        desc:     'Premium Amazon A+ listing with AI imagery — follows latest Amazon guidelines',
        category: 'marketplace',
        icon:     Package,
        credits:  8,
        badge:    'A+ Amazon',
        Component: AplusTool,
    },
    {
        id:       'aplusbasic',
        label:    'A+ Basic (A)',
        meta:     'Amazon A',
        desc:     'Standard Amazon A content — essential selling points with brand story',
        category: 'marketplace',
        icon:     Package,
        credits:  5,
        badge:    'A Amazon',
        Component: AplusTool,
        variant:  'basic',
    },
    {
        id:       'social-kit',
        label:    'Social Kit',
        meta:     'Multi-Platform',
        desc:     'Instagram, Facebook, Twitter, LinkedIn, Pinterest — images + captions in one batch',
        category: 'social',
        icon:     Share2,
        credits:  15,
        badge:    '6 Platforms',
        Component: SocialKitTool,
    },
    {
        id:       'quick-post',
        label:    'Quick Post',
        meta:     'Single Post',
        desc:     'Fast single-platform post — pick one size and go',
        category: 'social',
        icon:     ImageIcon,
        credits:  3,
        Component: QuickPostTool,
    },
    {
        id:       'brochure',
        label:    'Brochure',
        meta:     'A4 · 2-Sided',
        desc:     'Single-page front+back brochure — HTML with PDF export (print-ready)',
        category: 'print',
        icon:     Layers,
        credits:  12,
        badge:    'PDF Export',
        Component: BrochureTool,
    },
    {
        id:       'deck',
        label:    'Pitch Deck',
        meta:     'Presentation',
        desc:     'Professional product/brand presentation with AI images on every slide',
        category: 'digital',
        icon:     BarChart2,
        credits:  10,
        Component: DeckTool,
    },
    {
        id:       'landing-page',
        label:    'Landing Page',
        meta:     'Web Page',
        desc:     'Full product landing page with hero, features, testimonials & CTA — hosted',
        category: 'digital',
        icon:     Globe,
        credits:  12,
        Component: LandingPageTool,
    },
    {
        id:       'email',
        label:    'Email Campaign',
        meta:     'HTML Email',
        desc:     'Responsive HTML email template — product launch, promo, or feature announcement',
        category: 'digital',
        icon:     Mail,
        credits:  6,
        Component: EmailTool,
    },
]

export default function Phase3Creation({ productContext, selectedMoodId, onBack, avatarConfig, onAvatarConfigChange }) {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    const [activeCategory, setActiveCategory] = useState('marketplace')
    const [activeTool, setActiveTool]         = useState(null)
    const [activeView, setActiveView]         = useState('create') // 'create' | 'history'

    const filteredTools = TOOLS.filter(t => t.category === activeCategory)
    const activeToolMeta = TOOLS.find(t => t.id === activeTool)

    // Shared context passed to every tool
    const sharedContext = productContext
        ? {
            productDNA:            productContext.productDNA,
            productData:           productContext.productData,
            productImages:         productContext.productImages || [],
            productUrl:            productContext.productUrl,
            selectedMood:          selectedMoodId || productContext.selectedMood,
            productMoodDirections: productContext.productMoodDirections,
            moodImages:            productContext.moodImages,
            designContext:         productContext.designContext,
            productName:           productContext.productData?.title || productContext.productDNA?.productCategory,
            palette:               productContext.productDNA?.dominantColors || [],
            moodLabel:             (productContext.productMoodDirections?.[selectedMoodId] || productContext.productMoodDirections?.[productContext.selectedMood])?.label,
        }
        : null

    // Active product bar info
    const productName    = sharedContext?.productName || 'Product'
    const productThumb   = productContext?.productImages?.[0]
    const moodLabel      = sharedContext?.moodLabel || 'Mood Selected'
    const moodColor      = (productContext?.productDNA?.dominantColors || [])[0]?.hex || '#7c3aed'

    // Handle history restore — switch to create view and pre-select the matching tool
    const handleHistoryRestore = (historyItem) => {
        const toolId = historyItem.tool === 'page' ? 'landing-page' : historyItem.tool
        setActiveView('create')
        setActiveTool(toolId)
    }

    return (
        <div className="ps-slide-up">
            {/* Active product context bar */}
            {sharedContext && (
                <div className="ps-active-bar">
                    <div className="ps-active-product">
                        {productThumb && (
                            <img src={productThumb} alt={productName} className="ps-active-thumb" onError={e => e.target.style.display='none'} />
                        )}
                        <div style={{ minWidth: 0 }}>
                            <div className="ps-active-name">{productName}</div>
                            <div className="ps-active-mood">
                                <div className="ps-active-mood-dot" style={{ background: moodColor }} />
                                {moodLabel}
                                <span style={{ color: 'var(--sys-primary)', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 6 }}>
                                    <CheckCircle2 size={10} /> Colors Locked
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Avatar config compact toggle — session-wide */}
                    {onAvatarConfigChange && (
                        <AvatarConfigPanel
                            config={avatarConfig}
                            onChange={onAvatarConfigChange}
                            compact={true}
                        />
                    )}

                    {/* Back */}
                    <button className="ps-btn-ghost" onClick={onBack} style={{ flexShrink: 0 }}>
                        <ChevronLeft size={13} /> Change Mood
                    </button>
                </div>
            )}

            {/* ── Create / History tab switcher ── */}
            {!activeTool && (
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--sys-border)', paddingBottom: 0 }}>
                    {[{ id: 'create', label: 'Create', Icon: Sparkles }, { id: 'history', label: 'History', Icon: Clock }].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveView(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '9px 16px', fontSize: 13, fontWeight: 700,
                                background: 'none', border: 'none', cursor: 'pointer',
                                borderBottom: `2px solid ${activeView === tab.id ? 'var(--sys-primary)' : 'transparent'}`,
                                color: activeView === tab.id ? 'var(--sys-primary)' : 'var(--sys-text-muted)',
                                marginBottom: -1, transition: 'color 0.15s, border-color 0.15s',
                            }}
                        >
                            <tab.Icon size={13} /> {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Tool expanded panel or History Panel */}
            {activeTool && activeToolMeta ? (
                <div>
                    <div className="ps-tool-panel">
                        <div className="ps-tool-panel-header">
                            <button
                                className="ps-btn-ghost"
                                style={{ padding: '5px 10px', fontSize: 12 }}
                                onClick={() => setActiveTool(null)}
                            >
                                <ChevronLeft size={13} /> All Tools
                            </button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="ps-tool-icon-wrap" style={{ marginBottom: 0 }}>
                                    <activeToolMeta.icon size={15} />
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sys-text)', fontFamily: 'var(--font-display)' }}>
                                        {activeToolMeta.label}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--sys-text-muted)' }}>{activeToolMeta.meta} · {activeToolMeta.credits} credits</div>
                                </div>
                            </div>
                        </div>
                        <div className="ps-tool-panel-body">
                            <Suspense fallback={
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, color: 'var(--sys-text-muted)', fontSize: 13 }}>
                                    <Loader2 size={15} className="ps-spin" /> Loading tool…
                                </div>
                            }>
                                <activeToolMeta.Component
                                    sharedContext={sharedContext}
                                    brandId={brandId}
                                    variant={activeToolMeta.variant}
                                    avatarConfig={avatarConfig}
                                    onAvatarConfigChange={onAvatarConfigChange}
                                />
                            </Suspense>
                        </div>
                    </div>
                </div>
            ) : activeView === 'history' ? (
                /* History Panel */
                <PulseHistoryPanel onRestore={handleHistoryRestore} />
            ) : (
                /* Tool browser */
                <div>
                    {/* Section header */}
                    <div className="ps-section-header">
                        <div className="ps-section-icon">
                            <Sparkles size={17} />
                        </div>
                        <div>
                            <div className="ps-section-title">Creation Hub</div>
                            <div className="ps-section-sub">Every asset — tuned to your product's DNA and locked color palette</div>
                        </div>
                    </div>

                    {/* Category tabs */}
                    <div className="ps-category-tabs">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`ps-cat-tab ${activeCategory === cat.id ? 'active' : ''}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Tool cards */}
                    <div className="ps-tool-grid">
                        {filteredTools.map(tool => {
                            const Icon = tool.icon
                            return (
                                <div
                                    key={tool.id}
                                    className={`ps-tool-card ${activeTool === tool.id ? 'active' : ''}`}
                                    onClick={() => setActiveTool(tool.id)}
                                >
                                    {tool.badge && (
                                        <div className="ps-tool-card-badge">{tool.badge}</div>
                                    )}
                                    <div className="ps-tool-icon-wrap">
                                        <Icon size={16} />
                                    </div>
                                    <div className="ps-tool-label">{tool.label}</div>
                                    <div className="ps-tool-meta">{tool.meta}</div>
                                    <div className="ps-tool-desc">{tool.desc}</div>
                                    <div style={{ marginTop: 10, fontSize: 10, fontWeight: 700, color: 'var(--sys-primary)', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.8 }}>
                                        <Sparkles size={10} /> {tool.credits} credits
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

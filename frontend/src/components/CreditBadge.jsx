import { useState } from 'react'
import { useCredits } from '../context/CreditContext'

const ACTION_LABELS = {
    content: 'Content Generation',
    contentRefine: 'Content Refine',
    creative: 'Creative Image',
    photoshoot: 'AI Photoshoot',
    seoHealthCheck: 'SEO Health Check',
    seoTraffic: 'SEO Traffic Analysis',
    seoCompetitors: 'SEO Competitor Analysis',
    seoAiVisibility: 'SEO AI Visibility',
    seoAsk: 'SEO Ask',
    seoAuditPage: 'SEO Audit',
    seoCompetitorDiscover: 'SEO Discover',
    brainstorm: 'Brainstorm Ideas',
    brainstormRefine: 'Brainstorm Refine',
    brainstormChat: 'Brainstorm Chat',
    brainstormScreenplay: 'Screenplay',
    trendRefresh: 'Trend Refresh',
    promptEnhance: 'AI Prompt Enhancement',
    imageEnhance: 'AI Image Enhancement',
}

/**
 * CreditBadge — shows credit cost as a small inline pill next to button text.
 * Always visible (even for unlimited users) so users always know the cost.
 */
export function CreditBadge({ action, className = '' }) {
    const { costs, balance } = useCredits()
    if (!costs || !action) return null
    const cost = costs[action]
    if (!cost && cost !== 0) return null

    const unlimited = balance?.unlimited
    const canAfford = unlimited || !balance || balance.remaining >= cost

    return (
        <span className={`inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded-md text-xs font-bold transition-all ${unlimited
                ? 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)]'
                : canAfford
                    ? 'bg-[var(--sys-primary-dim)] text-primary'
                    : 'bg-[var(--sys-primary-dim)] text-primary'
            } ${className}`}>
            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>toll</span>
            {cost}
        </span>
    )
}

/**
 * CreditTooltipWrapper — wraps a button and shows a tooltip on hover with credit cost info.
 * Usage: <CreditTooltipWrapper action="content"><button>Generate</button></CreditTooltipWrapper>
 */
export function CreditTooltipWrapper({ action, children, position = 'top', className = '' }) {
    const [show, setShow] = useState(false)
    const { costs, balance } = useCredits()

    if (!costs || !action) return children

    const cost = costs[action]
    if (!cost && cost !== 0) return children

    const unlimited = balance?.unlimited
    const canAfford = unlimited || !balance || balance.remaining >= cost
    const label = ACTION_LABELS[action] || action

    const positionClasses = {
        top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
        bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
        left: 'right-full top-1/2 -translate-y-1/2 mr-2',
        right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    }

    return (
        <div
            className={`relative inline-flex ${className}`}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
        >
            {children}
            {show && (
                <div className={`absolute ${positionClasses[position]} z-50 pointer-events-none animate-fade-in`}
                    style={{ animationDuration: '150ms' }}>
                    <div className={`px-3 py-2 rounded-xl text-[11px] font-medium whitespace-nowrap shadow-2xl border ${!canAfford
                            ? 'bg-rose-950/90 border-[var(--sys-border)] text-[var(--sys-primary)]'
                            : 'bg-[#08080C]/95 border-[var(--sys-border)] text-[var(--sys-text)]'
                        }`}>
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: canAfford ? '#a78bfa' : '#fb7185' }}>toll</span>
                            <span>
                                <strong className={canAfford ? 'text-[var(--sys-text)]' : 'text-[var(--sys-primary)]'}>{cost} {cost === 1 ? 'credit' : 'credits'}</strong>
                                <span className="text-[var(--sys-text-muted)] ml-1">for {label}</span>
                            </span>
                        </div>
                        {!canAfford && (
                            <div className="text-primary text-xs mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>warning</span>
                                Insufficient credits ({balance?.remaining || 0} remaining)
                            </div>
                        )}
                        {unlimited && (
                            <div className="text-primary text-xs mt-1 flex items-center gap-1">
                                <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>all_inclusive</span>
                                Unlimited plan — no deduction
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * Hook: get the cost for a specific action
 */
export function useCreditCost(action) {
    const { costs, balance } = useCredits()
    if (!costs || !action) return { cost: null, canAfford: true, unlimited: balance?.unlimited }
    const cost = costs[action] || 0
    return {
        cost,
        canAfford: balance ? balance.remaining >= cost : true,
        unlimited: balance?.unlimited,
        remaining: balance?.remaining,
    }
}

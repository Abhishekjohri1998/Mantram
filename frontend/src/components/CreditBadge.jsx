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
    monthlyStrategy: 'Monthly Strategy Calendar',
    monthlyBrief: 'Brief Regeneration',
}

/**
 * CreditBadge — shows credit cost as a small inline pill next to button text.
 * Always visible (even for unlimited users) so users always know the cost.
 */
export function CreditBadge({ action, className = '', model, resolution = '1K', quality = 'Medium', count }) {
    const { costs, balance } = useCredits()
    if (!costs || !action) return null
    let cost = costs[action]
    if (!cost && cost !== 0) return null

    if (cost === 'dynamic') {
        if (['creative', 'photoshoot', 'adCreative', 'canvasGenerate', 'avatarGenerate'].includes(action)) {
            if (!model && ['adCreative', 'canvasGenerate'].includes(action)) {
                const fallbacks = { adCreative: 8, canvasGenerate: 3 };
                cost = fallbacks[action] || 8;
            } else {
                cost = calculateFrontendImageCredits(model, resolution, quality, count, action);
            }
        } else {
            cost = 8; // fallback
        }
    }

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
export function CreditTooltipWrapper({ action, children, position = 'top', className = '', model, resolution = '1K', quality = 'Medium', count }) {
    const [show, setShow] = useState(false)
    const { costs, balance } = useCredits()

    if (!costs || !action) return children

    let cost = costs[action]
    if (!cost && cost !== 0) return children

    if (cost === 'dynamic') {
        if (['creative', 'photoshoot', 'adCreative', 'canvasGenerate', 'avatarGenerate'].includes(action)) {
            if (!model && ['adCreative', 'canvasGenerate'].includes(action)) {
                const fallbacks = { adCreative: 8, canvasGenerate: 3 };
                cost = fallbacks[action] || 8;
            } else {
                cost = calculateFrontendImageCredits(model, resolution, quality, count, action);
            }
        } else {
            cost = 8; // fallback
        }
    }

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

const RESOLUTION_MULTIPLIERS = { '1K': 1.0, '2K': 1.5, '4K': 2.5 };
const QUALITY_MULTIPLIERS = { 'Low': 0.5, 'Medium': 1.0, 'High': 1.8 };

export function calculateFrontendImageCredits(modelId = 'nano-banana-2-t2i', resolution = '1K', quality = 'Medium', count, action = 'creative') {
    let res = resolution || '1K';
    if (res === '512px') res = '1K';
    
    let qual = quality || 'Medium';
    if (qual === 'fast' || qual === 'speed') qual = 'Low';
    if (qual === 'quality' || qual === 'pro') qual = 'High';

    res = res.toUpperCase();
    qual = qual.charAt(0).toUpperCase() + qual.slice(1).toLowerCase();

    const resMult = RESOLUTION_MULTIPLIERS[res] || 1.0;
    const qualMult = QUALITY_MULTIPLIERS[qual] || 1.0;
    const combinedMult = resMult * qualMult;

    const modelLookup = {
        'nano-banana-2-lite-edit-dev': 0.028,
        'nano-banana-2-lite-t2i-dev': 0.028,
        'nano-banana-2-lite-edit': 0.04,
        'nano-banana-2-lite-t2i': 0.04,
        'nanobanana-lite': 0.04,
        'mai-image-2.5-flash-t2i': 0.03,
        'mai-image-2.5-edit': 0.058,
        'mai-image-2.5-t2i': 0.05,
        'youchuan-8.1-remove-bg': 0.086,
        'youchuan-8.1-style-transfer': 0.129,
        'youchuan-8.1-blend': 0.086,
        'youchuan-8.1-i2i': 0.086,
        'youchuan-8.1-t2i': 0.086,
        'nano-banana-2-ref-image': 0.08,
        'nano-banana-2-ref-image-dev': 0.04,
        'grok-imagine-quality-t2i': 0.05,
        'grok-imagine-quality-edit': 0.05,
        'openai-gpt-image-2-t2i': 0.009,
        'openai-gpt-image-2-edit': 0.01,
        'gpt-image-2': 0.01,
        'baidu-ernie-turbo-t2i': 0.0,
        'wan-2.7-t2i': 0.03,
        'wan-2.7-i2i': 0.03,
        'wan-2.7-pro-t2i': 0.075,
        'wan-2.7-pro-i2i': 0.075,
        'nano-banana-2-t2i-dev': 0.04,
        'nano-banana-2-t2i': 0.08,
        'nanobanana-2': 0.08,
        'nano-banana-2-edit-dev': 0.04,
        'nano-banana-2-edit': 0.08,
        'qwen-image-2.0-t2i': 0.028,
        'qwen-image-2.0-edit': 0.028,
        'qwen-image-2.0-pro-edit': 0.06,
        'qwen-image-2.0-pro-t2i': 0.06,
        'seedream-5.0-lite-edit-seq': 0.032,
        'seedream-5.0-lite-seq': 0.032,
        'seedream-5.0-lite-edit': 0.032,
        'seedream-5.0-lite': 0.032,
        'openai-gpt-image-1.5-t2i': 0.008,
        'openai-gpt-image-1.5-edit': 0.008,
        'qwen-image-edit-plus-20251215': 0.021,
        'wan-2.6-i2i': 0.021,
        'z-image-turbo': 0.005,
        'openai-gpt-image-1-t2i': 0.009,
        'openai-gpt-image-1-edit': 0.009,
        'openai-gpt-image-1-mini-t2i': 0.004,
        'openai-gpt-image-1-mini-edit': 0.004,
        'seedream-4.5': 0.036,
        'seedream-4.5-edit': 0.036,
        'seedream-4.5-seq': 0.036,
        'seedream-4.5-edit-seq': 0.036,
        'qwen-image-edit-base': 0.032,
        'nano-banana-pro-t2i-ultra': 0.15,
        'nano-banana-pro-edit-ultra': 0.15,
        'nano-banana-pro-t2i': 0.14,
        'nanobanana-pro': 0.14,
        'qwen-image-t2i-max': 0.052,
        'qwen-image-t2i-plus': 0.021,
        'nano-banana-pro-edit': 0.14,
        'grok-imagine-image-edit': 0.02,
        'grok-imagine-image-t2i': 0.02,
        'gpt-image-2-dev-edit': 0.005,
        'wan-2.5-image-edit': 0.021,
        'gpt-image-2-dev-t2i': 0.004,
        'wan-2.5-t2i': 0.021,
        'seedream-v4': 0.027,
        'seedream-v4-seq': 0.027,
        'nano-banana-pro-t2i-dev': 0.07,
        'nano-banana-t2i-dev': 0.019,
        'seedream-v4-edit': 0.027,
        'qwen-image-edit-std': 0.032,
        'qwen-image-edit-plus': 0.021,
        'wan-2.6-t2i': 0.021,
        'nano-banana-pro-edit-dev': 0.07,
        'nano-banana-edit-dev': 0.019,
        'seedream-v4-edit-seq': 0.027,
        'nano-banana-t2i': 0.038,
        'nano-banana-edit': 0.038,
        'imagen3': 0.04,
        'imagen3-fast': 0.02,
        'qwen-image-t2i': 0.024,
        'imagen4-fast': 0.02,
        'flux-dev': 0.012,
        'flux-kontext-dev': 0.025,
        'imagen4-ultra': 0.06,
        'imagen4': 0.04,
        'flux-kontext-dev-lora': 0.03,
        'flux-schnell': 0.003,
        'mai-image-2.5-flash-edit': 0.038,
        'flux.2-flex-edit': 0.05,
        'flux.2-flex-t2i': 0.05,
        'flux.2-pro-edit': 0.03,
        'flux.2-pro-t2i': 0.03,
        'flux-dev-lora': 0.015
    };

    const normalizedModel = (modelId || '').toLowerCase().trim();
    const baseUsd = modelLookup[normalizedModel] !== undefined ? modelLookup[normalizedModel] : 0.04;
    
    const usdPerPicScaled = baseUsd * combinedMult;
    if (usdPerPicScaled === 0) return 0;

    const exRate = 95.56;
    const margin = 60;
    const creditPrice = 5;

    const inrPerPic = usdPerPicScaled * exRate;
    const suggestedRetailPerPic = inrPerPic / (1 - (margin / 100));
    
    let defaultCount = 1;
    if (action === 'photoshoot') defaultCount = 4;
    else if (action === 'avatarGenerate') defaultCount = 3;
    
    const finalCount = count !== undefined ? count : defaultCount;
    const estCreditsPerPic = Math.ceil(suggestedRetailPerPic / creditPrice);

    return Math.max(1, estCreditsPerPic * finalCount);
}

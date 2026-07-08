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
        } else if (['videoGenerate', 'storyboardAnimate', 'storyboardAnimateLongForm'].includes(action)) {
            cost = calculateFrontendVideoCredits(model, resolution, count || 5);
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
        } else if (['videoGenerate', 'storyboardAnimate', 'storyboardAnimateLongForm'].includes(action)) {
            cost = calculateFrontendVideoCredits(model, resolution, count || 5);
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

export function calculateFrontendVideoCredits(modelId = 'seedance-2.0-fast-i2v', resolution = '1080p', duration = 5) {
    let resolvedModelId = modelId || 'seedance-2.0-fast-i2v';
    const aliases = {
        'seedance-2.0-fast': 'seedance-2.0-fast-i2v',
        'seedance-2.0': 'seedance-2.0-i2v',
        'veo-3.1-fast': 'veo-3.1-fast-i2v',
        'veo-3.1': 'veo-3.1-i2v',
        'kling-3.0-turbo': 'kling-3.0-turbo-i2v',
        'grok-imagine': 'grok-imagine-1.5-i2v'
    };
    if (aliases[resolvedModelId]) {
        resolvedModelId = aliases[resolvedModelId];
    }

    const videoModelLookup = {
        'seedance-2.0-mini-r2v': 0.045,
        'seedance-2.0-mini-i2v': 0.045,
        'seedance-2.0-mini-t2v': 0.045,
        'happyhorse-1.1-t2v': 0.14,
        'happyhorse-1.1-i2v': 0.14,
        'gemini-omni-flash-i2v': 0.13,
        'gemini-omni-flash-edit': 0.14,
        'gemini-omni-flash-t2v': 0.125,
        'gemini-omni-flash-r2v-dev': 0.12,
        'avatar-omni-human-1.5': 0.06,
        'kling-3.0-turbo-i2v': 0.095,
        'kling-3.0-turbo-t2v': 0.095,
        'kling-o3-4k-i2v': 0.357,
        'kling-o3-4k-t2v': 0.357,
        'youchuan-8.1': 0.086,
        'grok-imagine-1.5-i2v': 0.08,
        'gemini-omni-flash-i2v-dev': 0.112,
        'gemini-omni-flash-t2v-dev': 0.112,
        'happyhorse-1.0-t2v': 0.14,
        'happyhorse-1.0-i2v': 0.14,
        'happyhorse-1.0-edit': 0.14,
        'seedance-2.0-t2v': 0.09,
        'seedance-2.0-i2v': 0.09,
        'seedance-2.0-r2v': 0.09,
        'seedance-2.0-fast-t2v': 0.072,
        'seedance-2.0-fast-i2v': 0.072,
        'seedance-2.0-fast-r2v': 0.072,
        'wan-2.7-t2v': 0.10,
        'wan-2.7-i2v': 0.10,
        'wan-2.7-r2v': 0.10,
        'wan-2.7-edit': 0.10,
        'veo-3.1-lite-t2v': 0.05,
        'veo-3.1-lite-start-end': 0.05,
        'veo-3.1-lite-i2v': 0.05,
        'vidu-q3-mix-r2v': 0.106,
        'vidu-q3-r2v': 0.042,
        'wan-2.2-turbo-spicy-lora': 0.026,
        'wan-2.2-turbo-spicy-i2v': 0.02,
        'veo-3.1-fast-i2v': 0.08,
        'veo-3.1-fast-t2v': 0.08,
        'veo-3.1-i2v': 0.20,
        'veo-3.1-r2v': 0.20,
        'veo-3.1-t2v': 0.20,
        'grok-imagine-t2v': 0.05,
        'grok-imagine-i2v': 0.05,
        'grok-imagine-r2v': 0.05,
        'grok-imagine-extend': 0.07,
        'grok-imagine-edit': 0.07,
        'wan-2.2-turbo-i2v': 0.02,
        'wan-2.2-turbo-infinite': 0.02,
        'wan-2.2-turbo-infinite-lora': 0.026,
        'wan-2.2-turbo-spicy-infinite': 0.02,
        'wan-2.2-turbo-spicy-infinite-lora': 0.026,
        'wan-2.2-i2v': 0.03,
        'wan-2.2-i2v-lora': 0.04,
        'wan-2.2-spicy-i2v-lora': 0.04,
        'wan-2.2-spicy-i2v': 0.03,
        'video-upscaler': 0.018,
        'vidu-q3-pro-start-end': 0.042,
        'vidu-q3-turbo-i2v': 0.034,
        'vidu-q3-turbo-start-end': 0.034,
        'vidu-q3-turbo-t2v': 0.034,
        'kling-v3.0-4k-i2v': 0.357,
        'kling-v3.0-std-i2v': 0.071,
        'kling-v3.0-pro-i2v': 0.095,
        'kling-v3.0-pro-t2v': 0.095,
        'kling-v3.0-4k-t2v': 0.357,
        'kling-v3.0-std-t2v': 0.071,
        'vidu-q3-pro-i2v': 0.042,
        'vidu-q3-pro-t2v': 0.042,
        'kling-2.6-pro-avatar': 0.095,
        'kling-2.6-std-avatar': 0.048,
        'kling-2.6-pro-motion': 0.095,
        'kling-2.6-std-motion': 0.06,
        'wan-2.6-i2v-flash': 0.018,
        'seedance-1.5-pro-i2v': 0.047,
        'seedance-1.5-pro-t2v': 0.047,
        'seedance-1.5-pro-i2v-fast': 0.018,
        'wan-2.6-i2v': 0.07,
        'wan-2.6-v2v': 0.07,
        'wan-2.6-t2v': 0.07,
        'kling-o3-pro-edit': 0.143,
        'kling-o3-pro-r2v': 0.095,
        'kling-o3-pro-i2v': 0.095,
        'kling-o3-pro-t2v': 0.095,
        'seedance-1.5-pro-fast-t2v': 0.018,
        'kling-2.6-pro-t2v': 0.06,
        'kling-2.6-pro-i2v': 0.06,
        'kling-o3-std-edit': 0.107,
        'kling-o3-std-r2v': 0.071,
        'kling-o3-std-i2v': 0.071,
        'kling-o3-std-t2v': 0.071,
        'kling-o1-i2v': 0.095,
        'kling-o1-t2v': 0.095,
        'pixverse-v6-extend': 0.025,
        'pixverse-c1-i2v': 0.03,
        'pixverse-c1-start-end': 0.03,
        'pixverse-v6-t2v': 0.025,
        'pixverse-v6-i2v': 0.025
    };

    const baseUsdPerSec = videoModelLookup[resolvedModelId] !== undefined ? videoModelLookup[resolvedModelId] : 0.072;
    
    const RESOLUTION_MULTIPLIERS = {
        '480p': 0.5,
        '720p': 0.7,
        '1080p': 1.0,
        '4k': 2.0
    };

    let resKey = (resolution || '1080p').toLowerCase().trim();
    if (resKey.includes('512') || resKey.includes('480')) resKey = '480p';
    else if (resKey.includes('720')) resKey = '720p';
    else if (resKey.includes('1080')) resKey = '1080p';
    else if (resKey.includes('4k') || resKey.includes('2160') || resKey.includes('4096')) resKey = '4k';
    else resKey = '1080p';

    const resMult = RESOLUTION_MULTIPLIERS[resKey] || 1.0;
    const usdPerSecScaled = baseUsdPerSec * resMult;
    
    if (usdPerSecScaled === 0) return 0;

    const exRate = 95.56;
    const margin = 60;
    const creditPrice = 5;

    const inrPerSec = usdPerSecScaled * exRate;
    const suggestedRetailPerSec = inrPerSec / (1 - (margin / 100));
    
    const estCreditsPerSec = Math.ceil(suggestedRetailPerSec / creditPrice);

    return Math.max(1, estCreditsPerSec * duration);
}

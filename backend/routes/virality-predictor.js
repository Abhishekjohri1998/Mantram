/**
 * Virality Predictor Route — /api/virality/*
 *
 * 3-model pipeline:
 *   1. Gemini 2.5 Pro / 3.x  — Native video & image analysis (hook, pacing, emotion, visual quality)
 *   2. Grok 3                 — Real-time web research (what's going viral in this brand's category RIGHT NOW)
 *   3. Claude Sonnet 4        — Synthesises both streams → structured virality score map + tips
 *
 * Credit cost: 3 credits (viralityPredict)
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { getAIRouter } from '../ai/router.js';
import { isGrokAvailable } from '../services/grokTrends.js';

const router = Router();

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
const GROK_BASE_URL = 'https://api.x.ai/v1';

// ── Gemini Native Video/Image Analysis ─────────────────────────────────────
async function analyzeContentWithGemini(contentType, mediaUrl, mediaBase64, platform, brandDNA) {
    // Build media parts — Gemini 2.5 Flash handles video URLs and base64 natively
    const mediaParts = [];
    if (mediaUrl) {
        if (contentType === 'video') {
            mediaParts.push({ fileData: { fileUri: mediaUrl, mimeType: 'video/mp4' } });
        } else {
            // Detect image MIME from URL extension; fall back to jpeg
            const ext = mediaUrl.split('?')[0].split('.').pop().toLowerCase();
            const mimeMap = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
            const mimeType = mimeMap[ext] || 'image/jpeg';
            mediaParts.push({ fileData: { fileUri: mediaUrl, mimeType } });
        }
    } else if (mediaBase64) {
        const mimeType = contentType === 'video' ? 'video/mp4' : 'image/jpeg';
        mediaParts.push({ inlineData: { data: mediaBase64, mimeType } });
    }

    const brandContext = brandDNA ? `
Brand: ${brandDNA.name || 'Unknown'}
Category/Industry: ${brandDNA.industry || 'General'}
Target Audience: ${brandDNA.targetAudience || 'General audience'}
Brand Voice: ${brandDNA.voice?.personality || 'Not specified'}
Country: ${brandDNA.country || 'India'}` : 'No brand context provided.';

    const isVideo = contentType === 'video';

    const systemPrompt = `You are a world-class social media content analyst and virality expert.
You specialize in identifying viral content patterns across Instagram, TikTok, YouTube Shorts, and LinkedIn.
Your analysis is data-driven, specific, and actionable — not generic advice.

Today is ${new Date().toISOString().split('T')[0]}.`;

    const userPrompt = isVideo ? `Analyze this ${contentType} for virality potential on ${platform || 'social media'}.

${brandContext}

Perform a DEEP ANALYSIS covering all of the following dimensions:

**VIDEO ANALYSIS REQUIREMENTS:**
1. HOOK STRENGTH (0-100): Does the first 0-3 seconds demand attention? Is there visual movement, curiosity gap, or bold statement?
2. PACING & RHYTHM: Cut frequency, motion speed, transitions — does it hold attention throughout?
3. NARRATIVE ARC: Is there a clear problem → tension → resolution / before → after arc?
4. EMOTIONAL PULL (0-100): Does it trigger a shareable emotion — joy, surprise, awe, curiosity, relatability?
5. VISUAL QUALITY (0-100): Lighting, composition, color grading, text overlays, brand visibility
6. AUDIO ANALYSIS: Music sync, voiceover clarity, sound design — does audio amplify the visual?
7. RETENTION SIGNALS: Are there any drop-off risk moments (long static shots, slow pacing, unclear message)?
8. PLATFORM FIT (0-100): Does the format, length, and style match the target platform's algorithm preferences?
9. BRAND CLARITY (0-100): Is the brand message clear without being overly salesy?
10. TREND ALIGNMENT ESTIMATE (0-100): Based on the visual style, format, and energy — how aligned is this with current social media trends?
11. SPECIFIC TIMESTAMPS: Call out exact moments that are strongest and weakest for virality.

Respond ONLY in valid JSON matching this exact schema:
{
  "contentType": "video",
  "geminiAnalysis": {
    "hookStrength": 0-100,
    "emotionalPull": 0-100,
    "visualQuality": 0-100,
    "platformFit": 0-100,
    "brandClarity": 0-100,
    "trendAlignmentEstimate": 0-100,
    "hookDescription": "What happens in first 3 seconds and why it works or doesn't",
    "pacingAssessment": "Description of pacing and rhythm",
    "narrativeArc": "Assessment of storytelling structure",
    "audioAnalysis": "Music, voiceover, and sound design evaluation",
    "retentionRisks": ["Specific drop-off risk moments or weaknesses"],
    "strongestMoments": ["Strongest moments for engagement"],
    "emotionTriggered": "Primary emotion this content triggers",
    "visualStyleDescription": "Overall visual style, color palette, energy",
    "formatAssessment": "Is this the right format (reel, short, carousel) for the message?",
    "platformRecommendations": ["instagram_reels", "tiktok", "youtube_shorts", "linkedin"]
  }
}` : `Analyze this image for virality potential on ${platform || 'social media'}.

${brandContext}

Perform a DEEP VISUAL ANALYSIS:
1. HOOK STRENGTH (0-100): Does the image stop the scroll instantly? Bold visual, faces, contrast, intrigue?
2. EMOTIONAL PULL (0-100): What emotion does this trigger — joy, aspiration, surprise, relatability?
3. VISUAL QUALITY (0-100): Lighting, composition, color theory, professional polish, brand integration
4. TEXT OVERLAY CLARITY: Is any text easy to read, well-positioned, and compelling?
5. BRAND CLARITY (0-100): Is brand identity clear without being ad-like?
6. PLATFORM FIT (0-100): Correct aspect ratio, visual style, and energy for the target platform?
7. TREND ALIGNMENT ESTIMATE (0-100): Does the visual style match current trending aesthetics?
8. FACE/EMOTION PRESENCE: Are there people/faces? What emotions do they convey?
9. COLOR PSYCHOLOGY: What mood does the color palette set?
10. COMPOSITION ANALYSIS: Rule of thirds, focal point, visual flow.

Respond ONLY in valid JSON matching this exact schema:
{
  "contentType": "image",
  "geminiAnalysis": {
    "hookStrength": 0-100,
    "emotionalPull": 0-100,
    "visualQuality": 0-100,
    "platformFit": 0-100,
    "brandClarity": 0-100,
    "trendAlignmentEstimate": 0-100,
    "hookDescription": "Why this image does or doesn't stop the scroll",
    "emotionTriggered": "Primary emotion this image triggers",
    "colorPsychology": "Mood and feeling the color palette creates",
    "compositionAnalysis": "Rule of thirds, focal point, visual hierarchy",
    "textOverlayAssessment": "Readability and impact of any text",
    "faceAndEmotionPresence": "Description of faces/people and their emotional impact",
    "visualStyleDescription": "Overall aesthetic and brand visual identity",
    "retentionRisks": ["Elements that might reduce engagement"],
    "strongestElements": ["Strongest visual elements for virality"],
    "platformRecommendations": ["instagram", "linkedin", "twitter", "pinterest"]
  }
}`;

    try {
        // Use Gemini API directly with multimodal parts
        const model = 'gemini-2.5-flash'; // Best available for vision tasks

        // Call Gemini API directly with video/image parts
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: [{
                        role: 'user',
                        parts: [
                            ...mediaParts,
                            { text: userPrompt },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 4096,
                        responseMimeType: 'application/json',
                    },
                }),
            }
        );

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`Gemini API error: ${err.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        }

        return parsed;
    } catch (error) {
        console.error('Gemini virality analysis failed:', error.message);
        // Return a neutral placeholder so the pipeline can continue
        return {
            contentType,
            geminiAnalysis: {
                hookStrength: 50, emotionalPull: 50, visualQuality: 55,
                platformFit: 50, brandClarity: 50, trendAlignmentEstimate: 50,
                hookDescription: 'Visual analysis unavailable — using baseline scores.',
                emotionTriggered: 'neutral',
                colorPsychology: 'Unable to analyze.',
                compositionAnalysis: 'Unable to analyze.',
                visualStyleDescription: 'Unable to analyze.',
                retentionRisks: [],
                strongestElements: [],
                platformRecommendations: ['instagram'],
                _error: error.message,
            },
        };
    }
}

// ── Grok Real-time Virality Research ───────────────────────────────────────
async function getViralityTrendsFromGrok(industry, platform, country, contentType) {
    if (!GROK_API_KEY) {
        return { viralPatterns: [], trendContext: 'Grok not configured', topFormats: [], categoryBenchmark: 65 };
    }

    const today = new Date().toISOString().split('T')[0];

    try {
        const resp = await fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${GROK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-3',
                messages: [
                    {
                        role: 'system',
                        content: `You are a real-time viral content intelligence agent. Today is ${today}. You have access to live data from X (Twitter), Instagram, TikTok, YouTube, and Google Trends. Your job is to provide the most current virality intelligence for content creators and marketers.`,
                    },
                    {
                        role: 'user',
                        content: `Research what is going VIRAL RIGHT NOW on ${platform || 'social media'} in the ${industry || 'general'} category in ${country || 'India'}.

Focus specifically on ${contentType === 'video' ? 'video content' : 'image and visual content'}.

Provide:
1. What content formats are getting the most shares and saves this week?
2. What visual/narrative styles are outperforming in this category?
3. What emotional triggers are working best right now?
4. What posting times and hashtag strategies are getting traction?
5. What are competitors doing that's getting viral reach?
6. What is the average "virality benchmark score" for top-performing content in this category (0-100)?
7. Give 5 SPECIFIC, actionable tips to make content go viral in this niche RIGHT NOW.

Return ONLY in JSON:
{
  "trendContext": "2-3 sentence summary of what's happening in this space right now",
  "categoryBenchmark": 0-100,
  "viralPatterns": [
    {
      "pattern": "Pattern name",
      "description": "What's working and why",
      "viralPotential": "high|medium|low",
      "platforms": ["platform names"]
    }
  ],
  "topFormats": ["List of top-performing content formats this week"],
  "emotionalTriggers": ["Emotions driving shares right now"],
  "bestPostingStrategy": {
    "times": "Best posting times",
    "hashtags": ["5-8 trending hashtags for this category"],
    "frequency": "How often to post"
  },
  "competitorInsights": "What top brands in this category are doing for viral reach",
  "viralTipsForCategory": [
    "Specific, actionable tip 1",
    "Specific, actionable tip 2",
    "Specific, actionable tip 3",
    "Specific, actionable tip 4",
    "Specific, actionable tip 5"
  ]
}`,
                    },
                ],
                temperature: 0.6,
                max_tokens: 4096,
                response_format: { type: 'json_object' },
            }),
        });

        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || '';

        try {
            let clean = text.trim();
            if (clean.startsWith('```')) {
                clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
            }
            return JSON.parse(clean);
        } catch {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { viralPatterns: [], trendContext: text.slice(0, 200), topFormats: [], categoryBenchmark: 60 };
        }
    } catch (error) {
        console.error('Grok virality research failed:', error.message);
        return { viralPatterns: [], trendContext: 'Real-time research unavailable.', topFormats: [], categoryBenchmark: 60 };
    }
}

// ── Claude Synthesis — Final Score Map + Recommendations ───────────────────
async function synthesizeWithClaude(geminiAnalysis, grokTrends, brandDNA, platform, contentType, contentText) {
    const aiRouter = getAIRouter();

    const brandContext = brandDNA ? `
Brand Name: ${brandDNA.name || 'Unknown'}
Industry: ${brandDNA.industry || 'General'}
Target Audience: ${brandDNA.targetAudience || 'General audience'}
Brand Voice: ${brandDNA.voice?.personality || 'Not specified'}
Country: ${brandDNA.country || 'India'}` : 'No brand context.';

    const systemPrompt = `You are the world's most sophisticated AI virality scoring engine. You combine multimodal content analysis with real-time trend intelligence to produce precise, actionable virality predictions. Your scores are calibrated against real social media performance data. You are direct, specific, and never give generic advice.

Today is ${new Date().toISOString().split('T')[0]}.`;

    const userPrompt = `Synthesize the following analysis data into a complete virality prediction report.

## BRAND CONTEXT
${brandContext}

## TARGET PLATFORM
${platform || 'Instagram'}

## CONTENT TYPE
${contentType} ${contentText ? `\n## CAPTION/TEXT\n${contentText}` : ''}

## GEMINI VISUAL ANALYSIS
${JSON.stringify(geminiAnalysis?.geminiAnalysis || {}, null, 2)}

## GROK REAL-TIME TREND INTELLIGENCE
${JSON.stringify(grokTrends, null, 2)}

## YOUR TASK
Using all the above data, produce a comprehensive virality prediction in JSON.

SCORING RULES:
- hookStrength: From Gemini analysis — how likely to stop scroll (0-100)
- emotionalPull: From Gemini + trend emotional triggers alignment (0-100)
- trendAlignment: From Grok research — how well it aligns with what's viral NOW (0-100)
- visualQuality: From Gemini visual analysis (0-100)
- brandClarity: From Gemini brand clarity score (0-100)
- platformFit: From Gemini platform assessment + Grok format trends (0-100)
- overallScore: Weighted average: hookStrength×0.25 + trendAlignment×0.20 + emotionalPull×0.20 + visualQuality×0.15 + platformFit×0.12 + brandClarity×0.08
- tier: "viral_ready" (85+), "high_potential" (70-84), "growing" (55-69), "needs_work" (<55)

BRAND-SPECIFIC TIPS: Generate tips that are hyper-specific to the brand's industry (${brandDNA?.industry || 'general'}). Reference actual trends from the Grok data. Never give generic advice.

Respond ONLY in this exact JSON schema:
{
  "overallScore": 0-100,
  "tier": "viral_ready|high_potential|growing|needs_work",
  "tierLabel": "🔥 Viral Ready|⚡ High Potential|📈 Growing|💡 Needs Work",
  "scores": {
    "hookStrength": 0-100,
    "emotionalPull": 0-100,
    "trendAlignment": 0-100,
    "visualQuality": 0-100,
    "brandClarity": 0-100,
    "platformFit": 0-100
  },
  "verdict": "2-3 sentence direct assessment of this content's viral potential",
  "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
  "improvements": ["Specific improvement 1 with HOW to fix it", "Specific improvement 2 with HOW to fix it", "Specific improvement 3 with HOW to fix it"],
  "tipsToGoViral": [
    "Tip 1: SPECIFIC to the brand's industry and current trends (from Grok data)",
    "Tip 2: SPECIFIC actionable tip",
    "Tip 3: SPECIFIC actionable tip",
    "Tip 4: SPECIFIC actionable tip",
    "Tip 5: SPECIFIC actionable tip"
  ],
  "trendContext": "2-sentence summary of what's going viral in this category RIGHT NOW, based on Grok research",
  "bestPlatforms": ["platform1", "platform2"],
  "bestPostTime": "Specific days and times based on Grok data",
  "recommendedHashtags": ["#hashtag1", "#hashtag2", "#hashtag3", "#hashtag4", "#hashtag5"],
  "estimatedReach": "low|medium|medium-high|high|viral",
  "categoryBenchmark": 0-100,
  "comparedToBenchmark": "above|at|below",
  "competitorContext": "What competitors in this category are doing for viral reach",
  "quickWin": "The single most impactful change to improve virality score immediately",
  "webResearchSummary": "Summary of real-time trend intelligence from Grok"
}`;

    try {
        const result = await aiRouter.generateText({
            systemPrompt,
            userPrompt,
            temperature: 0.3,
            maxTokens: 4096,
            model: 'claude-sonnet-4-20250514',
            responseFormat: 'json',
        }, { provider: 'anthropic' });

        let text = result.text || '';
        if (text.startsWith('```')) {
            text = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }

        try {
            return JSON.parse(text);
        } catch {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        }
    } catch (error) {
        console.error('Claude synthesis failed:', error.message);
        throw error;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// POST /api/virality/predict
// ══════════════════════════════════════════════════════════════════════════
router.post('/predict', protect, requireCredits('viralityPredict'), async (req, res) => {
    try {
        const {
            contentType = 'image',   // 'image' | 'video'
            mediaUrl,                // S3/CDN URL
            mediaBase64,             // Base64 fallback
            brandId,
            platform = 'instagram', // Target platform
            contentText,             // Caption/copy text
        } = req.body;

        if (!mediaUrl && !mediaBase64 && !contentText) {
            return res.status(400).json({ success: false, error: 'Provide a mediaUrl, mediaBase64, or contentText to analyze' });
        }

        // Load brand DNA
        let brandDNA = null;
        if (brandId) {
            const brand = await Brand.findById(brandId).select('name dna website country').lean();
            if (brand) {
                brandDNA = {
                    name: brand.name,
                    industry: brand.dna?.industry,
                    targetAudience: brand.dna?.targetAudience,
                    voice: brand.dna?.voice,
                    country: brand.country || brand.dna?.country || 'India',
                };
            }
        }

        const industry = brandDNA?.industry || 'general';
        const country = brandDNA?.country || 'India';

        console.log(`🔥 Virality Predict: ${contentType} | ${platform} | ${industry} | ${country}`);

        // ── Stage 1: Gemini Visual/Video Analysis ──
        console.log('🎬 Stage 1: Gemini native video/image analysis...');
        const geminiAnalysis = await analyzeContentWithGemini(
            contentType, mediaUrl, mediaBase64, platform, brandDNA
        );

        // ── Stage 2: Grok Real-time Trend Research ──
        console.log('🌐 Stage 2: Grok real-time virality research...');
        const grokTrends = await getViralityTrendsFromGrok(industry, platform, country, contentType);

        // ── Stage 3: Claude Synthesis ──
        console.log('🧠 Stage 3: Claude synthesis and scoring...');
        const prediction = await synthesizeWithClaude(
            geminiAnalysis, grokTrends, brandDNA, platform, contentType, contentText
        );

        if (!prediction) {
            return res.status(500).json({ success: false, error: 'Virality synthesis failed. Please try again.' });
        }

        // Attach raw analysis for debugging/transparency
        prediction.analysisMetadata = {
            contentType,
            platform,
            industry,
            country,
            analysisDate: new Date().toISOString(),
            modelsUsed: ['gemini-2.5-flash', 'grok-3', 'claude-sonnet-4'],
            creditsUsed: req.creditsDeducted || 3,
        };

        console.log(`✅ Virality prediction complete: Score ${prediction.overallScore} (${prediction.tier})`);

        res.json({
            success: true,
            prediction,
            creditsDeducted: req.creditsDeducted || 3,
        });
    } catch (error) {
        console.error('Virality predictor error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/virality/health — Quick health check
router.get('/health', protect, async (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        grokAvailable: isGrokAvailable(),
        modelsUsed: {
            visualAnalysis: 'gemini-2.5-flash (native video)',
            trendResearch: 'grok-3 (real-time web)',
            synthesis: 'claude-sonnet-4',
        },
        creditCost: 3,
    });
});

export default router;

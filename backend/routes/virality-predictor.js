/**
 * Virality Predictor Route — /api/virality/*
 *
 * 3-model pipeline (Neural Virality Engine v2):
 *   1. Gemini 2.5 Pro — Native video/audio analysis via Files API (20-dimension Neural Score)
 *   2. Grok 3         — Real-time web research (trending sounds, formats, posting windows)
 *   3. Claude Sonnet 4— Synthesises both streams → structured Neural Score Map + tips
 *
 * Credit cost: 3 credits
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { getAIRouter } from '../ai/router.js';
import { isGrokAvailable } from '../services/grokTrends.js';
import { getObjectStream, s3Client } from '../utils/s3.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import config from '../config/env.js';

const router = Router();

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
const GROK_BASE_URL = 'https://api.x.ai/v1';

// ── Gemini Files API Upload ────────────────────────────────────────────────
// Large videos must go through the Files API for native analysis
async function uploadToGeminiFilesAPI(mediaUrl, contentType) {
    console.log(`📤 Downloading ${mediaUrl} to buffer for Gemini upload...`);
    let buffer;
    let mimeType = contentType === 'video' ? 'video/mp4' : 'image/jpeg';
    
    try {
        // Try to get from our S3 directly first if it's our URL
        if (mediaUrl.includes('s3.amazonaws.com') || mediaUrl.includes('mantram')) {
            const { stream, contentType: s3Type } = await getObjectStream(mediaUrl);
            if (s3Type) mimeType = s3Type;
            
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
        } else {
            // External URL fetch
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`Failed to fetch media: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            mimeType = response.headers.get('content-type') || mimeType;
        }

        console.log(`🚀 Uploading ${Math.round(buffer.length / 1024 / 1024)}MB to Gemini Files API...`);
        
        // 1. Initial resumable upload request
        const initRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { displayName: `virality_${Date.now()}` } })
            }
        );

        if (!initRes.ok) throw new Error(`Gemini init upload failed: ${initRes.statusText}`);
        const uploadUrl = initRes.headers.get('x-goog-upload-url');
        if (!uploadUrl) throw new Error('No upload URL returned from Gemini');

        // 2. Upload the bytes
        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
                'Content-Length': buffer.length.toString(),
            },
            body: buffer
        });

        if (!uploadRes.ok) throw new Error(`Gemini file upload failed: ${uploadRes.statusText}`);
        const fileInfo = await uploadRes.json();
        
        console.log(`✅ Gemini Upload Success: ${fileInfo.file.uri}`);
        return { fileUri: fileInfo.file.uri, fileName: fileInfo.file.name, mimeType };

    } catch (error) {
        console.error('Gemini file upload error:', error);
        throw error;
    }
}

async function deleteFromGemini(fileName) {
    if (!fileName) return;
    try {
        console.log(`🧹 Cleaning up Gemini file: ${fileName}`);
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${process.env.GEMINI_API_KEY}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error(`Failed to delete Gemini file ${fileName}:`, e.message);
    }
}

// ── Gemini 20-Dimension Native Analysis ─────────────────────────────────────
async function analyzeContentWithGeminiNative(contentType, fileData, platform, brandDNA) {
    const brandContext = brandDNA ? `
Brand: ${brandDNA.name || 'Unknown'}
Category/Industry: ${brandDNA.industry || 'General'}
Target Audience: ${brandDNA.targetAudience || 'General audience'}
Brand Voice: ${brandDNA.voice?.personality || 'Not specified'}
Country: ${brandDNA.country || 'India'}` : 'No brand context provided.';

    const isVideo = contentType === 'video';

    const systemPrompt = `You are a world-class social media content analyst, neuro-marketer, and virality expert.
You specialize in identifying viral content patterns by analyzing audio, motion, and visual triggers.
Your analysis is data-driven, specific, and actionable.

Today is ${new Date().toISOString().split('T')[0]}.`;

    const userPrompt = isVideo ? `Analyze this FULL VIDEO (audio + visuals) for virality potential on ${platform || 'social media'}.

${brandContext}

Perform a DEEP NEURAL ANALYSIS across these dimensions (Score 0-100 for each):

**TIER 1: HOOK ARCHITECTURE**
- hookStrength: Visual + audio hook in first 3s
- curiosityGapScore: Does it create an "I need to know" moment?
- patternInterruptDensity: Pattern breaks per 30s (fast cuts, zoom, text pop)
- openingEnergyLevel: Pace/motion velocity of opening frames

**TIER 2: AUDIO INTELLIGENCE**
- audioBeatEnergy: BPM energy and intensity alignment with visuals
- voiceoverClarity: Narration effectiveness (clear, punchy, paced)
- audioVisualSync: Do cuts/motion sync with the beat?
- silenceRiskScore: Dead audio moments that kill retention (inverse scale: 100 = no silence risk)

**TIER 3: VISUAL MOTION INTELLIGENCE**
- motionDensity: Camera movement, cuts/sec, visual velocity
- facePresenceScore: % of time human face is on screen
- textOverlayImpact: Text timing, readability, scroll-stop power
- visualQuality: Lighting, composition, color grading
- loopabilityScore: Does the video loop seamlessly?

**TIER 4: NARRATIVE & EMOTIONAL**
- emotionalArc: Emotional journey (flat vs peak-and-valley)
- emotionalPull: Primary emotion triggered intensity
- narrativeVelocity: How fast the story moves to payoff
- saveWorthiness: Would someone save this for later?
- socialCurrencyIndex: Does sharing this make the viewer look good?

**TIER 5: PLATFORM & BRAND**
- platformFit: Format/style match for target platform
- brandClarity: Brand message clarity without being overly salesy

Additionally, provide:
1. "retentionCurve": Array of estimated retention % at key timestamps. e.g. [{"second": 0, "score": 100}, {"second": 3, "score": 85}...]
2. "peakHookTimestamp": The exact second (e.g. 2, 4) with the highest engagement spike.
3. "holdRateEstimate": Estimated % of viewers who watch past the hook (first 3s).

Respond ONLY in valid JSON matching this exact schema:
{
  "contentType": "video",
  "geminiAnalysis": {
    "tier1_hook": { "hookStrength": 0, "curiosityGapScore": 0, "patternInterruptDensity": 0, "openingEnergyLevel": 0 },
    "tier2_audio": { "audioBeatEnergy": 0, "voiceoverClarity": 0, "audioVisualSync": 0, "silenceRiskScore": 0 },
    "tier3_visual": { "motionDensity": 0, "facePresenceScore": 0, "textOverlayImpact": 0, "visualQuality": 0, "loopabilityScore": 0 },
    "tier4_narrative": { "emotionalArc": 0, "emotionalPull": 0, "narrativeVelocity": 0, "saveWorthiness": 0, "socialCurrencyIndex": 0 },
    "tier5_platform": { "platformFit": 0, "brandClarity": 0 },
    "retentionCurve": [{"second": 0, "score": 100}],
    "peakHookTimestamp": 0,
    "holdRateEstimate": 0,
    "primaryEmotion": "Joy/Awe/etc",
    "hookDescription": "What happens in first 3s"
  }
}` : `Analyze this image for virality potential on ${platform || 'social media'}.

${brandContext}

Perform a DEEP NEURAL ANALYSIS across these dimensions (Score 0-100 for each):

**TIER 1: HOOK ARCHITECTURE**
- hookStrength: Instant visual hook
- curiosityGapScore: Does it make people stop and read?
- patternInterruptDensity: Visual uniqueness
- openingEnergyLevel: Visual energy

**TIER 3: VISUAL INTELLIGENCE** (Tier 2 Audio skipped)
- facePresenceScore: Human element presence
- textOverlayImpact: Readability, hook power
- visualQuality: Lighting, composition, color grading

**TIER 4: NARRATIVE & EMOTIONAL**
- emotionalPull: Primary emotion triggered intensity
- saveWorthiness: Would someone save this?
- socialCurrencyIndex: Does sharing this make the viewer look good?

**TIER 5: PLATFORM & BRAND**
- platformFit: Format match for target platform
- brandClarity: Brand clarity

Respond ONLY in valid JSON matching this schema:
{
  "contentType": "image",
  "geminiAnalysis": {
    "tier1_hook": { "hookStrength": 0, "curiosityGapScore": 0, "patternInterruptDensity": 0, "openingEnergyLevel": 0 },
    "tier2_audio": { "audioBeatEnergy": 0, "voiceoverClarity": 0, "audioVisualSync": 0, "silenceRiskScore": 0 },
    "tier3_visual": { "motionDensity": 0, "facePresenceScore": 0, "textOverlayImpact": 0, "visualQuality": 0, "loopabilityScore": 0 },
    "tier4_narrative": { "emotionalArc": 0, "emotionalPull": 0, "narrativeVelocity": 0, "saveWorthiness": 0, "socialCurrencyIndex": 0 },
    "tier5_platform": { "platformFit": 0, "brandClarity": 0 },
    "retentionCurve": [{"second": 0, "score": 100}, {"second": 3, "score": 85}],
    "peakHookTimestamp": 0,
    "holdRateEstimate": 0,
    "primaryEmotion": "Emotion",
    "hookDescription": "Visual hook description"
  }
}`;

    try {
        const model = 'gemini-2.5-pro'; // Upgraded to Pro for complex reasoning

        // Wait a few seconds for Gemini video processing if it's a video
        if (isVideo) {
            console.log('⏳ Waiting 5s for Gemini to process the video...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

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
                            { fileData: { fileUri: fileData.fileUri, mimeType: fileData.mimeType } },
                            { text: userPrompt },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.7, // Increased for variance
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
        throw error;
    }
}

// ── Grok Real-time Virality Research ───────────────────────────────────────
async function getViralityTrendsFromGrok(industry, platform, country, contentType) {
    if (!GROK_API_KEY) {
        return { viralPatterns: [], trendContext: 'Grok not configured', topFormats: [], categoryBenchmark: 65, trendingSounds: [], postingWindows: [] };
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
                        content: `You are a real-time viral content intelligence agent. Today is ${today}. You have access to live data from X (Twitter), Instagram, TikTok, YouTube, and Google Trends.`,
                    },
                    {
                        role: 'user',
                        content: `Research what is going VIRAL RIGHT NOW on ${platform || 'social media'} in the ${industry || 'general'} category in ${country || 'India'}.

Focus specifically on ${contentType === 'video' ? 'video content' : 'image and visual content'}.

Provide:
1. What content formats are getting the most shares this week?
2. What are 3 specific trending sounds/audio styles right now?
3. What posting windows (days/times) are currently hitting the algorithm best?
4. What are competitors doing that's getting viral reach?
5. What is the average "virality benchmark score" for top-performing content in this category (0-100)?
6. Give 5 SPECIFIC, actionable tips to make content go viral in this niche RIGHT NOW.

Return ONLY in JSON:
{
  "trendContext": "2-3 sentence summary of what's happening in this space right now",
  "categoryBenchmark": 0-100,
  "trendingSounds": ["Sound/audio trend 1", "Sound trend 2", "Sound trend 3"],
  "postingWindows": ["Specific day/time window 1", "Specific day/time window 2"],
  "viralPatterns": [
    { "pattern": "Pattern name", "description": "What's working and why", "viralPotential": "high|medium|low" }
  ],
  "topFormats": ["List of top-performing content formats this week"],
  "competitorInsights": "What top brands in this category are doing for viral reach",
  "viralTipsForCategory": ["Specific actionable tip 1", "Tip 2", "Tip 3", "Tip 4", "Tip 5"]
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
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { viralPatterns: [], trendContext: text.slice(0, 200), categoryBenchmark: 60 };
        }
    } catch (error) {
        console.error('Grok virality research failed:', error.message);
        return { viralPatterns: [], trendContext: 'Real-time research unavailable.', categoryBenchmark: 60 };
    }
}

// ── Claude Synthesis — Neural Score Map ────────────────────────────────────
async function synthesizeWithClaude(geminiAnalysis, grokTrends, brandDNA, platform, contentType, contentText) {
    const aiRouter = getAIRouter();

    const brandContext = brandDNA ? `
Brand Name: ${brandDNA.name || 'Unknown'}
Industry: ${brandDNA.industry || 'General'}
Target Audience: ${brandDNA.targetAudience || 'General audience'}
Brand Voice: ${brandDNA.voice?.personality || 'Not specified'}
Country: ${brandDNA.country || 'India'}` : 'No brand context.';

    const systemPrompt = `You are the world's most sophisticated AI virality scoring engine. You combine multimodal neuro-content analysis (20 dimensions) with real-time trend intelligence. Your scores are calibrated against real social media performance data. You are direct, specific, and never give generic advice.

Today is ${new Date().toISOString().split('T')[0]}.`;

    const userPrompt = `Synthesize the following neuro-analysis data into a complete Neural Virality Prediction report.

## BRAND CONTEXT
${brandContext}
Target Platform: ${platform || 'Instagram'}
Content Type: ${contentType} ${contentText ? `\nCaption: ${contentText}` : ''}

## GEMINI NATIVE ANALYSIS (20 Dimensions)
${JSON.stringify(geminiAnalysis?.geminiAnalysis || {}, null, 2)}

## GROK REAL-TIME TREND INTELLIGENCE
${JSON.stringify(grokTrends, null, 2)}

## YOUR TASK
Using all the above data, produce a comprehensive Neural Virality Score Map in JSON.

**COMPUTING NEURAL ACTIVATION SCORES (0-100):**
Based on the Gemini 20 dimensions, calculate these brain-region scores:
- visualCortex: Average of visualQuality, motionDensity, textOverlayImpact, loopabilityScore
- auditoryCortex: Average of audioBeatEnergy, voiceoverClarity, audioVisualSync (if video, else 0)
- attentionControl: Average of hookStrength, patternInterruptDensity, openingEnergyLevel
- limbicSystem: Average of emotionalPull, emotionalArc, socialCurrencyIndex, saveWorthiness
- languageNetwork: Average of narrativeVelocity, curiosityGapScore, brandClarity

**OVERALL VIRALITY SCORE:**
Weighted composite based on your judgment of the combined data and trend alignment.
- Tier: "viral_ready" (85+), "high_potential" (70-84), "growing" (55-69), "needs_work" (<55)

Respond ONLY in this exact JSON schema:
{
  "overallScore": 0-100,
  "tier": "viral_ready|high_potential|growing|needs_work",
  "tierLabel": "🔥 Viral Ready|⚡ High Potential|📈 Growing|💡 Needs Work",
  "scores": {
    "visualCortex": 0-100,
    "auditoryCortex": 0-100,
    "attentionControl": 0-100,
    "limbicSystem": 0-100,
    "languageNetwork": 0-100,
    "focusDrift": 0-100
  },
  "metrics": {
    "hookScore": 0-100,
    "holdRate": 0-100,
    "peakHookTimestamp": 0
  },
  "retentionCurve": [{"second": 0, "score": 100}, {"second": 3, "score": 85}],
  "verdict": "2-3 sentence direct assessment of this content's viral potential",
  "strengths": ["Specific strength 1", "Specific strength 2"],
  "improvements": ["Specific improvement 1 with HOW to fix it", "Specific improvement 2"],
  "tipsToGoViral": [
    "Tip 1: SPECIFIC to the brand's industry and current trends (from Grok)",
    "Tip 2", "Tip 3", "Tip 4", "Tip 5"
  ],
  "trendContext": "2-sentence summary of what's going viral in this category RIGHT NOW",
  "trendingSounds": ["Sound 1", "Sound 2"],
  "bestPostTime": "Specific days and times based on Grok data",
  "recommendedHashtags": ["#hashtag1", "#hashtag2"],
  "estimatedReach": "low|medium|high|viral",
  "categoryBenchmark": 0-100,
  "comparedToBenchmark": "above|at|below",
  "competitorContext": "What competitors are doing",
  "quickWin": "The single most impactful change to improve virality score immediately"
}`;

    try {
        const result = await aiRouter.generateText({
            systemPrompt,
            userPrompt,
            temperature: 0.65, // Increased for variance
            maxTokens: 4096,
            model: 'claude-3-5-sonnet-20241022',
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

import multer from 'multer';
import { uploadToS3 } from '../utils/s3.js';

const viralityUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for videos
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Invalid file type. Allowed: jpg, png, webp, gif, mp4, mov, webm`));
    }
});

// ══════════════════════════════════════════════════════════════════════════
// POST /api/virality/upload — Multipart proxy upload to bypass S3 CORS
// ══════════════════════════════════════════════════════════════════════════
router.post('/upload', protect, viralityUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        const { buffer, mimetype, originalname } = req.file;
        const ext = originalname.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg','jpeg','png','webp','gif','mp4','mov','webm'].includes(ext) ? ext : 'jpg';
        const key = `virality-uploads/${req.user._id}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${safeExt}`;

        console.log(`📤 [virality-upload] Uploading ${Math.round(buffer.length / 1024)}KB → ${key}`);

        const s3Url = await uploadToS3(buffer, key, mimetype);
        console.log(`✅ [virality-upload] Uploaded: ${s3Url}`);

        res.json({ success: true, s3Url });
    } catch (error) {
        console.error('Virality upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});

// ══════════════════════════════════════════════════════════════════════════
// POST /api/virality/predict
// ══════════════════════════════════════════════════════════════════════════
router.post('/predict', protect, requireCredits('viralityPredict'), async (req, res) => {
    let geminiFileName = null;
    try {
        const {
            contentType = 'image',   // 'image' | 'video'
            mediaUrl,                // S3/CDN URL (Required now)
            brandId,
            platform = 'instagram',
            contentText,
        } = req.body;

        if (!mediaUrl) {
            return res.status(400).json({ success: false, error: 'mediaUrl is required. Please upload the file first.' });
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

        console.log(`🔥 Neural Virality Predict: ${contentType} | ${platform} | ${industry}`);

        // ── Stage 1: Upload to Gemini Files API ──
        console.log('📤 Stage 1: Uploading to Gemini Files API...');
        const fileData = await uploadToGeminiFilesAPI(mediaUrl, contentType);
        geminiFileName = fileData.fileName; // Save for cleanup

        // ── Stage 2: Gemini Native Neural Analysis ──
        console.log('🎬 Stage 2: Gemini 20-Dimension Neural Analysis...');
        const geminiAnalysis = await analyzeContentWithGeminiNative(
            contentType, fileData, platform, brandDNA
        );

        // ── Stage 3: Grok Real-time Trend Research ──
        console.log('🌐 Stage 3: Grok real-time virality research...');
        const grokTrends = await getViralityTrendsFromGrok(industry, platform, country, contentType);

        // ── Stage 4: Claude Synthesis ──
        console.log('🧠 Stage 4: Claude Neural Synthesis...');
        const prediction = await synthesizeWithClaude(
            geminiAnalysis, grokTrends, brandDNA, platform, contentType, contentText
        );

        if (!prediction) {
            throw new Error('Virality synthesis failed. Please try again.');
        }

        prediction.analysisMetadata = {
            contentType, platform, industry, country,
            analysisDate: new Date().toISOString(),
            modelsUsed: ['gemini-2.5-pro', 'grok-3', 'claude-sonnet-4'],
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
    } finally {
        // Cleanup Gemini File
        if (geminiFileName) {
            await deleteFromGemini(geminiFileName);
        }
    }
});

// GET /api/virality/health
router.get('/health', protect, async (req, res) => {
    res.json({
        success: true,
        status: 'operational',
        grokAvailable: isGrokAvailable(),
        modelsUsed: {
            visualAnalysis: 'gemini-2.5-pro (Files API)',
            trendResearch: 'grok-3',
            synthesis: 'claude-sonnet-4',
        },
        creditCost: 3,
    });
});

export default router;

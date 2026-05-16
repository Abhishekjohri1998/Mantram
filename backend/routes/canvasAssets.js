import express from 'express'
import { getOrchestrator } from '../agents/orchestrator.js'
import { protect } from '../middleware/auth.js'
import { requireCredits } from '../middleware/credits.js'
import { URL } from 'url'
import { safeErrorMessage } from '../utils/safeError.js';
import { uploadToS3, getSignedUrlIfNeeded, getSignedUrlForPath } from '../utils/s3.js';
import { agentUtils } from '../agents/shared/agentUtils.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
const router = express.Router()

/**
 * Fetches an image URL and returns a Gemini-compatible inlineData part.
 * Handles private S3 URLs by pre-signing them with backend credentials before fetching.
 * This avoids any need to pass base64 data through the API — URLs only.
 */
async function fetchImageAsInlineData(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null
    try {
        // Pre-sign private S3 URLs (our bucket) so the fetch succeeds
        let fetchUrl = imageUrl
        const isOurS3 = imageUrl.includes('amazonaws.com') && (
            imageUrl.includes('mantram-assets') ||
            imageUrl.includes('mantram-media')
        )
        if (isOurS3) {
            fetchUrl = await getSignedUrlForPath(imageUrl, 300) // 5-min presigned URL
            console.log(`🔐 Pre-signed S3 URL for analysis fetch`)
        }
        const resp = await fetch(fetchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(20_000),
        })
        if (!resp.ok) {
            console.warn(`⚠️ fetchImageAsInlineData: HTTP ${resp.status} for ${imageUrl.substring(0, 60)}`)
            return null
        }
        const buffer = await resp.arrayBuffer()
        const contentType = resp.headers.get('content-type') || 'image/jpeg'
        return { inlineData: { mimeType: contentType, data: Buffer.from(buffer).toString('base64') } }
    } catch (err) {
        console.error(`❌ fetchImageAsInlineData failed: ${err.message}`)
        return null
    }
}

// ============================================================================
// MCoT: CANVAS VISUAL GROUNDING PROMPT
// ============================================================================
const CANVAS_VISUAL_GROUNDING_PROMPT = `You are a visual grounding agent for an AI creative canvas. Analyze the provided brand/product images and extract a concise visual DNA for image generation.

Extract:
1. DOMINANT COLORS: Exact hex codes of the brand's primary and secondary colors
2. PRODUCT FEATURES: Shape, materials, textures, distinctive visual elements
3. BRAND STYLE: Photography style (flat lay, lifestyle, studio, etc.), lighting preferences
4. TYPOGRAPHY CUES: If any text/fonts visible, describe the typographic personality
5. VISUAL PERSONALITY: 3-5 adjectives that capture the brand's visual identity

Return JSON:
{
  "dominantColors": ["#hex1", "#hex2", "#hex3"],
  "productDescription": "Brief description of the product's physical appearance",
  "brandStyle": "Photography/visual style in 1-2 sentences",
  "visualPersonality": ["modern", "premium", "bold"],
  "promptInjection": "A concise 2-3 sentence visual direction that can be appended to any image generation prompt to ensure brand consistency. Include color palette, style, and mood."
}`;

// ══════════════════════════════════════════════════════════════════════
// ── AI CANVAS ENDPOINTS ──
// ══════════════════════════════════════════════════════════════════════

// POST /api/canvas-assets/upload-canvas-export — Upload canvas export base64 to S3, return S3 URL
router.post('/upload-canvas-export', protect, async (req, res) => {
    try {
        const { imageDataUrl, mimeType = 'image/jpeg' } = req.body
        if (!imageDataUrl) return res.status(400).json({ success: false, error: 'imageDataUrl is required' })
        if (!imageDataUrl.startsWith('data:')) {
            return res.status(400).json({ success: false, error: 'imageDataUrl must be a base64 data URI' })
        }
        const ext = mimeType.includes('png') ? 'png' : 'jpg'
        const filename = `canvas-exports/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
        const s3Url = await uploadToS3(imageDataUrl, filename, mimeType)
        console.log(`📤 [UploadCanvasExport] Uploaded to S3: ${s3Url.substring(0, 80)}`)
        return res.json({ success: true, s3Url })
    } catch (err) {
        console.error('[UploadCanvasExport] Error:', err.message)
        return res.status(500).json({ success: false, error: err.message })
    }
})

// POST /api/canvas-assets/ai-adapt — AI-powered design adaptation using NanoBanana 2
// 2-Step MCoT Pipeline:
//   Step A: Gemini text-only analyzes the source image (subjects, text, layout, colors)
//   Step B: NanoBanana 2 generates adapted image using detailed analysis as prompt
router.post('/ai-adapt', protect, async (req, res) => {
    const startTime = Date.now()
    try {
        const { canvasImageUrl, preset, brandContext, cachedAnalysis } = req.body

        if (!preset) return res.status(400).json({ success: false, error: 'preset is required' })
        if (!canvasImageUrl) {
            return res.status(400).json({ success: false, error: 'canvasImageUrl (S3 URL) is required' })
        }
        if (canvasImageUrl.startsWith('data:')) {
            return res.status(400).json({ success: false, error: 'base64 not accepted. Provide an S3/HTTP URL.' })
        }

        const geminiKey = process.env.GEMINI_API_KEY
        if (!geminiKey) return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' })

        const PRESET_MAP = {
            'ig-post':         { w: 1080, h: 1350, label: 'Instagram Post',       aspectRatio: '4:5',   orientation: 'portrait' },
            'ig-post-square':  { w: 1080, h: 1080, label: 'Instagram Square',     aspectRatio: '1:1',   orientation: 'square' },
            'ig-story':        { w: 1080, h: 1920, label: 'Instagram Story',       aspectRatio: '9:16',  orientation: 'portrait tall' },
            'ig-reel':         { w: 1080, h: 1920, label: 'Instagram Reel',        aspectRatio: '9:16',  orientation: 'portrait tall' },
            'fb-post':         { w: 1200, h: 630,  label: 'Facebook Post',         aspectRatio: '1.91:1',orientation: 'landscape' },
            'fb-story':        { w: 1080, h: 1920, label: 'Facebook Story',        aspectRatio: '9:16',  orientation: 'portrait tall' },
            'linkedin':        { w: 1200, h: 628,  label: 'LinkedIn Post',         aspectRatio: '1.91:1',orientation: 'landscape' },
            'yt-thumb':        { w: 1280, h: 720,  label: 'YouTube Thumbnail',     aspectRatio: '16:9',  orientation: 'landscape' },
            'twitter':         { w: 1600, h: 900,  label: 'Twitter/X Post',        aspectRatio: '16:9',  orientation: 'landscape' },
            'whatsapp-status': { w: 1080, h: 1920, label: 'WhatsApp Status',       aspectRatio: '9:16',  orientation: 'portrait tall' },
            'pinterest':       { w: 1000, h: 1500, label: 'Pinterest Pin',         aspectRatio: '2:3',   orientation: 'portrait' },
            'banner':          { w: 1920, h: 600,  label: 'Web Banner',            aspectRatio: '16:5',  orientation: 'ultrawide landscape' },
        }

        const spec = PRESET_MAP[preset]
        if (!spec) return res.status(400).json({ success: false, error: `Unknown preset: ${preset}. Valid: ${Object.keys(PRESET_MAP).join(', ')}` })

        // ── Step 0: Fetch S3 image server-side ──
        let imageBuffer, imageMimeType
        try {
            const imgResp = await fetch(canvasImageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(30000),
            })
            if (!imgResp.ok) throw new Error(`S3 fetch (${imgResp.status})`)
            imageMimeType = imgResp.headers.get('content-type') || 'image/jpeg'
            imageBuffer = Buffer.from(await imgResp.arrayBuffer())
            console.log(`✅ [AI-Adapt] Image fetched: ${Math.round(imageBuffer.length / 1024)}KB`)
        } catch (imgErr) {
            throw new Error(`Failed to fetch image: ${imgErr.message}`)
        }

        const { GoogleGenAI } = await import('@google/genai')
        const ai = new GoogleGenAI({ apiKey: geminiKey })
        const imageInline = { inlineData: { mimeType: imageMimeType, data: imageBuffer.toString('base64') } }

        // ── Step A: MCoT — Analyze source image (text-only, fast ~3s) ──
        let analysis = cachedAnalysis || null
        if (!analysis) {
            console.log(`🔍 [AI-Adapt] Step A: Analyzing source image...`)
            const analyzeStart = Date.now()
            try {
                const analyzeResp = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{
                        role: 'user',
                        parts: [
                            imageInline,
                            { text: `Analyze this design image in extreme detail. Return ONLY a JSON object (no markdown, no code fences):
{
  "headline": "exact text of the main headline/title if any",
  "subtext": "exact text of any subtitle, tagline, or body text",
  "subjects": "detailed description of all people, characters, products, objects",
  "background": "describe the background color, gradient, texture, or scene",
  "layout": "describe the spatial arrangement — what's on top, bottom, left, right, center",
  "colors": "list the dominant colors as hex codes",
  "style": "photography style, mood, lighting, artistic treatment",
  "brandElements": "logos, icons, decorative elements, borders, shapes"
}` },
                        ],
                    }],
                })
                const analysisText = analyzeResp.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || ''
                try {
                    const cleaned = analysisText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
                    analysis = JSON.parse(cleaned)
                } catch { analysis = { raw: analysisText } }
                console.log(`✅ [AI-Adapt] Analysis done in ${Date.now() - analyzeStart}ms:`, JSON.stringify(analysis).substring(0, 200))
            } catch (analyzeErr) {
                console.warn(`⚠️ [AI-Adapt] Analysis failed, using generic prompt:`, analyzeErr.message)
                analysis = {}
            }
        }

        // ── Step B: Build precision prompt from analysis ──
        const a = analysis || {}
        const brand = brandContext || {}
        const brandColors = brand.dna?.brandColors?.map(c => c.hex || c.name).filter(Boolean).join(', ') || ''

        let detailedPrompt = `Recreate this exact design for ${spec.label} format at ${spec.aspectRatio} aspect ratio (${spec.w}x${spec.h}px).

THE DESIGN CONTAINS:`

        if (a.headline) detailedPrompt += `\n- HEADLINE TEXT (must be reproduced exactly): "${a.headline}"`
        if (a.subtext) detailedPrompt += `\n- SUBTITLE/BODY TEXT: "${a.subtext}"`
        if (a.subjects) detailedPrompt += `\n- MAIN SUBJECTS: ${a.subjects}`
        if (a.background) detailedPrompt += `\n- BACKGROUND: ${a.background}`
        if (a.colors) detailedPrompt += `\n- COLOR PALETTE: ${typeof a.colors === 'string' ? a.colors : JSON.stringify(a.colors)}`
        if (a.style) detailedPrompt += `\n- VISUAL STYLE: ${a.style}`
        if (a.brandElements) detailedPrompt += `\n- BRAND ELEMENTS: ${a.brandElements}`
        if (a.layout) detailedPrompt += `\n- ORIGINAL LAYOUT: ${a.layout}`

        detailedPrompt += `

ADAPTATION INSTRUCTIONS for ${spec.orientation} ${spec.aspectRatio} format:
- Maintain EVERY visual element from the original — same subjects, same text, same colors
- ${spec.orientation.includes('portrait') ? 'Extend the background VERTICALLY (add more space above and below the main content)' : spec.orientation.includes('landscape') ? 'Extend the background HORIZONTALLY (add more space to the left and right)' : 'Balance the composition equally in all directions'}
- Keep the main subject as the focal point, centered and prominent
- Preserve exact text content, fonts, and styling
- Match the identical color palette and visual mood
- Output a complete, polished ${spec.label} creative at ${spec.w}x${spec.h}px${brandColors ? `\n- Brand colors to maintain: ${brandColors}` : ''}
- DO NOT crop, cut off, or lose ANY element from the original

Generate the adapted image now.`

        console.log(`🎨 [AI-Adapt] Step B: Generating ${preset} (${spec.w}x${spec.h}) with ${detailedPrompt.length}-char prompt`)

        // ── Step C: Generate with NanoBanana 2 ──
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [{
                role: 'user',
                parts: [imageInline, { text: detailedPrompt }],
            }],
            config: { responseModalities: ['TEXT', 'IMAGE'] },
        })

        // Extract image
        let generatedImageBuffer = null
        let generatedMimeType = 'image/png'
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                    generatedImageBuffer = Buffer.from(part.inlineData.data, 'base64')
                    generatedMimeType = part.inlineData.mimeType || 'image/png'
                    break
                }
            }
        }

        if (!generatedImageBuffer) {
            const textContent = response.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join(' ') || ''
            console.error(`❌ [AI-Adapt] No image. Text: ${textContent.substring(0, 400)}`)
            throw new Error('Gemini returned no image — content may have been blocked or prompt needs adjustment.')
        }

        // Upload to S3
        const ext = generatedMimeType.includes('png') ? 'png' : 'jpg'
        const s3Key = `canvas-adapt/${preset}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`
        const finalUrl = await uploadToS3(generatedImageBuffer, s3Key, generatedMimeType)

        const elapsed = Date.now() - startTime
        console.log(`✅ [AI-Adapt] ${preset} done in ${elapsed}ms → ${finalUrl.substring(0, 80)}`)

        return res.json({
            success: true,
            preset,
            imageUrl: finalUrl,
            spec,
            analysis,  // Return analysis so frontend can cache it for subsequent presets
            generationTime: elapsed,
        })
    } catch (err) {
        console.error('[AI-Adapt] Error:', err.message)
        return res.status(500).json({ success: false, error: err.message })
    }
})

router.post('/ai-analyze', protect, async (req, res) => {
    try {

        const { prompt, imageBase64, imageUrl } = req.body
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        // Build image part — supports both base64 and URL
        let imagePart = null
        if (imageBase64) {
            const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
            const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'
            imagePart = { inlineData: { mimeType, data: base64Data } }
        } else if (imageUrl) {
            imagePart = await fetchImageAsInlineData(imageUrl)
            if (!imagePart) console.warn('ai-analyze: Could not fetch image URL for analysis')
        }

        const parts = []
        if (imagePart) parts.push(imagePart)
        parts.push({ text: prompt })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const ANALYZE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite', 'gemini-flash-latest']

        let text = ''
        for (const modelId of ANALYZE_MODELS) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
                    }),
                    signal: AbortSignal.timeout(30_000),
                })
                const data = await resp.json()
                if (data.error) {
                    const msg = data.error.message || ''
                    if (msg.toLowerCase().includes('high demand') || msg.toLowerCase().includes('overload') || resp.status === 503 || resp.status === 429) {
                        console.warn(`⚠️ ai-analyze: ${modelId} overloaded, trying next`)
                        continue
                    }
                    throw new Error(msg)
                }
                const allParts = data.candidates?.[0]?.content?.parts || []
                for (const p of allParts) { if (p.text && !p.thought) text += p.text }
                if (text) break
            } catch (e) {
                if (e.name !== 'TimeoutError') console.warn(`⚠️ ai-analyze: ${modelId} failed (${e.message?.substring(0, 60)})`)
            }
        }
        res.json({ description: text })
    } catch (err) {
        console.error('AI analyze error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-analyze-template — Smart template analysis: extracts structured elements + prompt formula
router.post('/ai-analyze-template', protect, async (req, res) => {
    try {
        const { imageBase64, imageUrl, brandName, brandColors } = req.body
        if (!imageBase64 && !imageUrl) return res.status(400).json({ error: 'An image is required (imageBase64 or imageUrl)' })

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        // Build image part
        let imagePart = null
        if (imageBase64) {
            const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
            const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'
            imagePart = { inlineData: { mimeType, data: base64Data } }
        } else if (imageUrl) {
            imagePart = await fetchImageAsInlineData(imageUrl)
            if (!imagePart) console.warn('ai-analyze-template: Could not fetch image URL for analysis')
        }

        if (!imagePart) return res.status(400).json({ error: 'Could not process the image' })

        const prompt = `You are an expert visual design analyst. Look at this image CAREFULLY and identify ONLY what is ACTUALLY VISIBLE.

CRITICAL RULES:
- Do NOT invent elements that are not in the image
- Do NOT assume there is a CTA/button if none is visible
- Do NOT assume there is a subtext if none is visible
- ONLY report what you can literally SEE in the image

For each visible element, create an entry:

1. TEXT ELEMENTS: If you see any text/words/titles in the image, extract each text block separately. Report the EXACT text you see.
2. PEOPLE/MODELS: If there is a person/model visible, create an image element with role "model" and describe them (pose, clothing, expression).
3. PRODUCTS: If there is a product visible (in someone's hand, on a surface, etc.), create an image element with role "product" and describe it specifically.
4. BACKGROUND: Describe the background as a color element.
5. DECORATIVE: Any logos, icons, shapes, or decorative elements.

For each element provide:
- type: "text" | "image" | "color" | "select"
- role: specific role like "title", "brand_name", "model", "product", "background", "tagline", "price", "offer", "logo", "decorative"
- label: friendly UI label (e.g. "Brand Title", "Model/Person", "Product Photo", "Background Color")
- default: for text = exact text visible; for color = hex code; for image = leave empty
- style: visual description (position, size, font style, color)
- description: for image elements, detailed description of what you see

Also provide:
- layoutDescription: describe exactly how elements are arranged (e.g. "Person centered, holding product, brand name at top")
- colorPalette: actual hex colors from the design (3-5 colors)
- promptFormula: A reusable prompt to recreate this design. Use {{PLACEHOLDER_NAME}} for each element using the role name in uppercase (e.g. {{TITLE}}, {{MODEL}}, {{PRODUCT}}, {{BACKGROUND}})

Brand: ${brandName || 'Not specified'}
Brand Colors: ${brandColors || 'Not specified'}

Return ONLY valid JSON (no markdown, no backticks). Only include elements you can ACTUALLY SEE.`

        const parts = [imagePart, { text: prompt }]
        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

        // ── Fallback chain: try multiple models in case one is overloaded ──
        const ANALYSIS_MODELS = [
            'gemini-2.5-flash',
            'gemini-2.0-flash-001',
            'gemini-2.0-flash-lite',
            'gemini-flash-latest',
        ]

        let text = ''
        let lastError = null
        for (const modelId of ANALYSIS_MODELS) {
            try {
                console.log(`🔍 Template analysis: trying ${modelId}...`)
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
                    }),
                    signal: AbortSignal.timeout(30_000),
                })
                const data = await resp.json()
                if (data.error) {
                    const errMsg = data.error.message || ''
                    const isOverloaded = errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('overload') || resp.status === 503 || resp.status === 429
                    if (isOverloaded) {
                        console.warn(`⚠️ Template analysis: ${modelId} overloaded — trying next model`)
                        lastError = new Error(errMsg)
                        continue // try next model
                    }
                    throw new Error(errMsg)
                }
                // Extract text (gemini-2.5 may return thought + text parts)
                const allParts = data.candidates?.[0]?.content?.parts || []
                for (const p of allParts) {
                    if (p.text && !p.thought) text += p.text
                }
                console.log(`✅ Template analysis: ${modelId} succeeded (${text.length} chars)`)
                break // success — stop trying fallbacks
            } catch (modelErr) {
                if (modelErr.name === 'TimeoutError') {
                    console.warn(`⚠️ Template analysis: ${modelId} timed out — trying next model`)
                } else {
                    console.warn(`⚠️ Template analysis: ${modelId} failed (${modelErr.message?.substring(0, 80)}) — trying next model`)
                }
                lastError = modelErr
            }
        }

        if (!text && lastError) {
            console.error('🔍 Template analysis: all models failed:', lastError.message)
            throw lastError
        }

        text = text || '{}'
        console.log('🔍 Template analysis response length:', text.length, 'chars')
        
        // Parse the JSON response
        let parsed
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
        } catch (parseErr) {
            console.error('Template analyze parse error:', parseErr.message, text.substring(0, 300))
            // Fallback: return the raw text as promptFormula with default elements
            parsed = {
                promptFormula: text,
                elements: [
                    { type: 'text', role: 'headline', label: 'Headline', default: '', style: 'bold, large' },
                    { type: 'text', role: 'subtext', label: 'Subtext', default: '', style: 'medium' },
                    { type: 'text', role: 'cta', label: 'Call to Action', default: 'Shop Now', style: 'button' },
                ],
                colorPalette: [],
                layoutDescription: 'Standard layout'
            }
        }

        // Validate and clean elements
        const elements = (parsed.elements || []).map((el, i) => ({
            type: ['text', 'image', 'color', 'select'].includes(el.type) ? el.type : 'text',
            role: el.role || `element_${i}`,
            label: el.label || `Element ${i + 1}`,
            default: el.default || '',
            style: el.style || '',
            description: el.description || '',
            options: Array.isArray(el.options) ? el.options : [],
        }))

        console.log(`🔍 Template analysis: ${elements.length} elements detected (${elements.filter(e => e.type === 'text').length} text, ${elements.filter(e => e.type === 'image').length} image, ${elements.filter(e => e.type === 'color').length} color)`)

        res.json({
            promptFormula: parsed.promptFormula || '',
            elements,
            layoutDescription: parsed.layoutDescription || '',
            colorPalette: Array.isArray(parsed.colorPalette) ? parsed.colorPalette : [],
        })
    } catch (err) {
        console.error('AI template analyze error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-generate — Generate image from text prompt (+ optional reference images)
router.post('/ai-generate', protect, requireCredits('canvasGenerate'), async (req, res) => {
    try {
        const { prompt, size = '1024x1024', referenceImages = [], brandId } = req.body
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        // ── MCoT: Visual Grounding (if brand context available) ──
        let mcotGrounding = null;
        let brandVisualInjection = '';
        if (brandId) {
            try {
                console.log(`🧠 MCoT Canvas: Loading brand context for ${brandId}...`);
                const brand = await Brand.findById(brandId).select('dna name logo').lean();
                const products = await Product.find({ brand: brandId, status: 'active' }).select('images title').limit(5).lean();
                
                // Collect brand/product images for visual analysis
                const brandImages = [
                    ...(brand?.logo?.url ? [brand.logo.url] : []),
                    ...(brand?.dna?.brandImages || []).filter(i => i.url).map(i => i.url).slice(0, 3),
                    ...products.flatMap(p => (p.images || []).filter(i => i.url).map(i => i.url)).slice(0, 3),
                ].filter(Boolean).slice(0, 5);

                if (brandImages.length > 0) {
                    console.log(`🧠 MCoT Canvas: Bypassing explicit brand visual grounding for generation speed.`);
                    // grounding skipped to save 3-5s of latency per generate click
                }
            } catch (mcotErr) {
                console.warn('🧠 MCoT Canvas: Visual grounding failed (non-blocking):', mcotErr.message);
            }
        }

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const models = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
        let imageUrl = null

        // Build multimodal parts — reference images first, then text prompt
        const parts = []
        for (const ref of referenceImages.slice(0, 4)) {
            try {
                if (ref.startsWith('http://') || ref.startsWith('https://')) {
                    // S3 URL or external URL — fetch server-side and convert to base64
                    const imgResp = await fetch(ref)
                    if (imgResp.ok) {
                        const buffer = await imgResp.arrayBuffer()
                        const base64Data = Buffer.from(buffer).toString('base64')
                        const contentType = imgResp.headers.get('content-type') || 'image/jpeg'
                        parts.push({ inlineData: { mimeType: contentType, data: base64Data } })
                    }
                } else {
                    // base64 data URI
                    const base64Data = ref.includes('base64,') ? ref.split('base64,')[1] : ref
                    const mimeType = ref.startsWith('data:') ? ref.split(';')[0].split(':')[1] : 'image/png'
                    parts.push({ inlineData: { mimeType, data: base64Data } })
                }
            } catch (e) {
                console.warn('Failed to process reference image:', e.message)
            }
        }
        const refCount = parts.length
        
        let dynamicSynthesisPrompt = ''
        if (refCount > 1) {
            console.log(`🧠 MCoT Canvas: Multi-subject reference detected. Synthesizing ${refCount} images...`)
            try {
                const synthesis = await agentUtils.callMultimodalAgent(
                    `You are an elite creative analyst. The user has provided ${refCount} reference images and wants: "${prompt}".`,
                    `For EACH attached image, output a labeled block like this:
IMAGE 1 SUBJECT: [Describe the exact person/object — age, gender, skin tone, hair color/style, clothing, build, expression, distinguishing features]
IMAGE 2 SUBJECT: [Same level of detail for the second image]
...and so on for all images.

Then write:
COMBINED SCENE: [A single paragraph describing ALL subjects together in the scene the user wants: "${prompt}". Every subject must appear with their exact appearance preserved.]

Be forensically detailed about each subject's appearance so the image generator cannot hallucinate or swap them.`,
                    referenceImages.slice(0, 4),
                    { temperature: 0.1, maxTokens: 1024, returnRaw: true }
                )
                if (synthesis && typeof synthesis === 'string') {
                    dynamicSynthesisPrompt = synthesis.trim()
                    console.log(`🧠 MCoT Canvas: Subject synthesis complete (${dynamicSynthesisPrompt.length} chars)`)
                }
            } catch (e) {
                console.warn('MCoT Synthesis failed for multiple ref images:', e.message)
            }
        }

        const textPrompt = refCount > 1 && dynamicSynthesisPrompt
            ? `CRITICAL INSTRUCTION — MULTI-SUBJECT IMAGE GENERATION:

You have been given ${refCount} reference images. Each image contains a DIFFERENT subject.
DO NOT merge them into one person. DO NOT hallucinate or replace any subject's appearance.
You MUST faithfully reproduce the EXACT appearance of EVERY person/subject from the reference images.

SUBJECT ANALYSIS FROM REFERENCES:
${dynamicSynthesisPrompt}

USER'S CREATIVE BRIEF: ${prompt} (Format/Aspect Ratio required: ${size})
${brandVisualInjection ? `\nBRAND VISUAL DIRECTION: ${brandVisualInjection}` : ''}

ABSOLUTE RULES:
1. Image 1's subject MUST appear exactly as shown in Image 1 — same face, hair, skin tone, build, clothing style
2. Image 2's subject MUST appear exactly as shown in Image 2 — same face, hair, skin tone, build, clothing style
${refCount > 2 ? `3. Image 3's subject MUST appear exactly as shown in Image 3\n` : ''}
- Compose ALL subjects together in a single scene following the user's brief
- Professional lighting, cinematic composition, 4K quality
- DO NOT drop any subject. ALL ${refCount} subjects must be clearly visible and recognizable.

Generate ONE stunning image with ALL subjects faithfully preserved.`
            : refCount > 0
            ? `You are an elite creative director. I have provided ${refCount} reference image(s).
Study the reference carefully — reproduce the EXACT subject appearance (face, body, clothing, features).

INSTRUCTION: ${prompt} (Format/Aspect Ratio required: ${size})
${brandVisualInjection ? `\nBRAND VISUAL DIRECTION: ${brandVisualInjection}` : ''}

RULES:
- Faithfully preserve the subject's appearance from the reference image
- Professional composition, cinematic lighting, 4K quality
- Do NOT hallucinate or change the subject's face, hair, or body

Generate a stunning, gallery-quality image.`
            : `You are an elite creative director and visual artist. Generate a stunning, gallery-quality image with these principles:

INSTRUCTION: ${prompt} (Format/Aspect Ratio required: ${size})
${brandVisualInjection ? `\nBRAND VISUAL DIRECTION: ${brandVisualInjection}` : ''}

CREATIVE PRINCIPLES:
- Color Harmony: Use a sophisticated, harmonious color palette
- Visual Hierarchy: Strong focal point with supporting elements
- Composition: Professional layout using rule of thirds or golden ratio
- Lighting: Cinematic, professional lighting with depth
- Mood: Create an emotional resonance that captivates the viewer
- Detail: Ultra-high quality, crisp details, rich textures

Make it look like it was produced by a world-class creative studio.`
        parts.push({ text: textPrompt })

        const { generateImageWithVertex } = require('../services/vertexImage');

        for (const modelId of models) {
            try {
                const data = await generateImageWithVertex(parts, modelId);
                const resParts = data.candidates?.[0]?.content?.parts || []
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        break
                    }
                }
                if (imageUrl) break
            } catch (err) {
                console.error(`${modelId} failed:`, err.message)
            }
        }

        if (!imageUrl) return res.status(500).json({ error: 'Image generation failed — all models exhausted' })
        
        // Upload Base64 result to S3
        const s3Key = `canvas/${req.user._id}/${Date.now()}.png`;
        let s3Url = null; try { s3Url = await uploadToS3(imageUrl, s3Key, 'image/png'); } catch (e) { console.error('S3 Upload Error:', e.message); }
        
        res.json({ 
            imageUrl: await getSignedUrlIfNeeded(s3Url || imageUrl), 
            model: 'NanoBanana 2', 
            source: s3Url ? 's3' : 'base64', 
            refsUsed: refCount, 
            mcotGrounding: mcotGrounding || undefined 
        })
    } catch (err) {
        console.error('AI generate error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-edit — Edit image with prompt (+ optional additional images for merge/combine)
router.post('/ai-edit', protect, requireCredits('canvasGenerate'), async (req, res) => {
    try {
        const { prompt, imageBase64, additionalImages = [] } = req.body
        if (!prompt || !imageBase64) return res.status(400).json({ error: 'Prompt and imageBase64 required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

        // Helper: convert a URL or base64 string into a Gemini inlineData part
        const toImagePart = async (imgInput) => {
            if (imgInput.startsWith('http://') || imgInput.startsWith('https://')) {
                // Fetch remote image (S3 URL) and convert to base64
                try {
                    const imgResp = await fetch(imgInput)
                    if (!imgResp.ok) return null
                    const buffer = await imgResp.arrayBuffer()
                    const b64 = Buffer.from(buffer).toString('base64')
                    const contentType = imgResp.headers.get('content-type') || 'image/jpeg'
                    return { inlineData: { mimeType: contentType, data: b64 } }
                } catch (e) {
                    console.warn('Failed to fetch image URL for ai-edit:', e.message)
                    return null
                }
            }
            // base64 data URI or raw base64
            const data = imgInput.includes('base64,') ? imgInput.split('base64,')[1] : imgInput
            const mime = imgInput.startsWith('data:') ? imgInput.split(';')[0].split(':')[1] : 'image/png'
            return { inlineData: { mimeType: mime, data } }
        }

        // Build multimodal parts: main image + additional images + text prompt
        const mainPart = await toImagePart(imageBase64)
        if (!mainPart) return res.status(400).json({ error: 'Could not process the main image' })
        const parts = [mainPart]

        // Add individual images (from selected canvas objects)
        for (const addImg of additionalImages.slice(0, 4)) {
            const part = await toImagePart(addImg)
            if (part) parts.push(part)
        }

        const imgCount = parts.length
        
        let dynamicSynthesisPrompt = ''
        if (imgCount > 1) {
            console.log(`🧠 MCoT Canvas: Multi-subject edit detected. Synthesizing ${imgCount} images...`)
            try {
                const synthesis = await agentUtils.callMultimodalAgent(
                    `You are an elite creative analyst. The user has provided ${imgCount} reference images and wants: "${prompt}".`,
                    `For EACH attached image, output a labeled block like this:
IMAGE 1 SUBJECT: [Describe the exact person/object — age, gender, skin tone, hair color/style, clothing, build, expression, distinguishing features]
IMAGE 2 SUBJECT: [Same level of detail for the second image]
...and so on for all images.

Then write:
COMBINED SCENE: [A single paragraph describing ALL subjects together in the scene the user wants: "${prompt}". Every subject must appear with their exact appearance preserved.]

Be forensically detailed about each subject's appearance so the image generator cannot hallucinate or swap them.`,
                    [imageBase64, ...additionalImages].slice(0, 4),
                    { temperature: 0.1, maxTokens: 1024, returnRaw: true }
                )
                if (synthesis && typeof synthesis === 'string') {
                    dynamicSynthesisPrompt = synthesis.trim()
                    console.log(`🧠 MCoT Canvas: Edit subject synthesis complete (${dynamicSynthesisPrompt.length} chars)`)
                }
            } catch (e) {
                console.warn('MCoT Synthesis failed for edit payload:', e.message)
            }
        }

        const editText = imgCount > 1 && dynamicSynthesisPrompt
            ? `CRITICAL INSTRUCTION — MULTI-SUBJECT IMAGE EDIT:

You have been given ${imgCount} reference images. Each image contains a DIFFERENT subject.
DO NOT merge them into one person. DO NOT hallucinate or replace any subject's appearance.
You MUST faithfully reproduce the EXACT appearance of EVERY person/subject from the reference images.

USER'S CREATIVE BRIEF: "${prompt}"

ABSOLUTE RULES:
1. Image 1's subject MUST appear exactly as shown in Image 1 — same face, hair, skin tone, build, clothing style
2. Image 2's subject MUST appear exactly as shown in Image 2 — same face, hair, skin tone, build, clothing style
${imgCount > 2 ? `3. Image 3's subject MUST appear exactly as shown in Image 3\n` : ''}
- Compose ALL subjects together in a single scene following the user's brief
- Professional lighting, cinematic composition, 4K quality
- DO NOT drop any subject. ALL ${imgCount} subjects must be clearly recognizable.

Generate ONE stunning image with ALL subjects faithfully preserved.`
            : `You are Fidato, an elite AI creative director. Edit this image with creative intelligence.

INSTRUCTION: ${prompt}

CREATIVE RULES:
• Keep the overall composition and unaffected areas identical
• Apply changes with professional precision — matching lighting, shadows, and color temperature
• Ensure the edit blends seamlessly with the existing image
• The result should look like it was professionally retouched

Output the modified image.`
        parts.push({ text: editText })

        const { generateImageWithVertex } = require('../services/vertexImage');
        const models = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
        let imageUrl = null

        for (const modelId of models) {
            try {
                const data = await generateImageWithVertex(parts, modelId);
                const resParts = data.candidates?.[0]?.content?.parts || []
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                        break
                    }
                }
                if (imageUrl) break
            } catch (err) {
                console.error(`${modelId} edit failed:`, err.message)
            }
        }

        if (!imageUrl) return res.status(500).json({ error: 'Image editing failed' })
        
        // Upload Base64 result to S3
        const s3Key = `canvas/${req.user._id}/${Date.now()}_edit.png`;
        let s3Url = null; try { s3Url = await uploadToS3(imageUrl, s3Key, 'image/png'); } catch (e) { console.error('S3 Upload Error:', e.message); }
        
        res.json({ 
            imageUrl: await getSignedUrlIfNeeded(s3Url || imageUrl), 
            model: 'NanoBanana 2', 
            source: s3Url ? 's3' : 'base64', 
            imagesProcessed: imgCount 
        })
    } catch (err) {
        console.error('AI edit error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-edit-visual — Inpaint with mask (Visual tool)
router.post('/ai-edit-visual', protect, requireCredits('canvasGenerate'), async (req, res) => {
    try {
        const { prompt, imageBase64, maskBase64 } = req.body
        if (!prompt || !imageBase64) return res.status(400).json({ error: 'Prompt and imageBase64 required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
        const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'

        // Build parts array — image + optional mask + inpaint prompt
        const parts = [
            { inlineData: { mimeType, data: base64Data } },
        ]
        if (maskBase64) {
            const maskData = maskBase64.includes('base64,') ? maskBase64.split('base64,')[1] : maskBase64
            const maskMime = maskBase64.startsWith('data:') ? maskBase64.split(';')[0].split(':')[1] : 'image/png'
            parts.push({ inlineData: { mimeType: maskMime, data: maskData } })
            parts.push({ text: `INPAINTING TASK: I have provided two images. The first is the original photo. The second is a black-and-white mask where WHITE areas mark the region to edit. CRITICAL RULES: (1) Edit ONLY the white-masked region according to this instruction: "${prompt}". (2) Every pixel outside the white mask must remain EXACTLY as in the original — do not change colors, lighting, composition, or any detail outside the mask. (3) Blend the edited region seamlessly with the surrounding original content. Output the complete image with only the masked area modified.` })
        } else {
            parts.push({ text: `Edit this image: ${prompt}. Keep all unaffected areas identical. Output the modified image.` })
        }

        const { generateImageWithVertex } = require('../services/vertexImage');
        const modelId = 'gemini-3.1-flash-image-preview'
        const data = await generateImageWithVertex(parts, modelId);
        
        const resParts = data.candidates?.[0]?.content?.parts || []
        let imageUrl = null
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                break
            }
        }
        if (!imageUrl) return res.status(500).json({ error: 'Inpainting failed — no image returned' })
        
        // Upload Base64 result to S3
        const s3Key = `canvas/${req.user._id}/${Date.now()}_visual.png`;
        let s3Url = null; try { s3Url = await uploadToS3(imageUrl, s3Key, 'image/png'); } catch (e) { console.error('S3 Upload Error:', e.message); }
        
        res.json({ 
            imageUrl: await getSignedUrlIfNeeded(s3Url || imageUrl), 
            model: 'Gemini Flash', 
            source: s3Url ? 's3' : 'base64' 
        })
    } catch (err) {
        console.error('AI visual edit error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-retouch — Retouch/Replace masked area
router.post('/ai-retouch', protect, requireCredits('canvasGenerate'), async (req, res) => {
    try {
        const { prompt, imageBase64, maskBase64, replaceImageBase64 } = req.body
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
        const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'

        const parts = [{ inlineData: { mimeType, data: base64Data } }]

        if (maskBase64) {
            const maskData = maskBase64.includes('base64,') ? maskBase64.split('base64,')[1] : maskBase64
            const maskMime = maskBase64.startsWith('data:') ? maskBase64.split(';')[0].split(':')[1] : 'image/png'
            parts.push({ inlineData: { mimeType: maskMime, data: maskData } })
        }

        if (replaceImageBase64) {
            const replData = replaceImageBase64.includes('base64,') ? replaceImageBase64.split('base64,')[1] : replaceImageBase64
            const replMime = replaceImageBase64.startsWith('data:') ? replaceImageBase64.split(';')[0].split(':')[1] : 'image/png'
            parts.push({ inlineData: { mimeType: replMime, data: replData } })
            parts.push({ text: `REPLACE TASK: I have provided three images. (1) The original image. (2) A black-and-white mask where WHITE marks the area to replace. (3) A replacement image — use its content to fill the masked area. CRITICAL: Keep all pixels outside the white mask EXACTLY the same. Blend the replacement seamlessly. ${prompt || 'Make the replacement look natural.'}. Output the complete modified image.` })
        } else {
            parts.push({ text: `RETOUCH TASK: I have provided an image and a black-and-white mask. WHITE areas in the mask indicate the region to retouch. ${prompt || 'Clean up and retouch the masked area to look seamless and natural'}. CRITICAL: Keep all pixels outside the white mask EXACTLY the same. Output the complete modified image.` })
        }

        const { generateImageWithVertex } = require('../services/vertexImage');
        const modelId = 'gemini-3.1-flash-image-preview'
        const data = await generateImageWithVertex(parts, modelId);
        const resParts = data.candidates?.[0]?.content?.parts || []
        let imageUrl = null
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                break
            }
        }
        if (!imageUrl) return res.status(500).json({ error: 'Retouch failed — no image returned' })
        
        // Upload Base64 result to S3
        const s3Key = `canvas/${req.user._id}/${Date.now()}_retouch.png`;
        let s3Url = null; try { s3Url = await uploadToS3(imageUrl, s3Key, 'image/png'); } catch (e) { console.error('S3 Upload Error:', e.message); }
        
        res.json({ 
            imageUrl: await getSignedUrlIfNeeded(s3Url || imageUrl), 
            model: 'Gemini Flash', 
            source: s3Url ? 's3' : 'base64' 
        })
    } catch (err) {
        console.error('AI retouch error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-background — Remove or replace background
router.post('/ai-background', protect, requireCredits('canvasBgRemove'), async (req, res) => {
    try {
        const { imageBase64, action = 'remove', bgPrompt } = req.body
        if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
        const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'

        let promptText
        if (action === 'remove') {
            promptText = 'Remove the background from this image completely. Make the background fully transparent or pure white. Keep the main foreground subject(s) perfectly intact with clean edges. Do not alter the subject in any way. Output the image with the background removed.'
        } else {
            promptText = `Replace ONLY the background of this image with: ${bgPrompt || 'a clean, professional studio background'}. CRITICAL: Keep the foreground subject(s) completely identical — same pose, same colors, same details. Only change what is behind/around the subject. Blend the new background seamlessly. Output the full modified image.`
        }

        const { generateImageWithVertex } = require('../services/vertexImage');
        const modelId = 'gemini-3.1-flash-image-preview'
        const parts = [
            { inlineData: { mimeType, data: base64Data } },
            { text: promptText },
        ];
        const data = await generateImageWithVertex(parts, modelId);
        const resParts = data.candidates?.[0]?.content?.parts || []
        let imageUrl = null
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                break
            }
        }
        if (!imageUrl) return res.status(500).json({ error: 'Background operation failed — no image returned' })
        
        // Upload Base64 result to S3
        const s3Key = `canvas/${req.user._id}/${Date.now()}_background.png`;
        let s3Url = null; try { s3Url = await uploadToS3(imageUrl, s3Key, 'image/png'); } catch (e) { console.error('S3 Upload Error:', e.message); }
        
        res.json({ 
            imageUrl: await getSignedUrlIfNeeded(s3Url || imageUrl), 
            action, 
            model: 'Gemini Flash', 
            source: s3Url ? 's3' : 'base64' 
        })
    } catch (err) {
        console.error('AI background error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-creative-generate — Keywords → Editable Design Layout
router.post('/ai-creative-generate', protect, async (req, res) => {
    try {
        const { keywords, style = 'modern', canvasWidth = 1080, canvasHeight = 1080, brandName, brandColors, brandFonts } = req.body
        if (!keywords) return res.status(400).json({ error: 'Keywords are required' })

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const colorStr = Array.isArray(brandColors) && brandColors.length > 0
            ? `Brand colors: ${brandColors.join(', ')}.`
            : 'Use sophisticated, modern colors.'
        const fontStr = Array.isArray(brandFonts) && brandFonts.length > 0
            ? `Preferred fonts: ${brandFonts.join(', ')}.`
            : 'Use modern Google Fonts like Inter, Poppins, Playfair Display, Bebas Neue, DM Sans.'

        const prompt = `You are an expert graphic designer. Create a structured design layout for a ${canvasWidth}x${canvasHeight}px canvas.

DESIGN BRIEF:
- Keywords: ${keywords}
- Style: ${style}
- Brand: ${brandName || 'Generic'}
- ${colorStr}
- ${fontStr}

CRITICAL RULES:
1. Return ONLY valid JSON (no markdown, no backticks)
2. All x/y/w/h values are in pixels relative to ${canvasWidth}x${canvasHeight} canvas
3. Include 3-8 elements — mix of text, rect, and line types
4. For text elements: use realistic marketing copy based on the keywords
5. Place elements with proper spacing and visual hierarchy
6. Use the brand colors if provided, or colors matching the style
7. Ensure text contrasts well against the background

Return this exact JSON structure:
{
  "background": "#hex_color",
  "elements": [
    {
      "type": "text",
      "text": "Actual text content",
      "x": 100,
      "y": 100,
      "w": 800,
      "font": "Font Name",
      "size": 64,
      "weight": "700",
      "color": "#ffffff",
      "align": "center",
      "tracking": 0,
      "label": "Headline"
    },
    {
      "type": "rect",
      "x": 0,
      "y": 900,
      "w": 1080,
      "h": 180,
      "color": "#6366f1",
      "radius": 0,
      "label": "Footer Bar"
    },
    {
      "type": "line",
      "x1": 100,
      "y1": 500,
      "x2": 980,
      "y2": 500,
      "color": "#ffffff",
      "strokeWidth": 2,
      "label": "Divider"
    }
  ]
}`

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const url = `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        console.log('🎨 AI Creative Generate: calling Gemini for layout...')
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)

        // Extract text from all parts (gemini-2.5 may return thought + text parts)
        const allParts = data.candidates?.[0]?.content?.parts || []
        let text = ''
        for (const p of allParts) {
            if (p.text && !p.thought) text += p.text
        }
        text = text || '{}'
        console.log('🎨 AI Creative Generate response length:', text.length, 'chars')

        // Parse the JSON response
        let layout
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            layout = jsonMatch ? JSON.parse(jsonMatch[0]) : { background: '#1a1a2e', elements: [] }
        } catch (parseErr) {
            console.error('AI creative parse error:', parseErr.message, text.substring(0, 300))
            layout = { background: '#1a1a2e', elements: [{ type: 'text', text: keywords, x: 100, y: 100, w: 800, font: 'Inter', size: 48, weight: '700', color: '#ffffff', label: 'Headline' }] }
        }

        console.log(`🎨 AI Creative Generate: ${layout.elements?.length || 0} elements created`)
        res.json({ layout, backgroundImage: null })
    } catch (err) {
        console.error('AI creative generate error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-copy — Generate marketing copy
router.post('/ai-copy', protect, async (req, res) => {
    try {
        const { prompt, brandName, brandVoice, type = 'all' } = req.body
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const url = `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [{
                        text: `You are a world-class copywriter. Generate marketing copy for:
Brand: ${brandName || 'a brand'}
Voice: ${brandVoice || 'professional, friendly'}
Topic/Prompt: ${prompt}

Return ONLY valid JSON (no markdown backticks) with these fields:
{
  "headline": "A powerful, attention-grabbing headline (max 10 words)",
  "tagline": "A catchy tagline or subheadline (max 15 words)",
  "body": "A compelling body copy paragraph (2-3 sentences)",
  "cta": "A call-to-action button text (2-4 words)",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`
                    }]
                }],
                generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        const copy = jsonMatch ? JSON.parse(jsonMatch[0]) : { headline: text }
        res.json({ copy })
    } catch (err) {
        console.error('AI copy error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})
// ── Unsplash Photo Search Proxy ──
// Proxies search requests to Unsplash API to keep credentials server-side
router.get('/photos', protect, async (req, res) => {
    try {
        const key = process.env.UNSPLASH_ACCESS_KEY
        if (!key) {
            return res.json({
                results: [],
                message: 'UNSPLASH_ACCESS_KEY not configured. Add it to .env to enable photo search.',
                setup_required: true,
            })
        }
        const q = req.query.q || 'nature'
        const page = req.query.page || 1
        const perPage = req.query.per_page || 20
        const orientation = req.query.orientation || ''

        let url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}`
        if (orientation) url += `&orientation=${orientation}`

        const resp = await fetch(url, {
            headers: { Authorization: `Client-ID ${key}` },
        })
        if (!resp.ok) throw new Error(`Unsplash API error: ${resp.status}`)
        const data = await resp.json()

        // Return simplified results
        res.json({
            results: (data.results || []).map(p => ({
                id: p.id,
                thumb: p.urls?.thumb,
                small: p.urls?.small,
                regular: p.urls?.regular,
                full: p.urls?.full,
                alt: p.alt_description || p.description || '',
                author: p.user?.name || '',
                width: p.width,
                height: p.height,
            })),
            total: data.total || 0,
            total_pages: data.total_pages || 0,
        })
    } catch (err) {
        console.error('Unsplash proxy error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// ── Random / Trending Photos ──
router.get('/photos/random', protect, async (req, res) => {
    try {
        const key = process.env.UNSPLASH_ACCESS_KEY
        if (!key) return res.json({ results: [], setup_required: true })

        const count = req.query.count || 12
        const resp = await fetch(`https://api.unsplash.com/photos/random?count=${count}`, {
            headers: { Authorization: `Client-ID ${key}` },
        })
        if (!resp.ok) throw new Error(`Unsplash API error: ${resp.status}`)
        const data = await resp.json()

        res.json({
            results: (data || []).map(p => ({
                id: p.id,
                thumb: p.urls?.thumb,
                small: p.urls?.small,
                regular: p.urls?.regular,
                alt: p.alt_description || '',
                author: p.user?.name || '',
                width: p.width,
                height: p.height,
            })),
        })
    } catch (err) {
        console.error('Unsplash random error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// ── Pixabay Textures & Overlays Proxy ──
router.get('/textures', protect, async (req, res) => {
    try {
        const key = process.env.PIXABAY_API_KEY
        if (!key) {
            return res.json({
                hits: [],
                message: 'PIXABAY_API_KEY not configured. Add it to .env to enable texture search.',
                setup_required: true,
            })
        }
        const q = req.query.q || 'texture'
        const page = req.query.page || 1
        const perPage = req.query.per_page || 20
        const imageType = req.query.image_type || 'photo'

        const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&image_type=${imageType}&per_page=${perPage}&page=${page}&safesearch=true`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Pixabay API error: ${resp.status}`)
        const data = await resp.json()

        res.json({
            hits: (data.hits || []).map(h => ({
                id: h.id,
                thumb: h.previewURL,
                web: h.webformatURL,
                large: h.largeImageURL,
                tags: h.tags,
                user: h.user,
                width: h.imageWidth,
                height: h.imageHeight,
            })),
            total: data.totalHits || 0,
        })
    } catch (err) {
        console.error('Pixabay proxy error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// ══════════════════════════════════════════════════════════════════════
// POST /api/canvas-assets/smart-adapt — Smart Design Adaptation Engine
// Powered by Gemini: intelligently repositions/rescales all canvas elements
// to fit target platform sizes while preserving visual hierarchy & brand DNA
// ══════════════════════════════════════════════════════════════════════
router.post('/smart-adapt', protect, requireCredits('canvasGenerate'), async (req, res) => {
    try {
        const { elements, sourceWidth, sourceHeight, targetPresets, brand } = req.body

        if (!elements?.length) return res.status(400).json({ error: 'Canvas elements are required' })
        if (!targetPresets?.length) return res.status(400).json({ error: 'At least one target preset is required' })

        const apiKey = process.env.GEMINI_API_KEY
        if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        console.log(`🎨 [SmartAdapt] Adapting ${elements.length} elements to ${targetPresets.length} platform sizes`)
        const startTime = Date.now()

        // ── PRESET DIMENSIONS MAP ──
        const PRESET_MAP = {
            'ig-post':         { w: 1080, h: 1350, label: 'Instagram Post (4:5)',    aspectRatio: '4:5',    orientation: 'portrait' },
            'ig-post-square':  { w: 1080, h: 1080, label: 'Instagram Square (1:1)',  aspectRatio: '1:1',    orientation: 'square' },
            'ig-story':        { w: 1080, h: 1920, label: 'Instagram Story (9:16)',  aspectRatio: '9:16',   orientation: 'portrait-tall' },
            'ig-reel':         { w: 1080, h: 1920, label: 'Instagram Reel (9:16)',   aspectRatio: '9:16',   orientation: 'portrait-tall' },
            'fb-post':         { w: 1200, h: 630,  label: 'Facebook Post (1.91:1)', aspectRatio: '1.91:1', orientation: 'landscape' },
            'fb-story':        { w: 1080, h: 1920, label: 'Facebook Story (9:16)',  aspectRatio: '9:16',   orientation: 'portrait-tall' },
            'linkedin':        { w: 1200, h: 628,  label: 'LinkedIn (1.91:1)',       aspectRatio: '1.91:1', orientation: 'landscape' },
            'yt-thumb':        { w: 1280, h: 720,  label: 'YouTube Thumbnail (16:9)',aspectRatio: '16:9',   orientation: 'landscape' },
            'twitter':         { w: 1600, h: 900,  label: 'Twitter/X (16:9)',        aspectRatio: '16:9',   orientation: 'landscape' },
            'whatsapp-status': { w: 1080, h: 1920, label: 'WhatsApp Status (9:16)',  aspectRatio: '9:16',   orientation: 'portrait-tall' },
            'carousel':        { w: 1080, h: 1080, label: 'Carousel (1:1)',          aspectRatio: '1:1',    orientation: 'square' },
            'pinterest':       { w: 1000, h: 1500, label: 'Pinterest Pin (2:3)',     aspectRatio: '2:3',    orientation: 'portrait' },
            'banner':          { w: 1920, h: 600,  label: 'Web Banner (~3.2:1)',     aspectRatio: '~3.2:1', orientation: 'ultra-wide' },
            'banner-square':   { w: 1200, h: 1200, label: 'Display Ad (1:1)',        aspectRatio: '1:1',    orientation: 'square' },
        }

        // ── ASSIGN SEMANTIC ROLES TO ELEMENTS ──
        // Infer role from element properties so the AI gets a labeled layer tree
        // NOTE: Convert centered-origin positions to true top-left for correct layout
        const labeledElements = elements.map((el, i) => {
            let role = el._role || 'decoration'
            const name = (el.customName || el.name || '').toLowerCase()
            const text = (el.text || '').toLowerCase()
            const nodeType = el._nodeType || ''

            if (nodeType === 'logo' || name.includes('logo')) role = 'logo'
            else if (nodeType === 'product' || name.includes('product')) role = 'product-image'
            else if (el.type === 'image' && i === 0) role = 'background-image'
            else if (el.type === 'image') role = 'product-image'
            else if (el.type === 'rect' && i <= 1) role = 'background'
            else if (el.type === 'textbox' || el.type === 'i-text') {
                const fontSize = el.fontSize || 24
                if (fontSize >= 48 || name.includes('heading') || name.includes('headline') || name.includes('title')) role = 'headline'
                else if (fontSize >= 28) role = 'subheadline'
                else if (text.includes('\u20b9') || text.includes('$') || name.includes('price')) role = 'price'
                else if (name.includes('cta') || name.includes('button') || text.includes('shop') || text.includes('buy') || text.includes('order')) role = 'cta'
                else if (name.includes('feature') || name.includes('bullet')) role = 'feature-point'
                else if (name.includes('tagline') || name.includes('sub')) role = 'tagline'
                else role = 'body-text'
            } else if (el.type === 'rect' || el.type === 'circle' || el.type === 'ellipse') role = 'shape'
            else if (nodeType === 'shape') role = 'shape'

            // Convert centered-origin position to true top-left
            const elW = Math.round(el.width), elH = Math.round(el.height)
            let trueLeft = Math.round(el.left), trueTop = Math.round(el.top)
            if (el.originX === 'center') trueLeft = trueLeft - elW / 2
            if (el.originY === 'center') trueTop = trueTop - elH / 2

            return {
                id: el.id || `el-${i}`,
                index: i,
                type: el.type,
                role,
                name: el.customName || el.name || `Layer ${i + 1}`,
                text: el.text ? el.text.substring(0, 200) : null,
                src: el.src ? el.src.substring(0, 80) : null,
                // Position and size as percentages of source canvas (portable across sizes)
                xPct: Math.round((trueLeft / sourceWidth) * 1000) / 10,
                yPct: Math.round((trueTop / sourceHeight) * 1000) / 10,
                wPct: Math.round((elW / sourceWidth) * 1000) / 10,
                hPct: Math.round((elH / sourceHeight) * 1000) / 10,
                // Raw px values for reference
                left: trueLeft, top: trueTop,
                width: elW, height: elH,
                fontSize: el.fontSize || null,
                fontWeight: el.fontWeight || null,
                fill: el.fill || null,
                opacity: el.opacity ?? 1,
                zIndex: i,
            }
        })

        // ── COMPOSE AI PROMPT ──
        const systemPrompt = `You are an expert graphic design layout engine. Your job is to intelligently adapt a visual design layout to multiple platform sizes.

CORE PRINCIPLES:
1. Preserve visual hierarchy — headline stays most prominent, product/hero image stays focal
2. Maintain brand DNA — colors, style, personality unchanged
3. Smart overflow handling — if space is tight, SHRINK size/font, not remove elements (unless truly forced)
4. Anchor critical elements — logo always near top, CTA always near bottom
5. Adapt spacing proportionally — elements spaced relative to canvas, not fixed px
6. For landscape formats (FB, LinkedIn, YT, Twitter/Banner): arrange elements horizontally (image left, text right)
7. For portrait formats (IG Post, Story, Reel, Pinterest): stack elements vertically, full-width
8. For square formats (IG Square, Carousel, Display Ad): balanced centered layout

LAYOUT RULES BY ROLE:
- background/background-image: ALWAYS fill full canvas (x:0, y:0, w:100%, h:100%)
- logo: top corner (top-left or top-right), small (5-8% of canvas height), never scaled up
- headline: 60-80% canvas width, top 30-50% of canvas, font 4-6% of canvas height
- subheadline: just below headline, font 2-3% of canvas height
- product-image: center or dominant (40-60% of canvas), no cropping allowed
- feature-point: stack below subheadline, reduce font if needed (1.5-2% of canvas height)
- price: near CTA, medium-bold prominence
- cta: bottom 15-20% of canvas, centered or right-aligned
- tagline: very small, near bottom or top, 1-1.5% canvas height
- shape/decoration: scale proportionally with canvas

OUTPUT FORMAT — Return ONLY valid JSON like this:
{
  "adaptations": {
    "ig-post": {
      "canvasWidth": 1080,
      "canvasHeight": 1350,
      "label": "Instagram Post (4:5)",
      "layoutStrategy": "Vertical portrait stack — product image top 50%, text block bottom 50%, CTA anchored at bottom",
      "elements": [
        {
          "id": "el-0",
          "role": "background",
          "x": 0, "y": 0, "w": 1080, "h": 1350,
          "fontSize": null,
          "opacity": 1,
          "visible": true,
          "notes": "Full-canvas background fill"
        }
      ]
    }
  }
}`

        const userPrompt = `SOURCE CANVAS: ${sourceWidth}×${sourceHeight}px
BRAND: ${brand?.name || 'Not specified'}
BRAND COLORS: ${brand?.dna?.brandColors?.map?.(c => c.hex)?.join(', ') || 'Not specified'}

CURRENT LAYOUT ELEMENTS (${labeledElements.length} elements):
${JSON.stringify(labeledElements, null, 2)}

TARGET PLATFORM SIZES TO ADAPT TO:
${targetPresets.map(p => {
    const spec = PRESET_MAP[p]
    return spec ? `- ${p}: ${spec.w}×${spec.h}px (${spec.label}, ${spec.orientation})` : `- ${p}: unknown preset`
}).join('\n')}

For each target platform, return the adapted layout spec. For EVERY element in the source layout:
1. Calculate new x, y, w, h in PIXELS (not percentages) for the target canvas size
2. Adjust fontSize proportionally to target canvas height  
3. Set visible=false ONLY if there is truly no space (rare)
4. Add a brief "notes" field explaining your layout decision for that element

Remember: landscape formats = horizontal split, portrait = vertical stack, square = centered balanced.
Return ONLY valid JSON, no explanation text outside the JSON.`

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const modelsToTry = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-1.5-pro']
        let resp, data

        // Try models in order until one works
        for (const modelName of modelsToTry) {
            try {
                const controller = new AbortController()
                const timeoutId = setTimeout(() => controller.abort(), 28000) // 28s timeout
                const url = `${baseUrl}/models/${modelName}:generateContent?key=${apiKey}`
                console.log(`   [SmartAdapt] Trying model: ${modelName}`)
                resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
                        generationConfig: { temperature: 0.15, maxOutputTokens: 6144 },
                    }),
                    signal: controller.signal,
                })
                clearTimeout(timeoutId)
                data = await resp.json()
                if (data.error) {
                    const errMsg = (data.error.message || '').toLowerCase()
                    const isRetryable = resp.status === 503
                        || errMsg.includes('503')
                        || errMsg.includes('overloaded')
                        || errMsg.includes('high demand')
                        || errMsg.includes('no longer available')
                        || errMsg.includes('deprecated')
                        || errMsg.includes('not found')
                        || resp.status === 404
                        || resp.status === 400 && errMsg.includes('model')
                    if (isRetryable) {
                        console.warn(`   [SmartAdapt] ${modelName} unavailable (${resp.status}): ${data.error.message?.substring(0, 80)}. Trying next...`)
                        data = null
                        continue
                    }
                    throw new Error(data.error.message)
                }
                console.log(`   [SmartAdapt] ✅ Using ${modelName} successfully`)
                break // Success
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    console.warn(`   [SmartAdapt] ${modelName} timed out after 28s, trying next...`)
                    data = null
                    continue
                }
                throw fetchErr
            }
        }

        if (!data) throw new Error('All Gemini models unavailable for SmartAdapt — please try again shortly')

        // Extract text from all parts (gemini-2.5 may return thought + text parts)
        const allParts = data.candidates?.[0]?.content?.parts || []
        let text = ''
        for (const p of allParts) {
            if (p.text && !p.thought) text += p.text
        }

        // Parse JSON response
        let parsed
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/)
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
        } catch (e) {
            console.error('[SmartAdapt] JSON parse failed:', e.message, text.substring(0, 300))
            return res.status(500).json({ error: 'AI returned unparseable layout spec — please try again' })
        }

        if (!parsed?.adaptations) {
            return res.status(500).json({ error: 'AI did not return expected adaptations format' })
        }

        console.log(`✅ [SmartAdapt] Done in ${Date.now() - startTime}ms — ${Object.keys(parsed.adaptations).length} platform layouts generated`)
        res.json({
            success: true,
            sourceWidth, sourceHeight,
            labeledElements, // Return labeled elements for FE re-rendering
            adaptations: parsed.adaptations,
            presetsProcessed: Object.keys(parsed.adaptations).length,
        })
    } catch (err) {
        console.error('[SmartAdapt] Error:', err.message)
        res.status(500).json({ error: err.message })
    }
})

// POST /api/canvas-assets/analyze-composition — Analyzes template + references to build a master generation prompt
router.post('/analyze-composition', protect, async (req, res) => {
    try {
        const { templateUrl, productUrl, characterUrl, styleUrl, brandName } = req.body;
        
        if (!templateUrl && !productUrl && !characterUrl && !styleUrl) {
            return res.status(400).json({ success: false, error: 'At least one reference image is required' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(400).json({ success: false, error: 'GEMINI_API_KEY not configured' });

        const parts = [];
        const labels = [];
        
        // Helper
        async function loadPart(url, label) {
            if (!url) return;
            const part = await fetchImageAsInlineData(url);
            if (part) {
                parts.push(part);
                labels.push(label);
            }
        }

        if (templateUrl) await loadPart(templateUrl, 'IMAGE 1: The Design Template (LAYOUT BLUEPRINT)');
        if (productUrl) await loadPart(productUrl, `IMAGE ${parts.length + 1}: The Hero Product to insert`);
        if (characterUrl) await loadPart(characterUrl, `IMAGE ${parts.length + 1}: The Character/Model to feature`);
        if (styleUrl) await loadPart(styleUrl, `IMAGE ${parts.length + 1}: The Style/Mood Reference`);

        let promptText = `Act as an expert AI Art Director. I am providing you with reference images.
Your task is to write a highly detailed, descriptive generation prompt that merges these elements into a stunning Campaign Shot.

CRITICAL RULES:
${templateUrl ? "1. The Template (Image 1) is the ABSOLUTE LAYOUT BLUEPRINT. You MUST deeply analyze and explicitly describe its contents: How is the person posing? Are they sitting, standing, leaning? What are they wearing? What is the background, environment, and lighting? Describe the exact composition and typography placement." : "1. Create a stunning, high-end Campaign Shot poster composition."}
2. If a Product image is provided, explicitly describe how to integrate it naturally into the scene described in Rule 1.
3. If a Character image is provided, explicitly instruct that the person in the final image must be THIS exact character, but they MUST adopt the exact pose, body language, and clothing style seen in the Template (Image 1).
4. If a Style Reference is provided, adapt the mood, lighting, and color palette to match it.
5. Do NOT just say "exactly replicating the composition." You must physically DESCRIBE the composition in deep detail so an image model can recreate it without seeing the template.
6. The output MUST be just the prompt itself—no pleasantries, no quotes. Start directly with the visual description.
7. Provide a complete, highly-detailed description without any length constraints. Do not abruptly cut off.
8. Mention the brand name: ${brandName || 'The Brand'}.

Write the detailed generation prompt now:`;

        parts.push({ text: labels.join('\n\n') + '\n\n' + promptText });

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
        const modelsToTry = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'];
        
        let data = null;
        let lastError = null;

        for (const modelId of modelsToTry) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${apiKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
                    }),
                    signal: AbortSignal.timeout(30_000),
                });

                data = await resp.json();
                
                if (data.error) {
                    const errMsg = data.error.message?.toLowerCase() || '';
                    const isRetryable = resp.status === 503 
                        || resp.status === 429 
                        || errMsg.includes('overloaded') 
                        || errMsg.includes('high demand')
                        || errMsg.includes('temporarily down')
                        || errMsg.includes('no longer available')
                        || errMsg.includes('deprecated')
                        || errMsg.includes('not found')
                        || resp.status === 404
                        || (resp.status === 400 && errMsg.includes('model'));
                        
                    if (isRetryable) {
                        console.warn(`   [AnalyzeComp] ${modelId} unavailable (${resp.status}): ${data.error.message?.substring(0, 80)}. Trying next...`);
                        lastError = new Error(data.error.message);
                        data = null;
                        continue;
                    }
                    throw new Error(data.error.message);
                }
                console.log(`   [AnalyzeComp] ✅ Using ${modelId} successfully`);
                break; // Success
            } catch (fetchErr) {
                if (fetchErr.name === 'AbortError') {
                    console.warn(`   [AnalyzeComp] ${modelId} timed out after 30s, trying next...`);
                    lastError = fetchErr;
                    data = null;
                    continue;
                }
                throw fetchErr;
            }
        }

        if (!data) throw lastError || new Error('All Gemini models unavailable for composition analysis — please try again shortly');

        let detailedPrompt = '';
        const allParts = data.candidates?.[0]?.content?.parts || [];
        for (const p of allParts) {
            if (p.text && !p.thought) detailedPrompt += p.text;
        }

        res.json({ success: true, prompt: detailedPrompt.trim() });

    } catch (error) {
        console.error('❌ Error analyzing composition:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router

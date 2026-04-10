import express from 'express'
import { getOrchestrator } from '../agents/orchestrator.js'
import { protect } from '../middleware/auth.js'
import { requireCredits } from '../middleware/credits.js'
import { URL } from 'url'
import { safeErrorMessage } from '../utils/safeError.js';
import { uploadToS3, getSignedUrlIfNeeded } from '../utils/s3.js';
import { callMultimodalAgent, loadBrandContext } from '../agents/shared/agentUtils.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
const router = express.Router()

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

// POST /api/canvas-assets/ai-analyze — Analyze image and return TEXT description (for reverse prompting)
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
            // Fetch remote image and convert to base64
            try {
                const imgResp = await fetch(imageUrl)
                if (imgResp.ok) {
                    const buffer = await imgResp.arrayBuffer()
                    const base64Data = Buffer.from(buffer).toString('base64')
                    const contentType = imgResp.headers.get('content-type') || 'image/jpeg'
                    imagePart = { inlineData: { mimeType: contentType, data: base64Data } }
                }
            } catch (fetchErr) {
                console.error('Failed to fetch image URL:', fetchErr.message)
            }
        }

        const parts = []
        if (imagePart) parts.push(imagePart)
        parts.push({ text: prompt })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        const url = `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
            try {
                const imgResp = await fetch(imageUrl)
                if (imgResp.ok) {
                    const buffer = await imgResp.arrayBuffer()
                    const base64Data = Buffer.from(buffer).toString('base64')
                    const contentType = imgResp.headers.get('content-type') || 'image/jpeg'
                    imagePart = { inlineData: { mimeType: contentType, data: base64Data } }
                }
            } catch (fetchErr) {
                console.error('Failed to fetch image URL for template analysis:', fetchErr.message)
            }
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
        const url = `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`
        console.log('🔍 Template analysis: calling Gemini 2.5 Flash...')
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
            }),
        })
        const data = await resp.json()
        if (data.error) {
            console.error('🔍 Template analysis Gemini error:', data.error.message)
            throw new Error(data.error.message)
        }

        // Extract text from all parts (gemini-2.5 may return thought + text parts)
        const allParts = data.candidates?.[0]?.content?.parts || []
        let text = ''
        for (const p of allParts) {
            if (p.text && !p.thought) text += p.text
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
                    console.log(`🧠 MCoT Canvas: Analyzing ${brandImages.length} brand images...`);
                    const grounding = await callMultimodalAgent(
                        CANVAS_VISUAL_GROUNDING_PROMPT,
                        `Analyze these ${brandImages.length} images from brand "${brand?.name || 'unknown'}" and extract visual DNA for image generation.`,
                        brandImages,
                        { temperature: 0.2, maxTokens: 2048 }
                    );
                    if (grounding && !grounding.error && !grounding.skipped) {
                        mcotGrounding = grounding;
                        brandVisualInjection = grounding.promptInjection || '';
                        console.log(`🧠 MCoT Canvas: Visual grounding complete — colors: ${(grounding.dominantColors || []).join(', ')}`);
                    }
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
                const synthesis = await callMultimodalAgent(
                    `You are an elite creative analyst. The user has provided ${refCount} reference images and asked for: "${prompt}".`,
                    `Critically analyze each of the attached images. Identify the specific subject (person, object, animal) in EACH image. Then, write a master visual description that clearly features ALL distinct subjects interacting in the same scene as requested by the user's instruction. Be extremely descriptive.`,
                    referenceImages.slice(0, 4),
                    { temperature: 0.2, maxTokens: 1024, returnRaw: true }
                )
                if (synthesis && typeof synthesis === 'string') {
                    dynamicSynthesisPrompt = synthesis.trim()
                    
                    // CRITICAL: Drop raw image parts when fusing multiple subjects. 
                    // Most diffusion APIs fail to composite 2+ separate raw subjects and will collapse them into one.
                    // Relying strictly on the MCoT textual synthesis guarantees both subjects appear.
                    console.log(`🧠 MCoT Canvas: Dropping raw image payloads for pure text-driven MCoT multi-subject fusion.`)
                    parts.splice(0, refCount)
                }
            } catch (e) {
                console.warn('MCoT Synthesis failed for multiple ref images:', e.message)
            }
        }

        const textPrompt = refCount > 0
            ? `You are an elite creative director and visual artist with 20+ years of experience at top agencies. You have extraordinary creative intelligence.

CREATIVE ANALYSIS PROCESS:
1. ANALYZE each reference image: Identify dominant colors, mood, composition style, lighting quality, texture patterns, typography styles, and visual weight distribution
2. EXTRACT creative DNA: Pull the artistic essence — what makes each reference visually powerful
3. SYNTHESIZE: Merge the best creative elements into a cohesive new vision

I have provided ${refCount} reference image(s). Study them deeply. Now create a NEW masterpiece based on this instruction: ${prompt}
${brandVisualInjection ? `\nBRAND VISUAL DIRECTION: ${brandVisualInjection}` : ''}
${dynamicSynthesisPrompt ? `\nSUBJECT SYNTHESIS:\n${dynamicSynthesisPrompt}\n` : ''}

CREATIVE PRINCIPLES TO APPLY:
- Color Harmony: Use complementary/analogous color schemes from the references
- Visual Hierarchy: Guide the eye through focal points, contrast, and spacing
- Composition: Apply rule of thirds, golden ratio, or dynamic symmetry
- Lighting: Professional lighting that creates depth and dimension  
- Mood: Ensure emotional consistency throughout the image
- Detail: Crisp, high-resolution output with rich textures

The output must be a stunning, gallery-quality image that feels like it was crafted by a top creative agency.`
            : `You are an elite creative director and visual artist. Generate a stunning, gallery-quality image with these principles:

INSTRUCTION: ${prompt}
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

        for (const modelId of models) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                    }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error.message)
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
                const synthesis = await callMultimodalAgent(
                    `You are an elite creative analyst. The user has provided ${imgCount} reference images and asked for: "${prompt}".`,
                    `Critically analyze each of the attached images. Identify the specific subject (person, object, animal) in EACH image. Then, write a master visual description that clearly features ALL distinct subjects interacting in the same scene as requested by the user's instruction. Be extremely descriptive.`,
                    [imageBase64, ...additionalImages].slice(0, 4),
                    { temperature: 0.2, maxTokens: 1024, returnRaw: true }
                )
                if (synthesis && typeof synthesis === 'string') {
                    dynamicSynthesisPrompt = synthesis.trim()
                    
                    // CRITICAL: Drop raw image parts when fusing multiple subjects.
                    // Prevent diffusion collapse by executing pure text-driven MCoT.
                    console.log(`🧠 MCoT Canvas: Dropping raw image payloads for pure text-driven MCoT multi-subject edit fusion.`)
                    parts.splice(0, imgCount)
                }
            } catch (e) {
                console.warn('MCoT Synthesis failed for edit payload:', e.message)
            }
        }

        const editText = imgCount > 1
            ? `You are Fidato, an elite AI creative director. Your task is to generate a new image using the provided images strictly as VISUAL REFERENCES.

INSTRUCTION: "${prompt}"
${dynamicSynthesisPrompt ? `\nSUBJECT SYNTHESIS:\n${dynamicSynthesisPrompt}\n` : ''}

CREATIVE RULES:
1. The provided images are your REFERENCE IMAGES (subject and/or style references).
2. You MUST generate a new image that prominently features the exact subjects (e.g. BOTH people, if multiple people are in the synthesis), products, or styles shown in these reference images.
3. Intelligently compose them together into a single cohesive masterpiece based on the instruction.
4. Ensure lighting and shadows are globally consistent.
5. Do NOT hallucinate new products or subjects that conflict with the reference images.
6. The output must be a stunning, unified image. Output the final image.`
            : `You are Fidato, an elite AI creative director. Edit this image with creative intelligence.

INSTRUCTION: ${prompt}

CREATIVE RULES:
• Keep the overall composition and unaffected areas identical
• Apply changes with professional precision — matching lighting, shadows, and color temperature
• Ensure the edit blends seamlessly with the existing image
• The result should look like it was professionally retouched

Output the modified image.`
        parts.push({ text: editText })

        const models = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image']
        let imageUrl = null

        for (const modelId of models) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                    }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error.message)
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

        const modelId = 'gemini-3.1-flash-image-preview'
        const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)
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

        const modelId = 'gemini-3.1-flash-image-preview'
        const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)
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

        const modelId = 'gemini-3.1-flash-image-preview'
        const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    role: 'user',
                    parts: [
                        { inlineData: { mimeType, data: base64Data } },
                        { text: promptText },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
        })
        const data = await resp.json()
        if (data.error) throw new Error(data.error.message)
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

export default router

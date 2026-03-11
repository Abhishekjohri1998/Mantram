import express from 'express'
import { getOrchestrator } from '../agents/orchestrator.js'
import { protect } from '../middleware/auth.js'
import { URL } from 'url'
import { safeErrorMessage } from '../utils/safeError.js';
const router = express.Router()

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
        const url = `${baseUrl}/models/gemini-2.0-flash:generateContent?key=${apiKey}`
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

// POST /api/canvas-assets/ai-generate — Generate image from text prompt
router.post('/ai-generate', protect, async (req, res) => {
    try {
        const { prompt, size = '1024x1024' } = req.body
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        // Nano Banana 2 (recommended for image gen/edit)
        const models = ['gemini-2.0-flash-exp-image-generation']
        let imageUrl = null

        for (const modelId of models) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: `Generate a high-quality image: ${prompt}` }] }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                    }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error.message)
                const parts = data.candidates?.[0]?.content?.parts || []
                for (const part of parts) {
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
        res.json({ imageUrl, model: 'NanoBanana 2' })
    } catch (err) {
        console.error('AI generate error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-edit — Edit image with prompt (inpaint/outpaint)
router.post('/ai-edit', protect, async (req, res) => {
    try {
        const { prompt, imageBase64 } = req.body
        if (!prompt || !imageBase64) return res.status(400).json({ error: 'Prompt and imageBase64 required' })

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY
        if (!imageKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' })

        const baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
        // Extract base64 data from data URI if present
        const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64
        const mimeType = imageBase64.startsWith('data:') ? imageBase64.split(';')[0].split(':')[1] : 'image/png'

        const models = ['gemini-2.0-flash-exp-image-generation']
        let imageUrl = null

        for (const modelId of models) {
            try {
                const url = `${baseUrl}/models/${modelId}:generateContent?key=${imageKey}`
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [
                                { inlineData: { mimeType, data: base64Data } },
                                { text: `Edit this existing image according to these instructions: ${prompt}. Keep the overall composition, layout, and unaffected areas identical. Only make the specific requested changes. Output the modified image.` },
                            ],
                        }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                    }),
                })
                const data = await resp.json()
                if (data.error) throw new Error(data.error.message)
                const parts = data.candidates?.[0]?.content?.parts || []
                for (const part of parts) {
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
        res.json({ imageUrl, model: 'NanoBanana 2' })
    } catch (err) {
        console.error('AI edit error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-edit-visual — Inpaint with mask (Visual tool)
router.post('/ai-edit-visual', protect, async (req, res) => {
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

        const modelId = 'gemini-2.0-flash-exp-image-generation'
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
        res.json({ imageUrl, model: 'Gemini Flash' })
    } catch (err) {
        console.error('AI visual edit error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-retouch — Retouch/Replace masked area
router.post('/ai-retouch', protect, async (req, res) => {
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

        const modelId = 'gemini-2.0-flash-exp-image-generation'
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
        res.json({ imageUrl, model: 'Gemini Flash' })
    } catch (err) {
        console.error('AI retouch error:', err.message)
        res.status(500).json({ error: safeErrorMessage(err) })
    }
})

// POST /api/canvas-assets/ai-background — Remove or replace background
router.post('/ai-background', protect, async (req, res) => {
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

        const modelId = 'gemini-2.0-flash-exp-image-generation'
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
        res.json({ imageUrl, action, model: 'Gemini Flash' })
    } catch (err) {
        console.error('AI background error:', err.message)
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
        const url = `${baseUrl}/models/gemini-2.0-flash:generateContent?key=${apiKey}`
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

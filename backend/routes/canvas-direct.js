import express from 'express';
import { getRouter as getAIRouter } from '../ai/router.js';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';

const router = express.Router();

// ── Canvas Tool Definitions for Claude ──
const CANVAS_TOOLS = [
    {
        name: 'add_text',
        description: 'Add a text element to the canvas. Use for headings, body text, captions, CTAs, prices, taglines, etc.',
        input_schema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text content to display' },
                isHeading: { type: 'boolean', description: 'True for large heading text, false for body text' },
                fontSize: { type: 'number', description: 'Font size in pixels (default: 24 for body, 48 for heading)' },
                fontWeight: { type: 'string', enum: ['400', '600', '700', '800', '900'], description: 'Font weight' },
                color: { type: 'string', description: 'Text color as hex (e.g. #FFD700)' },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Position on canvas' },
                fontFamily: { type: 'string', description: 'Font family name (e.g. Inter, Playfair Display, Montserrat)' },
            },
            required: ['text'],
        },
    },
    {
        name: 'add_shape',
        description: 'Add a geometric shape to the canvas. Shapes include rectangles, circles, stars, hearts, badges, triangles, lines, etc.',
        input_schema: {
            type: 'object',
            properties: {
                shapeType: {
                    type: 'string',
                    enum: ['shape-rect', 'shape-rounded-rect', 'shape-circle', 'shape-oval', 'shape-triangle', 'shape-diamond', 'shape-pentagon', 'shape-hexagon', 'shape-star5', 'shape-star6', 'shape-heart', 'shape-cross', 'shape-badge', 'shape-line', 'shape-blob', 'shape-wave', 'shape-ring'],
                    description: 'Type of shape to add'
                },
                fillColor: { type: 'string', description: 'Fill color as hex (e.g. #6366f1)' },
                strokeColor: { type: 'string', description: 'Border/stroke color as hex' },
                width: { type: 'number', description: 'Width in pixels' },
                height: { type: 'number', description: 'Height in pixels' },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Position on canvas' },
                opacity: { type: 'number', description: 'Opacity from 0 to 1 (default: 1)' },
            },
            required: ['shapeType'],
        },
    },
    {
        name: 'add_logo',
        description: 'Add the brand logo to the canvas. Always use this when the user mentions logo or branding.',
        input_schema: {
            type: 'object',
            properties: {
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Position on canvas (default: top-right)' },
                scale: { type: 'number', description: 'Scale factor (default: 0.15 of canvas width)' },
            },
        },
    },
    {
        name: 'set_background',
        description: 'Set the artboard/canvas background color.',
        input_schema: {
            type: 'object',
            properties: {
                color: { type: 'string', description: 'Background color as hex (e.g. #1a1a2e) or CSS color name' },
            },
            required: ['color'],
        },
    },
    {
        name: 'change_element_property',
        description: 'Change a property (color, size, position, opacity, font) of an existing element on the canvas. Identify elements by their name or type.',
        input_schema: {
            type: 'object',
            properties: {
                elementName: { type: 'string', description: 'Name/label of the element to modify (e.g. "Heading", "Circle", "Brand Logo")' },
                elementIndex: { type: 'number', description: 'Index of element in the layers list (0-based, top-to-bottom). Use this if name is ambiguous.' },
                property: { type: 'string', enum: ['fill', 'stroke', 'fontSize', 'fontFamily', 'fontWeight', 'opacity', 'left', 'top', 'scaleX', 'scaleY', 'angle', 'text'], description: 'Property to change' },
                value: { type: 'string', description: 'New value for the property' },
            },
            required: ['property', 'value'],
        },
    },
    {
        name: 'remove_element',
        description: 'Remove/delete an element from the canvas by its name or index.',
        input_schema: {
            type: 'object',
            properties: {
                elementName: { type: 'string', description: 'Name of the element to remove' },
                elementIndex: { type: 'number', description: 'Index of element in layers list (0-based)' },
            },
        },
    },
    {
        name: 'set_canvas_size',
        description: 'Change the canvas/artboard size to a platform preset.',
        input_schema: {
            type: 'object',
            properties: {
                preset: {
                    type: 'string',
                    enum: ['ig-post', 'ig-story', 'ig-reel', 'fb-post', 'linkedin', 'yt-thumb', 'twitter', 'carousel', 'banner'],
                    description: 'Platform preset (e.g. ig-post = 1080x1080, ig-story = 1080x1920)'
                },
            },
            required: ['preset'],
        },
    },
    {
        name: 'move_element',
        description: 'Move an existing element to a new position.',
        input_schema: {
            type: 'object',
            properties: {
                elementName: { type: 'string', description: 'Name of the element to move' },
                elementIndex: { type: 'number', description: 'Index of element in layers list' },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Target position' },
            },
            required: ['position'],
        },
    },
    {
        name: 'reorder_layer',
        description: 'Move an element forward or backward in the layer stack (z-order).',
        input_schema: {
            type: 'object',
            properties: {
                elementName: { type: 'string', description: 'Name of the element' },
                elementIndex: { type: 'number', description: 'Index of element' },
                action: { type: 'string', enum: ['bring-front', 'send-back', 'bring-forward', 'send-backward'], description: 'Layer reorder action' },
            },
            required: ['action'],
        },
    },
    {
        name: 'generate_image',
        description: 'Generate an AI image and add it to the canvas. Use when the user wants a new image, photo, illustration, or visual created by AI.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Detailed image generation prompt' },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Where to place the image' },
                size: { type: 'string', enum: ['256x256', '512x512', '1024x1024'], description: 'Image size (default: 1024x1024)' },
            },
            required: ['prompt'],
        },
    },
];

// ── POST /api/fidato/canvas-direct ──
router.post('/canvas-direct', protect, requireCredits('fidatoCanvas'), async (req, res) => {
    const startTime = Date.now();
    try {
        const { message, canvasState, conversationHistory } = req.body;
        if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });

        const user = req.user;
        const brand = req.brand || {};

        // Build canvas context for Claude
        const canvasContext = canvasState
            ? `\nCURRENT CANVAS STATE:\n- Artboard size: ${canvasState.width || 1080}x${canvasState.height || 1080}\n- Elements on canvas (top to bottom):\n${(canvasState.elements || []).map((el, i) => `  ${i}. [${el.type}] "${el.name}" — pos:(${el.left},${el.top}) size:${el.width}x${el.height} color:${el.fill || 'none'}`).join('\n') || '  (empty canvas)'}\n`
            : '\nCANVAS STATE: Empty canvas\n';

        const brandContext = [
            brand.name ? `Brand: ${brand.name}` : '',
            brand.dna?.tagline ? `Tagline: "${brand.dna.tagline}"` : '',
            brand.dna?.industry ? `Industry: ${brand.dna.industry}` : '',
            brand.dna?.colors?.length ? `Brand Colors: ${brand.dna.colors.map(c => c.hex || c).join(', ')}` : '',
            brand.dna?.fonts?.length ? `Brand Fonts: ${brand.dna.fonts.join(', ')}` : '',
            brand.dna?.logo?.url ? 'Brand logo: Available (use add_logo tool)' : 'Brand logo: Not uploaded',
        ].filter(Boolean).join('\n');

        const systemPrompt = `You are Fidato, an expert AI creative director for the Mantram design platform. You help users design beautiful social media posts, ads, and visual content by directly manipulating their canvas.

You have access to canvas manipulation tools. When a user asks you to create, modify, or design something, use the appropriate tools to make it happen. You can chain multiple tool calls to build complex layouts.

BRAND CONTEXT:
${brandContext}
${canvasContext}

CREATIVE DIRECTION RULES:
1. Always use brand colors when adding elements (unless user specifies different colors)
2. Use professional typography — headings should be bold (700-900 weight), body text normal (400)
3. Create visually balanced layouts — don't stack everything in one spot
4. When adding text + shape combos, add the shape FIRST so text appears on top
5. Use the brand logo tastefully — typically top-right or bottom-right, at small scale
6. For social media posts, think about visual hierarchy: hero element > heading > supporting text > CTA > logo
7. Choose colors that have good contrast for readability
8. If the user's request is vague, make smart creative decisions based on the brand context

RESPONSE FORMAT:
- Use tools to execute canvas changes
- Respond with a brief, friendly explanation of what you did (1-2 sentences)
- If you can't fulfill a request with the available tools, say so and suggest alternatives
- Be conversational and creative — you're a design partner, not a robot`;

        // Try Claude with tools first, fall back to regular text generation
        const aiRouter = getAIRouter();
        let result;

        try {
            const anthropic = aiRouter.getProvider('anthropic');
            console.log(`🎨 Fidato Canvas: Using Claude tool-use for "${message.substring(0, 60)}..."`);

            // Build messages with conversation history
            let userPrompt = message;
            if (conversationHistory?.length) {
                const historyContext = conversationHistory
                    .slice(-6) // Last 3 exchanges
                    .map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content.substring(0, 200)}`)
                    .join('\n');
                userPrompt = `Previous conversation:\n${historyContext}\n\nUser's latest request: ${message}`;
            }

            result = await anthropic.generateWithTools({
                systemPrompt,
                userPrompt,
                tools: CANVAS_TOOLS,
                temperature: 0.5,
                maxTokens: 4096,
            });

            console.log(`   ✅ Claude returned: ${result.toolCalls.length} tool calls, ${result.text.length} chars text`);
        } catch (claudeErr) {
            console.warn(`   ⚠️ Claude tool-use failed: ${claudeErr.message?.substring(0, 100)}`);

            // Fallback: use regular text generation to suggest what to do
            const fallbackResult = await aiRouter.generateText({
                systemPrompt: `You are Fidato, an AI creative director. The user wants to modify their canvas. Since tool-use is unavailable, respond with a JSON object containing "actions" — an array of canvas actions the frontend should execute.
${brandContext}
${canvasContext}

Respond ONLY with valid JSON: { "reply": "friendly message", "actions": [{ "tool": "add_text|add_shape|add_logo|set_background|...", "args": {...} }] }`,
                userPrompt: message,
                maxTokens: 2048,
                temperature: 0.5,
            });

            // Parse fallback response
            try {
                const raw = (fallbackResult.text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                const jsonMatch = raw.match(/\{[\s\S]*\}/);
                const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
                return res.json({
                    success: true,
                    reply: parsed.reply || 'Here are the changes I suggest:',
                    toolCalls: (parsed.actions || []).map(a => ({ name: a.tool, args: a.args })),
                    fallback: true,
                    provider: fallbackResult.provider,
                    generationTime: Date.now() - startTime,
                });
            } catch {
                return res.json({
                    success: true,
                    reply: fallbackResult.text || 'I can help with your canvas design. Could you be more specific?',
                    toolCalls: [],
                    fallback: true,
                    provider: fallbackResult.provider,
                    generationTime: Date.now() - startTime,
                });
            }
        }

        res.json({
            success: true,
            reply: result.text || 'Done! I\'ve made the changes to your canvas.',
            toolCalls: result.toolCalls,
            tokensUsed: result.tokensUsed,
            provider: 'anthropic',
            generationTime: Date.now() - startTime,
        });

    } catch (err) {
        console.error('Fidato Canvas error:', err.message);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

export default router;

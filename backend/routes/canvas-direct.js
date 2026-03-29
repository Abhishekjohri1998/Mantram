import express from 'express';
import { getRouter as getAIRouter } from '../ai/router.js';
import { protect } from '../middleware/auth.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { uploadToS3 } from '../utils/s3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { searchWeb, searchBrandImages } from '../utils/searchManager.js';
import Product from '../models/Product.js';

const router = express.Router();

// ── Canvas Tool Definitions for Claude ──
const CANVAS_TOOLS = [
    {
        name: 'search_web',
        description: 'Search the live internet. Use this to deeply research brands, products, market trends, or facts BEFORE generating content or storyboards for them. Only the backend executes this; you will receive the result immediately to continue your thought process.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query optimized for an AI research engine (e.g. "ACWO brand latest product features and positioning")' }
            },
            required: ['query']
        }
    },
    {
        name: 'download_brand_assets',
        description: 'Download real product images and brand assets from the internet. Use this AFTER search_web to fetch visual references of the brand\'s products, packaging, lifestyle photos, and logos from their website, Amazon, and e-commerce listings. These images will be used as references for generating accurate storyboard visuals. CRITICAL: Always call this before create_storyboard_frames when working with a specific brand/product.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Image search query focused on the product visuals (e.g. "ACWO DwOTS Fire earbuds product photos official")' },
                maxImages: { type: 'number', description: 'Number of reference images to fetch (default: 4, max: 6)' }
            },
            required: ['query']
        }
    },
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
                    description: 'Platform preset (e.g. ig-post = 1080x1350, ig-story = 1080x1920, fb-post = 1080x1350, linkedin = 1200x1200)'
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

    // ═══════════════════════════════════════════════════════════════
    // ── AGENTIC CANVAS TOOLS — Scripting, Storyboarding, Layout ──
    // ═══════════════════════════════════════════════════════════════

    {
        name: 'create_script_block',
        description: 'Create a structured video/ad script broken into scenes. Use this when the user asks to write a script, plan a video, or create an ad film. Each scene has a visual description and voiceover. The frontend will render these as organized script cards on the canvas.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Title of the script (e.g. "Summer Sale Ad Film")' },
                scenes: {
                    type: 'array',
                    description: 'Array of scene objects',
                    items: {
                        type: 'object',
                        properties: {
                            sceneNumber: { type: 'number', description: 'Scene number (1-based)' },
                            visualDescription: { type: 'string', description: 'What the viewer SEES in this scene — be very specific for image generation' },
                            voiceover: { type: 'string', description: 'The voiceover or dialogue for this scene' },
                            duration: { type: 'string', description: 'Estimated duration (e.g. "3s", "5s")' },
                            mood: { type: 'string', description: 'Visual mood/tone (e.g. "warm", "dramatic", "playful")' },
                        },
                        required: ['sceneNumber', 'visualDescription', 'voiceover'],
                    },
                },
            },
            required: ['title', 'scenes'],
        },
    },
    {
        name: 'create_storyboard_frames',
        description: 'Generate a visual storyboard — a grid of image frames with captions. Use this after creating a script, or when the user asks for a storyboard, mood board, or visual sequence. Each frame has an AI image prompt that will be generated. The frontend renders these in a dedicated "Board View" with auto-reflowing Luma-style cards.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Storyboard title (e.g. "Summer Campaign Storyboard")' },
                frames: {
                    type: 'array',
                    description: 'Array of frame objects — each will become an image card in the Board View',
                    items: {
                        type: 'object',
                        properties: {
                            frameNumber: { type: 'number', description: 'Frame number (1-based)' },
                            imagePrompt: { type: 'string', description: 'Detailed AI image generation prompt. Include character references if a character_profile exists. Be extremely specific about composition, lighting, and emotion.' },
                            caption: { type: 'string', description: 'Short caption below the image (e.g. "Scene 1: Hero enters")' },
                            sceneRef: { type: 'number', description: 'Optional reference to a script scene number for linking' },
                        },
                        required: ['frameNumber', 'imagePrompt', 'caption'],
                    },
                },
                generateImages: { type: 'boolean', description: 'If true, AI images will be generated for each frame. If false, only placeholder cards are created. Default: true.' },
            },
            required: ['title', 'frames'],
        },
    },
    {
        name: 'create_character_profile',
        description: 'Define a character for visual continuity across all storyboard frames. This acts as a "reference anchor" — once created, all future image generations on this canvas will try to maintain this character\'s appearance. Use this when the user describes a character, mentions consistency, or asks for a character board.',
        input_schema: {
            type: 'object',
            properties: {
                characterName: { type: 'string', description: 'Name of the character (e.g. "Maya", "The Founder")' },
                physicalDescription: { type: 'string', description: 'Detailed physical appearance: age, gender, ethnicity, hair, eyes, build, distinguishing features. Be very specific for AI image consistency.' },
                wardrobe: { type: 'string', description: 'What the character typically wears (e.g. "olive green jacket, white t-shirt, jeans")' },
                styleKeywords: {
                    type: 'array',
                    description: 'Visual style tags for consistent generation',
                    items: { type: 'string' },
                },
                referenceImagePrompt: { type: 'string', description: 'A single AI prompt to generate a clean reference headshot/portrait of this character for the character board.' },
            },
            required: ['characterName', 'physicalDescription'],
        },
    },
    {
        name: 'auto_layout_grid',
        description: 'IMPORTANT: Use this tool AFTER adding multiple elements to the Design Canvas to organize them into a clean, Luma-Labs-style grid. ALWAYS call this after adding multiple individual text blocks or character cards to the Design Canvas. DO NOT use this after create_storyboard_frames, as storyboards are rendered in a separate auto-reflowing Board View.',
        input_schema: {
            type: 'object',
            properties: {
                columns: { type: 'number', description: 'Number of columns in the grid (default: auto-calculated based on element count, usually 3-4)' },
                gap: { type: 'number', description: 'Gap between cards in pixels (default: 20)' },
                cardWidth: { type: 'number', description: 'Width of each card in pixels (default: 240)' },
                cardHeight: { type: 'number', description: 'Height of each card in pixels (default: 240)' },
                includeTypes: {
                    type: 'array',
                    description: 'Which node types to include in the grid layout. If empty, applies to all nodes.',
                    items: { type: 'string', enum: ['image', 'script', 'storyboard', 'character', 'all'] },
                },
                startX: { type: 'number', description: 'Starting X position of the grid (default: 60)' },
                startY: { type: 'number', description: 'Starting Y position of the grid (default: 80)' },
            },
        },
    },
    {
        name: 'generate_video_clip',
        description: 'Generate a short AI video clip from a text prompt or from a storyboard frame image. Use when user asks to create a video, animate a scene, or generate footage for their storyboard. Returns a video URL that will be embedded on the canvas as a video node.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Detailed cinematic prompt describing the video scene. Be specific about motion, camera movement, lighting, and action.' },
                duration: { type: 'number', description: 'Duration in seconds (3-10, default: 5)' },
                aspectRatio: { type: 'string', enum: ['16:9', '9:16', '1:1'], description: 'Aspect ratio (default: 16:9)' },
                sourceImageUrl: { type: 'string', description: 'Optional: URL of a storyboard frame image to animate (Image-to-Video)' },
                sceneRef: { type: 'number', description: 'CRITICAL: If you just generated this scene using create_storyboard_frames and do not know its URL yet, pass the 1-based scene index here (e.g. 1, 2) and the system will automatically animate it!' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'generate_voiceover',
        description: 'Generate AI voiceover/narration audio from text. Use when user has a script and wants to add narration. Uses Sarvam Bulbul TTS for natural-sounding speech. Returns an audio node on the canvas.',
        input_schema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The voiceover text to speak' },
                language: { type: 'string', description: 'Language code (e.g. en-IN, hi-IN, ta-IN). Default: en-IN' },
                speaker: { type: 'string', enum: ['anushka', 'abhilash'], description: 'Voice character. anushka=female, abhilash=male (default: anushka)' },
                speed: { type: 'number', description: 'Speaking pace 0.5-2.0 (default: 1.0)' },
                sceneRef: { type: 'number', description: 'Optional: scene number this voiceover belongs to' },
            },
            required: ['text'],
        },
    },
    {
        name: 'generate_music',
        description: 'Generate AI background music or a song using Google Gemini Lyria 3. Use when user wants background music, a jingle, or soundtrack for their video/campaign. Returns an audio node on the canvas.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Music generation prompt describing style, mood, instruments, tempo. (e.g. "upbeat corporate background music with light piano and strings, 120 BPM")' },
                duration: { type: 'number', description: 'Duration in seconds (10-30, default: 15)' },
                mood: { type: 'string', enum: ['upbeat', 'calm', 'dramatic', 'emotional', 'corporate', 'playful', 'epic', 'cinematic'], description: 'Music mood' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'generate_sound_effect',
        description: 'Generate a short sound effect using AI. Use for ambient sounds, transitions, or punctuation effects (e.g. whoosh, ding, nature sounds). Returns an audio node on the canvas.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Description of the sound effect (e.g. "gentle ocean waves", "dramatic whoosh transition", "crowd cheering")' },
                duration: { type: 'number', description: 'Duration in seconds (1-10, default: 3)' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'compile_workspace_assets',
        description: 'Finalize and compile the entire campaign. For AD FILMS: it stitches all generated video clips, voiceover, and music into a final MP4 output. For IMAGE CAMPAIGNS: it applies final auto-layout formatting and readies the export. ALWAYS call this as the LAST step of a massive autonomous workflow.',
        input_schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'A catchy name for the compiled campaign' },
                campaignType: { type: 'string', enum: ['video', 'image'], description: 'Is this a Video compile or an Image layout compile?' },
                addBrandCta: { type: 'boolean', description: 'True to automatically append a dynamic text CTA slide with the brand logo to the end' }
            },
            required: ['title', 'campaignType']
        }
    }
];

// ── POST /api/fidato/canvas-direct ──
router.post('/canvas-direct', protect, requireCredits('fidatoCanvas'), async (req, res) => {
    const startTime = Date.now();
    try {
        const { message, canvasState, conversationHistory, preflightResearchData } = req.body;
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
            brand.dna?.country || brand.country ? `Market: ${brand.dna?.country || brand.country}` : 'Market: India',
            brand.dna?.targetMarkets?.length ? `Target Markets: ${brand.dna.targetMarkets.join(', ')}` : '',
            brand.dna?.colors?.length ? `Brand Colors: ${brand.dna.colors.map(c => c.hex || c).join(', ')}` : '',
            brand.dna?.fonts?.length ? `Brand Fonts: ${brand.dna.fonts.join(', ')}` : '',
            brand.dna?.logo?.url ? 'Brand logo: Available (use add_logo tool)' : 'Brand logo: Not uploaded',
        ].filter(Boolean).join('\n');

        const systemPrompt = `You are Fidato, an autonomous AI creative director. You create professional ad films and campaigns with a clear, structured pipeline.

BRAND CONTEXT:
${brandContext}
${canvasContext}

## YOUR ROLE
You are a creative director who receives a brief + brand data from the database (Brand DNA + Product catalog), then executes the full creative pipeline using your tools. Brand DNA data (description, USPs, product info, images) is ALREADY PROVIDED in this prompt — you do NOT need to search. Use what's given.

## PIPELINE — EXECUTE IN THIS EXACT ORDER

### For VIDEO ADS (any request mentioning "ad", "video", "film", "reel", "sec", "second"):

**PHASE 1 — Creative Assets (execute immediately):**
1. **create_script_block** — Write a professional ad script
2. **create_storyboard_frames** — Generate keyframe images for each shot
3. **generate_voiceover** — Create TTS narration (speaker: anushka for female, abhilash for male)
4. **generate_music** — Create background music matching the ad's mood

**⚠️ STOP HERE — After Phase 1, you MUST pause and ask the user:**
"✅ Script, storyboard images, voiceover, and music are ready!

🎬 **Ready to generate videos?** Video generation costs credits for each scene. Review the storyboard images above and confirm:
👉 Reply **'Go'** to start video generation, or tell me which scenes to change."

**DO NOT proceed to video generation until the user confirms.** Wait for user to say "go", "yes", "proceed", etc.

**PHASE 2 — Video Generation (ONLY after user confirms):**
5. Generate video clips for each storyboard frame (via frontend)
6. **compile_workspace_assets** — Stitch everything into the final ad film

### For IMAGE ADS (posters, social posts, creatives):
1. **create_script_block** — Write ad copy with headline, body, CTA
2. **create_storyboard_frames** — Generate the visual(s) with generateImages: true

### For SIMPLE EDITS (move, resize, color, font changes):
Use add_text, add_shape, change_element_property, set_background directly.

## SCRIPT FORMAT
When calling create_script_block, use this structure:
{
  "title": "Brand — Campaign Name",
  "script": {
    "title": "Campaign Title",
    "tagline": "Short tagline",
    "totalDuration": 17,
    "scenes": [
      { "scene": 1, "duration": 3, "visual": "Description of what we see", "voiceover": "What the narrator says", "text_overlay": "On-screen text" }
    ]
  }
}

## STORYBOARD FORMAT  
When calling create_storyboard_frames, make imagePrompt VERY detailed:
- ❌ Bad: "Product shot of earbuds"
- ✅ Good: "Cinematic close-up of matte black ACWO DwOTS wireless earbuds with metallic accents on a dark reflective surface, dramatic side lighting, shallow depth of field, premium product photography, 4K quality"

## RESPONSE FORMAT
Start your reply with a <thinking> block:
<thinking>
Brief creative strategy: what you learned from the research, your creative direction, and the pipeline you'll follow.
</thinking>

Then announce your plan briefly:
"Here's my plan for the [Brand] [Product] ad:
1. ✅ Research completed (product details found)
2. 📝 Writing ad script with [N] scenes
3. 🎬 Generating [N] keyframe images
4. 🎙️ Creating voiceover narration
5. 🎵 Generating background music
⏸️ Will pause for your review before video generation"

Then call the tools for Phase 1 in order. After Phase 1 completes, STOP and ask user to confirm.

## CRITICAL RULES
- ALWAYS use research data provided — never make up product features
- ALWAYS call create_script_block BEFORE create_storyboard_frames
- Use brand colors when available
- Be extremely detailed in storyboard image prompts
- For video ads: script scenes must include voiceover text and duration per scene
- For voiceover: ONLY use speaker 'anushka' (female) or 'abhilash' (male). No other speakers.
- NEVER just add plain text elements for ad requests — use the full pipeline
- NEVER auto-generate videos without user confirmation — videos cost credits`;




        // ── PRE-FLIGHT: Pull data from Brand DNA + Product catalog (NO web search) ──
        const aiRouter = getAIRouter();
        let result;
        let preFlightResearch = '';
        let referenceImages = [];

        // Detect if the message mentions a brand/product that needs creative generation
        const needsResearch = /\b(ad|creative|campaign|video|film|promo|poster|post|storyboard|script)\b/i.test(message)
            && !/\b(change|move|resize|delete|color|font|undo|redo)\b/i.test(message);

        // If user confirmed pre-flight data from a previous request, use it directly
        if (preflightResearchData) {
            console.log(`🔍 [Pre-Flight] Using CONFIRMED research data from user`);
            preFlightResearch = preflightResearchData.research || '';
            referenceImages = preflightResearchData.referenceImages || [];
        } else if (needsResearch && brand?._id) {
            console.log(`📦 [Pre-Flight] Pulling data from Brand DNA + Product catalog (no web search)`);

            // Extract product keywords from the message
            const productKeywords = message
                .replace(/\b(create|make|design|build|generate|an?|the|of|for|about|with|using|on|my|our|sec|secs|second|seconds|minute|minutes|min|\d+|ad|ads|film|video|clip|reel|story|stories|post|posts|creative|creatives|campaign|promo|promotional|poster|banner|carousel|storyboard|script)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            console.log(`   📌 Product keywords: "${productKeywords}"`);

            // ── Step 1: Brand DNA context ──
            const dna = brand.dna || {};
            const brandCountry = dna.country || brand.country || 'India';
            const currencyMap = { 'India': 'INR ₹', 'US': 'USD $', 'USA': 'USD $', 'UK': 'GBP £', 'UAE': 'AED', 'Canada': 'CAD' };
            const localCurrency = currencyMap[brandCountry] || brandCountry;

            preFlightResearch += `\n## BRAND DNA (FROM DATABASE — VERIFIED DATA)\n`;
            preFlightResearch += `Brand: ${brand.name || 'Unknown'}\n`;
            preFlightResearch += `Market: ${brandCountry} | Currency: ${localCurrency}\n`;
            if (dna.tagline) preFlightResearch += `Tagline: "${dna.tagline}"\n`;
            if (dna.industry) preFlightResearch += `Industry: ${dna.industry}\n`;
            if (dna.brandDescription) preFlightResearch += `Description: ${dna.brandDescription}\n`;
            if (dna.companyOverview) preFlightResearch += `Overview: ${dna.companyOverview}\n`;
            if (dna.targetAudience) preFlightResearch += `Target Audience: ${dna.targetAudience}\n`;
            if (dna.missionStatement) preFlightResearch += `Mission: ${dna.missionStatement}\n`;
            if (dna.servicesOffered?.length) preFlightResearch += `Products/Services: ${dna.servicesOffered.join(', ')}\n`;
            if (dna.uniqueSellingPoints?.length) preFlightResearch += `USPs: ${dna.uniqueSellingPoints.join(' | ')}\n`;
            if (dna.brandValues?.length) preFlightResearch += `Values: ${dna.brandValues.join(', ')}\n`;
            if (dna.colors?.length) preFlightResearch += `Brand Colors: ${dna.colors.map(c => `${c.name || c.usage}:${c.hex}`).join(', ')}\n`;
            if (dna.voice?.personality) preFlightResearch += `Voice: ${dna.voice.personality}${dna.voice.description ? ' — ' + dna.voice.description : ''}\n`;
            if (dna.photographyStyle) preFlightResearch += `Photography Style: ${dna.photographyStyle}\n`;

            // Visual DNA for design intelligence
            if (dna.visualDNA) {
                const vd = dna.visualDNA;
                const vdParts = [
                    vd.designStyle && `Design: ${vd.designStyle}`,
                    vd.imageMood && `Mood: ${vd.imageMood}`,
                    vd.layoutPreference && `Layout: ${vd.layoutPreference}`,
                    vd.typographyStyle && `Typography: ${vd.typographyStyle}`,
                    vd.textureStyle && `Texture: ${vd.textureStyle}`,
                ].filter(Boolean);
                if (vdParts.length) preFlightResearch += `Visual DNA: ${vdParts.join(' | ')}\n`;
                if (vd.designRules?.length) preFlightResearch += `Design Rules: ${vd.designRules.join('; ')}\n`;
                if (vd.designAvoid?.length) preFlightResearch += `Avoid: ${vd.designAvoid.join('; ')}\n`;
            }

            // ── Step 2: Search Product catalog for matching products ──
            try {
                let matchedProducts = [];
                if (productKeywords.length > 2) {
                    // Text search on product title, description, tags, keywords
                    matchedProducts = await Product.find({
                        brand: brand._id,
                        status: 'active',
                        $text: { $search: productKeywords },
                    }, { score: { $meta: 'textScore' } })
                    .sort({ score: { $meta: 'textScore' } })
                    .limit(3)
                    .lean();
                }
                // Fallback: get all active products if text search returns nothing
                if (!matchedProducts.length) {
                    matchedProducts = await Product.find({
                        brand: brand._id,
                        status: 'active',
                    }).limit(5).lean();
                }

                if (matchedProducts.length > 0) {
                    preFlightResearch += `\n## PRODUCT CATALOG MATCHES\n`;
                    for (const prod of matchedProducts) {
                        preFlightResearch += `\n### ${prod.title}\n`;
                        if (prod.description) preFlightResearch += `Description: ${prod.description.substring(0, 300)}\n`;
                        if (prod.features?.length) preFlightResearch += `Features: ${prod.features.join(' | ')}\n`;
                        if (prod.price?.amount) preFlightResearch += `Price: ${prod.price.currency || 'INR'} ${prod.price.amount}${prod.price.mrp ? ` (MRP: ${prod.price.mrp})` : ''}\n`;
                        if (prod.category) preFlightResearch += `Category: ${prod.category}${prod.subCategory ? ' > ' + prod.subCategory : ''}\n`;
                        if (prod.tags?.length) preFlightResearch += `Tags: ${prod.tags.join(', ')}\n`;

                        // Collect product images (already on S3!)
                        if (prod.images?.length) {
                            for (const img of prod.images) {
                                if (img.url) {
                                    referenceImages.push({ url: img.url, alt: img.alt || prod.title, source: `product-catalog` });
                                }
                            }
                        }
                    }
                    console.log(`   📦 Found ${matchedProducts.length} products, ${referenceImages.length} product images`);
                } else {
                    console.log(`   ⚠️ No products found in catalog — will use brand images`);
                }
            } catch (err) {
                console.warn(`   ⚠️ Product search failed: ${err.message}`);
            }

            // ── Step 3: Add brand images (logo + scraped website images) as fallback/supplement ──
            if (dna.logo?.url) {
                referenceImages.push({ url: dna.logo.url, alt: `${brand.name} logo`, source: 'brand-logo' });
            }
            if (dna.brandImages?.length) {
                for (const img of dna.brandImages.slice(0, 6)) {
                    if (img.url && !referenceImages.some(r => r.url === img.url)) {
                        referenceImages.push({ url: img.url, alt: img.alt || `${brand.name} brand image`, source: img.source || 'brand-onboarding' });
                    }
                }
            }

            // Add reference images to research text
            if (referenceImages.length > 0) {
                preFlightResearch += `\n## REFERENCE IMAGES (FROM YOUR BRAND — ALREADY ON S3)\n`;
                referenceImages.forEach((img, i) => {
                    preFlightResearch += `- Image ${i + 1}: ${img.url} (${img.alt}) [source: ${img.source}]\n`;
                });
                preFlightResearch += `\nUse these REAL product/brand images as visual references. These are pre-uploaded to S3 and ready to use.\n`;
            }

            console.log(`   ✅ Brand DNA research: ${preFlightResearch.length} chars, ${referenceImages.length} images`);

            // ── Return pre-flight results for user confirmation ──
            return res.json({
                success: true,
                preflightConfirmation: true,
                reply: '',
                research: preFlightResearch || '(No brand data found)',
                referenceImages: referenceImages,
                productName: productKeywords,
                toolCalls: [],
                tokensUsed: 0,
                generationTime: Date.now() - startTime,
            });
        }

        // ── Inject research into system prompt ──
        const enrichedSystemPrompt = preFlightResearch
            ? systemPrompt + preFlightResearch
            : systemPrompt;

        try {
            const anthropic = aiRouter.getProvider('anthropic');
            console.log(`🎨 Fidato Canvas: Using Claude for "${message.substring(0, 60)}..." (research: ${preFlightResearch.length} chars)`);

            // Build messages with conversation history
            let userPrompt = message;
            if (conversationHistory?.length) {
                const historyContext = conversationHistory
                    .slice(-6)
                    .map(m => `${m.role === 'user' ? 'User' : 'Fidato'}: ${m.content.substring(0, 200)}`)
                    .join('\n');
                userPrompt = `Previous conversation:\n${historyContext}\n\nUser's latest request: ${message}`;
            }

            // Filter out server-side tools — Claude doesn't need search_web anymore
            const clientTools = CANVAS_TOOLS.filter(t => t.name !== 'search_web' && t.name !== 'download_brand_assets');

            result = await anthropic.generateWithTools({
                systemPrompt: enrichedSystemPrompt,
                userPrompt,
                tools: clientTools,
                toolHandlers: {}, // No server-side tools needed — research done pre-flight
                temperature: 0.5,
                maxTokens: 8192,
                model: 'claude-sonnet-4-20250514',
            });

            // Attach reference images to response
            req._referenceImages = referenceImages;

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

        // Extract thinking/reasoning from Claude's reply text
        let replyText = result.text || 'Done! I\'ve made the changes to your canvas.';
        let thinkingText = '';
        
        // Extract <think>/<thinking>/<reasoning> blocks
        const thinkMatch = replyText.match(/<(?:think|thinking|reasoning)>([\s\S]*?)<\/(?:think|thinking|reasoning)>/i);
        if (thinkMatch) {
            thinkingText = thinkMatch[1].trim();
            replyText = replyText.replace(/<(?:think|thinking|reasoning)>[\s\S]*?<\/(?:think|thinking|reasoning)>/gi, '').trim();
        }
        // Also handle unclosed thinking blocks (streaming artifacts)
        const unclosedMatch = replyText.match(/<(?:think|thinking|reasoning)>([\s\S]*?)$/i);
        if (unclosedMatch) {
            thinkingText = unclosedMatch[1].trim();
            replyText = replyText.replace(/<(?:think|thinking|reasoning)>[\s\S]*$/gi, '').trim();
        }

        res.json({
            success: true,
            reply: replyText,
            thinking: thinkingText || undefined,
            toolCalls: result.toolCalls,
            referenceImages: referenceImages || [],
            research: preFlightResearch || '',
            tokensUsed: result.tokensUsed,
            provider: 'anthropic',
            generationTime: Date.now() - startTime,
        });

    } catch (err) {
        console.error('Fidato Canvas error:', err.message);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-video — Generate video clip for canvas
// Bridges the canvas to the existing video-studio pipeline
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-video', protect, requireCredits('videoGenerate'), async (req, res) => {
    try {
        const { prompt, duration, aspectRatio, sourceImageUrl } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });

        console.log(`🎬 Canvas Video: "${prompt.substring(0, 60)}..." | duration=${duration || 5}`);

        // Route both I2V and T2V through the main pipeline for LZ-first routing
        // I2V: uses seedance-2.0 (LZ-first → PiAPI fallback)
        // T2V: uses kling-3.0 (fal.ai direct, no LZ equivalent)
        const { advancedGenerateNode } = await import('../agents/videoStudio/nodes.js');
        const selectedModel = sourceImageUrl ? 'seedance-2.0' : 'kling-3.0';

        const state = await advancedGenerateNode({
            prompt: prompt.trim(),
            model: selectedModel,
            duration: duration || 5,
            resolution: '1080p',
            qualityMode: 'fast',
            aspectRatio: aspectRatio || '16:9',
            firstImageUrl: sourceImageUrl || '',
            generateAudio: false,
            referenceImages: [],
        });

        // LaoZhang sync: if _laozhangVideoUrl is available, video is already done
        const isComplete = !!state.generation?._laozhangVideoUrl;

        return res.json({
            success: true,
            taskId: state.generation?.falRequestId,
            provider: state.generation?.provider || 'fal',
            generation: state.generation,
            completed: isComplete,
            videoUrl: isComplete ? state.generation._laozhangVideoUrl : undefined,
            message: isComplete ? 'Video generated successfully' : 'Video generation started — poll for status',
        });
    } catch (err) {
        console.error('Canvas video error:', err.message);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'videoGenerateRefund', `Refund: Canvas Video Fail (${err.message?.substring(0, 60)})`, 'video');
        }
        res.status(500).json({ error: err.message || 'Video generation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-voiceover — Generate TTS voiceover
// Uses Sarvam Bulbul v2 for natural Indian-accented speech
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-voiceover', protect, async (req, res) => {
    try {
        const { text, language, speaker, speed } = req.body;
        if (!text?.trim()) return res.status(400).json({ error: 'Text is required' });

        const sarvamKey = process.env.SARVAM_API_KEY;
        if (!sarvamKey) return res.status(500).json({ error: 'TTS not configured (SARVAM_API_KEY missing)' });

        console.log(`🎙️ Canvas Voiceover: ${text.length} chars, lang=${language || 'en-IN'}, speaker=${speaker || 'anushka'}`);

        const cleanText = text
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/→/g, ', ').replace(/\n{2,}/g, '. ').replace(/\n/g, ', ').trim();

        if (!cleanText || cleanText.length < 2) return res.status(400).json({ error: 'No speakable text after cleanup' });

        const response = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'api-subscription-key': sarvamKey },
            body: JSON.stringify({
                inputs: [cleanText.substring(0, 2000)],
                target_language_code: language || 'en-IN',
                speaker: speaker || 'anushka',
                model: 'bulbul:v2',
                pitch: 0,
                pace: speed || 1.0,
                loudness: 1.5,
                enable_preprocessing: true,
            }),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`Sarvam TTS failed: ${response.status} ${errBody.substring(0, 100)}`);
        }

        const data = await response.json();
        const audioBase64 = data.audios?.[0];
        if (!audioBase64) throw new Error('No audio in TTS response');

        // Upload to S3 for persistence
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const s3Key = `canvas-voiceover/${req.user._id}/${Date.now()}-vo.wav`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, 'audio/wav');

        console.log(`✅ Canvas Voiceover generated: ${audioUrl.substring(0, 60)}`);

        res.json({
            success: true,
            audioUrl,
            duration: Math.ceil(cleanText.split(/\s+/).length / 2.5), // rough estimate: 2.5 words/sec
            format: 'wav',
            provider: 'sarvam-bulbul-v2',
        });
    } catch (err) {
        console.error('Canvas voiceover error:', err.message);
        res.status(500).json({ error: err.message || 'Voiceover generation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-music — Generate AI music via Gemini Lyria 3
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-music', protect, async (req, res) => {
    try {
        const { prompt, duration, mood } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ error: 'Music prompt is required' });

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

        console.log(`🎵 Canvas Music: "${prompt.substring(0, 60)}..." | mood=${mood || 'auto'} | dur=${duration || 15}s`);

        // Call Gemini Lyria 3 for music generation
        const musicPrompt = `Generate a ${duration || 15} second ${mood || ''} music track: ${prompt.trim()}. High quality, professional production, suitable for commercial use.`;

        const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-exp:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: musicPrompt }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                    }
                }),
            }
        );

        if (!geminiResp.ok) {
            const errText = await geminiResp.text().catch(() => '');
            console.warn(`Lyria model failed (${geminiResp.status}), trying TTS fallback...`);
            // Fallback: use Gemini standard TTS to generate a spoken placeholder
            return res.json({
                success: false,
                error: `Lyria music generation unavailable (${geminiResp.status}). Try adding ELEVENLABS_API_KEY for music.`,
                fallbackSuggestion: 'Use royalty-free music from a library instead.',
            });
        }

        const geminiData = await geminiResp.json();
        const audioPart = geminiData.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

        if (!audioPart?.inlineData?.data) {
            return res.json({ success: false, error: 'No audio generated by Lyria. Try a more specific prompt.' });
        }

        // Upload to S3
        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        const ext = mimeType.includes('mp3') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'wav';
        const s3Key = `canvas-music/${req.user._id}/${Date.now()}-music.${ext}`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, mimeType);

        console.log(`✅ Canvas Music generated: ${audioUrl.substring(0, 60)}`);

        res.json({
            success: true,
            audioUrl,
            duration: duration || 15,
            format: ext,
            provider: 'gemini-lyria-3',
            mood: mood || 'auto',
        });
    } catch (err) {
        console.error('Canvas music error:', err.message);
        res.status(500).json({ error: err.message || 'Music generation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-sfx — Generate sound effects
// Uses Gemini for sound effect generation
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-sfx', protect, async (req, res) => {
    try {
        const { prompt, duration } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ error: 'Sound effect description is required' });

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'Gemini API key not configured' });

        console.log(`🔊 Canvas SFX: "${prompt.substring(0, 60)}..." | dur=${duration || 3}s`);

        const sfxPrompt = `Generate a ${duration || 3} second sound effect: ${prompt.trim()}. Clean, high quality, isolated sound.`;

        const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: sfxPrompt }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                        }
                    }
                }),
            }
        );

        if (!geminiResp.ok) {
            return res.json({ success: false, error: `SFX generation failed (${geminiResp.status})` });
        }

        const data = await geminiResp.json();
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

        if (!audioPart?.inlineData?.data) {
            return res.json({ success: false, error: 'No audio generated. Try a more specific description.' });
        }

        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        const ext = mimeType.includes('mp3') ? 'mp3' : 'wav';
        const s3Key = `canvas-sfx/${req.user._id}/${Date.now()}-sfx.${ext}`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, mimeType);

        console.log(`✅ Canvas SFX generated: ${audioUrl.substring(0, 60)}`);

        res.json({ success: true, audioUrl, duration: duration || 3, format: ext, provider: 'gemini' });
    } catch (err) {
        console.error('Canvas SFX error:', err.message);
        res.status(500).json({ error: err.message || 'SFX generation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-compile — Compile canvas assets into final video
// Takes video clips + voiceover + music and stitches via FFmpeg
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-compile', protect, async (req, res) => {
    try {
        const { clips, voiceoverUrl, musicUrl, title } = req.body;
        if (!clips?.length) return res.status(400).json({ error: 'At least one video clip URL is required' });

        console.log(`🎞️ Canvas Compile: ${clips.length} clips, VO=${!!voiceoverUrl}, music=${!!musicUrl}`);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-compile-'));

        try {
            // Download all clips
            const clipPaths = [];
            for (let i = 0; i < clips.length; i++) {
                const clipUrl = typeof clips[i] === 'string' ? clips[i] : clips[i].url;
                if (!clipUrl) continue;
                const clipResp = await fetch(clipUrl);
                if (!clipResp.ok) { console.warn(`Clip ${i} download failed`); continue; }
                const clipBuf = Buffer.from(await clipResp.arrayBuffer());
                const clipPath = path.join(tmpDir, `clip-${i}.mp4`);
                fs.writeFileSync(clipPath, clipBuf);
                clipPaths.push(clipPath);
            }

            if (clipPaths.length === 0) throw new Error('No valid clips downloaded');

            // Create concat file
            const concatFile = path.join(tmpDir, 'concat.txt');
            fs.writeFileSync(concatFile, clipPaths.map(p => `file '${p}'`).join('\n'));

            // Download VO and music if provided
            let voiceoverPath = null, musicPath = null;
            if (voiceoverUrl) {
                const voResp = await fetch(voiceoverUrl);
                if (voResp.ok) {
                    voiceoverPath = path.join(tmpDir, 'voiceover.wav');
                    fs.writeFileSync(voiceoverPath, Buffer.from(await voResp.arrayBuffer()));
                }
            }
            if (musicUrl) {
                const mResp = await fetch(musicUrl);
                if (mResp.ok) {
                    musicPath = path.join(tmpDir, 'music.wav');
                    fs.writeFileSync(musicPath, Buffer.from(await mResp.arrayBuffer()));
                }
            }

            // Get FFmpeg path
            const ffmpegPath = (await import('@ffmpeg-installer/ffmpeg')).default?.path || (await import('@ffmpeg-installer/ffmpeg')).path;
            execSync(`"${ffmpegPath}" -version`, { stdio: 'pipe' });

            const outputPath = path.join(tmpDir, 'compiled.mp4');

            // Build FFmpeg command
            let ffmpegCmd = `"${ffmpegPath}" -y -f concat -safe 0 -i "${concatFile}"`;
            let audioInputs = 0;

            if (voiceoverPath) { ffmpegCmd += ` -i "${voiceoverPath}"`; audioInputs++; }
            if (musicPath) { ffmpegCmd += ` -i "${musicPath}"`; audioInputs++; }

            if (audioInputs > 0) {
                // Mix audio tracks together
                const filterParts = [];
                let inputIdx = 1; // 0 = video concat
                if (voiceoverPath) { filterParts.push(`[${inputIdx}:a]volume=1.0[vo]`); inputIdx++; }
                if (musicPath) { filterParts.push(`[${inputIdx}:a]volume=0.3[bgm]`); inputIdx++; }

                if (voiceoverPath && musicPath) {
                    ffmpegCmd += ` -filter_complex "${filterParts.join('; ')}; [vo][bgm]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]"`;
                } else if (voiceoverPath) {
                    ffmpegCmd += ` -filter_complex "${filterParts[0]}" -map 0:v -map "[vo]"`;
                } else if (musicPath) {
                    ffmpegCmd += ` -filter_complex "${filterParts[0]}" -map 0:v -map "[bgm]"`;
                }
            } else {
                ffmpegCmd += ` -c copy`;
            }

            ffmpegCmd += ` -movflags +faststart "${outputPath}"`;

            console.log(`   🔧 FFmpeg: ${ffmpegCmd.substring(0, 150)}...`);
            execSync(ffmpegCmd, { stdio: 'pipe', timeout: 120000 });
            console.log(`   ✅ FFmpeg compilation complete`);

            // Upload to S3
            const compiledBuffer = fs.readFileSync(outputPath);
            const s3Key = `canvas-compiled/${req.user._id}/${Date.now()}-${(title || 'canvas-video').replace(/[^a-z0-9]/gi, '-')}.mp4`;
            const videoUrl = await uploadToS3(compiledBuffer, s3Key, 'video/mp4');

            console.log(`✅ Canvas Compile complete: ${videoUrl.substring(0, 60)}`);

            res.json({
                success: true,
                videoUrl,
                compiled: true,
                clipsUsed: clipPaths.length,
                hasVoiceover: !!voiceoverPath,
                hasMusic: !!musicPath,
            });
        } finally {
            // Cleanup temp files
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
    } catch (err) {
        console.error('Canvas compile error:', err.message);
        res.status(500).json({ error: err.message || 'Video compilation failed' });
    }
});

export default router;

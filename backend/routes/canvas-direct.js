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
import { agentUtils } from '../agents/shared/agentUtils.js';
import { VISUAL_GROUNDING_PROMPT, POST_GENERATION_CRITIC_PROMPT } from '../agents/creativeStudio/prompts.js';

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
                    description: 'Platform preset sizes. It accepts fuzzy inputs like "Facebook", "Instagram Story", "YouTube thumb", etc. Exact IDs: ig-post=1080x1350, ig-story=1080x1920, fb-post=1200x630, yt-thumb=1280x720, twitter=1600x900, whatsapp-status=1080x1920'
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
        description: 'Generate a BRAND NEW AI image and add it to the canvas. Use when the user wants to create a new image, photo, illustration, or visual from scratch.',
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
    {
        name: 'edit_image',
        description: 'Edit an EXISTING image on the canvas using Gemini AI. Use this when the user says "change the background of this image", "make this image look cinematic", "add X to this image", "edit this", "modify this photo", "retouch", etc. This PRESERVES the original subject and only applies the requested edit. Gemini analyzes the existing image and makes targeted edits. If no image is on canvas, falls back to generate_image.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Precise edit instruction (e.g. "Change the background to a tropical beach at golden hour", "Make the lighting more dramatic with rim lighting", "Remove the background and make it transparent", "Add cinematic color grading")' },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Where to place the edited image result' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'merge_images',
        description: 'Merge two or more images on the canvas into a new AI-generated image. Use this when the user asks to blend, merge, or combine images.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'Detailed prompt describing how the images should be combined or what the final output should look like' },
                imageNames: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional names of the images to merge if they are not specifically selected.'
                },
                position: { type: 'string', enum: ['center', 'top-center', 'bottom-center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'], description: 'Where to place the merged image' },
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
                model: { type: 'string', description: 'Which AI video model to use. Always default to "grok-imagine" unless specified.' },
                resolution: { type: 'string', enum: ['720p', '1080p', '4k'], description: 'Video resolution (default: 1080p)' },
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
    },

    // ═══════════════════════════════════════════════════════════════
    // ── CAMPAIGN GENERATION — Multi-size batch generation ──
    // ═══════════════════════════════════════════════════════════════
    {
        name: 'generate_campaign',
        description: 'Generate the SAME creative across MULTIPLE platform sizes simultaneously. Use this when the user asks for a "campaign", wants creatives for "all platforms", or mentions multiple formats. This tool generates one AI image and then intelligently adapts it across all requested platform presets. Each variant is placed as a separate artboard on the canvas.',
        input_schema: {
            type: 'object',
            properties: {
                prompt: { type: 'string', description: 'The primary image generation prompt (will be adapted per format)' },
                presets: {
                    type: 'array',
                    description: 'Array of platform presets to generate for',
                    items: {
                        type: 'string',
                        enum: ['ig-post', 'ig-post-square', 'ig-story', 'ig-reel', 'fb-post', 'fb-story', 'linkedin', 'yt-thumb', 'twitter', 'whatsapp-status', 'carousel', 'pinterest', 'banner', 'banner-square'],
                    },
                },
                headline: { type: 'string', description: 'Optional headline text to overlay on each variant' },
                ctaText: { type: 'string', description: 'Optional CTA button text (e.g. "Shop Now")' },
            },
            required: ['prompt', 'presets'],
        },
    },
    {
        name: 'critique_image',
        description: 'Run MCoT Post-Generation Critic on a generated image. Use this AFTER generate_image to verify quality and brand alignment. The backend analyzes the generated image using visual AI and returns a quality score, issues, and an improved prompt if needed. Use this when a user asks to "check quality", "review", or when you want to self-verify before presenting the result.',
        input_schema: {
            type: 'object',
            properties: {
                imageUrl: { type: 'string', description: 'URL of the generated image to critique' },
                originalPrompt: { type: 'string', description: 'The prompt that was used to generate this image' },
                brief: { type: 'string', description: 'The original user brief/request' },
                productName: { type: 'string', description: 'Expected product name (if applicable)' },
            },
            required: ['imageUrl'],
        },
    },
    {
        name: 'adapt_design',
        description: 'Smart Design Adaptation — intelligently adapts the current canvas design (all elements: images, text, CTAs, features, shapes) to multiple platform sizes WITHOUT losing the design\'s visual essence. Each element is AI-repositioned, rescaled, and reflowed to fit each target platform\'s aspect ratio while maintaining the visual hierarchy, brand colors, and design intent. Creates separate artboards side-by-side on the canvas. Use this when the user says "adapt this to IG", "resize for all platforms", "create variants for LinkedIn and Stories", "adapt to different sizes", or "magic resize".',
        input_schema: {
            type: 'object',
            properties: {
                presets: {
                    type: 'array',
                    description: 'List of target platform presets to adapt the design to. Choose from the full preset list based on what the user requests.',
                    items: {
                        type: 'string',
                        enum: ['ig-post', 'ig-post-square', 'ig-story', 'ig-reel', 'fb-post', 'fb-story', 'linkedin', 'yt-thumb', 'twitter', 'whatsapp-status', 'carousel', 'pinterest', 'banner', 'banner-square'],
                    },
                    minItems: 1,
                },
            },
            required: ['presets'],
        },
    },
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
            brand.dna?.colors?.length ? `Brand Colors: ${brand.dna.colors.map(c => `${c.name || c.usage || ''}:${c.hex || c}`).join(', ')}` : '',
            brand.dna?.fonts?.length ? `Brand Fonts: ${brand.dna.fonts.join(', ')}` : '',
            brand.dna?.logo?.url ? 'Brand logo: Available (use add_logo tool)' : 'Brand logo: Not uploaded',
            brand.dna?.voice?.personality ? `Brand Voice: ${brand.dna.voice.personality}` : '',
            brand.dna?.targetAudience ? `Target Audience: ${brand.dna.targetAudience}` : '',
        ].filter(Boolean).join('\n');

        // ⚡ Detect edit type BEFORE building system prompt — simple edits get a leaner prompt
        // to save ~1,500 tokens per request ($0.02-0.05 savings on Claude)
        const needsResearch = /\b(ad|creative|campaign|video|film|promo|poster|post|storyboard|script)\b/i.test(message)
            && !/\b(change|move|resize|delete|color|font|undo|redo)\b/i.test(message);

        // ── CREATIVE MASTERY SECTIONS (only included for creative generation requests) ──
        const creativeMasterySections = needsResearch ? `
## YOUR 3 CREATIVE ROLES

### 🎯 CREATIVE DIRECTOR — Strategic Vision
You decode user briefs into crystal-clear creative strategies. Before touching any tool, you ALWAYS think:
- **What's the ONE message?** Every great ad says ONE thing. Identify the single most powerful benefit/emotion.
- **Who's the audience?** Speak to their desires, fears, or aspirations. NOT generic — specific.
- **What's the hook?** The first 0.5 seconds must arrest attention. Lead with intrigue, not information.
- **What's the emotional journey?** Great ads make you FEEL something: aspiration, belonging, urgency, delight.
- **Campaign coherence**: Every element (image, text, color, font) must serve the same story.

### 🎨 ART DIRECTOR — Visual Mastery
You compose visuals with intention. Every pixel serves the story.

**Composition Rules (ALWAYS apply):**
- **Rule of Thirds**: Place the hero element at a power point (1/3 from edges), never dead center unless symmetry is the concept
- **Visual Hierarchy**: Eye flows: Hero Image → Headline → Subtext → CTA. Size, contrast, and position guide this naturally
- **Negative Space**: Don't fill every pixel. Premium = breathing room. Let the design BREATHE.
- **Focal Point**: ONE dominant element per canvas. Everything else supports it.
- **Z-Pattern / F-Pattern**: For text-heavy layouts, arrange elements along natural reading paths

**Color Theory (apply using brand colors):**
- **Primary brand color** → Hero backgrounds, brand elements, key visuals, large color blocks
- **Secondary brand color** → CTA buttons, accent highlights, dividers, badges, underlines
- **Dark/Neutral color** → Body text, subtle borders, section backgrounds
- **High Contrast**: Headlines MUST contrast sharply against their background (light on dark or dark on light). Minimum contrast ratio: 4.5:1
- **Color Harmony**: Use the brand palette intentionally — complementary for energy, analogous for sophistication, monochromatic for elegance
- **70-20-10 Rule**: 70% dominant color, 20% secondary, 10% accent

**Typography Hierarchy (when adding text):**
- **Display/Hero**: 64-96px, weight 800-900, tight tracking (-2 to -1), brand primary font
- **Heading**: 36-48px, weight 700, standard tracking
- **Subheading**: 20-28px, weight 600, slightly wider tracking
- **Body Copy**: 14-18px, weight 400, generous line height (1.5-1.6×)
- **Caption/CTA**: 12-16px, weight 700, uppercase with wide tracking (+2 to +4) for CTAs
- Font pairing: Use brand font for headlines + clean sans-serif (Inter, DM Sans) for body

**Photography/Visual Style (for image prompts):**
- **Product Hero**: Clean, floating product on gradient/solid background, dramatic lighting, shallow DOF. Best for: fashion, tech, beauty
- **Lifestyle**: Product in real-world context with aspirational setting. Natural light, warm tones. Best for: D2C, food, wellness
- **Flat Lay**: Top-down arrangement of product + complementary props on textured surface. Best for: beauty, food, accessories
- **Cinematic**: Wide-angle, moody lighting, dramatic shadows, film grain. Best for: premium, luxury, automotive
- **UGC-Style**: Candid, slightly imperfect, authentic feel. Warm filter, casual composition. Best for: Gen-Z, social media, D2C
- **Editorial**: High-fashion, high-contrast, bold poses, striking colors. Best for: fashion, beauty, premium
- ALWAYS inject brand colors and product features into image prompts. NEVER generate generic stock imagery.

### ✍️ COPYWRITER — Words That Convert

**Headline Formulas (choose based on objective):**
- **Benefit-Led**: "[Product] that [transforms/delivers] [specific benefit]" → "Earbuds that silence the world"
- **Curiosity**: "The [adjective] secret to [desirable outcome]" → "The quiet secret to 40-hour battery life"
- **Social Proof**: "[Number] [people] already [action]" → "50,000 audiophiles already switched"
- **Urgency**: "[Action] before [consequence/deadline]" → "Grab yours before midnight"
- **Question**: "Still [pain point]?" → "Still tangled in wires?"
- **Command**: "[Action verb] + [emotional benefit]" → "Unleash your sound"
- Max headline length: 6-10 words. Every word must earn its place.

**Copy Frameworks:**
- **AIDA** (Attention → Interest → Desire → Action): Hook them, intrigue them, make them want it, tell them what to do
- **PAS** (Problem → Agitate → Solution): Name the pain, twist the knife, present the product as relief
- **BAB** (Before → After → Bridge): Paint the frustrating "before", the glorious "after", and position the product as the bridge

**CTA Psychology:**
- Use action verbs: "Shop", "Discover", "Grab", "Get", "Try", "Start"
- Add urgency or scarcity: "Limited Drop", "Only 50 Left", "Ends Tonight"
- Make it benefit-oriented: "Get 40hrs of Music" beats "Buy Now"
- Keep CTAs 2-4 words max

**Platform Voice Adaptation:**
- **Instagram**: Punchy, visual-first, emoji-friendly, hashtag-ready. Short captions. Aspirational tone.
- **LinkedIn**: Professional yet human, insight-driven, thought leadership angle. No emoji overload.
- **YouTube**: Curiosity-driven thumbnails, bold text, expressive faces. Titles that promise value.
- **Twitter/X**: Witty, concise, conversation-starting. Hot takes welcome. Max impact in min words.
- **Facebook**: Community-oriented, slightly longer copy, benefit-focused. Works for older demographics.

## STORYBOARD PROMPT MASTERY
When calling create_storyboard_frames, compose imagePrompt like an elite art director:
- ❌ Bad: "Product shot of earbuds"
- ❌ Medium: "Black earbuds on a dark surface"
- ✅ Great: "Cinematic close-up of matte black ACWO DwOTS wireless earbuds with metallic accents on a dark reflective surface, dramatic side lighting creating rim highlights, shallow depth of field, brand colors #1A1A2E and #6366F1 as ambient glow accents, premium product photography, 4K quality, studio lighting"
- ALWAYS inject: brand colors, product material/finish from research, specific lighting direction, camera angle, mood keyword, and "4K quality, professional photography"
- For scenes with PEOPLE: describe ethnicity, age, expression, wardrobe, pose, and setting specifically
- For CONSISTENCY across scenes: repeat key visual elements (same color grading, same lighting style, same product positioning)

## RESPONSE FORMAT FOR CREATIVE REQUESTS
Start your reply with a <thinking> block:
<thinking>
CREATIVE STRATEGY:
- Single message: [the ONE thing this ad communicates]
- Emotional hook: [what feeling we're creating]
- Visual direction: [composition style + lighting + color approach]
- Copy angle: [which headline formula + copy framework + CTA approach]
- Brand alignment: [how we're using brand colors, fonts, voice]
</thinking>

Then announce your plan briefly:
"Here's my creative direction for the [Brand] [Product] ad:
🎯 **Concept**: [one-line creative concept]
1. ✅ Research completed (product details found)
2. 📝 Writing ad script with [N] scenes
3. 🎬 Generating [N] keyframe images ([composition style])
4. 🎙️ Creating voiceover narration
5. 🎵 Generating background music
⏸️ Will pause for your review before video generation"

Then call the tools for Phase 1 in order. After Phase 1 completes, STOP and ask user to confirm.
` : ''; // ⚡ Simple edits skip all creative mastery sections (~1,500 tokens saved)

        const systemPrompt = `You are Fidato — a world-class Creative Director, Art Director, and Senior Copywriter rolled into one AI. You think like the best minds at Ogilvy, Wieden+Kennedy, and Droga5. You don't just execute — you craft, you compose, you create work that stops scrolls and wins awards.

BRAND CONTEXT:
${brandContext}
${canvasContext}
${creativeMasterySections}
## PIPELINE — EXECUTE IN THIS EXACT ORDER

### For VIDEO ADS (any request mentioning "ad", "video", "film", "reel", "sec", "second"):

**PHASE 1 — Creative Assets (execute immediately):**
1. **create_script_block** — Write a professional ad script. Apply AIDA framework. Each scene needs a clear visual + emotional beat.
2. **create_storyboard_frames** — Generate keyframe images. EVERY imagePrompt must include: brand colors, product details from research, specific lighting/composition style, camera angle, and mood.
3. **generate_voiceover** — Create TTS narration (speaker: anushka for female, abhilash for male)
4. **generate_music** — Create background music matching the ad's mood and energy arc

**⚠️ STOP HERE — After Phase 1, you MUST pause and ask the user:**
"✅ Script, storyboard images, voiceover, and music are ready!

🎬 **Ready to generate videos?** Video generation costs credits for each scene. Review the storyboard images above and confirm:
👉 Reply **'Go'** to start video generation, or tell me which scenes to change."

**DO NOT proceed to video generation until the user confirms.** Wait for user to say "go", "yes", "proceed", etc.

**PHASE 2 — Video Generation (ONLY after user confirms):**
5. Generate video clips for each storyboard frame (via frontend)
6. **compile_workspace_assets** — Stitch everything into the final ad film

### For IMAGE ADS (posters, social posts, creatives):
1. **create_script_block** — Write ad copy: a killer headline (6-10 words, benefit-led or curiosity-led), a sharp subline, and a CTA
2. **create_storyboard_frames** — Generate the visual(s). Apply art direction: composition, focal point, brand colors in the prompt, product features from research. generateImages: true

### For MULTI-PLATFORM CAMPAIGNS (user says "campaign", "all platforms", "multi-size", mentions multiple formats):
1. **generate_campaign** — Generate the creative across ALL requested platform sizes in parallel
   - Choose the appropriate presets from: ig-post (4:5 portrait, RECOMMENDED for IG), ig-post-square (1:1), ig-story, ig-reel, fb-post, fb-story, linkedin, yt-thumb, twitter, whatsapp-status, carousel, pinterest, banner, banner-square
   - Each variant is auto-adapted for its platform's aspect ratio and composition rules
   - Write platform-appropriate headline and ctaText (punchy for IG, professional for LinkedIn, curiosity for YT)

### For ADAPT / RESIZE EXISTING DESIGN to platform sizes (user says "adapt this", "resize for FB", "make it work for Instagram", "size for YouTube"):
- Use **adapt_design** with the correct preset IDs. YOU MUST map natural language to exact preset IDs:
  - "facebook" / "fb" / "Facebook post" → **fb-post**
  - "facebook story" → **fb-story**
  - "instagram" / "insta" / "ig" → **ig-post** (default) — or ig-story if they say "story"
  - "instagram story" / "ig story" / "insta story" → **ig-story**
  - "instagram reel" / "reel" → **ig-reel**
  - "instagram square" → **ig-post-square**
  - "youtube" / "yt" / "YouTube thumbnail" → **yt-thumb**
  - "linkedin" / "LinkedIn" → **linkedin**
  - "twitter" / "X" → **twitter**
  - "whatsapp" / "wa" / "whatsapp status" → **whatsapp-status**
  - "pinterest" → **pinterest**
  - "banner" → **banner**
- NEVER ask the user which preset IDs to use — YOU map their natural language. They say "adapt for FB, insta and YT" → you call adapt_design with ["fb-post", "ig-post", "yt-thumb"].
- If they say "resize to instagram" → use set_canvas_size with preset="ig-post".
- NEVER respond with text asking for preset clarification. Always resolve and call the tool directly.

### For QUALITY REVIEW (after image generation):
- Use **critique_image** to run MCoT quality analysis on any generated image
- This returns a quality score (0-100) with breakdown by brief alignment, product accuracy, visual quality, and brand consistency
- If score < 75, consider regenerating with the improved prompt provided

### For SIMPLE EDITS (move, resize, color, font changes):
- **Repositioning**: Use **move_element** with position presets (center, top-left, top-right, bottom-left, bottom-right, top-center, bottom-center)
- **Property changes**: Use **change_element_property** for left, top, scaleX, scaleY, fill, opacity, fontSize, fontFamily, fontWeight, text, angle
- **Z-order**: Use **reorder_layer** to bring elements forward/backward
- **Removing**: Use **remove_element** to delete an element
- Use add_text, add_shape, set_background for adding new elements
- ⚠️ NEVER use tool names like "update_layer" or "update_element" — these do NOT exist. Use the exact names listed above.

### For IMAGE EDITING & MERGING (combine, blend, merge, edit images):
- **Merging/Combining**: Use **merge_images** — it will automatically find and merge images on the canvas. You do NOT need the user to select images manually.
  - If the canvas state shows 2+ image elements, merge_images will combine them automatically
  - Pass specific image names via \`imageNames\` array if the user references specific images
  - Always include a detailed \`prompt\` describing how the images should be combined
- **Generating new images**: Use **generate_image** with a detailed prompt
- **Editing existing images**: If user says "change the background", "make this cinematic", "add X to this image", "edit this photo", "retouch" — use **edit_image** with a precise edit instruction. Gemini will analyze the canvas image and apply targeted edits while preserving the subject.
- ⚠️ NEVER use tool names like "swap_image", "replace_image" — these do NOT exist. Use merge_images, generate_image, or edit_image.

## MCoT VISUAL GROUNDING
If the research data below includes a "🧠 MCoT VISUAL GROUNDING" section, this means our AI has ALREADY analyzed the brand's actual product images. You MUST reference these observations in your prompts:
- Use the exact colors, materials, and features described
- Follow the "CRITICAL GENERATION GUIDANCE" instructions
- Do NOT contradict the visual observations with invented features

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

## CRITICAL RULES
- ALWAYS use research data provided — never make up product features
- ALWAYS call create_script_block BEFORE create_storyboard_frames
- ALWAYS inject brand colors into image generation prompts (specify exact hex codes)
- ALWAYS apply typography hierarchy when adding text elements (display → heading → body → caption sizing)
- ALWAYS apply composition rules (rule of thirds, visual hierarchy, focal point)
- Be extremely detailed in storyboard image prompts — follow the "STORYBOARD PROMPT MASTERY" format
- For video ads: script scenes must include voiceover text and duration per scene
- For voiceover: ONLY use speaker 'anushka' (female) or 'abhilash' (male). No other speakers.
- NEVER just add plain text elements for ad requests — use the full pipeline
- ⚡ VIDEO GENERATION — DEFAULT MODEL: **grok-imagine** (Grok Video by xAI). DO NOT ask for model confirmation before starting. Instead:
  1. Call generate_video_clip immediately with model="grok-imagine" and resolution="1080p" as defaults.
  2. In your response text BEFORE calling the tool, say: "🎬 Generating your video with **Grok** (default). Reply with a model name below to switch:"
  3. Then offer these model options inline in your message text (user can reply to switch):
     - **Grok** (default) — Fast & cinematic. Best for brand ads.
     - **Kling** — High detail, great for lifestyle/realism.
     - **Seedance** — Indian market optimized, fast renders.
     - **Wan** — Creative/surreal visuals, best for abstract.
     - **Hailuo** — High-fidelity, cinematic motion.
  4. If the user replies with a model name, regenerate with that model using generate_video_clip.
  5. NEVER block generation waiting for a model choice. Default to grok-imagine and keep moving.
  6. Resolution default is 1080p. If user says "4K" use resolution="4k". If on mobile/story use aspectRatio="9:16".`;

        // ── PRE-FLIGHT: Pull data from Brand DNA + Product catalog (NO web search) ──
        const aiRouter = getAIRouter();
        let result;
        let preFlightResearch = '';
        let referenceImages = [];

        // needsResearch already computed above (line ~431) for system prompt optimization

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

            // ── Step 1: Brand DNA context (Using Cached MCP util) ──
            const { brand: cachedBrand } = await loadBrandContext(brand._id);
            const dna = cachedBrand?.dna || brand.dna || {};
            const brandCountry = dna.country || cachedBrand?.country || 'India';
            const currencyMap = { 'India': 'INR ₹', 'US': 'USD $', 'USA': 'USD $', 'UK': 'GBP £', 'UAE': 'AED', 'Canada': 'CAD' };
            const localCurrency = currencyMap[brandCountry] || brandCountry;

            preFlightResearch += `\n## BRAND DNA (FROM DATABASE — VERIFIED DATA)\n`;
            preFlightResearch += `Brand: ${cachedBrand?.name || 'Unknown'}\n`;
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

            // ── Creative Direction Hints (Art Director + Copywriter briefing pack) ──

            // Brand Color Application Guide
            if (dna.colors?.length >= 2) {
                const primary = dna.colors[0];
                const secondary = dna.colors[1];
                const tertiary = dna.colors[2];
                preFlightResearch += `\n## 🎨 COLOR APPLICATION GUIDE\n`;
                preFlightResearch += `- PRIMARY (${primary.hex}): Use for hero backgrounds, large color blocks, brand text, key visuals\n`;
                preFlightResearch += `- SECONDARY (${secondary.hex}): Use for CTA buttons, accent highlights, badges, underlines\n`;
                if (tertiary) preFlightResearch += `- TERTIARY (${tertiary.hex}): Use for body text, subtle borders, section dividers\n`;
                preFlightResearch += `- Apply 70-20-10 rule: 70% ${primary.hex}, 20% ${secondary.hex}, 10% accent\n`;
                preFlightResearch += `- For IMAGE PROMPTS: always mention "${primary.hex} and ${secondary.hex} as ambient color accents" to ensure brand-consistent visuals\n`;
            }

            // Brand Voice Examples (derived from existing brand data)
            if (dna.tagline || dna.uniqueSellingPoints?.length || dna.voice?.personality) {
                preFlightResearch += `\n## ✍️ BRAND VOICE GUIDE\n`;
                if (dna.voice?.personality) {
                    preFlightResearch += `Tone: ${dna.voice.personality}\n`;
                    preFlightResearch += `When writing copy, channel this tone. Example approaches:\n`;
                    const tone = (dna.voice.personality || '').toLowerCase();
                    if (tone.includes('professional') || tone.includes('corporate') || tone.includes('formal')) {
                        preFlightResearch += `  - Use refined, authoritative language. Avoid slang. Lead with expertise and trust.\n`;
                        preFlightResearch += `  - Headlines: Benefit-Led or Social Proof formulas work best\n`;
                    } else if (tone.includes('playful') || tone.includes('fun') || tone.includes('casual') || tone.includes('friendly')) {
                        preFlightResearch += `  - Use conversational, approachable language. Light humor welcome. Emojis OK for social.\n`;
                        preFlightResearch += `  - Headlines: Question or Command formulas work best\n`;
                    } else if (tone.includes('luxury') || tone.includes('premium') || tone.includes('sophisticated')) {
                        preFlightResearch += `  - Use elegant, minimal language. Less is more. Evoke aspiration and exclusivity.\n`;
                        preFlightResearch += `  - Headlines: Curiosity or Benefit-Led formulas work best\n`;
                    } else if (tone.includes('bold') || tone.includes('edgy') || tone.includes('youthful') || tone.includes('gen-z')) {
                        preFlightResearch += `  - Use punchy, direct language. Break conventions. Speak like a peer, not a brand.\n`;
                        preFlightResearch += `  - Headlines: Command or Urgency formulas work best\n`;
                    } else {
                        preFlightResearch += `  - Match the "${dna.voice.personality}" tone in all copy. Be authentic to the brand's character.\n`;
                    }
                }
                if (dna.tagline) {
                    preFlightResearch += `Reference tagline for style: "${dna.tagline}"\n`;
                }
                if (dna.uniqueSellingPoints?.length) {
                    preFlightResearch += `Key selling points to weave into copy: ${dna.uniqueSellingPoints.slice(0, 3).join(' | ')}\n`;
                }
            }

            // Recommended Visual Style based on industry
            if (dna.industry) {
                preFlightResearch += `\n## 📸 RECOMMENDED VISUAL DIRECTION\n`;
                const ind = (dna.industry || '').toLowerCase();
                if (ind.includes('tech') || ind.includes('electronics') || ind.includes('software') || ind.includes('saas')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Product Hero or Cinematic style. Dark backgrounds, dramatic lighting, neon/tech accents. Clean, futuristic compositions.\n`;
                } else if (ind.includes('fashion') || ind.includes('apparel') || ind.includes('clothing')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Editorial or Lifestyle style. Bold poses, striking colors, high-fashion lighting. Aspirational settings.\n`;
                } else if (ind.includes('beauty') || ind.includes('cosmetic') || ind.includes('skincare')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Flat Lay or Product Hero style. Soft, diffused lighting. Dewy textures. Clean, minimal compositions with complementary props.\n`;
                } else if (ind.includes('food') || ind.includes('beverage') || ind.includes('restaurant') || ind.includes('fmcg')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Lifestyle or Flat Lay style. Warm tones, natural light, appetizing compositions. Close-up textures.\n`;
                } else if (ind.includes('health') || ind.includes('wellness') || ind.includes('fitness')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Lifestyle style. Natural light, warm tones, aspirational settings. Active, energetic compositions.\n`;
                } else if (ind.includes('luxury') || ind.includes('jewelry') || ind.includes('premium')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Cinematic or Product Hero style. Rich textures, dramatic shadows, selective focus. Elegant, minimal compositions.\n`;
                } else if (ind.includes('education') || ind.includes('edtech')) {
                    preFlightResearch += `Industry "${dna.industry}" → Recommended: Lifestyle or UGC style. Bright, clean, approachable imagery. Diverse, relatable people in learning settings.\n`;
                } else {
                    preFlightResearch += `Industry "${dna.industry}" → Choose the visual style that best matches the brand's personality and target audience.\n`;
                }
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

            // ═══════════════════════════════════════════════════════════════
            // MCoT Stage 1: VISUAL GROUNDING — SKIPPED FOR LATENCY
            // Native visual grounding deferred directly to the diffusion model
            // ═══════════════════════════════════════════════════════════════
            let visualGroundingResult = null;
            
            console.log(`   ✅ Brand DNA research: ${preFlightResearch.length} chars, ${referenceImages.length} images`);

            // ── Return pre-flight results for user confirmation ──
            return res.json({
                success: true,
                preflightConfirmation: true,
                reply: '',
                research: preFlightResearch || '(No brand data found)',
                referenceImages: referenceImages,
                visualGrounding: visualGroundingResult || null,
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

        // Filter out server-side tools — Claude doesn't need search_web anymore
        // Declared outside try/catch so it's accessible in the Gemini fallback catch block
        const clientTools = CANVAS_TOOLS.filter(t => t.name !== 'search_web' && t.name !== 'download_brand_assets');

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

            result = await anthropic.generateWithTools({
                systemPrompt: enrichedSystemPrompt,
                userPrompt,
                tools: clientTools,
                toolHandlers: {}, // No server-side tools needed — research done pre-flight
                temperature: 0.5,
                maxTokens: 4096,
                model: 'claude-sonnet-4-20250514',
            });

            // Attach reference images to response
            req._referenceImages = referenceImages;

            console.log(`   ✅ Claude returned: ${result.toolCalls.length} tool calls, ${result.text.length} chars text`);
        } catch (claudeErr) {
            console.warn(`   ⚠️ Claude tool-use failed: ${claudeErr.message?.substring(0, 100)}`);

            // RETRY: Try Claude again with a clean slate before resorting to Gemini
            try {
                const anthropic = aiRouter.getProvider('anthropic');
                console.log('   🔄 Retrying Claude with simple configuration...');
                result = await anthropic.generateWithTools({
                    systemPrompt: systemPrompt,
                    userPrompt: message,
                    tools: clientTools,
                    temperature: 0.2,
                    maxTokens: 2048,
                    model: 'claude-sonnet-4-20250514'
                });
                req._referenceImages = referenceImages;
            } catch (claudeRetryErr) {
                // ── Detect adapt/resize intent before calling Gemini ──
                // If user wants to adapt/resize to platforms, return adapt_design directly
                // without calling AI (Gemini can't reliably pick adapt_design over basic tools)
                const lowerMsg = message.toLowerCase();

                // ── Broad intent detection — catches natural language variations ──
                const isAdaptIntent = /adapt|resize|reformat|repurpose|optimise|optimize|convert|size for|version for|create.*(version|variant|size|format)|make.*for|export.*for|fit.*for|tailor.*for/i.test(lowerMsg);

                // Platform mentioned: specific platform OR generic terms like "social media", "all platforms", "different sizes"
                const specificPlatform = /facebook|fb|instagram|insta|\big\b|\bigs\b|youtube|\byt\b|linkedin|twitter|\bx\b|whatsapp|\bwa\b|tiktok|pinterest/i.test(lowerMsg);
                const genericPlatform = /social media|all platform|multiple platform|every platform|different (size|format|platform)|multiple (size|format)|various (size|format|platform)|different social|all (size|format)|platforms?/i.test(lowerMsg);
                const platformMentioned = specificPlatform || genericPlatform;

                // Also detect if user just mentions sizes/dimensions without "adapt"
                const isSizeOnly = /sizes?|dimensions?|formats?/i.test(lowerMsg) && platformMentioned;

                if ((isAdaptIntent || isSizeOnly) && platformMentioned) {
                    // Resolve specific platforms
                    const resolvedPresets = [];
                    if (/facebook|\bfb\b/i.test(lowerMsg)) {
                        resolvedPresets.push(/story/i.test(lowerMsg) ? 'fb-story' : 'fb-post');
                    }
                    if (/instagram|insta|\big\b|\bigs\b/i.test(lowerMsg)) {
                        if (/story/i.test(lowerMsg)) resolvedPresets.push('ig-story');
                        else if (/reel/i.test(lowerMsg)) resolvedPresets.push('ig-reel');
                        else resolvedPresets.push('ig-post');
                    }
                    if (/youtube|\byt\b/i.test(lowerMsg)) resolvedPresets.push('yt-thumb');
                    if (/linkedin/i.test(lowerMsg)) resolvedPresets.push('linkedin');
                    if (/\btwitter\b|\bx\b/i.test(lowerMsg)) resolvedPresets.push('twitter');
                    if (/whatsapp|\bwa\b/i.test(lowerMsg)) resolvedPresets.push('whatsapp-status');
                    if (/pinterest/i.test(lowerMsg)) resolvedPresets.push('pinterest');

                    // No specific platform = "social media", "all platforms", "different sizes" etc.
                    // Default to the 4 most common platforms
                    if (resolvedPresets.length === 0) {
                        resolvedPresets.push('ig-post', 'fb-post', 'yt-thumb', 'linkedin');
                    }
                    
                    console.log(`   🎯 [Fallback] Detected adapt intent → calling adapt_design directly with [${resolvedPresets.join(', ')}]`);
                    return res.json({
                        success: true,
                        reply: `🎨 Adapting your design for ${resolvedPresets.length} platform${resolvedPresets.length > 1 ? 's' : ''}: ${resolvedPresets.join(', ')}...`,
                        toolCalls: [{ name: 'adapt_design', args: { presets: resolvedPresets } }],
                        fallback: true,
                        provider: 'rule-based',
                        generationTime: Date.now() - startTime,
                    });
                }
                
                // Also detect a single platform resize request
                const isSingleResize = /resize to|change to|switch to|make it|set (canvas|size|canvas size) to/i.test(lowerMsg);
                if (isSingleResize && platformMentioned) {
                    let presetId = 'ig-post';
                    if (/facebook|fb/i.test(lowerMsg)) presetId = /story/i.test(lowerMsg) ? 'fb-story' : 'fb-post';
                    else if (/youtube|\byt\b/i.test(lowerMsg)) presetId = 'yt-thumb';
                    else if (/linkedin/i.test(lowerMsg)) presetId = 'linkedin';
                    else if (/story/i.test(lowerMsg)) presetId = 'ig-story';
                    else if (/reel/i.test(lowerMsg)) presetId = 'ig-reel';
                    
                    console.log(`   🎯 [Fallback] Detected resize intent → calling set_canvas_size with [${presetId}]`);
                    return res.json({
                        success: true,
                        reply: `📐 Resizing canvas to ${presetId}...`,
                        toolCalls: [{ name: 'set_canvas_size', args: { preset: presetId } }],
                        fallback: true,
                        provider: 'rule-based',
                        generationTime: Date.now() - startTime,
                    });
                }

                // General fallback: Gemini generates basic canvas actions
                const validToolNames = clientTools.map(t => t.name).join(', ');
                const fallbackResult = await aiRouter.generateText({
                    systemPrompt: `You are Fidato, an AI creative director. The user wants to modify their canvas. Since tool-use is unavailable, respond with a JSON object containing "actions" — an array of canvas actions the frontend should execute.
${brandContext}
${canvasContext}

VALID TOOLS (you MUST only use these exact names — NO other tool names):
${validToolNames}

For repositioning elements, use "move_element" with { position: "center" | "top-left" | etc. } or "change_element_property" with { property: "left" | "top", value: "number" }.

DO NOT use set_background or add_text unless the user EXPLICITLY asks to change background or add text.

Respond ONLY with valid JSON: { "reply": "friendly message", "actions": [{ "tool": "EXACT_TOOL_NAME_FROM_LIST", "args": {...} }] }`,
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
                } catch (parseErr) {
                    console.warn('⚠️ Fallback JSON parsing failed:', parseErr.message);
                    let cleanReply = fallbackResult.text || 'I can help with your canvas design. Could you be more specific?';
                    if (cleanReply.includes('```json') || cleanReply.includes('"actions":')) {
                       cleanReply = "I planned some updates for your canvas, but encountered an unexpected error formatting them. Could you try asking me to make that change again?";
                    }
                    return res.json({
                        success: true,
                        reply: cleanReply,
                        toolCalls: [],
                        fallback: true,
                        provider: fallbackResult.provider,
                        generationTime: Date.now() - startTime,
                    });
                }
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
            visualGrounding: req._visualGrounding || null,
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
        const { prompt, duration, aspectRatio, sourceImageUrl, model, resolution } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });

        console.log(`🎬 Canvas Video: "${prompt.substring(0, 60)}..." | model=${model || 'grok'} | res=${resolution || '1080p'}`);

        // Route both I2V and T2V through the main pipeline for LZ-first routing
        const { advancedGenerateNode } = await import('../agents/videoStudio/nodes.js');
        const selectedModel = model || 'grok';

        const state = await advancedGenerateNode({
            prompt: prompt.trim(),
            model: selectedModel,
            duration: duration || 5,
            resolution: resolution || '1080p',
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

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) return res.status(500).json({ error: 'TTS not configured (GEMINI_API_KEY missing)' });

        console.log(`🎙️ Canvas Voiceover: ${text.length} chars, lang=${language || 'en-IN'}, speaker=${speaker || 'Aoede'}`);

        const cleanText = text
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/→/g, ', ').replace(/\n{2,}/g, '. ').replace(/\n/g, ', ').trim();

        if (!cleanText || cleanText.length < 2) return res.status(400).json({ error: 'No speakable text after cleanup' });

        const promptText = `Please speak the following text fluently in ${language || 'regional language'} with an expressive tone:\n\n${cleanText.substring(0, 2000)}`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + geminiKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: speaker || 'Aoede' } }
                    }
                }
            }),
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            throw new Error(`Gemini TTS failed: ${response.status} ${errBody.substring(0, 100)}`);
        }

        const data = await response.json();
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));
        if (!audioPart?.inlineData?.data) throw new Error('No audio in Gemini TTS response');

        // Upload to S3 for persistence
        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        const ext = mimeType.includes('mp3') ? 'mp3' : 'wav';
        const s3Key = `canvas-voiceover/${req.user._id}/${Date.now()}-vo.${ext}`;
        const audioUrl = await uploadToS3(audioBuffer, s3Key, mimeType);

        console.log(`✅ Canvas Voiceover generated: ${audioUrl.substring(0, 60)}`);

        res.json({
            success: true,
            audioUrl,
            duration: Math.ceil(cleanText.split(/\s+/).length / 2.5), // rough estimate: 2.5 words/sec
            format: ext,
            provider: 'gemini-2.0-flash-exp',
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

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-critique — MCoT Post-Generation Critic
// Analyzes a generated image for quality, brand alignment, and accuracy
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-critique', protect, requireCredits('creativeCritique'), async (req, res) => {
    try {
        const { imageUrl, originalPrompt, brief, productName, brandContext: clientBrandContext } = req.body;
        if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

        console.log(`🔎 MCoT Canvas Critic: Analyzing generated image...`);
        const startTime = Date.now();

        const brand = req.brand || {};
        const brandName = brand.name || 'Unknown';

        const userPrompt = [
            brief ? `ORIGINAL CREATIVE BRIEF: ${brief}` : '',
            originalPrompt ? `GENERATED WITH PROMPT: ${originalPrompt.substring(0, 500)}` : '',
            `BRAND: ${brandName}${brand.dna?.industry ? ` (${brand.dna.industry})` : ''}`,
            productName ? `EXPECTED PRODUCT: "${productName}"` : 'No specific product expected',
            `\nAnalyze the generated image (provided) against these requirements. Score it honestly.`,
        ].filter(Boolean).join('\n');

        const result = await agentUtils.callMultimodalAgent(
            POST_GENERATION_CRITIC_PROMPT,
            userPrompt,
            [imageUrl],
            { temperature: 0.2, maxTokens: 2048 }
        );

        if (result.error || result.skipped) {
            console.warn(`🔎 MCoT Canvas Critic: Failed (${result.error})`);
            return res.json({ success: true, critique: null, error: result.error });
        }

        console.log(`🔎 MCoT Canvas Critic: Score ${result.overallScore}/100, verdict: ${result.verdict} (${Date.now() - startTime}ms)`);

        res.json({
            success: true,
            critique: result,
            generationTime: Date.now() - startTime,
        });
    } catch (err) {
        console.error('Canvas critique error:', err.message);
        res.status(500).json({ error: err.message || 'Critique failed' });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// POST /api/fidato/canvas-campaign — Multi-size campaign generation
// Generates images across multiple platform presets in parallel
// ═══════════════════════════════════════════════════════════════════════
router.post('/canvas-campaign', protect, requireCredits('creativeCampaign'), async (req, res) => {
    try {
        const { prompt, presets, headline, ctaText, brandId } = req.body;
        if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
        if (!presets?.length) return res.status(400).json({ error: 'At least one preset is required' });

        console.log(`🎯 Canvas Campaign: Generating ${presets.length} variants — "${prompt.substring(0, 60)}..."`);
        const startTime = Date.now();

        // Preset dimensions map (2025 Recommended Dimensions)
        const PRESET_MAP = {
            'ig-post':         { w: 1080, h: 1350, label: 'Instagram Post (4:5)',   aspectRatio: '4:5' },
            'ig-post-square':  { w: 1080, h: 1080, label: 'Instagram Square',        aspectRatio: '1:1' },
            'ig-story':        { w: 1080, h: 1920, label: 'Instagram Story',         aspectRatio: '9:16' },
            'ig-reel':         { w: 1080, h: 1920, label: 'Instagram Reel',          aspectRatio: '9:16' },
            'fb-post':         { w: 1200, h: 630,  label: 'Facebook Post',           aspectRatio: '1.91:1' },
            'fb-story':        { w: 1080, h: 1920, label: 'Facebook Story',          aspectRatio: '9:16' },
            'linkedin':        { w: 1200, h: 628,  label: 'LinkedIn Post',           aspectRatio: '1.91:1' },
            'yt-thumb':        { w: 1280, h: 720,  label: 'YouTube Thumbnail',       aspectRatio: '16:9' },
            'twitter':         { w: 1600, h: 900,  label: 'Twitter/X Post',          aspectRatio: '16:9' },
            'whatsapp-status': { w: 1080, h: 1920, label: 'WhatsApp Status',         aspectRatio: '9:16' },
            'carousel':        { w: 1080, h: 1080, label: 'Carousel Slide',          aspectRatio: '1:1' },
            'pinterest':       { w: 1000, h: 1500, label: 'Pinterest Pin',           aspectRatio: '2:3' },
            'banner':          { w: 1920, h: 600,  label: 'Web Banner',              aspectRatio: '16:5' },
            'banner-square':   { w: 1200, h: 1200, label: 'Display Ad Square',       aspectRatio: '1:1' },
        };


        // Build campaign variants with adapted prompts
        const variants = presets.map(preset => {
            const spec = PRESET_MAP[preset] || PRESET_MAP['ig-post'];
            let adaptedPrompt = prompt;
            
            // Adapt prompt for aspect ratio
            if (spec.aspectRatio === '9:16') {
                adaptedPrompt += '. Vertical composition, subject centered with room above and below.';
            } else if (spec.aspectRatio === '16:9') {
                adaptedPrompt += '. Wide cinematic composition, subject positioned using rule of thirds.';
            } else if (spec.aspectRatio === '16:5') {
                adaptedPrompt += '. Ultra-wide panoramic banner composition, subject left-aligned with text space right.';
            }
            
            // Inject text overlay instructions
            if (headline) {
                adaptedPrompt += ` Bold text reading "${headline}" in clean, high-contrast typography.`;
            }
            if (ctaText) {
                adaptedPrompt += ` Include a CTA button/badge with "${ctaText}" in accent color at bottom.`;
            }

            return {
                preset,
                label: spec.label,
                width: spec.w,
                height: spec.h,
                aspectRatio: spec.aspectRatio,
                prompt: adaptedPrompt,
            };
        });

        res.json({
            success: true,
            campaign: {
                variants,
                totalFormats: variants.length,
                headline: headline || null,
                ctaText: ctaText || null,
            },
            generationTime: Date.now() - startTime,
            message: `Campaign plan ready with ${variants.length} platform variants. The frontend will generate images for each.`,
        });
    } catch (err) {
        console.error('Canvas campaign error:', err.message);
        res.status(500).json({ error: err.message || 'Campaign generation failed' });
    }
});

export default router;


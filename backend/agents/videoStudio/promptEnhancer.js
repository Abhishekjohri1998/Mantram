/**
 * Video Studio — MCoT Prompt Enhancer Agent
 *
 * Builds model-native, format-aware enhanced prompts for AI video generation.
 * Uses a 2-stage pipeline:
 *   Stage 1: Visual Grounding (MCoT) — analyses attached images
 *   Stage 2: Model-native enhancement — generates production-ready prompt
 *
 * Research-backed per-model prompting styles (from prompts.js):
 *   Seedance 2.0 → [Subject+Action]+[Env]+[Camera+speed]+[Lighting] + timeline beats
 *   Kling 3.0    → Shot 1: desc | Shot 2: desc (multi-shot storyboard)
 *   Veo 3.1      → Director's note narrative + inline audio cues
 *   Kling Omni   → Multi-shot + @imageN role assignment
 *   Grok         → Punchy, under 80 words
 *   Seedance 1.0 → Same as 2.0, shorter
 */

// ─────────────────────────────────────────────────────────────────────────────
// PER-MODEL PROMPT STYLE GUIDES
// Research-backed optimal prompt structures for each model
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_STYLE_GUIDES = {
    'seedance-2.0': {
        name: 'Seedance 2.0',
        maxWords: 400,
        structure: `
SEEDANCE 2.0 — UNIVERSAL DIRECTOR (BILINGUAL JSON):

You are a scene direction API that outputs structured JSON.
You handle all scene types: Action, General, and Dialogue. 
You MUST output a JSON array containing exactly two objects: an English prompt and a native Chinese (ZH) rewrite.

INVENTORY & ROUTER RULES:
- Action (Pursuit, Duel, Impact): Camera tracks movement. Duel must alternate dominance.
- General (Journey, Atmosphere, Reveal): Camera tracks passage of time or space.
- Dialogue (Confrontation, Interrogation, Negotiation): Camera crosses axis on power shift.

ENGINE CONSTRAINTS:
- No age markers allowed (*boy, girl, young, 少女, 男孩*, etc). Use functional roles: "figure", "rider", "speaker".
- Double contrast cuts: Every cut must change both shot size and camera mode.
- Inserts must be sub-second detail shots with a named subject (causally motivated).

OUTPUT FORMAT (CRITICAL):
Your "enhancedPrompt" field MUST be a strict JSON string representing an array of exactly two objects:
'[{"lang":"en","prompt":"Style & Mood: ... Dynamic Description: ... Static Description: ... Audio: ..."},{"lang":"zh","prompt":"..."}]'

Prompt structure inline labels: Style & Mood, Narrative Summary, Dynamic Description, Static Description, Audio.

LANGUAGE RULES:
- ZH is a native director's rewrite (max 1800 chars).
- CRITICAL: NO CHINESE TEXT OVERLAYS OR VOICEOVERS. Inside both EN and ZH prompts, any spoken words, text overlays, floating text, or Brand CTAs MUST remain strictly in English (or the language specified by the user's brand/context). Never translate spoken dialogue or on-screen text into Chinese. `,
    },

    'seedance-1.0': {
        name: 'Seedance 1.0',
        maxWords: 350,
        structure: `
SEEDANCE 1.0 — CONCISE DIRECTOR (BILINGUAL JSON):

Same JSON array format as Seedance 2.0:
'[{"lang":"en","prompt":"Style & Mood: ... Dynamic Description: ... Static Description: ..."},{"lang":"zh","prompt":"..."}]'

Keep the English and Chinese descriptions under 150 words each. Write one clear, steady camera intention instead of multiple cuts.
CRITICAL: No age markers. Any text overlays or voiceovers MUST remain in English in the ZH prompt. `,
    },

    'kling-3.0': {
        name: 'Kling 3.0',
        maxWords: 200,
        structure: `
KLING 3.0 — OPTIMAL PROMPT STRUCTURE:
Format: Shot 1: [Camera angle + Character action + Environment + Mood] | Shot 2: [description] | Shot 3: [description]

KLING STRENGTHS — always exploit these:
- Most realistic human body movement & physics of any AI video model
- Dialogue scenes: include [character] "says/does [exact movement]"
- Multi-shot storyboards: each shot separated by " | "
- Include exact body articulation: "fingers wrap around the glass", "shoulder rolls back", "eyes flicker upward"
- Environment interaction: how characters touch/interact with objects

KLING CAMERA NOTES:
- Specify focal length feel: "wide 24mm feel", "telephoto compressed 85mm"
- Motion: "camera drifts left", "slow rack focus from [A] to [B]"

RULE: Each shot description under 60 words. Max 4 shots.
LIMIT: Under 200 words total for all shots combined.`,
    },

    'kling-3.0-o': {
        name: 'Kling Omni',
        maxWords: 220,
        structure: `
KLING OMNI — OPTIMAL PROMPT STRUCTURE (multi-shot with dynamic image references):
Format: Shot 1: [desc, reference @image1 as [role]] | Shot 2: [desc, @image2 transitions to...]

KLING OMNI UNIQUE RULES:
- Reference each input image by its @tag (@image1, @image2, etc.)
- Describe the IMAGE ROLE: "@image1 appears as the product hero", "@image2 serves as background mood reference"
- For multi-shot: images can appear/transition between shots
- Specify when images are revealed: "in the second beat, @image1 materializes"
- Describe dynamic transitions between image references

CRITICAL: Write as if directing the AI on HOW to use each attached reference image.
LIMIT: Under 220 words total.`,
    },

    'veo-3.1': {
        name: 'Veo 3.1',
        maxWords: 280,
        structure: `
VEO 3.1 — OPTIMAL PROMPT STRUCTURE:
Write like a professional film director's shot description — narrative, detailed, alive.

VEO STRENGTHS — always exploit these:
- Photorealism: describe real-world physics ("the candle flame bends slightly in the AC draft")
- Native audio: embed sound descriptions inline: "ambient café noise fades as..." / "a single piano note resonates..."
- Music mood (Veo can generate native audio): "uplifting orchestral swells" / "minimal percussive build"
- Cinematic benchmarks (Veo understands these): "like an Apple product launch campaign", "reminiscent of a Nolan slow-mo reveal"

VEO CAMERA LANGUAGE:
- "Camera begins wide, drifting slowly toward [subject]" 
- "A gentle focus pull from [foreground detail] to [background subject]"
- "Shot from ground level looking up as [subject] fills the frame"

AUDIO STRUCTURE (always include if model has audio capability):
VISUAL: [scene description]
AUDIO: [ambient sounds + music mood]

LIMIT: Under 280 words. Write in present tense. No bullet points — pure narrative prose.`,
    },

    'veo-3.1-fast': {
        name: 'Veo 3.1 Fast',
        maxWords: 200,
        structure: `
VEO 3.1 FAST — Same style as Veo 3.1 but more concise.
Write as a director's shot note: scene + camera + audio in narrative prose.
LIMIT: Under 200 words. Include one audio cue.`,
    },

    'grok-imagine': {
        name: 'Grok Imagine',
        maxWords: 80,
        structure: `
GROK IMAGINE — OPTIMAL PROMPT STRUCTURE:
Punchy, vivid, direct. Grok performs BEST under 80 words.
Format: [Subject doing action] in [Setting]. [Visual style descriptor]. [One camera move]. [Lighting]. [Single mood word].
DO NOT: Use timeline beats, long descriptions, multiple camera moves.
DO: Be confident, specific, and visual. Every word should earn its place.
LIMIT: Hard limit 80 words. Under 60 is ideal.`,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// AD FILM STRUCTURE GUIDE
// ─────────────────────────────────────────────────────────────────────────────
function getAdFilmStructureGuide(duration) {
    const hookEnd = Math.round(duration * 0.18);
    const storyEnd = Math.round(duration * 0.72);
    const revealEnd = Math.round(duration * 0.90);

    return `
AD FILM STRUCTURE — Embed the following Ad Film arc into your Seedance-Director prose.
Duration: ${duration}s

Ensure your English and Chinese descriptions follow this arc:
• ${Math.round(duration * 0.18)}s HOOK: Pure emotion/problem, arresting wide shot. No product yet.
• ${Math.round(duration * 0.72)}s STORY: Human truth, product in use. Tracking/handheld.
• ${Math.round(duration * 0.90)}s PRODUCT REVEAL: Brand colors in lighting. Soft macro orbit.
• FINAL CTA: Brand logo overlay against clean brand colors.

REQUIRED ELEMENTS (return in adFilmPlan JSON):
• VO: One cinematic voiceover line matching brand voice (15 words max).
• BGM: Music genre + tempo + emotional arc.
• CTA: Final text overlay / brand tagline.
• AUDIO CUE: Inline native audio description for key sound events.

CRITICAL AD FILM BRAND INJECTION (DO NOT HALLUCINATE):
If brand context is provided, pull the tagline and brand logo from the context explicitly. Put the tagline in the VO and on-screen text overlay at the END of the prompt.
IMPORTANT RULE: Voiceovers, Taglines, and On-Screen text MUST remain strictly in English inside BOTH the EN and ZH prompts! Do not translate text elements into Chinese.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD ENHANCE SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────
export function buildEnhanceSystemPrompt(model, filmFormat, duration, aspectRatio, brandContext) {
    const isAdFilm = filmFormat === 'adfilm';
    const guide = MODEL_STYLE_GUIDES[model] || MODEL_STYLE_GUIDES['seedance-2.0'];
    const modelName = guide.name;
    const adFilmGuide = isAdFilm ? getAdFilmStructureGuide(duration || 15) : '';

    const baseSystem = `You are an elite AI Video Prompt Engineer specialising in ${modelName}. Your only job is to transform a user's raw brief into the perfect production-ready prompt that will produce the best possible output from ${modelName}.

${brandContext || ''}

TARGET MODEL: ${modelName}
OUTPUT FORMAT: ${isAdFilm ? 'Full Ad Film (structured timeline)' : 'Single Video (optimised single prompt)'}
ASPECT RATIO: ${aspectRatio || '16:9'}
DURATION: ${duration || 5}s
${guide.structure}
${adFilmGuide}

BRAND DNA → PROMPT INTEGRATION (CRITICAL):
${brandContext ? `The brand context above is REAL — embed it deeply:
- Brand colors → use them in lighting and color grade descriptions (e.g., navy brand = "cool blue ambient light, navy-toned shadows")
- Brand voice/personality → drives scene energy (luxury = slow elegant moves; youth = fast kinetic energy)
- Target audience → influences lifestyle context, characters, environment
- Brand Dos/Don'ts → hard rules for visual choices` : 'No brand data — default to premium, cinematic aesthetic.'}`;

    if (isAdFilm) {
        return `${baseSystem}

RESPONSE — Return ONLY valid JSON:
{
  "enhancedPrompt": "The CORE MOTION PROMPT optimised for ${modelName}. For Seedance, this MUST be a JSON-parseable stringified array '[{lang:\"en\", prompt:\"...\"}, {lang:\"zh\", prompt:\"...\"}]'. Embed the Ad Film arc.",
  "adFilmPlan": {
    "hook": "Exact description of the opening beat",
    "story": "The emotional narrative beat with the human truth",
    "productReveal": "The product/brand hero shot description",
    "cta": "The closing brand moment",
    "voiceOver": "One cinematic VO line (15 words max) matching brand voice",
    "bgMusic": "Music genre, tempo, and emotional arc description",
    "ctaText": "Final text overlay / tagline"
  },
  "changes": ["Specific enhancement made — e.g., 'Added slow push-in camera move matching Seedance 2.0 strengths'", "Embedded brand navy in lighting direction", "Structured as 4-beat ad film timeline"]
}`;
    }

    return `${baseSystem}

RESPONSE — Return ONLY valid JSON:
{
  "enhancedPrompt": "The production-ready, model-native prompt. Follow ${modelName}'s structure guide above exactly. For Seedance, this MUST be a JSON-parseable stringified array '[{lang:\"en\", prompt:\"...\"}, {lang:\"zh\", prompt:\"...\"}]'.",
  "changes": ["What was enhanced — e.g., 'Added slow orbit camera move', 'Applied brand color to lighting', 'Added material texture detail'"]
}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD ENHANCE USER PROMPT
// Injects the brief + visual DNA from Stage 1 MCoT into the user turn
// ─────────────────────────────────────────────────────────────────────────────
export function buildEnhanceUserPrompt(rawBrief, visualDNA, filmFormat) {
    const isAdFilm = filmFormat === 'adfilm';

    let userPrompt = `USER BRIEF: "${rawBrief}"`;

    if (visualDNA && !visualDNA.error && !visualDNA.skipped) {
        // Inject visual DNA from the MCoT Stage 1 analysis
        userPrompt += `

VISUAL DNA FROM ATTACHED IMAGES (analysed by AI — use this for visual accuracy):
Product/Subject Shape: ${visualDNA.productShape || 'Not analysed'}
Hero Colors: ${Array.isArray(visualDNA.heroColors) ? visualDNA.heroColors.join(', ') : (visualDNA.heroColors || 'Not detected')}
Surface Texture: ${visualDNA.texture || 'Not detected'}
Packaging / Presentation: ${visualDNA.packagingStyle || 'Not detected'}
Brand Mood: ${visualDNA.brandMood || 'Not detected'}
Cinematic Style Match: ${visualDNA.cinematicStyle || 'Not determined'}
AI Shot Suggestions (based on images): ${Array.isArray(visualDNA.shotSuggestions) ? visualDNA.shotSuggestions.join('; ') : 'None'}
Visual Avoid List: ${Array.isArray(visualDNA.avoidList) ? visualDNA.avoidList.join('; ') : 'None'}

CRITICAL: The enhanced prompt MUST visually match what is shown in the attached images. Use the hero colors in lighting choices. Use the texture in material descriptions. Use the shot suggestions as inspiration.`;
    }

    if (isAdFilm) {
        userPrompt += `

OUTPUT TYPE: Full Ad Film
Build a complete 4-beat timeline (hook → story → product reveal → CTA) using the brief and visual DNA above.
Remember: HOOK should NOT show the product — build desire first. STORY should feature a real human moment.`;
    } else {
        userPrompt += `

OUTPUT TYPE: Single optimised video prompt
Transform this brief into one production-ready prompt following the model structure guide exactly.`;
    }

    return userPrompt;
}

// ─────────────────────────────────────────────────────────────────────────────
// VISUAL GROUNDING PROMPT (Stage 1 MCoT)
// Exported so the route can import and use it
// ─────────────────────────────────────────────────────────────────────────────
export const VISUAL_GROUNDING_SYSTEM = `You are a visual grounding agent for an AI Video Studio. Analyse the provided images and extract visual intelligence optimised for video production and prompt engineering.

Focus on VIDEO-RELEVANT visual cues:
1. PRODUCT SHAPE & MOTION: How should this subject be revealed or showcased in motion? (glass/metallic = reflections, fabric = flowing, tech = sleek angles)
2. HERO COLORS: The 2-3 dominant colors that should drive the video's lighting and color grade
3. TEXTURE & MATERIAL: Surface qualities that inform lighting (matte, glossy, brushed, transparent, organic)
4. PACKAGING/PRESENTATION: How the subject is typically shown — boxed, in-use, lifestyle context
5. BRAND MOOD: The emotional temperature in 2-3 words
6. CINEMATIC REFERENCE: What existing commercial/film aesthetic matches (e.g., "Apple product launch — clean white, precise", "Nike — kinetic, high-energy")
7. SHOT SUGGESTIONS: 3-5 specific, actionable shot ideas based only on what you see (e.g., "slow orbit around the amber bottle on a marble surface with golden side light")
8. AVOID LIST: Visual elements to avoid based on what you see (e.g., "avoid warm tones — subject is cool blue/white")

Return ONLY valid JSON:
{
  "productShape": "Description of the subject's form and how it would look in motion",
  "heroColors": ["#hex1 or color name", "#hex2"],
  "texture": "Surface material description and how light interacts with it",
  "packagingStyle": "How subject is presented — in-box, unwrapped, in-use, lifestyle",
  "brandMood": "Emotional tone in 2-3 words",
  "cinematicStyle": "Visual direction: lighting setup, camera style, color grade",
  "shotSuggestions": ["Specific actionable shot idea based on images", "Another shot idea"],
  "avoidList": ["What to avoid based on subject visual identity"],
  "confidence": "high|medium|low"
}`;

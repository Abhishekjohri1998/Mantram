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
        maxWords: 280,
        structure: `
SEEDANCE 2.0 — DIRECTOR-LEVEL PROMPT STRUCTURE (research-backed, follow exactly):

Philosophy: Seedance rewards "director-level" prompting, not image-like description.
Think: you are briefing a film crew, not writing a caption.

FOUR-LAYER STRUCTURE (apply in this order):
1. PRIMARY ACTION/SUBJECT
   → Who/what, wardrobe, material, posture, mood in one sentence.
   → Use precise, active verbs: "struts", "clasps", "pivots" — not "walks" or "moves"
   → Describe action start-to-end: "lifts the bottle from marble, tilts it into golden light, sets it down with deliberate care"
   
2. DIALOGUE / KEY SOUND EVENT
   → In quotes if spoken: "protagonist whispers 'feel the silence'"
   → Or a sound cue: "metallic clink of earbuds dropping into case", "low bass rumble as engine ignites"
   → NOTE: Seedance 2.0 has a NATIVE AUDIO ENGINE — always include at least one sound cue

3. ENVIRONMENTAL / AESTHETIC CUES
   → Lighting: "golden hour side-light", "neon-drenched rain-soaked asphalt", "clinical soft-box overhead"
   → Material detail: "condensation on the glass", "dust motes in slanted light", "silk catching a phantom breeze"
   → Color grade direction: "desaturated urban greys punched up with amber warmth"

4. CAMERA / MOTION SPECIFICATION
   → Always name exact move: "slow push-in over 3s toward the product", "handheld tracking shot following at shoulder height"
   → For multi-beat content, use TIMELINE PROMPTING:
     [00:00] Wide shot: establish scene. Static camera. Lighting setup.
     [00:02] Camera dollies slowly toward subject as action begins.
     [00:04] Close-up on product detail. Macro. Soft golden rim light.

CAMERA VOCABULARY (Seedance understands these precisely):
- "slow push-in over Xs" → emotional emphasis
- "pull-back reveal over Xs" → dramatic scale
- "slow orbit around [subject] over Xs" → 3D showcase
- "upward tilt to reveal [sky/subject]" → inspirational scale
- "static macro close-up on [detail]" → premium texture
- "handheld" → documentary urgency
- "crane rising" → epic establishing scale
- "rack focus from [A] to [B]" → narrative pivot

QUALITY SUFFIX (always append): "4K ultra HD, rich detail, cinematic textures, stable picture, no blur"
HARD LIMIT: Under 280 words. Every sentence = one clear directorial intention.`,
    },

    'seedance-1.0': {
        name: 'Seedance 1.0',
        maxWords: 150,
        structure: `
SEEDANCE 1.0 — CONCISE DIRECTOR STRUCTURE:
Same Four-Layer approach as Seedance 2.0, but faster and simpler.
Format: [Subject + precise action] in [environment]. "[Key sound/dialogue]". [Lighting + texture]. [One camera move: type + direction + speed].
No timeline beats needed — keep to a single, clear shot.
QUALITY SUFFIX: "cinematic, 4K quality, stable shot"
HARD LIMIT: Under 150 words. One clear camera intention only.`,
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
AD FILM STRUCTURE — Use Seedance-style TIMELINE PROMPTING for the motion prompt.
Duration: ${duration}s

TIMELINE BEATS (embed these in the enhancedPrompt):
[00:00–00:0${hookEnd}] HOOK — Arresting wide shot, no product yet. Pure emotion/problem. Static or slow push-in.
[00:0${hookEnd}–00:0${storyEnd}] STORY — Human truth with product in use. Tracking or handheld. Sound cue of product interaction.
[00:0${storyEnd}–00:0${revealEnd}] PRODUCT REVEAL — Hero macro shot. Brand colors in lighting. Slow orbit or push-in.
[00:0${revealEnd}–00:0${duration}] BRAND CTA — Brand tagline moment. Fade to clean brand color. Subtle audio swell.

REQUIRED ELEMENTS (return in adFilmPlan JSON):
• VO: One cinematic voiceover line matching brand voice (15 words max)
• BGM: Music genre + tempo + emotional arc (e.g., "minimal piano builds to orchestral swell over 6s")
• CTA: Final text overlay / brand tagline
• AUDIO CUE: Seedance native audio description for key sound event (e.g., "satisfying click of earbuds snapping in, ambient city noise cutting to silence")

CRITICAL RULES:
1. HOOK must NOT show or mention the product — build desire first
2. STORY must show a real human moment, not abstract graphics
3. PRODUCT REVEAL must use brand colors in the environment lighting
4. Each beat has ONE clear Seedance camera move — no camera chaos
5. Total motion prompt under 350 words — structured timeline beats, not a wall of text
6. Append quality suffix to motion prompt: "4K ultra HD, rich detail, cinematic textures, stable picture"`;
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
  "enhancedPrompt": "The CORE MOTION PROMPT optimised for ${modelName} — this goes directly to the model. Follow the model's structure guide above. Under ${guide.maxWords} words. Embed the Ad Film timeline beats inline.",
  "adFilmPlan": {
    "hook": "[0s–Xs]: Exact description of the opening beat",
    "story": "[Xs–Ys]: The emotional narrative beat with the human truth",
    "productReveal": "[Ys–Zs]: The product/brand hero shot description",
    "cta": "[Zs–${duration}s]: The closing brand moment",
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
  "enhancedPrompt": "The production-ready, model-native prompt. Follow ${modelName}'s structure guide above exactly. Under ${guide.maxWords} words.",
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

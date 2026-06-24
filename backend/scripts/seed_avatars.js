/**
 * seed_avatars.js — Mantram AI
 *
 * Seeds the Avatar collection with a diverse library of AI-generated avatars.
 * Creates ~40 avatars covering all origins, genders, styles, and environments.
 * Each avatar is created as a superadmin-published template visible to all users.
 *
 * Usage:
 *   node --env-file=.env scripts/seed_avatars.js
 *   node --env-file=.env scripts/seed_avatars.js --dry-run
 *   node --env-file=.env scripts/seed_avatars.js --start=10      (skip first N)
 *   node --env-file=.env scripts/seed_avatars.js --only=5        (generate only N)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import Avatar from '../models/Avatar.js';
import { ensureS3Url } from '../utils/s3.js';

dotenv.config();

// ── Config ───────────────────────────────────────────────────────────────────
const LAOZHANG_API_KEY  = process.env.LAOZHANG_API_KEY;
const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';
const MONGODB_URI       = process.env.MONGODB_URI;
const DELAY_MS          = 6000;  // 6s between generations

// ── CLI Flags ────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const START_AT  = parseInt(process.argv.find(a => a.startsWith('--start='))?.split('=')[1] || '0');
const ONLY      = parseInt(process.argv.find(a => a.startsWith('--only='))?.split('=')[1] || '0');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════════
//  AVATAR CATALOG — Diverse, professional, high-quality avatar definitions
// ══════════════════════════════════════════════════════════════════════════════

const AVATAR_CATALOG = [
    // ─── South Asian ─────────────────────────────────────────────────────────
    {
        name: 'Arjun',
        gender: 'male',
        tags: ['south-asian', 'professional', 'male'],
        prompt: 'mid-shot portrait photograph of Arjun, a confident handsome South Asian man in his late twenties, warm golden-brown complexion, strong defined jaw, well-groomed short dark hair, wearing a crisp navy blue tailored blazer over white shirt, sleek contemporary open-plan office background with panoramic city view in soft focus, soft diffused natural daylight, direct confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, professional post-processing, authentic skin texture'
    },
    {
        name: 'Ananya',
        gender: 'female',
        tags: ['south-asian', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Ananya, a beautiful confident South Asian woman in her late twenties, warm golden-brown complexion, expressive dark eyes, defined brow architecture, elegant dark hair in a professional updo, wearing a tailored sage green blazer with gold stud earrings, modern co-working space with soft warm lighting, gentle window light illumination, direct warm eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, professional post-processing, authentic skin texture'
    },
    {
        name: 'Vikram',
        gender: 'male',
        tags: ['south-asian', 'casual', 'male'],
        prompt: 'mid-shot portrait photograph of Vikram, a handsome South Asian man in his early thirties, warm complexion, short textured dark hair with subtle fade, well-groomed stubble, wearing a fitted charcoal henley t-shirt, relaxed warm coffee shop background with exposed brick and warm pendant lights in bokeh, golden-hour directional light, confident relaxed direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Priya',
        gender: 'female',
        tags: ['south-asian', 'traditional', 'female'],
        prompt: 'mid-shot portrait photograph of Priya, a beautiful South Asian woman in her late twenties, warm golden complexion, expressive dark eyes with defined kohl liner, dark flowing hair with a fresh jasmine garland, wearing an elegant royal blue silk saree with gold zari border, warm home interior background with soft sheer curtain golden-hour glow, gentle warm directional lighting, serene confident direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Rohan',
        gender: 'male',
        tags: ['south-asian', 'streetwear', 'male'],
        prompt: 'mid-shot portrait photograph of Rohan, a stylish South Asian man in his early twenties, warm brown complexion, curly dark hair, wearing an oversized white graphic tee layered with a clean black hoodie, fresh white sneakers visible, urban outdoor setting with graffiti wall in soft bokeh, cool diffused daylight, direct confident eye contact with a subtle smirk, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Meera',
        gender: 'female',
        tags: ['south-asian', 'smart-casual', 'female'],
        prompt: 'mid-shot portrait photograph of Meera, a gorgeous South Asian woman in her early thirties, warm complexion, straight dark hair falling past shoulders, minimal gold jewelry, wearing a cream silk blouse tucked into high-waisted olive trousers, clean minimalist studio backdrop with neutral warm-white gradient, clean high-key studio lighting, direct warm approachable eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── East Asian ──────────────────────────────────────────────────────────
    {
        name: 'Yuki',
        gender: 'female',
        tags: ['east-asian', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Yuki, a elegant East Asian woman in her late twenties, porcelain to light golden complexion, softly defined almond eyes, sleek dark bob haircut, wearing a structured pearl-white blazer over black turtleneck, minimalist modern office with floor-to-ceiling windows and city skyline in soft focus, neutral cool-toned professional lighting, direct composed confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, professional post-processing, authentic skin texture'
    },
    {
        name: 'Hiroshi',
        gender: 'male',
        tags: ['east-asian', 'smart-casual', 'male'],
        prompt: 'mid-shot portrait photograph of Hiroshi, a handsome East Asian man in his early thirties, light golden complexion, graceful bone structure, neat styled dark hair, wearing a fitted navy polo shirt and clean dark chinos, modern café background with warm pendant lighting in soft bokeh, soft natural daylight from side window, direct friendly eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Lin Wei',
        gender: 'female',
        tags: ['east-asian', 'casual', 'female'],
        prompt: 'mid-shot portrait photograph of Lin Wei, a beautiful East Asian woman in her early twenties, porcelain complexion, long straight dark hair, wearing a soft lavender cashmere sweater and denim jacket, lush outdoor park setting with cherry blossom trees in soft bokeh background, soft dappled sunlight through leaves, direct warm bright eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Southeast Asian ─────────────────────────────────────────────────────
    {
        name: 'Naysha',
        gender: 'female',
        tags: ['southeast-asian', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Naysha, a stunning Southeast Asian woman in her late twenties, warm tan complexion, almond-shaped expressive eyes, smooth even skin tone, dark hair in a sleek low bun, wearing a tailored burgundy wrap dress with gold bracelet, contemporary office space with warm neutral tones in soft bokeh, soft diffused natural daylight, direct confident poised eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Rafael',
        gender: 'male',
        tags: ['southeast-asian', 'casual', 'male'],
        prompt: 'mid-shot portrait photograph of Rafael, a handsome Southeast Asian man in his late twenties, warm tan complexion, thick dark hair, warm expressive eyes, wearing a clean fitted olive linen shirt with sleeves rolled up, tropical outdoor terrace with lush green plants in background bokeh, warm golden-hour light, relaxed direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Middle Eastern ──────────────────────────────────────────────────────
    {
        name: 'Omar',
        gender: 'male',
        tags: ['middle-eastern', 'professional', 'male'],
        prompt: 'mid-shot portrait photograph of Omar, a distinguished Middle Eastern man in his early thirties, warm olive complexion, strongly defined brow, rich dark eyes, sculpted jaw, well-groomed dark beard, wearing a tailored charcoal suit with white shirt and no tie, luxury hotel lobby with marble and warm ambient lights in soft bokeh, professional cool-toned editorial lighting, direct authoritative confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Layla',
        gender: 'female',
        tags: ['middle-eastern', 'smart-casual', 'female'],
        prompt: 'mid-shot portrait photograph of Layla, a beautiful Middle Eastern woman in her late twenties, warm olive complexion, rich dark expressive eyes with naturally full brows, dark wavy hair falling over shoulders, wearing a sophisticated cream turtleneck and gold pendant necklace, modern art gallery background with white walls and soft ambient lighting in bokeh, natural soft window light, direct warm confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Zara',
        gender: 'female',
        tags: ['middle-eastern', 'traditional', 'female'],
        prompt: 'mid-shot portrait photograph of Zara, a gorgeous Middle Eastern woman in her late twenties, olive complexion, striking dark eyes with defined kohl liner, wearing an elegant hijab in rich emerald green with gold accents, paired with a modern tailored modest blazer, clean minimalist studio backdrop with warm neutral gradient, soft diffused studio lighting, direct confident serene eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── African ─────────────────────────────────────────────────────────────
    {
        name: 'Amara',
        gender: 'female',
        tags: ['african', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Amara, a striking beautiful African woman in her late twenties, deep warm melanin-rich complexion, striking facial definition, full lips, short natural TWA hairstyle, wearing a tailored white structured blazer with gold hoop earrings, modern glass and steel office with city view in soft bokeh, bright even commercial studio lighting, direct powerful confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Kwame',
        gender: 'male',
        tags: ['african', 'smart-casual', 'male'],
        prompt: 'mid-shot portrait photograph of Kwame, a handsome African man in his early thirties, deep rich melanin complexion, strong jaw, clean-shaven, close-cropped hair, wearing a fitted navy blue polo and tailored khaki chinos, warm modern co-working space with exposed brick and warm pendant lights in bokeh, warm golden-hour directional light, direct warm approachable eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Nia',
        gender: 'female',
        tags: ['african', 'casual', 'female'],
        prompt: 'mid-shot portrait photograph of Nia, a beautiful African woman in her early twenties, warm deep complexion, long braided dark hair with golden cuffs, radiant smile, wearing a soft terracotta linen crop top and denim jacket, urban outdoor plaza with afternoon sunlight and city architecture in soft bokeh, warm natural daylight, joyful direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Western European ────────────────────────────────────────────────────
    {
        name: 'Emma',
        gender: 'female',
        tags: ['western', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Emma, a confident Western European woman in her late twenties, fair complexion with light freckles, light blue-green eyes, honey blonde hair in a professional blowout, wearing a tailored dusty rose blazer over white silk camisole, modern glass office with warm ambient lighting and city skyline in soft bokeh, soft natural daylight, direct poised confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'James',
        gender: 'male',
        tags: ['western', 'professional', 'male'],
        prompt: 'mid-shot portrait photograph of James, a handsome Western European man in his early thirties, fair to medium complexion, defined cheekbones, dark brown styled hair, light stubble, wearing a charcoal slim-fit suit jacket over a crisp white open-collar shirt, sleek modern boardroom with glass walls and soft warm ambient lighting, professional cool-toned editorial light, direct confident authoritative eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Sophie',
        gender: 'female',
        tags: ['western', 'casual', 'female'],
        prompt: 'mid-shot portrait photograph of Sophie, a beautiful Western European woman in her early twenties, fair complexion, warm brown eyes, wavy auburn hair, wearing a cozy cream cable-knit sweater, warm home interior with soft golden-hour light through sheer curtains, gentle warm bokeh background, soft natural lighting, friendly warm direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Lucas',
        gender: 'male',
        tags: ['western', 'streetwear', 'male'],
        prompt: 'mid-shot portrait photograph of Lucas, a stylish Western European man in his early twenties, medium complexion, tousled sandy brown hair, light green eyes, wearing a clean black bomber jacket over white graphic tee and silver chain necklace, urban outdoor street with neon signs in soft bokeh background, cool moody evening light with subtle blue tones, confident relaxed direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Latin American ──────────────────────────────────────────────────────
    {
        name: 'Isabella',
        gender: 'female',
        tags: ['latin', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Isabella, a gorgeous Latin American woman in her late twenties, warm medium-brown complexion, expressive dark hazel eyes, thick dark wavy hair, wearing a structured emerald green blazer with gold stud earrings and red lipstick, modern upscale office with warm wood and glass in soft bokeh, natural warm daylight, direct confident magnetic eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Carlos',
        gender: 'male',
        tags: ['latin', 'smart-casual', 'male'],
        prompt: 'mid-shot portrait photograph of Carlos, a handsome Latin American man in his early thirties, warm olive-brown complexion, dark expressive eyes, styled dark hair swept back, neat beard, wearing a fitted burgundy button-down shirt with sleeves rolled up, outdoor terrace restaurant with warm string lights in bokeh background, golden-hour warm directional light, charismatic direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Valentina',
        gender: 'female',
        tags: ['latin', 'casual', 'female'],
        prompt: 'mid-shot portrait photograph of Valentina, a beautiful Latin American woman in her early twenties, warm bronze complexion, full lips, long dark hair with subtle caramel highlights, wearing a white off-shoulder cotton blouse and gold layered necklaces, tropical beachside promenade with palm trees in soft bokeh, warm golden-hour sunlight, joyful radiant direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Mixed Heritage ──────────────────────────────────────────────────────
    {
        name: 'Kai',
        gender: 'male',
        tags: ['mixed', 'casual', 'male'],
        prompt: 'mid-shot portrait photograph of Kai, a handsome mixed-heritage man in his late twenties, warm medium complexion, globally ambiguous attractive features, curly dark brown hair, hazel-green eyes, wearing a clean fitted sage green linen shirt unbuttoned at collar, outdoor nature trail with lush greenery in soft bokeh, soft dappled sunlight through trees, relaxed confident direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Maya',
        gender: 'female',
        tags: ['mixed', 'professional', 'female'],
        prompt: 'mid-shot portrait photograph of Maya, a beautiful mixed-heritage woman in her late twenties, warm medium complexion, globally relatable features, honey-brown eyes, dark curly hair in a professional low ponytail, wearing a chic black tailored jumpsuit with minimal gold jewelry, clean seamless studio backdrop with neutral warm-white gradient, bright high-key studio lighting, direct confident warm eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Athletic / Fitness ──────────────────────────────────────────────────
    {
        name: 'Aisha',
        gender: 'female',
        tags: ['south-asian', 'athletic', 'female'],
        prompt: 'mid-shot portrait photograph of Aisha, a fit athletic South Asian woman in her mid twenties, warm golden complexion, dark hair in a high ponytail, defined cheekbones, wearing a fitted black sports bra and charcoal running jacket unzipped, modern premium fitness studio with floor-to-ceiling windows and natural daylight, bright even gym lighting, determined direct confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Deven',
        gender: 'male',
        tags: ['south-asian', 'athletic', 'male'],
        prompt: 'mid-shot portrait photograph of Deven, a muscular fit South Asian man in his late twenties, warm brown complexion, short cropped dark hair, clean-shaven angular jaw, wearing a fitted dark navy performance tank top, modern gym background with dumbbells and mirrors in soft bokeh, bright diffused gym lighting, powerful direct confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Mature / Distinguished ──────────────────────────────────────────────
    {
        name: 'Dr. Sharma',
        gender: 'male',
        tags: ['south-asian', 'professional', 'mature', 'male'],
        prompt: 'mid-shot portrait photograph of Dr. Sharma, a distinguished mature South Asian man with salt-and-pepper hair and beard, warm golden complexion, wise expressive dark eyes, wearing a navy blue three-piece suit with burgundy silk tie and rectangular gold-frame spectacles, luxurious wood-paneled office with leather books in soft bokeh, warm editorial lighting with gentle rim light, direct wise authoritative eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Sunita Madam',
        gender: 'female',
        tags: ['south-asian', 'professional', 'mature', 'female'],
        prompt: 'mid-shot portrait photograph of Sunita, a distinguished elegant mature South Asian woman, salt-and-pepper hair styled in a graceful bob, warm golden complexion, wise expressive dark eyes, wearing a rich maroon silk blouse with gold statement necklace, warm modern home interior with books and warm ambient lighting, golden-hour glow through curtains, direct confident serene eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Creative / Artistic ─────────────────────────────────────────────────
    {
        name: 'Zoya',
        gender: 'female',
        tags: ['south-asian', 'creative', 'female'],
        prompt: 'mid-shot portrait photograph of Zoya, a beautiful creative South Asian woman in her mid twenties, warm complexion, bold winged eyeliner, dark hair with a streak of deep purple, nose ring, wearing an oversized vintage denim jacket with enamel pins over a black band tee, artistic studio background with paint splatters and canvases in soft bokeh, warm moody cinematic lighting with strong chiaroscuro, direct intense creative eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Kabir',
        gender: 'male',
        tags: ['south-asian', 'creative', 'male'],
        prompt: 'mid-shot portrait photograph of Kabir, a handsome creative South Asian man in his late twenties, warm complexion, messy textured dark hair, defined stubble, round tortoiseshell glasses, wearing a rust-brown corduroy jacket over a black turtleneck, cozy bookstore background with warm pendant lights and bookshelves in soft bokeh, warm golden moody cinematic lighting, thoughtful direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Tech / Startup ──────────────────────────────────────────────────────
    {
        name: 'Aarav',
        gender: 'male',
        tags: ['south-asian', 'tech', 'male'],
        prompt: 'mid-shot portrait photograph of Aarav, a confident South Asian tech entrepreneur in his late twenties, warm complexion, dark neat hair, clean-shaven, wearing a minimalist black crew-neck t-shirt and Apple Watch, sleek modern startup office with dual monitors and standing desk in soft bokeh, bright clean diffused lighting, direct approachable confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Tanya',
        gender: 'female',
        tags: ['south-asian', 'tech', 'female'],
        prompt: 'mid-shot portrait photograph of Tanya, a sharp intelligent South Asian woman in her late twenties, warm golden complexion, sleek dark hair in a center part, minimal makeup, wearing a fitted grey tech-company quarter-zip pullover and small silver stud earrings, modern open-plan tech office with colorful post-it walls in soft bokeh, bright even daylight, direct sharp focused eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Influencer / Content Creator ────────────────────────────────────────
    {
        name: 'Riya',
        gender: 'female',
        tags: ['south-asian', 'influencer', 'female'],
        prompt: 'mid-shot portrait photograph of Riya, a glamorous South Asian content creator in her early twenties, warm complexion, flawless makeup with highlighted cheekbones, long dark hair in loose waves, wearing a trendy pastel pink blazer dress with statement drop earrings, aesthetic pink and cream studio with ring light reflection in eyes, bright beauty lighting with soft fill, direct charismatic magnetic eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
    {
        name: 'Ishaan',
        gender: 'male',
        tags: ['south-asian', 'influencer', 'male'],
        prompt: 'mid-shot portrait photograph of Ishaan, a handsome South Asian male influencer in his early twenties, warm complexion, wavy dark hair styled up, sharp jawline, wearing a clean white oversized hoodie with gold chain, urban rooftop setting with city skyline at blue hour in soft bokeh, moody cinematic blue-hour light with warm highlights, direct confident camera-ready eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },

    // ─── Spiritual / Iconic ──────────────────────────────────────────────────
    {
        name: 'Guru Ji',
        gender: 'male',
        tags: ['south-asian', 'spiritual', 'male'],
        prompt: 'mid-shot portrait photograph of a wise serene spiritual guru, warm South Asian complexion, long flowing silver beard, peaceful deep wise eyes with gentle crow feet, wearing a saffron orange shawl draped over white kurta, tranquil ashram garden setting with marigold flowers and warm morning light in soft bokeh, warm golden-hour directional light, serene gentle direct eye contact radiating inner peace, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture'
    },
];

// ══════════════════════════════════════════════════════════════════════════════
//  IMAGE GENERATION — GPT Image 2 via LaoZhang
// ══════════════════════════════════════════════════════════════════════════════

async function generateImage(prompt) {
    if (!LAOZHANG_API_KEY) throw new Error('LAOZHANG_API_KEY not configured');

    const body = {
        model: 'gpt-image-2',
        prompt,
        n: 1,
        size: '1024x1792',  // 9:16 portrait
        response_format: 'url',
        quality: 'high',
        output_format: 'webp',
    };

    const resp = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LAOZHANG_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`LaoZhang API error (${resp.status}): ${errText.substring(0, 300)}`);
    }

    const data = await resp.json();
    const imageData = data.data?.[0];
    if (!imageData) throw new Error('LaoZhang API returned no image data');

    if (imageData.url) return imageData.url;
    if (imageData.b64_json) {
        let b64 = imageData.b64_json;
        if (b64.startsWith('data:')) b64 = b64.substring(b64.indexOf(',') + 1);
        return `data:image/webp;base64,${b64}`;
    }

    throw new Error('No image in LaoZhang response');
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  AVATAR LIBRARY SEEDER — Mantram AI');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total avatars in catalog: ${AVATAR_CATALOG.length}`);
    if (DRY_RUN) console.log('  🏜️  DRY RUN MODE — no API calls or DB writes');
    if (START_AT > 0) console.log(`  ⏩ Starting from index ${START_AT}`);
    if (ONLY > 0) console.log(`  🎯 Generating only ${ONLY} avatars`);
    console.log('');

    if (!DRY_RUN && !LAOZHANG_API_KEY) {
        console.error('❌ LAOZHANG_API_KEY not set. Aborting.');
        process.exit(1);
    }
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI not set. Aborting.');
        process.exit(1);
    }

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check existing avatars to avoid duplicates
    const existingNames = new Set(
        (await Avatar.find({ createdByRole: 'superadmin', isPublished: true }).select('name').lean())
            .map(a => a.name)
    );
    console.log(`📋 Found ${existingNames.size} existing published avatars\n`);

    let catalog = AVATAR_CATALOG.slice(START_AT);
    if (ONLY > 0) catalog = catalog.slice(0, ONLY);

    const results = { created: [], skipped: [], failed: [] };

    for (let i = 0; i < catalog.length; i++) {
        const def = catalog[i];
        const globalIdx = START_AT + i;
        const progress = `[${i + 1}/${catalog.length}]`;

        console.log(`\n${progress} ─── ${def.name} ───`);

        // Skip if already exists
        if (existingNames.has(def.name)) {
            console.log(`  ⏭️  SKIP — "${def.name}" already exists in library`);
            results.skipped.push({ name: def.name, reason: 'already exists' });
            continue;
        }

        try {
            console.log(`  📝 Prompt: "${def.prompt.substring(0, 100)}..."`);

            if (DRY_RUN) {
                console.log(`  🏜️  DRY RUN — would generate + save`);
                results.created.push({ name: def.name, dryRun: true });
                continue;
            }

            // 1. Generate image
            console.log(`  🎭 Generating with GPT Image 2 (1024x1792)...`);
            const imageResult = await generateImage(def.prompt);
            console.log(`  ✅ Image generated`);

            // 2. Upload to S3
            const s3Key = `avatar-studio/seed-${def.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
            const s3Url = await ensureS3Url(imageResult, s3Key);
            console.log(`  📤 S3: ${s3Url.substring(0, 80)}...`);

            // 3. Save to database
            const avatar = await Avatar.create({
                name: def.name,
                imageUrl: s3Url,
                gender: def.gender,
                tags: def.tags,
                isTemplate: true,
                isActive: true,
                isFeatured: false,
                isPublished: true,
                source: 'generated',
                createdByRole: 'superadmin',
                generatedFromPrompt: def.prompt,
                promptUsed: def.prompt,
                modelUsed: 'gpt-image-2',
                generationMode: 'directPrompt',
                frameType: 'mid_shot',
                resolution: '9:16',
            });

            console.log(`  💾 Saved: ${avatar._id}`);
            results.created.push({ name: def.name, _id: avatar._id });

            // 4. Delay
            if (i < catalog.length - 1) {
                console.log(`  ⏳ Waiting ${DELAY_MS / 1000}s...`);
                await sleep(DELAY_MS);
            }

        } catch (err) {
            console.error(`  ❌ FAILED: ${err.message}`);
            results.failed.push({ name: def.name, error: err.message });

            // Rate limit cooldown
            if (err.message.includes('429') || err.message.includes('rate limit')) {
                console.log(`  ⏳ Rate limited — cooling down 30s...`);
                await sleep(30_000);
            } else {
                await sleep(DELAY_MS);
            }
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n\n═══════════════════════════════════════════════════════════════');
    console.log('  SEED SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  ✅ Created:  ${results.created.length}`);
    console.log(`  ⏭️  Skipped:  ${results.skipped.length}`);
    console.log(`  ❌ Failed:   ${results.failed.length}`);
    console.log(`  ── Total:    ${catalog.length}\n`);

    if (results.failed.length > 0) {
        console.log('  ── Failed avatars ──');
        for (const f of results.failed) {
            console.log(`    ❌ ${f.name}: ${f.error.substring(0, 100)}`);
        }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done!');
}

main().catch(err => {
    console.error('❌ Script execution failed:', err);
    process.exit(1);
});

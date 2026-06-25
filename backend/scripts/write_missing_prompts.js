/**
 * write_missing_prompts.js — Mantram AI
 *
 * Backfills high-quality portrait prompts for superadmin-published avatars
 * that are missing their `generatedFromPrompt` / `promptUsed` fields.
 * This enables the regeneration script to recreate their images.
 *
 * Usage:
 *   node --env-file=.env scripts/write_missing_prompts.js --dry-run
 *   node --env-file=.env scripts/write_missing_prompts.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Avatar from '../models/Avatar.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = process.argv.includes('--dry-run');

// ══════════════════════════════════════════════════════════════════════════════
// PROMPT CATALOG — one prompt per avatar name
// Written in the same high-quality portrait photography style as seed_avatars.js
// Each variant (#1/#2) gets a slightly different look/setting for diversity
// ══════════════════════════════════════════════════════════════════════════════

const PROMPT_MAP = {
    // ─── Roi #2 (male, South Asian professional) ────────────────────────────
    'Roi #2': 'mid-shot portrait photograph of Roi, a distinguished South Asian man in his mid thirties, warm olive complexion, well-groomed dark hair parted neatly, trimmed beard with grey flecks, wearing a tailored charcoal herringbone blazer over a light blue Oxford shirt, modern corporate lounge with leather chairs and warm ambient lights in soft bokeh, warm editorial lighting with subtle rim light, direct confident assured eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Nayya ──────────────────────────────────────────────────────────────
    'Nayya #1': 'mid-shot portrait photograph of Nayya, a beautiful South Asian woman in her late twenties, warm honey complexion, expressive dark brown eyes, dark hair in soft waves framing face, wearing a structured ivory blazer with a delicate gold pendant necklace, sleek modern office with panoramic windows and natural daylight in soft bokeh, soft diffused natural lighting, direct warm approachable eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Nayya #2': 'mid-shot portrait photograph of Nayya, a radiant South Asian woman in her late twenties, warm honey complexion, luminous dark eyes, dark hair swept to one side with soft curls, wearing a deep teal silk blouse with gold hoop earrings, elegant restaurant interior with warm candlelight and exposed brick in soft bokeh, warm golden-hour directional light, confident direct eye contact with gentle smile, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Divya ──────────────────────────────────────────────────────────────
    'Divya #1': 'mid-shot portrait photograph of Divya, a gorgeous South Asian woman in her mid twenties, warm golden-brown complexion, expressive almond eyes with natural brows, long dark hair flowing past shoulders, wearing a fitted coral blazer with pearl stud earrings, bright modern co-working space with plants and warm pendant lights in soft bokeh, bright clean natural daylight, direct confident radiant eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Divya #2': 'mid-shot portrait photograph of Divya, a stunning South Asian woman in her mid twenties, warm golden complexion, bright expressive dark eyes, dark hair in an elegant side braid with a few loose strands, wearing a soft lavender turtleneck sweater with a minimalist silver chain, cozy bookshop interior with warm shelves and soft pendant lights in bokeh, warm moody cinematic lighting, thoughtful direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Niyati ─────────────────────────────────────────────────────────────
    'Niyati #1': 'mid-shot portrait photograph of Niyati, a beautiful South Asian woman in her early thirties, warm complexion with a natural glow, dark hair in a sleek professional low bun, defined cheekbones, wearing a tailored forest green blazer with gold button details, modern glass office with city skyline view in soft bokeh, soft natural daylight from large windows, direct poised confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Niyati #2': 'mid-shot portrait photograph of Niyati, an elegant South Asian woman in her early thirties, warm complexion, expressive dark eyes with subtle winged liner, dark hair falling in loose waves, wearing an off-white silk camisole with a delicate gold layered necklace, luxury hotel lobby with marble and warm ambient sconces in soft bokeh, warm golden-hour directional light, serene confident direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Mili ───────────────────────────────────────────────────────────────
    'Mili #1': 'mid-shot portrait photograph of Mili, a cheerful South Asian woman in her early twenties, warm fair complexion, bright sparkling dark eyes, dark hair in a casual half-up half-down style, wearing a fitted pastel pink cardigan over a white tee with small diamond studs, bright airy café with white walls and sunlight in soft bokeh, bright high-key natural lighting, joyful direct eye contact with warm smile, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Mili #2': 'mid-shot portrait photograph of Mili, a lively South Asian woman in her early twenties, warm fair complexion, animated dark eyes, dark hair with subtle caramel highlights in loose curls, wearing an oversized cream knit sweater with gold hoop earrings, outdoor garden café with greenery and fairy lights in soft bokeh, soft golden afternoon light, playful direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Nitaliya ───────────────────────────────────────────────────────────
    'Nitaliya #1': 'mid-shot portrait photograph of Nitaliya, a beautiful Eastern European woman in her late twenties, fair complexion with light freckles, striking grey-green eyes, dark blonde hair styled in a professional blowout, wearing a tailored navy blazer with a white silk shell, modern minimalist studio with clean neutral-white backdrop, bright even studio lighting, direct composed confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Nitaliya #2': 'mid-shot portrait photograph of Nitaliya, an elegant Eastern European woman in her late twenties, porcelain complexion, captivating grey-green eyes, dark blonde hair in a sleek low ponytail, wearing a rich burgundy turtleneck dress with minimalist gold earrings, upscale art gallery with white walls and soft track lighting in bokeh, cool-toned editorial lighting, direct serene confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Kamini ─────────────────────────────────────────────────────────────
    'Kamini #1': 'mid-shot portrait photograph of Kamini, a striking South Asian woman in her late twenties, warm rich complexion, bold defined brows, expressive dark eyes with kohl liner, dark hair in a voluminous blowout, wearing a structured black blazer with statement gold cuff earrings, sleek modern conference room with glass walls and soft ambient lights in bokeh, professional cool-toned editorial lighting, direct powerful confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Kamini #2': 'mid-shot portrait photograph of Kamini, a glamorous South Asian woman in her late twenties, warm deep complexion, dramatic full brows, luminous dark eyes, dark hair in sleek straight style, wearing a rich emerald green wrap top with gold pendant, upscale restaurant with warm wood and candlelight in soft bokeh, warm golden directional light, magnetic direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Kayaka ─────────────────────────────────────────────────────────────
    'Kayaka #1': 'mid-shot portrait photograph of Kayaka, a beautiful South Asian woman in her mid twenties, warm medium complexion, bright expressive eyes, dark hair in a casual messy bun with loose tendrils, wearing a cozy mustard yellow sweater with thin gold chain necklace, warm home interior with bookshelves and afternoon sunlight through windows in soft bokeh, soft warm natural daylight, relaxed friendly direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Kayaka #2': 'mid-shot portrait photograph of Kayaka, a radiant South Asian woman in her mid twenties, warm medium complexion, gentle expressive dark eyes, dark hair flowing freely over shoulders, wearing a fitted sage green linen shirt dress with wooden bead bracelet, outdoor terrace with lush tropical plants in soft bokeh, golden-hour warm directional light, serene direct eye contact with gentle smile, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Padma ──────────────────────────────────────────────────────────────
    'Padma #1': 'mid-shot portrait photograph of Padma, an elegant South Asian woman in her early thirties, warm golden complexion, graceful bone structure, dark hair in a classic center part with soft waves, wearing a rich deep magenta silk kurta with intricate gold embroidery at the neckline, traditional Indian home interior with warm ambient lighting and decorative elements in soft bokeh, warm golden-hour glow, composed dignified direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Padma #2': 'mid-shot portrait photograph of Padma, a sophisticated South Asian woman in her early thirties, warm golden complexion, serene expression, dark hair styled in a modern low chignon with fresh white flowers, wearing a cream silk blouse with delicate gold jhumka earrings, clean minimalist studio with warm neutral gradient backdrop, soft diffused studio lighting, gentle confident direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Delnaz ─────────────────────────────────────────────────────────────
    'Delnaz': 'mid-shot portrait photograph of Delnaz, a beautiful Parsi-Indian woman in her late twenties, warm fair complexion, striking light brown eyes, dark wavy hair falling past shoulders, wearing a modern fitted navy blue dress with a thin gold belt and small diamond studs, modern gallery space with clean white walls and warm floor lights in bokeh, bright clean studio lighting with gentle warmth, direct confident approachable eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Dishna ─────────────────────────────────────────────────────────────
    'dishna #1': 'mid-shot portrait photograph of Dishna, a gorgeous South Asian woman in her mid twenties, warm complexion with a healthy glow, expressive dark eyes with naturally thick lashes, dark hair in a sleek high ponytail, wearing a fitted white structured top with thin gold chain necklace, modern open-plan workspace with bright daylight and green plants in soft bokeh, bright natural diffused lighting, direct energetic confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'dishna #2': 'mid-shot portrait photograph of Dishna, a lovely South Asian woman in her mid twenties, warm complexion, gentle dark eyes, dark hair cascading in loose waves, wearing a soft peach cashmere v-neck sweater with minimalist gold stud earrings, cozy café interior with warm brick and pendant lights in soft bokeh, warm golden directional light, soft warm direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Ena ────────────────────────────────────────────────────────────────
    'Ena #1': 'mid-shot portrait photograph of Ena, a striking East Asian-Indian mixed heritage woman in her late twenties, warm fair complexion, almond-shaped expressive dark eyes, sleek dark hair in a chic bob with side bangs, wearing a structured pearl-white blazer over black turtleneck, minimalist modern office with floor-to-ceiling windows and city view in soft focus, clean professional lighting, direct composed intelligent eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Ena #2': 'mid-shot portrait photograph of Ena, a beautiful mixed heritage woman in her late twenties, warm fair complexion with naturally rosy cheeks, expressive dark eyes, sleek dark hair falling past chin, wearing a soft dusty rose blouse with delicate silver earrings, modern art museum with white walls and contemporary art in soft bokeh, soft diffused natural daylight, direct warm confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Fatima ─────────────────────────────────────────────────────────────
    'fatima': 'mid-shot portrait photograph of Fatima, a beautiful Middle Eastern woman in her late twenties, warm olive complexion, expressive dark eyes with defined brows, wearing an elegant hijab in soft mauve draped gracefully, paired with a modern tailored cream blazer, clean minimalist studio backdrop with warm neutral gradient, soft diffused studio lighting with gentle fill, direct warm confident serene eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Megha ──────────────────────────────────────────────────────────────
    'Megha #1': 'mid-shot portrait photograph of Megha, a vibrant South Asian woman in her mid twenties, warm golden complexion, bright sparkling dark eyes, dark hair in natural loose curls, wearing a bright cobalt blue fitted top with delicate gold layered necklaces, outdoor urban setting with modern architecture and warm afternoon light in soft bokeh, golden-hour warm directional light, joyful radiant direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Megha #2': 'mid-shot portrait photograph of Megha, a cheerful South Asian woman in her mid twenties, warm golden complexion, animated dark eyes with natural lashes, dark hair pulled back in a casual ponytail with face-framing pieces, wearing a relaxed cream linen shirt with small gold hoop earrings, bright airy rooftop café with blue sky in soft bokeh, bright clean natural daylight, warm friendly direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Nayan ──────────────────────────────────────────────────────────────
    'Nayan #1': 'mid-shot portrait photograph of Nayan, a handsome South Asian man in his late twenties, warm brown complexion, strong defined jawline, dark neat hair styled with a natural side part, clean-shaven, wearing a fitted charcoal polo shirt, modern café with warm pendant lighting and exposed brick in soft bokeh, soft natural daylight from side window, direct friendly confident eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Nayan #2': 'mid-shot portrait photograph of Nayan, a handsome South Asian man in his late twenties, warm brown complexion, expressive dark eyes, dark hair in a textured crop style, light stubble, wearing a clean navy blue henley with sleeves pushed up and silver watch, outdoor terrace with city skyline at golden hour in soft bokeh, warm golden-hour directional light, relaxed confident direct eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Nobi ───────────────────────────────────────────────────────────────
    'Nobi #1': 'mid-shot portrait photograph of Nobi, a beautiful Japanese woman in her late twenties, porcelain complexion with natural flush, almond-shaped warm brown eyes, sleek dark hair in a neat low bun, wearing a minimalist white collarless blouse with small pearl earrings, clean modern studio with neutral warm-white gradient backdrop, bright high-key studio lighting, direct composed gentle eye contact, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    'Nobi #2': 'mid-shot portrait photograph of Nobi, a graceful Japanese woman in her late twenties, fair luminous complexion, soft warm brown eyes, dark hair in a modern shoulder-length cut with subtle layers, wearing a soft camel cashmere turtleneck with minimalist gold chain, elegant minimalist interior with natural light through sheer curtains in bokeh, soft diffused natural daylight, serene direct eye contact with subtle warm expression, photorealistic, commercial photography quality, sharp focus on subject face and upper body, authentic skin texture',

    // ─── Spiritual / Religious Figures ──────────────────────────────────────
    'sai baba': 'mid-shot portrait illustration of Sai Baba of Shirdi, serene wise face with gentle compassionate expression, white cloth head covering, flowing white robe draped elegantly, sitting in a peaceful meditative pose, warm saffron and golden tones, tranquil temple background with soft warm ambient light and marigold flowers in soft bokeh, warm golden-hour glow radiating inner peace, divine serene direct gaze, photorealistic spiritual portrait style, high-quality artistic rendering, soft focus background with sharp subject detail, reverent respectful depiction',

    'Jesus': 'mid-shot portrait illustration of Jesus Christ, serene compassionate face with gentle warm expression, shoulder-length wavy brown hair, short brown beard, wearing a flowing white and deep red robe draped gracefully, soft golden halo of warm light behind head, peaceful garden setting with olive trees and soft golden morning light in bokeh, warm golden-hour divine glow, gentle loving direct gaze radiating peace and kindness, photorealistic spiritual portrait style, high-quality artistic rendering, reverent respectful classical depiction',
};

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  WRITE MISSING AVATAR PROMPTS — Mantram AI');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Prompts to backfill: ${Object.keys(PROMPT_MAP).length}`);
    if (DRY_RUN) console.log('  🏜️  DRY RUN MODE — no DB writes\n');
    console.log('');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Find all superadmin published avatars without prompts
    const noPromptAvatars = await Avatar.find({
        createdByRole: 'superadmin',
        isPublished: true,
        $and: [
            { $or: [{ generatedFromPrompt: { $exists: false } }, { generatedFromPrompt: '' }] },
            { $or: [{ promptUsed: { $exists: false } }, { promptUsed: '' }] },
        ],
    }).lean();

    console.log(`📋 Found ${noPromptAvatars.length} superadmin avatars without prompts\n`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const av of noPromptAvatars) {
        const prompt = PROMPT_MAP[av.name];

        if (!prompt) {
            console.log(`  ⚠️  No prompt defined for "${av.name}" (${av._id}) — skipping`);
            notFound++;
            continue;
        }

        console.log(`  📝 "${av.name}" → prompt (${prompt.length} chars)`);

        if (!DRY_RUN) {
            // Also infer gender from prompt if currently unspecified
            let gender = av.gender;
            if (!gender || gender === 'unspecified') {
                const p = prompt.toLowerCase();
                if (/\b(man|men|male|guy|gentleman)\b/.test(p)) gender = 'male';
                else if (/\b(woman|women|female|lady|girl)\b/.test(p)) gender = 'female';
            }

            await Avatar.updateOne(
                { _id: av._id },
                {
                    $set: {
                        generatedFromPrompt: prompt,
                        promptUsed: prompt,
                        ...(gender !== av.gender ? { gender } : {}),
                    },
                }
            );
            updated++;
            console.log(`     ✅ Updated (gender: ${gender})`);
        } else {
            updated++;
            console.log(`     🏜️  Would update`);
        }
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  PROMPT BACKFILL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`  ✅ Updated:     ${updated}`);
    console.log(`  ⏭️  Skipped:     ${skipped}`);
    console.log(`  ⚠️  No prompt:   ${notFound}`);
    console.log(`  ── Total:       ${noPromptAvatars.length}\n`);

    if (notFound > 0) {
        console.log('  ⚠️  Some avatars had no matching prompt in PROMPT_MAP.');
        console.log('     Add prompts for them or they will be skipped during regeneration.\n');
    }

    await mongoose.disconnect();
    console.log('✅ Done!');
}

main().catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
});

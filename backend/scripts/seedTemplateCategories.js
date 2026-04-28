/**
 * seedTemplateCategories.js
 * Creates the default TemplateCategory records mapped to real studio sections.
 * Idempotent — upserts on slug; safe to run multiple times.
 *
 * Usage: node backend/scripts/seedTemplateCategories.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);

const TemplateCategory = (await import('../models/TemplateCategory.js')).default;

const DEFAULT_CATEGORIES = [
    // Creative Studio sections
    { name: 'AI Create',      slug: 'ai_create',      color: '#E84118', description: 'Templates for the AI Create generation section',   sortOrder: 10 },
    { name: 'Carousel',       slug: 'carousel',        color: '#7C3AED', description: 'Multi-slide carousel post templates',              sortOrder: 20 },
    { name: 'Campaign',       slug: 'campaign',        color: '#00D4AA', description: 'Full campaign creative templates',                 sortOrder: 30 },
    { name: 'Campaign Shot',  slug: 'campaign_shot',   color: '#F59E0B', description: 'Single campaign hero image templates',             sortOrder: 40 },
    // Video Studio sections
    { name: 'Video UGC',      slug: 'video_ugc',       color: '#EC4899', description: 'UGC-style video ad templates',                    sortOrder: 50 },
    { name: 'Video Q-Ads',    slug: 'video_qads',      color: '#3B82F6', description: 'Q-Ads video format templates',                    sortOrder: 60 },
    // Avatar
    { name: 'Avatar',         slug: 'avatar',          color: '#8B5CF6', description: 'Avatar and character templates',                  sortOrder: 70 },
    // General
    { name: 'General',        slug: 'general',         color: '#6B7280', description: 'General purpose templates',                       sortOrder: 80 },
];

let created = 0;
let skipped = 0;

for (const cat of DEFAULT_CATEGORIES) {
    const existing = await TemplateCategory.findOne({ slug: cat.slug });
    if (existing) {
        console.log(`  ⏭  SKIP  ${cat.slug} — already exists (name: "${existing.name}")`);
        skipped++;
    } else {
        await TemplateCategory.create(cat);
        console.log(`  ✅ CREATE ${cat.slug} — "${cat.name}"`);
        created++;
    }
}

console.log(`\n📦 Seed complete — Created: ${created} | Skipped: ${skipped} | Total: ${DEFAULT_CATEGORIES.length}`);
await mongoose.disconnect();
process.exit(0);

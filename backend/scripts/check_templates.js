import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

await mongoose.connect(process.env.MONGODB_URI);

const Template = mongoose.model('Template', new mongoose.Schema({}, { strict: false, collection: 'templates' }));
const templates = await Template.find({
    $or: [
        { previewUrl: { $regex: /mantram-assets/ } },
        { previewImage: { $regex: /mantram-assets/ } },
    ]
}).lean();

console.log(`Found ${templates.length} templates with broken previews:\n`);

for (const t of templates) {
    console.log(`─── ${t.name || t.label || '(unnamed)'} ───`);
    console.log(`  ID: ${t._id}`);
    console.log(`  Preview: ${t.previewUrl || t.previewImage || 'none'}`);
    console.log(`  Prompt: ${(t.imagePrompt || t.promptTemplate || 'NONE').substring(0, 200)}`);
    console.log(`  Type: ${t.type || t.outputType || '(unset)'}`);
    console.log(`  Category: ${t.category || '(unset)'}`);
    // Show ALL fields to find any prompt
    const keys = Object.keys(t);
    const promptKeys = keys.filter(k => k.toLowerCase().includes('prompt') || k.toLowerCase().includes('description'));
    console.log(`  Prompt-like fields: ${promptKeys.join(', ') || 'none'}`);
    for (const k of promptKeys) {
        if (t[k] && typeof t[k] === 'string' && t[k].length > 5) {
            console.log(`    ${k}: ${t[k].substring(0, 200)}`);
        }
    }
    console.log('');
}

await mongoose.disconnect();

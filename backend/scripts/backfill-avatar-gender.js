import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import Avatar from '../models/Avatar.js';

function getGenderFromPrompt(prompt) {
    if (!prompt) return 'unspecified';
    const p = prompt.toLowerCase();
    if (/\b(man|men|boy|boys|male|guy|guys|gentleman|gentlemen)\b/.test(p)) return 'male';
    if (/\b(woman|women|girl|girls|female|lady|ladies|gal|gals)\b/.test(p)) return 'female';
    return 'unspecified';
}

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const avatars = await Avatar.find({ gender: 'unspecified' });
        console.log(`Found ${avatars.length} avatars with unspecified gender.`);

        let updated = 0;
        for (const av of avatars) {
            const prompt = av.promptUsed || av.generatedFromPrompt || '';
            const newGender = getGenderFromPrompt(prompt);
            
            if (newGender !== 'unspecified') {
                av.gender = newGender;
                await av.save();
                updated++;
                console.log(`[UPDATED] ${av.name} -> ${newGender}`);
            }
        }
        
        console.log(`\nSuccess! Updated ${updated} avatars.`);
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}

run();

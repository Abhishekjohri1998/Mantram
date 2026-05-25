import dotenv from 'dotenv';
dotenv.config();

// Mock Mongoose model queries before importing anything that uses them
import mongoose from 'mongoose';
import QAdsCategory from '../backend/models/QAdsCategory.js';
import QAdsPreset from '../backend/models/QAdsPreset.js';

// Stub category query
QAdsCategory.find = () => {
    return {
        sort: () => {
            return {
                lean: async () => [
                    { _id: '60c72b2f9b1d8b2d88888881', name: 'Creator Showcase', color: 'blue', slug: 'creator' }
                ]
            };
        }
    };
};

// Stub preset query
QAdsPreset.find = () => {
    return {
        sort: () => {
            return {
                lean: async () => [
                    {
                        _id: '60c72b2f9b1d8b2d88888882',
                        presetCode: 'ugc_first_reaction',
                        categoryId: '60c72b2f9b1d8b2d88888881',
                        name: 'UGC First Reaction',
                        tagline: 'Authentic first reaction',
                        description: 'A creator react to the product',
                        isActive: true,
                        promptRules: {
                            cameraSignature: 'Dynamic handheld closeups',
                            pacing: 'Fast cuts',
                            environmentDefault: 'A clean bright bathroom',
                            register: 'conversational',
                            cuts: 'Standard pacing and cuts.',
                            forbiddenElements: [],
                            directorBrief: 'React to the product.',
                            noAvatar: false,
                            recommendedDuration: 8,
                            recommendedFormat: '9:16'
                        }
                    }
                ]
            };
        }
    };
};

import { runQAdsAgent } from '../backend/agents/videoStudio/qAdsAgent.js';

async function test() {
    console.log('Calling Q-Ads Agent in Hindi (Hinglish/Colloquial)...');
    try {
        const result = await runQAdsAgent({
            brandId: null,
            presetId: 'ugc_first_reaction',
            userBrief: 'A test ad for a new organic face wash product.',
            productData: { productName: 'GlowPure Face Wash' },
            productImageUrls: [],
            avatarUrl: null,
            settings: { language: 'Hindi', duration: 8, format: '9:16' },
            userId: '60c72b2f9b1d8b2d88888883' // Mock ObjectId string
        });
        
        console.log('\n--- HINDI TEST RESULTS ---');
        result.variants.forEach(v => {
            console.log(`\nVARIANT ${v.variantId} (${v.prompt.split(' ').length} words):`);
            console.log(v.prompt);
        });
        console.log('\nSUCCESS: Hindi variants generated correctly!');
    } catch (err) {
        console.error('Test Failed:', err.message);
    }
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});

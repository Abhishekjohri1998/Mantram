import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Brand from '../backend/models/Brand.js';

// Stub the Brand findById query to return our mocked brand data offline
Brand.findById = () => {
    return {
        lean: async () => ({
            name: 'The North Face',
            dna: {
                logo: {
                    url: 'https://mantram-brand-assets.s3.amazonaws.com/thenorthface-logo.png',
                    metadata: {
                        visionDescription: 'The North Face iconic logo: three curved swoosh shapes representing the Half Dome granite monolith, next to the text "THE NORTH FACE" in bold sans-serif capital letters.'
                    }
                },
                brandDescription: 'Premium outdoor gear.',
                tagline: 'Never Stop Exploring.'
            }
        })
    };
};

import { runStoryboardDirector } from '../backend/agents/videoStudio/storyboardDirector.js';

async function test() {
    console.log('Running Storyboard Director Agent test...');
    try {
        const result = await runStoryboardDirector({
            brandId: '60c72b2f9b1d8b2d88888884', // Valid Mongoose ObjectId string
            brief: 'Create a premium outdoor gear campaign showcasing storm performance and technical jackets.',
            productName: 'Summit Series Waterproof Jacket',
            productFeatures: 'DryVent fabric, seamless water-resistant zippers, storm hood, premium mountain design',
            productImageUrls: ['https://mantram-brand-assets.s3.amazonaws.com/jacket-product.jpg'],
            avatarUrl: null,
            style: 'hyperrealistic',
            duration: 15,
            format: '16:9',
            userId: '60c72b2f9b1d8b2d88888883',
            directorModel: 'claude',
            dialogueLanguage: 'English'
        });

        console.log('\n--- STORYBOARD DIRECTOR TEST RESULTS ---');
        console.log(`Image Prompt URL parameter checked (logoUrl): ${result.logoUrl}`);
        console.log('\n================ IMAGE PROMPT (Midjourney/Gemini Poster) ================');
        console.log(result.imagePrompt);
        console.log('\n================ VIDEO PROMPT (Seedance Animation) ================');
        console.log(result.videoPrompt);
        console.log('\nSUCCESS: Storyboard Director successfully planned the storyboard!');
    } catch (err) {
        console.error('Test Failed:', err);
    }
    process.exit(0);
}

test();

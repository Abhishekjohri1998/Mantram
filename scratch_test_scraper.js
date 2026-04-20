import config from './backend/config/env.js';
import mongoose from 'mongoose';
import cheerio from 'cheerio';
import { analyzeProductDesign } from './backend/agents/shared/productDesignAgent.js';
import { GeminiProvider } from './backend/ai/providers/gemini.js';

// Polyfill process.env so models don't crash
import dotenv from 'dotenv';
dotenv.config();

// Fix AI router
import { initializeRouter } from './backend/ai/router.js';
initializeRouter();

async function run() {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to mongo');

    const url = 'https://www.amazon.com/dp/B08B42HCGX'; // generic amazon item
    console.log(`Fetching ${url}`);
    
    const fetchRes = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        }
    });
    const html = await fetchRes.text();
    const $ = cheerio.load(html);
    
    // Scraper logic
    const dynamicImages = [];
    $('img[data-a-dynamic-image]').each((_, el) => {
        try {
            const parsed = JSON.parse($(el).attr('data-a-dynamic-image') || '{}');
            Object.keys(parsed).forEach(imgUrl => dynamicImages.push(imgUrl));
        } catch (_) {}
    });

    console.log(`Found ${dynamicImages.length} images`);
    if (dynamicImages.length > 0) {
        console.log(`First image: ${dynamicImages[0]}`);
    }

    mongoose.disconnect();
}

run().catch(console.error);

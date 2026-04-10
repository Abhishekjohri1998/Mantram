import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GeminiProvider } from './ai/providers/gemini.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '.env') });

// Overwrite credentials for local test
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'd:\\mantram\\Mantram AI\\gen-lang-client-0968421394-3e882db757f0.json';

const config = {
    apiKey: process.env.GEMINI_API_KEY,
    gcpProjectId: process.env.GCP_PROJECT_ID,
    gcpLocation: process.env.GCP_LOCATION,
    googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
};

async function test() {
    console.log('🧪 Testing GeminiProvider with Vertex AI...');
    const gemini = new GeminiProvider(config);
    
    if (!gemini.vertexAi) {
        console.error('❌ Vertex AI was not initialized!');
        return;
    }
    
    try {
        const result = await gemini.generateText({
            systemPrompt: 'You are a test assistant.',
            userPrompt: 'Say "Vertex AI is Active" if you are working.',
            model: 'gemini-1.5-flash'
        });
        
        console.log('✅ Result:', result.text);
        console.log('📊 Tokens Used:', result.tokensUsed);
        console.log('⏱️ Time:', result.generationTime, 'ms');
    } catch (err) {
        console.error('❌ Generation failed:', err.message);
    }
}

test();

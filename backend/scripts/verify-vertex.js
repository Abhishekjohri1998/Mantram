import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function verifyVertex() {
    const project = process.env.GCP_PROJECT_ID || 'gen-lang-client-0968421394';
    const location = process.env.GCP_LOCATION || 'us-central1';
    const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    console.log('----------------------------------------------------');
    console.log('🧪 Vertex AI Authentication Verification');
    console.log('----------------------------------------------------');
    console.log(`📍 Project: ${project}`);
    console.log(`📍 Location: ${location}`);
    console.log(`🔑 Credentials Path: ${credentials || 'Not set (will use default environment auth)'}`);
    console.log('----------------------------------------------------');

    try {
        const vertexAi = new VertexAI({ project, location });
        
        // Use Gemini 2.0 Flash for a fast test
        const model = vertexAi.getGenerativeModel({ model: 'gemini-2.0-flash-001' });
        
        console.log('📡 Sending test request to Google Cloud...');
        const startTime = Date.now();
        const result = await model.generateContent('Say "Vertex AI is Active"');
        const duration = Date.now() - startTime;
        
        const responseText = result.response.candidates[0].content.parts[0].text;
        
        console.log('----------------------------------------------------');
        console.log(`✅ Authentication Successful!`);
        console.log(`💬 Response: "${responseText.trim()}"`);
        console.log(`⏱️ Latency: ${duration}ms`);
        console.log('----------------------------------------------------');
        console.log('🚀 YOUR GOOGLE ACCOUNT CREDITS ARE NOW BEING CONSUMED');
        console.log('----------------------------------------------------');

    } catch (err) {
        console.error('----------------------------------------------------');
        console.error('❌ Authentication Failed!');
        console.error(`Error: ${err.message}`);
        if (err.message.includes('credentials')) {
            console.error('Tip: Check if the path to gcp-service-account.json is correct and accessible.');
        }
        console.error('----------------------------------------------------');
        process.exit(1);
    }
}

verifyVertex();

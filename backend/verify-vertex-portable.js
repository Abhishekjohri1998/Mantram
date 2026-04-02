import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env variables from .env if present
dotenv.config();

console.log('🧪 Vertex AI Portable Verification Tool');
console.log('────────────────────────────────────────');

async function verify() {
    // 1. Resolve Project ID and Location from .env
    const projectId = process.env.GCP_PROJECT_ID || 'gen-lang-client-0968421394';
    const location = process.env.GCP_LOCATION || 'us-central1';
    let credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    // 2. Smart Path Resolution:
    // If we're on Windows and the path is the Linux EC2 path, try to find it locally.
    if (process.platform === 'win32' && credsPath === '/home/ubuntu/secrets/gcp-service-account.json') {
        const localPath = path.join(__dirname, 'secrets', 'gcp-service-account.json');
        if (fs.existsSync(localPath)) {
            console.log(`ℹ️ Detected Linux path on Windows. Remapping to local: ${localPath}`);
            credsPath = localPath;
            // Update env for the SDK to use the remapped path
            process.env.GOOGLE_APPLICATION_CREDENTIALS = localPath;
        }
    }

    // 3. Status Report
    console.log(`📍 Project ID: ${projectId}`);
    console.log(`🌍 Location:   ${location}`);
    console.log(`🔑 Key Path:   ${credsPath}`);

    // 4. File Check
    if (!fs.existsSync(credsPath)) {
        console.error(`\n❌ ERROR: Key file not found at: ${credsPath}`);
        console.error(`💡 Current OS: ${process.platform}`);
        console.warn('⚠️ Please check your GOOGLE_APPLICATION_CREDENTIALS path in .env.');
        process.exit(1);
    }

    try {
        console.log('\n⏳ Connecting to Google Gen AI (Vertex Mode)...');
        const ai = new GoogleGenAI({ 
            vertexai: true,
            project: projectId, 
            location: location 
        });
        
        // Use gemini-2.0-flash
        const modelId = 'gemini-2.0-flash'; 

        console.log(`🤖 Testing generation with: ${modelId}...`);
        
        const startTime = Date.now();
        const result = await ai.models.generateContent({
            model: modelId,
            contents: [{ role: 'user', parts: [{ text: 'Please respond with exactly "✅ Vertex AI is Active"' }] }],
        });

        const text = result.text;
        
        console.log('────────────────────────────────────────');
        console.log(`✨ SERVER RESPONSE: ${text}`);
        console.log(`⏱️ Response Time: ${Date.now() - startTime}ms`);
        console.log('────────────────────────────────────────');
        console.log('🎉 Your Vertex AI setup is verified and production-ready!');
    } catch (err) {
        console.error('\n❌ VERIFICATION FAILED:');
        console.error(err.message);
        
        if (err.message.includes('permission') || err.message.includes('403')) {
            console.error('💡 TIP: Check if your Service Account has the "Vertex AI User" role in GCP Console.');
        } else if (err.message.includes('credentials') || err.message.includes('auth')) {
            console.error('💡 TIP: Check if your JSON key file is valid or if the path is correct.');
        }
    }
}

verify();

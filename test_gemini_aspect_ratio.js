import dotenv from 'dotenv';

dotenv.config({ path: 'backend/.env' });
const API_KEY = process.env.GEMINI_API_KEY;

async function testGemini() {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;
    
    const body = {
        contents: [{ role: 'user', parts: [{ text: "A cute dog. Aspect ratio 1:4. TEXT: 'HELLO'" }] }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            // Test if it accepts aspect ratio natively
            imageConfig: {
                aspectRatio: "1:4"
            }
        }
    };
    
    console.log("Testing imageConfig.aspectRatio inside generationConfig...");
    let response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = await response.json();
    console.log("Status:", response.status);
    console.log("Response Error:", data.error?.message);
    if(response.status === 200) console.log("SUCCESS!");

    // Test without imageConfig, just prompt
    if(response.status !== 200) {
        body.generationConfig = { responseModalities: ["IMAGE"] };
        body.parameters = { aspectRatio: "1:4" }; // Test parameters object
        console.log("\nTesting parameters.aspectRatio...");
        response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        data = await response.json();
        console.log("Status:", response.status);
        console.log("Response Error:", data.error?.message);
        if(response.status === 200) console.log("SUCCESS!");
    }
}
testGemini();

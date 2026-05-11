import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
const API_KEY = process.env.GEMINI_API_KEY;

async function testGemini(body) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
    try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
        const data = await response.json();
        console.log("Status:", response.status);
        console.log("Error:", data.error?.message);
        if (response.status === 200) console.log("SUCCESS!");
    } catch(e) {
        console.log("Exception:", e.message);
    } finally {
        clearTimeout(timeoutId);
    }
}

// Test imageConfig inside generationConfig
testGemini({
    contents: [{ role: 'user', parts: [{ text: "A cute dog" }] }],
    generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "16:9" }
    }
}).then(() => {
    // Test parameters inside generationConfig
    testGemini({
        contents: [{ role: 'user', parts: [{ text: "A cute dog" }] }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            parameters: { aspectRatio: "16:9" }
        }
    });
});

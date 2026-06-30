const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: './.env' }); // Load env vars

async function test() {
    const key = process.env.ATLASCLOUD_API_KEY;
    const finalPrompt = "Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout. Cinematic lighting, photorealistic details. A man is questioning his devotion after seeing rats eat offerings on a Shiva lingam. He seeks the truth. The atmosphere is dense and spiritual, filled with incense smoke. Highly detailed panels.";
    console.log("Testing 1024x1024 url with complex prompt");
    const t0 = Date.now();
    let r1 = await fetch('https://api.atlascloud.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2', prompt: finalPrompt, size: '1024x1024', response_format: 'url', n: 1 })
    });
    console.log("Status:", r1.status);
    console.log("Time elapsed:", (Date.now() - t0)/1000, "seconds");
}
test();

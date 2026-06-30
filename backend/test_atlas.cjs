const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: './.env' }); // Load env vars

async function test() {
    const key = process.env.ATLASCLOUD_API_KEY;
    if (!key) {
        console.error("NO API KEY FOUND");
        return;
    }
    
    console.log("Testing 1024x1024");
    let r1 = await fetch('https://api.atlascloud.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2', prompt: 'a cute cat', size: '1024x1024', n: 1 })
    });
    console.log("1024:", r1.status, await r1.text());

    console.log("Testing 1024x1024 b64_json");
    let r2 = await fetch('https://api.atlascloud.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2', prompt: 'a cute cat', size: '1024x1024', response_format: 'b64_json', n: 1 })
    });
    console.log("1024 b64_json:", r2.status, await r2.text());
}
test();

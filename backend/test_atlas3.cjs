const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: './.env' }); // Load env vars

async function test() {
    const key = process.env.ATLASCLOUD_API_KEY;
    console.log("Testing 1792x1024 with quality: high");
    let r1 = await fetch('https://api.atlascloud.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-2', prompt: 'a cute cat', size: '1792x1024', quality: 'high', n: 1 })
    });
    console.log("1792x1024 high:", r1.status, await r1.text());
}
test();

import fetch from 'node-fetch';
import sharp from 'sharp';

async function run() {
    const dotenv = await import('dotenv');
    dotenv.config();
    const key = process.env.LAOZHANG_API_KEY;
    
    const body1 = {
        model: 'gpt-image-2',
        prompt: 'a beautiful sunset',
        size: '1920x600'
    };
    const res1 = await fetch('https://api.laozhang.ai/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(body1)
    });
    const data1 = await res1.json();
    if (data1.data && data1.data[0] && data1.data[0].b64_json) {
        const buffer = Buffer.from(data1.data[0].b64_json, 'base64');
        const metadata = await sharp(buffer).metadata();
        console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);
    } else {
        console.log("No image data found:", data1);
    }
}
run();


// Use native fetch (Node 23)

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });


const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
console.log('Testing FAL upload with key:', falKey ? (falKey.substring(0, 8) + '...') : 'MISSING');

if (!falKey) {
    console.error('FAL_API_KEY is missing from .env');
    process.exit(1);
}

async function testUpload() {
    const mimeType = 'image/png';
    const filename = `test-${Date.now()}.png`;
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1x1 white pixel
    const buffer = Buffer.from(base64, 'base64');

    console.log('Attempting method 1: Initiate + PUT (fal.run)');
    try {
        const initResp = await fetch('https://fal.run/storage/upload/initiate', {
            method: 'POST',
            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_name: filename, content_type: mimeType }),
        });
        
        console.log('Initiate status:', initResp.status);
        const initData = await initResp.json();
        console.log('Initiate data:', JSON.stringify(initData));

        if (initResp.ok && initData.upload_url) {
            const putResp = await fetch(initData.upload_url, {
                method: 'PUT',
                headers: { 'Content-Type': mimeType },
                body: buffer,
            });
            console.log('PUT status:', putResp.status);
            if (putResp.ok) {
                console.log('✅ Method 1 Success:', initData.file_url);
                return;
            }
        }
    } catch (e) {
        console.error('Method 1 Error:', e.message);
    }

    console.log('\nAttempting method 3: Base64 REST (fal.run)');
    try {
        const resp = await fetch('https://fal.run/storage/upload/base64', {
            method: 'POST',
            headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64, content_type: mimeType, file_name: filename }),
        });
        console.log('REST status:', resp.status);
        const data = await resp.json();
        console.log('REST data:', JSON.stringify(data));
        if (resp.ok) {
            console.log('✅ Method 3 Success:', data.url || data.file_url);
            return;
        }
    } catch (e) {
        console.error('Method 3 Error:', e.message);
    }


    console.error('\n❌ All upload methods failed');
}

testUpload();

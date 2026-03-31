import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ path: './.env' });

const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1';

async function testMuApi() {
    const apiKey = process.env.MUAPI_API_KEY;
    console.log('Using API Key:', apiKey ? (apiKey.substring(0, 5) + '...') : 'MISSING');
    
    if (!apiKey) {
        console.error('MUAPI_API_KEY is not set in .env');
        return;
    }

    const payload = {
        prompt: "Cinematic shot of a traveler walking through a ancient temple, golden hour light, high detail, 4k",
        duration: 5,
        aspect_ratio: "16:9",
        quality: "basic",
        remove_watermark: true
    };

    console.log('Submitting to:', `${MUAPI_BASE_URL}/seedance-v2.0-t2v`);
    
    try {
        const response = await fetch(`${MUAPI_BASE_URL}/seedance-v2.0-t2v`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        console.log('Status:', response.status);
        const text = await response.text();
        console.log('Response:', text);
        
        if (response.ok) {
            const data = JSON.parse(text);
            if (data.id) {
                console.log('Submission SUCCESS! ID:', data.id);
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

testMuApi();

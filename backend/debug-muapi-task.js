import dotenv from 'dotenv';
dotenv.config();

const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1';
const REQUEST_ID = '0763d0c3-560b-4bdd-9a6b-a26d194c1fc2';
const API_KEY = process.env.MUAPI_API_KEY;

async function checkStatus() {
    if (!API_KEY) {
        console.error('❌ MUAPI_API_KEY is not set in .env');
        return;
    }

    const url = `${MUAPI_BASE_URL}/predictions/${REQUEST_ID}/result`;
    console.log(`🔍 Checking status for ${REQUEST_ID} at ${url}...`);

    try {
        const response = await fetch(url, {
            headers: {
                'x-api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        console.log('📦 Raw Response:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('❌ Error checking status:', err.message);
    }
}

checkStatus();

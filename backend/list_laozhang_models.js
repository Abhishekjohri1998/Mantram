import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function run() {
    const lzKey = process.env.LAOZHANG_API_KEY;
    if (!lzKey) {
        console.error('LAOZHANG_API_KEY is not defined in env!');
        return;
    }
    
    try {
        console.log('Fetching available models from Laozhang...');
        const resp = await fetch('https://api.laozhang.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${lzKey}` }
        });
        
        if (!resp.ok) {
            console.error(`HTTP Error: ${resp.status} ${resp.statusText}`);
            return;
        }
        
        const data = await resp.json();
        console.log('Models count:', data.data?.length);
        const modelIds = (data.data || []).map(m => m.id).sort();
        console.log('Model list:', modelIds);
    } catch (e) {
        console.error('Error fetching models:', e.message);
    }
}

run();

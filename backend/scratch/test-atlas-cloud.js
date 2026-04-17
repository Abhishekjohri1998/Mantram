async function listAtlas() {
    const apiKey = process.env.PIAPI_API_KEY || process.env.ATLAS_API_KEY; 
    const PIAPI_BASE_URL = process.env.PIAPI_BASE_URL || 'https://api.atlascloud.ai';
    const endpointUrl = `${PIAPI_BASE_URL}/api/v1/models`; 
    
    const response = await global.fetch(endpointUrl, {
        method: 'GET',
        headers: { 
            'Authorization': `Bearer ${apiKey}`
        }
    });

    const data = await response.json();
    if (data && data.data) {
        const atlasModels = data.data.filter(m => m.model.toLowerCase().includes('atlascloud'));
        console.log("Atlas Models:");
        atlasModels.forEach(m => console.log(`- ID: ${m.model}`));
    }
}

listAtlas();

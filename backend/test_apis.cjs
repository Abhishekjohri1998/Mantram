const axios = require('axios');
require('dotenv').config({ path: '/Users/dasachin/Desktop/Output/Mantram AI/backend/.env' });

const testAPIs = async () => {
    console.log("Starting API Balance / Quota Tests...\n");

    const report = {};
    const setStatus = (name, hasBalance, msg) => {
        report[name] = { hasBalance, msg };
        console.log(`[${name}] ${hasBalance ? '✅ OK' : '❌ NO BALANCE'} - ${msg}`);
    };

    // 1. OpenAI
    try {
        await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
        }, { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } });
        setStatus('OpenAI', true, 'Generated successfully');
    } catch (e) {
        setStatus('OpenAI', e.response?.status !== 429, `Status ${e.response?.status}: ${JSON.stringify(e.response?.data?.error?.message || e.message)}`);
    }

    // 2. Anthropic
    try {
        await axios.post('https://api.anthropic.com/v1/messages', {
            model: 'claude-3-haiku-20240307',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
        }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' } });
        setStatus('Anthropic', true, 'Generated successfully');
    } catch (e) {
        const msg = e.response?.data?.error?.message || e.message;
        setStatus('Anthropic', !msg.toLowerCase().includes('credit'), `Status ${e.response?.status}: ${msg}`);
    }

    // 3. xAI (Grok)
    try {
        await axios.post('https://api.x.ai/v1/chat/completions', {
            model: 'grok-2-latest',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
        }, { headers: { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` } });
        setStatus('xAI (Grok)', true, 'Generated successfully');
    } catch (e) {
        setStatus('xAI (Grok)', e.response?.status !== 429 && e.response?.status !== 402, `Status ${e.response?.status}: ${e.response?.data?.error?.message || e.message}`);
    }

    // 4. Perplexity AI
    try {
        await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
        }, { headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}` } });
        setStatus('Perplexity AI', true, 'Generated successfully');
    } catch (e) {
        setStatus('Perplexity AI', e.response?.status !== 429 && e.response?.status !== 402, `Status ${e.response?.status}: ${e.response?.data?.error?.message || e.message}`);
    }

    // 5. LaoZhang (OpenAI compatible)
    try {
        await axios.post('https://api.laozhang.ai/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 1
        }, { headers: { 'Authorization': `Bearer ${process.env.LAOZHANG_API_KEY}` } });
        setStatus('LaoZhang', true, 'Generated successfully');
    } catch (e) {
        setStatus('LaoZhang', e.response?.status !== 429 && e.response?.status !== 402, `Status ${e.response?.status}: ${e.response?.data?.error?.message || e.message}`);
    }

    // 6. Gemini
    try {
        await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
            contents: [{ parts: [{ text: "Hi" }] }]
        });
        setStatus('Gemini', true, 'Generated successfully');
    } catch (e) {
        setStatus('Gemini', e.response?.status !== 429 && e.response?.status !== 403, `Status ${e.response?.status}: ${e.response?.data?.error?.message || e.message}`);
    }

    // 7. MuAPI (OpenAI compatible for models check)
    try {
        await axios.get('https://api.muapi.com/v1/models', {
            headers: { 'Authorization': `Bearer ${process.env.MUAPI_API_KEY}` }
        });
        setStatus('MuAPI', true, 'Models endpoint successful (assuming balance exists)');
    } catch (e) {
        setStatus('MuAPI', e.response?.status !== 402 && e.response?.status !== 429, `Status ${e.response?.status}: ${e.response?.data?.error?.message || e.message}`);
    }

    // 8. Fal AI - Check usage or hit a cheap endpoint
    try {
        await axios.post('https://fal.run/fal-ai/fast-sdxl', {
            prompt: 'a cat'
        }, { headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` } });
        setStatus('fal.ai', true, 'Generated successfully');
    } catch (e) {
        const isQuota = e.response?.status === 402 || e.response?.data?.detail?.toLowerCase().includes('balance') || e.response?.data?.detail?.toLowerCase().includes('credit');
        setStatus('fal.ai', !isQuota, `Status ${e.response?.status}: ${JSON.stringify(e.response?.data || e.message)}`);
    }

    // 9. PiAPI - Their balance endpoint is /api/v1/user/balance but host is usually api.piapi.ai
    try {
        const res = await axios.get('https://api.piapi.ai/api/v1/user/balance', {
            headers: { 'x-api-key': process.env.PIAPI_API_KEY }
        });
        if (res.data?.data?.balance !== undefined) {
             setStatus('PiAPI', res.data.data.balance > 0, `Balance is ${res.data.data.balance}`);
        } else {
             setStatus('PiAPI', false, 'Unexpected response format: ' + JSON.stringify(res.data));
        }
    } catch (e) {
        setStatus('PiAPI', false, `Status ${e.response?.status}: ${JSON.stringify(e.response?.data || e.message)}`);
    }

    // 10. Atlas Cloud - Check their models or standard endpoint
    try {
        // Just make a dummy request to their task create to see if it fails on balance
        await axios.post('https://api.atlascloud.ai/api/v1/task/create', {
            model: 'atlascloud/workflow/seedance-2.0/reference-to-video',
            prompt: 'test'
        }, { headers: { 'x-api-key': process.env.ATLASCLOUD_API_KEY } });
        setStatus('Atlas Cloud', true, 'Request reached validation (Assumed balance)');
    } catch (e) {
        const isQuota = e.response?.status === 402 || JSON.stringify(e.response?.data || '').toLowerCase().includes('balance') || JSON.stringify(e.response?.data || '').toLowerCase().includes('credit');
        setStatus('Atlas Cloud', !isQuota, `Status ${e.response?.status}: ${JSON.stringify(e.response?.data || e.message)}`);
    }

    // 11. HeyGen
    try {
        await axios.get('https://api.heygen.com/v1/user/info', {
            headers: { 'x-api-key': process.env.HEYGEN_API_KEY }
        });
        // We'd have to parse the response if it returns quota info.
        setStatus('HeyGen', true, 'Auth successful');
    } catch (e) {
        setStatus('HeyGen', e.response?.status !== 402, `Status ${e.response?.status}: ${e.message}`);
    }

    console.log("\n--- SUMMARY ---");
    const outOfBalance = Object.keys(report).filter(k => !report[k].hasBalance);
    if (outOfBalance.length > 0) {
        console.log("NO BALANCE OR QUOTA ERROR:");
        outOfBalance.forEach(k => console.log(`- ${k} (${report[k].msg})`));
    } else {
        console.log("All checked APIs appear to have balance/quota.");
    }
};

testAPIs();

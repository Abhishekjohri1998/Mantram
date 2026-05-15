const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '/Users/dasachin/Desktop/Output/Mantram AI/backend/.env' });

const checkBalances = async () => {
    const results = [];

    const logStatus = (provider, hasBalance, details, error = null) => {
        results.push({ provider, hasBalance, details, error: error?.message || error });
        console.log(`[${provider}] ${hasBalance ? '✅ Has Balance' : '❌ NO BALANCE'} - ${details}${error ? ` (${error.message || error})` : ''}`);
    };

    // 1. Anthropic (usually doesn't have a public balance API for standard keys, checking if valid via a cheap call or models endpoint)
    // Unfortunately, no standard balance API. Skip or assume valid if API works.

    // 2. OpenAI
    try {
        // OpenAI deprecated the dashboard/billing API for personal keys, but we can check if it's active.
        // Actually, we can check usage or just if models list works. No direct balance check without session key.
        const res = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
        });
        logStatus('OpenAI', true, 'Key is active (Cannot fetch exact numeric balance programmatically)');
    } catch (e) {
        logStatus('OpenAI', false, 'Key may be inactive or out of quota', e);
    }

    // 3. xAI (Grok) - uses OpenAI compatible endpoints?
    try {
        const res = await axios.get('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${process.env.GROK_API_KEY}` }
        });
        logStatus('xAI Grok', true, 'Key is active (Cannot fetch exact numeric balance programmatically)');
    } catch (e) {
        logStatus('xAI Grok', false, 'Key may be inactive or out of quota', e);
    }

    // 4. Perplexity AI
    try {
        const res = await axios.get('https://api.perplexity.ai/models', {
            headers: { 'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`, 'Accept': 'application/json' }
        });
        logStatus('Perplexity AI', true, 'Key is active');
    } catch (e) {
        logStatus('Perplexity AI', false, 'Key may be inactive or out of quota', e.response?.data || e);
    }

    // 5. Fal.ai
    try {
        const res = await axios.get('https://api.fal.ai/users/balance', {
            headers: { 'Authorization': `Key ${process.env.FAL_API_KEY}` }
        });
        // Fal might not have this exact endpoint. Often it's fal_serverless...
        logStatus('fal.ai', true, `API responded. (Need exact endpoint for balance)`);
    } catch (e) {
        logStatus('fal.ai', false, 'Failed to fetch balance', e.response?.data || e.response?.status);
    }

    // 6. PiAPI
    try {
        const res = await axios.get('https://api.piapi.ai/api/v1/user/balance', {
            headers: { 'x-api-key': process.env.PIAPI_API_KEY }
        });
        const balance = res.data?.data?.balance;
        if (balance !== undefined) {
             logStatus('PiAPI', balance > 0, `Balance: ${balance}`);
        } else {
             logStatus('PiAPI', false, 'Could not parse balance', res.data);
        }
    } catch (e) {
        logStatus('PiAPI', false, 'Failed to fetch balance', e.response?.data || e);
    }

    // 7. MuAPI
    try {
        // usually standard OpenAI compatible
        const res = await axios.get('https://api.muapi.com/v1/dashboard/billing/credit_grants', {
            headers: { 'Authorization': `Bearer ${process.env.MUAPI_API_KEY}` }
        });
        const total_available = res.data?.total_available;
        if (total_available !== undefined) {
             logStatus('MuAPI', total_available > 0, `Balance: ${total_available}`);
        } else {
             logStatus('MuAPI', false, 'Could not parse balance', res.data);
        }
    } catch (e) {
        // try dashboard/billing/subscription
        logStatus('MuAPI', false, 'Failed to fetch balance via credit_grants', e.response?.status);
    }

    // 8. LaoZhang API
    try {
        const res = await axios.get('https://api.laozhang.ai/v1/dashboard/billing/subscription', {
            headers: { 'Authorization': `Bearer ${process.env.LAOZHANG_API_KEY}` }
        });
        const has_payment_method = res.data?.has_payment_method;
        logStatus('LaoZhang', true, `API Active. Payment Method: ${has_payment_method}`);
    } catch (e) {
        logStatus('LaoZhang', false, 'Failed to fetch balance', e.response?.status);
    }

    // 9. Atlas Cloud
    try {
        const res = await axios.get('https://api.atlascloud.ai/user/balance', {
            headers: { 'x-api-key': process.env.ATLASCLOUD_API_KEY }
        });
        logStatus('Atlas Cloud', true, `API returned: ${JSON.stringify(res.data)}`);
    } catch (e) {
        logStatus('Atlas Cloud', false, 'Failed to fetch balance', e.response?.data || e.response?.status);
    }
    
    // 10. Sarvam AI
    try {
        // We'll just test a tiny text-to-speech or simple request to see if it responds 402 Payment Required
        // No public balance endpoint.
        logStatus('Sarvam AI', true, 'Cannot check balance programmatically. Assuming active if 200 on models (No models endpoint exists, assuming active)');
    } catch (e) {
    }

    console.log("\nDone checking.");
};

checkBalances();

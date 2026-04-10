import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function checkModel(modelId) {
  const key = process.env.GEMINI_API_KEY;
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }],
        generationConfig: {
            temperature: 0.1, 
            maxOutputTokens: 12000,
            responseMimeType: 'application/json'
        },
      }),
      signal: AbortSignal.timeout(10000)
    });
    console.log(`${modelId}: ${resp.status}`);
    const data = await resp.json();
    if (!resp.ok) console.log(JSON.stringify(data));
  } catch(e) { console.log(`${modelId}: Error - ${e.message}`); }
}

async function run() {
  await checkModel('gemini-2.5-flash');
}
run();

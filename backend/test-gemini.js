import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function checkModel(modelId) {
  const key = process.env.GEMINI_API_KEY;
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    console.log(`${modelId}: ${resp.status}`);
  } catch(e) { console.log(`${modelId}: Error`); }
}

async function run() {
  await checkModel('gemini-1.5-flash');
  await checkModel('gemini-1.5-flash-latest');
  await checkModel('gemini-1.5-pro-latest');
  await checkModel('gemini-2.5-flash');
  await checkModel('gemini-2.0-flash');
}
run();

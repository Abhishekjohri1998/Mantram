import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return console.log('No GEMINI_API_KEY');
  
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Say hello' }] }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await resp.json();
    console.log(`Gemini Status: ${resp.status}`);
    if (!resp.ok) console.log(JSON.stringify(data));
    else console.log(data.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch (e) {
    console.log('Gemini Error:', e.message);
  }
}

testGemini();

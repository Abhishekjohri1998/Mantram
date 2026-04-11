async function testHealth() {
  const url = process.env.URL || 'https://mantram.ai';
  console.log(`Testing health check for ${url}`);
  try {
    const resp = await fetch('http://localhost:3001/api/seo-studio/health-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, forceScan: true })
    });
    
    const data = await resp.json();
    console.log(`Status: ${resp.status}`);
    console.log(JSON.stringify(data.scores || data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

testHealth();

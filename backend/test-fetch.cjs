async function testFetch() {
  const data = {
    message: "let's make an ad film",
    history: [],
    sessionState: {},
    brand: null,
    sessionId: null
  };

  try {
    const res = await fetch('http://127.0.0.1:3001/api/brainstorm-studio/fidato-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    console.log(`STATUS: ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    
    while(true) {
      const {done, value} = await reader.read();
      if(value) {
        console.log(`CHUNK: ${decoder.decode(value)}`);
      }
      if(done) {
        console.log('Stream done.');
        break;
      }
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testFetch();

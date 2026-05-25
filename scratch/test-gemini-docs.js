import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });

const apiKey = process.env.ATLASCLOUD_API_KEY || 'apikey-5213047d313643cc806219208e183def';

async function testModel() {
  const model = 'google/gemini-omni-flash/text-to-video-developer';
  console.log(`\nTesting Gemini model: ${model}`);
  
  const payload = {
    model: model,
    input: {
      prompt: "A beautiful cinematic shot of a sunset over the ocean, high resolution, 720p.",
      duration: 4,
      aspect_ratio: "16:9",
      resolution: "720p"
    }
  };
  
  console.log('Sending payload:', JSON.stringify(payload, null, 2));
  
  try {
    const res = await fetch('https://api.atlascloud.ai/api/v1/model/generateVideo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log('Submit Response status:', res.status);
    const result = await res.json();
    console.log('Submit Response body:', JSON.stringify(result, null, 2));
    
    const taskId = result?.data?.id || result?.id;
    if (!taskId) {
      console.log('Failed to get taskId');
      return;
    }
    
    console.log(`Polling task ${taskId}...`);
    const start = Date.now();
    while (Date.now() - start < 180000) { // Poll for 3 minutes
      await new Promise(r => setTimeout(r, 8000));
      const pollRes = await fetch(`https://api.atlascloud.ai/api/v1/model/prediction/${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const pollResult = await pollRes.json();
      const status = pollResult?.data?.status;
      console.log(`Task status: ${status}`, JSON.stringify(pollResult, null, 2));
      
      if (status === 'completed' || status === 'success' || status === 'succeeded') {
        console.log('✅ Video generated successfully:', pollResult.data.outputs || pollResult.data.video_url);
        return;
      }
      if (status === 'failed' || status === 'error') {
        console.log('❌ Generation failed:', pollResult.data.error || pollResult.data.message || pollResult.message);
        return;
      }
    }
    console.log('Timed out polling.');
  } catch (e) {
    console.error('Error during test:', e);
  }
}

testModel();

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env'), override: true });

const apiKey = process.env.ATLASCLOUD_API_KEY || 'apikey-5213047d313643cc806219208e183def';

async function listModels() {
  try {
    const res = await fetch('https://api.atlascloud.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    console.log('Status:', res.status);
    const result = await res.json();
    if (result && result.data) {
      console.log(`Total models returned: ${result.data.length}`);
      console.log('All models containing gemini or google:');
      result.data.forEach(m => {
        const id = m.model || m.id || m.model_id || (typeof m === 'string' ? m : '');
        const name = typeof m === 'object' ? JSON.stringify(m) : m;
        if (id && (id.toLowerCase().includes('gemini') || id.toLowerCase().includes('google'))) {
          console.log(`- ${id}`);
        } else if (name.toLowerCase().includes('gemini') || name.toLowerCase().includes('google')) {
          console.log(`- Object: ${name}`);
        }
      });
    } else {
      console.log('Unexpected response:', JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

listModels();

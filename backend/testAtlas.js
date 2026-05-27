async function testAtlas() {
  const apiKey = process.env.ATLASCLOUD_API_KEY;
  if (!apiKey) { console.error('ATLASCLOUD_API_KEY not set'); process.exit(1); }
  
  const payload = {
      "model": "google/gemini-omni-flash/text-to-video-developer", 
      "prompt": "System / Style: Ultra-realistic 3D stop-motion texture, macro photography, shallow depth of field, 4K resolution. Atmospheric and emotive sound design.\n\nVisual & Action Sequence:\nA realistic, weathered porcelain white deer statue stands frozen in the center of a dark, damp mossy forest. The camera is locked in a tight macro shot focusing on the deer's eye.\nSuddenly, a single drop of glowing, golden liquid honey drips from a branch above, landing perfectly into the deer's porcelain eye. The camera slowly zooms out. Where the honey touches, the cold porcelain instantly cracks and transforms into warm, living fur and flesh. The golden liquid ripples out like a wave across its body, turning the statue into a majestic, living deer.\nThe deer exhales a thick puff of white mist into the cold air, shakes its head, and takes a powerful leap forward, scattering glowing golden particles into the dark forest.\n\nAudio & Sound Sync:\n\n0:00-0:03: Dead silence, except for the faint, hollow ambient wind in the forest and a single, heavy water droplet sound (drip) at 0:02.\n\n0:03-0:05: A sharp, crisp sound of porcelain cracking (crack), immediately blending into a soft, squelching, organic sound of life spreading.\n\n0:05-0:10: A deep, resonant deer snort/exhale with a low-frequency rumble. As the deer leaps, a sudden, uplifting burst of cinematic orchestral strings (violin swell) echoes, layered with the rustling of forest leaves and fading magical sparkles.", 
      "duration": 10, 
      "aspect_ratio": "16:9", 
      "resolution": "720p", 
      "seed": -1
  };

  const res = await fetch('https://api.atlascloud.ai/api/v1/model/generateVideo', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  
  const json = await res.json();
  console.log('Queued:', JSON.stringify(json, null, 2));
  
  if (json.data && json.data.id) {
    const taskId = json.data.id;
    for (let i=0; i<15; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch('https://api.atlascloud.ai/api/v1/model/prediction/' + taskId, {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      });
      const pollJson = await pollRes.json();
      console.log('Poll:', pollJson.data.status, pollJson.data.error || '');
      if (pollJson.data.status === 'failed' || pollJson.data.status === 'completed') {
        console.log('Final:', JSON.stringify(pollJson, null, 2));
        break;
      }
    }
  }
}
testAtlas();

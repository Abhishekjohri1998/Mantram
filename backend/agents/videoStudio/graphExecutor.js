import { NODE_CATALOG } from './nodeCatalog.js';

/**
 * Base Node Handler class.
 * All node types must extend this class and implement execute().
 */
export class NodeHandler {
    /**
     * Executes the node's specific processing logic.
     * @param {Object} node - The current Mongoose node document/object.
     * @param {Object} inputs - Resolved upstream inputs for this node.
     * @param {Object} context - Execution context (userId, graphId, runId, etc.)
     * @returns {Promise<any>} The output value to store in node.outputRef.
     */
    async execute(node, inputs, context) {
        throw new Error(`Execute not implemented for node type "${node.type}"`);
    }
}

/**
 * Helper to convert WAV audio buffer to standard MP3 using FFmpeg
 */
async function convertWavToMp3(wavBuffer) {
    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const ffmpegPath = (await import('ffmpeg-static')).default;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wav-to-mp3-'));
    const wavPath = path.join(tmpDir, 'input.wav');
    const mp3Path = path.join(tmpDir, 'output.mp3');
    try {
        fs.writeFileSync(wavPath, wavBuffer);
        const isWav = wavBuffer.length >= 4 && wavBuffer.toString('ascii', 0, 4) === 'RIFF';
        const inputArgs = isWav ? ['-i', wavPath] : ['-f', 's16le', '-ar', '24000', '-ac', '1', '-i', wavPath];
        await execFileAsync(ffmpegPath, [
            '-y',
            ...inputArgs,
            '-codec:a', 'libmp3lame',
            '-b:a', '128k',
            mp3Path
        ]);
        return fs.readFileSync(mp3Path);
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

/**
 * Handler for text_input node.
 * Propagates user-entered text parameters directly.
 */
class TextInputHandler extends NodeHandler {
    async execute(node, inputs, context) {
        return node.params?.text || '';
    }
}

/**
 * Handler for asset_input node.
 * Propagates user-selected asset URLs directly.
 */
class AssetInputHandler extends NodeHandler {
    async execute(node, inputs, context) {
        return node.params?.url || '';
    }
}

/**
 * Handler for assistant (LLM) node.
 * Runs LLM queries (supports multimodal image inputs) and processes simple or list outputs.
 */
class AssistantHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const prompt = inputs.prompt || node.params?.prompt || '';
        if (!prompt) {
            throw new Error('Prompt is required for Assistant.');
        }
        const systemPrompt = node.params?.system_prompt || 'You are a creative assistant.';
        const modelParam = node.params?.model || 'gemini-flash';
        const outputMode = node.params?.output_mode || 'simple';

        let provider = 'gemini';
        let modelId = 'gemini-2.5-flash';

        if (modelParam === 'gpt-4o') {
            provider = 'openai';
            modelId = 'gpt-4o';
        } else if (modelParam === 'claude-3-5-sonnet') {
            provider = 'anthropic';
            modelId = 'claude-3-5-sonnet-20241022';
        } else if (modelParam === 'grok-beta') {
            provider = 'xai';
            modelId = 'grok-beta';
        }

        let userPrompt = prompt;
        if (outputMode === 'list') {
            userPrompt += '\n\nOutput the result as a raw JSON array of strings (e.g. ["item1", "item2"]). Do not wrap in markdown code blocks. Output ONLY the JSON array.';
        }

        const { callAgentText, callMultimodalAgent } = await import('../shared/agentUtils.js');
        let responseText = '';
        const mediaUrl = inputs.media;

        if (mediaUrl) {
            responseText = await callMultimodalAgent(systemPrompt, userPrompt, [mediaUrl], {
                provider,
                model: modelId,
                returnRaw: true
            });
            if (!responseText || typeof responseText !== 'string' || responseText.error) {
                throw new Error(responseText?.error || 'Empty or invalid response from LLM');
            }
        } else {
            responseText = await callAgentText(systemPrompt, userPrompt, 0.7, 4096, {
                provider,
                model: modelId
            });
        }

        responseText = responseText.trim();
        responseText = responseText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        if (outputMode === 'list') {
            let cleaned = responseText.replace(/```(?:json)?\s*\n?/gi, '').trim();
            const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
            if (arrayMatch) {
                try {
                    const parsed = JSON.parse(arrayMatch[0]);
                    if (Array.isArray(parsed)) {
                        return JSON.stringify(parsed);
                    }
                } catch (e) {
                    console.warn('Failed to parse assistant list:', e);
                }
            }
            const lines = cleaned.split('\n').map(l => l.replace(/^[-*•\d.\s]+/, '').trim()).filter(Boolean);
            return JSON.stringify(lines);
        }

        return responseText;
    }
}

/**
 * Handler for image_generate node.
 * Calls Gemini / OpenAI router to generate a new image asset.
 */
class ImageGenerateHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const prompt = inputs.prompt || node.params?.prompt || '';
        if (!prompt) {
            throw new Error('Prompt is required for Image Generate.');
        }

        const { geminiImageGenerate } = await import('./firstFrame.js');
        const options = {
            aspectRatio: node.params?.aspectRatio || '9:16',
            model: node.params?.model || 'gemini-flash',
            quality: node.params?.quality || 'standard'
        };

        console.log(`🖼️ [ImageGenerateHandler] Generating image with options:`, options);
        const res = await geminiImageGenerate(prompt, [], 0.5, options);

        if (!res || !res.imageUrl) {
            throw new Error('Image generation failed: No image URL returned from model router.');
        }

        return res.imageUrl;
    }
}

/**
 * Handler for video_generate node.
 * Initiates video generation and polls for completion.
 */
class VideoGenerateHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const prompt = inputs.prompt || node.params?.prompt || '';
        if (!prompt) {
            throw new Error('Prompt is required for Video Generate.');
        }

        const model = node.params?.model || 'seedance-2.0';
        const duration = parseInt(node.params?.duration, 10) || 8;
        const aspectRatio = node.params?.aspectRatio || '9:16';
        const resolution = node.params?.resolution || '1080p';

        const referenceImages = [];
        if (inputs.char_ref && inputs.char_ref.urls) {
            inputs.char_ref.urls.forEach(url => {
                referenceImages.push({ url, role: 'character_reference' });
            });
        }
        if (inputs.style_ref && inputs.style_ref.urls) {
            inputs.style_ref.urls.forEach(url => {
                referenceImages.push({ url, role: 'style_reference' });
            });
        }

        const { submitAtlasCloudVideoGeneration, submitGeminiFlashVideoGeneration, getAtlasCloudGenerationStatus } = await import('./atlasClient.js');

        let result;
        if (model === 'gemini-flash') {
            result = await submitGeminiFlashVideoGeneration({
                prompt,
                imageUrl: inputs.image || null,
                duration,
                aspectRatio,
                resolution,
                referenceImages: referenceImages.map(img => img.url),
            });
        } else {
            result = await submitAtlasCloudVideoGeneration({
                model,
                prompt,
                imageUrl: inputs.image || null,
                duration,
                aspectRatio,
                generateAudio: true,
                referenceImages,
                qualityMode: 'fast',
                resolution,
                imageRole: 'face',
            });
        }

        const taskId = result.taskId;
        if (!taskId) throw new Error('Failed to submit video generation task.');

        // Poll for completion
        console.log(`⏳ [VideoGenerateHandler] Polling status for task ${taskId}...`);
        const VideoGraph = (await import('../../models/VideoGraph.js')).default;

        const start = Date.now();
        const timeoutMs = 240000; // 4 minutes
        while (Date.now() - start < timeoutMs) {
            // Check for cancellation
            const currentGraph = await VideoGraph.findById(context.graphId);
            if (!currentGraph || currentGraph.activeRun?.runId !== context.runId || currentGraph.activeRun?.status === 'cancelled') {
                throw new Error('Run cancelled by user.');
            }

            const status = await getAtlasCloudGenerationStatus(taskId);
            if (status.status === 'COMPLETED') {
                if (!status.videoUrl) throw new Error('Video generation succeeded but returned empty URL.');
                return status.videoUrl;
            }
            if (status.status === 'FAILED') {
                throw new Error(status.error || 'Video generation failed.');
            }
            await new Promise(r => setTimeout(r, 6000));
        }

        throw new Error('Video generation timed out.');
    }
}

/**
 * Handler for concat (Stitch) node.
 * Merges multiple video clips into a single video track.
 */
class ConcatHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const clips = Array.isArray(inputs.clips) ? inputs.clips.flat().filter(Boolean) : [];
        if (clips.length === 0) {
            throw new Error('No clips provided for Concat.');
        }
        if (clips.length === 1) {
            return clips[0];
        }

        const { stitchVideoClips } = await import('../../utils/videoStitcher.js');
        const outputKey = `video-studio/stitched/${Date.now()}-concat.mp4`;
        console.log(`🎬 [ConcatHandler] Stitching ${clips.length} clips...`);
        return await stitchVideoClips(clips, outputKey);
    }
}

/**
 * Handler for video_audio_mix node.
 * Overlays background audios / voiceovers onto a video.
 */
class VideoAudioMixHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const videoUrl = inputs.video;
        if (!videoUrl) {
            throw new Error('Video input is required for Video Audio Mix.');
        }

        const audioUrls = Array.isArray(inputs.audio) ? inputs.audio.flat().filter(Boolean) : [inputs.audio].filter(Boolean);
        if (audioUrls.length === 0) {
            return videoUrl; // return video unchanged if no audio connected
        }

        const fs = await import('fs');
        const os = await import('os');
        const path = await import('path');
        const { execFile } = await import('child_process');
        const { promisify } = await import('util');
        const execFileAsync = promisify(execFile);
        const { uploadToS3 } = await import('../../utils/s3.js');
        const ffmpegPath = (await import('ffmpeg-static')).default;

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-audio-mix-'));
        const localVideo = path.join(tmpDir, 'input.mp4');
        const localOutput = path.join(tmpDir, 'output.mp4');

        try {
            const videoResp = await fetch(videoUrl);
            if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
            fs.writeFileSync(localVideo, Buffer.from(await videoResp.arrayBuffer()));

            const localAudios = [];
            for (let i = 0; i < audioUrls.length; i++) {
                console.log(`📥 [VideoAudioMix] Downloading audio track ${i + 1}: ${audioUrls[i].substring(0, 80)}...`);
                const audioResp = await fetch(audioUrls[i]);
                if (audioResp.ok) {
                    const localAudioPath = path.join(tmpDir, `audio_${i}.mp3`);
                    fs.writeFileSync(localAudioPath, Buffer.from(await audioResp.arrayBuffer()));
                    localAudios.push(localAudioPath);
                }
            }

            if (localAudios.length === 0) {
                return videoUrl;
            }

            let videoDuration = null;
            try {
                await execFileAsync(ffmpegPath, ['-i', localVideo]);
            } catch (err) {
                const match = err.message.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2,3})/);
                if (match) {
                    videoDuration = (parseInt(match[1], 10) * 3600) + (parseInt(match[2], 10) * 60) + parseFloat(match[3]);
                }
            }

            const videoVol = node.params?.videoVolume ?? 1.0;
            const audioVol = node.params?.audioVolume ?? 1.0;

            const args = ['-y', '-i', localVideo];
            for (const audioPath of localAudios) {
                args.push('-i', audioPath);
            }

            let videoHasAudio = false;
            try {
                await execFileAsync(ffmpegPath, ['-i', localVideo]);
            } catch (err) {
                if (err.message.includes('Audio:')) {
                    videoHasAudio = true;
                }
            }

            const filterParts = [];
            const mixInputs = [];

            if (videoHasAudio && videoVol > 0) {
                filterParts.push(`[0:a]volume=${videoVol}[va]`);
                mixInputs.push('[va]');
            }

            localAudios.forEach((_, idx) => {
                const inputIdx = idx + 1;
                filterParts.push(`[${inputIdx}:a]volume=${audioVol}[a${inputIdx}]`);
                mixInputs.push(`[a${inputIdx}]`);
            });

            let filterComplex = '';
            if (mixInputs.length > 1) {
                filterParts.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=longest:dropout_transition=2[aout]`);
                filterComplex = filterParts.join('; ');
            } else if (mixInputs.length === 1) {
                filterComplex = filterParts[0].replace(/\[va\]|\[a1\]/, '[aout]');
            }

            args.push('-filter_complex', filterComplex);
            args.push('-map', '0:v:0', '-map', '[aout]');
            args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k');

            if (videoDuration) {
                args.push('-t', String(videoDuration));
            } else {
                args.push('-shortest');
            }

            args.push('-movflags', '+faststart', localOutput);

            console.log(`🔧 [VideoAudioMix] Running FFmpeg:`, args.join(' '));
            await execFileAsync(ffmpegPath, args, { timeout: 120000 });

            const outputBuffer = fs.readFileSync(localOutput);
            const s3Key = `video-studio/mixed/${Date.now()}-mixed.mp4`;
            const s3Url = await uploadToS3(outputBuffer, s3Key, 'video/mp4');
            return s3Url;

        } finally {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        }
    }
}

/**
 * Handler for voiceover (TTS) node.
 * Generates spoken dialogue using ElevenLabs or Sarvam Bulbul v2.
 */
class VoiceoverHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const script = inputs.script || node.params?.script || '';
        if (!script) {
            throw new Error('Script is required for Voiceover.');
        }

        const provider = node.params?.provider || 'elevenlabs';
        const voiceId = node.params?.voice || '';
        const speed = parseFloat(node.params?.speed) || 1.0;
        const language = node.params?.language || 'en';

        const { uploadToS3 } = await import('../../utils/s3.js');

        if (provider === 'sarvam') {
            const apiKey = process.env.SARVAM_API_KEY;
            if (!apiKey) throw new Error('Sarvam API key not configured (SARVAM_API_KEY missing).');

            let langCode = 'hi-IN';
            if (language.includes('-')) {
                langCode = language;
            } else if (language === 'hi') {
                langCode = 'hi-IN';
            } else if (language === 'en') {
                langCode = 'en-IN';
            } else if (language === 'ta') {
                langCode = 'ta-IN';
            } else if (language === 'te') {
                langCode = 'te-IN';
            } else if (language === 'kn') {
                langCode = 'kn-IN';
            } else if (language === 'ml') {
                langCode = 'ml-IN';
            }

            const ttsResp = await fetch('https://api.sarvam.ai/text-to-speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
                body: JSON.stringify({
                    inputs: [script.substring(0, 2000)],
                    target_language_code: langCode,
                    speaker: voiceId || 'abhilash',
                    model: 'bulbul:v2',
                    pitch: 0,
                    pace: speed,
                    loudness: 1.5,
                    enable_preprocessing: true,
                }),
            });

            if (!ttsResp.ok) {
                const errBody = await ttsResp.text().catch(() => '');
                throw new Error(`Sarvam TTS failed (${ttsResp.status}): ${errBody.substring(0, 200)}`);
            }

            const ttsData = await ttsResp.json();
            const audioBase64 = ttsData.audios?.[0];
            if (!audioBase64) throw new Error('No audio returned from Sarvam.');

            const buffer = Buffer.from(audioBase64, 'base64');
            const mp3Buffer = await convertWavToMp3(buffer);
            const s3Key = `voiceover/${context.userId}/${Date.now()}.mp3`;
            return await uploadToS3(mp3Buffer, s3Key, 'audio/mpeg');

        } else {
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) throw new Error('No TTS provider configured (FAL_API_KEY missing).');

            let apiUrl, payload;
            const isEleven = provider === 'elevenlabs';

            if (isEleven) {
                apiUrl = 'https://fal.run/fal-ai/elevenlabs/tts/eleven-v3';
                payload = {
                    text: script.substring(0, 5000),
                    voice: voiceId || 'Rachel'
                };
            } else {
                apiUrl = 'https://fal.run/fal-ai/minimax/speech-02-hd';
                payload = {
                    text: script.substring(0, 5000),
                    voice_setting: { voice_id: voiceId || 'Deep_Voice_Man', speed: speed },
                    output_format: 'url',
                    language_boost: 'auto',
                };
            }

            console.log(`🔊 [VoiceoverHandler] Generating audio via ${provider}...`);
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`TTS failed (${resp.status}): ${errText.substring(0, 200)}`);
            }

            const result = await resp.json();
            const generatedAudioUrl = result?.audio?.url || result?.audio_url || result?.audio_file?.url || result?.url;
            if (!generatedAudioUrl) throw new Error('TTS returned no audio.');

            const audioResp = await fetch(generatedAudioUrl);
            const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
            const s3Key = `voiceover/${context.userId}/${Date.now()}.mp3`;
            return await uploadToS3(audioBuffer, s3Key, 'audio/mpeg');
        }
    }
}

/**
 * Handler for music_sfx node.
 * Generates music tracks via Google Lyria 3 model.
 */
class MusicSfxHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const prompt = inputs.prompt || node.params?.prompt || '';
        if (!prompt) {
            throw new Error('Prompt is required for Music / SFX.');
        }

        const duration = parseInt(node.params?.duration, 10) || 30;
        const type = node.params?.type || 'background';

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('Gemini API key not configured (GEMINI_API_KEY missing).');

        const { uploadToS3 } = await import('../../utils/s3.js');

        const musicPrompt = `Generate a ${duration} second ${type} track: ${prompt}. High quality, professional production, suitable for commercial use.`;

        console.log(`🎵 [MusicSfxHandler] Generating music via Lyria 3...`);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip-preview:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: musicPrompt }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                    }
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`Lyria music generation failed (${response.status}): ${errText.substring(0, 200)}`);
        }

        const data = await response.json();
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

        if (!audioPart?.inlineData?.data) {
            throw new Error('No audio returned from Gemini Lyria model.');
        }

        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        const mimeType = audioPart.inlineData.mimeType || 'audio/wav';
        
        let finalBuffer = audioBuffer;
        let finalMime = mimeType;
        
        if (mimeType.includes('wav')) {
            console.log(`🔄 [MusicSfxHandler] Converting WAV to MP3...`);
            finalBuffer = await convertWavToMp3(audioBuffer);
            finalMime = 'audio/mpeg';
        }

        const s3Key = `music/${context.userId}/${Date.now()}.mp3`;
        return await uploadToS3(finalBuffer, s3Key, finalMime);
    }
}

/**
 * Handler for sound_effects node.
 * Generates sound effects via Gemini Flash TTS.
 */
class SoundEffectsHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const prompt = inputs.prompt || node.params?.prompt || '';
        if (!prompt) {
            throw new Error('Prompt is required for Sound Effects.');
        }

        const duration = parseInt(node.params?.duration, 10) || 5;

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) throw new Error('Gemini API key not configured (GEMINI_API_KEY missing).');

        const { uploadToS3 } = await import('../../utils/s3.js');

        const sfxPrompt = `Generate a ${duration} second sound effect: ${prompt}. Clean, high quality, isolated sound.`;

        console.log(`🔊 [SoundEffectsHandler] Generating sound effect via Gemini...`);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-tts-preview:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: sfxPrompt }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                        }
                    }
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`SFX generation failed (${response.status}): ${errText.substring(0, 200)}`);
        }

        const data = await response.json();
        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

        if (!audioPart?.inlineData?.data) {
            throw new Error('No audio returned from Gemini SFX model.');
        }

        const audioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        console.log(`🔄 [SoundEffectsHandler] Converting WAV to MP3...`);
        const mp3Buffer = await convertWavToMp3(audioBuffer);
        const s3Key = `sfx/${context.userId}/${Date.now()}.mp3`;
        return await uploadToS3(mp3Buffer, s3Key, 'audio/mpeg');
    }
}

/**
 * Handler for list node.
 * Passes through arrays of assets, parsing any JSON lists if encountered.
 */
class ListHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const items = Array.isArray(inputs.items) ? inputs.items.flat().filter(Boolean) : [inputs.items].filter(Boolean);
        const flatItems = [];

        for (const item of items) {
            if (typeof item === 'string' && (item.trim().startsWith('[') || item.trim().startsWith('{'))) {
                try {
                    const parsed = JSON.parse(item);
                    if (Array.isArray(parsed)) {
                        for (const subItem of parsed) {
                            if (subItem && typeof subItem === 'object') {
                                if (subItem.checked === false) continue;
                                flatItems.push({
                                    id: subItem.id || String(flatItems.length + 1),
                                    value: subItem.value || subItem.label || subItem.text || String(subItem)
                                });
                            } else if (subItem) {
                                flatItems.push({
                                    id: String(flatItems.length + 1),
                                    value: String(subItem)
                                });
                            }
                        }
                        continue;
                    }
                } catch (_) {}
            }

            if (item && typeof item === 'object') {
                if (item.checked === false) continue;
                flatItems.push({
                    id: item.id || String(flatItems.length + 1),
                    value: item.value || item.label || item.text || String(item)
                });
            } else if (item) {
                flatItems.push({
                    id: String(flatItems.length + 1),
                    value: String(item)
                });
            }
        }

        return JSON.stringify(flatItems);
    }
}

/**
 * Handler for group node.
 * No-op visual layout helper.
 */
class GroupHandler extends NodeHandler {
    async execute(node, inputs, context) {
        return null;
    }
}

/**
 * Handler for sticky_note node.
 * Simply returns note text parameter.
 */
class StickyNoteHandler extends NodeHandler {
    async execute(node, inputs, context) {
        return node.params?.text || '';
    }
}

/**
 * Handler for output node.
 * Passes through and marks the final campaign media deliverable.
 */
class OutputHandler extends NodeHandler {
    async execute(node, inputs, context) {
        return inputs.video || inputs.image || inputs.audio || null;
    }
}

/**
 * Handler for prompt_expand node.
 * Calls promptEnhancer to expand simple instructions.
 */
class PromptExpandHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const text = inputs.text || node.params?.text || '';
        if (!text) throw new Error('Brief / Instruction text is required.');

        const targetModel = node.params?.targetModel || 'seedance-2.0';
        const styleOverride = node.params?.style || '';

        const { buildEnhanceSystemPrompt, buildEnhanceUserPrompt } = await import('./promptEnhancer.js');
        const { callAgentText } = await import('../shared/agentUtils.js');

        const systemPrompt = buildEnhanceSystemPrompt(targetModel, 'video', 0.5, '9:16', 'Generic brand');
        const userPrompt = buildEnhanceUserPrompt(text, styleOverride);

        console.log(`✨ [PromptExpandHandler] Expanding prompt via LLM...`);
        const expanded = await callAgentText(systemPrompt, userPrompt, 0.7, 2048, {
            provider: 'gemini',
            preferFast: true
        });

        return expanded.trim();
    }
}

class UpscaleHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const imageIn = inputs.image_in;
        const videoIn = inputs.video_in;

        if (!imageIn && !videoIn) {
            throw new Error('Either Image In or Video In must be connected for Upscale.');
        }

        if (videoIn) {
            throw new Error('BLOCKED: provider (no video upscale provider configured)');
        }

        const scale = node.params?.scale || '2x';
        const targetScale = scale === '2x' ? '2k' : '4k';
        console.log(`🖼️ [UpscaleHandler] Image upscale scale=${targetScale}`);
        
        const { uploadToS3 } = await import('../../utils/s3.js');
        
        let imgBuffer;
        if (imageIn.startsWith('data:image/')) {
            const base64Data = imageIn.split(',')[1];
            imgBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const resp = await fetch(imageIn, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!resp.ok) throw new Error(`Failed to fetch input image: ${resp.status}`);
            imgBuffer = Buffer.from(await resp.arrayBuffer());
        }

        if (targetScale === '2k') {
            const sharp = (await import('sharp')).default;
            const metadata = await sharp(imgBuffer).metadata();
            const targetWidth = Math.max(metadata.width * 2, 2048);
            const targetHeight = Math.max(metadata.height * 2, 2048);

            const upscaledBuffer = await sharp(imgBuffer)
                .resize(targetWidth, targetHeight, {
                    kernel: sharp.kernel.lanczos3,
                    fit: 'fill',
                })
                .png({ quality: 95, compressionLevel: 6 })
                .toBuffer();

            const cachedKey = `upscaled/node_${node.id}_${Date.now()}.png`;
            return await uploadToS3(`data:image/png;base64,${upscaledBuffer.toString('base64')}`, cachedKey, 'image/png');
        } else {
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) throw new Error('BLOCKED: provider (FAL_API_KEY not configured for 4K upscale)');

            const inputDataUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`;
            const submitResp = await fetch('https://queue.fal.run/fal-ai/esrgan', {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${falKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_url: inputDataUrl,
                    scale: 4,
                }),
            });

            if (!submitResp.ok) {
                const errText = await submitResp.text();
                throw new Error(`Fal.ai ESRGAN failed: ${submitResp.status} ${errText}`);
            }

            const submitData = await submitResp.json();
            let upscaledUrl = submitData.images?.[0]?.url || submitData.image?.url;

            if (!upscaledUrl && submitData.request_id) {
                const requestId = submitData.request_id;
                let attempts = 0;
                const maxAttempts = 30;
                while (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1000));
                    attempts++;

                    const statusResp = await fetch(`https://queue.fal.run/fal-ai/esrgan/requests/${requestId}/status`, {
                        headers: { 'Authorization': `Key ${falKey}` },
                    });
                    const statusData = await statusResp.json();

                    if (statusData.status === 'COMPLETED') {
                        const resultResp = await fetch(`https://queue.fal.run/fal-ai/esrgan/requests/${requestId}`, {
                            headers: { 'Authorization': `Key ${falKey}` },
                        });
                        const resultData = await resultResp.json();
                        upscaledUrl = resultData.image?.url || resultData.images?.[0]?.url;
                        break;
                    } else if (statusData.status === 'FAILED') {
                        throw new Error(`Fal.ai ESRGAN failed: ${JSON.stringify(statusData)}`);
                    }
                }
            }

            if (!upscaledUrl) throw new Error('Fal.ai ESRGAN timed out');
            
            const upRes = await fetch(upscaledUrl);
            const upBuf = Buffer.from(await upRes.arrayBuffer());
            const cachedKey = `upscaled/node_${node.id}_${Date.now()}.png`;
            return await uploadToS3(upBuf, cachedKey, 'image/png');
        }
    }
}

class ReframeHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const imageIn = inputs.image_in;
        const videoIn = inputs.video_in;

        if (!imageIn && !videoIn) {
            throw new Error('Either Image In or Video In must be connected for Reframe.');
        }

        if (videoIn) {
            throw new Error('BLOCKED: provider (no video reframe provider configured)');
        }

        const targetRatio = node.params?.targetRatio || '9:16';
        console.log(`🖼️ [ReframeHandler] Outpaint image to aspect ratio ${targetRatio}`);

        const falKey = process.env.FAL_API_KEY;
        if (!falKey) throw new Error('BLOCKED: provider (FAL_API_KEY not configured for outpainting)');

        const { uploadToS3 } = await import('../../utils/s3.js');

        let imgBuffer;
        if (imageIn.startsWith('data:image/')) {
            const base64Data = imageIn.split(',')[1];
            imgBuffer = Buffer.from(base64Data, 'base64');
        } else {
            const resp = await fetch(imageIn, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!resp.ok) throw new Error(`Failed to fetch input image: ${resp.status}`);
            imgBuffer = Buffer.from(await resp.arrayBuffer());
        }

        const sharp = (await import('sharp')).default;
        const metadata = await sharp(imgBuffer).metadata();
        const W = metadata.width;
        const H = metadata.height;

        let R = 9 / 16;
        if (targetRatio === '16:9') R = 16 / 9;
        else if (targetRatio === '1:1') R = 1.0;
        else if (targetRatio === '4:5') R = 4 / 5;
        else if (targetRatio === '21:9') R = 21 / 9;

        let expandLeft = 0, expandRight = 0, expandTop = 0, expandBottom = 0;
        const currentRatio = W / H;

        if (currentRatio > R) {
            const targetH = Math.round(W / R);
            const diff = targetH - H;
            expandTop = Math.round(diff / 2);
            expandBottom = diff - expandTop;
        } else if (currentRatio < R) {
            const targetW = Math.round(H * R);
            const diff = targetW - W;
            expandLeft = Math.round(diff / 2);
            expandRight = diff - expandLeft;
        }

        // Limit maximum expansion to 500px to ensure stability on Fal
        const maxExp = Math.max(expandLeft, expandRight, expandTop, expandBottom);
        if (maxExp > 500) {
            const scaleFactor = 500 / maxExp;
            const newW = Math.round(W * scaleFactor);
            const newH = Math.round(H * scaleFactor);
            imgBuffer = await sharp(imgBuffer).resize(newW, newH).toBuffer();

            expandLeft = Math.round(expandLeft * scaleFactor);
            expandRight = Math.round(expandRight * scaleFactor);
            expandTop = Math.round(expandTop * scaleFactor);
            expandBottom = Math.round(expandBottom * scaleFactor);
        }

        const inputDataUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`;
        const submitResp = await fetch('https://queue.fal.run/fal-ai/image-apps-v2/outpaint', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: inputDataUrl,
                expand_left: expandLeft,
                expand_right: expandRight,
                expand_top: expandTop,
                expand_bottom: expandBottom,
                prompt: 'Extend the background naturally to fit the frame, maintaining high quality',
                output_format: 'png'
            }),
        });

        if (!submitResp.ok) {
            const errText = await submitResp.text();
            throw new Error(`Fal outpaint failed: ${submitResp.status} ${errText}`);
        }

        const submitData = await submitResp.json();
        let reframedUrl = submitData.images?.[0]?.url || submitData.image?.url;

        if (!reframedUrl && submitData.request_id) {
            const requestId = submitData.request_id;
            let attempts = 0;
            const maxAttempts = 30;
            while (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1000));
                attempts++;

                const statusResp = await fetch(`https://queue.fal.run/fal-ai/image-apps-v2/outpaint/requests/${requestId}/status`, {
                    headers: { 'Authorization': `Key ${falKey}` },
                });
                const statusData = await statusResp.json();

                if (statusData.status === 'COMPLETED') {
                    const resultResp = await fetch(`https://queue.fal.run/fal-ai/image-apps-v2/outpaint/requests/${requestId}`, {
                        headers: { 'Authorization': `Key ${falKey}` },
                    });
                    const resultData = await resultResp.json();
                    reframedUrl = resultData.images?.[0]?.url || resultData.image?.url;
                    break;
                } else if (statusData.status === 'FAILED') {
                    throw new Error(`Fal outpaint failed: ${JSON.stringify(statusData)}`);
                }
            }
        }

        if (!reframedUrl) throw new Error('Fal outpaint timed out');

        const reRes = await fetch(reframedUrl);
        const reBuf = Buffer.from(await reRes.arrayBuffer());
        const cachedKey = `reframed/node_${node.id}_${Date.now()}.png`;
        return await uploadToS3(reBuf, cachedKey, 'image/png');
    }
}

class LipsyncHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const videoUrl = inputs.video_in;
        const audioUrl = inputs.audio;

        if (!videoUrl || !audioUrl) {
            throw new Error('Both Video In and Dialogue Audio must be connected for Lip Sync.');
        }

        const falKey = process.env.FAL_API_KEY;
        if (!falKey) throw new Error('BLOCKED: provider (FAL_API_KEY not configured for Lip Sync)');

        const { ensureS3Url } = await import('./falClient.js');
        const [s3Video, s3Audio] = await Promise.all([
            ensureS3Url(videoUrl, 'video-studio/generations'),
            ensureS3Url(audioUrl, 'video-studio/references')
        ]);

        console.log(`👄 [LipsyncHandler] Running lip sync for video and audio...`);

        const resp = await fetch('https://queue.fal.run/fal-ai/sync-lipsync/v2/pro', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                video_url: s3Video,
                audio_url: s3Audio,
                sync_mode: 'cut_off'
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Lip sync submission failed: ${resp.status} ${errText}`);
        }

        const submitData = await resp.json();
        const requestId = submitData.request_id;
        if (!requestId) throw new Error('No request_id returned for Lip Sync.');

        let attempts = 0;
        const maxAttempts = 60;
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;

            const statusResp = await fetch(`https://queue.fal.run/fal-ai/sync-lipsync/v2/pro/requests/${requestId}/status`, {
                headers: { 'Authorization': `Key ${falKey}` },
            });
            const statusData = await statusResp.json();

            if (statusData.status === 'COMPLETED') {
                const resultResp = await fetch(`https://queue.fal.run/fal-ai/sync-lipsync/v2/pro/requests/${requestId}`, {
                    headers: { 'Authorization': `Key ${falKey}` },
                });
                const resultData = await resultResp.json();
                const syncedUrl = resultData.video?.url || resultData.url;
                if (!syncedUrl) throw new Error('No synced video URL returned.');
                return syncedUrl;
            } else if (statusData.status === 'FAILED') {
                throw new Error(`Lip sync failed: ${JSON.stringify(statusData)}`);
            }
        }

        throw new Error('Lip sync timed out.');
    }
}

class FrameInterpolateHandler extends NodeHandler {
    async execute(node, inputs, context) {
        const frames = Array.isArray(inputs.frames) ? inputs.frames.flat().filter(Boolean) : [];
        if (frames.length < 2) {
            throw new Error('At least 2 keyframes are required for Frame Interpolate.');
        }

        const falKey = process.env.FAL_API_KEY;
        if (!falKey) throw new Error('BLOCKED: provider (FAL_API_KEY not configured for Frame Interpolation)');

        const { ensureS3Url } = await import('./falClient.js');
        const s3Frames = await Promise.all(frames.map(url => {
            const rawUrl = typeof url === 'object' && url ? url.url : url;
            return ensureS3Url(rawUrl, 'video-studio/references');
        }));

        console.log(`🎞️ [FrameInterpolateHandler] Interpolating ${s3Frames.length} frames...`);

        const resp = await fetch('https://queue.fal.run/fal-ai/amt-interpolation/frame-interpolation', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                frames: s3Frames.map(url => ({ url }))
            }),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Frame interpolation submission failed: ${resp.status} ${errText}`);
        }

        const submitData = await resp.json();
        const requestId = submitData.request_id;
        if (!requestId) throw new Error('No request_id returned.');

        let attempts = 0;
        const maxAttempts = 60;
        while (attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 2000));
            attempts++;

            const statusResp = await fetch(`https://queue.fal.run/fal-ai/amt-interpolation/frame-interpolation/requests/${requestId}/status`, {
                headers: { 'Authorization': `Key ${falKey}` },
            });
            const statusData = await statusResp.json();

            if (statusData.status === 'COMPLETED') {
                const resultResp = await fetch(`https://queue.fal.run/fal-ai/amt-interpolation/frame-interpolation/requests/${requestId}`, {
                    headers: { 'Authorization': `Key ${falKey}` },
                });
                const resultData = await resultResp.json();
                const videoUrl = resultData.video?.url || resultData.url;
                if (!videoUrl) throw new Error('No video URL returned.');
                return videoUrl;
            } else if (statusData.status === 'FAILED') {
                throw new Error(`Frame interpolation failed: ${JSON.stringify(statusData)}`);
            }
        }

        throw new Error('Frame interpolation timed out.');
    }
}

class BlockedProviderHandler extends NodeHandler {
    constructor(nodeType) {
        super();
        this.nodeType = nodeType;
    }
    async execute(node, inputs, context) {
        throw new Error(`BLOCKED: provider (no provider configured for ${this.nodeType})`);
    }
}

// Handler registry mapping node types to their execution backings
const handlers = {
    text_input: new TextInputHandler(),
    asset_input: new AssetInputHandler(),
    assistant: new AssistantHandler(),
    image_generate: new ImageGenerateHandler(),
    video_generate: new VideoGenerateHandler(),
    concat: new ConcatHandler(),
    video_audio_mix: new VideoAudioMixHandler(),
    voiceover: new VoiceoverHandler(),
    music_sfx: new MusicSfxHandler(),
    sound_effects: new SoundEffectsHandler(),
    list: new ListHandler(),
    group: new GroupHandler(),
    sticky_note: new StickyNoteHandler(),
    output: new OutputHandler(),
    prompt_expand: new PromptExpandHandler(),
    upscale: new UpscaleHandler(),
    reframe: new ReframeHandler(),
    lipsync: new LipsyncHandler(),
    frame_interpolate: new FrameInterpolateHandler(),
    variations: new BlockedProviderHandler('variations'),
    image_editor: new BlockedProviderHandler('image_editor'),
    image_to_3d: new BlockedProviderHandler('image_to_3d'),
    image_to_svg: new BlockedProviderHandler('image_to_svg'),
    svg_generator: new BlockedProviderHandler('svg_generator'),
    svg_animation: new BlockedProviderHandler('svg_animation'),
    video_upscaler: new BlockedProviderHandler('video_upscaler'),
    speak: new BlockedProviderHandler('speak'),
    edit_video_modify: new BlockedProviderHandler('edit_video_modify'),
    extract_frames: new BlockedProviderHandler('extract_frames'),
    sticker: new BlockedProviderHandler('sticker'),
    designer: new BlockedProviderHandler('designer'),
};

/**
 * Resolves all inputs connected to a given node based on the current graph edges.
 * Correctly handles optional/required ports and single vs multi-port edges.
 */
export function resolveNodeInputs(node, graphObj) {
    const resolved = {};
    const catalog = NODE_CATALOG[node.type];
    if (!catalog || !catalog.ports || !catalog.ports.inputs) return resolved;

    for (const port of catalog.ports.inputs) {
        // Find all edges pointing to this input port
        const edges = (graphObj.edges || []).filter(e => e.to.node === node.id && e.to.port === port.id);

        if (edges.length > 0) {
            const values = edges.map(edge => {
                const upstreamNode = (graphObj.nodes || []).find(n => n.id === edge.from.node);
                if (!upstreamNode) return null;

                // Handle specific upstream node output mappings
                if (upstreamNode.type === 'asset_input') {
                    return upstreamNode.params?.url || '';
                } else if (upstreamNode.type === 'character_ref' || upstreamNode.type === 'style_ref') {
                    return {
                        description: upstreamNode.params?.description || '',
                        urls: upstreamNode.params?.urls || []
                    };
                } else {
                    const out = upstreamNode.outputRef;
                    // Parse/flatten fanned-out JSON lists if the target port expects a list/multi
                    if ((port.type === 'asset_list' || port.multi) && typeof out === 'string' && out.startsWith('[') && out.endsWith(']')) {
                        try {
                            const parsed = JSON.parse(out);
                            if (Array.isArray(parsed)) {
                                return parsed.map(item => (item && typeof item === 'object' && 'value' in item) ? item.value : item);
                            }
                        } catch (_) {}
                    }
                    return out;
                }
            }).filter(val => val !== null && val !== undefined);

            resolved[port.id] = port.multi ? values.flat() : values[0];
        } else {
            // Fall back to node params if not connected via edges
            if (node.params && node.params[port.id] !== undefined) {
                resolved[port.id] = port.multi
                    ? (Array.isArray(node.params[port.id]) ? node.params[port.id] : [node.params[port.id]])
                    : node.params[port.id];
            } else if (port.required) {
                throw new Error(`Required input "${port.label || port.id}" on node "${node.id}" is not connected.`);
            }
        }
    }

    return resolved;
}

/**
 * Executes a set of graph nodes topological sequence in the background.
 */
export async function executeGraphAsync({ graphId, graphObj, nodesToRun, sessionId, runId, userId, broadcast }) {
    const VideoGraph = (await import('../../models/VideoGraph.js')).default;
    const { isBilledNode, getCreditEstimate } = await import('./nodeCatalog.js');
    const { deductCredits } = await import('../../middleware/credits.js');

    console.log(`🚀 [GraphExecutor] Starting execution for run ${runId}. Nodes to run:`, nodesToRun);

    try {
        for (const nodeId of nodesToRun) {
            // Load latest state from DB to check for cancellation or node state changes
            const graph = await VideoGraph.findById(graphId);
            if (!graph || graph.activeRun?.runId !== runId) {
                console.log(`🛑 [GraphExecutor] Run ${runId} cancelled or changed state. Aborting execution.`);
                break;
            }

            const node = graph.nodes.find(n => n.id === nodeId);
            if (!node || node.state === 'done' || node.state === 'cached') {
                console.log(`⏭️ [GraphExecutor] Skipping node ${nodeId} (state is ${node?.state || 'unknown'}).`);
                continue;
            }

            // Mark running
            await VideoGraph.updateOne(
                { _id: graphId, 'nodes.id': nodeId },
                { $set: { 'nodes.$.state': 'running', 'nodes.$.error': null } }
            );
            broadcast({ type: 'node_state', nodeId, state: 'running', runId });

            try {
                // Resolve inputs from latest graph state
                const latestGraphObj = graph.toObject();
                const inputs = resolveNodeInputs(node, latestGraphObj);

                // Check if fanned out
                let isFannedOut = false;
                let fanOutLength = 1;
                const fannedInputsKeys = new Set();
                const parsedFannedInputs = {};

                const catalog = NODE_CATALOG[node.type];
                if (catalog && catalog.ports && catalog.ports.inputs) {
                    for (const port of catalog.ports.inputs) {
                        if (port.type !== 'asset_list' && !port.multi) {
                            const val = inputs[port.id];
                            if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
                                try {
                                    const parsed = JSON.parse(val);
                                    if (Array.isArray(parsed)) {
                                        isFannedOut = true;
                                        if (parsed.length > fanOutLength) {
                                            fanOutLength = parsed.length;
                                        }
                                        fannedInputsKeys.add(port.id);
                                        parsedFannedInputs[port.id] = parsed;
                                    }
                                } catch (_) {}
                            }
                        }
                    }
                }

                // Spend gate check for billed nodes
                if (isBilledNode(node.type)) {
                    const factor = isFannedOut ? fanOutLength : 1;
                    const cost = getCreditEstimate(node.type) * factor;
                    console.log(`💳 [GraphExecutor] Node "${nodeId}" (${node.type}) is billed. Deducting ${cost} credits (factor ${factor}).`);
                    const deductResult = await deductCredits(userId, cost, 1, graph.brand);
                    if (!deductResult) {
                        throw new Error(`Insufficient credits. Node execution requires ${cost} credits.`);
                    }
                }

                // Execute node handler
                const handler = handlers[node.type];
                let outputRef = null;

                if (isFannedOut) {
                    // Batch execution loop
                    const crypto = await import('crypto');
                    const batchRuns = node.params?._batchRuns || [];
                    const newBatchRuns = [];

                    for (let i = 0; i < fanOutLength; i++) {
                        const resolvedInputsForIndex = { ...inputs };
                        let itemId = String(i);

                        for (const key of fannedInputsKeys) {
                            const inputItem = parsedFannedInputs[key][i];
                            if (inputItem && typeof inputItem === 'object') {
                                resolvedInputsForIndex[key] = inputItem.value;
                                if (inputItem.id) itemId = inputItem.id;
                            } else {
                                resolvedInputsForIndex[key] = inputItem;
                            }
                        }

                        // Compute input hash for cache check
                        const inputHash = crypto.createHash('sha256').update(JSON.stringify({
                            type: node.type,
                            params: { ...node.params, _batchRuns: undefined }, // exclude previous run tracking
                            inputs: resolvedInputsForIndex
                        })).digest('hex');

                        // Check cache
                        const cachedRun = batchRuns.find(r => r.id === itemId && r.inputHash === inputHash && r.state === 'done');
                        if (cachedRun) {
                            console.log(`⚡ [GraphExecutor] Batch item ${itemId} cache hit:`, cachedRun.outputRef);
                            newBatchRuns.push(cachedRun);
                            continue;
                        }

                        // Notify item running
                        broadcast({ type: 'batch_item_state', nodeId: node.id, itemId, state: 'running', runId });

                        try {
                            if (!handler) {
                                throw new Error(`No registered handler for type "${node.type}".`);
                            }
                            const itemOutput = await handler.execute(node, resolvedInputsForIndex, { userId, graphId, runId });
                            const runEntry = {
                                id: itemId,
                                inputHash,
                                state: 'done',
                                outputRef: itemOutput,
                                error: null
                            };
                            newBatchRuns.push(runEntry);

                            // Save intermediate batchRuns to DB and broadcast running node state
                            node.params = node.params || {};
                            node.params._batchRuns = newBatchRuns;
                            await VideoGraph.updateOne(
                                { _id: graphId, 'nodes.id': node.id },
                                { $set: { 'nodes.$.params._batchRuns': newBatchRuns } }
                            );
                            broadcast({ type: 'node_state', nodeId: node.id, state: 'running', runId, params: node.params });
                        } catch (itemErr) {
                            const itemErrMsg = itemErr.message || 'Item execution failed';
                            console.error(`❌ [GraphExecutor] Batch item ${itemId} failed:`, itemErrMsg);
                            const runEntry = {
                                id: itemId,
                                inputHash,
                                state: 'error',
                                outputRef: null,
                                error: itemErrMsg
                            };
                            newBatchRuns.push(runEntry);

                            node.params = node.params || {};
                            node.params._batchRuns = newBatchRuns;
                            await VideoGraph.updateOne(
                                { _id: graphId, 'nodes.id': node.id },
                                { $set: { 'nodes.$.params._batchRuns': newBatchRuns } }
                            );
                            broadcast({ type: 'node_state', nodeId: node.id, state: 'running', runId, params: node.params });
                        }
                    }

                    // Save final batchRuns to DB
                    node.params = node.params || {};
                    node.params._batchRuns = newBatchRuns;
                    await VideoGraph.updateOne(
                        { _id: graphId, 'nodes.id': node.id },
                        { $set: { 'nodes.$.params._batchRuns': newBatchRuns } }
                    );

                    // Output is fanned-out list of runs
                    const overallOutputs = newBatchRuns.map(r => ({
                        id: r.id,
                        value: r.outputRef || ''
                    }));
                    outputRef = JSON.stringify(overallOutputs);

                    const errors = newBatchRuns.filter(r => r.state === 'error');
                    if (errors.length === fanOutLength) {
                        throw new Error(`All batch items failed: ${errors.map(e => e.error).join('; ')}`);
                    }
                } else {
                    // Single execution
                    if (handler) {
                        outputRef = await handler.execute(node, inputs, { userId, graphId, runId });
                    } else {
                        console.warn(`⚠️ [GraphExecutor] No registered handler for type "${node.type}". Falling back to null.`);
                    }
                }

                // Mark node completed successfully
                await VideoGraph.updateOne(
                    { _id: graphId, 'nodes.id': nodeId },
                    { $set: { 'nodes.$.state': 'done', 'nodes.$.outputRef': outputRef, 'nodes.$.error': null } }
                );
                broadcast({ type: 'node_state', nodeId, state: 'done', outputRef, runId, params: node.params });

            } catch (nodeErr) {
                const errMsg = nodeErr.message || 'Unknown error';
                console.error(`❌ [GraphExecutor] Node ${nodeId} failed:`, nodeErr);

                // Set node state to error
                await VideoGraph.updateOne(
                    { _id: graphId, 'nodes.id': nodeId },
                    { $set: { 'nodes.$.state': 'error', 'nodes.$.error': errMsg } }
                );
                broadcast({ type: 'node_state', nodeId, state: 'error', error: errMsg, runId });

                // Halted execution — propagate error
                throw new Error(`Execution halted on node ${nodeId}: ${errMsg}`);
            }
        }

        // Mark execution complete
        await VideoGraph.updateOne(
            { _id: graphId, 'activeRun.runId': runId },
            { $set: { 'activeRun.status': 'completed' } }
        );
        broadcast({ type: 'run_complete', runId });
        console.log(`✅ [GraphExecutor] Run ${runId} completed successfully.`);

    } catch (err) {
        console.error(`❌ [GraphExecutor] Execution failed for run ${runId}:`, err.message);
        
        // Reset queued/running nodes back to idle/error state
        const graph = await VideoGraph.findById(graphId);
        if (graph && graph.activeRun?.runId === runId) {
            await VideoGraph.updateOne(
                { _id: graphId },
                { $set: { 'activeRun.status': 'failed' } }
            );
            
            // Mark remaining queued/running nodes as failed or reset
            for (const n of graph.nodes) {
                if (n.state === 'queued' || n.state === 'running') {
                    await VideoGraph.updateOne(
                        { _id: graphId, 'nodes.id': n.id },
                        { $set: { 'nodes.$.state': 'error', 'nodes.$.error': 'Execution halted due to upstream failure.' } }
                    );
                    broadcast({ type: 'node_state', nodeId: n.id, state: 'error', error: 'Execution halted due to upstream failure.', runId });
                }
            }
        }
        
        broadcast({ type: 'run_error', runId, error: err.message });
    }
}

import re

with open('backend/agents/videoStudio/falClient.js', 'r') as f:
    c = f.read()

endpoints_regex = r"const MODEL_ENDPOINTS = \{[\s\S]*?\};"
endpoints_repl = """const MODEL_ENDPOINTS = {
    'kling-3.0-o': { textToVideo: 'fal-ai/kling-video/v3/omni/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/omni/image-to-video' },
    'kling-3.0': { textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video' },
    'veo-3.1': { textToVideo: 'fal-ai/veo3', imageToVideo: 'fal-ai/veo3/image-to-video', extendVideo: 'fal-ai/veo3.1/extend-video' },
    'veo-3.1-fast': { textToVideo: 'fal-ai/veo3/fast', imageToVideo: 'fal-ai/veo3/fast/image-to-video', extendVideo: 'fal-ai/veo3.1/fast/extend-video' },
    'seedance-1.0': { textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video' },
    'seedance-2.0': { textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video' },
    'hunyuan': { textToVideo: 'fal-ai/hunyuan-video/video-to-video', imageToVideo: 'fal-ai/hunyuan-video/image-to-video' },
    'grok-imagine': { textToVideo: 'xai/grok-imagine-video/text-to-video', imageToVideo: 'xai/grok-imagine-video/image-to-video' },
};"""
c = re.sub(endpoints_regex, endpoints_repl, c)

avail_regex = r"export const MODEL_AVAILABLE = \{[\s\S]*?\};"
avail_repl = """export const MODEL_AVAILABLE = {
    'kling-3.0-o': true, 'kling-3.0': true, 'veo-3.1': true, 'veo-3.1-fast': true,
    'seedance-1.0': true, 'seedance-2.0': true, 'grok-imagine': true,
    'hunyuan': true, 'sora-2': true,
};"""
c = re.sub(avail_regex, avail_repl, c)

with open('backend/agents/videoStudio/falClient.js', 'w') as f:
    f.write(c)


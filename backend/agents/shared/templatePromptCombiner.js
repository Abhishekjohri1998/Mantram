export async function buildTemplatePrompt({ template, userPrompt, userProductImageBase64, userAvatarImageBase64 }) {
    if (!template) throw new Error('Template is required to build prompt');

    // 1. Merge saved prompt and user prompt
    let finalPrompt = template.savedPrompt || '';
    if (userPrompt && userPrompt.trim()) {
        finalPrompt = finalPrompt ? `${finalPrompt} ${userPrompt.trim()}` : userPrompt.trim();
    }

    // 2. Assemble vision inputs
    // We pass these exactly as received (HTTP URLs or Base64 data URIs).
    // The downstream routes (creatives.js, video-studio.js, etc.) are responsible
    // for uploading Base64 strings to S3 or Atlas CDN as required by their respective models.
    const visionInputs = [];
    
    if (template.systemReferenceImage) {
        visionInputs.push({
            role: 'system',
            format: template.systemReferenceImage.startsWith('data:') ? 'base64' : 'url',
            data: template.systemReferenceImage
        });
    }
    
    if (userProductImageBase64) {
        visionInputs.push({
            role: 'product',
            format: 'base64',
            data: userProductImageBase64
        });
    }
    
    if (userAvatarImageBase64) {
        visionInputs.push({
            role: 'avatar',
            format: 'base64',
            data: userAvatarImageBase64
        });
    }

    // 3. Return standardized payload for any studio pipeline
    return {
        finalPrompt,
        visionInputs,
        settings: template.defaultSettings || {}
    };
}

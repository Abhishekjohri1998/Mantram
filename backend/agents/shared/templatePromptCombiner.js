export async function buildTemplatePrompt({
    template,
    userPrompt,
    // Legacy base64-era names (backward compat)
    userProductImageBase64,
    userAvatarImageBase64,
    // Current S3 URL names (from TemplateGenerationModal)
    productImageUrl,
    avatarImageUrl,
}) {
    if (!template) throw new Error('Template is required to build prompt');

    // 1. Merge saved prompt and user prompt
    let finalPrompt = template.savedPrompt || '';
    if (userPrompt && userPrompt.trim()) {
        finalPrompt = finalPrompt ? `${finalPrompt} ${userPrompt.trim()}` : userPrompt.trim();
    }

    // 2. Resolve images — prefer URL params, fall back to legacy base64 params
    const productImage = productImageUrl || userProductImageBase64 || null;
    const avatarImage = avatarImageUrl || userAvatarImageBase64 || null;

    // Helper: detect format from data string
    const detectFormat = (data) => {
        if (!data) return 'unknown';
        if (data.startsWith('data:')) return 'base64';
        if (data.startsWith('http')) return 'url';
        return 'unknown';
    };

    // 3. Assemble vision inputs
    const visionInputs = [];

    if (template.systemReferenceImage) {
        visionInputs.push({
            role: 'system',
            format: detectFormat(template.systemReferenceImage),
            data: template.systemReferenceImage
        });
    }

    if (productImage) {
        visionInputs.push({
            role: 'product',
            format: detectFormat(productImage),
            data: productImage
        });
    }

    if (avatarImage) {
        visionInputs.push({
            role: 'avatar',
            format: detectFormat(avatarImage),
            data: avatarImage
        });
    }

    // 4. Return standardized payload for any studio pipeline
    return {
        finalPrompt,
        visionInputs,
        // Also return raw URLs for direct use by callers that bypass visionInputs
        productImageUrl: productImage,
        avatarImageUrl: avatarImage,
        settings: template.defaultSettings || {}
    };
}

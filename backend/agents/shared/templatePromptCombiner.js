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

    // 1b. Inject product-replication & avatar-preservation directives
    // These ensure the pipeline's art director, prompt engineer, and final image model
    // all understand that the uploaded references are mandatory visual constraints.
    const directives = [];
    if (productImage) {
        directives.push(
            `PRODUCT REFERENCE IMAGE PROVIDED: A real product photo has been uploaded as a reference image. ` +
            `You MUST reproduce this EXACT product in the output — same shape, same colors, same labels, same proportions. ` +
            `Do NOT substitute, reimagine, or hallucinate a different product. The product photo is the GROUND TRUTH.`
        );
    }
    if (avatarImage) {
        directives.push(
            `FACE/AVATAR REFERENCE IMAGE PROVIDED: A real person's photo has been uploaded. ` +
            `You MUST preserve this person's face, skin tone, hair, and features accurately in the output. ` +
            `Do NOT replace them with a generic model or different person.`
        );
    }
    if (directives.length > 0) {
        finalPrompt = directives.join('\n') + '\n\n' + finalPrompt;
    }

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

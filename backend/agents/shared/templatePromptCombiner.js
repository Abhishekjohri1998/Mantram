/**
 * buildTemplatePrompt — assemble the final generation payload for any studio.
 *
 * Accepts EITHER S3 URL params (new path from templates.js POST /:id/use)
 * OR the legacy base64 params for backwards compat.
 *
 * Returns:
 *  - finalPrompt   : string — merged template + user prompt
 *  - visionInputs  : array  — structured [{ role, format, data }] for video/content pipelines
 *  - refImageUrls  : array  — flat list of S3/HTTP URLs for internalGenerateCreative
 *  - settings      : object — template defaultSettings
 */
export async function buildTemplatePrompt({
    template,
    userPrompt,
    // New S3 URL params (preferred — sent from templates.js after BUG-03 fix)
    productImageUrl,
    avatarImageUrl,
    // Legacy base64 params (kept for backward compat)
    userProductImageBase64,
    userAvatarImageBase64,
}) {
    if (!template) throw new Error('Template is required to build prompt');

    // 1. Merge saved prompt and user prompt
    let finalPrompt = template.savedPrompt || '';
    if (userPrompt && userPrompt.trim()) {
        finalPrompt = finalPrompt ? `${finalPrompt} ${userPrompt.trim()}` : userPrompt.trim();
    }

    // 1b. Resolve images early so we can inject directives
    const resolvedProduct = productImageUrl || userProductImageBase64 || null;
    const resolvedAvatar = avatarImageUrl || userAvatarImageBase64 || null;

    // 1c. Inject product-replication & avatar-preservation directives
    // These ensure the pipeline's art director, prompt engineer, and final image model
    // all understand that the uploaded references are mandatory visual constraints.
    const directives = [];
    if (resolvedProduct) {
        directives.push(
            `PRODUCT REFERENCE IMAGE PROVIDED: A real product photo has been uploaded as a reference image. ` +
            `You MUST reproduce this EXACT product in the output — same shape, same colors, same labels, same proportions. ` +
            `Do NOT substitute, reimagine, or hallucinate a different product. The product photo is the GROUND TRUTH.`
        );
    }
    if (resolvedAvatar) {
        directives.push(
            `FACE/AVATAR REFERENCE IMAGE PROVIDED: A real person's photo has been uploaded. ` +
            `You MUST preserve this person's face, skin tone, hair, and features accurately in the output. ` +
            `Do NOT replace them with a generic model or different person.`
        );
    }
    if (directives.length > 0) {
        finalPrompt = directives.join('\n') + '\n\n' + finalPrompt;
    }

    // 2. Assemble vision inputs (structured — for video/content pipelines)
    const visionInputs = [];

    // System reference image from the template itself
    if (template.systemReferenceImage) {
        visionInputs.push({
            role: 'system',
            format: template.systemReferenceImage.startsWith('data:') ? 'base64' : 'url',
            data: template.systemReferenceImage
        });
    }

    // Product image — prefer S3 URL, fall back to base64
    if (resolvedProduct) {
        visionInputs.push({
            role: 'product',
            format: resolvedProduct.startsWith('data:') ? 'base64' : 'url',
            data: resolvedProduct
        });
    }

    // Avatar image — prefer S3 URL, fall back to base64
    if (resolvedAvatar) {
        visionInputs.push({
            role: 'avatar',
            format: resolvedAvatar.startsWith('data:') ? 'base64' : 'url',
            data: resolvedAvatar
        });
    }

    // 3. Build flat refImageUrls list for internalGenerateCreative
    // internalGenerateCreative uses body.refImageUrls (HTTP URLs only — base64 is handled via options.baseImage)
    const refImageUrls = visionInputs
        .map(v => v.data)
        .filter(d => d && (d.startsWith('http://') || d.startsWith('https://')));

    // 4. Return standardized payload
    return {
        finalPrompt,
        visionInputs,
        refImageUrls,
        settings: template.defaultSettings || {}
    };
}


const { VertexAI } = require('@google-cloud/vertexai');

const project = process.env.GCP_PROJECT_ID || 'mantram-vertex';
const location = process.env.GCP_LOCATION || 'us-central1';

const vertexAI = new VertexAI({ project, location });

/**
 * Shared helper for generating images (and text responses) with Vertex AI models.
 * @param {Array} parts - The array of parts (text and/or inlineData)
 * @param {string} modelId - The model to use (e.g., 'gemini-3.1-flash-image-preview')
 * @param {number} temperature - Generation temperature
 * @param {object} [imageConfig] - Optional image configuration
 * @param {string} [imageConfig.aspectRatio] - e.g. '1:1', '16:9', '9:16', '4:3', '3:4'
 * @param {string} [imageConfig.imageSize] - e.g. '1K', '2K', '4K'
 * @returns {Promise<Object>} The raw Vertex API response
 */
async function generateImageWithVertex(parts, modelId = 'gemini-3.1-flash-image-preview', temperature = 0.4, imageConfig = {}) {
    const genConfig = {
        temperature,
        responseModalities: ['TEXT', 'IMAGE'],
    };

    // Attach imageConfig for aspect ratio & resolution control
    // This tells Vertex AI the exact output dimensions instead of relying on prompt hints
    if (imageConfig && (imageConfig.aspectRatio || imageConfig.imageSize)) {
        genConfig.imageConfig = {};
        if (imageConfig.aspectRatio) genConfig.imageConfig.aspectRatio = imageConfig.aspectRatio;
        if (imageConfig.imageSize)  genConfig.imageConfig.imageSize  = imageConfig.imageSize;
    }

    const generativeModel = vertexAI.getGenerativeModel({
        model: modelId,
        generationConfig: genConfig,
    });

    const request = {
        contents: [
            {
                role: 'user',
                parts: parts
            }
        ]
    };

    // The SDK returns { response: { candidates: [...] } }
    const result = await generativeModel.generateContent(request);
    return result.response;
}

module.exports = { generateImageWithVertex };

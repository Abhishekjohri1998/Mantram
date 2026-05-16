const { VertexAI } = require('@google-cloud/vertexai');

const project = process.env.GCP_PROJECT_ID || 'mantram-vertex';
const location = process.env.GCP_LOCATION || 'us-central1';

const vertexAI = new VertexAI({ project, location });

/**
 * Shared helper for generating images (and text responses) with Vertex AI models.
 * @param {Array} parts - The array of parts (text and/or inlineData)
 * @param {string} modelId - The model to use (e.g., 'gemini-3.1-flash-image-preview')
 * @param {number} temperature - Generation temperature
 * @returns {Promise<Object>} The raw Vertex API response
 */
async function generateImageWithVertex(parts, modelId = 'gemini-3.1-flash-image-preview', temperature = 0.4) {
    const generativeModel = vertexAI.getGenerativeModel({
        model: modelId,
        generationConfig: {
            temperature,
            responseModalities: ['TEXT', 'IMAGE'],
        }
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

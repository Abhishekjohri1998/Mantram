import mongoose from 'mongoose';
import { internalGenerateCreative } from './routes/creatives.js';
import Template from './models/Template.js';
import { buildTemplatePrompt } from './agents/shared/templatePromptCombiner.js';

const MONGODB_URI = 'mongodb+srv://abhishekjohri659_db_user:19Pva6kiaIGqaTAe@cluster0.dwfqpzy.mongodb.net/da-mantram?retryWrites=true&w=majority';

async function testGeneration() {
    await mongoose.connect(MONGODB_URI);
    const template = await Template.findOne({ isActive: true, isPublished: true }).lean();
    
    // Simulate routes/templates.js POST /:id/use
    const userPrompt = "Test prompt";
    const productImageUrl = null;
    const avatarImageUrl = null;

    const promptData = await buildTemplatePrompt({
        template,
        userPrompt,
        productImageUrl,
        avatarImageUrl,
    });

    try {
        console.log("Calling internalGenerateCreative...");
        const result = await internalGenerateCreative({
            body: {
                brandId: "69e87218fe89b45c055ccd87",
                type: 'instagram-post',
                prompt: promptData.finalPrompt,
                refImageUrls: promptData.refImageUrls || [],
                options: {
                    productImageUrl: productImageUrl || null,
                    avatarImageUrl: avatarImageUrl || null,
                    templateRefImageUrl: template.systemReferenceImage?.startsWith('http') ? template.systemReferenceImage : null,
                    templateInpainting: !!template.systemReferenceImage?.startsWith('http'),
                },
                jobId: "test-job-id-12345"
            },
            user: { _id: "69a09ebf63e47fd8418cd1a6" },
            creditsDeducted: 4,
            jobId: "test-job-id-12345"
        });
        console.log("Success!", result.imageUrl);
    } catch (e) {
        console.error("Caught error:", e);
    }
    
    process.exit(0);
}

testGeneration().catch(console.error);

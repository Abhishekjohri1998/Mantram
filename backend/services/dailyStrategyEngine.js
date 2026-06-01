import mongoose from 'mongoose';
import MonthlyStrategy from '../models/MonthlyStrategy.js';
import Brand from '../models/Brand.js';
import SocialPost from '../models/SocialPost.js';
import { getTrendingTopics, getContentSuggestions } from './grokTrends.js';
import { loadBrandContext, callAgent } from '../agents/shared/agentUtils.js';
import { submitVideoGeneration } from '../agents/videoStudio/falClient.js';
import { buildEnhanceSystemPrompt, buildEnhanceUserPrompt } from '../agents/videoStudio/promptEnhancer.js';
import { s3Client, getSignedUrlForPath } from '../utils/s3.js';


export async function runDailyStrategyEngine(targetStrategyId = null, pushStepFn = null) {
    console.log(`[DailyStrategyEngine] Waking up at ${new Date().toISOString()}${targetStrategyId ? ` for strategy ${targetStrategyId}` : ''}`);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const query = {
        campaignStatus: 'active',
        endDate: { $gte: new Date() },
        $or: [
            { lastRunDate: { $lt: today } },
            { lastRunDate: { $exists: false } }
        ]
    };
    if (targetStrategyId) {
        query._id = targetStrategyId;
    }

    // Find active campaigns that haven't run today and haven't expired
    const activeStrategies = await MonthlyStrategy.find(query).populate('user brand');

    console.log(`[DailyStrategyEngine] Found ${activeStrategies.length} active campaigns to process.`);

    for (const strategy of activeStrategies) {
        try {
            console.log(`[DailyStrategyEngine] Processing brand: ${strategy.brand.name}`);
            if (pushStepFn) await pushStepFn(`Analyzing live trends for ${strategy.brand.name}...`);
            
            // 1. Fetch live trends
            const trends = await getTrendingTopics(strategy.brand.dna?.industry || 'general');
            const suggestions = await getContentSuggestions(strategy.brand, ['instagram', 'youtube']);
            
            // 2. Load Brand Context
            const { brandContext } = await loadBrandContext(strategy.brand._id);
            if (pushStepFn) await pushStepFn(`Crafting viral strategies with AI...`);
            
            // 3. Formulate prompts and hooks using Gemini 1.5 Pro
            const systemPrompt = `You are a world-class, viral social media strategist. 
Your goal is to create 3-4 brilliant, highly aesthetic, and informative posts/reels for today based on real-time trends.
These should NOT be generic brand posts. They must truly matter to the world and hijack current trends while subtly weaving in the Brand DNA.

Brand DNA:
${brandContext}

Today's Live Trends:
${JSON.stringify(trends?.trends?.slice(0, 5) || [])}
${JSON.stringify(suggestions?.suggestions?.slice(0, 3) || [])}

Instructions:
1. Create exactly 3 highly engaging posts/reels.
2. For each post, provide:
   - title: A catchy title
   - hook: The scroll-stopping first line
   - caption: The full caption with emojis and hashtags
   - format: "reel" or "post"
   - visualPrompt: A highly detailed image/video generation prompt for the AI to create the visual asset. Make it cinematic and aesthetic.
3. Return ONLY a valid JSON array of objects.`;

            const aiResponse = await callAgent(systemPrompt, 'Generate the 3 viral posts for today.', 0.7, 4000);
            
            let postsToCreate = [];
            if (aiResponse && aiResponse.error) {
                console.error(`[DailyStrategyEngine] Agent error for ${strategy.brand.name}:`, aiResponse.error);
                continue;
            } else if (Array.isArray(aiResponse)) {
                postsToCreate = aiResponse;
            } else if (aiResponse && Array.isArray(aiResponse.posts)) {
                postsToCreate = aiResponse.posts;
            } else if (aiResponse && typeof aiResponse === 'object') {
                // Heuristic: find any array inside the object
                const arrays = Object.values(aiResponse).filter(v => Array.isArray(v));
                if (arrays.length > 0 && arrays[0].length > 0) {
                    postsToCreate = arrays[0];
                } else {
                    console.error(`[DailyStrategyEngine] Unexpected AI response format for ${strategy.brand.name}. No arrays found. Raw AI Response:`, JSON.stringify(aiResponse).substring(0, 500));
                    continue;
                }
            } else {
                console.error(`[DailyStrategyEngine] Unexpected AI response format for ${strategy.brand.name}:`, typeof aiResponse, aiResponse);
                continue;
            }
            
            if (postsToCreate.length === 0) {
                 console.error(`[DailyStrategyEngine] 0 posts created for ${strategy.brand.name}. Raw AI Response:`, JSON.stringify(aiResponse).substring(0, 500));
                 continue;
            }

            if (pushStepFn) await pushStepFn(`Generated ${postsToCreate.length} ideas. Submitting to Creative Studio...`);

            // 4. Generate assets & Schedule
            for (const post of postsToCreate.slice(0, 4)) {
                console.log(`[DailyStrategyEngine] Generating asset for: ${post.title}`);
                if (pushStepFn) await pushStepFn(`Drafting asset: ${post.title}`);
                
                let assetUrl = '';
                try {
                    // For reels, use video generator. For posts, could use image generator.
                    // For simplicity, we use video generator (Seedance) for both or default to Kling.
                    const enhancedSys = buildEnhanceSystemPrompt('kling-3.0', 'shortvideo', 5, '9:16', brandContext);
                    const enhancedUsr = buildEnhanceUserPrompt(post.visualPrompt, null, 'shortvideo');
                    const enhancedState = await callAgent(enhancedSys, enhancedUsr, 0.65, 2000);
                    const finalPrompt = enhancedState?.enhancedPrompt || post.visualPrompt;

                    const genResult = await submitVideoGeneration({
                        model: 'kling-3.0',
                        prompt: finalPrompt,
                        duration: 5,
                        aspectRatio: '9:16',
                        mode: 'standard',
                        generateAudio: false
                    });
                    
                    // Note: This is an async generation (Laozhang or Fal). 
                    // To truly auto-publish, we need to wait/poll for it, or have the polling webhook do the publishing.
                    // For this architecture, we will store the falRequestId and let the standard job polling handle it,
                    // but we will mark it for 'auto-publish'.
                    
                    // Push to calendar
                    const calendarItem = {
                        date: new Date(),
                        targetStudio: post.format === 'reel' ? 'video' : 'creative',
                        status: 'in_progress', // waiting for asset
                        brief: {
                            angle: post.title,
                            captionDraft: post.caption,
                            visualDirection: post.visualPrompt,
                            hook: post.hook
                        },
                        generatedAsset: {
                            falRequestId: genResult.requestId,
                            provider: genResult.provider,
                            status: 'generating',
                            autoPublish: true // Custom flag for auto-publishing once generated
                        }
                    };
                    strategy.calendar.push(calendarItem);
                    strategy.totalPostsGenerated += 1;

                } catch (genErr) {
                    console.error(`[DailyStrategyEngine] Asset generation failed for post "${post.title}":`, genErr);
                }
            }

            strategy.lastRunDate = new Date();
            await strategy.save();
            console.log(`[DailyStrategyEngine] Finished processing ${strategy.brand.name}.`);
            
            if (targetStrategyId && postsToCreate.length === 0) {
                throw new Error("AI failed to generate viable post concepts for today. Please try again.");
            }

        } catch (err) {
            console.error(`[DailyStrategyEngine] Error processing strategy ${strategy._id}:`, err);
            if (targetStrategyId) throw err; // Re-throw if running synchronously for a specific user
        }
    }
}

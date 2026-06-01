import mongoose from 'mongoose';
import MonthlyStrategy from '../models/MonthlyStrategy.js';
import Brand from '../models/Brand.js';
import SocialPost from '../models/SocialPost.js';
import { getTrendingTopics, getContentSuggestions } from './grokTrends.js';
import { loadBrandContext, callAgent } from '../agents/shared/agentUtils.js';
import { submitVideoGeneration } from '../agents/videoStudio/falClient.js';
import { falGenerateImage } from '../agents/youtubeStudio/nodes.js';
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
                if (targetStrategyId) throw new Error("Agent error: " + aiResponse.error);
                continue;
            } else if (Array.isArray(aiResponse)) {
                postsToCreate = aiResponse;
            } else if (aiResponse && Array.isArray(aiResponse.posts)) {
                postsToCreate = aiResponse.posts;
            } else if (aiResponse && typeof aiResponse === 'object') {
                if (aiResponse.title && aiResponse.caption) {
                    // AI returned a single post object instead of an array
                    postsToCreate = [aiResponse];
                } else {
                    // Heuristic: find any array inside the object
                    const arrays = Object.values(aiResponse).filter(v => Array.isArray(v));
                    if (arrays.length > 0 && arrays[0].length > 0) {
                        postsToCreate = arrays[0];
                    } else {
                        console.error(`[DailyStrategyEngine] Unexpected AI response format for ${strategy.brand.name}. No arrays found. Raw AI Response:`, JSON.stringify(aiResponse).substring(0, 500));
                        if (targetStrategyId) throw new Error("Unexpected AI response format. No arrays found.");
                        continue;
                    }
                }
            } else {
                console.error(`[DailyStrategyEngine] Unexpected AI response format for ${strategy.brand.name}:`, typeof aiResponse, aiResponse);
                if (targetStrategyId) throw new Error("Unexpected AI response format.");
                continue;
            }
            
            if (postsToCreate.length === 0) {
                 console.error(`[DailyStrategyEngine] 0 posts created for ${strategy.brand.name}. Raw AI Response:`, JSON.stringify(aiResponse).substring(0, 500));
                 if (targetStrategyId) throw new Error("0 posts created by AI.");
                 continue;
            }

            if (pushStepFn) await pushStepFn(`Generated ${postsToCreate.length} ideas. Submitting to Creative Studio...`);

            // 4. Generate assets & Schedule
            for (const post of postsToCreate.slice(0, 4)) {
                console.log(`[DailyStrategyEngine] Generating asset for: ${post.title}`);
                if (pushStepFn) await pushStepFn(`Drafting asset: ${post.title}`);
                
                try {
                    if (post.format === 'reel') {
                        // Draft for manual video generation
                        const calendarItem = {
                            date: new Date(),
                            targetStudio: 'video',
                            status: 'draft',
                            brief: {
                                angle: post.title,
                                captionDraft: post.caption,
                                visualDirection: post.visualPrompt,
                                hook: post.hook
                            },
                            generatedAsset: {
                                falRequestId: null,
                                provider: 'none',
                                status: 'pending_user_approval',
                                autoPublish: false 
                            }
                        };
                        strategy.calendar.push(calendarItem);
                        strategy.totalPostsGenerated += 1;
                        if (pushStepFn) await pushStepFn(`Reel drafted: ${post.title}`);
                    } else {
                        // Generate image for post
                        if (pushStepFn) await pushStepFn(`Generating image for: ${post.title}`);
                        
                        const enhancedSys = buildEnhanceSystemPrompt('fal-ai', 'image', 0, '1:1', brandContext);
                        const enhancedUsr = buildEnhanceUserPrompt(post.visualPrompt, null, 'image');
                        const enhancedState = await callAgent(enhancedSys, enhancedUsr, 0.65, 2000);
                        const finalPrompt = enhancedState?.enhancedPrompt || post.visualPrompt;

                        const imageUrl = await falGenerateImage({ prompt: finalPrompt, width: 1080, height: 1080 });
                        
                        const calendarItem = {
                            date: new Date(),
                            targetStudio: 'creative',
                            status: 'draft', // user wants it in draft state first
                            brief: {
                                angle: post.title,
                                captionDraft: post.caption,
                                visualDirection: post.visualPrompt,
                                hook: post.hook
                            },
                            generatedAsset: {
                                falRequestId: null,
                                imageUrl: imageUrl,
                                provider: 'fal-ai',
                                status: 'completed',
                                autoPublish: false // user requested manual review
                            }
                        };
                        strategy.calendar.push(calendarItem);
                        strategy.totalPostsGenerated += 1;
                        if (pushStepFn) await pushStepFn(`Image generated: ${post.title}`);
                    }
                } catch (genErr) {
                    console.error(`[DailyStrategyEngine] Asset generation failed for post "${post.title}":`, genErr);
                    if (targetStrategyId) {
                        throw new Error(`Failed to generate asset: ${genErr.message}`);
                    }
                    // If running in background, just continue to next post
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

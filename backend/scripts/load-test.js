import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Override port and environment variables before loading any server code
process.env.PORT = '9999';
process.env.NODE_ENV = 'test';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
}

// ══════════════════════════════════════════════════════════════
// 1. GLOBAL NETWORK INTERCEPTOR (Prevents external API costs/limits)
// ══════════════════════════════════════════════════════════════
const originalHttpsRequest = https.request;
const originalHttpRequest = http.request;

const mockRequest = (protocol, originalRequest) => {
    return (options, callback) => {
        const hostname = options.hostname || (options.host ? options.host.split(':')[0] : '');
        const urlPath = options.path || '/';
        const method = options.method || 'GET';

        // Check if the request is targeting external third-party AI services
        const isExternalAI = hostname.includes('fal.run') || 
                             hostname.includes('atlascloud') || 
                             hostname.includes('laozhang') || 
                             hostname.includes('heygen') ||
                             hostname.includes('sarvam') ||
                             hostname.includes('minimax') ||
                             hostname.includes('openai') ||
                             hostname.includes('anthropic') ||
                             hostname.includes('perplexity') ||
                             hostname.includes('dataforseo') ||
                             hostname.includes('google');

        if (isExternalAI) {
            // Log interception
            console.log(`🔌 [Network Intercepted] ${method} ${protocol}//${hostname}${urlPath}`);

            // Return mock response stream
            const req = new EventEmitter();
            req.write = () => {};
            req.end = () => {
                const res = new EventEmitter();
                res.statusCode = 200;
                res.headers = { 'content-type': 'application/json' };

                let responseData = JSON.stringify({ success: true });

                // Custom responses based on service path or hostname
                if (hostname.includes('perplexity')) {
                    responseData = JSON.stringify({
                        choices: [{
                            message: {
                                content: "Mock Perplexity search result: High performance load testing is essential for scaling modern SaaS architectures in India."
                            }
                        }]
                    });
                } else if (hostname.includes('dataforseo')) {
                    responseData = JSON.stringify({
                        status_code: 20000,
                        tasks: [{
                            result: [{
                                items: [{
                                    keyword: "artificial intelligence",
                                    keyword_difficulty: 45,
                                    search_volume: 15000
                                }, {
                                    keyword: "load testing",
                                    keyword_difficulty: 30,
                                    search_volume: 8000
                                }]
                            }]
                        }]
                    });
                } else if (urlPath.includes('status') || urlPath.includes('task')) {
                    responseData = JSON.stringify({
                        status: 'COMPLETED',
                        video: { url: 'https://cloudfront.net/mock-video.mp4' },
                        image: { url: 'https://cloudfront.net/mock-image.png' },
                        imageUrl: 'https://cloudfront.net/mock-image.png',
                        videoUrl: 'https://cloudfront.net/mock-video.mp4',
                        s3VideoUrl: 'https://cloudfront.net/mock-video.mp4',
                        progress: 100
                    });
                } else if (urlPath.includes('tts') || urlPath.includes('preview')) {
                    responseData = JSON.stringify({
                        success: true,
                        audioUrl: 'https://cloudfront.net/mock-audio.mp3'
                    });
                } else if (urlPath.includes('assets') || urlPath.includes('library')) {
                    responseData = JSON.stringify({
                        success: true,
                        id: 'mock_asset_123',
                        atlas_asset_id: 'mock_asset_id_123',
                        status: 'Active'
                    });
                } else {
                    // Fallback create task responses
                    responseData = JSON.stringify({
                        success: true,
                        requestId: 'mock_req_12345',
                        request_id: 'mock_req_12345',
                        taskId: 'mock_task_12345',
                        task_id: 'mock_task_12345',
                        videoUrl: 'https://cloudfront.net/mock-video.mp4'
                    });
                }

                setTimeout(() => {
                    res.emit('data', Buffer.from(responseData));
                    res.emit('end');
                }, 10);

                if (callback) callback(res);
            };
            return req;
        }

        // Pass-through local DB and local server loopbacks
        return originalRequest(options, callback);
    };
};

https.request = mockRequest('https:', originalHttpsRequest);
http.request = mockRequest('http:', originalHttpRequest);

// Intercept native fetch (Node.js 18+ Undici client)
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
    let urlString = '';
    if (typeof input === 'string') {
        urlString = input;
    } else if (input && typeof input === 'object' && input.url) {
        urlString = input.url;
    }

    const isExternalAI = urlString.includes('perplexity') ||
                         urlString.includes('dataforseo') ||
                         urlString.includes('google') ||
                         urlString.includes('googleapis') ||
                         urlString.includes('fal.run') ||
                         urlString.includes('atlascloud') ||
                         urlString.includes('heygen') ||
                         urlString.includes('sarvam') ||
                         urlString.includes('minimax') ||
                         urlString.includes('openai') ||
                         urlString.includes('anthropic');

    if (isExternalAI) {
        console.log(`🔌 [Fetch Intercepted] ${init?.method || 'GET'} ${urlString}`);
        let responseData = JSON.stringify({ success: true });
        
        if (urlString.includes('perplexity')) {
            responseData = JSON.stringify({
                choices: [{
                    message: {
                        content: "Mock Perplexity search result: High performance load testing is essential for scaling modern SaaS architectures in India."
                    }
                }],
                citations: ['https://example.com/source-perplexity-1', 'https://example.com/source-perplexity-2']
            });
        } else if (urlString.includes('googleapis')) {
            responseData = JSON.stringify({
                candidates: [{
                    content: {
                        parts: [{ text: "Mock Gemini Google search grounding response for load test." }]
                    }
                }]
            });
        } else if (urlString.includes('dataforseo')) {
            responseData = JSON.stringify({
                status_code: 20000,
                tasks: [{
                    result: [{
                        items: [{
                            keyword: "artificial intelligence",
                            keyword_difficulty: 45,
                            search_volume: 15000
                        }, {
                            keyword: "load testing",
                            keyword_difficulty: 30,
                            search_volume: 8000
                        }]
                    }]
                }]
            });
        }

        return new Response(responseData, {
            status: 200,
            headers: { 'content-type': 'application/json' }
        });
    }

    return originalFetch(input, init);
};

// ══════════════════════════════════════════════════════════════
// 2. MONKEYPATCH THE LLM ROUTER SINGLETON
// ══════════════════════════════════════════════════════════════
import { getRouter } from '../ai/router.js';
const router = getRouter();

// Mock generateText method to return standard structured JSON data instantly
router.generateText = async (payload, options) => {
    const systemPrompt = payload.systemPrompt || '';
    const userPrompt = payload.userPrompt || '';
    const combined = (systemPrompt + ' ' + userPrompt).toLowerCase();

    console.log(`🤖 [Router generateText] Length: ${combined.length} | PreferFast: ${options?.preferFast || false} | Sample: "${combined.substring(0, 120).replace(/\n/g, ' ')}..."`);

    // 1. APlus content builder strategy response
    if (combined.includes('aplus') || combined.includes('a+')) {
        console.log(`🤖 [Router generateText] Matched: APlus`);
        return {
            text: JSON.stringify({
                productName: 'Platform Load Tester',
                targetAudience: 'SaaS engineers and QA managers.',
                contentStrategy: 'Highlight reliability and speed under load.',
                rufusOptimizations: ['How does it handle concurrency?', 'Does it support cleanups?'],
                modules: [
                    {
                        id: 'hero_1',
                        type: 'image_text_left',
                        headline: 'Seamless SaaS Load Testing',
                        subheadline: 'Simulate 100+ users with zero effort',
                        body: 'Run load testing with mocked AI APIs to protect credit usage and speed up validations.',
                        bullets: ['Mock interceptors', 'Cleanups included', 'No real API billing'],
                        items: [{ title: 'Speed', description: 'Under 120s executions', icon: '⚡' }],
                        rows: [{ feature: 'Speed', model1: 'Platform Load Tester', model1Value: '120s', model2: 'Competitors', model2Value: 'Hours' }],
                        hotspots: [],
                        altText: 'Mock SaaS load tester dashboard screenshot',
                        imagePrompt: 'Clean minimalist dashboard interface showcasing metric graphs and execution flow diagrams.',
                        imageStyle: 'hero-lifestyle',
                        rationale: 'Set up emotional hook and show core value proposition'
                    }
                ]
            })
        };
    }

    // 2. Brainstorm response
    if ((combined.includes('concept') || combined.includes('brainstorm')) && !combined.includes('seo') && !combined.includes('keyword') && !combined.includes('research')) {
        console.log(`🤖 [Router generateText] Matched: Brainstorm`);
        return {
            text: JSON.stringify([{
                title: 'Mock Strategic Content Idea',
                description: 'A mock content description generated for the load test.',
                style: 'cinematic',
                duration: 10,
                hook: 'This is the hook that captures interest.',
                mood: 'Energetic',
                targetPlatform: 'instagram'
            }])
        };
    }

    // 3. Script director response
    if (combined.includes('shotnum') || combined.includes('shot_num') || combined.includes('storyboard') || combined.includes('screenplay') || combined.includes('video script')) {
        console.log(`🤖 [Router generateText] Matched: Script/Shot`);
        return {
            text: JSON.stringify({
                shots: [{
                    shotNum: 1,
                    duration: 5,
                    visual: 'A professional mid-shot of the product with studio lighting.',
                    dialogue: 'Upgrade your marketing with Mantram AI today.',
                    camera: 'Slow track-in',
                    audio: 'Inspiring piano track',
                    transition: 'cut'
                }],
                totalDuration: 5,
                narrative: 'A mock story of growth and capability.'
            })
        };
    }

    // 4. Research synthesis response
    if (combined.includes('research') || combined.includes('keywords') || combined.includes('trends') || combined.includes('seo') || combined.includes('competitor')) {
        console.log(`🤖 [Router generateText] Matched: Research`);
        return {
            text: JSON.stringify({
                keywords: ['artificial intelligence', 'marketing trends', 'automation'],
                analysis: 'Research study indicates high demand for automated content creation in 2026.',
                recommendations: ['Produce short-form video', 'Optimize blog visibility']
            })
        };
    }

    // 5. Creative/Overlay copy response
    if (combined.includes('headline') || combined.includes('overlay') || combined.includes('creative')) {
        console.log(`🤖 [Router generateText] Matched: Creative`);
        return {
            text: JSON.stringify({
                headline: 'Mock Headline Title',
                subtext: 'Mock supporting descriptive text.',
                ctaText: 'Get Started Now',
                textStyle: 'Inter Bold Black',
                designRationale: 'Uses modern clean aesthetics to maximize conversion.'
            })
        };
    }

    // Default response
    console.log(`🤖 [Router generateText] Matched: Default (no condition met)`);
    return { text: 'This is a clean, structured mock response generated by the load testing suite.' };
};

// Mock generateImage method
router.generateImage = async (payload, options) => {
    return { imageUrl: 'https://cloudfront.net/mock-image.png' };
};

// ══════════════════════════════════════════════════════════════
// 3. START PLATFORM SERVER ON PORT 9999
// ══════════════════════════════════════════════════════════════
console.log('🚀 Loading application server...');
// Import the app. This runs index.js and starts listening on process.env.PORT (9999)
const serverModule = await import('../index.js');
console.log('✅ Server loaded on port 9999.');

// Import Mongoose models to use for DB manipulation & cleanup
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import Creative from '../models/Creative.js';
import Content from '../models/Content.js';
import PulseHistory from '../models/PulseHistory.js';
import BrainstormSession from '../models/BrainstormSession.js';
import ActivityLog from '../models/ActivityLog.js';
import GenerationJob from '../models/GenerationJob.js';
import Product from '../models/Product.js';

// Helper function to hit local server routes using node native fetch
async function localFetch(urlPath, method, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`http://127.0.0.1:9999/api${urlPath}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
    });

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: false, error: text };
    }
}

// ══════════════════════════════════════════════════════════════
// 4. RUN CONCURRENT MOCK USERS LOAD TEST
// ══════════════════════════════════════════════════════════════
async function runLoadTest(concurrencyCount = 100) {
    const startTime = Date.now();
    console.log(`\n🔥 Starting Concurrent Load Test with ${concurrencyCount} Mock Users...`);

    // Array to hold user objects
    const users = Array.from({ length: concurrencyCount }, (_, i) => ({
        name: `LoadUser_${i + 1}`,
        email: `loadtest_user_${i + 1}_${Date.now()}@example.com`,
        password: 'Password123'
    }));

    const progress = {
        registered: 0,
        logins: 0,
        brandCreated: 0,
        brainstormed: 0,
        researched: 0,
        contentGenerated: 0,
        creativeGenerated: 0,
        pulseGenerated: 0,
        seoAudited: 0,
        ytAnalyzed: 0,
        completed: 0,
        failed: 0
    };
    const errors = [];

    // Periodic live updates reporter
    const reporterInterval = setInterval(() => {
        console.log(`📊 [PROGRESS UPDATE] | Reg: ${progress.registered}/${concurrencyCount} | Log: ${progress.logins}/${concurrencyCount} | Brand: ${progress.brandCreated}/${concurrencyCount} | Brainstorm: ${progress.brainstormed}/${concurrencyCount} | Research: ${progress.researched}/${concurrencyCount} | Content: ${progress.contentGenerated}/${concurrencyCount} | Creative: ${progress.creativeGenerated}/${concurrencyCount} | A+: ${progress.pulseGenerated}/${concurrencyCount} | SEO: ${progress.seoAudited}/${concurrencyCount} | YouTube: ${progress.ytAnalyzed}/${concurrencyCount} | Success: ${progress.completed} | Fail: ${progress.failed}`);
    }, 1500);

    // 1. Parallel execute registrations
    console.log('👥 Registering users in parallel...');
    await Promise.all(users.map(async (u) => {
        try {
            const regRes = await localFetch('/auth/register', 'POST', u);
            if (!regRes.success) {
                throw new Error(regRes.error || JSON.stringify(regRes));
            }
            progress.registered++;
        } catch (err) {
            progress.failed++;
            errors.push({ email: u.email, step: 'Register', error: err.message });
            console.error(`❌ Register failed for ${u.email}:`, err.message);
        }
    }));

    // Direct Database Override: Set isVerified=true and credits.total=10000 directly
    console.log('🛡️ Direct Database Update: Verifying users and granting 10,000 credits...');
    const userEmails = users.map(u => u.email);
    const dbUpdate = await User.updateMany(
        { email: { $in: userEmails } },
        { $set: { isVerified: true, 'credits.total': 10000 } }
    );
    console.log(`   - Updated ${dbUpdate.modifiedCount} user records.`);

    // 2. Parallel execute logins
    console.log('👥 Logging in users in parallel...');
    const authSessions = [];
    await Promise.all(users.map(async (u) => {
        try {
            const loginRes = await localFetch('/auth/login', 'POST', { email: u.email, password: u.password });
            if (!loginRes.success) {
                throw new Error(loginRes.error || JSON.stringify(loginRes));
            }
            authSessions.push({
                email: u.email,
                token: loginRes.token,
                userId: loginRes.user?.id || loginRes.user?._id
            });
            progress.logins++;
        } catch (err) {
            progress.failed++;
            errors.push({ email: u.email, step: 'Login', error: err.message });
            console.error(`❌ Login failed for ${u.email}:`, err.message);
        }
    }));

    console.log(`✅ Successfully logged in ${authSessions.length} / ${concurrencyCount} users.`);

    if (authSessions.length === 0) {
        console.error('❌ No users successfully authenticated. Aborting.');
        clearInterval(reporterInterval);
        return;
    }

    // 3. Run Parallel Onboarding & Studio tasks (true concurrency across all users)
    console.log('\n🎭 Starting concurrent Studio workflows (excluding Video Studio)...');

    await Promise.all(authSessions.map(async (session) => {
        let currentStep = 'Onboard Brand';
        try {
            // Task A: Onboard Brand
            currentStep = 'Onboard Brand';
            const brandRes = await localFetch('/brands', 'POST', {
                name: 'Mock Load Brand',
                industry: 'Software',
                tone: 'Professional',
                description: 'A mock brand built during concurrent load testing.'
            }, session.token);

            if (!brandRes.success) throw new Error(brandRes.error || JSON.stringify(brandRes));
            const brandId = brandRes.brand._id;
            progress.brandCreated++;

            // Task B: Brainstorm Studio (Strategy Mode)
            currentStep = 'Brainstorm Studio';
            const brainstormRes = await localFetch('/brainstorm-studio/strategy-mode', 'POST', {
                mode: 'new-product-launch',
                brand: brandRes.brand,
                inputs: {
                    industryInput: 'tech SaaS',
                    goalsInput: 'increase lead conversions',
                    competitorsInput: 'competitor A'
                }
            }, session.token);
            if (!brainstormRes.success) throw new Error(brainstormRes.error || JSON.stringify(brainstormRes));
            progress.brainstormed++;

            // Task C: Research Studio (Keywords Search)
            currentStep = 'Research Studio';
            const researchRes = await localFetch('/research-studio/keywords', 'POST', {
                brand: brandRes.brand,
                brandId,
                query: 'cloud indexing efficiency'
            }, session.token);
            if (!researchRes.success) throw new Error(researchRes.error || JSON.stringify(researchRes));
            progress.researched++;

            // Task D: Content Studio (Generate Article Text)
            currentStep = 'Content Studio';
            const contentRes = await localFetch('/content/generate', 'POST', {
                brandId,
                type: 'social',
                prompt: 'Explain the benefits of mock load testing systems in SaaS.'
            }, session.token);
            if (!contentRes.success) throw new Error(contentRes.error || JSON.stringify(contentRes));
            progress.contentGenerated++;

            // Task E: Creative Studio (Generate Creative Overlay Copy)
            currentStep = 'Creative Studio';
            const creativeRes = await localFetch('/creatives/generate', 'POST', {
                brandId,
                type: 'facebook-ad',
                prompt: 'Banner layout showing concurrent mock executions.'
            }, session.token);
            if (!creativeRes.success) throw new Error(creativeRes.error || JSON.stringify(creativeRes));
            progress.creativeGenerated++;

            // Task F: Pulse Studio (APlus / Generate Mock Kit Layout)
            currentStep = 'Pulse Studio';
            const pulseRes = await localFetch('/brand-studio/aplus/generate', 'POST', {
                brandId,
                productName: 'Platform Load Tester',
                keyFeatures: 'Concurrency, Mock interceptors, cleanups',
                brief: 'Generate layout for Platform Load Tester with Concurrency, Mock interceptors, cleanups'
            }, session.token);
            if (!pulseRes.success) throw new Error(pulseRes.error || JSON.stringify(pulseRes));
            progress.pulseGenerated++;

            // Task G: SEO Studio (Health Check audit)
            currentStep = 'SEO Studio';
            const seoRes = await localFetch('/seo-studio/health-check', 'POST', {
                brandId,
                url: 'https://example.com'
            }, session.token);
            if (!seoRes.success) throw new Error(seoRes.error || JSON.stringify(seoRes));
            progress.seoAudited++;

            // Task H: YouTube Studio (Analyze channel idea)
            currentStep = 'YouTube Studio';
            const ytRes = await localFetch('/youtube-studio/analyse', 'POST', {
                brandId,
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                topic: 'How load testing scales applications'
            }, session.token);
            if (!ytRes.success) throw new Error(ytRes.error || JSON.stringify(ytRes));
            progress.ytAnalyzed++;

            progress.completed++;
        } catch (err) {
            progress.failed++;
            errors.push({ email: session.email, step: currentStep, error: err.message || JSON.stringify(err) });
            console.error(`❌ User workflow failed for ${session.email} at step [${currentStep}]:`, err.message || err);
        }
    }));

    clearInterval(reporterInterval);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🏁 Concurrency run complete. Successful user workflows: ${progress.completed} / ${authSessions.length} in ${duration}s.`);

    if (errors.length > 0) {
        console.log(`\n❌ CONCURRENT LOAD TEST ERRORS (${errors.length} total):`);
        const grouped = {};
        errors.forEach(e => {
            grouped[e.step] = grouped[e.step] || [];
            grouped[e.step].push(e.error);
        });
        for (const [step, errMsgs] of Object.entries(grouped)) {
            console.log(`   📍 Step [${step}]: ${errMsgs.length} errors`);
            const unique = [...new Set(errMsgs)];
            unique.slice(0, 5).forEach(msg => console.log(`      - ${msg}`));
            if (unique.length > 5) console.log(`      - ... and ${unique.length - 5} more unique errors`);
        }
    }
}

// ══════════════════════════════════════════════════════════════
// 5. DATABASE CLEANUP ROUTINE
// ══════════════════════════════════════════════════════════════
async function performCleanup() {
    console.log('\n🧹 Database Cleanup: Purging all generated mock load-test records...');
    
    // Find all mock users
    const mockUsers = await User.find({ email: { $regex: /^loadtest_user_/ } }).lean();
    const mockUserIds = mockUsers.map(u => u._id);

    if (mockUserIds.length === 0) {
        console.log('   - No mock load-test users found to clean up.');
        return;
    }

    console.log(`   - Found ${mockUserIds.length} mock users. Deleting dependencies...`);

    // Delete Users
    const delUsers = await User.deleteMany({ _id: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delUsers.deletedCount} User documents.`);

    // Delete Brands
    const delBrands = await Brand.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delBrands.deletedCount} Brand documents.`);

    // Delete Products
    const delProducts = await Product.deleteMany({ brand: { $exists: false } }); // clean orphan products if any
    console.log(`   🗑️ Deleted ${delProducts.deletedCount} orphan Product documents.`);

    // Delete Creatives
    const delCreatives = await Creative.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delCreatives.deletedCount} Creative documents.`);

    // Delete Content
    const delContent = await Content.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delContent.deletedCount} Content documents.`);

    // Delete Pulse Histories
    const delPulse = await PulseHistory.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delPulse.deletedCount} PulseHistory documents.`);

    // Delete Brainstorm Sessions
    const delBrainstorm = await BrainstormSession.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delBrainstorm.deletedCount} BrainstormSession documents.`);

    // Delete Activity Logs
    const delLogs = await ActivityLog.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delLogs.deletedCount} ActivityLog documents.`);

    // Delete Generation Jobs
    const delJobs = await GenerationJob.deleteMany({ user: { $in: mockUserIds } });
    console.log(`   🗑️ Deleted ${delJobs.deletedCount} GenerationJob documents.`);

    console.log('✅ Cleanup complete. Database is clean.');
}

// ══════════════════════════════════════════════════════════════
// ORCHESTRATOR ENTRY POINT
// ══════════════════════════════════════════════════════════════
async function run() {
    try {
        // Run concurrent load test with 100 mock users
        await runLoadTest(100);
    } catch (err) {
        console.error('❌ Error during load test:', err);
    } finally {
        try {
            // Perform complete cleanup
            await performCleanup();
        } catch (cleanupErr) {
            console.error('❌ Error during cleanup:', cleanupErr);
        }
        console.log('\n🔌 Shutting down server and disconnecting...');
        // Force exit to close the Express server listening on 9999
        setTimeout(() => process.exit(0), 1000);
    }
}

// Wait for a short delay to let mongoose establish connections before running workflows
setTimeout(run, 5000);

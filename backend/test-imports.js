import fs from 'fs';
import path from 'path';

const files = [
    './config/db.js',
    './config/env.js',
    './routes/auth.js',
    './routes/brands.js',
    './routes/content.js',
    './routes/creatives.js',
    './routes/admin.js',
    './routes/agents.js',
    './routes/shopify.js',
    './routes/shopifyAnalytics.js',
    './routes/social.js',
    './routes/voice.js',
    './routes/brainstorm-studio.js',
    './routes/seo-studio.js',
    './routes/google-analytics.js',
    './routes/products.js',
    './routes/trends.js',
    './routes/superadmin.js',
    './routes/conversations.js',
    './routes/contacts.js',
    './routes/webhooks.js',
    './routes/automations.js',
    './routes/routingRules.js',
    './routes/canvasAssets.js',
    './routes/agentCommand.js',
    './routes/video-studio.js',
    './routes/content-agentic.js',
    './routes/creative-agentic.js',
    './routes/orchestrator-routes.js',
    './routes/performance-marketing.js',
    './routes/pm-connections.js',
    './routes/dashboard-summary.js',
    './routes/team.js',
    './routes/fidato.js',
    './routes/nexus.js',
    './routes/intelMissions.js',
    './routes/payments.js',
    './routes/waitlist.js',
    './routes/skills.js',
    './routes/funnel-studio.js',
    './routes/funnel-automation.js',
    './routes/funnel-intelligence.js',
    './routes/funnel-webhooks.js',
    './routes/nurture-sequences.js',
    './services/autonomousAgent.js',
    './services/intelligenceAgent.js',
    './services/scheduledPostPublisher.js'
];

async function test() {
    for (const file of files) {
        console.log(`Testing ${file}...`);
        try {
            await import(file);
        } catch (e) {
            console.error(`FAIL: ${file}`);
            console.error(e);
            process.exit(1);
        }
    }
    console.log('✅ All files loaded successfully!');
}

test();

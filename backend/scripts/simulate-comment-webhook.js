/**
 * Test script to simulate a Meta comment webhook locally.
 * 
 * Usage:
 *   node scripts/simulate-comment-webhook.js [backendUrl]
 * 
 * This sends a fake comment webhook payload to your local backend
 * to verify the comment processing pipeline works end-to-end.
 * 
 * NOTE: The actual Graph API reply will only work if:
 *   1. The comment ID is real
 *   2. The page token has instagram_manage_comments permission
 *   3. The commenter is a test user of your Meta app
 */

const BACKEND_URL = process.argv[2] || 'http://localhost:5001';

// You can replace these with real IDs from your Meta app
const FAKE_PAGE_ID = process.argv[3] || 'YOUR_PAGE_ID_HERE';
const FAKE_COMMENT_ID = process.argv[4] || 'fake_comment_12345';

async function simulateCommentWebhook() {
    console.log('🧪 Simulating Meta comment webhook...');
    console.log(`   Target: ${BACKEND_URL}/api/webhooks/meta`);
    console.log(`   Page ID: ${FAKE_PAGE_ID}`);
    console.log('');

    // This is the payload structure Meta sends for comment events
    const payload = {
        object: 'instagram',
        entry: [
            {
                id: FAKE_PAGE_ID,
                time: Date.now(),
                changes: [
                    {
                        field: 'comments',
                        value: {
                            from: {
                                id: '9999999999',
                                name: 'Test Commenter',
                                username: 'test_commenter'
                            },
                            text: 'What is the price of this product? 💰',
                            comment_id: FAKE_COMMENT_ID,
                            media_id: 'fake_media_67890',
                            id: FAKE_COMMENT_ID,
                        }
                    }
                ]
            }
        ]
    };

    const bodyStr = JSON.stringify(payload);

    try {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/meta`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Note: Without valid X-Hub-Signature-256, this will only work
                // if FACEBOOK_APP_SECRET is not set (dev mode)
            },
            body: bodyStr,
        });

        console.log(`📬 Response status: ${response.status}`);
        
        if (response.status === 200) {
            console.log('✅ Webhook accepted! Check your server logs for comment processing output.');
            console.log('');
            console.log('Expected log flow:');
            console.log('  🔔 WEBHOOK RECEIVED');
            console.log('  🔔 Object type: instagram');
            console.log('  💬 Change event field: comments');
            console.log('  💬 Comment from Test Commenter: "What is the price..."');
            console.log('  💬 Comment intent: price_inquiry (XX%)');
            console.log('  💬 Attempting Graph API reply...');
            console.log('  💬 ✅ Comment auto-replied... OR');
            console.log('  💬 ❌ Comment reply FAILED...');
        } else if (response.status === 403) {
            console.log('❌ Webhook signature verification failed.');
            console.log('   This is expected if FACEBOOK_APP_SECRET is configured.');
            console.log('   For local testing, temporarily unset FACEBOOK_APP_SECRET.');
        } else if (response.status === 500) {
            console.log('❌ Server error — rawBody middleware may not be applied.');
        }
    } catch (err) {
        console.error('❌ Failed to connect:', err.message);
        console.log('   Is your backend running?');
    }
}

async function runDiagnostics() {
    console.log('');
    console.log('🔍 Running diagnostics...');
    console.log(`   ${BACKEND_URL}/api/webhooks/meta/diagnostics`);
    console.log('');

    try {
        const response = await fetch(`${BACKEND_URL}/api/webhooks/meta/diagnostics`);
        const data = await response.json();

        if (data.success) {
            const d = data.diagnostics.checks;

            // Social Accounts
            console.log(`📱 Social Accounts: ${d.socialAccounts?.total || 0} connected, ${d.socialAccounts?.withTokens || 0} with tokens`);
            (d.socialAccounts?.platforms || []).forEach(p => {
                console.log(`   ${p.hasToken ? '✅' : '❌'} ${p.platform} — ${p.name}`);
            });

            // Integrations
            console.log(`🔗 Integrations: ${d.integrations?.total || 0} connected, ${d.integrations?.withPageTokens || 0} with page tokens`);

            // Brands
            console.log(`🏷️  Brands with autonomy:`);
            (d.brands || []).forEach(b => {
                console.log(`   ${b.autonomyEnabled ? '✅' : '❌'} ${b.name} — autoReply: ${b.commentAutoReply}, commentToDM: ${b.commentToDM}`);
            });

            // Webhook Subscription
            console.log(`📡 Webhook Subscription: ${d.webhookSubscription?.status || 'unknown'}`);
            if (d.webhookSubscription?.subscriptions) {
                console.log(`   Subscribed fields:`, JSON.stringify(d.webhookSubscription.subscriptions));
            }

            // Permissions
            if (d.permissions) {
                console.log(`🔑 Permissions:`);
                console.log(`   Has instagram_manage_comments: ${d.permissions.hasCommentPermission ? '✅ YES' : '❌ NO'}`);
                if (d.permissions.missingForComments?.length > 0) {
                    console.log(`   ⚠️  Missing for comments: ${d.permissions.missingForComments.join(', ')}`);
                }
            }

            // Recent Comment Replies
            console.log(`📜 Recent Comment Replies:`);
            (d.recentCommentReplies || []).forEach(r => {
                console.log(`   ${r.apiSuccess ? '✅' : '❌'} [${r.action}] "${r.commentText}" → "${r.replyText}" (${r.createdAt})`);
            });
        } else {
            console.log('❌ Diagnostics failed:', data.error);
        }
    } catch (err) {
        console.error('❌ Failed to connect:', err.message);
    }
}

// Run both
(async () => {
    await runDiagnostics();
    console.log('\n' + '='.repeat(60) + '\n');
    await simulateCommentWebhook();
})();

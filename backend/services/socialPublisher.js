/**
 * Social Media Publisher Service
 * Handles publishing content to connected social media platforms.
 * Each platform has its own API integration.
 */

// ============================================================================
// FACEBOOK (Meta Graph API)
// ============================================================================

export async function publishToFacebook({ content, imageUrl, accessToken, pageId }) {
    const baseUrl = `https://graph.facebook.com/v19.0/${pageId}`;

    try {
        let endpoint, body;

        if (imageUrl) {
            // Photo post
            endpoint = `${baseUrl}/photos`;
            body = { url: imageUrl, caption: content, access_token: accessToken };
        } else {
            // Text post
            endpoint = `${baseUrl}/feed`;
            body = { message: content, access_token: accessToken };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (data.error) throw new Error(data.error.message);

        return { success: true, postId: data.id || data.post_id, platform: 'facebook', url: `https://facebook.com/${data.id}` };
    } catch (error) {
        return { success: false, platform: 'facebook', error: error.message };
    }
}

// ============================================================================
// INSTAGRAM (Meta Graph API — Business Accounts only)
// ============================================================================

export async function publishToInstagram({ content, imageUrl, accessToken, igBusinessId }) {
    const baseUrl = `https://graph.facebook.com/v19.0/${igBusinessId}`;

    try {
        if (!imageUrl) {
            return { success: false, platform: 'instagram', error: 'Instagram requires an image for posting' };
        }

        // Step 1: Create media container
        const containerRes = await fetch(`${baseUrl}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                caption: content,
                access_token: accessToken,
            }),
        });
        const container = await containerRes.json();
        if (container.error) throw new Error(container.error.message);

        // Step 2: Publish the container
        const publishRes = await fetch(`${baseUrl}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: container.id,
                access_token: accessToken,
            }),
        });
        const published = await publishRes.json();
        if (published.error) throw new Error(published.error.message);

        return { success: true, postId: published.id, platform: 'instagram', url: `https://instagram.com/p/${published.id}` };
    } catch (error) {
        return { success: false, platform: 'instagram', error: error.message };
    }
}

// ============================================================================
// LINKEDIN (LinkedIn API v2)
// ============================================================================

export async function publishToLinkedIn({ content, imageUrl, accessToken, personUrn }) {
    try {
        const body = {
            author: personUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: content },
                    shareMediaCategory: imageUrl ? 'IMAGE' : 'NONE',
                },
            },
            visibility: {
                'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
            },
        };

        // If image, upload first then attach
        if (imageUrl) {
            body.specificContent['com.linkedin.ugc.ShareContent'].media = [{
                status: 'READY',
                originalUrl: imageUrl,
                description: { text: content.substring(0, 200) },
            }];
        }

        const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'LinkedIn publish failed');

        return { success: true, postId: data.id, platform: 'linkedin', url: `https://linkedin.com/feed/update/${data.id}` };
    } catch (error) {
        return { success: false, platform: 'linkedin', error: error.message };
    }
}

// ============================================================================
// TWITTER / X (v2 API)
// ============================================================================

export async function publishToTwitter({ content, imageUrl, bearerToken, accessToken, accessTokenSecret, apiKey, apiKeySecret }) {
    try {
        // Twitter v2 — Create Tweet
        const body = { text: content };

        // Image upload requires v1.1 media upload endpoint (complex OAuth1.0a)
        // For now, support text-only tweets via v2
        // TODO: Add image upload via media/upload endpoint

        const response = await fetch('https://api.twitter.com/2/tweets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();
        if (data.errors) throw new Error(data.errors[0]?.message || 'Twitter publish failed');

        return {
            success: true,
            postId: data.data?.id,
            platform: 'twitter',
            url: `https://x.com/i/status/${data.data?.id}`,
        };
    } catch (error) {
        return { success: false, platform: 'twitter', error: error.message };
    }
}

// ============================================================================
// UNIFIED PUBLISHER
// ============================================================================

/**
 * Publish content to one or more platforms
 * @param {Object} params
 * @param {string} params.content - The text content to publish
 * @param {string} params.imageUrl - Optional image URL
 * @param {Array} params.platforms - Array of { platform, credentials }
 * @returns {Array<Object>} Results from each platform
 */
export async function publishToMultiplePlatforms({ content, imageUrl, platforms }) {
    const results = await Promise.allSettled(
        platforms.map(async ({ platform, credentials }) => {
            switch (platform) {
                case 'facebook':
                    return publishToFacebook({ content, imageUrl, ...credentials });
                case 'instagram':
                    return publishToInstagram({ content, imageUrl, ...credentials });
                case 'linkedin':
                    return publishToLinkedIn({ content, imageUrl, ...credentials });
                case 'twitter':
                    return publishToTwitter({ content, imageUrl, ...credentials });
                default:
                    return { success: false, platform, error: `Unknown platform: ${platform}` };
            }
        })
    );

    return results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { success: false, platform: platforms[i].platform, error: r.reason?.message || 'Unknown error' };
    });
}

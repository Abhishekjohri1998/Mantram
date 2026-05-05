/**
 * Video Hash — Deterministic MD5 hash for video generation deduplication.
 * Normalises all inputs so minor whitespace differences don't break dedup.
 */

import crypto from 'crypto';

export function buildVideoHash({ prompt, model, duration, resolution, imageUrl = '', aspectRatio = '16:9' }) {
    const normalised = JSON.stringify({
        p: (prompt || '').trim().toLowerCase().replace(/\s+/g, ' '),
        m: model || 'kling-3.0',
        d: Number(duration) || 5,
        r: resolution || '1080p',
        i: (imageUrl || '').split('?')[0],  // strip query params / pre-signed tokens
        a: aspectRatio || '16:9',
    });
    return crypto.createHash('md5').update(normalised).digest('hex');
}

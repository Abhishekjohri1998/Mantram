// In-memory cache for downloaded image buffers.
// TTL of 5 minutes (300 seconds) since pipeline runs take 1-2 mins max.
// This prevents redundant network I/O across agent steps (e.g. MCoT Vision vs Image Generation)
const imageBufferCache = new Map();
const TTL_MS = 5 * 60 * 1000;

export const getCachedImageBuffer = (url) => {
    const entry = imageBufferCache.get(url);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        imageBufferCache.delete(url);
        return null;
    }
    return entry.data;
};

export const setCachedImageBuffer = (url, buffer, mimeType) => {
    imageBufferCache.set(url, {
        data: { buffer, mimeType },
        expiry: Date.now() + TTL_MS
    });
};

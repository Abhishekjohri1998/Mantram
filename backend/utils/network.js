/**
 * Shared networking utilities.
 * Simplified for maximum compatibility across Node.js versions.
 */

/**
 * Global fetch options helper (optional usage)
 */
export const fetchOptions = (opts = {}) => ({
    ...opts,
    // Note: dispatcher/agent removed to avoid undici/http dependency issues
});

// Export a dummy agent to avoid breaking imports in other files
export const keepAliveAgent = null;

/**
 * Custom Error Classes for AI Provider Feedback
 */

export class AIProviderError extends Error {
    constructor(message, provider = 'unknown', statusCode = 500) {
        super(message);
        this.name = 'AIProviderError';
        this.provider = provider;
        this.statusCode = statusCode;
        this.isOperational = true;
        this.isProviderError = true; // Flag for frontend to show disclaimer UI
    }
}

/**
 * Thrown when an AI model is overloaded, rate-limited, or busy.
 * Maps to user-friendly "try again later" message.
 */
export class AIProviderBusyError extends AIProviderError {
    constructor(provider = 'unknown', originalMessage = '') {
        const userMessage = `The AI provider (${provider}) is currently overloaded. This is an external API issue, and not a Mantram side bug. Please try again in 5-10 mins.`;
        super(userMessage, provider, 429);
        this.name = 'AIProviderBusyError';
        this.originalMessage = originalMessage;
    }
}

/**
 * Thrown when an AI provider quota/credits are exhausted.
 */
export class AIProviderQuotaError extends AIProviderError {
    constructor(provider = 'unknown', originalMessage = '') {
        const userMessage = `The AI provider (${provider}) has hit its credit or quota limits. This is an external account/API issue, and not a Mantram side bug. Please check provider billing or try again later.`;
        super(userMessage, provider, 402);
        this.name = 'AIProviderQuotaError';
        this.originalMessage = originalMessage;
    }
}

/**
 * Thrown when an AI model is deprecated or unavailable.
 */
export class AIProviderModelError extends AIProviderError {
    constructor(provider = 'unknown', originalMessage = '') {
        const userMessage = `The AI model from ${provider} is currently unavailable or deprecated. This is an external API change, and not a Mantram side bug. We are working on a fix.`;
        super(userMessage, provider, 404);
        this.name = 'AIProviderModelError';
        this.originalMessage = originalMessage;
    }
}

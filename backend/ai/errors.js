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
    }
}

/**
 * Thrown when an AI model is overloaded, rate-limited, or busy.
 * Maps to user-friendly "try again later" message.
 */
export class AIProviderBusyError extends AIProviderError {
    constructor(provider = 'unknown', originalMessage = '') {
        const userMessage = "This model is experiencing too many requests right now. Please wait for some time or try after 5-10 mins.";
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
        const userMessage = "The AI model is currently busy or under maintenance. Please try again in 5-10 mins.";
        super(userMessage, provider, 503);
        this.name = 'AIProviderQuotaError';
        this.originalMessage = originalMessage;
    }
}

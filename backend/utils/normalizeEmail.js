/**
 * Email Normalization Utility
 * 
 * Prevents duplicate accounts via Gmail/Google tricks:
 * - Dots in Gmail are ignored: a.b.c@gmail.com = abc@gmail.com
 * - Plus addressing is stripped: user+tag@gmail.com = user@gmail.com
 * - googlemail.com is aliased to gmail.com
 * 
 * For non-Gmail providers, only plus addressing is stripped (dots ARE significant
 * on Outlook, Yahoo, ProtonMail, etc.)
 */

// Providers where dots in the local part are insignificant
const DOT_INSIGNIFICANT_DOMAINS = new Set([
    'gmail.com',
    'googlemail.com',
    'google.com',
]);

// Domain aliases (map to canonical domain)
const DOMAIN_ALIASES = {
    'googlemail.com': 'gmail.com',
};

/**
 * Normalize an email address to prevent duplicate registrations.
 * 
 * @param {string} email - Raw email input
 * @returns {string} Normalized email (lowercase, trimmed, de-duped)
 * 
 * @example
 * normalizeEmail('Abhishek.Johri.659@Gmail.com')     → 'abhishekjohri659@gmail.com'
 * normalizeEmail('abhishek.johri.659+1@gmail.com')    → 'abhishekjohri659@gmail.com'
 * normalizeEmail('user+tag@googlemail.com')           → 'user@gmail.com'
 * normalizeEmail('john.doe@outlook.com')              → 'john.doe@outlook.com'  (dots kept)
 * normalizeEmail('john.doe+promo@outlook.com')        → 'john.doe@outlook.com'  (plus stripped)
 */
export function normalizeEmail(email) {
    if (!email || typeof email !== 'string') return '';

    // Lowercase and trim
    let normalized = email.toLowerCase().trim();

    // Split into local part and domain
    const atIndex = normalized.lastIndexOf('@');
    if (atIndex === -1) return normalized;

    let localPart = normalized.slice(0, atIndex);
    let domain = normalized.slice(atIndex + 1);

    // 1. Canonicalize domain aliases (googlemail.com → gmail.com)
    if (DOMAIN_ALIASES[domain]) {
        domain = DOMAIN_ALIASES[domain];
    }

    // 2. Strip plus addressing (user+anything → user)
    // This works universally — Gmail, Outlook, ProtonMail, Yahoo all deliver +tag emails
    // but they shouldn't create separate accounts
    const plusIndex = localPart.indexOf('+');
    if (plusIndex !== -1) {
        localPart = localPart.slice(0, plusIndex);
    }

    // 3. Remove dots for providers where they're insignificant (Gmail/Google)
    if (DOT_INSIGNIFICANT_DOMAINS.has(domain)) {
        localPart = localPart.replace(/\./g, '');
    }

    return `${localPart}@${domain}`;
}

export default normalizeEmail;

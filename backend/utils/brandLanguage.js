/**
 * Brand Language Inference — Shared Utility
 *
 * Detects the correct output language for a brand by analyzing Brand DNA signals
 * across 5 layers: explicit setting, brand name, industry, audience, and region.
 *
 * Used by ALL studios to inject a mandatory LANGUAGE DIRECTIVE into AI prompts,
 * ensuring creative copy is in the brand's actual audience language.
 *
 * Usage:
 *   import { inferBrandLanguage, buildLanguageDirective } from '../utils/brandLanguage.js';
 *   const langInfo = inferBrandLanguage(brand);
 *   const directive = buildLanguageDirective(langInfo);
 *   // Prepend directive to all AI system prompts
 */

// ─────────────────────────────────────────────────────────────────────────────
// LANGUAGE SIGNAL MAPS
// Each map key is a regex pattern matched against Brand DNA fields.
// ─────────────────────────────────────────────────────────────────────────────

const NAME_SIGNALS = [
    // Hindi
    { pattern: /\b(zee|star\s*(plus|bharat|gold|utsav)|colors|sonyliv|sony\s*liv|ndtv\s*india|aaj\s*tak|india\s*tv|news18\s*india|sahara|rishtey|dainik|bhaskar|rajasthan\s*patrika|navbharat|jansatta|hindustan|zee\s*news|zee\s*cinema|&\s*tv|and\s*tv|&tv|dangal\s*tv|shemaroo|bollywood|eros\s*now|zee5|hotstar\s*specials|ullu|mn\+|Manoranjan|zee\s*anmol|starplus)\b/i, lang: 'hindi' },
    // Marathi
    { pattern: /\b(star\s*pravah|zee\s*marathi|colors\s*marathi|fakt\s*marathi|sony\s*marathi|dd\s*sahyadri|esakal|loksatta|maharashtra\s*times|sakal|mahanayak|punyanagari)\b/i, lang: 'marathi' },
    // Tamil
    { pattern: /\b(sun\s*tv|vijay\s*tv|kalaignar|colors\s*tamil|star\s*vijay|zee\s*tamil|polimer|jaya\s*tv|raj\s*tv|news18\s*tamil|dt\s*next|dinakaran|dina\s*malar|dinamani|kollywood|tamil\s*one)\b/i, lang: 'tamil' },
    // Telugu
    { pattern: /\b(star\s*maa|gemini\s*tv|etv\s*telugu|zee\s*telugu|colors\s*telugu|tv9\s*telugu|sakshi\s*tv|tollywood|eenadu|sakshi|deccan\s*chronicle\s*telugu)\b/i, lang: 'telugu' },
    // Kannada
    { pattern: /\b(star\s*suvarna|zee\s*kannada|colors\s*kannada|udaya\s*tv|kasturi\s*tv|news18\s*kannada|sandalwood|tv9\s*kannada|vijay\s*karnataka|prajavani)\b/i, lang: 'kannada' },
    // Malayalam
    { pattern: /\b(asianet|mazhavil|surya\s*tv|flowers\s*tv|reporter\s*tv|news18\s*kerala|mollywood|manorama|mathrubhumi|madhyamam|kerala\s*kaumudi)\b/i, lang: 'malayalam' },
    // Bengali
    { pattern: /\b(star\s*jalsha|zee\s*bangla|colors\s*bangla|sony\s*aath|dd\s*bangla|ananda\s*bazar|ebela|pratidin|jiyo\s*bangla|tollywood\s*bengali|hoichoi)\b/i, lang: 'bengali' },
    // Punjabi
    { pattern: /\b(ptc\s*punjabi|zee\s*punjabi|colors\s*punjabi|pb\s*news|punjabi\s*jagran|ajit\s*(news|daily)|dainik\s*jagran\s*punjab|chandigarh\s*bhaskar)\b/i, lang: 'punjabi' },
    // Gujarati
    { pattern: /\b(tv9\s*gujarati|vtv\s*gujarati|sandesh\s*news|gujarat\s*samachar|divya\s*bhaskar|saurashtra|naiduniya\s*gujarat|gujarati\s*mid.?day)\b/i, lang: 'gujarati' },
    // Odia
    { pattern: /\b(odia|odisha\s*tv|tarang|sambad|samaja|dharitri|odisha)/i, lang: 'odia' },
];

const INDUSTRY_SIGNALS = [
    { pattern: /hindi\s*(cinema|film|movie|channel|television|news|entertainment|ott|serial|drama|daily\s*soap|soap\s*opera|general\s*entertainment|gec)/i, lang: 'hindi' },
    { pattern: /marathi\s*(cinema|film|channel|entertainment|news)/i, lang: 'marathi' },
    { pattern: /tamil\s*(cinema|film|channel|entertainment|news|kollywood)/i, lang: 'tamil' },
    { pattern: /telugu\s*(cinema|film|channel|entertainment|news|tollywood)/i, lang: 'telugu' },
    { pattern: /kannada\s*(cinema|film|channel|entertainment|news|sandalwood)/i, lang: 'kannada' },
    { pattern: /malayalam\s*(cinema|film|channel|entertainment|news|mollywood)/i, lang: 'malayalam' },
    { pattern: /bengali\s*(cinema|film|channel|entertainment|news)/i, lang: 'bengali' },
    { pattern: /punjabi\s*(music|film|channel|entertainment)/i, lang: 'punjabi' },
    { pattern: /gujarati\s*(film|channel|news|entertainment)/i, lang: 'gujarati' },
];

const AUDIENCE_SIGNALS = [
    { pattern: /\b(hindi[\s-]speaking|hindi\s*belt|hindi\s*heartland|north\s*india[n]?|Hindi\s*audience|tier[\s-]2|bharat\s*audience|rural\s*india|hindi\s*viewer|hindi.*watching)\b/i, lang: 'hindi' },
    { pattern: /\b(marathi[\s-]speaking|maharashtrian|pune|mumbai\s*(local|viewer)|maratha)\b/i, lang: 'marathi' },
    { pattern: /\b(tamil[\s-]speaking|tamilnadu|chennai\s*viewer|dravidian\s*audience)\b/i, lang: 'tamil' },
    { pattern: /\b(telugu[\s-]speaking|andhra|telangana|hyderabad\s*viewer)\b/i, lang: 'telugu' },
    { pattern: /\b(kannada[\s-]speaking|bangalorean|karnataka\s*viewer)\b/i, lang: 'kannada' },
    { pattern: /\b(malayali|keralite|malayalam[\s-]speaking)\b/i, lang: 'malayalam' },
    { pattern: /\b(bengali[\s-]speaking|west\s*bengal|kolkata\s*viewer|bangladeshi)\b/i, lang: 'bengali' },
    { pattern: /\b(punjabi[\s-]speaking|sikh\s*audience|amritsar|ludhiana)\b/i, lang: 'punjabi' },
    { pattern: /\b(gujarati[\s-]speaking|gujju|ahmedabad|surat\s*audience)\b/i, lang: 'gujarati' },
];

const REGION_SIGNALS = [
    { pattern: /\b(uttar\s*pradesh|up|bihar|jharkhand|madhya\s*pradesh|mp|rajasthan|haryana|delhi|uttarakhand|himachal)\b/i, lang: 'hindi' },
    { pattern: /\b(maharashtra|pune|nagpur|nashik|aurangabad)\b/i, lang: 'marathi' },
    { pattern: /\b(tamil\s*nadu|chennai|coimbatore|madurai|trichy)\b/i, lang: 'tamil' },
    { pattern: /\b(andhra\s*pradesh|telangana|hyderabad|vijayawada|vizag|visakhapatnam)\b/i, lang: 'telugu' },
    { pattern: /\b(karnataka|bangalore|bengaluru|mysore|mangalore|hubli)\b/i, lang: 'kannada' },
    { pattern: /\b(kerala|kochi|thiruvananthapuram|calicut|kozhikode|thrissur)\b/i, lang: 'malayalam' },
    { pattern: /\b(west\s*bengal|kolkata|darjeeling|siliguri)\b/i, lang: 'bengali' },
    { pattern: /\b(punjab|chandigarh|amritsar|ludhiana|jalandhar)\b/i, lang: 'punjabi' },
    { pattern: /\b(gujarat|ahmedabad|surat|vadodara|rajkot)\b/i, lang: 'gujarati' },
];

const VOICE_SIGNALS = [
    { pattern: /\b(hinglish|hindi.*mix|desi\s*vibe|desi\s*audience|mast|yaar|baat|duniya|zara)/i, lang: 'hinglish' },
];

// Language code map for voice recognition (BCP-47)
const LANG_VOICE_CODE = {
    hindi: 'hi-IN',
    marathi: 'mr-IN',
    tamil: 'ta-IN',
    telugu: 'te-IN',
    kannada: 'kn-IN',
    malayalam: 'ml-IN',
    bengali: 'bn-IN',
    punjabi: 'pa-IN',
    gujarati: 'gu-IN',
    odia: 'or-IN',
    hinglish: 'hi-IN',
    english: 'en-US',
};

const LANG_DISPLAY = {
    hindi: 'Hindi (हिंदी)',
    marathi: 'Marathi (मराठी)',
    tamil: 'Tamil (தமிழ்)',
    telugu: 'Telugu (తెలుగు)',
    kannada: 'Kannada (ಕನ್ನಡ)',
    malayalam: 'Malayalam (മലയാളം)',
    bengali: 'Bengali (বাংলা)',
    punjabi: 'Punjabi (ਪੰਜਾਬੀ)',
    gujarati: 'Gujarati (ગુજરાતી)',
    odia: 'Odia (ଓଡ଼ିଆ)',
    hinglish: 'Hinglish (हि + EN)',
    english: 'English',
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE INFERENCE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Infer the target language for a brand's content output.
 * Returns { lang, confidence, source, voiceCode, displayName, isRegional }
 *
 * @param {Object} brand - Mongoose brand document (or .lean() result)
 * @returns {{ lang: string, confidence: string, source: string, voiceCode: string, displayName: string, isRegional: boolean }}
 */
export function inferBrandLanguage(brand) {
    if (!brand) return _english('no-brand');

    const dna = brand.dna || {};

    // ── Layer 1: Explicit setting in DNA (highest priority) ──
    if (dna.defaultLanguage && dna.defaultLanguage.toLowerCase() !== 'english') {
        const lang = dna.defaultLanguage.toLowerCase();
        return {
            lang,
            confidence: 'explicit',
            source: 'dna.defaultLanguage',
            voiceCode: LANG_VOICE_CODE[lang] || 'en-US',
            displayName: LANG_DISPLAY[lang] || lang,
            isRegional: true,
        };
    }

    // Combine all text signals for matching
    const brandName = (brand.name || '').toLowerCase();
    const industry = (dna.industry || '').toLowerCase();
    const audience = (dna.targetAudience || '').toLowerCase();
    const region = `${dna.country || ''} ${dna.region || ''}`.toLowerCase();
    const voiceDesc = `${dna.voice?.description || ''} ${dna.voice?.personality || ''}`.toLowerCase();
    const keyPhrases = (dna.voice?.keywords || []).join(' ').toLowerCase();
    const description = (dna.brandDescription || '').toLowerCase();

    const fullText = `${brandName} ${industry} ${audience} ${region} ${voiceDesc} ${keyPhrases} ${description}`;

    // ── Layer 2: Brand name signals ──
    for (const sig of NAME_SIGNALS) {
        if (sig.pattern.test(brandName)) {
            return _regional(sig.lang, 'high', 'brand-name');
        }
    }

    // ── Layer 3: Industry signals ──
    for (const sig of INDUSTRY_SIGNALS) {
        if (sig.pattern.test(industry)) {
            return _regional(sig.lang, 'high', 'industry');
        }
    }

    // ── Layer 4: Audience signals ──
    for (const sig of AUDIENCE_SIGNALS) {
        if (sig.pattern.test(audience) || sig.pattern.test(description)) {
            return _regional(sig.lang, 'medium', 'target-audience');
        }
    }

    // ── Layer 5: Region signals ──
    for (const sig of REGION_SIGNALS) {
        if (sig.pattern.test(region)) {
            return _regional(sig.lang, 'medium', 'region');
        }
    }

    // ── Layer 6: Voice / key phrase signals ──
    for (const sig of VOICE_SIGNALS) {
        if (sig.pattern.test(fullText)) {
            return _regional(sig.lang, 'low', 'voice-keywords');
        }
    }

    return _english('no-signal');
}

function _regional(lang, confidence, source) {
    return {
        lang,
        confidence,
        source,
        voiceCode: LANG_VOICE_CODE[lang] || 'hi-IN',
        displayName: LANG_DISPLAY[lang] || lang,
        isRegional: true,
    };
}

function _english(source) {
    return {
        lang: 'english',
        confidence: 'default',
        source,
        voiceCode: 'en-US',
        displayName: 'English',
        isRegional: false,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTIVE BUILDER
// Produces a mandatory system-level language instruction block
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the LANGUAGE DIRECTIVE string to prepend to system prompts.
 * Returns empty string if the brand is English-only.
 *
 * @param {{ lang: string, isRegional: boolean, displayName: string, confidence: string }} langInfo
 * @param {string} brandName - Brand name for context
 * @param {string} audience - Target audience description for style nuance
 * @returns {string}
 */
export function buildLanguageDirective(langInfo, brandName = '', audience = '') {
    if (!langInfo.isRegional) return ''; // English brands — no directive needed

    const isUrban = /urban|metro|college|youth|gen.?z|millennial|young\s*adult/i.test(audience);
    const isHindi = langInfo.lang === 'hindi';

    // Hindi urban audience → Hinglish is acceptable
    const styleNote = isHindi && isUrban
        ? `STYLE NOTE: The audience is urban and digitally savvy. Hinglish (Hindi-English mix) is natural and preferred — e.g., "Yeh toh next-level hai!" or "Apni zindagi, apni choice." Use Devanagari script for core Hindi words, Roman script for English loanwords.`
        : isHindi
        ? `STYLE NOTE: Use PURE HINDI in Devanagari script for all taglines, headlines, scripts, and dialogues. Avoid English unless it's a widely known technical term. Example: "हर पल, हर कहानी" not "Every moment, every story".`
        : `STYLE NOTE: Write entirely in ${langInfo.displayName} script. Maintain brand voice warmth and tone in the regional language.`;

    return `
════════════════════════════════════════════════════════════
🌍 LANGUAGE DIRECTIVE — MANDATORY — DO NOT IGNORE
════════════════════════════════════════════════════════════
Brand "${brandName}" serves a ${langInfo.displayName}-speaking audience.

ALL creative output MUST be in ${langInfo.displayName}:
✅ Campaign names, taglines, slogans → ${langInfo.displayName}
✅ Dialogues, voiceovers, scripts → ${langInfo.displayName}
✅ Headlines, CTA text, hashtags → ${langInfo.displayName}
✅ Social captions and post copy → ${langInfo.displayName}
✅ Blog titles and intro hooks → ${langInfo.displayName}
⚠️  Strategy rationale / technical notes → English is acceptable
⚠️  Do NOT generate English-first content then translate — write natively

${styleNote}

Language signal detected: ${langInfo.source} (confidence: ${langInfo.confidence})
════════════════════════════════════════════════════════════
`;
}

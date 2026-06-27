import { Router } from 'express';
import { getSmartRouter } from '../ai/smartRouter.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import BrandStrategy from '../models/BrandStrategy.js';
import BrainstormSession from '../models/BrainstormSession.js';
import { getRouter } from '../ai/router.js';
import { extractJSON } from '../utils/ai-parser.js';
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import { callMcpToolsParallel } from '../mcp/registry.js';

const router = Router();

// ============================================================================
// HELPERS
// ============================================================================

async function aiCall(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 4096, timeout = 600000 } = options;
  
  try {
    const aiRouter = getRouter();
    const result = await aiRouter.generateText({
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
      model: options.model,
    }, { provider: options.provider });

    return result.text;
  } catch (error) {
    console.error('Brainstorm aiCall bridge error:', error.message);
    throw error;
  }
}

function getFastModelOptions() {
  try {
    return getRouter().getFastModelOptions();
  } catch (e) {
    console.error('Error delegating getFastModelOptions:', e.message);
  }
  // Fallback: let the router figure it out (it will try native_gemini as last resort)
  return { provider: 'native_gemini', model: 'gemini-2.5-flash' };
}

function parseJSON(text) {
  return extractJSON(text);
}

// ============================================================================
// BRAND LANGUAGE INFERENCE ENGINE
// Infers the correct output language from Brand DNA signals.
// Even if `defaultLanguage` isn't set, we read industry, audience, region,
// brand name, and content style to determine the right language.
// ============================================================================

function inferBrandLanguage(brand) {
  if (!brand) return { lang: 'English', directive: '', isNonEnglish: false };

  const dna = brand.dna || {};
  const name = (brand.name || '').toLowerCase();
  const industry = (dna.industry || '').toLowerCase();
  const audience = (dna.targetAudience || '').toLowerCase();
  const region = (dna.region || '').toLowerCase();
  const desc = (dna.brandDescription || '').toLowerCase();
  const companyOverview = (dna.companyOverview || '').toLowerCase();
  const voice = (dna.voice?.description || '').toLowerCase();
  const keyPhrases = (dna.contentStyle?.keyPhrases || []).join(' ').toLowerCase();
  const country = (dna.country || 'India').toLowerCase();

  // Explicit language set in DNA
  const explicit = (dna.defaultLanguage || '').toLowerCase().trim();
  const style = (dna.languageStyle || 'pure').toLowerCase();

  // ── Language signal maps ──
  const hindiSignals = [
    'hindi', 'हिन्दी', 'zee', 'zeetv', 'star plus', 'star bharat', 'sony liv', 'colors tv', 'sab tv',
    'doordarshan', 'dd national', 'india tv', 'aaj tak', 'ndtv india', 'tv9 bharatvarsh',
    'bollywood', 'hindi cinema', 'daily soap', 'saas-bahu', 'serial', 'melodrama',
    'bharat', 'hindustani', 'desi audience', 'tier 2', 'tier 3', 'bharat audience',
    'grameen', 'rural india', 'hindi belt', 'up', 'bihar', 'rajasthan', 'mp',
    'madhya pradesh', 'uttar pradesh', 'haryana', 'jharkhand', 'chhattisgarh',
  ];

  const marathiSignals = [
    'marathi', 'star pravah', 'zee marathi', 'maharashtra', 'mumbai regional', 'pune regional',
  ];
  const tamilSignals = [
    'tamil', 'sun tv', 'vijay tv', 'zee tamil', 'kollywood', 'chennai', 'tamil Nadu', 'tamilnadu',
  ];
  const teluguSignals = [
    'telugu', 'star maa', 'zee telugu', 'tollywood', 'hyderabad regional', 'andhra', 'telangana',
  ];
  const kannadaSignals = [
    'kannada', 'star suvarna', 'zee kannada', 'sandalwood', 'karnataka regional', 'bangalore regional',
  ];
  const malayalamSignals = [
    'malayalam', 'asianet', 'mazhavil manorama', 'mollywood', 'kerala', 'thrissur',
  ];
  const bengaliSignals = [
    'bengali', 'star jalsha', 'zee bangla', 'tollywood bengali', 'kolkata regional', 'west bengal',
  ];
  const punjabiSignals = [
    'punjabi', 'punjab', 'ptc punjabi', 'chandigarh' , 'amritsar',
  ];
  const gujaratiSignals = [
    'gujarati', 'gujarat', 'tv9 gujarati', 'ahmedabad regional', 'surat regional',
  ];

  // Combine all detectable text
  const allText = [name, industry, audience, region, desc, companyOverview, voice, keyPhrases].join(' ');

  // Detect language from explicit field first, then signals
  let detectedLang = null;

  if (explicit && explicit !== 'english') {
    detectedLang = explicit;
  } else {
    if (hindiSignals.some(s => allText.includes(s))) detectedLang = 'hindi';
    else if (marathiSignals.some(s => allText.includes(s))) detectedLang = 'marathi';
    else if (tamilSignals.some(s => allText.includes(s))) detectedLang = 'tamil';
    else if (teluguSignals.some(s => allText.includes(s))) detectedLang = 'telugu';
    else if (kannadaSignals.some(s => allText.includes(s))) detectedLang = 'kannada';
    else if (malayalamSignals.some(s => allText.includes(s))) detectedLang = 'malayalam';
    else if (bengaliSignals.some(s => allText.includes(s))) detectedLang = 'bengali';
    else if (punjabiSignals.some(s => allText.includes(s))) detectedLang = 'punjabi';
    else if (gujaratiSignals.some(s => allText.includes(s))) detectedLang = 'gujarati';
  }

  // Map to readable name + script
  const LANG_MAP = {
    hindi:     { display: 'Hindi',    script: 'Devanagari', example: 'आज की रात, कुछ अलग होगा।' },
    marathi:   { display: 'Marathi',  script: 'Devanagari', example: 'एक नवीन सुरुवात.' },
    tamil:     { display: 'Tamil',    script: 'Tamil',      example: 'ஒரு புதிய தொடக்கம்.' },
    telugu:    { display: 'Telugu',   script: 'Telugu',     example: 'ఒక కొత్త ప్రారంభం.' },
    kannada:   { display: 'Kannada',  script: 'Kannada',    example: 'ಒಂದು ಹೊಸ ಆರಂಭ.' },
    malayalam: { display: 'Malayalam',script: 'Malayalam',  example: 'ഒരു പുതിയ തുടക്കം.' },
    bengali:   { display: 'Bengali',  script: 'Bengali',    example: 'একটি নতুন শুরু।' },
    punjabi:   { display: 'Punjabi',  script: 'Gurmukhi',   example: 'ਇੱਕ ਨਵੀਂ ਸ਼ੁਰੂਆਤ।' },
    gujarati:  { display: 'Gujarati', script: 'Gujarati',   example: 'એક નવી શરૂઆત.' },
  };

  if (!detectedLang) {
    return {
      lang: 'English',
      directive: '',
      isNonEnglish: false,
      reason: 'No regional signals detected — defaulting to English',
    };
  }

  const info = LANG_MAP[detectedLang] || { display: detectedLang, script: '', example: '' };

  // Determine style (pure / hinglish mixing for hindi)
  let styleNote = '';
  if (detectedLang === 'hindi') {
    if (style === 'hinglish' || audience.includes('urban') || audience.includes('metro') || audience.includes('millennial')) {
      styleNote = `Use a HINGLISH style — mix Hindi and English naturally, the way urban Indians speak. Example: "Yeh campaign tumhari life badal dega." Hindi script for dialogues, Roman/Hinglish for captions.`;
    } else {
      styleNote = `Use PURE HINDI in Devanagari script for all taglines, dialogues, and scripts. Campaign names can be in Hindi or bilingual.`;
    }
  }

  const directive = `
🌍 LANGUAGE DIRECTIVE — MANDATORY:
Brand "${brand.name}" serves a ${info.display}-speaking audience. ALL creative output MUST be in ${info.display}.
This means:
- Campaign names / taglines → ${info.display}${info.script ? ` (${info.script} script)` : ''}
- Dialogues, voiceovers, scripts → ${info.display}
- Hashtags → in ${info.display} (transliterated or in script)
- Slogans, hooks, CTA copy → ${info.display}
- Rationale / analysis (strategy text for the human user) → English is OK
${styleNote ? `\nSTYLE NOTE: ${styleNote}` : ''}

DO NOT default to English for any creative copy. English is only for meta-descriptions, strategy notes, and labels inside JSON keys.
`.trim();

  return {
    lang: info.display,
    script: info.script,
    detectedFrom: explicit ? 'explicit_setting' : 'brand_signals',
    isNonEnglish: true,
    directive,
    reason: explicit
      ? `Explicitly set to ${info.display}`
      : `Inferred from brand signals: ${allText.slice(0, 80)}…`,
  };
}



// Intent configs — advanced strategic questions with keyword suggestions
const INTENT_QUESTIONS = {
  campaign: [
    { id: 'product', q: 'What product or service is this campaign for? Describe it like you\'d explain to a stranger.', placeholder: 'e.g., Premium makhana snack brand targeting health-conscious millennials', keywords: ['Food & Beverage', 'Fashion', 'Tech / SaaS', 'Beauty & Skincare', 'Real Estate', 'Education', 'Health & Wellness', 'D2C Brand'] },
    { id: 'audience', q: 'Close your eyes and picture your IDEAL customer. Who are they? What do they do on a Sunday morning?', placeholder: 'e.g., 28-year-old working woman, scrolling Instagram over green tea, cares about clean eating', keywords: ['Gen Z Students', 'Urban Millennials', 'Working Mothers', 'Fitness Enthusiasts', 'Premium Buyers 35+', 'Budget-Conscious Families', 'Small Business Owners', 'College Youth'] },
    { id: 'objective', q: 'If this campaign could only achieve ONE thing, what would it be?', placeholder: 'e.g., Get 500 first-time buyers in 30 days', keywords: ['Brand Awareness', 'First Purchase', 'Repeat Purchases', 'App Downloads', 'Store Footfall', 'Social Following', 'Lead Generation', 'Category Authority'] },
    { id: 'emotion', q: 'When someone sees your campaign, what should they FEEL in the first 3 seconds?', placeholder: 'e.g., "I need this in my life" — aspiration mixed with urgency', keywords: ['FOMO / Urgency', 'Aspiration', 'Trust / Safety', 'Joy / Fun', 'Nostalgia', 'Confidence', 'Curiosity', 'Pride / Identity', 'Rebellion'] },
    { id: 'differentiator', q: 'What is the ONE thing your competitors can\'t say but you can?', placeholder: 'e.g., Only brand using single-origin ingredients with full traceability', keywords: ['Price Advantage', 'Quality / Ingredients', 'Heritage / Story', 'Technology', 'Community / Values', 'Celebrity Backing', 'Speed / Convenience', 'Indian Origin'] },
    { id: 'budget', q: 'What\'s your realistic budget and timeline?', placeholder: 'e.g., ₹2L budget, need to launch within 3 weeks', keywords: ['Under ₹50K', '₹50K–2L', '₹2L–5L', '₹5L–10L', '₹10L+', '1 Week', '2–4 Weeks', '1–3 Months'], optional: true },
  ],
  'ad-film': [
    { id: 'brand', q: 'Tell me about the brand this film is for. What does the brand stand for — beyond just its products?', placeholder: 'e.g., A heritage spice brand that represents the warmth of Indian kitchens and grandmother\'s recipes', keywords: ['Heritage Brand', 'New-Age D2C', 'Luxury / Premium', 'Mass Market', 'Social Enterprise', 'Tech Startup', 'FMCG', 'Personal Care'] },
    { id: 'filmType', q: 'What kind of film are we making? Something that sells, or something that moves people?', placeholder: 'e.g., A brand anthem film that makes people feel proud of their roots', keywords: ['Brand Anthem', 'Product Demo Film', 'Emotional Story Ad', 'Testimonial Film', 'Manifesto Film', 'Comedy / Slice of Life', 'Festival Special', 'Launch Film', 'Social Experiment'] },
    { id: 'audience', q: 'Who needs to be MOVED by this film? Not just demographics — what\'s their emotional state right now?', placeholder: 'e.g., Young Indians who feel torn between modernity and tradition, looking for brands that embrace both', keywords: ['Aspirational Youth', 'Parents / Families', 'Working Women', 'Rural India', 'Urban Hustlers', 'Premium Consumers', 'First-Time Buyers', 'Brand Loyalists'] },
    { id: 'emotion', q: 'Imagine the film just ended. Your viewer has tears, goosebumps, or a smile. Which one? What emotion drives action?', placeholder: 'e.g., Goosebumps — pride in being Indian, then urgency to try the product', keywords: ['Goosebumps / Pride', 'Tears / Empathy', 'Warm Smile', 'Laughter', 'Shock / Surprise', 'Inspiration', 'Nostalgia', 'Confidence / Power'] },
    { id: 'reference', q: 'Name a film, ad, or scene that has the FEELING you want. Doesn\'t have to be from your industry.', placeholder: 'e.g., The Google "Reunion" ad (India-Pakistan), or Titan "Why Should Boys Have All The Fun"', keywords: ['Google Reunion', 'Cadbury Dance', 'Titan Raga', 'Nike Just Do It', 'Apple Think Different', 'Amul Topicals Style', 'Dove Real Beauty', 'Paper Boat Nostalgia'], optional: true },
    { id: 'duration', q: 'How long should this film be? Shorter isn\'t always better — what\'s the story need?', placeholder: 'e.g., 90 seconds for YouTube, with a 30-second cutdown for TV', keywords: ['15s Social Ad', '30s TV Spot', '60s Digital', '90s Brand Film', '2–3 Min Short Film', '5 Min+ Documentary Style'] },
    { id: 'scriptCount', q: 'How many script options do you need? More options give you variety to choose from.', placeholder: 'e.g., 3 different film concepts to compare', keywords: ['2 Options', '3 Options', '4 Options', '5 Options'] },
    { id: 'budget', q: 'Production scale? This shapes whether we think guerrilla or cinematic.', placeholder: 'e.g., Mid-budget, can afford 1-2 actors and good cinematography, no VFX', keywords: ['Guerrilla / iPhone', 'Low Budget (₹1–3L)', 'Mid Budget (₹3–10L)', 'High Budget (₹10–30L)', 'Premium (₹30L+)', 'Animation / Motion Graphics'], optional: true },
  ],
  festival: [
    { id: 'festival', q: 'Which festival? And more importantly — what does this festival REALLY mean to your audience? Not the textbook answer.', placeholder: 'e.g., Diwali — but for our audience it\'s about showing off to relatives, not just lights & prayers', keywords: ['Diwali', 'Holi', 'Navratri / Garba', 'Christmas', 'Eid', 'Independence Day', 'Women\'s Day', 'Raksha Bandhan', 'Valentine\'s Day', 'New Year', 'Makar Sankranti', 'Pongal'] },
    { id: 'product', q: 'What\'s your product, and why should people think of it during this festival?', placeholder: 'e.g., Dry fruit brand — perfect for gifting season, replacing traditional mithai', keywords: ['Gifting Product', 'Fashion / Clothing', 'Food & Sweets', 'Electronics', 'Home Decor', 'Beauty / Grooming', 'Jewelry', 'Travel', 'Fitness'] },
    { id: 'vibe', q: 'Every festival has 10 different vibes. Which one is YOUR brand\'s version?', placeholder: 'e.g., Modern Diwali — rooftop party with sparklers, not traditional puja setup', keywords: ['Traditional & Warm', 'Modern & Trendy', 'Youth Energy / Party', 'Luxury Gifting', 'Family & Nostalgia', 'Quirky & Fun', 'Minimalist & Classy', 'Devotional / Spiritual', 'Bold & Rebellious'] },
    { id: 'objective', q: 'What should happen AFTER someone sees your festival content? Be specific.', placeholder: 'e.g., Visit our website and buy a Diwali gift box within 48 hours', keywords: ['Buy Now / Shop', 'Send to a Friend', 'Visit Store', 'Use a Promo Code', 'Enter a Contest', 'Share on Stories', 'Book / Reserve', 'Download App'] },
    { id: 'offer', q: 'What\'s the hook? People expect deals during festivals. What\'s your unfair advantage?', placeholder: 'e.g., Buy 2 get 1 free + free gift wrapping + same-day delivery', keywords: ['Flat % Off', 'Buy 1 Get 1', 'Free Gift', 'Limited Edition', 'Early Access', 'Bundle Deal', 'Cashback', 'No Offer — Brand Film Only'], optional: true },
  ],
  'product-launch': [
    { id: 'product', q: 'Describe what you\'re launching as if you have only 10 seconds in an elevator with an investor.', placeholder: 'e.g., India\'s first protein makhana — gym snack that tastes like home food, not cardboard', keywords: ['Physical Product', 'Digital Product / App', 'Service', 'Collection / Range', 'New Flavor / Variant', 'Premium Upgrade', 'Subscription', 'Experience / Event'] },
    { id: 'audience', q: 'Who is the FIRST person who\'ll buy this? Not your dream audience — your DAY ONE buyer.', placeholder: 'e.g., Fitness-obsessed men 22-30 who already buy protein bars but hate the taste', keywords: ['Early Adopters', 'Loyal Existing Customers', 'Aspirational Youth', 'Health-Conscious', 'Deal Seekers', 'Status Seekers', 'Trend Followers', 'Problem Sufferers'] },
    { id: 'usp', q: 'If a customer compares you with 3 alternatives side-by-side, what makes them pick YOU?', placeholder: 'e.g., 40% more protein than competitors at the same price, made with real Indian spices', keywords: ['Price', 'Quality', 'Innovation / First-of-kind', 'Design / Aesthetic', 'Values / Ethics', 'Speed / Convenience', 'Taste / Experience', 'Trust / Heritage'] },
    { id: 'emotion', q: 'What\'s the REACTION you want on unboxing? Not satisfaction — what specific moment?', placeholder: 'e.g., "Whoa, this packaging is premium" — they photograph it before even opening', keywords: ['Surprise / Delight', 'Premium Feel', 'Instagram Moment', 'Curiosity', 'Nostalgia', 'FOMO from Friends', 'Confidence Boost', 'Relief / Problem Solved'] },
    { id: 'challenge', q: 'What\'s the BIGGEST reason someone would NOT buy this? Be honest.', placeholder: 'e.g., "I already have a protein snack I like" or "I don\'t trust new food brands"', keywords: ['Price Concern', 'Trust / New Brand', 'Already Using Competitor', 'Don\'t See the Need', 'Availability', 'Taste / Quality Doubt', 'Not Aware It Exists'] },
    { id: 'timeline', q: 'When does this need to hit the market? What event or moment are you anchoring to?', placeholder: 'e.g., 2 weeks before Navratri — perfect for "healthy fasting snack" positioning', keywords: ['This Week', '2–4 Weeks', 'Next Festival', 'Next Month', 'Next Quarter', 'No Rush — Get It Right'] },
  ],
  naming: [
    { id: 'type', q: 'What exactly needs a name? And will this name live on packaging, an app icon, or spoken in conversation?', placeholder: 'e.g., A new skincare sub-brand that\'ll live on Instagram and premium store shelves', keywords: ['Product Name', 'Brand Name', 'Sub-Brand', 'Collection Name', 'App Name', 'Campaign Name', 'Event Name', 'Service Name'] },
    { id: 'category', q: 'What category is this in? And more importantly — what does YOUR version of this category look like?', placeholder: 'e.g., Skincare, but the ayurvedic-meets-minimal kind, not the clinical derma kind', keywords: ['Beauty / Skincare', 'Food & Beverage', 'Fashion', 'Tech / Apps', 'Wellness / Fitness', 'Home & Living', 'Kids / Baby', 'Finance', 'Education'] },
    { id: 'personality', q: 'If this brand/product were a person at a party, how would they introduce themselves?', placeholder: 'e.g., "Hey, I\'m that friend who knows all the ancient recipes but serves them on minimalist ceramic plates"', keywords: ['The Cool Rebel', 'The Wise Elder', 'The Friendly Expert', 'The Luxury Host', 'The Energetic Kid', 'The Thoughtful Artist', 'The Bold Leader', 'The Caring Mother'] },
    { id: 'avoid', q: 'What kind of names should we AVOID? What doesn\'t feel right?', placeholder: 'e.g., Nothing too Sanskrit-heavy, no puns, nothing that sounds like a medicine', keywords: ['No Puns', 'No Sanskrit', 'No English-Only', 'No Long Names', 'No Generic Names', 'No Trendy Names', 'No Similar to Competitor'] },
    { id: 'language', q: 'What languages or cultural territories feel right? Should the name travel globally or stay rooted?', placeholder: 'e.g., Hinglish or modern Hindi — should sound cool in conversation but have Indian roots', keywords: ['Pure English', 'Hindi / Sanskrit', 'Hinglish Fusion', 'Regional Language', 'Global / Abstract', 'Japanese-Minimal', 'Latin / Greek Root', 'Made-Up Word'] },
    { id: 'tone', q: 'Pick 3 words that describe the VIBE this name should carry.', placeholder: 'e.g., Warm, Premium, Rooted', keywords: ['Premium', 'Playful', 'Bold', 'Warm', 'Minimal', 'Rooted', 'Futuristic', 'Earthy', 'Luxurious', 'Rebellious', 'Trustworthy', 'Youthful'] },
  ],
  offer: [
    { id: 'product', q: 'What are you selling, and what\'s the average ticket size your customer is used to paying?', placeholder: 'e.g., Handmade leather bags, avg ₹3500, customers compare with ₹1500 alternatives on Amazon', keywords: ['Under ₹500', '₹500–2K', '₹2K–5K', '₹5K–15K', '₹15K+', 'Subscription', 'Service / Hourly', 'SaaS / Monthly'] },
    { id: 'goal', q: 'Be brutally honest — why do you need this offer? What business problem are you solving?', placeholder: 'e.g., 200 units of old stock sitting in warehouse, need to clear before monsoon damages them', keywords: ['Clear Old Stock', 'Acquire New Customers', 'Beat Competitor Sale', 'Increase Average Order', 'Win Back Lapsed Buyers', 'Festive Revenue Boost', 'Launch Buzz', 'Build Email List'] },
    { id: 'psychology', q: 'What makes your customer finally click "Buy"? Price? Scarcity? Social proof? Guilt?', placeholder: 'e.g., They buy when friends recommend + there\'s a visible discount, they hate FOMO', keywords: ['Price Drop', 'Scarcity / Limited', 'Social Proof', 'Free Shipping', 'Risk Reversal / Guarantee', 'Exclusivity', 'Bundle Value', 'Emotional Trigger', 'Peer Pressure'] },
    { id: 'constraints', q: 'What CAN\'T you do? Every business has limits — what\'s yours?', placeholder: 'e.g., Can\'t go below 30% margin, no free shipping over 500gm, only on our website', keywords: ['Minimum Margin %', 'No Free Shipping', 'Online Only', 'Offline Only', 'Limited Stock', 'No Returns', 'Only Specific Products', 'Time-Limited'] },
    { id: 'reference', q: 'Any offer from ANY brand that made YOU pull out your wallet? What made it irresistible?', placeholder: 'e.g., Zomato\'s ₹1 order made me download the app — felt like stealing', keywords: ['Zomato ₹1 Deal', 'Amazon Lightning', 'Flipkart BBD', 'Nykaa Pink Friday', 'Swiggy Instamart', 'CRED Cashback', 'Apple Trade-In'], optional: true },
  ],
  positioning: [
    { id: 'brand', q: 'Describe your brand in ONE sentence — but make it interesting. Not the mission statement, the REAL story.', placeholder: 'e.g., We make the kind of skincare your dermatologist grandmother would approve of, at prices your wallet won\'t cry about', keywords: ['Challenger Brand', 'Market Leader', 'Niche Specialist', 'Heritage Brand', 'New Entrant', 'Premium Disruptor', 'Value Player', 'Purpose-Driven'] },
    { id: 'competitors', q: 'Who are you REALLY competing with? Not just direct competitors — what else does your customer spend that money on?', placeholder: 'e.g., Direct: Mamaearth, mCaffeine. But really competing with salon visits and DIY home remedies', keywords: ['Direct Competitor', 'Indirect Alternative', 'DIY / Homemade', 'Status Quo (Doing Nothing)', 'Premium Players', 'Budget Alternatives', 'International Brands'] },
    { id: 'truth', q: 'What\'s a truth about your brand that you\'re proud of but haven\'t shouted about enough?', placeholder: 'e.g., Our founder rejected 47 formulations before approving the first product — that obsession is real', keywords: ['Founder Story', 'Ingredient Sourcing', 'Manufacturing Process', 'Community Impact', 'Customer Love', 'Award / Recognition', 'Research Depth', 'Cultural Roots'] },
    { id: 'perception', q: 'Complete this: "People should choose us because we\'re the only ones who ___"', placeholder: 'e.g., ...combine Ayurvedic wisdom with clinical testing at a D2C price point', keywords: ['Only Indian Brand That…', 'Most Affordable…', 'Most Premium…', 'First To…', 'Most Trusted…', 'Most Innovative…', 'Most Transparent…'] },
    { id: 'enemy', q: 'Every great brand has an enemy — not a competitor, but a PROBLEM or BELIEF they fight against. What\'s yours?', placeholder: 'e.g., We fight the belief that "Indian products can\'t be world-class luxury"', keywords: ['Overpricing', 'Misinformation', 'Mediocrity', 'Gatekeeping', 'Chemical Overload', 'Complexity', 'Waste / Excess', 'Boring Status Quo'] },
  ],
  'trend-hijack': [
    { id: 'brand', q: 'What\'s your brand, and how far are you willing to go? Some brands play it safe, some go viral-or-die.', placeholder: 'e.g., Streetwear brand, we\'re known for controversial takes — nothing is off-limits except politics', keywords: ['Play It Safe', 'Witty & Smart', 'Bold & Edgy', 'Wholesome & Fun', 'Sarcastic / Savage', 'Meme-Heavy', 'Cultural Commentary', 'Full Degen Mode'] },
    { id: 'audience', q: 'Whose feed are you trying to land on? What do they laugh at, share, and screenshot?', placeholder: 'e.g., 18-24 meme-literate Instagram users who share everything on stories and group chats', keywords: ['Instagram Reels Crowd', 'Twitter/X Intellectuals', 'LinkedIn Pros', 'YouTube Viewers', 'Reddit / Niche Communities', 'WhatsApp Forward Uncles', 'Meme Pages Followers'] },
    { id: 'speed', q: 'How fast can your team move? Trend hijacking is a 4-hour game, not a 4-day game.', placeholder: 'e.g., I can design and post within 2 hours myself, no approval chain', keywords: ['< 2 Hours', 'Same Day', 'Next Day', '2–3 Days', 'Need Approval Chain', 'Have Templates Ready'] },
    { id: 'tone', q: 'Show me 2-3 brands whose social media you WISH was yours. What do they do that you love?', placeholder: 'e.g., Zomato\'s Twitter wit, Durex\'s boldness, Amul\'s topical genius', keywords: ['Zomato Style', 'Swiggy Humor', 'Amul Topicals', 'Durex Bold', 'Netflix Sass', 'Fevicol Iconic', 'boAt Youth Energy', 'Paper Boat Nostalgia'] },
    { id: 'boundaries', q: 'Any topics or angles that are absolutely OFF-LIMITS for your brand?', placeholder: 'e.g., No politics, no religion, no body-shaming — dark humor on everything else is fine', keywords: ['No Politics', 'No Religion', 'No Controversy', 'No Dark Humor', 'No Competitor Bashing', 'No Profanity', 'Everything Goes'], optional: true },
  ],
  custom: [
    { id: 'brief', q: 'Describe what\'s on your mind. Don\'t filter — think out loud. The messier the brief, the more real the output.', placeholder: 'e.g., Our 5th anniversary is coming up and I want to do something that makes our customers feel like they built this brand with us, not just bought from us', keywords: ['Anniversary Campaign', 'Rebranding', 'Market Expansion', 'Crisis Response', 'Internal Branding', 'Partnership / Collab', 'Community Building', 'Content Strategy'] },
    { id: 'audience', q: 'Who needs to care about this? And what\'s their current relationship with your brand?', placeholder: 'e.g., Existing loyal customers who\'ve ordered 5+ times — they love us but take us for granted', keywords: ['Existing Customers', 'Potential Customers', 'Lost Customers', 'Employees', 'Investors / Partners', 'Media / Press', 'Industry Peers', 'General Public'] },
    { id: 'success', q: 'If this brainstorm leads to ONE outcome you\'d celebrate, what would it be?', placeholder: 'e.g., A video that gets shared by our customers organically and crosses 1M views', keywords: ['Viral Moment', 'Revenue Spike', 'Media Coverage', 'Customer Love', 'Award Worthy', 'Team Alignment', 'Clear Strategy', 'Content Pipeline'] },
    { id: 'constraints', q: 'What are the real-world constraints? Be honest — budget, time, team size, approvals?', placeholder: 'e.g., ₹1L budget, 2-person team, need to execute in 2 weeks, CEO must approve', keywords: ['Low Budget', 'Small Team', 'Tight Timeline', 'Approval Needed', 'Remote Team', 'No Video Capability', 'Limited Design Skills', 'No Constraints'], optional: true },
  ],
  'brand-strategy': [
    { id: 'objective', q: 'What\'s the ONE big thing you want to achieve? Not vague "grow" — what specific outcome?', placeholder: 'e.g., Go from 5K to 50K Instagram followers and generate 200 qualified leads per month', keywords: ['Brand Awareness', 'Lead Generation', 'Revenue Growth', 'Market Expansion', 'Customer Retention', 'Category Leadership', 'Community Building', 'Launch New Product'] },
    { id: 'duration', q: 'How long should this strategy cover? A focused 1-month sprint or a comprehensive 3-month plan?', placeholder: 'e.g., 3 months — we want a phased approach with clear milestones', keywords: ['1 Month Sprint', '3 Month Plan'] },
    { id: 'currentState', q: 'Where does your brand stand today? Be brutally honest — followers, revenue, website traffic, current marketing efforts.', placeholder: 'e.g., 5K Instagram, 2K website visits/month, ₹3L monthly revenue, no paid ads yet', keywords: ['Just Starting', 'Some Traction', 'Established but Plateaued', 'Growing Fast', 'Rebranding', 'Entering New Market'] },
    { id: 'channels', q: 'Which marketing channels do you want to focus on? Or should I recommend based on your brand?', placeholder: 'e.g., Social media + influencer marketing + Google Ads — we\'re weak on SEO', keywords: ['Social Media', 'LinkedIn Organic', 'SEO / Content', 'Google Ads (SEM)', 'Meta Ads', 'Influencer Marketing', 'Email Marketing', 'Offline / Events', 'All — Recommend for me'] },
    { id: 'budget', q: 'Total marketing budget for this period? This shapes whether we think grassroots or full-scale.', placeholder: 'e.g., ₹5L total for 3 months — open to adjusting split based on recommendation', keywords: ['Under ₹50K', '₹50K–2L', '₹2L–5L', '₹5L–10L', '₹10L–25L', '₹25L+', 'Flexible / TBD'] },
    { id: 'team', q: 'What\'s your team like? This determines whether we plan for a solo founder or an agency team.', placeholder: 'e.g., Founder + 1 social media intern + freelance designer', keywords: ['Solo Founder', 'Small Team (2-3)', 'Marketing Team (4-8)', 'Full Agency Support', 'Mix of In-house + Freelancers'], optional: true },
  ],
};

// ============================================================================
// ENDPOINTS
// ============================================================================

// POST /api/brainstorm-studio/start — AI-generated brand-aware questions
router.post('/start', optionalAuth, async (req, res) => {
  try {
    const { intent, brand } = req.body;
    if (!intent) return res.status(400).json({ success: false, error: 'Intent is required' });

    // If no brand data, use hardcoded fallback questions
    if (!brand || !brand.dna) {
      const questions = INTENT_QUESTIONS[intent] || INTENT_QUESTIONS.custom;
      return res.json({ success: true, intent, questions, brandAware: false });
    }

    // Build rich brand context from DNA
    const dna = brand.dna;
    const brandContext = [
      `Brand Name: ${brand.name}`,
      dna.industry ? `Industry: ${dna.industry}` : '',
      dna.brandDescription ? `Brand Description: ${dna.brandDescription}` : '',
      dna.targetAudience ? `Target Audience: ${dna.targetAudience}` : '',
      dna.voice?.personality ? `Brand Voice: ${dna.voice.personality}` : '',
      dna.voice?.description ? `Voice Description: ${dna.voice.description}` : '',
      dna.voice?.keywords?.length ? `Voice Keywords: ${dna.voice.keywords.join(', ')}` : '',
      dna.voice?.sampleQuote ? `Sample Quote: "${dna.voice.sampleQuote}"` : '',
      dna.contentStyle?.dos?.length ? `Content Dos: ${dna.contentStyle.dos.join(', ')}` : '',
      dna.contentStyle?.donts?.length ? `Content Don'ts: ${dna.contentStyle.donts.join(', ')}` : '',
      dna.contentStyle?.keyPhrases?.length ? `Key Phrases: ${dna.contentStyle.keyPhrases.join(', ')}` : '',
      dna.country ? `Country: ${dna.country}` : '',
      dna.region ? `Region: ${dna.region}` : '',
      dna.defaultLanguage ? `Language: ${dna.defaultLanguage}` : '',
      dna.languageStyle ? `Language Style: ${dna.languageStyle}` : '',
      dna.colors?.length ? `Brand Colors: ${dna.colors.map(c => `${c.name || ''} ${c.hex}`).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    // Intent-specific question flow guidance
    const intentFlows = {
      'ad-film': `QUESTION FLOW FOR AD FILM:
Q1: WHY — What's the purpose? (product launch ad, brand awareness, emotional brand film, festive ad, sale promotion)
Q2: WHAT — What product/service/message is this film about?
Q3: WHO — Who should watch this and feel something?
Q4: FEEL — What emotion should the viewer feel after watching?
Q5: STYLE — What kind of film? (funny, emotional, cinematic, slice-of-life, animated)
Q6: REFERENCE — Any ad or video they loved and want something similar to?
Q7: DURATION — How long should the film be?
Q8: SCRIPT COUNT — How many script options do they want? (2, 3, 4, or 5)
Q9: BUDGET — How big is this production? (optional)`,
      campaign: `QUESTION FLOW FOR CAMPAIGN:
Q1: WHAT — What specific product/service/event is this campaign for?
Q2: GOAL — What do you want to happen? (more sales, more followers, app downloads, store visits)
Q3: WHO — Who should see this campaign? Be specific about the person.
Q4: FEEL — What should people feel when they see it?
Q5: DIFFERENT — What makes you better than other options people have?
Q6: BUDGET — Budget and timeline? (optional)`,
      festival: `QUESTION FLOW FOR FESTIVAL:
Q1: WHICH — Which festival and what does it mean to your customers?
Q2: WHAT — What are you selling/promoting during this festival?
Q3: VIBE — What's the mood? (traditional, modern, party, family, luxury)
Q4: GOAL — What should people DO after seeing your festival content?
Q5: OFFER — Any special deal or offer? (optional)`,
      'product-launch': `QUESTION FLOW FOR PRODUCT LAUNCH:
Q1: WHAT — What are you launching? Explain it simply.
Q2: WHO — Who will buy this first?
Q3: WHY — Why should they choose you over other options?
Q4: FEEL — What reaction do you want when people first see/try it?
Q5: WORRY — What might stop someone from buying?
Q6: WHEN — When does this need to launch? (optional)`,
      naming: `QUESTION FLOW FOR NAMING:
Q1: WHAT — What needs a name? (product, brand, collection, campaign)
Q2: CATEGORY — What kind of product/service is this?
Q3: PERSONALITY — If this product was a person, what kind of person?
Q4: AVOID — What kind of names should we NOT suggest?
Q5: LANGUAGE — What language should the name be in?
Q6: VIBE — Pick a few words that describe the feel you want.`,
      offer: `QUESTION FLOW FOR OFFER:
Q1: WHAT — What are you selling and at what price?
Q2: WHY — Why do you need this offer right now?
Q3: BUYER — What makes your customer finally decide to buy?
Q4: LIMITS — What can't you do? (minimum margin, delivery limits, etc.)
Q5: REFERENCE — Any offer from another brand that you thought was genius? (optional)`,
      positioning: `QUESTION FLOW FOR POSITIONING:
Q1: WHO — What does your brand do, in simple words?
Q2: COMPETITION — Who else does your customers choose from?
Q3: TRUTH — What's special about you that you haven't talked about enough?
Q4: STAND FOR — Complete: "People should choose us because ___"
Q5: FIGHT — What problem or wrong belief does your brand fight against?`,
      'trend-hijack': `QUESTION FLOW FOR TREND HIJACK:
Q1: BRAND — What's your brand and how bold can you be on social media?
Q2: AUDIENCE — Whose phone screen are you trying to appear on?
Q3: SPEED — How fast can you create and post content?
Q4: STYLE — Which brand's social media do you admire?
Q5: LIMITS — Any topics that are off-limits? (optional)`,
      custom: `QUESTION FLOW FOR CUSTOM:
Q1: WHAT — What's on your mind? What do you need help with?
Q2: WHO — Who needs to care about this?
Q3: SUCCESS — If this goes perfectly, what does that look like?
Q4: LIMITS — Any real-world constraints? (optional)`,
      'brand-strategy': `QUESTION FLOW FOR BRAND STRATEGY:
Q1: OBJECTIVE — What is the ONE measurable goal you want to achieve?
Q2: DURATION — 1-month sprint or 3-month comprehensive plan?
Q3: CURRENT — Where does the brand stand today? (metrics, channels, strengths/weaknesses)
Q4: CHANNELS — Which marketing channels to focus on?
Q5: BUDGET — Total marketing budget for the period?
Q6: TEAM — What's the team size and capabilities? (optional)`,
    };

    const flowGuide = intentFlows[intent] || intentFlows.custom;

    const langInfo = inferBrandLanguage(brand);

    const systemPrompt = `You are a friendly creative partner helping someone brainstorm. You know their brand well and you talk like a helpful friend, NOT like a marketing professor.

BRAND YOU'RE WORKING WITH:
${brandContext}
${langInfo.directive ? `
${langInfo.directive}
` : ''}
You are starting a "${intent}" brainstorm session.

YOUR JOB: Generate questions that follow this specific flow:

${flowGuide}

CRITICAL RULES — READ CAREFULLY:

1. SIMPLE LANGUAGE: Write questions like you're chatting with a friend over coffee. NO marketing jargon. NO words like "leverage", "positioning", "narrative", "engagement metrics", "value proposition". Use everyday language.

2. LOGICAL ORDER: Follow the question flow above exactly. Start with the MOST BASIC question (why/what), then build up to details.

3. BRAND-AWARE but SIMPLE: You know the brand — mention their name, industry, or audience naturally. Example: "Hey, so ${brand.name} is making a film — what's the main reason? Is it to launch a new product, build the brand image, or something else?"

4. KEYWORDS = CLICKABLE ANSWERS: Keywords must be DIRECT, SIMPLE ANSWERS the user can click to instantly fill their response. Not abstract concepts.
   - BAD keywords: "authenticity", "engagement", "brand equity", "conversational storytelling"
   - GOOD keywords: "Product Launch Ad", "Brand Awareness Film", "Festive Season Ad", "Sale/Offer Promotion", "Emotional Brand Story"
   
5. PLACEHOLDERS = EXAMPLE ANSWERS: Placeholders should be real example answers, not descriptions.
   - BAD: "Describe the emotional resonance you seek"
   - GOOD: "e.g., I want to launch our new face wash range with a 60-sec film"

6. Keep questions SHORT — max 2 sentences. Don't over-explain.

7. Last question should be optional (budget/constraints).

Respond in JSON:
{
  "questions": [
    {
      "id": "short_id",
      "q": "Simple, friendly question mentioning the brand",
      "placeholder": "e.g., actual example answer",
      "keywords": ["Direct Answer 1", "Direct Answer 2", "Direct Answer 3"],
      "optional": false
    }
  ],
  "brandInsight": "One friendly line showing you understand this brand (e.g., '${brand.name} has a warm voice — that's perfect for emotional storytelling')"
}`;

    const userPrompt = `Generate personalized brainstorm questions for a "${intent}" session for the brand "${brand.name}". Follow the question flow exactly.`;

    try {
        const elapsed = Date.now() - (req.startTime || Date.now());
        const remainingBudget = Math.max(300000, 600000 - elapsed);
        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, timeout: remainingBudget });
      const parsed = parseJSON(result);

      if (parsed.questions && parsed.questions.length > 0) {
        return res.json({
          success: true,
          intent,
          questions: parsed.questions,
          brandInsight: parsed.brandInsight || null,
          brandAware: true,
          detectedLanguage: langInfo.isNonEnglish ? { lang: langInfo.lang, script: langInfo.script, reason: langInfo.reason } : null,

        });
      }
    } catch (aiError) {
      console.warn('AI question generation failed, using fallback:', aiError.message);
    }

    // Fallback to hardcoded questions
    const questions = INTENT_QUESTIONS[intent] || INTENT_QUESTIONS.custom;
    res.json({ success: true, intent, questions, brandAware: false });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/confirm — AI confirms understanding
router.post('/confirm', optionalAuth, async (req, res) => {
  try {
    const { intent, answers, brand } = req.body;
    if (!intent || !answers) return res.status(400).json({ success: false, error: 'Intent and answers are required' });

    const langInfo = inferBrandLanguage(brand);
    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice || 'professional'}. Colors: ${brand.dna?.colors?.map(c => c.hex).join(', ') || 'N/A'}.`
      : '';

    const answersText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');

    const systemPrompt = `You are a senior brand strategist at a top creative agency. You're having a conversation with a client.
${langInfo.directive ? `
${langInfo.directive}
` : ''}
Your job: Summarize what you understood from the client's brief in 3-4 conversational sentences. Show that you truly understand their brand, audience, and goals. End with a specific, insightful observation that shows strategic depth. If the brand communicates in a regional language, reflect that in your summary tone.

Also suggest 3 refinement directions the user might want (as short 5-8 word options).

Respond in JSON format:
{
  "summary": "Your understanding summary (3-4 sentences, conversational, strategic)",
  "refinements": ["option 1", "option 2", "option 3"]
}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\n\nClient's answers:\n${answersText}`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, timeout: remainingBudget });
    const parsed = parseJSON(result);

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('Brainstorm confirm error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/generate — Generate multi-layer scored ideas (intent-specific)
router.post('/generate', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
  try {
    const { intent, answers, brand, refinementHint } = req.body;
    if (!intent || !answers) return res.status(400).json({ success: false, error: 'Intent and answers are required' });

    // ── Load FULL Brand DNA via agentUtils (includes Products, Knowledge Bank, Competitors, Market Context) ──
    const langInfo = inferBrandLanguage(brand);
    let brandContext = '';
    try {
      const brandId = brand?._id || brand?.id;
      if (brandId) {
        const { brandContext: fullContext } = await loadBrandContext(brandId);
        brandContext = fullContext || '';
      } else if (brand?.name) {
        const dna = brand?.dna || {};
        brandContext = `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}. Description: ${dna.brandDescription || 'N/A'}. Country: ${dna.country || 'India'}.`;
      }
    } catch (ctxErr) {
      console.warn('[brainstorm/generate] Brand context load error:', ctxErr.message);
      const dna = brand?.dna || {};
      brandContext = brand ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}.` : '';
    }

    const answersText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
    const isAdFilm = intent === 'ad-film';
    const isNaming = intent === 'naming';

    // Determine how many film concepts to generate (default 3)
    let scriptCount = 3;
    if (isAdFilm) {
      const countStr = answers.scriptCount || '';
      const parsed = parseInt(countStr.replace(/\D/g, ''));
      if (parsed >= 2 && parsed <= 6) scriptCount = parsed;
    }

    let outputFormat;
    if (isAdFilm) {
      outputFormat = `{
  "filmConcepts": [
    {
      "title": "Film concept name",
      "logline": "One line that captures the entire film",
      "synopsis": "3-4 sentence story — beginning, middle, end",
      "emotion": "Primary emotion: joy, nostalgia, empowerment, humor, etc.",
      "format": "30-sec TVC / 60-sec Digital Film / 90-sec Brand Film",
      "visualStyle": "Cinematic warm tones / Handheld raw / Slick commercial",
      "openingShot": "Describe the first shot",
      "closingShot": "Describe the last shot + brand reveal",
      "castSuggestion": "Who should star — real people, celebrity type, etc.",
      "musicMood": "Upbeat, soulful, dramatic, silence with SFX, etc.",
      "targetPlatform": "TV / YouTube / Instagram Reels / Cinema",
      "scores": { "virality": 8, "emotionalConnect": 9, "brandRecall": 7, "easeOfProduction": 6 }
    }
  ],
  "productionApproaches": [
    {
      "filmRef": "Which film concept this is for",
      "lowBudget": "How to shoot with minimal budget",
      "midBudget": "Moderate budget approach",
      "highBudget": "Full production version"
    }
  ],
  "namingIdeas": {
    "filmTitles": ["Title 1", "Title 2", "Title 3"],
    "taglines": ["End-card tagline 1", "Tagline 2"],
    "hashtags": ["#Tag1", "#Tag2"]
  },
  "followUpSuggestions": [
    "Make it more emotional and less commercial",
    "Try a humorous approach instead",
    "Make it shorter — 30 seconds max"
  ]
}`;
    } else if (isNaming) {
      outputFormat = `{
  "campaignConcepts": [
    {
      "title": "Naming direction",
      "hook": "Creative direction explanation",
      "description": "2-3 sentence explanation",
      "targetPersona": "Who this appeals to",
      "visualDirection": "Visual style it evokes",
      "platforms": ["Packaging", "Digital"],
      "scores": { "virality": 8, "salesImpact": 7, "emotionalConnect": 9, "easeOfExecution": 6 }
    }
  ],
  "namingIdeas": {
    "premiumEnglish": [{"name": "Name", "meaning": "Why it works"}],
    "culturalInspired": [{"name": "Name", "meaning": "Cultural significance"}],
    "modernMinimal": [{"name": "Name", "meaning": "Why it works"}],
    "emotional": [{"name": "Name", "meaning": "Emotional connection"}],
    "taglines": ["Tagline 1", "Tagline 2", "Tagline 3"]
  },
  "executionPlan": {
    "phases": [
      {"name": "Shortlist", "duration": "2 days", "actions": ["Action 1"]},
      {"name": "Test", "duration": "3 days", "actions": ["Action 1"]},
      {"name": "Finalize", "duration": "1 day", "actions": ["Action 1"]}
    ]
  },
  "followUpSuggestions": ["Make names more playful", "Try Hindi-inspired names", "Make them shorter"]
}`;
    } else {
      outputFormat = `{
  "campaignConcepts": [
    {
      "title": "Campaign theme name",
      "hook": "1-line emotional hook",
      "description": "2-3 sentence concept explanation",
      "targetPersona": "Specific audience segment",
      "visualDirection": "Suggested visual style",
      "platforms": ["Instagram", "YouTube", "LinkedIn"],
      "scores": { "virality": 8, "salesImpact": 7, "emotionalConnect": 9, "easeOfExecution": 6 }
    }
  ],
  "tacticalIdeas": [
    {
      "campaignRef": "Which campaign concept this belongs to",
      "reelIdea": "Specific reel concept",
      "influencerAngle": "How to use influencers",
      "hashtag": "#CampaignHashtag",
      "contestIdea": "Contest or giveaway mechanic",
      "ugcPrompt": "User-generated content prompt"
    }
  ],
  "namingIdeas": {
    "campaignNames": ["Name 1", "Name 2"],
    "taglines": ["Tagline 1", "Tagline 2"],
    "hashtags": ["#Tag1", "#Tag2"]
  },
  "executionPlan": {
    "phases": [
      {"name": "Tease", "duration": "X days", "actions": ["Action 1", "Action 2"]},
      {"name": "Launch", "duration": "X days", "actions": ["Action 1", "Action 2"]},
      {"name": "Sustain", "duration": "X days", "actions": ["Action 1", "Action 2"]}
    ],
    "contentMap": { "posts": 3, "reels": 2, "stories": 5 },
    "launchDayStrategy": "Detailed launch day plan"
  },
  "followUpSuggestions": [
    "Make this bolder and edgier",
    "Try a lower-budget version",
    "Add a youth-focused spin"
  ]
}`;
    }

    const systemPrompt = `You are a team of creative experts working together for the brand.
${isAdFilm ? `
You are creating AD FILM / BRAND FILM concepts — NOT social media campaigns.
Think like a film director + copywriter. Every concept is a FILM with a story arc, characters, emotions, shots.
Generate exactly ${scriptCount} distinct film concepts with different emotional and stylistic approaches.
` : `
Generate 3 campaign concepts, 3 tactical idea sets, and a complete execution plan.
`}
${refinementHint ? `REFINEMENT: The user wants to adjust direction: "${refinementHint}". Adapt all ideas.` : ''}
${langInfo.directive ? `
${langInfo.directive}
` : ''}
Make ideas BOLD, SPECIFIC, and CULTURALLY RELEVANT. Not generic.

Respond in STRICT JSON format:
${outputFormat}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\n\nBrief:\n${answersText}`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.8, maxTokens: 6000, timeout: remainingBudget });
    const parsed = parseJSON(result);

    res.json({ success: true, ideas: parsed, intent, detectedLanguage: langInfo?.isNonEnglish ? langInfo.lang : null });
  } catch (error) {
    console.error('Brainstorm generate error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/refine — Refine existing ideas
router.post('/refine', protect, requireStudio('brainstormStudio'), requireCredits('brainstormRefine'), async (req, res) => {
  try {
    const { intent, answers, brand, previousIdeas, refinementPrompt } = req.body;
    if (!refinementPrompt) return res.status(400).json({ success: false, error: 'Refinement prompt is required' });

    const langInfo = inferBrandLanguage(brand);
    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}.`
      : '';

    const answersText = answers ? Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
    const isAdFilm = intent === 'ad-film';

    const systemPrompt = `You are refining brainstorm ideas based on feedback: "${refinementPrompt}"
${langInfo.directive ? `
${langInfo.directive}
` : ''}

${isAdFilm ? 'These are AD FILM concepts — generate film concepts with story, shots, emotion, not campaigns.' : 'Generate campaign concepts with tactical plans.'}

Keep the same JSON structure as before but make ideas better. Each concept needs scores (1-10).

${isAdFilm ? 'Respond with: filmConcepts (3), productionApproaches (3), namingIdeas, followUpSuggestions.' : 'Respond with: campaignConcepts (3), tacticalIdeas (3), namingIdeas, executionPlan, followUpSuggestions.'}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\nBrief:\n${answersText}\n\nRefinement: ${refinementPrompt}\n\nPrevious top idea: ${previousIdeas?.filmConcepts?.[0]?.title || previousIdeas?.campaignConcepts?.[0]?.title || 'N/A'}`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.85, maxTokens: 6000, timeout: remainingBudget });
    const parsed = parseJSON(result);

    res.json({ success: true, ideas: parsed, intent, detectedLanguage: langInfo?.isNonEnglish ? langInfo.lang : null });
  } catch (error) {
    console.error('Brainstorm refine error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/feedback — Like/Dislike an idea (saves for brand learning)
router.post('/feedback', optionalAuth, async (req, res) => {
  try {
    const { brandId, ideaTitle, ideaDescription, feedback, intent } = req.body;
    if (!ideaTitle || !feedback) return res.status(400).json({ success: false, error: 'Idea title and feedback required' });

    if (brandId && req.user) {
      try {
        const Brand = (await import('../models/Brand.js')).default;
        const brand = await Brand.findOne({ _id: brandId, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] });
        if (brand) {
          if (!brand.aiContext) brand.aiContext = {};
          if (!brand.aiContext.contentExamples) brand.aiContext.contentExamples = [];

          brand.aiContext.contentExamples.push({
            text: `[${intent}] ${ideaTitle}: ${ideaDescription || ''}`,
            type: feedback === 'like' ? 'approved' : 'rejected',
            rating: feedback === 'like' ? 5 : 1,
          });

          brand.aiContext.totalFeedback = (brand.aiContext.totalFeedback || 0) + 1;
          await brand.save();
        }
      } catch (dbError) {
        console.warn('Could not save feedback to DB:', dbError.message);
      }
    }

    res.json({ success: true, message: feedback === 'like' ? 'Idea approved! ✅' : 'Got it, noted. 👍' });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/screenplay — Generate screenplay from approved film concept
router.post('/screenplay', protect, requireStudio('brainstormStudio'), requireCredits('brainstormScreenplay'), async (req, res) => {
  try {
    const { filmConcept, brand } = req.body;
    if (!filmConcept) return res.status(400).json({ success: false, error: 'Film concept is required' });

    const langInfo = inferBrandLanguage(brand);
    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}. Target: ${brand.dna?.targetAudience || 'N/A'}. Country: ${brand.dna?.country || 'India'}.`
      : '';

    const systemPrompt = `You are an award-winning ad film scriptwriter. Write a production-ready screenplay.
${langInfo.directive ? `
${langInfo.directive}
` : ''}

RULES:
1. Scene-by-scene with VISUAL descriptions and DIALOGUE
2. Include camera directions (CLOSE UP, WIDE, TRACKING, etc.)
3. Include music/sound cues
4. Write VO or dialogue in the brand's tone
5. End with brand logo reveal + tagline
6. Match the specified duration
7. Make it emotionally powerful

Respond in JSON:
{
  "title": "Film title",
  "format": "Duration",
  "totalScenes": 5,
  "scenes": [
    {
      "sceneNumber": 1,
      "duration": "0:00 - 0:08",
      "location": "INT. KITCHEN - MORNING",
      "visual": "What we see",
      "action": "What happens",
      "dialogue": "Character dialogue or VO (if any)",
      "cameraDirection": "CLOSE UP / WIDE / etc.",
      "music": "Music description",
      "mood": "Emotional mood"
    }
  ],
  "endCard": {
    "visual": "How the brand logo appears",
    "tagline": "End tagline",
    "superText": "Any text overlay"
  },
  "directorNotes": "Overall direction — casting, color palette, pacing",
  "estimatedBudget": {
    "low": "Low-budget approach",
    "mid": "Mid-budget approach",
    "high": "Full production approach"
  }
}`;

    const userPrompt = `Film Concept:
Title: ${filmConcept.title}
Logline: ${filmConcept.logline || filmConcept.hook || ''}
Synopsis: ${filmConcept.synopsis || filmConcept.description || ''}
Format: ${filmConcept.format || '60 sec'}
Visual Style: ${filmConcept.visualStyle || filmConcept.visualDirection || ''}
Emotion: ${filmConcept.emotion || ''}
Opening Shot: ${filmConcept.openingShot || ''}
Closing Shot: ${filmConcept.closingShot || ''}
Cast: ${filmConcept.castSuggestion || ''}
Music: ${filmConcept.musicMood || ''}

${brandContext}`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, maxTokens: 6000, timeout: remainingBudget });
    const parsed = parseJSON(result);

    res.json({ success: true, screenplay: parsed });
  } catch (error) {
    console.error('Screenplay generation error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/chat — Multi-turn film refinement chat
router.post('/chat', protect, requireStudio('brainstormStudio'), requireCredits('brainstormChat'), async (req, res) => {
  try {
    const { filmConcept, chatHistory, userMessage, brand } = req.body;
    if (!filmConcept || !userMessage) {
      return res.status(400).json({ success: false, error: 'Film concept and message are required' });
    }

    const langInfo = inferBrandLanguage(brand);
    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}. Target: ${brand.dna?.targetAudience || 'N/A'}.`
      : '';

    const historyText = (chatHistory || []).map(m => `${m.role === 'user' ? 'USER' : 'CREATIVE DIRECTOR'}: ${m.text}`).join('\n');

    const systemPrompt = `You are an award-winning creative director helping refine an ad film concept. You're working closely with the client to perfect their film idea.
${langInfo.directive ? `
${langInfo.directive}
` : ''}

${brandContext}

CURRENT FILM CONCEPT:
Title: ${filmConcept.title}
Logline: ${filmConcept.logline || filmConcept.hook || ''}
Synopsis: ${filmConcept.synopsis || filmConcept.description || ''}
Format: ${filmConcept.format || '60 sec'}
Visual Style: ${filmConcept.visualStyle || filmConcept.visualDirection || ''}
Emotion: ${filmConcept.emotion || ''}
Opening Shot: ${filmConcept.openingShot || ''}
Closing Shot: ${filmConcept.closingShot || ''}
Cast: ${filmConcept.castSuggestion || ''}
Music: ${filmConcept.musicMood || ''}

RULES:
1. Be conversational, enthusiastic but professional — you're a creative partner
2. When the user suggests changes, acknowledge them and explain how you'd implement them
3. Keep responses concise (2-4 sentences for simple feedback, more for detailed suggestions)
4. If the user's suggestion significantly changes the concept, include an "updatedConcept" in your response
5. Always be constructive — build on ideas, don't shut them down
6. If the user seems happy, suggest generating the screenplay

Respond in JSON:
{
  "message": "Your conversational response to the user",
  "updatedConcept": null or { full updated film concept object with all fields: title, logline, synopsis, emotion, format, visualStyle, openingShot, closingShot, castSuggestion, musicMood, targetPlatform, scores: { virality, emotionalConnect, brandRecall, easeOfProduction } },
  "suggestions": ["Quick suggestion 1", "Quick suggestion 2", "Quick suggestion 3"]
}`;

    const userPrompt = historyText
      ? `CONVERSATION SO FAR:\n${historyText}\n\nUSER: ${userMessage}`
      : `USER: ${userMessage}`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.75, maxTokens: 4096, timeout: remainingBudget });
    const parsed = parseJSON(result);

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('Brainstorm chat error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// ============================================================================
// BRAND STRATEGY — Heavy-weight strategy generation + persistence
// ============================================================================

// POST /api/brainstorm-studio/strategy — Generate comprehensive brand strategy
router.post('/strategy', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
  try {
    const { answers, brand } = req.body;
    if (!answers) return res.status(400).json({ success: false, error: 'Answers are required' });

    const dna = brand?.dna || {};
    const duration = (answers.duration || '').toLowerCase().includes('3') ? '3-month' : '1-month';
    const weeks = duration === '3-month' ? 12 : 4;

    // ── Load FULL Brand DNA via agentUtils (includes Products, Knowledge Bank, Competitors, Market Context) ──
    let brandContext = '';
    try {
      const brandId = brand?._id || brand?.id;
      if (brandId) {
        const { brandContext: fullContext } = await loadBrandContext(brandId);
        brandContext = fullContext || '';
      } else if (brand?.name) {
        brandContext = `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}. Country: ${dna.country || 'India'}.`;
      }
    } catch (ctxErr) {
      console.warn('[brainstorm/strategy] Brand context load error:', ctxErr.message);
      brandContext = brand ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}.` : '';
    }

    const answersText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');

    const systemPrompt = `You are a world-class Chief Marketing Officer and Brand Strategist with 20+ years experience across D2C, B2B, and consumer brands in India and globally.

You THINK LIKE A REAL CMO — every number you produce must have a logical basis. You do NOT guess. You reason from first principles.

## YOUR STRATEGIC THINKING FRAMEWORK:

### 1. SITUATION ANALYSIS (Internal)
- Current metrics: What does the brand have TODAY? (followers, traffic, revenue, team)
- Brand maturity: Startup? Growing? Established? This dictates growth rate assumptions
- Team capacity: A solo founder CANNOT execute the same plan as a 5-person marketing team
- Budget reality: ₹50K/month gets VERY different results than ₹10L/month

### 2. COMPETITIVE INTELLIGENCE
- Identify 3-5 likely competitors in this industry/niche
- Analyze what channels competitors typically dominate
- Find competitive gaps (underserved channels, content formats, audience segments)
- Benchmark: What are realistic industry metrics? (avg CPL, avg engagement rate, avg ROAS)

### 3. BUDGET ALLOCATION LOGIC (This is CRITICAL — justify every rupee)
Use these evidence-based allocation principles:
- **Awareness-first brands** (low followers/traffic): 60% paid, 30% content, 10% tools/tech
- **Traction brands** (some audience): 40% paid, 35% content/influencer, 15% SEO, 10% tools
- **Established brands** (strong audience): 25% paid, 30% retention/email, 25% content, 20% brand
- **Performance-first** (lead gen focus): 50-60% to paid (Meta+Google), rest to content+landing pages
- NEVER allocate budget to a channel without stating WHY and what the expected return is
- Every ₹ must have an expected output: "₹X budget → Y impressions → Z leads at A% conversion"

### 4. ACHIEVABILITY SCORING
For EVERY KPI target, provide:
- "achievability": 1-10 score (10=guaranteed, 1=very ambitious)
- "assumption": The growth assumption behind this number
- Example: "Instagram 5K→15K in 3 months = 3x growth. Achievability: 6/10. Assumption: Consistent 5 reels/week + ₹30K/month ad spend typically yields 8-12% monthly follower growth for D2C brands"

### 5. IMPACT FACTORS
Identify what can make or break this strategy:
- Seasonal trends (festive season, summer, back-to-school, etc.)
- Market conditions (economic slowdown, competition increasing)
- Algorithm changes (Instagram reach declining, Google AI overviews reducing CTR)
- Team execution quality
- Product-market fit strength
- Creative quality of content

### 6. CHANNEL SYNERGY MAP
Show how channels REINFORCE each other — this is what separates a strategy from a to-do list:
- "Social → drives brand search → SEO captures → retargeting converts"
- "Influencer seed → UGC content → repurpose as ads → lower CPL"

## RULES:
1. EVERY target must have a calculation basis — show your math in "rationale" fields
2. Budget percentages must add to 100%. Each has a "why" field
3. Do NOT recommend channels that don't make sense for the budget/team size
4. For budgets <₹1L/month, do NOT recommend influencer marketing or paid Google Ads — focus organic + Meta
5. For solo founders, limit to MAX 2-3 channels — quality over spread-thin
6. Growth rates: Max realistic monthly follower growth = 15-20% for aggressive execution. 5-8% is normal
7. ROAS expectations: New brands = 1.5-2.5x, Established = 3-5x, Optimized = 5-8x
8. CPL ranges: B2C India = ₹30-150, B2B India = ₹200-800, Premium D2C = ₹80-300
9. ALL numbers must be rounded to realistic values, not arbitrary round numbers
10. Duration: ${duration} = ${weeks} weeks

Respond in STRICT JSON format:
{
  "title": "Strategy name — something memorable and specific to THIS brand",
  "executive_summary": "4-5 sentences capturing the core strategic thesis — WHY this plan will work for THIS brand",
  "objective": "The primary measurable goal with a number",
  "duration": "${duration}",
  "budget_total": "Total budget string",

  "competitive_landscape": {
    "likely_competitors": ["Competitor 1", "Competitor 2", "Competitor 3"],
    "competitor_strengths": "What competitors are doing well",
    "competitive_gaps": "Where the opportunity lies",
    "industry_benchmarks": {
      "avg_engagement_rate": "X%",
      "avg_cpl": "₹X",
      "avg_roas": "Xx",
      "avg_follower_growth": "X%/month"
  }
},

  "channels": {
  "social_media": {
    "enabled": true,
    "platforms": ["Instagram", "LinkedIn"],
    "why_this_channel": "1-2 sentence rationale for choosing this channel",
    "strategy": "2-3 sentence channel strategy",
    "tactics": ["Specific tactic 1", "Specific tactic 2", "Specific tactic 3"],
    "content_mix": { "reels": 3, "carousels": 2, "stories": 5, "linkedin_posts": 2 },
    "posting_frequency": "X posts/week per platform",
    "budget_split": "₹X (Y% of total)",
    "budget_rationale": "Why Y% — e.g. 'Social is primary discovery channel for D2C in this category, and organic reach alone limited to X%'",
    "expected_output": "₹X spend → ~Y impressions → Z profile visits → W followers",
    "kpis": [
      { "name": "Instagram Followers", "target": 8500, "unit": "followers", "achievability": 7, "assumption": "From 5K base, 12% monthly growth with 4 reels/week + ₹25K ad spend" }
    ]
  },
  "seo_sem": {
    "enabled": true,
    "why_this_channel": "Rationale",
    "strategy": "SEO/SEM strategy",
    "tactics": ["Specific keywords/approach"],
    "budget_split": "₹X (Y%)",
    "budget_rationale": "Why this allocation",
    "expected_output": "Expected traffic/lead numbers",
    "kpis": [
      { "name": "Organic Traffic", "target": 4200, "unit": "visits/month", "achievability": 6, "assumption": "Reasoning" }
    ]
  },
  "performance_marketing": {
    "enabled": true,
    "platforms": ["Meta Ads"],
    "why_this_channel": "Rationale",
    "strategy": "Performance marketing approach",
    "campaigns": [
      { "name": "Campaign name", "objective": "Conversions", "budget": "₹X", "audience": "Specific audience", "expected_cpl": "₹X", "expected_leads": 50 }
    ],
    "budget_split": "₹X (Y%)",
    "budget_rationale": "Why this split",
    "expected_output": "₹X spend → Y leads at ₹Z CPL → W conversions at A% close rate",
    "kpis": [
      { "name": "Cost per Lead", "target": 85, "unit": "₹", "achievability": 7, "assumption": "India D2C avg CPL ₹60-120, new account typically starts higher" }
    ]
  },
  "influencer_marketing": {
    "enabled": false,
    "why_this_channel": "Rationale for inclusion OR exclusion (e.g. 'Budget <₹1L makes influencer ROI unpredictable')",
    "strategy": "Approach if enabled",
    "tiers": [],
    "budget_split": "₹0 (0%)",
    "budget_rationale": "Why excluded or why this amount",
    "kpis": []
  },
  "content_marketing": {
    "enabled": true,
    "why_this_channel": "Rationale",
    "strategy": "Content strategy",
    "content_types": ["Blog posts", "Newsletters"],
    "frequency": "X pieces/week",
    "budget_split": "₹X (Y%)",
    "budget_rationale": "Reasoning",
    "kpis": [
      { "name": "Blog Traffic", "target": 2800, "unit": "visits/month", "achievability": 6, "assumption": "Reasoning" }
    ]
  },
  "ad_films_reels": {
    "enabled": true,
    "why_this_channel": "Rationale",
    "strategy": "Video strategy",
    "productions": [
      { "type": "Brand Reel", "concept": "Concept", "platform": "Instagram", "budget": "₹X" }
    ],
    "budget_split": "₹X (Y%)",
    "budget_rationale": "Reasoning",
    "kpis": [
      { "name": "Video Views", "target": 75000, "unit": "views", "achievability": 7, "assumption": "Reasoning" }
    ]
  },
  "offline_campaigns": {
    "enabled": false,
    "why_this_channel": "Rationale for exclusion",
    "strategy": "",
    "activities": [],
    "budget_split": "₹0",
    "kpis": []
  }
},

  "channel_synergy": [
  { "flow": "Social content → drives branded search → SEO captures → retargeting converts", "impact": "Reduces overall CPL by ~20-30%" },
  { "flow": "LinkedIn thought-leadership → builds authority → drives website traffic → SEO reinforces → conversions", "impact": "B2B pipeline creation + brand credibility" },
  { "flow": "Influencer posts → UGC → repurpose as paid ads → lower ad fatigue", "impact": "Extends creative shelf life by 2-3x" }
],

  "timeline": [
  {
    "phase": "Phase 1: Foundation & Setup",
    "weeks": "Week 1-2",
    "focus": "Infrastructure, accounts, creative assets",
    "milestones": [
      { "title": "Specific milestone", "week": 1, "channel": "social_media" }
    ],
    "deliverables": ["Deliverable 1", "Deliverable 2"],
    "expected_results": "What results to expect by end of this phase"
  }
],

  "kpi_summary": [
  { "name": "Total Reach", "target": 350000, "unit": "impressions", "channel": "overall", "achievability": 7, "assumption": "Sum of social reach + ad impressions + SEO traffic" },
  { "name": "Qualified Leads", "target": 120, "unit": "leads", "channel": "overall", "achievability": 6, "assumption": "Based on ₹X ad spend at ₹Y CPL + organic leads" }
],

  "budget_breakdown": [
  { "channel": "Meta Ads", "amount": "₹X", "percentage": 35, "rationale": "Primary lead gen driver, proven ROI for this category" },
  { "channel": "Content Production", "amount": "₹X", "percentage": 25, "rationale": "Fuels both organic and paid channels" }
],

  "impact_factors": [
  { "factor": "Festive season (Oct-Nov)", "impact": "positive", "magnitude": "high", "detail": "20-40% higher buying intent, but CPL also rises 15-25%" },
  { "factor": "Instagram algorithm favoring reels", "impact": "positive", "magnitude": "medium", "detail": "Reels get 2-3x reach vs static posts — strategy is reel-heavy" }
],

  "success_probability": {
  "overall": 72,
  "reasoning": "Strong product-market fit + adequate budget for chosen channels. Main risk: team execution capacity",
  "key_dependencies": [
    "Consistent content output (minimum 4 posts/week)",
    "Ad creative refresh every 2 weeks",
    "Quick response to lead inquiries (<2 hours)"
  ]
},

  "reality_check": [
  { "claim": "5K to 15K followers in 3 months", "reality": "Requires 12% MoM growth. Industry avg is 5-8%. Achievable with ₹25K+ monthly ad spend + 5 reels/week", "verdict": "Ambitious but achievable" },
  { "claim": "₹80 CPL on Meta Ads", "reality": "New ad accounts typically see ₹100-150 CPL in month 1, optimizing to ₹60-90 by month 3", "verdict": "Realistic by end of strategy period" }
],

  "risk_mitigation": [
  { "risk": "Ad fatigue after week 3", "probability": "high", "mitigation": "Pre-produce 3 creative batches. Rotate every 10 days. Use UGC to extend shelf life", "cost_of_inaction": "CPL rises 30-50%, ROAS drops below 2x" }
],

  "quick_wins": [
  "Immediate action with specific reasoning"
]
}`;

    const userPrompt = `Create a deeply researched, expert - level ${duration} brand strategy.Every number must have a logical basis.Think step by step.

BRAND CONTEXT:
  ${brandContext}

CLIENT BRIEF:
  ${answersText}

IMPORTANT: Do NOT give generic advice.Analyze THIS specific brand's situation and create a strategy that a real CMO would stake their reputation on. Every budget allocation needs a "why". Every KPI needs a calculation basis. If a channel doesn't make sense for this budget / team, say so and explain why.`;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.75, maxTokens: 8000, timeout: remainingBudget });
    const parsed = parseJSON(result);

    // Build KPIs list from all channels
    const kpis = [];
    if (parsed.kpi_summary) {
      parsed.kpi_summary.forEach(k => kpis.push({ name: k.name, target: k.target, current: 0, unit: k.unit || '', channel: k.channel || 'overall' }));
    }
    // Add channel-specific KPIs
    if (parsed.channels) {
      Object.entries(parsed.channels).forEach(([ch, data]) => {
        if (data?.enabled && data.kpis) {
          data.kpis.forEach(k => {
            if (!kpis.find(x => x.name === k.name)) {
              kpis.push({ name: k.name, target: k.target, current: 0, unit: k.unit || '', channel: ch });
            }
          });
        }
      });
    }

    // Build milestones from timeline
    const milestones = [];
    if (parsed.timeline) {
      parsed.timeline.forEach(phase => {
        (phase.milestones || []).forEach(m => {
          milestones.push({ title: m.title, week: m.week || 1, completed: false, channel: m.channel || '' });
        });
      });
    }

    // Save to DB
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + (duration === '3-month' ? 90 : 30));

    const savedStrategy = await BrandStrategy.create({
      user: req.user._id,
      brand: brand?._id || undefined,
      title: parsed.title || 'Brand Strategy',
      duration,
      objective: parsed.objective || answers.objective || '',
      strategy: parsed,
      kpis,
      milestones,
      startDate: new Date(),
      endDate,
    });

    res.json({ success: true, strategy: parsed, strategyId: savedStrategy._id, kpis, milestones });
  } catch (error) {
    console.error('Strategy generation error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/brainstorm-studio/strategy-slides — Generate presentation slides
router.post('/strategy-slides', protect, async (req, res) => {
  try {
    const { strategyId, strategy, brand } = req.body;
    if (!strategy) return res.status(400).json({ success: false, error: 'Strategy data is required' });

    const brandColors = brand?.dna?.colors?.map(c => c.hex) || ['#6366f1', '#8b5cf6', '#a855f7'];
    const brandName = brand?.name || 'Brand';

    const systemPrompt = `You are creating a stunning strategy presentation in JSON format.

  Brand: ${brandName}
Brand Colors: ${brandColors.join(', ')}

Create 12 - 15 slides.Each slide must have:
- A layout type: hero, stats, timeline, grid, bullets, comparison, chart - data, quote, cta
  - Content that is CONCISE and VISUAL — no long paragraphs
    - Use the brand's colors for theming

Respond in JSON:
{
  "slides": [
    {
      "id": 1,
      "layout": "hero",
      "title": "Strategy Title",
      "subtitle": "Subtitle or tagline",
      "accent_color": "${brandColors[0] || '#6366f1'}",
      "content": null
    },
    {
      "id": 2,
      "layout": "bullets",
      "title": "Executive Summary",
      "subtitle": null,
      "accent_color": "${brandColors[0] || '#6366f1'}",
      "content": { "items": ["Key point 1", "Key point 2", "Key point 3"] }
    },
    {
      "id": 3,
      "layout": "stats",
      "title": "Key Targets",
      "subtitle": "What we're aiming for",
      "accent_color": "${brandColors[1] || '#8b5cf6'}",
      "content": { "stats": [{ "label": "Metric", "value": "10K", "sub": "target" }] }
    },
    {
      "id": 4,
      "layout": "grid",
      "title": "Channel Strategy",
      "subtitle": null,
      "accent_color": "${brandColors[0] || '#6366f1'}",
      "content": { "cards": [{ "icon": "📱", "title": "Social", "desc": "Brief desc" }] }
    },
    {
      "id": 5,
      "layout": "timeline",
      "title": "Execution Roadmap",
      "subtitle": null,
      "accent_color": "${brandColors[0] || '#6366f1'}",
      "content": { "phases": [{ "name": "Phase 1", "weeks": "Wk 1-2", "items": ["Task 1"] }] }
    },
    {
      "id": 6,
      "layout": "comparison",
      "title": "Budget Allocation",
      "subtitle": null,
      "accent_color": "${brandColors[1] || '#8b5cf6'}",
      "content": { "rows": [{ "label": "Channel", "value": "₹X", "bar": 40 }] }
    },
    {
      "id": 7,
      "layout": "cta",
      "title": "Let's Execute",
      "subtitle": "Your ${brandName} growth journey starts now",
      "accent_color": "${brandColors[0] || '#6366f1'}",
      "content": { "text": "Activate this strategy to begin tracking progress" }
    }
  ]
}

IMPORTANT: Create slides that cover ALL major sections — summary, objectives, each active channel, timeline, budget, KPIs, risks, and a closing CTA.Make it 12 - 15 slides total.`;

    const userPrompt = `Create a presentation from this strategy: \n${JSON.stringify(strategy).substring(0, 6000)} `;

    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(300000, 600000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 6000, timeout: remainingBudget });
    const parsed = parseJSON(result);

    // Save slides to strategy if we have an ID
    if (strategyId) {
      try {
        await BrandStrategy.findByIdAndUpdate(strategyId, { slides: parsed.slides });
      } catch (e) { console.warn('Failed to save slides:', e.message); }
    }

    res.json({ success: true, slides: parsed.slides });
  } catch (error) {
    console.error('Strategy slides error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// ============================================================================
// STRATEGY TRACKER — CRUD for tracking progress
// ============================================================================

// GET /api/brainstorm-studio/strategies — List all strategies for user
router.get('/strategies', protect, async (req, res) => {
  try {
    const strategies = await BrandStrategy.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('title duration objective status overallProgress kpis milestones startDate endDate createdAt brand')
      .limit(20);
    res.json({ success: true, strategies });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// GET /api/brainstorm-studio/strategies/:id — Get full strategy
router.get('/strategies/:id', protect, async (req, res) => {
  try {
    const strategy = await BrandStrategy.findOne({ _id: req.params.id, user: req.user._id });
    if (!strategy) return res.status(404).json({ success: false, error: 'Strategy not found' });
    res.json({ success: true, strategy });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// PATCH /api/brainstorm-studio/strategies/:id/kpi — Update a KPI value
router.patch('/strategies/:id/kpi', protect, async (req, res) => {
  try {
    const { kpiName, current } = req.body;
    const strategy = await BrandStrategy.findOne({ _id: req.params.id, user: req.user._id });
    if (!strategy) return res.status(404).json({ success: false, error: 'Strategy not found' });

    const kpi = strategy.kpis.find(k => k.name === kpiName);
    if (!kpi) return res.status(404).json({ success: false, error: 'KPI not found' });
    kpi.current = current;

    // Recalculate overall progress
    const totalProgress = strategy.kpis.reduce((sum, k) => {
      return sum + (k.target > 0 ? Math.min(100, (k.current / k.target) * 100) : 0);
    }, 0);
    strategy.overallProgress = strategy.kpis.length > 0 ? Math.round(totalProgress / strategy.kpis.length) : 0;

    await strategy.save();
    res.json({ success: true, kpis: strategy.kpis, overallProgress: strategy.overallProgress });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// PATCH /api/brainstorm-studio/strategies/:id/milestone — Toggle milestone
router.patch('/strategies/:id/milestone', protect, async (req, res) => {
  try {
    const { milestoneId, completed } = req.body;
    const strategy = await BrandStrategy.findOne({ _id: req.params.id, user: req.user._id });
    if (!strategy) return res.status(404).json({ success: false, error: 'Strategy not found' });

    const milestone = strategy.milestones.id(milestoneId);
    if (!milestone) return res.status(404).json({ success: false, error: 'Milestone not found' });
    milestone.completed = completed;
    milestone.completedAt = completed ? new Date() : undefined;

    // Recalculate overall progress (50% KPIs + 50% milestones)
    const kpiProgress = strategy.kpis.length > 0
      ? strategy.kpis.reduce((sum, k) => sum + (k.target > 0 ? Math.min(100, (k.current / k.target) * 100) : 0), 0) / strategy.kpis.length
      : 0;
    const milestoneProgress = strategy.milestones.length > 0
      ? (strategy.milestones.filter(m => m.completed).length / strategy.milestones.length) * 100
      : 0;
    strategy.overallProgress = Math.round((kpiProgress + milestoneProgress) / 2);

    await strategy.save();
    res.json({ success: true, milestones: strategy.milestones, overallProgress: strategy.overallProgress });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// PATCH /api/brainstorm-studio/strategies/:id/status — Change strategy status
router.patch('/strategies/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const strategy = await BrandStrategy.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status },
      { returnDocument: 'after' }
    );
    if (!strategy) return res.status(404).json({ success: false, error: 'Strategy not found' });
    res.json({ success: true, status: strategy.status });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});
// ============================================================================
// SESSION CRUD — Persisted Brainstorm History
// ============================================================================

// GET /api/brainstorm-studio/sessions — List all sessions for the user (brand-filtered)
router.get('/sessions', protect, async (req, res) => {
  try {
    const filter = { user: req.user._id, status: { $ne: 'archived' } };
    if (req.query.brandId) filter.brand = req.query.brandId;
    const sessions = await BrainstormSession.find(filter)
      .sort({ lastMessageAt: -1 })
      .select('title intent status ideaCount hasDeepDive hasCalendar lastMessageAt createdAt brand')
      .limit(50);
    res.json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// GET /api/brainstorm-studio/sessions/:id — Load full session to resume
router.get('/sessions/:id', protect, async (req, res) => {
  try {
    const session = await BrainstormSession.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// DELETE /api/brainstorm-studio/sessions/:id — Archive a session
router.delete('/sessions/:id', protect, async (req, res) => {
  try {
    await BrainstormSession.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status: 'archived' }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// PATCH /api/brainstorm-studio/sessions/:id/title — Rename a session
router.patch('/sessions/:id/title', protect, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title required' });
    await BrainstormSession.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { title }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// ============================================================================
// DEEP DIVE + CALENDAR — Inline generators
// ============================================================================

// ── Deep Dive: Multi-faceted exploration of a single idea ─────────────────────
async function generateDeepDiveInline(idea, brand, intent) {
  const dna = brand?.dna || {};
  const brandContext = brand
    ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target: ${dna.targetAudience || 'N/A'}. Country: ${dna.country || 'India'}.`
    : '';

  const ideaSummary = `Idea Title: ${idea.title || 'Untitled'}
Hook/Logline: ${idea.logline || idea.hook || ''}
Description: ${idea.synopsis || idea.description || ''}
Format: ${idea.format || ''}
Emotion: ${idea.emotion || ''}
Target: ${idea.targetPersona || ''}
Platforms: ${(idea.platforms || []).join(', ') || idea.targetPlatform || ''}`;

  const systemPrompt = `You are a senior brand strategist conducting a DEEP DIVE exploration of a creative idea for ${brand?.name || 'a brand'}.

BRAND CONTEXT:
${brandContext}

IDEA TO EXPLORE:
${ideaSummary}

You must produce a comprehensive, actionable deep dive that covers 5 areas. Be SPECIFIC — reference the brand, the idea, and the market. No generic advice.

Respond in STRICT JSON:
{
  "ideaTitle": "${idea.title || 'Idea'}",
  "summary": "2-3 sentence executive summary of the opportunity this idea represents",

  "competitiveAnalysis": {
    "directCompetitors": [
      { "name": "Competitor brand", "whatTheyDo": "Their approach in this space", "theirApproach": "How they've done something similar", "ourAdvantage": "Why our idea is better/different" }
    ],
    "indirectCompetitors": [
      { "name": "Brand or category", "category": "Their category", "threat": "Why they compete for attention" }
    ],
    "whitespace": "What no one in the market is doing that this idea can own"
  },

  "executionPlaybook": {
    "phases": [
      {
        "name": "Phase 1: Pre-Launch",
        "duration": "Week 1-2",
        "actions": [
          { "task": "Specific action item", "owner": "Who does this", "deliverable": "What's produced", "channel": "Where it goes" }
        ]
      }
    ],
    "keyMilestones": [
      { "week": 1, "milestone": "Specific milestone", "metric": "How to measure" }
    ]
  },

  "contentBrief": {
    "heroAssets": [
      { "type": "video/image/carousel", "brief": "What to create", "platform": "Where it goes", "specs": "Dimensions/duration" }
    ],
    "supportContent": [
      { "type": "stories/posts/blog", "brief": "What to create", "platform": "Where" }
    ],
    "copyDirection": {
      "headlines": ["Headline option 1", "Headline option 2", "Headline option 3"],
      "bodyText": ["Body copy direction 1", "Body copy direction 2"],
      "ctas": ["CTA 1", "CTA 2", "CTA 3"]
    }
  },

  "budgetBreakdown": {
    "totalEstimate": "₹X-Y range",
    "splits": [
      { "category": "Content Production", "percentage": 30, "amount": "₹X", "rationale": "Why this allocation" }
    ],
    "roiProjection": "Expected return or impact estimate with reasoning"
  },

  "risks": [
    { "risk": "What could go wrong", "likelihood": "high/medium/low", "mitigation": "How to prevent or handle" }
  ]
}`;

  // Use Gemini grounded search for competitive analysis
  let result;
  try {
    const aiRouter = getRouter();
    const searchResult = await aiRouter.generateTextWithSearch({
      systemPrompt,
      userPrompt: `Deep dive into this ${intent || 'campaign'} idea for ${brand?.name || 'the brand'}. Research competitors and market context. The idea is: "${idea.title}" — ${idea.logline || idea.hook || idea.description || ''}`,
      temperature: 0.6,
      maxTokens: 6000,
    });
    result = searchResult.text;
  } catch (err) {
    console.warn('[deepDive] Grounded search failed, falling back to standard AI:', err.message);
    result = await aiCall(systemPrompt, `Deep dive into this idea: "${idea.title}"`, { temperature: 0.6, maxTokens: 6000 });
  }

  try { return parseJSON(result) || {}; } catch { return {}; }
}

// ── Calendar: Week-by-week content plan from an idea/deep-dive ─────────────────
async function generateCalendarInline(idea, deepDive, brand, intent) {
  const dna = brand?.dna || {};
  const brandContext = brand
    ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Target: ${dna.targetAudience || 'N/A'}. Country: ${dna.country || 'India'}.`
    : '';

  const ideaSummary = `Idea: ${idea?.title || 'Campaign'} — ${idea?.logline || idea?.hook || idea?.description || ''}`;
  const deepDiveCtx = deepDive?.executionPlaybook
    ? `\nExecution Playbook Phases: ${deepDive.executionPlaybook.phases?.map(p => p.name).join(', ') || 'N/A'}`
    : '';

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + ((1 + 7 - startDate.getDay()) % 7 || 7)); // Next Monday
  const startStr = startDate.toISOString().split('T')[0];

  const systemPrompt = `You are a content strategist creating a detailed, actionable CONTENT CALENDAR for ${brand?.name || 'a brand'}.

BRAND:
${brandContext}

IDEA:
${ideaSummary}
${deepDiveCtx}

Create a 4-week content calendar starting from ${startStr} (Monday).

RULES:
1. Each week has a THEME that builds momentum
2. Include specific posts for specific days with platform, type, brief, and time
3. Platforms: instagram, linkedin, twitter, youtube, facebook — pick what makes sense
4. Post types: reel, carousel, story, post, video, blog, newsletter
5. Include specific copy hooks and hashtags for each post
6. Be SPECIFIC — not generic. Reference the brand and idea.
7. Include milestones and KPIs to track

Respond in STRICT JSON:
{
  "title": "Content Calendar: [Idea Name]",
  "duration": "4 weeks",
  "startDate": "${startStr}",
  "objective": "What this calendar aims to achieve",

  "weeks": [
    {
      "weekNumber": 1,
      "theme": "Week 1: [Theme Name]",
      "days": [
        {
          "date": "${startStr}",
          "dayOfWeek": "Monday",
          "posts": [
            {
              "platform": "instagram",
              "type": "reel",
              "brief": "Specific content brief — what to create",
              "time": "11:00 AM",
              "hashtags": ["#Tag1", "#Tag2"],
              "copyHook": "Opening line or hook for the post"
            }
          ]
        }
      ]
    }
  ],

  "targetKPIs": [
    { "metric": "Instagram Reach", "target": "50K", "measureAfter": "4 weeks" }
  ],

  "milestones": [
    { "week": 1, "title": "Teaser content goes live", "action": "Post first 3 teasers" }
  ]
}`;

  const result = await aiCall(systemPrompt, `Generate the content calendar`, { temperature: 0.7, maxTokens: 6000 });
  try { return parseJSON(result) || {}; } catch { return {}; }
}

// ============================================================================
// FIDATO-CHAT  — Conversational Brainstorm Engine (SSE)
// MCoT: Stage 1 reasons about session state, Stage 2 executes action
// ============================================================================

// ── SSE helpers ───────────────────────────────────────────────────────────────
function sseEvent(res, data) {
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
}

async function streamWords(res, text, delayMs = 5) {
  const words = text.split(' ');
  for (const word of words) {
    sseEvent(res, { type: 'token', text: word + ' ' });
    await new Promise(r => setTimeout(r, delayMs));
  }
}

// ── Deep Brand Context Builder ─────────────────────────────────────────────────
// Builds the richest possible brand context for AI reasoning
function buildCtx(brand) {
  if (!brand?.dna) return brand ? `Brand: ${brand.name}.` : '';
  const d = brand.dna;
  const sections = [
    `BRAND NAME: ${brand.name}`,
    d.industry && `INDUSTRY: ${d.industry}`,
    d.category && `CATEGORY: ${d.category}`,
    d.brandDescription && `BRAND STORY: ${d.brandDescription}`,
    d.targetAudience && `TARGET AUDIENCE: ${d.targetAudience}`,
    d.voice?.personality && `BRAND VOICE: ${d.voice.personality}`,
    d.voice?.description && `VOICE DETAIL: ${d.voice.description}`,
    d.voice?.keywords?.length && `VOICE KEYWORDS: ${d.voice.keywords.join(', ')}`,
    d.voice?.sampleQuote && `BRAND QUOTE EXAMPLE: "${d.voice.sampleQuote}"`,
    d.contentStyle?.dos?.length && `BRAND DO's: ${d.contentStyle.dos.join('; ')}`,
    d.contentStyle?.donts?.length && `BRAND DON'Ts: ${d.contentStyle.donts.join('; ')}`,
    d.contentStyle?.keyPhrases?.length && `KEY BRAND PHRASES: ${d.contentStyle.keyPhrases.join(', ')}`,
    d.country && `COUNTRY: ${d.country}`,
    d.region && `REGION: ${d.region}`,
    d.defaultLanguage && `PRIMARY LANGUAGE: ${d.defaultLanguage}`,
    d.languageStyle && `LANGUAGE STYLE: ${d.languageStyle}`,
    d.colors?.length && `BRAND COLORS: ${d.colors.map(c => `${c.name || ''} (${c.hex})`).join(', ')}`,
    d.usp && `USP: ${d.usp}`,
    d.differentiators?.length && `DIFFERENTIATORS: ${d.differentiators.join('; ')}`,
    d.competitors?.length && `KNOWN COMPETITORS: ${d.competitors.join(', ')}`,
    d.products?.length && `PRODUCTS/SERVICES: ${d.products.slice(0, 5).map(p => typeof p === 'string' ? p : (p.name || p.title || '')).join(', ')}`,
  ].filter(Boolean).join('\n');
  return sections;
}

// ── Fuzzy question dedup — detects if AI is repeating a similar question ─────
function isSimilarQuestion(newQ, askedList) {
  if (!askedList?.length) return false;
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const normNew = normalize(newQ);
  const newWords = new Set(normNew.split(' ').filter(w => w.length > 3));
  for (const asked of askedList) {
    const normAsked = normalize(asked);
    if (normNew === normAsked) return true;
    const askedWords = new Set(normAsked.split(' ').filter(w => w.length > 3));
    if (askedWords.size === 0 || newWords.size === 0) continue;
    const overlap = [...newWords].filter(w => askedWords.has(w)).length;
    const similarity = overlap / Math.min(newWords.size, askedWords.size);
    if (similarity > 0.6) return true;
  }
  return false;
}

// ── Detect if a query needs web research ──────────────────────────────────────
// ── Detect if user is making a direct request vs answering a question ──────────
// This prevents Fidato from ignoring user questions and continuing its script
function isUserMakingDirectRequest(message) {
  const lowerMsg = (message || '').toLowerCase().trim();
  
  // Pattern 1: Direct action requests
  const actionRequests = [
    /(?:share|give|show|tell|provide|do|create|run|prepare|build|make|write)\s+(?:me\s+)?(?:a\s+)?(?:competitor|competitive|market|brand|swot|analysis|research|strategy|breakdown|report|insight|overview|comparison)/i,
    /(?:competitor|competitive|market)\s+(?:analysis|research|comparison|breakdown|landscape|overview|intelligence)/i,
    /(?:analyze|research|compare|evaluate|assess|audit)\s+(?:the\s+)?(?:competitor|market|brand|industry|competition)/i,
  ];
  
  // Pattern 2: Questions about competitors/market/trends
  const questionPatterns = [
    /(?:how|what|who|where|why|which)\s+(?:are|is|do|does|did|would|could|can)\s+(?:they|competitor|other brand|other compan|the market|the industry|similar brand)/i,
    /(?:how|what).*(?:doing|performing|working|trending|selling|marketing|advertising)/i,
    /(?:what|who).*(?:competition|competitor|rival|alternative)/i,
    /what(?:'s| is) (?:the |their |my )?(?:market|industry|trend|benchmark|best practice)/i,
  ];
  
  // Pattern 3: Imperative/command-style requests (not answering a question)
  const commandPatterns = [
    /^(?:share|give|show|tell|provide|do|create|run|analyze|research|compare|help|suggest|recommend|explain|break down|find out|look up|search for)/i,
    /(?:can you|could you|would you|please)\s+(?:share|give|show|tell|provide|do|create|run|analyze|research|compare|help|suggest|find)/i,
    /(?:i want|i need|i'd like)\s+(?:to know|to see|to understand|a|the|some|competitor|market|analysis|comparison)/i,
  ];

  return [...actionRequests, ...questionPatterns, ...commandPatterns].some(rx => rx.test(lowerMsg));
}

function needsWebResearch(message, intent) {
  const lowerMsg = (message || '').toLowerCase();
  const webTriggers = [
    /competitor|what.*(?:brand|compan).*doing/,
    /market.*trend|trend.*(?:market|industry)/,
    /industry.*(?:benchmark|data|stat)/,
    /what.*(?:work|strategy).*(?:for|in)/,
    /(?:best|popular|trending).*(?:campaign|strategy|approach)/,
    /research|analyze.*market|market.*research/,
    /(?:how|what).*(?:other|similar).*brand/,
    /latest.*(?:news|update|launch)/,
    /(?:average|typical).*(?:cost|price|budget|roi)/,
  ];
  // brand-strategy only uses web search if the user's message specifically asks for market data
  // (Don't force web search on every turn — it slows responses and risks malformed JSON)
  return webTriggers.some(rx => rx.test(lowerMsg));
}

// ── Build reinforcement context from feedback ─────────────────────────────────
function buildReinforcementContext(feedbackLog) {
  if (!feedbackLog?.length) return '';
  const liked = feedbackLog.filter(f => f.type === 'like');
  const disliked = feedbackLog.filter(f => f.type === 'dislike');
  let ctx = '';
  if (liked.length) {
    ctx += `\nUSER LOVED THESE CONCEPTS (generate MORE ideas like these):\n`;
    liked.forEach(f => { ctx += `  ✅ "${f.title}" — traits: ${f.traits || 'emotional, bold'}\n`; });
  }
  if (disliked.length) {
    ctx += `\nUSER REJECTED THESE CONCEPTS (generate DIFFERENT ideas, avoid similar approaches):\n`;
    disliked.forEach(f => { ctx += `  ❌ "${f.title}" — traits: ${f.traits || 'generic, corporate'}\n`; });
  }
  return ctx;
}

// ── MCoT Stage 1: Agentic Brand-Strategist Reasoning ───────────────────────
// Every question is AI-generated, contextual, and brand-aware.
// Fidato thinks like a senior brand strategist / CMO — not a chatbot.
// Now with: question dedup, web search grounding, reinforcement learning.
async function mcotReason(message, history, sessionState, brandCtx, brand, sseEmit) {
  const userMessages = history.filter(m => m.role === 'user');
  const userMessageCount = userMessages.length;
  const detectedIntent = sessionState.intent || detectIntentFromHistory(history, message);
  const brandName = brand?.name || '';
  const askedQuestions = sessionState.askedQuestions || [];
  const feedbackLog = sessionState.feedbackLog || [];

  // Helper to emit reasoning steps to frontend
  const emitStep = (step, icon = '🧠') => {
    if (sseEmit) sseEmit({ type: 'reasoning_step', step, icon });
  };

  // ── Deterministic override: force generate after enough context ────────────
  if (userMessageCount >= 5 && !sessionState.ideasGenerated) {
    const answers = buildAnswersFromHistory(history, message, sessionState);
    emitStep('Sufficient context gathered — preparing to generate', '✅');
    return {
      intent: detectedIntent,
      collectedAnswers: answers,
      readyToGenerate: true,
      action: detectedIntent === 'brand-strategy' ? 'generate_strategy' : 'generate_ideas',
      preGenerationMessage: `I've got a really clear picture now! Let me put together something brilliant for ${brandName || 'you'} 🔥`,
      fidatoResponse: `Here's what I came up with — take a look and tell me what you think!`,
      askedQuestions,
    };
  }

  // ── Post-generation actions (keyword-based, no AI needed) ─────────────────
  const lowerMsg = message.toLowerCase();
  if (sessionState.ideasGenerated) {
    // Deep Dive detection
    if (/deep.?dive|explore.*idea|go deeper|let.?s explore|drill down|analyze this|break.*down|detail/i.test(lowerMsg)) {
      // Figure out which idea to deep dive into
      const concepts = sessionState.lastIdeas?.filmConcepts || sessionState.lastIdeas?.campaignConcepts || [];
      let targetIdea = concepts[0]; // default to first
      if (concepts.length > 1) {
        const found = concepts.find(c =>
          lowerMsg.includes(c.title?.toLowerCase()) ||
          (lowerMsg.includes('first') && concepts.indexOf(c) === 0) ||
          (lowerMsg.includes('second') && concepts.indexOf(c) === 1) ||
          (lowerMsg.includes('third') && concepts.indexOf(c) === 2)
        );
        if (found) targetIdea = found;
      }
      return {
        intent: detectedIntent,
        collectedAnswers: sessionState.collectedAnswers || {},
        readyToGenerate: true,
        action: 'deep_dive',
        targetIdea,
        preGenerationMessage: `Let me do a thorough deep dive into "${targetIdea?.title || 'this idea'}" 🔬`,
        fidatoResponse: `Here's your deep dive! I've analyzed the competitive landscape, built an execution playbook, content brief, budget breakdown, and risk assessment. Want me to build a content calendar around this?`,
        askedQuestions,
      };
    }

    // Calendar/Strategy generation detection
    if (/calendar|schedule|plan.*week|content.*plan|posting.*plan|timeline|execution.*plan|create.*plan|build.*plan|strategy.*around/i.test(lowerMsg)) {
      const concepts = sessionState.lastIdeas?.filmConcepts || sessionState.lastIdeas?.campaignConcepts || [];
      return {
        intent: detectedIntent,
        collectedAnswers: sessionState.collectedAnswers || {},
        readyToGenerate: true,
        action: 'generate_calendar',
        targetIdea: sessionState.selectedIdea || concepts[0] || null,
        preGenerationMessage: `Building your content calendar! This will have a week-by-week plan with specific posts, platforms, and timings 📅`,
        fidatoResponse: `Your content calendar is ready! 4 weeks of specific, actionable content — each day mapped out with platform, format, and copy hooks. Want me to push this to your Smart Calendar?`,
        askedQuestions,
      };
    }

    if (/script|screenplay|write.*film|full.*script/.test(lowerMsg)) {
      return {
        intent: detectedIntent,
        collectedAnswers: sessionState.collectedAnswers || {},
        readyToGenerate: true,
        action: 'generate_screenplay',
        preGenerationMessage: `On it! Writing the full production-ready screenplay now ✍️`,
        fidatoResponse: `Here's your screenplay — every scene, shot direction, and music cue is mapped out.`,
        askedQuestions,
      };
    }
    if (/refine|change|different|improve|make it|try|maybe|how about|what if|more|less|another|other/.test(lowerMsg)) {
      return {
        intent: detectedIntent,
        collectedAnswers: { ...sessionState.collectedAnswers, refinementHint: message },
        readyToGenerate: true,
        action: 'refine_ideas',
        preGenerationMessage: `Got your feedback! Remixing with that direction 🔄`,
        fidatoResponse: `Here's the refined version — closer to what you had in mind?`,
        askedQuestions,
      };
    }
  }

  // ── Post-deep-dive: proactively suggest calendar ─────────────────────────
  if (sessionState.hasDeepDive && !sessionState.hasCalendar) {
    if (/calendar|schedule|plan|yes|sure|go ahead|let.?s do it|do it/i.test(lowerMsg)) {
      return {
        intent: detectedIntent,
        collectedAnswers: sessionState.collectedAnswers || {},
        readyToGenerate: true,
        action: 'generate_calendar',
        targetIdea: sessionState.selectedIdea || null,
        preGenerationMessage: `Great! Building your content calendar now 📅`,
        fidatoResponse: `Your content calendar is ready! Want me to push this to your Smart Calendar?`,
        askedQuestions,
      };
    }
  }

  // ── Detect if user is making a SPECIFIC REQUEST vs answering a question ────
  // If the user is asking for something specific (competitor analysis, market data,
  // strategy advice, etc.), Fidato should RESPOND to that, not ignore it.
  const isDirectRequest = isUserMakingDirectRequest(message);
  const useWebSearch = needsWebResearch(message, detectedIntent);
  if (isDirectRequest) console.log(`[fidato-chat] Direct request detected: "${message.slice(0, 50)}..."`);

  // ── Emit reasoning steps to frontend (optimized: skip redundant steps on follow-ups) ──
  // Brand DNA is already built in-memory from the frontend payload — no DB/Redis/MCP call needed.
  // Only show the "Analyzing DNA" step on the FIRST message when context needs to be established.
  const isFirstTurn = userMessageCount <= 1 && !sessionState.intent;

  if (isFirstTurn) {
    emitStep(`Analyzing ${brandName || 'brand'} DNA and context`, '🧬');
    await new Promise(r => setTimeout(r, 50));
  }

  if (isDirectRequest) {
    emitStep(`User is asking a specific question — prioritizing their request`, '🎯');
  } else if (isFirstTurn) {
    emitStep('Identifying strategic direction', '🎯');
  }

  if (useWebSearch) {
    emitStep('Searching the web for market intelligence...', '🌐');
  }

  // ── Build MCoT prompt with dedup ──────────────────────────────────────────
  const recentHistory = history.slice(-12).map(m =>
    `${m.role === 'fidato' ? 'FIDATO' : 'USER'}: ${(m.content || '').slice(0, 1000)}`
  ).join('\n');

  const knownAnswers = sessionState.collectedAnswers || {};
  const knownSummary = Object.entries(knownAnswers)
    .filter(([, v]) => v && typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `  - ${k}: ${v.slice(0, 150)}`)
    .join('\n');

  const reinforcementCtx = buildReinforcementContext(feedbackLog);

  // ── Build generation context summary ────────────────────────────────────────
  let generationCtx = '';
  if (sessionState.ideasGenerated && sessionState.lastIdeas) {
    const concepts = sessionState.lastIdeas.filmConcepts || sessionState.lastIdeas.campaignConcepts || [];
    if (concepts.length > 0) {
      generationCtx = `\n═══════════════════════════════════════════════════\nIDEAS YOU ALREADY GENERATED:\n═══════════════════════════════════════════════════\n${concepts.map((c, i) => `  ${i + 1}. ${c.title}: ${c.logline || c.hook || ''}`).join('\n')}\n`;
    }
  }
  if (sessionState.screenplayGenerated && sessionState.lastScreenplay) {
    generationCtx += `\n═══════════════════════════════════════════════════\nSCREENPLAY YOU ALREADY GENERATED:\n═══════════════════════════════════════════════════\n  - Title: "${sessionState.lastScreenplay.title}"\n  - Format: ${sessionState.lastScreenplay.format}\n`;
  }

  const dedupBlock = askedQuestions.length > 0
    ? `\n═══════════════════════════════════════════════════
QUESTIONS ALREADY ASKED (DO NOT REPEAT OR REPHRASE ANY OF THESE):
═══════════════════════════════════════════════════
${askedQuestions.map((q, i) => `  ${i + 1}. "${q}"`).join('\n')}

⚠️ You MUST ask a DIFFERENT question about a DIFFERENT topic. If you repeat or rephrase any of the above, the system will reject your response.
`
    : '';

  const systemPrompt = `You are FIDATO — a senior Brand Strategist and Creative Director with 15+ years experience at top agencies (Ogilvy, Wieden+Kennedy, Dentsu). You are NOT a chatbot. You are a brand expert who deeply understands this brand and thinks strategically about every question.

═══════════════════════════════════════════════════
BRAND DNA (Your deep knowledge of this brand):
═══════════════════════════════════════════════════
${brandCtx || 'No brand selected — ask about the brand first.'}

═══════════════════════════════════════════════════
SESSION CONTEXT:
═══════════════════════════════════════════════════
BRAINSTORM TYPE: ${detectedIntent}
USER MESSAGE COUNT: ${userMessageCount}
INFORMATION GATHERED SO FAR:
${knownSummary || '  (Nothing yet — this is the start of the conversation)'}
${dedupBlock}${generationCtx}${reinforcementCtx ? `
═══════════════════════════════════════════════════
REINFORCEMENT LEARNING (User's Preferences):
═══════════════════════════════════════════════════
${reinforcementCtx}` : ''}

═══════════════════════════════════════════════════
CONVERSATION HISTORY:
═══════════════════════════════════════════════════
${recentHistory || '(No history yet)'}
LATEST USER MESSAGE: "${message}"

═══════════════════════════════════════════════════
YOUR STRATEGIC FRAMEWORK — Think like a CMO:
═══════════════════════════════════════════════════

For each brainstorm type, you need SPECIFIC information before you can generate great ideas. Here's what a real strategist needs:

${getStrategicFramework(detectedIntent)}

═══════════════════════════════════════════════════
CRITICAL RULE — LISTEN TO THE USER FIRST:
═══════════════════════════════════════════════════

${isDirectRequest ? `⚠️ THE USER IS MAKING A SPECIFIC REQUEST. They said: "${message}"
You MUST respond directly to what they asked. Do NOT ignore their request and ask a scripted question.
If they ask for competitor analysis — give them competitor analysis.
If they ask about market trends — share market trends.
If they ask for advice — give advice.
Use "action": "direct_response" for this.
Your fidatoResponse should be a detailed, substantive answer (3-8 sentences) that actually addresses their request.
If you have web search data, include it. Be the expert they hired.` : `The user is currently in the information-gathering phase. Ask ONE smart, contextual question to advance the brief.`}

═══════════════════════════════════════════════════
YOUR TASK — Return a JSON object:
═══════════════════════════════════════════════════

STEP 1: READ the user's latest message carefully. What are they ACTUALLY asking?
STEP 2: If they're making a specific request or asking a question → use "action": "direct_response"
         If they're answering your previous question → decide: ask_question / generate_ideas / generate_strategy
STEP 3: CRAFT your response to match what THEY want, not what YOUR script says.

- Include a "reasoning" field explaining your strategic thought process (2-3 sentences).
- If asking a question: Write ONE sharp, contextual question that advances the brief.
- If responding directly: Give a substantive, expert answer that addresses their request.
- Generate 4-6 SHORT ANSWER CHIPS that the user can click to quickly reply to your question.

ACTIONS AVAILABLE:
- "ask_question" — Ask a strategic question to gather info (only use when appropriate)
- "direct_response" — Respond directly to the user's request/question with expert insight
- "generate_ideas" — Ready to generate campaign/film concepts
- "generate_strategy" — Ready to generate full brand strategy
- "deep_dive" — User wants to explore/deep-dive into a specific idea
- "generate_calendar" — User wants a content calendar or execution timeline

PIPELINE AWARENESS (Proactive suggestions):
- AFTER ideas are generated → suggest "Want me to deep dive into any of these?" or "Pick your favorite and I'll explore it further"
- AFTER deep dive → suggest "Shall I build a content calendar for the next 4 weeks?" or "Want me to create an execution timeline?"
- AFTER calendar → suggest "Want me to push this to your Smart Calendar?" or "Save this as a brand strategy?"
- ALWAYS include these as answerChips so the user can click to proceed

RULES:
1. 🔴 MOST IMPORTANT: If the user asks a SPECIFIC QUESTION or makes a REQUEST, ALWAYS respond with "direct_response" — NEVER ignore their message
2. NEVER ask generic questions when you know the brand's industry from DNA
3. ALWAYS reference specific brand details when relevant
4. answerChips must be SHORT ANSWERS (2-5 words) — NOT questions. They are clickable answers the user can tap.
   - BAD answerChips: ["What about budget?", "Who is the audience?", "What's the goal?"] — ❌ These are QUESTIONS, not answers!
   - GOOD answerChips: ["Brand awareness", "Product launch", "₹2L–5L budget", "Instagram + YouTube"] — ✅ These are short ANSWERS
5. Keep conversational responses concise (1-2 sentences). Keep direct_response answers detailed (3-8 sentences)
6. DO NOT use markdown formatting
7. Use emoji sparingly — max 1-2 per message
8. Ask the MOST IMPORTANT missing question first
9. When user gives 3+ meaningful data points, GENERATE — don't keep asking
10. NEVER repeat or rephrase a question from the QUESTIONS ALREADY ASKED list
11. If the user asks about competitors, market, trends, or anything specific — ANSWER IT, don't deflect

Return ONLY this JSON:
{
  "intent": "${detectedIntent}",
  "collectedAnswers": { "key": "extracted from this message" },
  "action": "ask_question | direct_response | generate_ideas | generate_strategy",
  "reasoning": "I know X and Y. The user is asking about Z, so I need to...",
  "fidatoResponse": "Your contextual response or answer here",
  "answerChips": ["Short answer option 1", "Short answer option 2", "Short answer option 3", "Short answer option 4"],
  "preGenerationMessage": null
}`;

  try {
    emitStep('Crafting strategic response...', '💡');

    const fastOpts = getFastModelOptions();
    let result;

    // ── Overall timeout: if AI providers are all failing, don't make user wait ──
    // NOTE: gemini-2.5-flash is a "thinking" model that needs 15-25s via Atlas Cloud
    const MCOT_TIMEOUT_MS = 30000; // 30 seconds max for MCoT reasoning
    console.log('[fidato-chat] MCoT reasoning started, timeout:', MCOT_TIMEOUT_MS, 'ms, fast provider:', JSON.stringify(fastOpts));
    const aiCallPromise = (async () => {
      if (useWebSearch) {
        try {
          const aiRouter = getRouter();
          const searchResult = await aiRouter.generateTextWithSearch({
            systemPrompt,
            userPrompt: `Analyze conversation and decide next action. Use web search to find relevant market data, competitor insights, or industry trends if applicable. Latest message: "${message}"`,
            temperature: 0.3,
            maxTokens: 1200,
            model: 'gemini-2.5-flash',
          });
          const text = searchResult.text;
          if (searchResult.citations?.length > 0) {
            emitStep(`Found ${searchResult.citations.length} web sources`, '📎');
            if (sseEmit) sseEmit({ type: 'citations', citations: searchResult.citations });
          }
          return text;
        } catch (searchErr) {
          console.warn('[fidato-chat] Web search failed, falling back:', searchErr.message);
          return await aiCall(systemPrompt, `Analyze conversation and decide next action. Latest message: "${message}"`, {
            temperature: 0.3, maxTokens: 1000,
            ...fastOpts,
          });
        }
      } else {
        return await aiCall(systemPrompt, `Analyze conversation and decide next action. Latest message: "${message}"`, {
          temperature: 0.3, maxTokens: 1000,
          ...fastOpts,
        });
      }
    })();

    // Prevent unhandled rejection if the timeout wins the race and the AI call later fails
    aiCallPromise.catch(err => {
      console.warn('[fidato-chat] Orphaned AI call eventually rejected (already timed out):', err.message);
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MCoT timeout: AI providers too slow, using deterministic fallback')), MCOT_TIMEOUT_MS)
    );

    result = await Promise.race([aiCallPromise, timeoutPromise]);
    console.log('[fidato-chat] MCoT AI call completed successfully, parsing result...');

    const parsed = parseJSON(result);

    if (parsed && parsed.fidatoResponse) {
      const action = parsed.action || 'ask_question';
      const isGenerate = action !== 'ask_question' && action !== 'general_chat' && action !== 'direct_response';

      // Emit the AI's reasoning to frontend
      if (parsed.reasoning) {
        emitStep(parsed.reasoning, '🧠');
        await new Promise(r => setTimeout(r, 10));
      }

      // ── DEDUP GUARD: Check if this question was already asked ─────────────
      let finalResponse = parsed.fidatoResponse;
      // Support both old field name (questionOptions) and new (answerChips) for backwards compat
      let finalOptions = parsed.answerChips || parsed.questionOptions || null;

      // ── SANITY CHECK: Ensure chips are short answers, not questions ───────
      // If the AI returned questions as chips, fall back to contextual answer chips from the library
      if (finalOptions && finalOptions.length > 0) {
        const chipsSanitized = finalOptions.filter(chip => {
          const trimmed = (chip || '').trim();
          // Reject chips that look like questions (end with ?, start with question words, or are longer than 55 chars)
          const isQuestion = trimmed.endsWith('?') ||
            /^(what|who|where|when|why|how|which|tell|describe|explain|do you|are you|is the|can you)/i.test(trimmed) ||
            trimmed.length > 55;
          return !isQuestion;
        });
        if (chipsSanitized.length >= 2) {
          finalOptions = chipsSanitized;
        } else {
          // All chips were questions — fall back to hardcoded contextual answer chips
          console.warn('[fidato-chat] AI returned question-style chips — using contextual fallback options');
          const fallbackData = getContextualFallbackQuestion(userMessageCount, detectedIntent, sessionState.collectedAnswers || {}, brand);
          finalOptions = fallbackData.options || null;
        }
      } else if (action === 'ask_question' && !finalOptions) {
        // No chips at all — provide fallback options
        const fallbackData = getContextualFallbackQuestion(userMessageCount, detectedIntent, sessionState.collectedAnswers || {}, brand);
        finalOptions = fallbackData.options || null;
      }

      const updatedAskedQuestions = [...askedQuestions];

      if (action === 'ask_question' && isSimilarQuestion(finalResponse, askedQuestions)) {
        console.warn('[fidato-chat] DEDUP: AI repeated a question, forcing different question');
        emitStep('Avoiding repeated question — finding new angle...', '🔄');
        try {
          const retryResult = await Promise.race([
            aiCall(
              systemPrompt + `\n\n‼️ CRITICAL: Your previous response was rejected because it repeated a question. You MUST ask about a COMPLETELY DIFFERENT TOPIC. Remember: answerChips must be SHORT ANSWERS (2-5 words) not questions.`,
              `Your last question was rejected as a duplicate. Ask about a DIFFERENT strategic topic. Message: "${message}"`,
              { temperature: 0.6, maxTokens: 800, ...fastOpts }
            ),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Dedup retry timeout')), 10000)),
          ]);
          const retryParsed = parseJSON(retryResult);
          if (retryParsed?.fidatoResponse && !isSimilarQuestion(retryParsed.fidatoResponse, askedQuestions)) {
            finalResponse = retryParsed.fidatoResponse;
            const retryChips = retryParsed.answerChips || retryParsed.questionOptions || null;
            finalOptions = retryChips || finalOptions;
          }
        } catch (retryErr) {
          console.warn('[fidato-chat] DEDUP retry failed/timed out, using original response:', retryErr.message);
          // Fall through — use the original (possibly repeated) response rather than hanging
        }
      }

      if (action === 'ask_question') {
        updatedAskedQuestions.push(finalResponse);
      }

      const mergedAnswers = {
        ...sessionState.collectedAnswers,
        ...(parsed.collectedAnswers || {}),
        ...extractAnswerFromMessage(message, sessionState.collectedAnswers || {}),
        [`turn_${userMessageCount}_answer`]: message,
      };

      if (isGenerate) {
        emitStep('Ready to generate — building creative concepts...', '✨');
      }

      return {
        intent: parsed.intent || detectedIntent,
        collectedAnswers: mergedAnswers,
        readyToGenerate: isGenerate,
        action,
        fidatoResponse: finalResponse,
        preGenerationMessage: parsed.preGenerationMessage || null,
        questionOptions: finalOptions,
        askedQuestions: updatedAskedQuestions,
        reasoning: parsed.reasoning || null,
      };
    }

    console.warn('[fidato-chat] MCoT returned incomplete JSON, using fallback reasoning');
  } catch (err) {
    console.error('[fidato-chat] MCoT AI reasoning failed:', err.message);
    console.error('[fidato-chat] Falling through to DETERMINISTIC FALLBACK — user will get a pre-built question');
  }

  // ── Deterministic fallback ─────────────────────────────────────────────────
  console.log('[fidato-chat] DETERMINISTIC FALLBACK activated for turn', userMessageCount, 'intent:', detectedIntent);
  const fallback = getContextualFallbackQuestion(userMessageCount, detectedIntent, sessionState.collectedAnswers || {}, brand);
  const mergedAnswers = {
    ...sessionState.collectedAnswers,
    ...extractAnswerFromMessage(message, sessionState.collectedAnswers || {}),
    [`turn_${userMessageCount}_answer`]: message,
  };

  return {
    intent: detectedIntent,
    collectedAnswers: mergedAnswers,
    readyToGenerate: false,
    action: 'ask_question',
    fidatoResponse: fallback.question,
    questionOptions: fallback.options,
    askedQuestions: [...askedQuestions, fallback.question],
  };
}

// ── Strategic frameworks per intent ──────────────────────────────────────────
// Guides the AI on what information a real strategist needs
function getStrategicFramework(intent) {
  const frameworks = {
    'product-launch': `PRODUCT LAUNCH — A brand strategist needs:
1. THE PRODUCT: What exactly is being launched? What category? Is it new-to-world or an extension?
2. USP/DIFFERENTIATOR: Why should anyone care? What makes this product different from 10 alternatives?
3. TARGET BUYER: Not demographics — the FIRST person who'll buy. Their pain point, their current solution.
4. LAUNCH CONTEXT: When is the launch? What's the occasion/anchor? What's the budget scale?
5. DESIRED REACTION: What should the first customer feel/do when they discover this product?
6. COMPETITIVE LANDSCAPE: Who else is in this space? What are they doing wrong?
Ask about the PRODUCT FIRST — you can't strategize without understanding what you're selling.`,

    'ad-film': `AD FILM / BRAND FILM — A creative director needs:
1. THE BRAND STORY: What does this brand stand for BEYOND its products? What's the emotional truth?
2. FILM PURPOSE: Is this selling a product, building brand image, launching something, or celebrating an occasion?
3. TARGET VIEWER: Who needs to FEEL something watching this? What's their current emotional state?
4. EMOTIONAL HOOK: What specific emotion drives action? (goosebumps, laughter, tears, pride)
5. TONE & STYLE: Reference films/ads they love. This determines cinematic approach.
6. FORMAT: Duration, platform, number of script concepts needed.
7. PRODUCTION SCALE: Budget determines guerrilla vs. cinematic approach.
Start with WHY the film is being made, then WHO it's for, then the EMOTIONAL core.`,

    'campaign': `MARKETING CAMPAIGN — A strategist needs:
1. CAMPAIGN SUBJECT: What specific product, service, or event are we promoting?
2. CAMPAIGN GOAL: What measurable outcome? (sales, followers, downloads, footfall)
3. TARGET AUDIENCE: Who specifically? Their behavior, not just demographics.
4. EMOTIONAL TRIGGER: What should people FEEL when they see this campaign?
5. DIFFERENTIATOR: What can this brand say that competitors cannot?
6. CHANNELS & BUDGET: Where will this run? What's the budget scale?
Ask about the SPECIFIC thing being campaigned first — not generic brand questions.`,

    'naming': `NAMING — A naming specialist needs:
1. NAMING TARGET: What needs a name? (product, brand, campaign, collection, event)
2. CATEGORY CONTEXT: What does it do? What space is it in?
3. PERSONALITY: If this were a person, how would they introduce themselves?
4. LANGUAGE TERRITORY: English, Hindi, Hinglish, regional, invented word?
5. VIBE WORDS: 3-5 adjectives that capture the desired feeling.
6. AVOID LIST: What should the name NOT sound like?
Start with WHAT needs naming and the category context.`,

    'brand-strategy': `BRAND STRATEGY — A CMO needs:
1. PRIMARY OBJECTIVE: ONE specific measurable goal (e.g., 5K→50K followers, ₹5L→₹15L monthly revenue)
2. CURRENT STATE: Where does the brand stand today? (followers, revenue, traffic, team size)
3. TARGET AUDIENCE: Who and where do they spend attention online?
4. BUDGET & TIMELINE: Monthly budget and strategy duration (1-month or 3-month)
5. CHANNEL PREFERENCES: Active channels, channels to explore
6. TEAM CAPABILITY: Solo founder or full marketing team?
Start with the GOAL, then current reality, then constraints.`,

    'festival': `FESTIVAL CAMPAIGN — A strategist needs:
1. WHICH FESTIVAL: And what does this festival mean to YOUR specific audience?
2. PRODUCT FIT: Why should people think of this brand during this festival?
3. CAMPAIGN VIBE: Traditional warmth? Modern twist? Party energy? Luxury gifting?
4. GOAL: Sales-driven or brand-love driven?
5. OFFER/HOOK: What's the irresistible reason to act NOW?
Start with the FESTIVAL and how the brand naturally connects to it.`,

    'offer': `OFFER/PROMOTION STRATEGY — A strategist needs:
1. WHAT'S BEING SOLD: Product, price point, margin constraints
2. WHY NOW: What business problem does this offer solve?
3. BUYER PSYCHOLOGY: What makes these customers finally click "buy"?
4. COMPETITIVE CONTEXT: What are competitors offering?
5. CONSTRAINTS: Minimum margins, shipping limits, platform restrictions
Start with the business PROBLEM — why do you need this offer?`,

    'positioning': `BRAND POSITIONING — A strategist needs:
1. BRAND TRUTH: What does this brand do, in honest simple words?
2. COMPETITIVE SET: Who are you REALLY competing with? (direct + indirect)
3. UNTOLD STRENGTH: What proud truth hasn't been shouted about enough?
4. ENEMY: What problem or wrong belief does this brand fight?
5. DESIRED PERCEPTION: "People should choose us because we're the only ones who ___"
Start with what the brand ACTUALLY does and who they compete with.`,

    'custom': `CUSTOM BRAINSTORM — You need to understand:
1. THE IDEA: What's on their mind? What problem are they trying to solve?
2. AUDIENCE: Who needs to care about the outcome?
3. SUCCESS METRIC: If this goes perfectly, what does that look like?
4. CONSTRAINTS: Budget, time, team, approvals
Start with understanding the CORE IDEA or problem.`,
  };

  return frameworks[intent] || frameworks.custom;
}

// ── Intent detector from keywords ──────────────────────────────────────────────
function detectIntentFromHistory(history, latestMessage) {
  const allText = [...history.map(m => m.content || ''), latestMessage].join(' ').toLowerCase();
  if (/ad.?film|brand.?film|tvc|script|commercial|short.?film|reel.*story/.test(allText)) return 'ad-film';
  if (/campaign|marketing|launch.?campaign|social.?media.?campaign/.test(allText)) return 'campaign';
  if (/product.?launch|launch|new.?product/.test(allText)) return 'product-launch';
  if (/naming|name|rename|brand.?name|product.?name/.test(allText)) return 'naming';
  if (/brand.?strategy|strategy|1.?month|3.?month|marketing.?plan/.test(allText)) return 'brand-strategy';
  if (/festival|diwali|holi|navratri|christmas|eid|occasion/.test(allText)) return 'festival';
  if (/offer|discount|promotion|deal/.test(allText)) return 'offer';
  if (/position|differentiat|market.?fit/.test(allText)) return 'positioning';
  return 'campaign';
}

// ── Extract answers already visible in the messages ───────────────────────────
function buildAnswersFromHistory(history, latestMessage, sessionState) {
  const base = sessionState.collectedAnswers || {};
  const allUserText = history.filter(m => m.role === 'user').map(m => m.content || '').join(' ') + ' ' + latestMessage;
  return { ...base, context: allUserText.slice(0, 800) };
}

// ── Extract a single answer from the latest message ───────────────────────────
function extractAnswerFromMessage(message, existing) {
  const lowerMsg = message.toLowerCase();
  const updates = {};
  if (!existing.emotion && /excit|happy|proud|nostalg|funny|humour|humor|emo|feel|love|inspire|aspir|urgent|fomo|tear|goosebump|laugh/.test(lowerMsg)) {
    updates.emotion = message;
  }
  if (!existing.audience && /age|year|men|women|youth|teen|family|parent|professional|urban|rural|student|millennial|gen.?z|boomer/.test(lowerMsg)) {
    updates.audience = message;
  }
  if (!existing.product && /product|brand|sell|launch|drink|food|app|service|cloth|skincare|tech|fashion|jewel|snack|supplement/.test(lowerMsg)) {
    updates.product = message;
  }
  if (!existing.objective && /goal|objective|want|need|achiev|grow|increase|boost|reach|target|revenue|sale|follower|lead/.test(lowerMsg)) {
    updates.objective = message;
  }
  if (!existing.budget && /budget|₹|lakh|crore|thousand|money|invest|spend|afford/.test(lowerMsg)) {
    updates.budget = message;
  }
  if (!existing.usp && /usp|unique|different|special|only|first|better|advantage|stand.?out/.test(lowerMsg)) {
    updates.usp = message;
  }
  return updates;
}

// ── Contextual fallback questions (AI-less, but still brand-aware) ───────────
// Used ONLY when AI reasoning completely fails
function getContextualFallbackQuestion(turnIndex, intent, collected, brand) {
  const brandName = brand?.name || 'your brand';
  const industry = brand?.dna?.industry || '';
  const audience = brand?.dna?.targetAudience || '';

  // Build contextual awareness into fallback
  const context = industry ? ` (since ${brandName} is in ${industry})` : '';

  const fallbacksByIntent = {
    'product-launch': [
      { question: `Tell me about the product you're launching for ${brandName}${context}. What is it, and what makes it special?`, options: ['New product in existing category', 'Completely new category for us', 'An upgrade/premium version', 'A limited edition', 'A bundle/combo', 'Let me describe it'] },
      { question: `Who is the day-one buyer for this product? Not your dream audience — the person who buys FIRST.`, options: ['Existing loyal customers', 'People switching from competitors', 'First-time buyers in this category', 'Early adopters who try everything new', 'Specific demographic — let me describe'] },
      { question: `What's the biggest reason someone would NOT buy this product? Be honest — this helps me craft the right messaging.`, options: ['Price concern — seems expensive', 'Don\'t know our brand yet', 'Already using a competitor', 'Don\'t see the need', 'Availability / access', 'Quality doubt — new brand'] },
      { question: `When does this need to launch? And what's the scale we're thinking?`, options: ['This week — urgent', 'Within 2-4 weeks', 'Next festival season', 'Next month', 'No rush — get it right'] },
    ],
    'ad-film': [
      { question: `What's the purpose of this film for ${brandName}? Are we selling a specific product, building brand love, or marking an occasion?`, options: ['Launching a new product', 'Building brand awareness/love', 'Festive/occasion film', 'Sale or offer promotion', 'Brand anthem / manifesto', 'Social experiment concept'] },
      { question: `${audience ? `I know ${brandName} targets ${audience}` : `Who is ${brandName}'s audience`} — but who specifically needs to be MOVED by this film?`, options: ['Young aspirational audience (18-28)', 'Working professionals (25-40)', 'Families and parents', 'Women specifically', 'Premium/luxury buyers', 'Mass market — everyone'] },
      { question: `What should the viewer FEEL after watching? Not what they should think — what emotion hits them?`, options: ['Goosebumps — pride, inspiration', 'Laughter — genuine humor', 'Warmth — nostalgia, family', 'Aspiration — want to level up', 'Surprise — unexpected twist', 'Empowerment — confidence'] },
      { question: `What's the format and how many concepts should I draft?`, options: ['30-sec sharp film — 3 concepts', '60-sec digital film — 3 concepts', '90-sec brand film — 2 concepts', 'Instagram Reel (15-30s) — 4 concepts', 'Multiple formats'] },
    ],
    'campaign': [
      { question: `What specifically are we creating this campaign for${context}? A product, a sale, a brand moment?`, options: ['Specific product promotion', 'New launch announcement', 'Seasonal/festive push', 'Brand awareness', 'Sale/offer driven', 'Something else'] },
      { question: `${audience ? `${brandName} targets ${audience}` : 'Who are we targeting'} — but what should they DO after seeing this campaign?`, options: ['Buy immediately', 'Visit our website/store', 'Follow us on social', 'Share with friends', 'Sign up / download app', 'Remember us for later'] },
      { question: `What's the primary emotion we're going for? This drives the creative direction.`, options: ['FOMO — urgency and scarcity', 'Aspiration — I want that life', 'Trust — this brand is reliable', 'Fun — entertaining and shareable', 'Pride — identity and belonging', 'Curiosity — what is this?'] },
    ],
    'brand-strategy': [
      { question: `What's THE ONE goal this strategy needs to achieve for ${brandName}? Be specific — numbers help.`, options: ['Grow revenue by 30%+ in 3 months', 'Get to 10K+ engaged followers', '200+ qualified leads per month', 'Launch in new market/city', 'Build brand from zero awareness', 'Improve customer retention'] },
      { question: `Where does ${brandName} stand today? Give me the real numbers — followers, traffic, revenue, team size.`, options: ['Just starting — minimal presence', 'Some traction — 1-5K followers', 'Growing — 5-25K followers', 'Established — 25K+ followers', 'Strong offline, weak online', 'Let me share details'] },
      { question: `What's the monthly marketing budget we're designing around?`, options: ['Under ₹1L — bootstrapped', '₹1-5L — moderate', '₹5-20L — serious investment', '₹20L-1Cr — aggressive growth', '₹1Cr+ — enterprise', 'Flexible — recommend for me'] },
    ],
  };

  const fallbacks = fallbacksByIntent[intent] || fallbacksByIntent.campaign || [
    { question: `Tell me more about what you're looking to brainstorm for ${brandName}. The more context you give me, the sharper my ideas will be.`, options: ['Product campaign', 'Brand awareness', 'Sales and offers', 'Content strategy', 'Social media growth', 'Something specific — let me explain'] },
  ];

  const idx = Math.min(Math.max(0, turnIndex), fallbacks.length - 1);
  return fallbacks[idx];
}

// ── Inline idea generation (mirrors /generate route logic) ─────────────────────
async function generateIdeasInline(intent, answers, brand) {
  const dna = brand?.dna || {};
  const brandContext = brand
    ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}. Description: ${dna.brandDescription || 'N/A'}. Country: ${dna.country || 'India'}.`
    : '';

  const answersText = Object.entries(answers).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
  const isAdFilm = intent === 'ad-film';
  const isNaming = intent === 'naming';

  let scriptCount = 3;
  if (isAdFilm && answers.scriptCount) {
    const n = parseInt(String(answers.scriptCount).replace(/\D/g, ''));
    if (n >= 2 && n <= 5) scriptCount = n;
  }

  let outputFormat;
  if (isAdFilm) {
    outputFormat = `{
  "filmConcepts": [
    {
      "title": "Concept name",
      "logline": "One-line hook",
      "synopsis": "3-4 sentence story arc",
      "emotion": "Core emotion",
      "format": "60-sec Digital Film",
      "visualStyle": "Cinematic warm tones / Raw handheld / etc",
      "openingShot": "First shot description",
      "closingShot": "Final shot + brand reveal",
      "castSuggestion": "Who stars in this",
      "musicMood": "Music direction",
      "targetPlatform": "YouTube / Instagram / TV",
      "scores": { "virality": 8, "emotionalConnect": 9, "brandRecall": 7, "easeOfProduction": 6 }
    }
  ],
  "productionApproaches": [
    { "filmRef": "Concept title", "lowBudget": "...", "midBudget": "...", "highBudget": "..." }
  ],
  "namingIdeas": { "filmTitles": [], "taglines": [], "hashtags": [] },
  "followUpSuggestions": ["Make it more emotional", "Try a humorous version", "Shorten to 30 seconds"]
}`;
  } else if (isNaming) {
    outputFormat = `{
  "campaignConcepts": [{ "title": "Direction name", "hook": "Creative angle", "description": "2-3 sentences", "targetPersona": "Who this appeals to", "visualDirection": "Aesthetic", "platforms": ["Packaging"], "scores": { "virality": 8, "salesImpact": 7, "emotionalConnect": 9, "easeOfExecution": 6 } }],
  "namingIdeas": {
    "premiumEnglish": [{"name": "Name", "meaning": "Why it works"}],
    "culturalInspired": [{"name": "Name", "meaning": "Cultural significance"}],
    "modernMinimal": [{"name": "Name", "meaning": "Why it works"}],
    "emotional": [{"name": "Name", "meaning": "Emotional connection"}],
    "taglines": ["Tagline 1", "Tagline 2"]
  },
  "followUpSuggestions": ["More playful names", "Try Hindi-inspired", "Make shorter"]
}`;
  } else {
    outputFormat = `{
  "campaignConcepts": [
    {
      "title": "Campaign theme",
      "hook": "1-line emotional hook",
      "description": "2-3 sentence concept",
      "targetPersona": "Specific audience segment",
      "visualDirection": "Visual style",
      "platforms": ["Instagram", "YouTube"],
      "scores": { "virality": 8, "salesImpact": 7, "emotionalConnect": 9, "easeOfExecution": 6 }
    }
  ],
  "tacticalIdeas": [
    { "campaignRef": "Campaign title", "reelIdea": "Reel concept", "influencerAngle": "How to use creators", "hashtag": "#Tag", "contestIdea": "Contest mechanic", "ugcPrompt": "UGC prompt" }
  ],
  "namingIdeas": { "campaignNames": [], "taglines": [], "hashtags": [] },
  "executionPlan": {
    "phases": [{ "name": "Tease", "duration": "X days", "actions": [] }, { "name": "Launch", "duration": "X days", "actions": [] }, { "name": "Sustain", "duration": "X days", "actions": [] }],
    "contentMap": { "posts": 3, "reels": 2, "stories": 5 },
    "launchDayStrategy": "Launch day plan"
  },
  "followUpSuggestions": ["Make it bolder", "Lower-budget version", "Youth focus"]
}`;
  }

  const systemPrompt = `You are an elite creative director and brand strategist. Generate BOLD, SPECIFIC, CULTURALLY RELEVANT ideas. Be concise — quality over quantity. Keep each field SHORT.
${isAdFilm ? `Generate exactly ${scriptCount} distinct film concepts with very different emotional angles. Think like an award-winning director.` : `Generate EXACTLY 3 campaign concepts with sharp tactical hooks. You MUST return 3 concepts, not fewer.`}
IMPORTANT RULES:
- Each concept MUST include a "scores" object with ALL score keys filled with realistic values (5-10 scale). NEVER use 0. Rate honestly.
- Keep string values SHORT — max 2 sentences each.
- Return VALID JSON only. No markdown, no backticks, no explanation.
Respond in this EXACT JSON format:
${outputFormat}`;

  const actResult = await aiCall(systemPrompt, `Intent: ${intent}\n${brandContext}\n\nBrief:\n${answersText}`, {
    temperature: 0.85, maxTokens: 6000,
  });
  try {
    return parseJSON(actResult) || {};
  } catch (err) {
    console.error('[generateIdeasInline] JSON parse failed, attempting partial recovery:', err.message);
    // Try to at least extract filmConcepts or campaignConcepts arrays
    const partial = {};
    const filmMatch = actResult.match(/"filmConcepts"\s*:\s*(\[.*?\])(?=\s*[,}])/s);
    const campMatch = actResult.match(/"campaignConcepts"\s*:\s*(\[.*?\])(?=\s*[,}])/s);
    if (filmMatch) { try { partial.filmConcepts = JSON.parse(filmMatch[1]); } catch {} }
    if (campMatch) { try { partial.campaignConcepts = JSON.parse(campMatch[1]); } catch {} }
    if (partial.filmConcepts || partial.campaignConcepts) return partial;
    return {};
  }
}

// ── Inline screenplay generation ───────────────────────────────────────────────
async function generateScreenplayInline(filmConcept, brand) {
  const brandContext = brand
    ? `Brand: ${brand.name}. Voice: ${brand.dna?.voice?.personality || 'professional'}. Target: ${brand.dna?.targetAudience || 'N/A'}. Country: ${brand.dna?.country || 'India'}.`
    : '';

  const systemPrompt = `You are an award-winning ad film scriptwriter. Write a production-ready screenplay.
Rules: Scene-by-scene with visual descriptions + dialogue. Include camera directions. Include music/sound cues. End with brand logo reveal + tagline. Make it emotionally powerful.
Respond in JSON:
{
  "title": "Film title", "format": "Duration", "totalScenes": 5,
  "scenes": [{ "sceneNumber": 1, "duration": "0:00-0:08", "location": "INT. KITCHEN - MORNING", "visual": "What we see", "action": "What happens", "dialogue": "VO or dialogue", "cameraDirection": "CLOSE UP", "music": "Music mood", "mood": "Emotional tone" }],
  "endCard": { "visual": "Brand logo reveal", "tagline": "End line", "superText": "Any text overlay" },
  "directorNotes": "Overall direction — casting, color palette, pacing",
  "estimatedBudget": { "low": "Low-budget version", "mid": "Mid approach", "high": "Full production" }
}`;

  const userPrompt = `Film: ${filmConcept.title}\nLogline: ${filmConcept.logline || ''}\nSynopsis: ${filmConcept.synopsis || ''}\nFormat: ${filmConcept.format || '60 sec'}\nVisual Style: ${filmConcept.visualStyle || ''}\nEmotion: ${filmConcept.emotion || ''}\n${brandContext}`;

  const result = await aiCall(systemPrompt, userPrompt, { temperature: 0.7, maxTokens: 4000 });
  try { return parseJSON(result) || {}; } catch { return {}; }
}

// ── Inline strategy generation ─────────────────────────────────────────────────
async function generateStrategyInline(answers, brand) {
  const dna = brand?.dna || {};
  const brandContext = brand
    ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Audience: ${dna.targetAudience || 'N/A'}. Country: ${dna.country || 'India'}.`
    : '';
  const answersText = Object.entries(answers).filter(([,v]) => v).map(([k,v]) => `${k}: ${v}`).join('\n');
  const duration = (answers.duration || '').toLowerCase().includes('3') ? '3-month' : '1-month';

  const systemPrompt = `You are a world-class CMO and Brand Strategist. Create a practical, measurable ${duration} brand strategy. Every number must have a logical basis — show your math.
Respond in JSON with these keys: title, executive_summary, objective, duration, budget_total, target_kpis (array of {metric, current, target, achievability, rationale}), channel_strategy (array of {channel, budget_pct, budget_amount, why, expected_output, tactics}), content_plan ({weekly_cadence, content_types, pillar_themes}), quick_wins (array of {action, effort, impact, timeline}), risk_factors (array), channel_synergy (string explaining how channels reinforce each other)`;

  const result = await aiCall(systemPrompt, `${brandContext}\n\nBrief:\n${answersText}`, {
    temperature: 0.6, maxTokens: 4000,
  });
  try { return parseJSON(result) || {}; } catch { return {}; }
}

// ── POST /api/brainstorm-studio/fidato-chat — Main conversational SSE endpoint ──
router.post('/fidato-chat', protect, requireStudio('brainstormStudio'), async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  try { res.flushHeaders(); } catch {}

  const { message, history = [], sessionState = {}, brand, sessionId } = req.body;

  const onClose = () => { try { res.end(); } catch {} };
  req.on('close', onClose);

  // Hard safety timeout: if the ENTIRE handler hasn't finished in 45s, force-close with an error
  let handlerFinished = false;
  const safetyTimeout = setTimeout(() => {
    if (handlerFinished) return;
    console.error('[fidato-chat] ⚠️ SAFETY TIMEOUT — handler exceeded 45s, force-closing SSE');
    try {
      sseEvent(res, { type: 'error', message: 'AI providers are temporarily unavailable. Please try again in a moment.' });
      sseEvent(res, { type: 'done', sessionState: sessionState });
      res.end();
    } catch {}
  }, 45000);

  try {
    const brandCtx = buildCtx(brand);

    // SSE emitter for reasoning steps
    const sseEmit = (data) => sseEvent(res, data);

    // ── Session persistence: find or create ────────────────────────────────
    let session = null;
    const userId = req.user?._id;
    const brandId = brand?._id;
    if (userId && brandId) {
      if (sessionId) {
        session = await BrainstormSession.findOne({ _id: sessionId, user: userId });
      }
      if (!session) {
        // Create a new session on first message
        const intentGuess = sessionState.intent || detectIntentFromHistory(history, message);
        const INTENT_TITLES = {
          'ad-film': '🎬 Ad Film', campaign: '📢 Campaign', 'product-launch': '🚀 Product Launch',
          naming: '🏷️ Naming', 'brand-strategy': '📊 Brand Strategy', festival: '🎉 Festival',
          offer: '💰 Offer', positioning: '🎯 Positioning', custom: '💡 Brainstorm',
        };
        const titlePrefix = INTENT_TITLES[intentGuess] || '💡 Brainstorm';
        const titleSnippet = message.length > 40 ? message.slice(0, 37) + '...' : message;
        session = await BrainstormSession.create({
          user: userId,
          brand: brandId,
          title: `${titlePrefix}: ${titleSnippet}`,
          intent: intentGuess,
          sessionState: sessionState,
          messages: [],
        });
      }

      // Save user message to session
      session.messages.push({ role: 'user', content: message, timestamp: new Date() });
      session.lastMessageAt = new Date();
    }

    // Emit sessionId to frontend so it can track
    if (session) {
      sseEvent(res, { type: 'session_id', sessionId: session._id.toString() });
    }

    // ── STAGE 1: MCoT Reasoning ─────────────────────────────────────────────
    const reasoning = await mcotReason(message, history, sessionState, brandCtx, brand, sseEmit);
    console.log('[fidato-chat] MCoT reasoning completed, extracting action...');
    const {
      action = 'ask_question',
      fidatoResponse = "Tell me more!",
      preGenerationMessage,
      collectedAnswers = {},
      intent = sessionState.intent || 'custom',
      questionOptions = null,
      askedQuestions = sessionState.askedQuestions || [],
      reasoning: reasoningText = null,
      targetIdea = null,
    } = reasoning;
    console.log(`[fidato-chat] Action: ${action}, Intent: ${intent}, Response length: ${fidatoResponse?.length || 0}`);

    const newSessionState = {
      ...sessionState,
      intent,
      collectedAnswers: { ...sessionState.collectedAnswers, ...collectedAnswers },
      askedQuestions,
      feedbackLog: sessionState.feedbackLog || [],
    };

    // Signal end of reasoning phase
    sseEvent(res, { type: 'reasoning_done' });

    // ── Helper: save Fidato message to session ────────────────────────────
    const saveFidatoMsg = async (content, extras = {}) => {
      if (!session) return;
      session.messages.push({ role: 'fidato', content: content || '', timestamp: new Date(), ...extras });
    };

    // ── STAGE 2: Execute Action ─────────────────────────────────────────────

    if (action === 'ask_question' || action === 'general_chat') {
      await streamWords(res, fidatoResponse);
      await saveFidatoMsg(fidatoResponse, { questionOptions: questionOptions || undefined });
      sseEvent(res, {
        type: 'done',
        sessionState: newSessionState,
        questionOptions: questionOptions || null,
      });

    } else if (action === 'generate_ideas') {
      const preMsg = preGenerationMessage || "Okay, I have enough to work with! Give me a moment to cook up some ideas 🔥";
      await streamWords(res, preMsg);
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: 'Building creative strategy framework...', icon: '🏗️' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Generating campaign concepts with scoring...', icon: '✨' });

      const reinforcedAnswers = { ...newSessionState.collectedAnswers };
      const reinforcement = buildReinforcementContext(sessionState.feedbackLog || []);
      if (reinforcement) reinforcedAnswers._reinforcement = reinforcement;

      const ideas = await generateIdeasInline(intent, reinforcedAnswers, brand);

      sseEmit({ type: 'reasoning_step', step: `Generated ${(ideas.campaignConcepts || ideas.filmConcepts || []).length} concepts`, icon: '🎯' });
      sseEvent(res, { type: 'ideas', payload: ideas, intent });

      const postMsg = fidatoResponse || "Here's what I came up with! Pick your favorite and I can deep dive into it, or I can refine these further 🔥";
      await streamWords(res, postMsg);

      const finalState = { ...newSessionState, ideasGenerated: true, lastIdeas: ideas };
      await saveFidatoMsg(postMsg, { ideasPayload: ideas, intent });
      if (session) {
        session.ideaCount = (ideas.campaignConcepts || ideas.filmConcepts || []).length;
        session.sessionState = finalState;
      }
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'deep_dive') {
      // ── NEW: Deep Dive into a specific idea ─────────────────────────────
      const idea = targetIdea || sessionState.lastIdeas?.filmConcepts?.[0] || sessionState.lastIdeas?.campaignConcepts?.[0];
      if (!idea) {
        await streamWords(res, "I need some ideas first! Let me generate concepts and then we can deep-dive into your favorite 🔬");
        sseEvent(res, { type: 'done', sessionState: newSessionState });
        return res.end();
      }

      await streamWords(res, preGenerationMessage || `Diving deep into "${idea.title}"... analyzing the competitive landscape, building your execution playbook, and crunching the numbers 🔬`);
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: `Researching competitive landscape for "${idea.title}"...`, icon: '🌐' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Building execution playbook...', icon: '📋' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Drafting content brief and budget breakdown...', icon: '💰' });

      const deepDive = await generateDeepDiveInline(idea, brand, intent);
      sseEvent(res, { type: 'deep_dive', payload: deepDive });

      const postMsg = fidatoResponse || `Here's your deep dive into "${idea.title}"! I've covered the competitive landscape, execution playbook, content brief, budget, and risks. Want me to build a content calendar around this? 📅`;
      await streamWords(res, postMsg);

      const finalState = {
        ...newSessionState,
        selectedIdea: idea,
        hasDeepDive: true,
        lastDeepDive: deepDive,
      };
      await saveFidatoMsg(postMsg, { deepDivePayload: deepDive });
      if (session) {
        session.selectedIdea = idea;
        session.deepDive = deepDive;
        session.hasDeepDive = true;
        session.sessionState = finalState;
      }
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'generate_calendar') {
      // ── NEW: Content Calendar Generation ────────────────────────────────
      const idea = targetIdea || sessionState.selectedIdea || sessionState.lastIdeas?.campaignConcepts?.[0] || sessionState.lastIdeas?.filmConcepts?.[0];
      const deepDiveCtx = sessionState.lastDeepDive || null;

      await streamWords(res, preGenerationMessage || `Building your content calendar! Week-by-week, platform-by-platform — every post planned 📅`);
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: 'Mapping 4-week content timeline...', icon: '📅' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Assigning platform-specific posts...', icon: '📱' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Writing copy hooks and hashtags...', icon: '✍️' });

      const calendar = await generateCalendarInline(idea, deepDiveCtx, brand, intent);
      sseEvent(res, { type: 'calendar', payload: calendar });

      const postMsg = fidatoResponse || `Your 4-week content calendar is ready! Every day has specific posts mapped with platform, format, time, and copy hooks. Want me to push this to your Smart Calendar? 🚀`;
      await streamWords(res, postMsg);

      const finalState = {
        ...newSessionState,
        hasCalendar: true,
        lastCalendar: calendar,
      };
      await saveFidatoMsg(postMsg, { calendarPayload: calendar });
      if (session) {
        session.calendar = calendar;
        session.hasCalendar = true;
        session.sessionState = finalState;
      }
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'generate_screenplay') {
      const concepts = sessionState.lastIdeas?.filmConcepts || [];
      let targetConcept = concepts[0];
      if (concepts.length > 1 && message) {
        const lowerMsg = message.toLowerCase();
        const found = concepts.find(c =>
          lowerMsg.includes(c.title?.toLowerCase()) ||
          lowerMsg.includes('first') && concepts.indexOf(c) === 0 ||
          lowerMsg.includes('second') && concepts.indexOf(c) === 1 ||
          lowerMsg.includes('third') && concepts.indexOf(c) === 2
        );
        if (found) targetConcept = found;
      }

      if (!targetConcept) {
        await streamWords(res, "Hmm, I need a film concept first! Let me generate some ideas and then we can pick one to script 🎬");
        sseEvent(res, { type: 'done', sessionState: newSessionState });
        return res.end();
      }

      await streamWords(res, preGenerationMessage || `Writing the full screenplay for "${targetConcept.title}"... this is going to be 🔥`);
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: `Scripting "${targetConcept.title}" — mapping scenes, dialogue, camera...`, icon: '🎬' });

      const screenplay = await generateScreenplayInline(targetConcept, brand);
      sseEvent(res, { type: 'screenplay', payload: screenplay, conceptTitle: targetConcept.title });

      const postMsg = fidatoResponse || "Here's your full production screenplay! Every scene, shot direction, and music cue is in there. Want me to deep dive into this concept or build a content calendar? 📅";
      await streamWords(res, postMsg);

      const finalState = { ...newSessionState, screenplayGenerated: true, lastScreenplay: screenplay };
      await saveFidatoMsg(postMsg, { screenplayPayload: screenplay });
      if (session) session.sessionState = finalState;
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'generate_strategy') {
      await streamWords(res, preGenerationMessage || "Alright, building your complete brand strategy! This one takes a moment ✍️");
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: 'Researching market landscape...', icon: '🌐' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Allocating budget across channels...', icon: '📊' });
      await new Promise(r => setTimeout(r, 10));
      sseEmit({ type: 'reasoning_step', step: 'Calculating target KPIs...', icon: '🎯' });

      const strategy = await generateStrategyInline(newSessionState.collectedAnswers, brand);
      sseEvent(res, { type: 'strategy', payload: strategy });

      const postMsg = fidatoResponse || "Your full strategy is ready! Every channel has a budget, every target has a calculation behind it. Want me to explain any part?";
      await streamWords(res, postMsg);

      const finalState = { ...newSessionState, ideasGenerated: true, lastStrategy: strategy };
      await saveFidatoMsg(postMsg, { strategyPayload: strategy });
      if (session) session.sessionState = finalState;
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'refine_ideas') {
      const currentIdeas = sessionState.lastIdeas;
      if (!currentIdeas) {
        await streamWords(res, "Let me generate some ideas first, then we can refine them together!");
        sseEvent(res, { type: 'done', sessionState: newSessionState });
        return res.end();
      }

      await streamWords(res, preGenerationMessage || "Got it! Let me remix these with your feedback 🔄");
      sseEvent(res, { type: 'thinking' });

      sseEmit({ type: 'reasoning_step', step: 'Applying your feedback to reshape concepts...', icon: '🔄' });

      const reinforcement = buildReinforcementContext(sessionState.feedbackLog || []);
      const refinedAnswers = { ...newSessionState.collectedAnswers, refinementHint: message };
      if (reinforcement) refinedAnswers._reinforcement = reinforcement;

      const refined = await generateIdeasInline(intent, refinedAnswers, brand);
      sseEvent(res, { type: 'ideas', payload: refined, intent });

      const postMsg = fidatoResponse || "Here's the refined version! Better?";
      await streamWords(res, postMsg);

      const finalState = { ...newSessionState, ideasGenerated: true, lastIdeas: refined };
      await saveFidatoMsg(postMsg, { ideasPayload: refined, intent });
      if (session) session.sessionState = finalState;
      sseEvent(res, { type: 'done', sessionState: finalState });

    } else if (action === 'direct_response') {
      await streamWords(res, fidatoResponse);
      await saveFidatoMsg(fidatoResponse);
      sseEvent(res, {
        type: 'done',
        sessionState: newSessionState,
        questionOptions: questionOptions || null,
      });
    }

    // ── Persist session to DB ─────────────────────────────────────────────
    if (session) {
      try { await session.save(); } catch (e) { console.warn('[fidato-chat] Session save failed:', e.message); }
    }

    res.end();
  } catch (err) {
    console.error('fidato-chat error:', err);
    sseEvent(res, { type: 'error', message: err.message || 'Something went wrong' });
    res.end();
  } finally {
    handlerFinished = true;
    clearTimeout(safetyTimeout);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY MODES — 8 Goal-Oriented Research-Backed Strategy Generators
// POST /api/brainstorm-studio/strategy-mode
// ══════════════════════════════════════════════════════════════════════════════

const STRATEGY_MODES = {
  'new-product-launch': {
    label: 'New Product Launch',
    mcpTools: ['web_search_launch', 'fetch_trending'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India new product launch strategy D2C ${new Date().getFullYear()} marketing playbook`,
  },
  'sales-acceleration': {
    label: 'Sales Acceleration',
    mcpTools: ['scrape_competitor', 'web_search_sales'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India sales acceleration conversion rate optimization offers discounts 2025`,
  },
  'marketplace-growth': {
    label: 'Marketplace Growth',
    mcpTools: ['web_search_marketplace', 'fetch_seo_audit'],
    searchQuery: (brand, dna) => `${dna.industry || ''} Amazon Flipkart Nykaa Meesho marketplace SEO listing strategy 2025`,
  },
  'meta-google-ads': {
    label: 'Meta & Google Ads Brief',
    mcpTools: ['web_search_ads', 'scrape_competitor'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India Meta Facebook Instagram Google Ads winning creative hooks ROAS CPL benchmarks 2025`,
  },
  'retention': {
    label: 'Retention & Loyalty',
    mcpTools: ['fetch_performance_learnings', 'fetch_content_history'],
    searchQuery: (brand, dna) => `D2C India customer retention email SMS WhatsApp loyalty programme repeat purchase rate 2025`,
  },
  'festive-seasonal': {
    label: 'Festive & Seasonal',
    mcpTools: ['fetch_trending', 'web_search_festive'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India festive season campaign Diwali Holi summer ${new Date().toLocaleString('en', { month: 'long' })} marketing 2025`,
  },
  'brand-awareness': {
    label: 'Brand Awareness',
    mcpTools: ['web_search_awareness', 'scrape_competitor'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India brand awareness share of voice PR organic social strategy 2025`,
  },
  'influencer-campaign': {
    label: 'Influencer Campaign',
    mcpTools: ['web_search_influencer', 'fetch_trending'],
    searchQuery: (brand, dna) => `${dna.industry || ''} India micro influencer campaign strategy Instagram Reels YouTube Shorts creator brief 2025`,
  },
};

// ════════════════════════════════════════════════════════════════════════════════
// POST /strategy-mode/stream — SSE streaming strategy generation (Phase 4)
// Emits: tool_progress (MCP research), text_delta (live Gemini tokens), done (JSON)
// Frontend: live research chips + token accumulator → StrategyModeResult render
// ════════════════════════════════════════════════════════════════════════════════
router.post('/strategy-mode/stream', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
  const { mode, brand, inputs = {} } = req.body;
  if (!mode) return res.status(400).json({ success: false, error: 'mode is required' });
  if (!STRATEGY_MODES[mode]) return res.status(400).json({ success: false, error: `Unknown mode: ${mode}` });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const emit = (obj) => {
    try { if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* disconnected */ }
  };

  try {
    const modeConfig = STRATEGY_MODES[mode];

    // ── Phase A: Load Brand DNA ─────────────────────────────────────────────
    emit({ type: 'tool_progress', tool: 'brand_dna', label: 'Loading Brand DNA', status: 'working' });
    let brandContext = '';
    let brandDoc = brand;
    try {
      const brandId = brand?._id || brand?.id;
      if (brandId) {
        const ctx = await loadBrandContext(brandId);
        brandContext = ctx.brandContext || '';
        brandDoc = ctx.brand || brand;
      } else if (brand?.name) {
        const dna = brand?.dna || {};
        brandContext = `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}.`;
      }
    } catch (ctxErr) { console.warn('[strategy-stream] Brand context error:', ctxErr.message); }
    emit({ type: 'tool_progress', tool: 'brand_dna', label: 'Brand DNA loaded', status: 'done' });

    const dna = brandDoc?.dna || brand?.dna || {};
    const brandName = brandDoc?.name || brand?.name || 'Your Brand';
    const brandId = brand?._id || brand?.id;

    // ── Phase B: MCP Research (parallel) ──────────────────────────────────
    const searchQuery = modeConfig.searchQuery(brandName, dna);
    const mcpCalls = [];
    if (modeConfig.mcpTools.some(t => t.startsWith('web_search'))) {
      mcpCalls.push({ tool: 'web_search', args: { query: searchQuery, mode: 'quick' } });
    }
    if (modeConfig.mcpTools.includes('fetch_trending')) mcpCalls.push({ tool: 'fetch_trending', args: { brandId } });
    if (modeConfig.mcpTools.includes('scrape_competitor')) mcpCalls.push({ tool: 'scrape_competitor', args: { brandId } });
    if (modeConfig.mcpTools.includes('fetch_seo_audit')) mcpCalls.push({ tool: 'fetch_seo_audit', args: { brandId } });
    if (modeConfig.mcpTools.includes('fetch_performance_learnings')) mcpCalls.push({ tool: 'fetch_performance_learnings', args: { brandId } });
    if (modeConfig.mcpTools.includes('fetch_content_history')) mcpCalls.push({ tool: 'fetch_content_history', args: { brandId, platform: '', limit: 20 } });

    // Emit individual tool chips as they start
    const toolLabels = {
      web_search: 'Web Research', fetch_trending: 'Trending Signals',
      scrape_competitor: 'Competitor Intel', fetch_seo_audit: 'SEO Audit',
      fetch_performance_learnings: 'Performance Data', fetch_content_history: 'Content History',
    };
    for (const call of mcpCalls) {
      emit({ type: 'tool_progress', tool: call.tool, label: toolLabels[call.tool] || call.tool, status: 'working' });
    }

    const mcpResults = await callMcpToolsParallel(mcpCalls);

    // Mark all MCP tools done
    for (const call of mcpCalls) {
      emit({ type: 'tool_progress', tool: call.tool, label: toolLabels[call.tool] || call.tool, status: 'done' });
    }

    // ── Phase C: Build prompts (same as blocking endpoint) ────────────────
    const researchParts = [];
    if (mcpResults.web_search?.data) researchParts.push(`LIVE WEB RESEARCH:\n${mcpResults.web_search.data.substring(0, 2500)}`);
    if (mcpResults.fetch_trending?.data) {
      const t = mcpResults.fetch_trending.data;
      if (t.trending?.length) researchParts.push(`TRENDING NOW: ${t.trending.slice(0, 5).map(x => `${x.topic} (${x.urgency})`).join(' | ')}`);
      if (t.calendarHooks?.length) researchParts.push(`UPCOMING HOOKS: ${t.calendarHooks.slice(0, 5).join(' | ')}`);
    }
    if (mcpResults.scrape_competitor?.data?.analysis) researchParts.push(`COMPETITOR INTEL:\n${mcpResults.scrape_competitor.data.analysis}`);
    if (mcpResults.fetch_seo_audit?.data?.topKeywords?.length) researchParts.push(`SEO KEYWORDS: ${mcpResults.fetch_seo_audit.data.topKeywords.slice(0, 10).join(', ')}`);
    if (mcpResults.fetch_performance_learnings?.data?.topRated?.length) {
      researchParts.push(`PAST TOP CONTENT: ${mcpResults.fetch_performance_learnings.data.topRated.map(x => x.title).join(', ')}`);
    }
    const researchContext = researchParts.join('\n\n') || 'No live research data — proceeding with brand knowledge and AI training data.';

    const modeInstructions = {
      'new-product-launch': `Focus on: pre-launch buzz building, launch day execution, post-launch amplification. Include channel-by-channel plan for first 90 days. Emphasise: influencer seeding, PR outreach, performance ads, social proof collection.`,
      'sales-acceleration': `Focus on: conversion rate improvements, offer architecture, urgency mechanics, retargeting strategy, abandoned cart recovery. Include specific discount structures, bundle ideas, FOMO tactics. Make it a 30-day sprint plan.`,
      'marketplace-growth': `Focus on: Amazon/Flipkart/Nykaa listing optimisation, keyword-rich A+ content, review generation strategy, sponsored ads, category ranking tactics. Include specific keyword recommendations.`,
      'meta-google-ads': `This is an AD BRIEF. Focus on: hook formulas, creative concepts, copy frameworks, audience targeting parameters, budget allocation between Meta/Google, bid strategy, and landing page recommendations. Include 3-5 specific ad concepts with hooks and CTAs.`,
      'retention': `Focus on: Win-back sequences, loyalty rewards, repeat purchase triggers, LTV improvement, WhatsApp/Email/SMS flows. Include day-by-day retention flow for 90 days post first purchase.`,
      'festive-seasonal': `Focus on: Pre-festive content calendar, offer strategy, limited edition packaging ideas, festive ad creative direction, affiliate/influencer amplification during peak season.`,
      'brand-awareness': `Focus on: Share of voice strategy, PR hooks, organic social virality, UGC campaigns, brand partnership opportunities, community building. Make it a 90-day brand building plan.`,
      'influencer-campaign': `Focus on: Creator tier selection (mega/macro/micro/nano), brief framework, seeding strategy, content format mix (Reels/YouTube/Blog), compensation models, content approval process, measurement. Include creator profile criteria.`,
    };

    const userInputsText = Object.keys(inputs).length
      ? `\nUSER INPUTS:\n${Object.entries(inputs).map(([k, v]) => `${k}: ${v}`).join('\n')}`
      : '';

    const systemPrompt = `You are a world-class Chief Marketing Officer and strategic consultant specialising in D2C brands in India.
You are running the "${modeConfig.label}" strategy mode for a brand.

${brandContext}

LIVE MARKET RESEARCH DATA:
${researchContext}

YOUR STRATEGY FOCUS FOR THIS MODE:
${modeInstructions[mode]}

RULES:
1. Every recommendation must be brand-specific — use the brand's name, category, audience, and products
2. Every number (budget, ROAS, CPL, timeline) must have a rationale
3. No generic advice — all outputs must be actionable this week
4. Channel breakdown must cover specific platforms with tactics, not just platform names
5. Content calendar must have specific content themes/hooks for each phase, not just "create content"
6. Studio Actions must map to specific capabilities (Creative Studio for images, Content Studio for copy, Video Studio for reels)
7. CRITICAL: Output ONLY valid, parsable JSON. Do not include unescaped quotes inside strings. Do not include trailing commas. Ensure all braces and brackets are properly closed. Do not output markdown code blocks, just the raw JSON object.
8. BE DENSE AND WOW-WORTHY: Every sentence must be a sharp insight, not a filler. Make the user feel like they just got a ₹50,000 strategy session for free. Use specific numbers, channel names, hook examples, and timelines.

Respond in STRICT JSON:
{
  "mode": "${mode}",
  "modeLabel": "${modeConfig.label}",
  "brand": "${brandName}",
  "strategicSummary": "4-5 sentence thesis: why THIS strategy at THIS moment will work for THIS brand, grounded in research",
  "marketContext": {
    "keyFindings": ["Specific finding 1 with data", "Finding 2", "Finding 3", "Finding 4"],
    "competitorGaps": ["Gap 1 — what competitors aren't doing", "Gap 2", "Gap 3"],
    "trendingAngles": ["Trending angle 1 brand can leverage", "Angle 2", "Angle 3"]
  },
  "recommendedActions": [
    { "priority": "high", "action": "Specific action", "rationale": "Why this, why now", "timeline": "e.g. Week 1", "owner": "Founder/Marketing team/Agency" }
  ],
  "channelBreakdown": [
    {
      "channel": "Meta Ads",
      "strategy": "2-3 sentence channel strategy",
      "contentTypes": ["Specific content type 1", "Type 2"],
      "hooks": ["Winning hook formula 1", "Hook 2"],
      "budget": "Suggested budget range or %",
      "kpi": "Primary KPI with target",
      "timeline": "When to start and scale"
    }
  ],
  "contentCalendar": {
    "duration": "e.g. 30 days / 90 days",
    "phases": [
      { "name": "Phase name", "duration": "Week 1-2", "theme": "Campaign theme", "actions": ["Specific action 1", "Action 2", "Action 3"] }
    ]
  },
  "studioActions": [
    { "label": "Generate Campaign Creative", "studio": "creative", "payload": { "brief": "1 sentence creative brief" } },
    { "label": "Write Campaign Copy", "studio": "content", "payload": { "type": "social", "platform": "instagram" } },
    { "label": "Create Reel Concepts", "studio": "video", "payload": { "format": "reel" } }
  ]
}`;

    const userPrompt = `Generate the "${modeConfig.label}" strategy for "${brandName}".
${userInputsText}
Use all available brand data and research intel to build the most specific, actionable plan possible.`;

    // ── Phase D: Stream Gemini tokens ─────────────────────────────────────
    emit({ type: 'tool_progress', tool: 'ai_synthesis', label: 'AI Strategy Synthesis', status: 'working' });

    const aiRouter = getRouter();
    let fullText = '';
    let tokenCount = 0;

    try {
      for await (const chunk of aiRouter.generateTextStream({
        systemPrompt,
        userPrompt,
        temperature: 0.5,
        maxTokens: 8000,
      })) {
        fullText += chunk;
        tokenCount += chunk.length;
        // Emit text delta — frontend accumulates this for display
        emit({ type: 'text_delta', text: chunk, tokenCount });
      }
    } catch (streamErr) {
      // Streaming failed — run blocking fallback and emit as single chunk
      console.warn('[strategy-stream] Stream failed, running blocking fallback:', streamErr.message);
      const fallbackResult = await aiRouter.generateText({ systemPrompt, userPrompt, temperature: 0.5, maxTokens: 8000 }, { provider: 'gemini' });
      fullText = fallbackResult.text || '';
      emit({ type: 'text_delta', text: fullText, tokenCount: fullText.length });
    }

    emit({ type: 'tool_progress', tool: 'ai_synthesis', label: 'AI Strategy Synthesis', status: 'done' });

    // ── Phase E: Parse JSON + emit done ───────────────────────────────────
    let text = fullText;
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const lastThink = text.lastIndexOf('<think>');
    if (lastThink !== -1) { const before = text.substring(0, lastThink).trim(); text = before.length > 0 ? before : ''; }
    text = text.replace(/```(?:json)?\s*\n?/gi, '').trim();

    let parsed;
    try {
      parsed = parseJSON(text);
    } catch (parseError) {
      console.error('[strategy-stream] JSON Parse Error:', parseError.message);
      parsed = { raw: text, error: `JSON parse failed: ${parseError.message}` };
    }

    parsed = parsed || {};
    parsed.mode = mode;
    parsed.modeLabel = modeConfig.label;
    parsed.brand = brandName;
    parsed.generatedAt = new Date().toISOString();
    parsed.researchUsed = mcpCalls.length > 0;

    let sessionId = null;
    const userId = req.user?._id;
    if (userId && brandId) {
      try {
        const session = new BrainstormSession({
          user: userId,
          brand: brandId,
          title: `Strategy: ${modeConfig.label}`,
          intent: 'strategy-mode',
          sessionState: { lastStrategy: parsed },
          messages: [{ role: 'fidato', content: `Generated ${modeConfig.label} strategy.`, strategyPayload: parsed, timestamp: new Date() }]
        });
        await session.save();
        sessionId = session._id.toString();
      } catch (e) {
        console.error('[strategy-stream] Failed to save session:', e.message);
      }
    }

    emit({ type: 'done', data: parsed, sessionId });

  } catch (error) {
    console.error('[strategy-stream] error:', error);
    emit({ type: 'error', message: safeErrorMessage(error) });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

router.post('/strategy-mode', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
  try {
    const { mode, brand, inputs = {} } = req.body;
    if (!mode) return res.status(400).json({ success: false, error: 'mode is required' });
    if (!STRATEGY_MODES[mode]) return res.status(400).json({ success: false, error: `Unknown mode: ${mode}. Valid modes: ${Object.keys(STRATEGY_MODES).join(', ')}` });

    const modeConfig = STRATEGY_MODES[mode];

    // ── Load FULL Brand DNA ─────────────────────────────────────────────
    let brandContext = '';
    let brandDoc = brand;
    try {
      const brandId = brand?._id || brand?.id;
      if (brandId) {
        const ctx = await loadBrandContext(brandId);
        brandContext = ctx.brandContext || '';
        brandDoc = ctx.brand || brand;
      } else if (brand?.name) {
        const dna = brand?.dna || {};
        brandContext = `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}.`;
      }
    } catch (ctxErr) {
      console.warn('[strategy-mode] Brand context error:', ctxErr.message);
    }

    const dna = brandDoc?.dna || brand?.dna || {};
    const brandName = brandDoc?.name || brand?.name || 'Your Brand';
    const brandId = brand?._id || brand?.id;

    // ── Run relevant MCP tools in parallel ──────────────────────────────
    const searchQuery = modeConfig.searchQuery(brandName, dna);
    const mcpCalls = [];

    if (modeConfig.mcpTools.some(t => t.startsWith('web_search'))) {
      mcpCalls.push({ tool: 'web_search', args: { query: searchQuery, mode: 'deep' } });
    }
    if (modeConfig.mcpTools.includes('fetch_trending')) {
      mcpCalls.push({ tool: 'fetch_trending', args: { brandId } });
    }
    if (modeConfig.mcpTools.includes('scrape_competitor')) {
      mcpCalls.push({ tool: 'scrape_competitor', args: { brandId } });
    }
    if (modeConfig.mcpTools.includes('fetch_seo_audit')) {
      mcpCalls.push({ tool: 'fetch_seo_audit', args: { brandId } });
    }
    if (modeConfig.mcpTools.includes('fetch_performance_learnings')) {
      mcpCalls.push({ tool: 'fetch_performance_learnings', args: { brandId } });
    }
    if (modeConfig.mcpTools.includes('fetch_content_history')) {
      mcpCalls.push({ tool: 'fetch_content_history', args: { brandId, platform: '', limit: 20 } });
    }

    const mcpResults = await callMcpToolsParallel(mcpCalls);

    // Summarise MCP results for prompt
    const researchParts = [];
    if (mcpResults.web_search?.data) researchParts.push(`LIVE WEB RESEARCH:\n${mcpResults.web_search.data.substring(0, 2500)}`);
    if (mcpResults.fetch_trending?.data) {
      const t = mcpResults.fetch_trending.data;
      if (t.trending?.length) researchParts.push(`TRENDING NOW: ${t.trending.slice(0, 5).map(x => `${x.topic} (${x.urgency})`).join(' | ')}`);
      if (t.calendarHooks?.length) researchParts.push(`UPCOMING HOOKS: ${t.calendarHooks.slice(0, 5).join(' | ')}`);
    }
    if (mcpResults.scrape_competitor?.data?.analysis) researchParts.push(`COMPETITOR INTEL:\n${mcpResults.scrape_competitor.data.analysis}`);
    if (mcpResults.fetch_seo_audit?.data?.topKeywords?.length) researchParts.push(`SEO KEYWORDS: ${mcpResults.fetch_seo_audit.data.topKeywords.slice(0, 10).join(', ')}`);
    if (mcpResults.fetch_performance_learnings?.data?.topRated?.length) {
      researchParts.push(`PAST TOP CONTENT: ${mcpResults.fetch_performance_learnings.data.topRated.map(x => x.title).join(', ')}`);
    }

    const researchContext = researchParts.join('\n\n') || 'No live research data — proceeding with brand knowledge and AI training data.';

    // ── Mode-specific prompt instructions ───────────────────────────────
    const modeInstructions = {
      'new-product-launch': `Focus on: pre-launch buzz building, launch day execution, post-launch amplification. Include channel-by-channel plan for first 90 days. Emphasise: influencer seeding, PR outreach, performance ads, social proof collection.`,
      'sales-acceleration': `Focus on: conversion rate improvements, offer architecture, urgency mechanics, retargeting strategy, abandoned cart recovery. Include specific discount structures, bundle ideas, FOMO tactics. Make it a 30-day sprint plan.`,
      'marketplace-growth': `Focus on: Amazon/Flipkart/Nykaa listing optimisation, keyword-rich A+ content, review generation strategy, sponsored ads, category ranking tactics. Include specific keyword recommendations.`,
      'meta-google-ads': `This is an AD BRIEF. Focus on: hook formulas, creative concepts, copy frameworks, audience targeting parameters, budget allocation between Meta/Google, bid strategy, and landing page recommendations. Include 3-5 specific ad concepts with hooks and CTAs.`,
      'retention': `Focus on: Win-back sequences, loyalty rewards, repeat purchase triggers, LTV improvement, WhatsApp/Email/SMS flows. Include day-by-day retention flow for 90 days post first purchase.`,
      'festive-seasonal': `Focus on: Pre-festive content calendar, offer strategy, limited edition packaging ideas, festive ad creative direction, affiliate/influencer amplification during peak season.`,
      'brand-awareness': `Focus on: Share of voice strategy, PR hooks, organic social virality, UGC campaigns, brand partnership opportunities, community building. Make it a 90-day brand building plan.`,
      'influencer-campaign': `Focus on: Creator tier selection (mega/macro/micro/nano), brief framework, seeding strategy, content format mix (Reels/YouTube/Blog), compensation models, content approval process, measurement. Include creator profile criteria.`,
    };

    const userInputsText = Object.keys(inputs).length
      ? `\nUSER INPUTS:\n${Object.entries(inputs).map(([k, v]) => `${k}: ${v}`).join('\n')}`
      : '';

    const systemPrompt = `You are a world-class Chief Marketing Officer and strategic consultant specialising in D2C brands in India.
You are running the "${modeConfig.label}" strategy mode for a brand.

${brandContext}

LIVE MARKET RESEARCH DATA:
${researchContext}

YOUR STRATEGY FOCUS FOR THIS MODE:
${modeInstructions[mode]}

RULES:
1. Every recommendation must be brand-specific — use the brand's name, category, audience, and products
2. Every number (budget, ROAS, CPL, timeline) must have a rationale
3. No generic advice — all outputs must be actionable this week
4. Channel breakdown must cover specific platforms with tactics, not just platform names
5. Content calendar must have specific content themes/hooks for each phase, not just "create content"
6. Studio Actions must map to specific capabilities (Creative Studio for images, Content Studio for copy, Video Studio for reels)
7. CRITICAL: Output ONLY valid, parsable JSON. Do not include unescaped quotes inside strings. Do not include trailing commas. Ensure all braces and brackets are properly closed. Do not output markdown code blocks, just the raw JSON object.
8. BE DENSE AND WOW-WORTHY: Every sentence must be a sharp insight, not a filler. Make the user feel like they just got a ₹50,000 strategy session for free. Use specific numbers, channel names, hook examples, and timelines.

Respond in STRICT JSON:
{
  "mode": "${mode}",
  "modeLabel": "${modeConfig.label}",
  "brand": "${brandName}",
  "strategicSummary": "4-5 sentence thesis: why THIS strategy at THIS moment will work for THIS brand, grounded in research",
  "marketContext": {
    "keyFindings": ["Specific finding 1 with data", "Finding 2", "Finding 3", "Finding 4"],
    "competitorGaps": ["Gap 1 — what competitors aren't doing", "Gap 2", "Gap 3"],
    "trendingAngles": ["Trending angle 1 brand can leverage", "Angle 2", "Angle 3"]
  },
  "recommendedActions": [
    { "priority": "high", "action": "Specific action", "rationale": "Why this, why now", "timeline": "e.g. Week 1", "owner": "Founder/Marketing team/Agency" }
  ],
  "channelBreakdown": [
    {
      "channel": "Meta Ads",
      "strategy": "2-3 sentence channel strategy",
      "contentTypes": ["Specific content type 1", "Type 2"],
      "hooks": ["Winning hook formula 1", "Hook 2"],
      "budget": "Suggested budget range or %",
      "kpi": "Primary KPI with target",
      "timeline": "When to start and scale"
    }
  ],
  "contentCalendar": {
    "duration": "e.g. 30 days / 90 days",
    "phases": [
      { "name": "Phase name", "duration": "Week 1-2", "theme": "Campaign theme", "actions": ["Specific action 1", "Action 2", "Action 3"] }
    ]
  },
  "studioActions": [
    { "label": "Generate Campaign Creative", "studio": "creative", "payload": { "brief": "1 sentence creative brief" } },
    { "label": "Write Campaign Copy", "studio": "content", "payload": { "type": "social", "platform": "instagram" } },
    { "label": "Create Reel Concepts", "studio": "video", "payload": { "format": "reel" } }
  ]
}`;

    const userPrompt = `Generate the "${modeConfig.label}" strategy for "${brandName}".
${userInputsText}
Use all available brand data and research intel to build the most specific, actionable plan possible.`;

    const aiRouter = getRouter();
    // ⚡ Gemini 2.5 Pro: quality-speed balance for strategy synthesis
    // Claude Sonnet at 6000 tokens = 30-60s. Gemini Pro at 4000 tokens = 8-15s.
    // 4000 tokens is sufficient for a dense, wow-factor strategy — verbose doesn't mean better.
    const aiResult = await aiRouter.generateText({
      systemPrompt,
      userPrompt,
      temperature: 0.5,
      maxTokens: 8000,
    }, { provider: 'gemini' });

    let text = aiResult.text || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const lastThink = text.lastIndexOf('<think>');
    if (lastThink !== -1) {
      const before = text.substring(0, lastThink).trim();
      text = before.length > 0 ? before : '';
    }
    text = text.replace(/```(?:json)?\s*\n?/gi, '').trim();

    let parsed;
    try {
      parsed = parseJSON(text);
    } catch (parseError) {
      console.error('[strategy-mode] JSON Parse Error:', parseError.message);
      console.error('[strategy-mode] Raw output:', text);
      parsed = { raw: text, error: `JSON parse failed: ${parseError.message}` };
    }

    parsed = parsed || {};
    parsed.mode = mode;
    parsed.modeLabel = modeConfig.label;
    parsed.brand = brandName;
    parsed.generatedAt = new Date().toISOString();
    parsed.researchUsed = mcpCalls.length > 0;

    let sessionId = null;
    const userId = req.user?._id;
    if (userId && brandId) {
      try {
        const session = new BrainstormSession({
          user: userId,
          brand: brandId,
          title: `Strategy: ${modeConfig.label}`,
          intent: 'strategy-mode',
          sessionState: { lastStrategy: parsed },
          messages: [{ role: 'fidato', content: `Generated ${modeConfig.label} strategy.`, strategyPayload: parsed, timestamp: new Date() }]
        });
        await session.save();
        sessionId = session._id.toString();
      } catch (e) {
        console.error('[strategy-mode] Failed to save session:', e.message);
      }
    }

    res.json({ success: true, data: parsed, sessionId });
  } catch (error) {
    console.error('strategy-mode error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

export default router;



import { Router } from 'express';
import { getAIRouter } from '../ai/router.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import BrandStrategy from '../models/BrandStrategy.js';

const router = Router();

// ============================================================================
// HELPERS
// ============================================================================

// AI call with unified router (handles fallbacks)
async function aiCall(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 4096, json = false } = options;
  const router = getAIRouter();

  try {
    const result = await router.generateText({
      systemPrompt,
      userPrompt,
      temperature,
      maxTokens,
    });
    return result.text;
  } catch (e) {
    console.error('Brainstorm AI Call Error:', e.message);
    throw new Error('All AI models failed');
  }
}

// Parse JSON from AI response (handles markdown code blocks)
function parseJSON(text) {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(clean);
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

    const systemPrompt = `You are a friendly creative partner helping someone brainstorm. You know their brand well and you talk like a helpful friend, NOT like a marketing professor.

BRAND YOU'RE WORKING WITH:
${brandContext}

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
      const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7 });
      const parsed = parseJSON(result);

      if (parsed.questions && parsed.questions.length > 0) {
        return res.json({
          success: true,
          intent,
          questions: parsed.questions,
          brandInsight: parsed.brandInsight || null,
          brandAware: true,
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

    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice || 'professional'}. Colors: ${brand.dna?.colors?.map(c => c.hex).join(', ') || 'N/A'}.`
      : '';

    const answersText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');

    const systemPrompt = `You are a senior brand strategist at a top creative agency. You're having a conversation with a client.

Your job: Summarize what you understood from the client's brief in 3-4 conversational sentences. Show that you truly understand their brand, audience, and goals. End with a specific, insightful observation that shows strategic depth.

Also suggest 3 refinement directions the user might want (as short 5-8 word options).

Respond in JSON format:
{
  "summary": "Your understanding summary (3-4 sentences, conversational, strategic)",
  "refinements": ["option 1", "option 2", "option 3"]
}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\n\nClient's answers:\n${answersText}`;

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6 });
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

    const dna = brand?.dna || {};
    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}. Description: ${dna.brandDescription || 'N/A'}. Country: ${dna.country || 'India'}. Language: ${dna.defaultLanguage || 'english'}.`
      : '';

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

Make ideas BOLD, SPECIFIC, and CULTURALLY RELEVANT. Not generic.

Respond in STRICT JSON format:
${outputFormat}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\n\nBrief:\n${answersText}`;

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.8, maxTokens: 6000 });
    const parsed = parseJSON(result);

    res.json({ success: true, ideas: parsed, intent });
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

    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}.`
      : '';

    const answersText = answers ? Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n') : '';
    const isAdFilm = intent === 'ad-film';

    const systemPrompt = `You are refining brainstorm ideas based on feedback: "${refinementPrompt}"

${isAdFilm ? 'These are AD FILM concepts — generate film concepts with story, shots, emotion, not campaigns.' : 'Generate campaign concepts with tactical plans.'}

Keep the same JSON structure as before but make ideas better. Each concept needs scores (1-10).

${isAdFilm ? 'Respond with: filmConcepts (3), productionApproaches (3), namingIdeas, followUpSuggestions.' : 'Respond with: campaignConcepts (3), tacticalIdeas (3), namingIdeas, executionPlan, followUpSuggestions.'}`;

    const userPrompt = `Intent: ${intent}\n${brandContext}\nBrief:\n${answersText}\n\nRefinement: ${refinementPrompt}\n\nPrevious top idea: ${previousIdeas?.filmConcepts?.[0]?.title || previousIdeas?.campaignConcepts?.[0]?.title || 'N/A'}`;

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.85, maxTokens: 6000 });
    const parsed = parseJSON(result);

    res.json({ success: true, ideas: parsed, intent });
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

    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}. Target: ${brand.dna?.targetAudience || 'N/A'}. Country: ${brand.dna?.country || 'India'}.`
      : '';

    const systemPrompt = `You are an award-winning ad film scriptwriter. Write a production-ready screenplay.

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

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, maxTokens: 6000 });
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

    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${brand.dna?.industry || 'N/A'}. Voice: ${brand.dna?.voice?.personality || 'professional'}. Target: ${brand.dna?.targetAudience || 'N/A'}.`
      : '';

    const historyText = (chatHistory || []).map(m => `${m.role === 'user' ? 'USER' : 'CREATIVE DIRECTOR'}: ${m.text}`).join('\n');

    const systemPrompt = `You are an award-winning creative director helping refine an ad film concept. You're working closely with the client to perfect their film idea.

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

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.75, maxTokens: 4096 });
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

    const brandContext = brand
      ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Voice: ${dna.voice?.personality || 'professional'}. Target Audience: ${dna.targetAudience || 'N/A'}. Description: ${dna.brandDescription || 'N/A'}. Country: ${dna.country || 'India'}. Colors: ${dna.colors?.map(c => c.hex).join(', ') || 'N/A'}.`
      : '';

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

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.75, maxTokens: 8000 });
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

    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 6000 });
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

export default router;

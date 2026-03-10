// ============================================================================
// GLOBAL FESTIVAL & KEY DATE CALENDAR — Market-aware, real dates
// ============================================================================
//
// Markets: IN=India, US=USA, CA=Canada, UK=UK, EU=Europe, AE=UAE/Middle East,
// SA=Saudi, SG=Singapore, MY=Malaysia, ID=Indonesia, TH=Thailand,
// AU=Australia, NZ=New Zealand, BR=Brazil, JP=Japan, KR=South Korea
// GLOBAL = applies everywhere

const FESTIVAL_CALENDAR = [
    // ─── GLOBAL ───
    { name: "New Year's Day", date: '2026-01-01', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 14 },
    { name: "Valentine's Day", date: '2026-02-14', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 14 },
    { name: "International Women's Day", date: '2026-03-08', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 7 },
    { name: "Earth Day", date: '2026-04-22', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 7 },
    { name: "Black Friday", date: '2026-11-27', markets: ['GLOBAL'], category: 'sale', marketingLead: 21 },
    { name: "Cyber Monday", date: '2026-11-30', markets: ['GLOBAL'], category: 'sale', marketingLead: 21 },
    { name: "Christmas", date: '2026-12-25', markets: ['GLOBAL'], category: 'festival', marketingLead: 30 },
    { name: "New Year's Eve", date: '2026-12-31', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 14 },
    { name: "New Year's Day", date: '2027-01-01', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 14 },
    { name: "Valentine's Day", date: '2027-02-14', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 14 },
    { name: "International Women's Day", date: '2027-03-08', markets: ['GLOBAL'], category: 'lifestyle', marketingLead: 7 },
    { name: "Black Friday", date: '2027-11-26', markets: ['GLOBAL'], category: 'sale', marketingLead: 21 },
    { name: "Cyber Monday", date: '2027-11-29', markets: ['GLOBAL'], category: 'sale', marketingLead: 21 },
    { name: "Christmas", date: '2027-12-25', markets: ['GLOBAL'], category: 'festival', marketingLead: 30 },

    // ─── INDIA (IN) — 2026 ───
    { name: 'Makar Sankranti / Pongal', date: '2026-01-14', endDate: '2026-01-17', markets: ['IN'], category: 'harvest', marketingLead: 14 },
    { name: 'Republic Day', date: '2026-01-26', markets: ['IN'], category: 'national', marketingLead: 10 },
    { name: 'Maha Shivaratri', date: '2026-02-15', markets: ['IN'], category: 'religious', marketingLead: 7 },
    { name: 'Holi', date: '2026-03-04', endDate: '2026-03-05', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Gudi Padwa / Ugadi', date: '2026-03-19', markets: ['IN'], category: 'new_year', marketingLead: 10 },
    { name: 'Ram Navami', date: '2026-03-28', markets: ['IN'], category: 'religious', marketingLead: 7 },
    { name: 'Baisakhi', date: '2026-04-13', markets: ['IN'], category: 'harvest', marketingLead: 10 },
    { name: 'Akshaya Tritiya', date: '2026-04-19', markets: ['IN'], category: 'auspicious', marketingLead: 14 },
    { name: "Mother's Day (India)", date: '2026-05-10', markets: ['IN'], category: 'lifestyle', marketingLead: 14 },
    { name: "Father's Day (India)", date: '2026-06-21', markets: ['IN'], category: 'lifestyle', marketingLead: 14 },
    { name: 'Independence Day (India)', date: '2026-08-15', markets: ['IN'], category: 'national', marketingLead: 14 },
    { name: 'Raksha Bandhan', date: '2026-08-28', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Onam', date: '2026-08-25', endDate: '2026-09-04', markets: ['IN'], category: 'harvest', marketingLead: 14 },
    { name: 'Janmashtami', date: '2026-09-04', markets: ['IN'], category: 'religious', marketingLead: 14 },
    { name: "Teachers' Day (India)", date: '2026-09-05', markets: ['IN'], category: 'national', marketingLead: 7 },
    { name: 'Ganesh Chaturthi', date: '2026-09-16', endDate: '2026-09-26', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Navratri', date: '2026-10-11', endDate: '2026-10-20', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Dussehra (Vijayadashami)', date: '2026-10-20', markets: ['IN'], category: 'festival', marketingLead: 14 },
    { name: 'Karva Chauth', date: '2026-10-24', markets: ['IN'], category: 'festival', marketingLead: 14 },
    { name: 'Dhanteras', date: '2026-11-06', markets: ['IN'], category: 'auspicious', marketingLead: 14 },
    { name: 'Diwali', date: '2026-11-08', endDate: '2026-11-12', markets: ['IN', 'SG', 'MY'], category: 'festival', marketingLead: 30 },
    { name: 'Bhai Dooj', date: '2026-11-11', markets: ['IN'], category: 'festival', marketingLead: 10 },
    { name: 'Chhath Puja', date: '2026-11-14', endDate: '2026-11-15', markets: ['IN'], category: 'religious', marketingLead: 10 },
    { name: "Children's Day (India)", date: '2026-11-14', markets: ['IN'], category: 'national', marketingLead: 10 },
    { name: 'Guru Nanak Jayanti', date: '2026-11-24', markets: ['IN'], category: 'religious', marketingLead: 7 },
    // India 2027
    { name: 'Republic Day', date: '2027-01-26', markets: ['IN'], category: 'national', marketingLead: 10 },
    { name: 'Maha Shivaratri', date: '2027-02-06', markets: ['IN'], category: 'religious', marketingLead: 7 },
    { name: 'Holi', date: '2027-03-22', endDate: '2027-03-23', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Ram Navami', date: '2027-03-17', markets: ['IN'], category: 'religious', marketingLead: 7 },
    { name: 'Baisakhi', date: '2027-04-13', markets: ['IN'], category: 'harvest', marketingLead: 10 },
    { name: 'Akshaya Tritiya', date: '2027-05-08', markets: ['IN'], category: 'auspicious', marketingLead: 14 },
    { name: 'Raksha Bandhan', date: '2027-08-17', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Independence Day (India)', date: '2027-08-15', markets: ['IN'], category: 'national', marketingLead: 14 },
    { name: 'Janmashtami', date: '2027-08-25', markets: ['IN'], category: 'religious', marketingLead: 14 },
    { name: 'Ganesh Chaturthi', date: '2027-09-05', endDate: '2027-09-15', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Navratri', date: '2027-10-01', endDate: '2027-10-10', markets: ['IN'], category: 'festival', marketingLead: 21 },
    { name: 'Dussehra', date: '2027-10-10', markets: ['IN'], category: 'festival', marketingLead: 14 },
    { name: 'Diwali', date: '2027-10-29', endDate: '2027-11-02', markets: ['IN', 'SG', 'MY'], category: 'festival', marketingLead: 30 },

    // ─── ISLAMIC (IN, AE, SA, MY, ID, SG) ───
    { name: 'Ramadan Begins', date: '2026-02-18', endDate: '2026-03-19', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG', 'UK'], category: 'religious', marketingLead: 14 },
    { name: 'Eid ul-Fitr', date: '2026-03-20', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG', 'UK'], category: 'festival', marketingLead: 21 },
    { name: 'Eid ul-Adha (Bakrid)', date: '2026-05-27', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG'], category: 'festival', marketingLead: 14 },
    { name: 'Ramadan Begins', date: '2027-02-08', endDate: '2027-03-09', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG', 'UK'], category: 'religious', marketingLead: 14 },
    { name: 'Eid ul-Fitr', date: '2027-03-10', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG', 'UK'], category: 'festival', marketingLead: 21 },
    { name: 'Eid ul-Adha (Bakrid)', date: '2027-05-17', markets: ['IN', 'AE', 'SA', 'MY', 'ID', 'SG'], category: 'festival', marketingLead: 14 },

    // ─── USA (US) ───
    { name: "Martin Luther King Jr. Day", date: '2026-01-19', markets: ['US'], category: 'national', marketingLead: 7 },
    { name: "Super Bowl Sunday", date: '2026-02-08', markets: ['US'], category: 'lifestyle', marketingLead: 21 },
    { name: "Presidents' Day", date: '2026-02-16', markets: ['US'], category: 'sale', marketingLead: 10 },
    { name: "St. Patrick's Day", date: '2026-03-17', markets: ['US', 'UK', 'AU'], category: 'lifestyle', marketingLead: 7 },
    { name: "Easter", date: '2026-04-05', markets: ['US', 'UK', 'EU', 'AU', 'NZ', 'BR', 'CA'], category: 'festival', marketingLead: 14 },
    { name: "Mother's Day (US)", date: '2026-05-10', markets: ['US', 'CA', 'AU', 'NZ'], category: 'lifestyle', marketingLead: 14 },
    { name: "Memorial Day", date: '2026-05-25', markets: ['US'], category: 'sale', marketingLead: 10 },
    { name: "Father's Day (US)", date: '2026-06-21', markets: ['US', 'CA', 'UK', 'AU'], category: 'lifestyle', marketingLead: 14 },
    { name: "Independence Day (USA)", date: '2026-07-04', markets: ['US'], category: 'national', marketingLead: 14 },
    { name: "Back to School Season", date: '2026-08-01', endDate: '2026-09-01', markets: ['US', 'CA'], category: 'sale', marketingLead: 21 },
    { name: "Labor Day (US)", date: '2026-09-07', markets: ['US'], category: 'sale', marketingLead: 10 },
    { name: "Halloween", date: '2026-10-31', markets: ['US', 'CA', 'UK', 'AU'], category: 'lifestyle', marketingLead: 21 },
    { name: "Veterans Day", date: '2026-11-11', markets: ['US'], category: 'national', marketingLead: 7 },
    { name: "Thanksgiving (US)", date: '2026-11-26', markets: ['US'], category: 'festival', marketingLead: 14 },
    { name: 'Small Business Saturday', date: '2026-11-28', markets: ['US'], category: 'sale', marketingLead: 7 },
    // US 2027
    { name: "Super Bowl Sunday", date: '2027-02-07', markets: ['US'], category: 'lifestyle', marketingLead: 21 },
    { name: "Easter", date: '2027-03-28', markets: ['US', 'UK', 'EU', 'AU', 'NZ', 'BR', 'CA'], category: 'festival', marketingLead: 14 },
    { name: "Independence Day (USA)", date: '2027-07-04', markets: ['US'], category: 'national', marketingLead: 14 },
    { name: "Thanksgiving (US)", date: '2027-11-25', markets: ['US'], category: 'festival', marketingLead: 14 },

    // ─── UK & EUROPE (UK, EU) ───
    { name: "Mother's Day (UK)", date: '2026-03-15', markets: ['UK'], category: 'lifestyle', marketingLead: 14 },
    { name: "May Day Bank Holiday", date: '2026-05-04', markets: ['UK'], category: 'national', marketingLead: 7 },
    { name: "Spring Bank Holiday (UK)", date: '2026-05-25', markets: ['UK'], category: 'sale', marketingLead: 7 },
    { name: "Bastille Day (France)", date: '2026-07-14', markets: ['EU'], category: 'national', marketingLead: 7 },
    { name: "Oktoberfest Begins", date: '2026-09-19', endDate: '2026-10-04', markets: ['EU'], category: 'festival', marketingLead: 14 },
    { name: "Boxing Day", date: '2026-12-26', markets: ['UK', 'CA', 'AU', 'NZ'], category: 'sale', marketingLead: 7 },

    // ─── MIDDLE EAST (AE, SA) ───
    { name: "Dubai Shopping Festival", date: '2026-01-01', endDate: '2026-02-01', markets: ['AE'], category: 'sale', marketingLead: 21 },
    { name: "Saudi National Day", date: '2026-09-23', markets: ['SA'], category: 'national', marketingLead: 14 },
    { name: "UAE National Day", date: '2026-12-02', markets: ['AE'], category: 'national', marketingLead: 14 },

    // ─── SOUTHEAST ASIA (SG, MY, ID, TH) ───
    { name: "Chinese New Year", date: '2026-02-17', endDate: '2026-02-19', markets: ['SG', 'MY', 'TH', 'ID', 'JP', 'KR'], category: 'festival', marketingLead: 21 },
    { name: "Vesak Day (Buddha Purnima)", date: '2026-05-12', markets: ['SG', 'MY', 'TH', 'IN'], category: 'religious', marketingLead: 7 },
    { name: "Songkran (Thai New Year)", date: '2026-04-13', endDate: '2026-04-15', markets: ['TH'], category: 'festival', marketingLead: 14 },
    { name: "Singapore National Day", date: '2026-08-09', markets: ['SG'], category: 'national', marketingLead: 14 },
    { name: "Malaysia Day", date: '2026-09-16', markets: ['MY'], category: 'national', marketingLead: 10 },
    { name: "Indonesia Independence Day", date: '2026-08-17', markets: ['ID'], category: 'national', marketingLead: 14 },
    { name: "Chinese New Year", date: '2027-02-06', endDate: '2027-02-08', markets: ['SG', 'MY', 'TH', 'ID', 'JP', 'KR'], category: 'festival', marketingLead: 21 },

    // ─── AUSTRALIA & NEW ZEALAND (AU, NZ) ───
    { name: "Australia Day", date: '2026-01-26', markets: ['AU'], category: 'national', marketingLead: 10 },
    { name: "ANZAC Day", date: '2026-04-25', markets: ['AU', 'NZ'], category: 'national', marketingLead: 7 },
    { name: "Queen's Birthday (AU)", date: '2026-06-08', markets: ['AU'], category: 'national', marketingLead: 7 },
    { name: "EOFY Sales (Australia)", date: '2026-06-15', endDate: '2026-06-30', markets: ['AU'], category: 'sale', marketingLead: 14 },
    { name: "Waitangi Day (NZ)", date: '2026-02-06', markets: ['NZ'], category: 'national', marketingLead: 7 },

    // ─── CANADA (CA) ───
    { name: "Victoria Day (Canada)", date: '2026-05-18', markets: ['CA'], category: 'sale', marketingLead: 7 },
    { name: "Canada Day", date: '2026-07-01', markets: ['CA'], category: 'national', marketingLead: 14 },
    { name: "Thanksgiving (Canada)", date: '2026-10-12', markets: ['CA'], category: 'festival', marketingLead: 10 },

    // ─── LATIN AMERICA (BR) ───
    { name: "Carnival (Brazil)", date: '2026-02-15', endDate: '2026-02-18', markets: ['BR'], category: 'festival', marketingLead: 21 },
    { name: "Brazil Independence Day", date: '2026-09-07', markets: ['BR'], category: 'national', marketingLead: 10 },

    // ─── JAPAN & KOREA (JP, KR) ───
    { name: "Golden Week (Japan)", date: '2026-04-29', endDate: '2026-05-05', markets: ['JP'], category: 'festival', marketingLead: 14 },
    { name: "Obon (Japan)", date: '2026-08-13', endDate: '2026-08-16', markets: ['JP'], category: 'religious', marketingLead: 10 },
    { name: "Chuseok (Korean Thanksgiving)", date: '2026-09-24', endDate: '2026-09-27', markets: ['KR'], category: 'festival', marketingLead: 14 },
    { name: "Singles' Day (11.11)", date: '2026-11-11', markets: ['SG', 'MY', 'JP', 'KR', 'AE'], category: 'sale', marketingLead: 14 },
];


// ============================================================================
// MARKET DETECTION — resolve target markets from brand data
// ============================================================================

const COUNTRY_TO_MARKET = {
    'india': 'IN', 'in': 'IN', 'bharat': 'IN',
    'usa': 'US', 'us': 'US', 'united states': 'US', 'america': 'US',
    'uk': 'UK', 'united kingdom': 'UK', 'england': 'UK', 'britain': 'UK',
    'canada': 'CA', 'ca': 'CA',
    'uae': 'AE', 'ae': 'AE', 'dubai': 'AE', 'united arab emirates': 'AE', 'abu dhabi': 'AE',
    'saudi': 'SA', 'sa': 'SA', 'saudi arabia': 'SA', 'ksa': 'SA',
    'singapore': 'SG', 'sg': 'SG',
    'malaysia': 'MY', 'my': 'MY',
    'indonesia': 'ID',
    'thailand': 'TH', 'th': 'TH',
    'australia': 'AU', 'au': 'AU',
    'new zealand': 'NZ', 'nz': 'NZ',
    'brazil': 'BR', 'br': 'BR',
    'japan': 'JP', 'jp': 'JP',
    'south korea': 'KR', 'korea': 'KR', 'kr': 'KR',
    'germany': 'EU', 'france': 'EU', 'italy': 'EU', 'spain': 'EU', 'netherlands': 'EU',
    'europe': 'EU', 'eu': 'EU',
    'global': 'GLOBAL', 'worldwide': 'GLOBAL', 'international': 'GLOBAL',
};


/**
 * Resolve target markets from brand data.
 * Priority: explicit targetMarkets > auto-detect from country/region/audience > default India
 */
export function resolveTargetMarkets(brand) {
    if (brand?.dna?.targetMarkets?.length > 0) {
        return brand.dna.targetMarkets.map(m => m.toUpperCase());
    }

    const markets = new Set();
    const fields = [
        brand?.dna?.country,
        brand?.dna?.region,
        brand?.dna?.targetAudience,
    ].filter(Boolean);

    for (const field of fields) {
        const lower = field.toLowerCase();
        for (const [keyword, code] of Object.entries(COUNTRY_TO_MARKET)) {
            if (lower.includes(keyword)) {
                markets.add(code);
            }
        }
    }

    return markets.size > 0 ? [...markets] : ['IN'];
}


// ============================================================================
// MARKET CONTEXT — cultural intelligence per market
// ============================================================================

const MARKET_CONTEXT = {
    IN: { name: 'India', currency: 'INR (₹)', language: 'English/Hindi/Hinglish', timezone: 'IST (UTC+5:30)', notes: 'Family-centric, festival-driven shopping. D2C boom. Instagram + WhatsApp dominant. Value-conscious. Hinglish resonates with millennials.' },
    US: { name: 'United States', currency: 'USD ($)', language: 'English', timezone: 'EST/CST/PST', notes: 'Convenience-driven. Holiday shopping (BFCM, back-to-school). Free shipping expected. Amazon-competitive. Influencer marketing strong.' },
    CA: { name: 'Canada', currency: 'CAD (C$)', language: 'English/French', timezone: 'EST/CST/PST', notes: 'Bilingual (English/French in Quebec). Environmentally conscious. Loyalty programs valued.' },
    UK: { name: 'United Kingdom', currency: 'GBP (£)', language: 'English', timezone: 'GMT/BST', notes: 'Premium-conscious. Boxing Day tradition. Sustainability focus. Strong cause marketing.' },
    EU: { name: 'Europe', currency: 'EUR (€)', language: 'varies by country', timezone: 'CET/CEST', notes: 'GDPR-aware. Quality over quantity. Local language content performs 3x better. VAT included.' },
    AE: { name: 'UAE', currency: 'AED (د.إ)', language: 'English/Arabic', timezone: 'GST (UTC+4)', notes: 'Luxury-oriented. Ramadan = biggest shopping season. Gold culture. Fri-Sat weekend. Expat-heavy.' },
    SA: { name: 'Saudi Arabia', currency: 'SAR (﷼)', language: 'Arabic/English', timezone: 'AST (UTC+3)', notes: 'Vision 2030. Young population. Arabic-first content. Ramadan + Hajj seasons critical.' },
    SG: { name: 'Singapore', currency: 'SGD (S$)', language: 'English/Mandarin/Malay/Tamil', timezone: 'SGT (UTC+8)', notes: 'Tech-savvy affluent. Multi-cultural. Brand-conscious. Food culture. Compact market.' },
    MY: { name: 'Malaysia', currency: 'MYR (RM)', language: 'Malay/English/Mandarin', timezone: 'MYT (UTC+8)', notes: 'Multi-ethnic. Halal market important. Ramadan + CNY key seasons. Price-sensitive.' },
    ID: { name: 'Indonesia', currency: 'IDR (Rp)', language: 'Bahasa Indonesia', timezone: 'WIB/WITA/WIT', notes: 'Largest Muslim population. Mobile-first. TikTok Shop dominant. Local language essential.' },
    TH: { name: 'Thailand', currency: 'THB (฿)', language: 'Thai/English', timezone: 'ICT (UTC+7)', notes: 'Songkran massive. LINE messaging. Beauty/skincare strong. Thai language content preferred.' },
    AU: { name: 'Australia', currency: 'AUD (A$)', language: 'English', timezone: 'AEST/AEDT', notes: 'Seasons REVERSED from Northern Hemisphere. EOFY (June) sales. Outdoor lifestyle. Boxing Day.' },
    NZ: { name: 'New Zealand', currency: 'NZD (NZ$)', language: 'English/Māori', timezone: 'NZST/NZDT', notes: 'Similar to AU but smaller. Māori respect important. Clean/green values.' },
    BR: { name: 'Brazil', currency: 'BRL (R$)', language: 'Portuguese', timezone: 'BRT (UTC-3)', notes: 'Carnival massive. Installment payments standard. WhatsApp for business. Portuguese required.' },
    JP: { name: 'Japan', currency: 'JPY (¥)', language: 'Japanese', timezone: 'JST (UTC+9)', notes: 'Quality-obsessed. Packaging matters. Gift-giving culture. Japanese essential. Seasonal products.' },
    KR: { name: 'South Korea', currency: 'KRW (₩)', language: 'Korean', timezone: 'KST (UTC+9)', notes: 'K-beauty/K-pop influence. KakaoTalk messaging. Korean language. Singles Day. Tech-forward.' },
};


/**
 * Build market context string for AI injection.
 * Returns cultural intelligence formatted for the AI system prompt.
 */
export function getMarketContext(targetMarkets) {
    if (!targetMarkets?.length) return '';

    const contexts = targetMarkets
        .filter(m => MARKET_CONTEXT[m])
        .map(m => {
            const ctx = MARKET_CONTEXT[m];
            return `• ${ctx.name} (${m}): Currency ${ctx.currency} | Language: ${ctx.language} | TZ: ${ctx.timezone}\n  Cultural: ${ctx.notes}`;
        });

    if (contexts.length === 0) return '';

    return '\n=== TARGET MARKET CONTEXT ===\n' +
        'Adapt ALL content, dates, pricing, cultural references, and language to these target markets:\n' +
        contexts.join('\n') + '\n';
}


/**
 * Get relevant festivals filtered by target markets.
 * Auto-detects festival mentions in user inputs (fuzzy match).
 */
export function getRelevantFestivals(userInputText = '', targetMarkets = ['IN'], maxUpcoming = 12) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const marketsSet = new Set(targetMarkets.map(m => m.toUpperCase()));

    const isRelevant = (festival) => {
        if (festival.markets.includes('GLOBAL')) return true;
        return festival.markets.some(m => marketsSet.has(m));
    };

    // Festival keyword matching
    const festivalKeywords = {
        'diwali': 'Diwali', 'deepavali': 'Diwali',
        'holi': 'Holi',
        'navratri': 'Navratri', 'durga puja': 'Navratri',
        'dussehra': 'Dussehra', 'vijayadashami': 'Dussehra',
        'ganesh chaturthi': 'Ganesh Chaturthi', 'ganpati': 'Ganesh Chaturthi',
        'eid': 'Eid', 'ramadan': 'Ramadan', 'ramzan': 'Ramadan',
        'raksha bandhan': 'Raksha Bandhan', 'rakhi': 'Raksha Bandhan',
        'janmashtami': 'Janmashtami',
        'christmas': 'Christmas', 'xmas': 'Christmas',
        'new year': 'New Year',
        'republic day': 'Republic Day',
        'independence day': 'Independence Day',
        'valentine': 'Valentine',
        'mother': 'Mother', 'father': 'Father', 'children': 'Children',
        'sankranti': 'Sankranti', 'pongal': 'Pongal',
        'baisakhi': 'Baisakhi',
        'onam': 'Onam',
        'karva chauth': 'Karva Chauth',
        'dhanteras': 'Dhanteras',
        'akshaya tritiya': 'Akshaya Tritiya',
        'bhai dooj': 'Bhai Dooj',
        'chhath': 'Chhath',
        'shivratri': 'Shivaratri',
        'thanksgiving': 'Thanksgiving',
        'halloween': 'Halloween',
        'super bowl': 'Super Bowl',
        'easter': 'Easter',
        'chinese new year': 'Chinese New Year', 'lunar new year': 'Chinese New Year',
        'songkran': 'Songkran',
        'golden week': 'Golden Week',
        'chuseok': 'Chuseok',
        'carnival': 'Carnival',
        'boxing day': 'Boxing Day',
        'labor day': 'Labor Day',
        'memorial day': 'Memorial Day',
        'singles day': "Singles' Day", '11.11': "Singles' Day",
        'black friday': 'Black Friday',
        'cyber monday': 'Cyber Monday',
        'oktoberfest': 'Oktoberfest',
        'australia day': 'Australia Day',
        'canada day': 'Canada Day',
        'guru nanak': 'Guru Nanak',
        'festive': null, 'festival': null, 'holiday': null, 'season': null,
    };

    const inputLower = (userInputText || '').toLowerCase();
    const mentionedFestivals = new Set();
    let isGenericFestive = false;

    for (const [keyword, festivalName] of Object.entries(festivalKeywords)) {
        if (inputLower.includes(keyword)) {
            if (festivalName === null) isGenericFestive = true;
            else mentionedFestivals.add(festivalName);
        }
    }

    // Future festivals relevant to target markets
    const futureFestivals = FESTIVAL_CALENDAR
        .filter(f => f.date >= today && isRelevant(f))
        .sort((a, b) => a.date.localeCompare(b.date));

    const sections = [];

    // 1. Specifically mentioned festivals
    if (mentionedFestivals.size > 0) {
        const matched = [];
        for (const name of mentionedFestivals) {
            const found = futureFestivals.find(f =>
                f.name.toLowerCase().includes(name.toLowerCase()) ||
                name.toLowerCase().includes(f.name.split(' ')[0].toLowerCase())
            );
            if (found) {
                const dateObj = new Date(found.date);
                const daysTill = Math.ceil((dateObj - now) / (1000 * 60 * 60 * 24));
                const dateStr = dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                let entry = `• ${found.name}: ${dateStr}`;
                if (found.endDate) {
                    entry += ` to ${new Date(found.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                }
                entry += ` (${daysTill > 0 ? daysTill + ' days from now' : 'TODAY!'})`;
                entry += ` | Markets: ${found.markets.join(', ')}`;
                entry += ` — Start marketing ${found.marketingLead} days before`;
                matched.push(entry);
            }
        }
        if (matched.length > 0) {
            sections.push(`REQUESTED FESTIVAL DATES (VERIFIED — DO NOT CHANGE):\n${matched.join('\n')}`);
        }
    }

    // 2. Upcoming in next 90 days
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const upcoming = futureFestivals
        .filter(f => f.date <= in90Days)
        .slice(0, isGenericFestive ? 25 : maxUpcoming);

    if (upcoming.length > 0) {
        const uList = upcoming.map(f => {
            const dateObj = new Date(f.date);
            const daysTill = Math.ceil((dateObj - now) / (1000 * 60 * 60 * 24));
            const dateStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
            let entry = `• ${f.name}: ${dateStr}`;
            if (f.endDate) entry += ` to ${new Date(f.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;
            entry += ` (${daysTill > 0 ? daysTill + ' days away' : 'TODAY!'})`;
            return entry;
        });
        sections.push(`UPCOMING FESTIVALS & KEY DATES for ${targetMarkets.join(', ')} (next 90 days):\n${uList.join('\n')}`);
    }

    // 3. Major events later this year
    const yearEnd = `${now.getFullYear()}-12-31`;
    const laterThisYear = futureFestivals
        .filter(f => f.date > in90Days && f.date <= yearEnd && ['festival', 'auspicious', 'sale'].includes(f.category))
        .slice(0, 10);

    if (laterThisYear.length > 0) {
        const lList = laterThisYear.map(f => `• ${f.name}: ${new Date(f.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`);
        sections.push(`LATER THIS YEAR (${targetMarkets.join(', ')}):\n${lList.join('\n')}`);
    }

    if (sections.length === 0) return '';

    return '\n=== VERIFIED FESTIVAL CALENDAR (' + targetMarkets.join(', ') + ') ===\n' +
        'IMPORTANT: Use ONLY these verified dates. DO NOT guess or hallucinate any date.\n' +
        sections.join('\n\n') + '\n';
}

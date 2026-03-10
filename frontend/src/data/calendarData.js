/**
 * Cultural Calendar Data — Global Festival & Event Database
 * Country-based holidays, cultural events, global marketing days,
 * social media days, and industry events.
 *
 * Types: national, cultural, religious, global, social_media, industry
 */

// Color codes by type
export const EVENT_COLORS = {
    national: { bg: '#3B82F620', border: '#3B82F6', dot: '#3B82F6', label: 'National' },
    cultural: { bg: '#A855F720', border: '#A855F7', dot: '#A855F7', label: 'Cultural' },
    religious: { bg: '#F59E0B20', border: '#F59E0B', dot: '#F59E0B', label: 'Religious' },
    global: { bg: '#10B98120', border: '#10B981', dot: '#10B981', label: 'Global' },
    social_media: { bg: '#EC489920', border: '#EC4899', dot: '#EC4899', label: 'Social Media' },
    industry: { bg: '#06B6D420', border: '#06B6D4', dot: '#06B6D4', label: 'Industry' },
    brand: { bg: '#22C55E20', border: '#22C55E', dot: '#22C55E', label: 'Brand Planned' },
    scheduled: { bg: '#8B5CF620', border: '#8B5CF6', dot: '#8B5CF6', label: 'Scheduled' },
    published: { bg: '#22D3EE20', border: '#22D3EE', dot: '#22D3EE', label: 'Published' },
}

// ═══════════════════════════════════════════════════
// COUNTRY LIST (for pickers)
// ═══════════════════════════════════════════════════
export const COUNTRIES = [
    { id: 'India', flag: '🇮🇳', label: 'India', languages: ['english', 'hindi', 'tamil', 'telugu', 'bengali', 'marathi', 'gujarati', 'punjabi', 'kannada'] },
    { id: 'US', flag: '🇺🇸', label: 'United States', languages: ['english', 'spanish'] },
    { id: 'UK', flag: '🇬🇧', label: 'United Kingdom', languages: ['english'] },
    { id: 'UAE', flag: '🇦🇪', label: 'UAE', languages: ['english', 'arabic'] },
    { id: 'Saudi Arabia', flag: '🇸🇦', label: 'Saudi Arabia', languages: ['arabic', 'english'] },
    { id: 'France', flag: '🇫🇷', label: 'France', languages: ['french', 'english'] },
    { id: 'Germany', flag: '🇩🇪', label: 'Germany', languages: ['german', 'english'] },
    { id: 'Spain', flag: '🇪🇸', label: 'Spain', languages: ['spanish', 'english'] },
    { id: 'Italy', flag: '🇮🇹', label: 'Italy', languages: ['italian', 'english'] },
    { id: 'Brazil', flag: '🇧🇷', label: 'Brazil', languages: ['portuguese', 'english'] },
    { id: 'Australia', flag: '🇦🇺', label: 'Australia', languages: ['english'] },
    { id: 'Canada', flag: '🇨🇦', label: 'Canada', languages: ['english', 'french'] },
    { id: 'Japan', flag: '🇯🇵', label: 'Japan', languages: ['japanese', 'english'] },
    { id: 'South Korea', flag: '🇰🇷', label: 'South Korea', languages: ['korean', 'english'] },
    { id: 'Singapore', flag: '🇸🇬', label: 'Singapore', languages: ['english', 'mandarin', 'malay', 'tamil'] },
    { id: 'Indonesia', flag: '🇮🇩', label: 'Indonesia', languages: ['indonesian', 'english'] },
    { id: 'Nigeria', flag: '🇳🇬', label: 'Nigeria', languages: ['english'] },
    { id: 'South Africa', flag: '🇿🇦', label: 'South Africa', languages: ['english'] },
    { id: 'Mexico', flag: '🇲🇽', label: 'Mexico', languages: ['spanish', 'english'] },
]

// All unique languages across all countries
export const ALL_LANGUAGES = [
    { id: 'english', label: 'English', flag: '🇬🇧' },
    { id: 'hindi', label: 'Hindi', flag: '🇮🇳' },
    { id: 'arabic', label: 'Arabic', flag: '🇦🇪' },
    { id: 'french', label: 'French', flag: '🇫🇷' },
    { id: 'german', label: 'German', flag: '🇩🇪' },
    { id: 'spanish', label: 'Spanish', flag: '🇪🇸' },
    { id: 'italian', label: 'Italian', flag: '🇮🇹' },
    { id: 'portuguese', label: 'Portuguese', flag: '🇧🇷' },
    { id: 'japanese', label: 'Japanese', flag: '🇯🇵' },
    { id: 'korean', label: 'Korean', flag: '🇰🇷' },
    { id: 'mandarin', label: 'Mandarin', flag: '🇨🇳' },
    { id: 'indonesian', label: 'Indonesian', flag: '🇮🇩' },
    { id: 'tamil', label: 'Tamil', flag: '🇮🇳' },
    { id: 'telugu', label: 'Telugu', flag: '🇮🇳' },
    { id: 'bengali', label: 'Bengali', flag: '🇮🇳' },
    { id: 'marathi', label: 'Marathi', flag: '🇮🇳' },
    { id: 'gujarati', label: 'Gujarati', flag: '🇮🇳' },
    { id: 'punjabi', label: 'Punjabi', flag: '🇮🇳' },
    { id: 'kannada', label: 'Kannada', flag: '🇮🇳' },
    { id: 'malay', label: 'Malay', flag: '🇲🇾' },
]

// ═══════════════════════════════════════════════════
// INDIA (2026 verified dates)
// ═══════════════════════════════════════════════════
const INDIA_EVENTS = [
    { month: 1, day: 26, name: 'Republic Day', type: 'national', emoji: '🇮🇳', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 8, day: 15, name: 'Independence Day', type: 'national', emoji: '🇮🇳', tone: 'patriotic', formats: ['social', 'banner', 'video'] },
    { month: 10, day: 2, name: 'Gandhi Jayanti', type: 'national', emoji: '🕊️', tone: 'respectful', formats: ['social'] },
    { month: 1, day: 14, name: 'Makar Sankranti / Pongal', type: 'cultural', emoji: '🪁', tone: 'festive', formats: ['social', 'offer'] },
    { month: 3, day: 4, name: 'Holi', type: 'cultural', emoji: '🎨', tone: 'playful', formats: ['social', 'campaign', 'reel'] },
    { month: 3, day: 19, name: 'Ugadi / Gudi Padwa', type: 'cultural', emoji: '🌿', tone: 'auspicious', formats: ['social'] },
    { month: 3, day: 27, name: 'Ram Navami', type: 'religious', emoji: '🙏', tone: 'devotional', formats: ['social'] },
    { month: 8, day: 28, name: 'Raksha Bandhan', type: 'cultural', emoji: '🧵', tone: 'emotional', formats: ['social', 'offer', 'campaign'] },
    { month: 9, day: 4, name: 'Janmashtami', type: 'religious', emoji: '🦚', tone: 'devotional', formats: ['social'] },
    { month: 9, day: 14, name: 'Ganesh Chaturthi', type: 'religious', emoji: '🐘', tone: 'festive', formats: ['social', 'campaign'] },
    { month: 10, day: 9, name: 'Navratri Begins', type: 'cultural', emoji: '💃', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 10, day: 20, name: 'Dussehra', type: 'cultural', emoji: '🏹', tone: 'victorious', formats: ['social', 'banner'] },
    { month: 10, day: 29, name: 'Karwa Chauth', type: 'cultural', emoji: '🌙', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 11, day: 6, name: 'Dhanteras', type: 'cultural', emoji: '✨', tone: 'auspicious', formats: ['social', 'offer'] },
    { month: 11, day: 8, name: 'Diwali', type: 'cultural', emoji: '🪔', tone: 'festive', formats: ['social', 'campaign', 'offer', 'banner', 'video'] },
    { month: 11, day: 10, name: 'Govardhan Puja', type: 'religious', emoji: '🙏', tone: 'devotional', formats: ['social'] },
    { month: 11, day: 11, name: 'Bhai Dooj', type: 'cultural', emoji: '👫', tone: 'warm', formats: ['social'] },
    { month: 11, day: 15, name: 'Chhath Puja', type: 'religious', emoji: '🌅', tone: 'devotional', formats: ['social'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
    { month: 2, day: 18, name: 'Ramadan Begins', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social'] },
    { month: 3, day: 20, name: 'Eid ul-Fitr', type: 'religious', emoji: '🌙', tone: 'festive', formats: ['social', 'offer'] },
    { month: 5, day: 27, name: 'Eid ul-Adha', type: 'religious', emoji: '🐑', tone: 'respectful', formats: ['social'] },
    { month: 5, day: 10, name: "Mother's Day", type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer', 'campaign'] },
    { month: 6, day: 21, name: "Father's Day", type: 'cultural', emoji: '👨‍👧', tone: 'warm', formats: ['social', 'offer'] },
    { month: 9, day: 5, name: "Teachers' Day", type: 'national', emoji: '📚', tone: 'respectful', formats: ['social'] },
    { month: 11, day: 14, name: "Children's Day", type: 'national', emoji: '👶', tone: 'playful', formats: ['social', 'offer'] },
    { month: 3, day: 22, name: 'IPL Season Starts', type: 'industry', emoji: '🏏', tone: 'energetic', formats: ['social', 'campaign', 'reel'] },
    { month: 10, day: 15, name: 'Festive Sale Season', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer', 'banner'] },
    { month: 1, day: 1, name: 'New Year Sale', type: 'industry', emoji: '🎆', tone: 'exciting', formats: ['campaign', 'offer'] },
]

// ═══════════════════════════════════════════════════
// US
// ═══════════════════════════════════════════════════
const US_EVENTS = [
    { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social', 'offer'] },
    { month: 1, day: 20, name: 'Martin Luther King Jr. Day', type: 'national', emoji: '✊', tone: 'respectful', formats: ['social'] },
    { month: 2, day: 2, name: 'Super Bowl Sunday', type: 'cultural', emoji: '🏈', tone: 'exciting', formats: ['social', 'campaign'] },
    { month: 2, day: 14, name: "Valentine's Day", type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer', 'campaign'] },
    { month: 3, day: 17, name: "St. Patrick's Day", type: 'cultural', emoji: '☘️', tone: 'playful', formats: ['social'] },
    { month: 5, day: 5, name: 'Cinco de Mayo', type: 'cultural', emoji: '🌮', tone: 'festive', formats: ['social'] },
    { month: 5, day: 11, name: "Mother's Day", type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 5, day: 26, name: 'Memorial Day', type: 'national', emoji: '🇺🇸', tone: 'respectful', formats: ['social', 'offer'] },
    { month: 6, day: 15, name: "Father's Day", type: 'cultural', emoji: '👔', tone: 'warm', formats: ['social', 'offer'] },
    { month: 7, day: 4, name: 'Independence Day', type: 'national', emoji: '🇺🇸', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
    { month: 9, day: 1, name: 'Labor Day', type: 'national', emoji: '⚒️', tone: 'relaxed', formats: ['social', 'offer'] },
    { month: 10, day: 31, name: 'Halloween', type: 'cultural', emoji: '🎃', tone: 'playful', formats: ['social', 'campaign', 'reel'] },
    { month: 11, day: 27, name: 'Thanksgiving', type: 'national', emoji: '🦃', tone: 'grateful', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer', 'banner', 'email'] },
    { month: 12, day: 1, name: 'Cyber Monday', type: 'industry', emoji: '💻', tone: 'exciting', formats: ['campaign', 'offer', 'email'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 31, name: "New Year's Eve", type: 'cultural', emoji: '🎉', tone: 'exciting', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// UK
// ═══════════════════════════════════════════════════
const UK_EVENTS = [
    { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 14, name: "Valentine's Day", type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 3, day: 17, name: "St. Patrick's Day", type: 'cultural', emoji: '☘️', tone: 'playful', formats: ['social'] },
    { month: 3, day: 22, name: "Mother's Day (UK)", type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 4, day: 3, name: 'Good Friday', type: 'national', emoji: '✝️', tone: 'respectful', formats: ['social'] },
    { month: 4, day: 6, name: 'Easter Monday', type: 'national', emoji: '🐣', tone: 'festive', formats: ['social', 'offer'] },
    { month: 5, day: 4, name: 'May Day Bank Holiday', type: 'national', emoji: '🌷', tone: 'relaxed', formats: ['social'] },
    { month: 6, day: 21, name: "Father's Day", type: 'cultural', emoji: '👔', tone: 'warm', formats: ['social', 'offer'] },
    { month: 6, day: 13, name: "Queen's Birthday", type: 'national', emoji: '👑', tone: 'celebratory', formats: ['social'] },
    { month: 10, day: 31, name: 'Halloween', type: 'cultural', emoji: '🎃', tone: 'playful', formats: ['social', 'reel'] },
    { month: 11, day: 5, name: 'Bonfire Night', type: 'cultural', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer', 'email'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 26, name: 'Boxing Day Sales', type: 'industry', emoji: '🎁', tone: 'exciting', formats: ['campaign', 'offer'] },
    { month: 12, day: 31, name: "New Year's Eve", type: 'cultural', emoji: '🎉', tone: 'exciting', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// UAE
// ═══════════════════════════════════════════════════
const UAE_EVENTS = [
    { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 18, name: 'Ramadan Begins', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social', 'campaign'] },
    { month: 3, day: 20, name: 'Eid al-Fitr', type: 'religious', emoji: '🌙', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 5, day: 27, name: 'Eid al-Adha', type: 'religious', emoji: '🐑', tone: 'respectful', formats: ['social', 'offer'] },
    { month: 6, day: 17, name: 'Islamic New Year', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social'] },
    { month: 7, day: 27, name: 'Al Isra wal Mi raj', type: 'religious', emoji: '🌙', tone: 'spiritual', formats: ['social'] },
    { month: 8, day: 26, name: 'Prophet Muhammad Birthday', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social'] },
    { month: 11, day: 30, name: 'Commemoration Day', type: 'national', emoji: '🇦🇪', tone: 'respectful', formats: ['social'] },
    { month: 12, day: 2, name: 'UAE National Day', type: 'national', emoji: '🇦🇪', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
    { month: 12, day: 3, name: 'UAE National Day Holiday', type: 'national', emoji: '🇦🇪', tone: 'patriotic', formats: ['social'] },
    { month: 1, day: 15, name: 'Dubai Shopping Festival', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer', 'banner'] },
    { month: 11, day: 11, name: 'Singles Day (11.11)', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 11, day: 28, name: 'White Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer', 'email'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
]

// ═══════════════════════════════════════════════════
// SAUDI ARABIA
// ═══════════════════════════════════════════════════
const SAUDI_EVENTS = [
    { month: 2, day: 18, name: 'Ramadan Begins', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social', 'campaign'] },
    { month: 3, day: 20, name: 'Eid al-Fitr', type: 'religious', emoji: '🌙', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 5, day: 27, name: 'Eid al-Adha', type: 'religious', emoji: '🐑', tone: 'respectful', formats: ['social', 'offer'] },
    { month: 2, day: 22, name: 'Saudi Founding Day', type: 'national', emoji: '🇸🇦', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 9, day: 23, name: 'Saudi National Day', type: 'national', emoji: '🇸🇦', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
    { month: 11, day: 11, name: 'Singles Day (11.11)', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 11, day: 28, name: 'White Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer', 'email'] },
]

// ═══════════════════════════════════════════════════
// FRANCE
// ═══════════════════════════════════════════════════
const FRANCE_EVENTS = [
    { month: 1, day: 1, name: 'Jour de l\'An', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 6, name: 'Épiphanie (Galette des Rois)', type: 'cultural', emoji: '👑', tone: 'festive', formats: ['social'] },
    { month: 2, day: 2, name: 'Chandeleur (Crêpe Day)', type: 'cultural', emoji: '🥞', tone: 'fun', formats: ['social', 'reel'] },
    { month: 2, day: 14, name: 'Saint-Valentin', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 4, day: 6, name: 'Easter Monday', type: 'national', emoji: '🐣', tone: 'festive', formats: ['social'] },
    { month: 5, day: 1, name: 'Fête du Travail', type: 'national', emoji: '🌷', tone: 'relaxed', formats: ['social'] },
    { month: 5, day: 25, name: 'Fête des Mères', type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 6, day: 15, name: 'Fête des Pères', type: 'cultural', emoji: '👨‍👧', tone: 'warm', formats: ['social', 'offer'] },
    { month: 6, day: 21, name: 'Fête de la Musique', type: 'cultural', emoji: '🎵', tone: 'joyful', formats: ['social', 'reel'] },
    { month: 7, day: 14, name: 'Bastille Day', type: 'national', emoji: '🇫🇷', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
    { month: 9, day: 20, name: 'Journées du Patrimoine', type: 'cultural', emoji: '🏛️', tone: 'cultural', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 25, name: 'Noël', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 31, name: 'Réveillon', type: 'cultural', emoji: '🥂', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 7, name: 'Soldes d\'Hiver (Winter Sales)', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer'] },
    { month: 6, day: 25, name: 'Soldes d\'Été (Summer Sales)', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer'] },
]

// ═══════════════════════════════════════════════════
// GERMANY
// ═══════════════════════════════════════════════════
const GERMANY_EVENTS = [
    { month: 1, day: 1, name: 'Neujahr', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 14, name: 'Valentinstag', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 2, day: 16, name: 'Karneval / Fasching', type: 'cultural', emoji: '🎭', tone: 'playful', formats: ['social', 'reel'] },
    { month: 4, day: 3, name: 'Karfreitag (Good Friday)', type: 'national', emoji: '✝️', tone: 'respectful', formats: ['social'] },
    { month: 4, day: 6, name: 'Ostermontag (Easter Monday)', type: 'national', emoji: '🐣', tone: 'festive', formats: ['social', 'offer'] },
    { month: 5, day: 1, name: 'Tag der Arbeit', type: 'national', emoji: '✊', tone: 'relaxed', formats: ['social'] },
    { month: 5, day: 11, name: 'Muttertag', type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 9, day: 19, name: 'Oktoberfest Begins', type: 'cultural', emoji: '🍺', tone: 'festive', formats: ['social', 'campaign', 'reel'] },
    { month: 10, day: 3, name: 'Tag der Deutschen Einheit', type: 'national', emoji: '🇩🇪', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 10, day: 31, name: 'Halloween', type: 'cultural', emoji: '🎃', tone: 'playful', formats: ['social'] },
    { month: 11, day: 11, name: 'Martinstag', type: 'cultural', emoji: '🏮', tone: 'traditional', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 6, name: 'Nikolaustag', type: 'cultural', emoji: '🎅', tone: 'festive', formats: ['social'] },
    { month: 12, day: 24, name: 'Heiligabend', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social'] },
    { month: 12, day: 25, name: 'Weihnachten', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 31, name: 'Silvester', type: 'cultural', emoji: '🎉', tone: 'exciting', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// SPAIN
// ═══════════════════════════════════════════════════
const SPAIN_EVENTS = [
    { month: 1, day: 1, name: 'Año Nuevo', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 6, name: 'Día de Reyes', type: 'cultural', emoji: '👑', tone: 'festive', formats: ['social', 'offer', 'campaign'] },
    { month: 2, day: 14, name: 'San Valentín', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 3, day: 15, name: 'Las Fallas (Valencia)', type: 'cultural', emoji: '🔥', tone: 'exciting', formats: ['social', 'reel'] },
    { month: 4, day: 2, name: 'Semana Santa Begins', type: 'religious', emoji: '✝️', tone: 'respectful', formats: ['social'] },
    { month: 4, day: 23, name: 'Día del Libro', type: 'cultural', emoji: '📚', tone: 'creative', formats: ['social'] },
    { month: 5, day: 4, name: 'Día de la Madre', type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 6, day: 24, name: 'Noche de San Juan', type: 'cultural', emoji: '🔥', tone: 'festive', formats: ['social', 'reel'] },
    { month: 7, day: 7, name: 'San Fermín (Running of the Bulls)', type: 'cultural', emoji: '🐂', tone: 'exciting', formats: ['social'] },
    { month: 8, day: 28, name: 'La Tomatina', type: 'cultural', emoji: '🍅', tone: 'fun', formats: ['social', 'reel'] },
    { month: 10, day: 12, name: 'Fiesta Nacional de España', type: 'national', emoji: '🇪🇸', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 10, day: 31, name: 'Halloween', type: 'cultural', emoji: '🎃', tone: 'playful', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 25, name: 'Navidad', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 31, name: 'Nochevieja', type: 'cultural', emoji: '🍇', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 7, name: 'Rebajas de Invierno', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer'] },
    { month: 7, day: 1, name: 'Rebajas de Verano', type: 'industry', emoji: '🛍️', tone: 'exciting', formats: ['campaign', 'offer'] },
]

// ═══════════════════════════════════════════════════
// ITALY
// ═══════════════════════════════════════════════════
const ITALY_EVENTS = [
    { month: 1, day: 1, name: 'Capodanno', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 6, name: 'Epifania (La Befana)', type: 'cultural', emoji: '🧹', tone: 'festive', formats: ['social'] },
    { month: 2, day: 14, name: 'San Valentino', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 2, day: 14, name: 'Carnevale di Venezia', type: 'cultural', emoji: '🎭', tone: 'playful', formats: ['social', 'reel'] },
    { month: 3, day: 8, name: 'Festa della Donna', type: 'cultural', emoji: '🌼', tone: 'empowering', formats: ['social', 'offer'] },
    { month: 4, day: 25, name: 'Festa della Liberazione', type: 'national', emoji: '🇮🇹', tone: 'patriotic', formats: ['social'] },
    { month: 5, day: 11, name: 'Festa della Mamma', type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 6, day: 2, name: 'Festa della Repubblica', type: 'national', emoji: '🇮🇹', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 8, day: 15, name: 'Ferragosto', type: 'national', emoji: '☀️', tone: 'relaxed', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 25, name: 'Natale', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
    { month: 12, day: 31, name: 'San Silvestro', type: 'cultural', emoji: '🎉', tone: 'exciting', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// BRAZIL, AUSTRALIA, CANADA, JAPAN, SOUTH KOREA, SINGAPORE, MEXICO, etc.
// ═══════════════════════════════════════════════════
const BRAZIL_EVENTS = [
    { month: 1, day: 1, name: 'Ano Novo', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 14, name: 'Carnaval', type: 'cultural', emoji: '🎭', tone: 'festive', formats: ['social', 'campaign', 'reel'] },
    { month: 4, day: 21, name: 'Tiradentes', type: 'national', emoji: '🇧🇷', tone: 'patriotic', formats: ['social'] },
    { month: 6, day: 12, name: 'Dia dos Namorados', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 6, day: 24, name: 'Festa Junina', type: 'cultural', emoji: '🌽', tone: 'festive', formats: ['social', 'campaign'] },
    { month: 9, day: 7, name: 'Independence Day', type: 'national', emoji: '🇧🇷', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 10, day: 12, name: 'Dia das Crianças', type: 'cultural', emoji: '👶', tone: 'playful', formats: ['social', 'offer'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 25, name: 'Natal', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
]

const AUSTRALIA_EVENTS = [
    { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 1, day: 26, name: 'Australia Day', type: 'national', emoji: '🇦🇺', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 4, day: 25, name: 'ANZAC Day', type: 'national', emoji: '🌺', tone: 'respectful', formats: ['social'] },
    { month: 5, day: 11, name: "Mother's Day", type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 9, day: 7, name: "Father's Day (AU)", type: 'cultural', emoji: '👔', tone: 'warm', formats: ['social', 'offer'] },
    { month: 10, day: 31, name: 'Halloween', type: 'cultural', emoji: '🎃', tone: 'playful', formats: ['social'] },
    { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign'] },
    { month: 12, day: 26, name: 'Boxing Day Sales', type: 'industry', emoji: '🎁', tone: 'exciting', formats: ['campaign', 'offer'] },
]

const JAPAN_EVENTS = [
    { month: 1, day: 1, name: 'Oshōgatsu (New Year)', type: 'national', emoji: '🎍', tone: 'auspicious', formats: ['social'] },
    { month: 2, day: 3, name: 'Setsubun', type: 'cultural', emoji: '👹', tone: 'traditional', formats: ['social'] },
    { month: 2, day: 14, name: "Valentine's Day", type: 'cultural', emoji: '🍫', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 3, day: 3, name: 'Hinamatsuri (Girls Day)', type: 'cultural', emoji: '🎎', tone: 'festive', formats: ['social'] },
    { month: 3, day: 14, name: 'White Day', type: 'cultural', emoji: '🤍', tone: 'romantic', formats: ['social', 'offer'] },
    { month: 4, day: 1, name: 'Cherry Blossom Season', type: 'cultural', emoji: '🌸', tone: 'poetic', formats: ['social', 'campaign'] },
    { month: 5, day: 5, name: 'Kodomo no Hi (Children\'s Day)', type: 'national', emoji: '🎏', tone: 'festive', formats: ['social'] },
    { month: 7, day: 7, name: 'Tanabata', type: 'cultural', emoji: '🎋', tone: 'romantic', formats: ['social'] },
    { month: 8, day: 15, name: 'Obon', type: 'cultural', emoji: '🏮', tone: 'respectful', formats: ['social'] },
    { month: 11, day: 15, name: 'Shichi-Go-San', type: 'cultural', emoji: '👘', tone: 'festive', formats: ['social'] },
    { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
]

const MEXICO_EVENTS = [
    { month: 1, day: 1, name: 'Año Nuevo', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 5, name: 'Día de la Constitución', type: 'national', emoji: '🇲🇽', tone: 'patriotic', formats: ['social'] },
    { month: 2, day: 14, name: 'Día del Amor y la Amistad', type: 'cultural', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer', 'campaign'] },
    { month: 5, day: 5, name: 'Cinco de Mayo', type: 'national', emoji: '🇲🇽', tone: 'patriotic', formats: ['social', 'campaign'] },
    { month: 5, day: 10, name: 'Día de las Madres', type: 'cultural', emoji: '💐', tone: 'emotional', formats: ['social', 'offer'] },
    { month: 9, day: 16, name: 'Independence Day', type: 'national', emoji: '🇲🇽', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
    { month: 11, day: 1, name: 'Día de los Muertos', type: 'cultural', emoji: '💀', tone: 'festive', formats: ['social', 'campaign', 'reel'] },
    { month: 11, day: 28, name: 'Buen Fin (Black Friday)', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    { month: 12, day: 12, name: 'Día de la Virgen de Guadalupe', type: 'religious', emoji: '🙏', tone: 'respectful', formats: ['social'] },
    { month: 12, day: 25, name: 'Navidad', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'campaign', 'offer'] },
]

// ═══════════════════════════════════════════════════
// GLOBAL EVENTS (Always included for all countries)
// ═══════════════════════════════════════════════════
const GLOBAL_EVENTS = [
    { month: 1, day: 1, name: 'New Year', type: 'global', emoji: '🎆', tone: 'exciting', formats: ['social'] },
    { month: 2, day: 14, name: "Valentine's Day", type: 'global', emoji: '❤️', tone: 'romantic', formats: ['social', 'offer', 'campaign'] },
    { month: 3, day: 8, name: "International Women's Day", type: 'global', emoji: '👩', tone: 'empowering', formats: ['social', 'campaign'] },
    { month: 4, day: 1, name: "April Fool's Day", type: 'global', emoji: '🤡', tone: 'playful', formats: ['social', 'reel'] },
    { month: 4, day: 22, name: 'Earth Day', type: 'global', emoji: '🌍', tone: 'conscious', formats: ['social'] },
    { month: 5, day: 1, name: 'International Workers Day', type: 'global', emoji: '✊', tone: 'respectful', formats: ['social'] },
    { month: 6, day: 5, name: 'World Environment Day', type: 'global', emoji: '🌱', tone: 'conscious', formats: ['social'] },
    { month: 6, day: 21, name: 'International Yoga Day', type: 'global', emoji: '🧘', tone: 'mindful', formats: ['social'] },
    { month: 9, day: 21, name: 'International Day of Peace', type: 'global', emoji: '☮️', tone: 'peaceful', formats: ['social'] },
    { month: 10, day: 10, name: 'World Mental Health Day', type: 'global', emoji: '🧠', tone: 'supportive', formats: ['social'] },
    { month: 11, day: 19, name: "International Men's Day", type: 'global', emoji: '👨', tone: 'empowering', formats: ['social'] },
    { month: 12, day: 10, name: 'Human Rights Day', type: 'global', emoji: '✊', tone: 'respectful', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// SOCIAL MEDIA DAYS (Always included)
// ═══════════════════════════════════════════════════
const SOCIAL_MEDIA_DAYS = [
    { month: 1, day: 21, name: 'National Hug Day', type: 'social_media', emoji: '🤗', tone: 'warm', formats: ['social', 'reel'] },
    { month: 3, day: 20, name: 'World Happiness Day', type: 'social_media', emoji: '😊', tone: 'joyful', formats: ['social', 'reel'] },
    { month: 4, day: 7, name: 'World Health Day', type: 'social_media', emoji: '🏋️', tone: 'mindful', formats: ['social'] },
    { month: 5, day: 4, name: 'Star Wars Day', type: 'social_media', emoji: '⚔️', tone: 'playful', formats: ['social', 'reel'] },
    { month: 6, day: 21, name: 'National Selfie Day', type: 'social_media', emoji: '🤳', tone: 'fun', formats: ['social', 'reel'] },
    { month: 7, day: 17, name: 'World Emoji Day', type: 'social_media', emoji: '😀', tone: 'playful', formats: ['social', 'reel'] },
    { month: 7, day: 30, name: 'International Friendship Day', type: 'social_media', emoji: '👯', tone: 'warm', formats: ['social'] },
    { month: 8, day: 19, name: 'World Photography Day', type: 'social_media', emoji: '📸', tone: 'creative', formats: ['social', 'reel'] },
    { month: 8, day: 23, name: 'Hashtag Day', type: 'social_media', emoji: '#️⃣', tone: 'trendy', formats: ['social'] },
    { month: 10, day: 1, name: 'World Coffee Day', type: 'social_media', emoji: '☕', tone: 'casual', formats: ['social'] },
    { month: 11, day: 13, name: 'World Kindness Day', type: 'social_media', emoji: '💛', tone: 'warm', formats: ['social'] },
]

// ═══════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════

const COUNTRY_EVENTS = {
    India: INDIA_EVENTS,
    US: US_EVENTS,
    USA: US_EVENTS,
    'United States': US_EVENTS,
    UK: UK_EVENTS,
    'United Kingdom': UK_EVENTS,
    UAE: UAE_EVENTS,
    'Saudi Arabia': SAUDI_EVENTS,
    France: FRANCE_EVENTS,
    Germany: GERMANY_EVENTS,
    Spain: SPAIN_EVENTS,
    Italy: ITALY_EVENTS,
    Brazil: BRAZIL_EVENTS,
    Australia: AUSTRALIA_EVENTS,
    Canada: [...US_EVENTS.filter(e => !['Independence Day', 'Thanksgiving', 'Memorial Day'].includes(e.name)),
    { month: 7, day: 1, name: 'Canada Day', type: 'national', emoji: '🇨🇦', tone: 'patriotic', formats: ['social', 'banner'] },
    { month: 10, day: 13, name: 'Thanksgiving (Canada)', type: 'national', emoji: '🦃', tone: 'grateful', formats: ['social'] },
    ],
    Japan: JAPAN_EVENTS,
    'South Korea': [
        { month: 1, day: 1, name: 'Seollal (Lunar New Year)', type: 'cultural', emoji: '🎊', tone: 'auspicious', formats: ['social'] },
        { month: 3, day: 1, name: 'Independence Movement Day', type: 'national', emoji: '🇰🇷', tone: 'patriotic', formats: ['social'] },
        { month: 5, day: 5, name: "Children's Day", type: 'national', emoji: '👶', tone: 'playful', formats: ['social'] },
        { month: 9, day: 17, name: 'Chuseok', type: 'cultural', emoji: '🌕', tone: 'festive', formats: ['social', 'offer'] },
        { month: 10, day: 3, name: 'National Foundation Day', type: 'national', emoji: '🇰🇷', tone: 'patriotic', formats: ['social'] },
        { month: 11, day: 11, name: 'Pepero Day', type: 'cultural', emoji: '🍫', tone: 'romantic', formats: ['social', 'offer'] },
        { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
    ],
    Singapore: [
        { month: 1, day: 29, name: 'Chinese New Year', type: 'cultural', emoji: '🐉', tone: 'auspicious', formats: ['social', 'offer', 'campaign'] },
        { month: 5, day: 1, name: 'Labour Day', type: 'national', emoji: '✊', tone: 'relaxed', formats: ['social'] },
        { month: 8, day: 9, name: 'National Day', type: 'national', emoji: '🇸🇬', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
        { month: 11, day: 1, name: 'Deepavali', type: 'cultural', emoji: '🪔', tone: 'festive', formats: ['social', 'offer'] },
        { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
        { month: 11, day: 11, name: 'Singles Day (11.11)', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
    ],
    Indonesia: [
        { month: 1, day: 1, name: 'Tahun Baru', type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
        { month: 2, day: 18, name: 'Ramadan Begins', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social'] },
        { month: 3, day: 20, name: 'Lebaran (Eid al-Fitr)', type: 'religious', emoji: '🌙', tone: 'festive', formats: ['social', 'offer', 'campaign'] },
        { month: 8, day: 17, name: 'Independence Day', type: 'national', emoji: '🇮🇩', tone: 'patriotic', formats: ['social', 'campaign', 'banner'] },
        { month: 12, day: 25, name: 'Natal', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social'] },
    ],
    Nigeria: [
        { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
        { month: 2, day: 18, name: 'Ramadan Begins', type: 'religious', emoji: '☪️', tone: 'respectful', formats: ['social'] },
        { month: 3, day: 20, name: 'Eid el-Fitr', type: 'religious', emoji: '🌙', tone: 'festive', formats: ['social', 'offer'] },
        { month: 6, day: 12, name: 'Democracy Day', type: 'national', emoji: '🇳🇬', tone: 'patriotic', formats: ['social', 'banner'] },
        { month: 10, day: 1, name: 'Independence Day', type: 'national', emoji: '🇳🇬', tone: 'patriotic', formats: ['social', 'campaign'] },
        { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
        { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
    ],
    'South Africa': [
        { month: 1, day: 1, name: "New Year's Day", type: 'national', emoji: '🎆', tone: 'exciting', formats: ['social'] },
        { month: 3, day: 21, name: 'Human Rights Day', type: 'national', emoji: '✊', tone: 'respectful', formats: ['social'] },
        { month: 4, day: 27, name: 'Freedom Day', type: 'national', emoji: '🇿🇦', tone: 'patriotic', formats: ['social', 'banner'] },
        { month: 6, day: 16, name: 'Youth Day', type: 'national', emoji: '✊', tone: 'empowering', formats: ['social'] },
        { month: 9, day: 24, name: 'Heritage Day (Braai Day)', type: 'national', emoji: '🔥', tone: 'festive', formats: ['social', 'reel'] },
        { month: 11, day: 28, name: 'Black Friday', type: 'industry', emoji: '🛒', tone: 'urgent', formats: ['campaign', 'offer'] },
        { month: 12, day: 16, name: 'Day of Reconciliation', type: 'national', emoji: '🕊️', tone: 'respectful', formats: ['social'] },
        { month: 12, day: 25, name: 'Christmas', type: 'cultural', emoji: '🎄', tone: 'festive', formats: ['social', 'offer'] },
    ],
    Mexico: MEXICO_EVENTS,
}

/**
 * Get all events for a given country + month
 */
export function getEventsForMonth(country = 'India', month, industry) {
    const countryEvents = COUNTRY_EVENTS[country] || []
    const allEvents = [...countryEvents, ...GLOBAL_EVENTS, ...SOCIAL_MEDIA_DAYS]

    // De-duplicate by name + month + day
    const seen = new Set()
    const unique = allEvents.filter(e => {
        const key = `${e.month}-${e.day}-${e.name}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    if (month !== undefined) {
        return unique.filter(e => e.month === month)
    }
    return unique
}

/**
 * Get upcoming events (next N days from today)
 */
export function getUpcomingEvents(country = 'India', days = 30) {
    const today = new Date()
    const allEvents = getEventsForMonth(country)
    const year = today.getFullYear()

    return allEvents
        .map(e => {
            let eventDate = new Date(year, e.month - 1, e.day)
            if (eventDate < today) eventDate = new Date(year + 1, e.month - 1, e.day)
            const daysUntil = Math.ceil((eventDate - today) / (1000 * 60 * 60 * 24))
            return { ...e, date: eventDate, daysUntil }
        })
        .filter(e => e.daysUntil >= 0 && e.daysUntil <= days)
        .sort((a, b) => a.daysUntil - b.daysUntil)
}

/**
 * Get events happening on a specific date
 */
export function getEventsForDate(country = 'India', month, day) {
    const allEvents = getEventsForMonth(country, month)
    return allEvents.filter(e => e.day === day)
}

/**
 * Get languages for a given country
 */
export function getLanguagesForCountry(countryId) {
    const country = COUNTRIES.find(c => c.id === countryId)
    if (!country) return ALL_LANGUAGES.filter(l => l.id === 'english')
    return ALL_LANGUAGES.filter(l => country.languages.includes(l.id))
}

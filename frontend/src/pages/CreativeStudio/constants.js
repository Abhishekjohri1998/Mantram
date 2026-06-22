// ── Aspect Ratio Options ──
export const ASPECT_RATIOS = [
    { ratio: '1:1', label: 'Square', icon: '⬜' },
    { ratio: '16:9', label: 'Widescreen', icon: '🖥️' },
    { ratio: '9:16', label: 'Social Story', icon: '📱' },
    { ratio: '2:3', label: 'Portrait', icon: '📷' },
    { ratio: '3:4', label: 'Traditional', icon: '🖼️' },
    { ratio: '4:5', label: 'Social Post', icon: '📸' },
    { ratio: '3:2', label: 'Standard', icon: '🎞️' },
    { ratio: '4:3', label: 'Classic', icon: '📺' },
]

// ── Creative Formats ──
export const creativeTypes = [
    { id: 'instagram-post', icon: 'photo_camera', label: 'Instagram Post', size: '1080\u00D71350', aspectRatio: '4:5' },
    { id: 'instagram-story', icon: 'smartphone', label: 'Story / Reel', size: '1080\u00D71920', aspectRatio: '9:16' },
    { id: 'facebook-ad', icon: 'ads_click', label: 'Facebook Ad', size: '1080\u00D71350', aspectRatio: '4:5' },
    { id: 'linkedin-post', icon: 'work', label: 'LinkedIn Post', size: '1200\u00D71200', aspectRatio: '1:1' },
    { id: 'youtube-thumb', icon: 'smart_display', label: 'YouTube Thumb', size: '1280\u00D7720', aspectRatio: '16:9' },
    { id: 'banner',      icon: 'web',         label: 'Banner',      size: '1920\u00D7600',  aspectRatio: '16:9' },
    { id: 'film-poster', icon: 'movie',        label: 'Film Poster', size: '2000\u00D73000', aspectRatio: '2:3'  },
    { id: 'hd-wide',     icon: 'monitor',      label: 'HD 16:9',     size: '1920\u00D71080', aspectRatio: '16:9' },
    { id: 'a4-portrait', icon: 'description',  label: 'A4 Portrait', size: '2480\u00D73508', aspectRatio: '2:3'  },
    { id: 'square-hd',   icon: 'crop_square',  label: 'Square HD',   size: '1200\u00D71200', aspectRatio: '1:1'  },
    { id: 'custom-size', icon: 'tune', label: 'Custom Size', size: 'Custom', aspectRatio: null },
]

// ── Design Styles ──
export const styles = [
    { id: 'modern', label: 'Modern', icon: 'auto_awesome' },
    { id: 'minimal', label: 'Minimal', icon: 'format_shapes' },
    { id: 'bold', label: 'Bold', icon: 'bolt' },
    { id: 'elegant', label: 'Elegant', icon: 'diamond' },
    { id: 'playful', label: 'Playful', icon: 'mood' },
    { id: 'corporate', label: 'Corporate', icon: 'business' },
]

// ── Quick-start categories ──
export const quickStartCards = [
    { id: 'social', icon: 'share', label: 'Social Media Post', desc: 'Instagram, Facebook, LinkedIn', color: '#6366f1' },
    { id: 'product', icon: 'inventory_2', label: 'Product Showcase', desc: 'Feature your product or service', color: '#f59e0b' },
    { id: 'promo', icon: 'local_offer', label: 'Promotional Offer', desc: 'Sales, discounts, special deals', color: '#ef4444' },
    { id: 'quote', icon: 'format_quote', label: 'Customer Quote', desc: 'Reviews and testimonials', color: '#10b981' },
    { id: 'announce', icon: 'campaign', label: 'Announcement', desc: 'Launches, updates, news', color: '#8b5cf6' },
    { id: 'story', icon: 'auto_stories', label: 'Brand Story', desc: 'Tell your brand narrative', color: '#ec4899' },
]

// ── Template Categories with Sub-Templates ──
export const templateCategories = [
    {
        id: 'sales', icon: 'local_offer', label: 'Sales & Offers', color: '#ef4444',
        desc: 'Promotional offers, discounts, festive & seasonal sales',
        subTemplates: [
            {
                id: 'general-sale', label: 'General Sale', icon: 'sell',
                desc: 'All-purpose sale/offer design',
                fields: [
                    { key: 'offerText', label: 'Offer Details', type: 'text', placeholder: 'e.g. FLAT 50% OFF' },
                    { key: 'validTill', label: 'Valid Till', type: 'text', placeholder: 'e.g. This Weekend Only' },
                    { key: 'cta', label: 'Call to Action', type: 'text', placeholder: 'e.g. Order Now', default: 'Order Now' },
                    { key: 'mood', label: 'Design Mood', type: 'select', options: ['Urgency/Bold', 'Elegant Luxury', 'Minimalist', 'Playful/Fun'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a promotional sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'SPECIAL OFFER'}\nVALID TILL: ${vals.validTill || 'Limited Time'}\nCTA: "${vals.cta || 'Order Now'}"\nMOOD: ${vals.mood || 'Urgency/Bold'}\nBRAND COLORS: ${colors}\nMake the offer text LARGE and prominent. Eye-catching, bold, impossible to scroll past. Include ${brand.name} branding.`
                }
            },
            {
                id: 'diwali-sale', label: 'Diwali Sale', icon: 'celebration',
                desc: 'Festival of lights themed sale',
                fields: [
                    { key: 'offerText', label: 'Offer', type: 'text', placeholder: 'e.g. Diwali Mega Sale - Up to 60% OFF' },
                    { key: 'productName', label: 'Product/Category', type: 'text', placeholder: 'e.g. on all Electronics' },
                    { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Shop the Festive Sale', default: 'Shop Now' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a Diwali sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'Diwali Special Offer'}\nPRODUCT: ${vals.productName || ''}\nCTA: "${vals.cta || 'Shop Now'}"\nTHEME: Diwali \u2014 diyas, rangoli, lanterns, golden sparkles, warm festive lighting\nBRAND COLORS: ${colors}\nFestive and joyful but still on-brand. Include ${brand.name} logo. Traditional+modern design.`
                }
            },
            {
                id: 'republic-sale', label: 'Republic Day Sale', icon: 'flag',
                desc: 'Patriotic themed sale',
                fields: [
                    { key: 'offerText', label: 'Offer', type: 'text', placeholder: 'e.g. Republic Day Sale \u2013 26% OFF' },
                    { key: 'productName', label: 'Product', type: 'text', placeholder: 'e.g. on all categories' },
                    { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Celebrate & Save', default: 'Shop Now' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a Republic Day sale creative for ${brand.name}.\nOFFER: ${vals.offerText || 'Republic Day Special'}\nPRODUCT: ${vals.productName || ''}\nCTA: "${vals.cta || 'Shop Now'}"\nTHEME: Republic Day \u2014 tricolor (saffron, white, green), patriotic, flag elements, Ashoka Chakra subtle\nBRAND COLORS: ${colors}\nPatriotic + brand identity blend. Include ${brand.name} logo.`
                }
            },
        ]
    },
    {
        id: 'product', icon: 'shopping_bag', label: 'Product Showcase', color: '#f59e0b',
        desc: 'Feature products with professional brand styling',
        subTemplates: [
            {
                id: 'product-hero', label: 'Hero Shot', icon: 'star',
                desc: 'Full product hero with brand styling',
                fields: [
                    { key: 'productName', label: 'Product Name', type: 'text', placeholder: 'e.g. Premium Leather Bag' },
                    { key: 'tagline', label: 'Tagline', type: 'text', placeholder: 'e.g. Crafted for Excellence' },
                    { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Shop Now', default: 'Shop Now' },
                    { key: 'layout', label: 'Layout', type: 'select', options: ['Centered', 'Lifestyle', 'Flat Lay', 'Minimal White', 'Dark Luxury'] },
                    { key: 'image', label: 'Product Image', type: 'image', hint: 'Upload product photo' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    const font = brand.dna?.fonts?.heading?.family || 'modern sans-serif'
                    return `Create a premium product showcase for ${brand.name}.\nPRODUCT: ${vals.productName || 'a product'}\nTAGLINE: "${vals.tagline || 'Quality You Deserve'}"\nCTA: "${vals.cta || 'Shop Now'}"\nLAYOUT: ${vals.layout || 'Centered'}\nBRAND COLORS: ${colors}\nFONT: ${font}\nClean background, brand color accents, product as hero element, professional.`
                }
            },
            {
                id: 'product-comparison', label: 'Product Comparison', icon: 'compare',
                desc: 'Side-by-side product comparison',
                fields: [
                    { key: 'product1', label: 'Product 1', type: 'text', placeholder: 'e.g. Basic Plan' },
                    { key: 'product2', label: 'Product 2', type: 'text', placeholder: 'e.g. Premium Plan' },
                    { key: 'highlight', label: 'What to Highlight', type: 'text', placeholder: 'e.g. Premium = Best Value' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a product comparison visual for ${brand.name}.\nLEFT: ${vals.product1 || 'Option A'}\nRIGHT: ${vals.product2 || 'Option B'}\nHIGHLIGHT: ${vals.highlight || 'Choose the best'}\nBRAND COLORS: ${colors}\nClean split layout, easy to compare, ${brand.name} branding applied.`
                }
            },
        ]
    },
    {
        id: 'quotes', icon: 'format_quote', label: 'Quotes & Testimonials', color: '#10b981',
        desc: 'Customer reviews, brand quotes, motivational content',
        subTemplates: [
            {
                id: 'testimonial', label: 'Customer Testimonial', icon: 'reviews',
                desc: 'Customer review card',
                fields: [
                    { key: 'quote', label: 'Quote Text', type: 'textarea', placeholder: 'Type the quote...' },
                    { key: 'author', label: 'Author Name', type: 'text', placeholder: 'e.g. Rahul Sharma, CEO' },
                    { key: 'bgStyle', label: 'Background', type: 'select', options: ['Solid Brand Color', 'Gradient', 'Texture', 'Photo (Blurred)', 'Dark/Moody'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a testimonial card for ${brand.name}.\nQUOTE: "${vals.quote || 'Great experience!'}"\nAUTHOR: ${vals.author || 'Happy Customer'}\nBG: ${vals.bgStyle || 'Solid Brand Color'}\nBRAND COLORS: ${colors}\nElegant, large quotation marks, ${brand.name} logo subtle in corner.`
                }
            },
            {
                id: 'motivational', label: 'Motivational Quote', icon: 'lightbulb',
                desc: 'Inspirational brand quote',
                fields: [
                    { key: 'quote', label: 'Quote', type: 'textarea', placeholder: 'e.g. Dream big, start small...' },
                    { key: 'bgStyle', label: 'Background', type: 'select', options: ['Gradient', 'Nature Photo', 'Abstract', 'Minimal', 'Dark'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a motivational quote post for ${brand.name}.\nQUOTE: "${vals.quote || 'Success starts with a single step'}"\nBG: ${vals.bgStyle || 'Gradient'}\nUSE brand colors: ${colors}\nInspirational, visually stunning, ${brand.name} branding.`
                }
            },
        ]
    },
    {
        id: 'announcement', icon: 'campaign', label: 'Announcements', color: '#8b5cf6',
        desc: 'Launches, updates, news, and alerts',
        subTemplates: [
            {
                id: 'launch', label: 'Product Launch', icon: 'rocket_launch',
                desc: 'New product/service launch',
                fields: [
                    { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. Introducing Our Latest Innovation' },
                    { key: 'details', label: 'Details', type: 'textarea', placeholder: 'Brief details...' },
                    { key: 'tone', label: 'Tone', type: 'select', options: ['Exciting', 'Professional', 'Teaser/Mystery', 'Celebratory'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a product launch announcement for ${brand.name}.\nHEADLINE: "${vals.headline || 'Something Big is Coming!'}"\nDETAILS: ${vals.details || ''}\nTONE: ${vals.tone || 'Exciting'}\nBRAND COLORS: ${colors}\nBold, shareable, ${brand.name} branding prominent.`
                }
            },
            {
                id: 'news-update', label: 'News/Update', icon: 'newspaper',
                desc: 'Brand news or company update',
                fields: [
                    { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. We just hit 10K customers!' },
                    { key: 'details', label: 'Details', type: 'textarea', placeholder: 'More info...' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a news update post for ${brand.name}.\nHEADLINE: "${vals.headline || 'Exciting Update'}"\nDETAILS: ${vals.details || ''}\nBRAND COLORS: ${colors}\nProfessional, newsworthy, ${brand.name} identity applied.`
                }
            },
        ]
    },
    {
        id: 'events', icon: 'event', label: 'Events', color: '#ec4899',
        desc: 'Event promotions, invitations, and recaps',
        subTemplates: [
            {
                id: 'event-promo', label: 'Event Promotion', icon: 'calendar_month',
                desc: 'Promote an upcoming event',
                fields: [
                    { key: 'eventName', label: 'Event Name', type: 'text', placeholder: 'e.g. Annual Tech Summit 2026' },
                    { key: 'date', label: 'Date & Time', type: 'text', placeholder: 'e.g. March 15 | 10AM' },
                    { key: 'venue', label: 'Venue', type: 'text', placeholder: 'e.g. Taj Hotel, Mumbai' },
                    { key: 'cta', label: 'CTA', type: 'text', placeholder: 'e.g. Register Now', default: 'Register Now' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create an event promo for ${brand.name}.\nEVENT: ${vals.eventName || 'Event'}\nDATE: ${vals.date || 'Coming Soon'}\nVENUE: ${vals.venue || 'TBA'}\nCTA: "${vals.cta || 'Register Now'}"\nBRAND COLORS: ${colors}\nClear hierarchy: Name > Date > Venue > CTA. ${brand.name} branding prominent.`
                }
            },
            {
                id: 'birthday', label: 'Birthday Post', icon: 'cake',
                desc: 'Birthday greetings for team/clients',
                fields: [
                    { key: 'personName', label: 'Person\'s Name', type: 'text', placeholder: 'e.g. Amit Kumar' },
                    { key: 'message', label: 'Birthday Message', type: 'textarea', placeholder: 'e.g. Wishing you a wonderful birthday!' },
                    { key: 'image', label: 'Photo', type: 'image', hint: 'Upload their photo (optional)' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a birthday greeting post for ${brand.name}.\nNAME: ${vals.personName || 'Team Member'}\nMESSAGE: "${vals.message || 'Happy Birthday!'}"\nBRAND COLORS: ${colors}\nFestive, warm, celebration vibes. Cake/balloons/confetti elements. Brand logo included.`
                }
            },
            {
                id: 'anniversary', label: 'Anniversary', icon: 'favorite',
                desc: 'Work anniversary or milestone celebration',
                fields: [
                    { key: 'personName', label: 'Person\'s Name', type: 'text', placeholder: 'e.g. Priya Patel' },
                    { key: 'years', label: 'Years / Milestone', type: 'text', placeholder: 'e.g. 5 Years' },
                    { key: 'message', label: 'Message', type: 'textarea', placeholder: 'e.g. Thank you for your dedication!' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a work anniversary celebration post for ${brand.name}.\nNAME: ${vals.personName || 'Team Member'}\nMILESTONE: ${vals.years || 'Anniversary'}\nMESSAGE: "${vals.message || 'Thank you for your incredible journey with us!'}"\nBRAND COLORS: ${colors}\nCelebratory, professional, warm. ${brand.name} branding applied.`
                }
            },
        ]
    },
    {
        id: 'content', icon: 'analytics', label: 'Content & Info', color: '#0ea5e9',
        desc: 'Infographics, tips, educational content',
        subTemplates: [
            {
                id: 'infographic', label: 'Infographic', icon: 'bar_chart',
                desc: 'Data-driven visual content',
                fields: [
                    { key: 'topic', label: 'Topic', type: 'text', placeholder: 'e.g. 5 Benefits of Organic Products' },
                    { key: 'points', label: 'Key Points (one per line)', type: 'textarea', placeholder: 'Point 1\nPoint 2\nPoint 3' },
                    { key: 'style', label: 'Style', type: 'select', options: ['Numbered List', 'Icon Grid', 'Flowchart', 'Statistics'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create an infographic for ${brand.name}.\nTOPIC: ${vals.topic || 'Key Facts'}\nPOINTS: ${vals.points || '1. Point one\n2. Point two'}\nSTYLE: ${vals.style || 'Numbered List'}\nBRAND COLORS: ${colors}\nIcons for each point, visually digestible, ${brand.name} branding.`
                }
            },
            {
                id: 'service-post', label: 'Service Highlight', icon: 'design_services',
                desc: 'Highlight a service offering',
                fields: [
                    { key: 'serviceName', label: 'Service Name', type: 'text', placeholder: 'e.g. Interior Design Consultation' },
                    { key: 'headline', label: 'Headline', type: 'text', placeholder: 'e.g. Expert Design, Made Simple' },
                    { key: 'style', label: 'Visual Style', type: 'select', options: ['Corporate Clean', 'Modern Gradient', 'Illustrated', 'Geometric'] },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a service highlight post for ${brand.name}.\nSERVICE: ${vals.serviceName || 'our service'}\nHEADLINE: "${vals.headline || 'Expert Service'}"\nSTYLE: ${vals.style || 'Corporate Clean'}\nBRAND COLORS: ${colors}\nInformative, visually appealing, ${brand.name} identity.`
                }
            },
            {
                id: 'behind-scenes', label: 'Behind the Scenes', icon: 'videocam',
                desc: 'Show process and culture',
                fields: [
                    { key: 'scene', label: 'What\'s Happening?', type: 'text', placeholder: 'e.g. Team brainstorming' },
                    { key: 'vibe', label: 'Vibe', type: 'select', options: ['Authentic', 'Professional', 'Fun/Playful', 'Creative'] },
                    { key: 'image', label: 'Photo', type: 'image', hint: 'Upload a BTS photo' },
                ],
                buildPrompt: (brand, vals) => {
                    const colors = brand.dna?.colors?.map(c => c.name || 'brand accent').filter(Boolean).join(', ') || 'brand colors'
                    return `Create a behind-the-scenes story for ${brand.name}.\nSCENE: ${vals.scene || 'Team at work'}\nVIBE: ${vals.vibe || 'Authentic'}\nBRAND COLORS: ${colors} as accent overlays\nAuthentic, warm, ${brand.name} brand identity maintained.`
                }
            },
        ]
    },
]

// ── Camera Shot Presets ──
export const CAMERA_SHOT_PRESETS = [
    {
        id: 'worms-eye-hero',
        label: "Worm's Eye",
        icon: 'south',
        emoji: '🐛',
        color: '#f97316',
        description: 'Camera flat on ground, subject towers above, open sky fills the frame',
        injection: 'SHOT TYPE: extreme worm\'s-eye view. Camera is placed flat on the ground pointing straight up. The subject stands directly over the camera lens, legs straddling it, body filling the full vertical frame from bottom to top. The product or hand is thrust downward toward the lens and appears enormous in the near foreground \u2014 3\u00D7 to 5\u00D7 larger than life. The subject\'s face looks down at the camera with confidence. Open blue sky, clouds, or clean studio ceiling fills the top 60% of the frame behind them. Ultra-wide 14mm lens, strong forced perspective, feet and legs massive at bottom, torso receding, face small at top. Shot style: Maxi / Pepsi commercial worm\'s-eye street photography.',
    },
    {
        id: 'high-action',
        label: 'High Action',
        icon: 'bolt',
        emoji: '⚡',
        color: '#ef4444',
        description: 'Mid-air jump, product thrust toward lens, motion-blurred background',
        injection: 'SHOT TYPE: low-angle action freeze shot. Camera is positioned at waist height or below, angled upward. Subject is caught mid-jump or mid-leap, body airborne, at least one foot off or near the ground. The product (can, bottle, sneaker, or box) is gripped in one hand and thrust aggressively toward the camera \u2014 it appears massive and sharp in the foreground while the subject\'s body is in focus behind it. Background is a real urban street or concrete wall with horizontal motion blur streaks from passing cars or environmental movement. Sky fills the top of frame. 1/2000s freeze shutter. 24mm wide-angle. Shot style: Red Bull / Nike action advertising.',
    },
    {
        id: 'fisheye-lean',
        label: 'Fisheye Flex',
        icon: 'lens',
        emoji: '🐟',
        color: '#8b5cf6',
        description: 'Extreme fisheye, ground level, buildings bow outward around the subject',
        injection: 'SHOT TYPE: extreme ground-level fisheye distortion shot. Camera is placed at or below ankle height with a super-wide 8mm fisheye lens. Subject crouches or squats low to the ground, filling the center frame. Their sneakers, feet, or lower body are enormous and occupying the bottom third of the frame. Surrounding skyscrapers, buildings, or walls bow dramatically outward in a barrel-distortion curve \u2014 bending away from the center like the frame is wrapping around the subject. The ground curves downward at the edges. Everything except the subject is distorted. Sky at top. Shot style: Supreme / streetwear fisheye skate photography, girl-in-city crouch pose.',
    },
    {
        id: 'fashion-low',
        label: 'Low Editorial',
        icon: 'camera_enhance',
        emoji: '👟',
        color: '#06b6d4',
        description: 'Ground-level, sole/product massive in foreground, model crouches over the lens',
        injection: 'SHOT TYPE: ultra-low ground editorial shot. Camera is positioned at floor level, lens pointing upward at roughly 45 degrees. Subject crouches or leans dramatically toward the camera, one leg extended toward the lens so the shoe sole or sneaker sole fills the extreme bottom foreground in sharp focus \u2014 appearing as large as the subject\'s entire torso. The model\'s face is visible above, looking down into the lens with editorial attitude. Studio background with strong directional rim lighting. The sole detail, tread, and texture are razor-sharp in macro foreground while the body is also in focus. Shot style: Midjourney sneaker editorial \u2014 sole-forward crouch shot, fashion magazine.',
    },
    {
        id: 'dutch-tilt',
        label: 'Dutch Tilt',
        icon: 'rotate_90_degrees_cw',
        emoji: '↗️',
        color: '#ec4899',
        description: 'Camera tilted 20\u201330\u00B0, horizon diagonal, cinematic psychological tension',
        injection: 'SHOT TYPE: Dutch angle / canted camera shot. The entire frame is rotated approximately 25 degrees clockwise or counter-clockwise. The horizon line is a strong diagonal. Subject is positioned off-center in the frame, their body aligned with the tilt so they appear to defy gravity. Strong negative space on one side. The product is held prominently. Background shows a cityscape, hallway, or editorial studio that also participates in the tilt creating visual disorientation. Anamorphic lens with slight oval bokeh. Shot style: cinematic editorial, fashion campaign, psychological tension photography \u2014 Vogue editorial.',
    },
    {
        id: 'overhead-flatlay',
        label: 'Overhead',
        icon: 'arrow_downward',
        emoji: '⬇️',
        color: '#22c55e',
        description: 'Dead overhead flat lay \u2014 product styled on surface with dramatic shadows',
        injection: 'SHOT TYPE: dead-overhead flat lay. Camera is mounted directly above, pointing straight down at 90 degrees to the surface. The product is the hero \u2014 beautifully styled and placed on a clean surface (marble, concrete, white seamless, or textured paper). Supporting props are arranged symmetrically or artistically around the product. A single strong light source from one side casts crisp, long geometric shadows that become a design element. The product label or face is perfectly oriented toward the viewer. Top-down. Nothing in the frame except product, surface, and intentional props. Shot style: commercial product flat lay, Kinfolk magazine, Apple product photography.',
    },
    {
        id: 'dramatic-close',
        label: 'Extreme Close',
        icon: 'search',
        emoji: '🔍',
        color: '#eab308',
        description: 'Macro close-up, product texture as hero, silky bokeh surrounds it',
        injection: 'SHOT TYPE: extreme macro close-up. Camera is at macro range \u2014 lens nearly touching the product or face. Subject or product fills and overflows the entire frame \u2014 we see nothing but texture, material, and surface detail. The label, fabric weave, skin pore, condensation droplet, or material finish becomes the visual universe. Shot on 105mm macro lens, f/2.8, razor-thin depth of field \u2014 only a 2mm slice is perfectly sharp while everything behind and in front dissolves into smooth creamy bokeh. Studio lighting rakes at a low angle to reveal every micro-texture as relief. Shot style: watch advertisement close-up, perfume flask, sneaker material close.',
    },
    {
        id: 'cinematic-wide',
        label: 'Cinematic Wide',
        icon: 'panorama_wide_angle',
        emoji: '🎬',
        color: '#3b82f6',
        description: 'Epic 2.39:1 anamorphic wide, subject small in vast landscape, cinematic haze',
        injection: 'SHOT TYPE: anamorphic cinematic wide shot. Ultra-wide establishing frame in 2.39:1 letterbox widescreen ratio. The subject and product are positioned confidently in the lower third of the frame \u2014 intentionally small relative to the sweeping landscape, architecture, or environment around them. The scene has multiple depth layers: sharp foreground element, subject in mid-ground, atmospheric haze or fog in the distance. Anamorphic lens flare visible on light sources. Golden hour or dramatic mixed light. Cinematic color grade \u2014 teal shadows, warm highlights. Shot style: Denis Villeneuve / Christopher Nolan commercial \u2014 the environment is as important as the subject.',
    },
    {
        id: 'freeze-motion',
        label: 'Freeze Frame',
        icon: 'shutter_speed',
        emoji: '❄️',
        color: '#67e8f9',
        description: 'Ultra-fast shutter: liquid splash, fabric fan, or flying product \u2014 all suspended',
        injection: 'SHOT TYPE: high-speed strobe freeze. Camera set to 1/8000s shutter speed or strobe-frozen at that equivalent. A physically impossible moment is captured: liquid bursting outward from a shaken bottle, fabric billowing and suspended mid-flow, the product thrown into the air with trajectory particles around it, or water droplets exploding upward from a surface hit. Every droplet, thread, and particle is individually sharp and frozen \u2014 arrested mid-physics. Background is a clean studio or gradient. The product is at the center of the explosive energy. Shot style: Milk splash advertisement, Absolut Vodka frozen moment, fashion water spray editorial.',
    },
    {
        id: 'shoulder-candid',
        label: 'Street Candid',
        icon: 'photo_camera_back',
        emoji: '📸',
        color: '#a3e635',
        description: 'Handheld 35mm film, authentic unposed street energy, real-life moment',
        injection: 'SHOT TYPE: candid street documentary. Handheld camera with natural shake, shot on 35mm film equivalent (Kodak Portra 400 or Fuji 400H color science). The subject is NOT posed \u2014 they are caught mid-laugh, mid-walk, mid-sip, or mid-conversation, fully immersed in their own world. The product appears naturally in the scene (in their hand, on a table, in a bag). Composition is slightly off-center, breathing room on one side. Natural available light \u2014 golden hour sunlight, neon bounce, or soft overcast. Film grain at ISO 1600 visible. Slight vignette. No studio feel whatsoever. Shot style: Leica street photography, Tyler Mitchell, Nan Goldin \u2014 real moment, real life.',
    },
    {
        id: 'birds-eye-social',
        label: "Bird's Eye",
        icon: 'north',
        emoji: '🦅',
        color: '#f59e0b',
        description: "Directly overhead, subject looks tiny within bold graphic ground geometry",
        injection: "SHOT TYPE: high aerial bird's-eye view. Camera is positioned directly above, 10\u201330 feet high, pointing straight down. The subject lies, sits, or stands on a graphic surface \u2014 bold geometric tiles, painted road markings, a colorful rug, or a patterned floor. The geometric ground pattern creates a strong graphic composition that the subject is deliberately placed within \u2014 like a human element in an abstract diagram. The subject and product are seen from directly above, face visible looking up at the camera (if portrait) or artfully arranged (if flatlay). Negative space is used intentionally. Shot style: aerial fashion Instagram, Cosmo flat lay, Alex Prager overhead.",
    },
    {
        id: 'over-shoulder',
        label: 'Over Shoulder',
        icon: 'switch_camera',
        emoji: '👁️',
        color: '#d946ef',
        description: "Camera behind subject's shoulder \u2014 immersive POV, we see what they see",
        injection: "SHOT TYPE: over-the-shoulder POV shot. Camera is positioned just behind and above the subject's right or left shoulder \u2014 we see the back of their head, neck, and one shoulder blurred in the immediate foreground. The subject is reaching toward the product, looking at it, interacting with it \u2014 and we are right behind them, inhabiting their perspective. The product is in sharp focus in the mid-ground. If another person is present, we see their face reacting to our subject. 85mm lens, shallow depth of field, shoulder is soft bokeh at screen edge. Intimate, cinematic, first-person narrative. Shot style: fashion film, perfume campaign \u2014 immersive editorial storytelling.",
    },
];

// ── Image Models ──
// nativeRatios: ratios the model generates WITHOUT any post-crop (Sharp bypass).
// Format picker filters creativeTypes to only show formats in this list.
const _G = ['1:1','4:5','9:16','3:4','16:9','4:3','3:2','2:3','21:9']; // Gemini native set
export const IMAGE_MODELS = [
    { id: 'nanobanana-2',   name: 'NanoBanana 2',   icon: 'auto_awesome', desc: 'Default \u2022 Fast \u2022 Best with references', provider: 'Gemini', badge: '\u26A1', color: '#a855f7', nativeRatios: _G },
    { id: 'nanobanana-pro', name: 'NanoBanana Pro', icon: 'diamond',      desc: 'Premium quality \u2022 Better details',        provider: 'Gemini', badge: '\uD83D\uDC8E', color: '#ec4899', nativeRatios: _G },
    { id: 'flux-pro-v1.1', name: 'Flux Pro v1.1',  icon: 'bolt',         desc: 'Photorealistic \u2022 Great anatomy',          provider: 'Gemini', badge: '\uD83D\uDD25', color: '#f97316', nativeRatios: _G },
    { id: 'flux-2-pro',    name: 'Flux 2 Pro',     icon: 'stars',        desc: 'Latest Flux \u2022 Premium photorealism',      provider: 'Gemini', badge: '\u2728',  color: '#eab308', nativeRatios: _G },
    { id: 'seedream-5',    name: 'Seedream 5',     icon: 'park',         desc: 'Creative \u2022 Artistic style',               provider: 'Gemini', badge: '\uD83C\uDF31', color: '#22c55e', nativeRatios: _G },
    { id: 'ideogram',      name: 'Ideogram v3',    icon: 'text_fields',  desc: 'Best for text in images',                 provider: 'Gemini', badge: '\uD83C\uDFA8', color: '#06b6d4', nativeRatios: _G },
    { id: 'grok-imagen',   name: 'Grok Imagen',    icon: 'smart_toy',    desc: 'xAI \u2022 Square only (1:1)',                 provider: 'xAI',    badge: '\uD83E\uDD16', color: '#ef4444', nativeRatios: ['1:1'] },
];

// ── Animate Models ──
export const ANIMATE_MODELS = {
    'gemini-flash': { name: 'Gemini Flash Video', icon: '⚡', dur: [4, 10], ratios: ['16:9', '9:16'], firstFrame: true, refImages: true, nativeAudio: false, desc: 'Google Gemini Flash Video' },
    'happyhorse-1.0': { name: 'HappyHorse 1.0', icon: '🐴', dur: [3, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], firstFrame: true, refImages: true, nativeAudio: false, desc: 'Premium cinematic motion' },
    'happyhorse-1.1': { name: 'HappyHorse 1.1', icon: '🐴', dur: [3, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], firstFrame: true, refImages: true, nativeAudio: false, desc: 'Premium HappyHorse 1.1 cinematic motion' },
    'grok-imagine': { name: 'Grok Imagine', icon: '🤖', dur: [1, 15], ratios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'], firstFrame: true, refImages: false, nativeAudio: true, desc: 'Fast, affordable, image-to-video' },
    'seedance-2.0': { name: 'Seedance 2.0', icon: '🎞️', dur: [4, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'], firstFrame: true, refImages: true, nativeAudio: true, desc: 'Cinematic, camera control' },
    'kling-3.0': { name: 'Kling 3.0', icon: '🖥️', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], firstFrame: true, refImages: false, nativeAudio: true, desc: 'Best motion & physics' },
    'veo-3.1': { name: 'Veo 3.1', icon: '🎬', dur: [4, 8], ratios: ['16:9', '9:16'], firstFrame: true, refImages: true, nativeAudio: true, desc: 'Premium cinematic quality' },
    'seedance-1.0': { name: 'Seedance 1.0', icon: '🌱', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'], firstFrame: true, refImages: false, nativeAudio: false, desc: 'Fast & affordable' },
};

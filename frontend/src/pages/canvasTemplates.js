// Canvas Editor — Pre-Built Template Library
// Each template is a JSON layout definition that populates the canvas with one click

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'social', label: 'Social Post' },
  { id: 'story', label: 'Story' },
  { id: 'ad', label: 'Ad Banner' },
  { id: 'flyer', label: 'Flyer' },
  { id: 'event', label: 'Event' },
  { id: 'business', label: 'Business' },
  { id: 'quote', label: 'Quote' },
  { id: 'sale', label: 'Sale' },
]

export const TEMPLATE_LIBRARY = [
  // ── SOCIAL POSTS ──
  { id: 't-social-1', name: 'Bold Announcement', cat: 'social', icon: 'campaign', layout: {
    background: '#1a1a2e', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 1080, color: '#1a1a2e' },
      { type: 'rect', x: 40, y: 40, w: 1000, h: 1000, color: 'transparent', radius: 20, label: 'Border', stroke: '#6366f1', strokeWidth: 3 },
      { type: 'text', text: 'BIG NEWS', x: 540, y: 300, w: 800, font: 'Bebas Neue', size: 120, weight: '700', color: '#ffffff', align: 'center', label: 'Headline' },
      { type: 'rect', x: 290, y: 420, w: 500, h: 4, color: '#6366f1', label: 'Divider' },
      { type: 'text', text: 'Something amazing is coming your way. Stay tuned for the big reveal.', x: 540, y: 540, w: 700, font: 'Inter', size: 28, weight: '400', color: '#94a3b8', align: 'center', label: 'Body' },
      { type: 'text', text: 'LEARN MORE →', x: 540, y: 750, w: 400, font: 'Inter', size: 22, weight: '700', color: '#818cf8', align: 'center', label: 'CTA' },
    ]
  }},
  { id: 't-social-2', name: 'Minimal Quote Card', cat: 'social', icon: 'chat_bubble', layout: {
    background: '#faf5ff', elements: [
      { type: 'text', text: '"', x: 100, y: 200, w: 200, font: 'Playfair Display', size: 200, weight: '700', color: '#a78bfa40', align: 'left', label: 'Quote Mark' },
      { type: 'text', text: 'Design is not just what it looks like. Design is how it works.', x: 540, y: 450, w: 750, font: 'Playfair Display', size: 44, weight: '600', color: '#1e1b4b', align: 'center', label: 'Quote' },
      { type: 'rect', x: 490, y: 620, w: 100, h: 3, color: '#a78bfa', label: 'Divider' },
      { type: 'text', text: '— Steve Jobs', x: 540, y: 680, w: 400, font: 'Inter', size: 20, weight: '500', color: '#7c3aed', align: 'center', label: 'Author' },
    ]
  }},
  { id: 't-social-3', name: 'Gradient Impact', cat: 'social', icon: 'local_fire_department', layout: {
    background: '#0f172a', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 540, color: '#6366f1', label: 'Top Block' },
      { type: 'text', text: 'LEVEL UP', x: 540, y: 200, w: 800, font: 'Outfit', size: 96, weight: '900', color: '#ffffff', align: 'center', label: 'Headline' },
      { type: 'text', text: 'YOUR SKILLS', x: 540, y: 340, w: 800, font: 'Outfit', size: 96, weight: '900', color: '#c7d2fe', align: 'center', label: 'Headline 2' },
      { type: 'text', text: 'Join 10,000+ creators who are already transforming their craft with our platform.', x: 540, y: 650, w: 700, font: 'Inter', size: 24, weight: '400', color: '#94a3b8', align: 'center', label: 'Body' },
      { type: 'text', text: 'GET STARTED FREE', x: 540, y: 850, w: 400, font: 'Inter', size: 24, weight: '700', color: '#818cf8', align: 'center', label: 'CTA' },
    ]
  }},
  { id: 't-social-4', name: 'Tips Carousel', cat: 'social', icon: 'lightbulb', layout: {
    background: '#0c0a1a', elements: [
      { type: 'rect', x: 60, y: 60, w: 960, h: 960, color: '#1e1b4b', radius: 24, label: 'Card BG' },
      { type: 'text', text: '5 TIPS TO', x: 540, y: 250, w: 700, font: 'Bebas Neue', size: 72, weight: '700', color: '#818cf8', align: 'center', label: 'Title' },
      { type: 'text', text: 'BOOST YOUR BRAND', x: 540, y: 350, w: 700, font: 'Bebas Neue', size: 72, weight: '700', color: '#ffffff', align: 'center', label: 'Title 2' },
      { type: 'rect', x: 240, y: 430, w: 600, h: 2, color: '#6366f140', label: 'Divider' },
      { type: 'text', text: '01  Define your target audience\n02  Create consistent visuals\n03  Engage with your community\n04  Track your analytics\n05  Stay authentic always', x: 540, y: 650, w: 600, font: 'Inter', size: 26, weight: '500', color: '#cbd5e1', align: 'left', label: 'Tips List' },
    ]
  }},

  // ── STORIES ──
  { id: 't-story-1', name: 'Story CTA', cat: 'story', icon: 'smartphone', layout: {
    background: '#0f172a', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 1920, color: '#1e1b4b', label: 'BG' },
      { type: 'text', text: 'NEW DROP', x: 540, y: 400, w: 800, font: 'Bebas Neue', size: 140, weight: '700', color: '#ffffff', align: 'center', label: 'Headline' },
      { type: 'rect', x: 340, y: 520, w: 400, h: 4, color: '#f59e0b', label: 'Accent' },
      { type: 'text', text: 'Limited Edition Collection\nAvailable Now', x: 540, y: 700, w: 700, font: 'Inter', size: 32, weight: '400', color: '#94a3b8', align: 'center', label: 'Body' },
      { type: 'rect', x: 290, y: 1400, w: 500, h: 70, color: '#f59e0b', radius: 35, label: 'CTA BG' },
      { type: 'text', text: 'SHOP NOW', x: 540, y: 1435, w: 400, font: 'Inter', size: 24, weight: '800', color: '#0f172a', align: 'center', label: 'CTA' },
      { type: 'text', text: 'SWIPE UP ↑', x: 540, y: 1700, w: 400, font: 'Inter', size: 18, weight: '600', color: '#64748b', align: 'center', label: 'Swipe' },
    ]
  }},
  { id: 't-story-2', name: 'Story Poll', cat: 'story', icon: 'bar_chart', layout: {
    background: '#0a0a0a', elements: [
      { type: 'text', text: 'WHICH ONE?', x: 540, y: 300, w: 800, font: 'Outfit', size: 80, weight: '900', color: '#ffffff', align: 'center', label: 'Question' },
      { type: 'rect', x: 100, y: 550, w: 880, h: 250, color: '#1e293b', radius: 20, label: 'Option A BG' },
      { type: 'text', text: 'OPTION A', x: 540, y: 675, w: 700, font: 'Bebas Neue', size: 64, weight: '700', color: '#22d3ee', align: 'center', label: 'Option A' },
      { type: 'rect', x: 100, y: 880, w: 880, h: 250, color: '#1e293b', radius: 20, label: 'Option B BG' },
      { type: 'text', text: 'OPTION B', x: 540, y: 1005, w: 700, font: 'Bebas Neue', size: 64, weight: '700', color: '#f472b6', align: 'center', label: 'Option B' },
      { type: 'text', text: 'TAP TO VOTE', x: 540, y: 1400, w: 400, font: 'Inter', size: 20, weight: '600', color: '#475569', align: 'center', label: 'Instruction' },
    ]
  }},

  // ── AD BANNERS ──
  { id: 't-ad-1', name: 'Product Launch', cat: 'ad', icon: 'rocket_launch', layout: {
    background: '#000000', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 1080, color: '#0f172a', label: 'BG' },
      { type: 'text', text: 'INTRODUCING', x: 540, y: 200, w: 800, font: 'Inter', size: 28, weight: '600', color: '#6366f1', align: 'center', tracking: 8, label: 'Subtitle' },
      { type: 'text', text: 'THE FUTURE\nIS HERE', x: 540, y: 420, w: 800, font: 'Bebas Neue', size: 110, weight: '700', color: '#ffffff', align: 'center', label: 'Headline' },
      { type: 'rect', x: 300, y: 650, w: 480, h: 60, color: '#6366f1', radius: 30, label: 'CTA BG' },
      { type: 'text', text: 'PRE-ORDER NOW', x: 540, y: 680, w: 400, font: 'Inter', size: 20, weight: '800', color: '#ffffff', align: 'center', label: 'CTA' },
      { type: 'text', text: 'Starting at $29/mo', x: 540, y: 800, w: 400, font: 'Inter', size: 18, weight: '400', color: '#64748b', align: 'center', label: 'Price' },
    ]
  }},
  { id: 't-ad-2', name: 'Flash Sale Banner', cat: 'ad', icon: 'bolt', layout: {
    background: '#dc2626', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 1080, color: '#dc2626', label: 'BG' },
      { type: 'text', text: 'FLASH', x: 540, y: 250, w: 900, font: 'Bebas Neue', size: 180, weight: '700', color: '#ffffff', align: 'center', label: 'Flash' },
      { type: 'text', text: 'SALE', x: 540, y: 420, w: 900, font: 'Bebas Neue', size: 180, weight: '700', color: '#fef08a', align: 'center', label: 'Sale' },
      { type: 'text', text: 'UP TO', x: 540, y: 580, w: 400, font: 'Inter', size: 28, weight: '600', color: '#fecaca', align: 'center', label: 'Up To' },
      { type: 'text', text: '70% OFF', x: 540, y: 700, w: 600, font: 'Bebas Neue', size: 120, weight: '700', color: '#ffffff', align: 'center', label: 'Discount' },
      { type: 'text', text: 'LIMITED TIME ONLY • ENDS TONIGHT', x: 540, y: 900, w: 700, font: 'Inter', size: 18, weight: '700', color: '#fecaca', align: 'center', tracking: 4, label: 'Urgency' },
    ]
  }},

  // ── SALE ──
  { id: 't-sale-1', name: 'Mega Sale', cat: 'sale', icon: 'sell', layout: {
    background: '#0f172a', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 400, color: '#f59e0b', label: 'Top Bar' },
      { type: 'text', text: 'MEGA SALE', x: 540, y: 200, w: 800, font: 'Bebas Neue', size: 120, weight: '700', color: '#0f172a', align: 'center', label: 'Title' },
      { type: 'text', text: '50% OFF', x: 540, y: 550, w: 600, font: 'Outfit', size: 100, weight: '900', color: '#f59e0b', align: 'center', label: 'Discount' },
      { type: 'text', text: 'EVERYTHING', x: 540, y: 680, w: 600, font: 'Outfit', size: 60, weight: '700', color: '#ffffff', align: 'center', label: 'Subtitle' },
      { type: 'text', text: 'Use code MEGA50 at checkout', x: 540, y: 820, w: 600, font: 'Inter', size: 22, weight: '400', color: '#94a3b8', align: 'center', label: 'Code' },
      { type: 'rect', x: 340, y: 900, w: 400, h: 60, color: '#f59e0b', radius: 8, label: 'CTA BG' },
      { type: 'text', text: 'SHOP NOW', x: 540, y: 930, w: 300, font: 'Inter', size: 22, weight: '800', color: '#0f172a', align: 'center', label: 'CTA' },
    ]
  }},
  { id: 't-sale-2', name: 'Weekend Special', cat: 'sale', icon: 'celebration', layout: {
    background: '#4c1d95', elements: [
      { type: 'text', text: 'WEEKEND', x: 540, y: 300, w: 800, font: 'Bebas Neue', size: 100, weight: '700', color: '#e9d5ff', align: 'center', label: 'Weekend' },
      { type: 'text', text: 'SPECIAL', x: 540, y: 420, w: 800, font: 'Bebas Neue', size: 100, weight: '700', color: '#ffffff', align: 'center', label: 'Special' },
      { type: 'rect', x: 290, y: 520, w: 500, h: 120, color: '#f59e0b', radius: 12, label: 'Badge BG' },
      { type: 'text', text: 'BUY 1 GET 1 FREE', x: 540, y: 580, w: 450, font: 'Outfit', size: 36, weight: '800', color: '#0f172a', align: 'center', label: 'Offer' },
      { type: 'text', text: 'Valid this Saturday & Sunday only', x: 540, y: 750, w: 600, font: 'Inter', size: 22, weight: '400', color: '#c4b5fd', align: 'center', label: 'Validity' },
    ]
  }},

  // ── FLYERS ──
  { id: 't-flyer-1', name: 'Modern Flyer', cat: 'flyer', icon: 'description', layout: {
    background: '#ffffff', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 200, color: '#0f172a', label: 'Header' },
      { type: 'text', text: 'YOUR BRAND', x: 540, y: 100, w: 800, font: 'Bebas Neue', size: 48, weight: '700', color: '#ffffff', align: 'center', label: 'Brand' },
      { type: 'text', text: 'Professional\nServices', x: 540, y: 450, w: 700, font: 'Playfair Display', size: 72, weight: '700', color: '#0f172a', align: 'center', label: 'Title' },
      { type: 'rect', x: 440, y: 600, w: 200, h: 4, color: '#6366f1', label: 'Divider' },
      { type: 'text', text: 'We offer world-class solutions tailored to your needs. Our team of experts is ready to help you achieve your goals.', x: 540, y: 750, w: 650, font: 'Inter', size: 22, weight: '400', color: '#475569', align: 'center', label: 'Body' },
      { type: 'rect', x: 0, y: 980, w: 1080, h: 100, color: '#0f172a', label: 'Footer' },
      { type: 'text', text: 'www.yourbrand.com  •  hello@yourbrand.com  •  +1 (555) 123-4567', x: 540, y: 1030, w: 900, font: 'Inter', size: 16, weight: '400', color: '#94a3b8', align: 'center', label: 'Contact' },
    ]
  }},

  // ── EVENTS ──
  { id: 't-event-1', name: 'Conference', cat: 'event', icon: 'mic', layout: {
    background: '#0f172a', elements: [
      { type: 'text', text: 'ANNUAL', x: 540, y: 200, w: 800, font: 'Inter', size: 32, weight: '300', color: '#6366f1', align: 'center', tracking: 12, label: 'Subtitle' },
      { type: 'text', text: 'DESIGN\nSUMMIT', x: 540, y: 420, w: 800, font: 'Bebas Neue', size: 130, weight: '700', color: '#ffffff', align: 'center', label: 'Title' },
      { type: 'text', text: '2026', x: 540, y: 600, w: 300, font: 'Outfit', size: 64, weight: '200', color: '#818cf8', align: 'center', label: 'Year' },
      { type: 'rect', x: 290, y: 700, w: 500, h: 2, color: '#334155', label: 'Divider' },
      { type: 'text', text: 'MARCH 25-27  •  MUMBAI, INDIA', x: 540, y: 780, w: 700, font: 'Inter', size: 22, weight: '600', color: '#94a3b8', align: 'center', label: 'Details' },
      { type: 'rect', x: 340, y: 880, w: 400, h: 56, color: '#6366f1', radius: 28, label: 'CTA BG' },
      { type: 'text', text: 'REGISTER NOW', x: 540, y: 908, w: 350, font: 'Inter', size: 18, weight: '700', color: '#ffffff', align: 'center', label: 'CTA' },
    ]
  }},
  { id: 't-event-2', name: 'Party Invite', cat: 'event', icon: 'party_mode', layout: {
    background: '#0a0a0a', elements: [
      { type: 'text', text: "YOU'RE INVITED", x: 540, y: 200, w: 800, font: 'Inter', size: 24, weight: '600', color: '#f59e0b', align: 'center', tracking: 10, label: 'Invite' },
      { type: 'text', text: 'LAUNCH\nPARTY', x: 540, y: 450, w: 800, font: 'Bebas Neue', size: 140, weight: '700', color: '#ffffff', align: 'center', label: 'Title' },
      { type: 'text', text: 'FRI, APR 10  •  8 PM\nThe Grand Ballroom, Downtown', x: 540, y: 700, w: 600, font: 'Inter', size: 24, weight: '400', color: '#94a3b8', align: 'center', label: 'Details' },
      { type: 'text', text: 'RSVP BY APRIL 5', x: 540, y: 900, w: 400, font: 'Inter', size: 18, weight: '700', color: '#f59e0b', align: 'center', label: 'RSVP' },
    ]
  }},

  // ── BUSINESS ──
  { id: 't-biz-1', name: 'Business Card', cat: 'business', icon: 'work', layout: {
    background: '#ffffff', elements: [
      { type: 'rect', x: 0, y: 0, w: 1080, h: 1080, color: '#fafafa', label: 'BG' },
      { type: 'rect', x: 0, y: 0, w: 8, h: 1080, color: '#6366f1', label: 'Accent' },
      { type: 'text', text: 'JOHN DOE', x: 200, y: 350, w: 700, font: 'Bebas Neue', size: 64, weight: '700', color: '#0f172a', align: 'left', label: 'Name' },
      { type: 'text', text: 'Creative Director', x: 200, y: 440, w: 700, font: 'Inter', size: 24, weight: '400', color: '#6366f1', align: 'left', label: 'Title' },
      { type: 'rect', x: 200, y: 510, w: 80, h: 3, color: '#e2e8f0', label: 'Divider' },
      { type: 'text', text: '+1 (555) 123-4567\njohn@company.com\nwww.company.com', x: 200, y: 600, w: 600, font: 'Inter', size: 20, weight: '400', color: '#64748b', align: 'left', label: 'Contact' },
    ]
  }},
  { id: 't-biz-2', name: 'Testimonial', cat: 'business', icon: 'star', layout: {
    background: '#0f172a', elements: [
      { type: 'text', text: '⭐⭐⭐⭐⭐', x: 540, y: 250, w: 400, font: 'Inter', size: 36, weight: '400', color: '#f59e0b', align: 'center', label: 'Stars' },
      { type: 'text', text: '"This product completely transformed our workflow. The results exceeded our expectations."', x: 540, y: 480, w: 700, font: 'Playfair Display', size: 36, weight: '500', color: '#ffffff', align: 'center', label: 'Quote' },
      { type: 'rect', x: 490, y: 650, w: 100, h: 3, color: '#6366f1', label: 'Divider' },
      { type: 'text', text: 'Sarah Johnson', x: 540, y: 720, w: 400, font: 'Inter', size: 22, weight: '700', color: '#ffffff', align: 'center', label: 'Name' },
      { type: 'text', text: 'CEO, TechStart Inc.', x: 540, y: 770, w: 400, font: 'Inter', size: 18, weight: '400', color: '#6366f1', align: 'center', label: 'Role' },
    ]
  }},

  // ── QUOTES ──
  { id: 't-quote-1', name: 'Motivational Dark', cat: 'quote', icon: 'auto_awesome', layout: {
    background: '#0a0a0a', elements: [
      { type: 'text', text: 'DREAM', x: 540, y: 300, w: 800, font: 'Bebas Neue', size: 140, weight: '700', color: '#ffffff', align: 'center', label: 'Word 1' },
      { type: 'text', text: 'BIGGER.', x: 540, y: 460, w: 800, font: 'Bebas Neue', size: 140, weight: '700', color: '#6366f1', align: 'center', label: 'Word 2' },
      { type: 'rect', x: 390, y: 580, w: 300, h: 3, color: '#334155', label: 'Line' },
      { type: 'text', text: 'Your only limit is your imagination.\nPush boundaries. Create impact.', x: 540, y: 700, w: 600, font: 'Inter', size: 24, weight: '300', color: '#64748b', align: 'center', label: 'Quote' },
    ]
  }},
  { id: 't-quote-2', name: 'Elegant Serif', cat: 'quote', icon: 'sparkles', layout: {
    background: '#fef3c7', elements: [
      { type: 'text', text: '"', x: 150, y: 250, w: 200, font: 'Playfair Display', size: 240, weight: '700', color: '#d97706', align: 'left', label: 'Mark' },
      { type: 'text', text: 'The best way to predict the future is to create it.', x: 540, y: 500, w: 700, font: 'Playfair Display', size: 48, weight: '600', color: '#78350f', align: 'center', label: 'Quote' },
      { type: 'text', text: '— Peter Drucker', x: 540, y: 700, w: 400, font: 'Inter', size: 20, weight: '500', color: '#92400e', align: 'center', label: 'Author' },
    ]
  }},
  { id: 't-quote-3', name: 'Bold Statement', cat: 'quote', icon: 'fitness_center', layout: {
    background: '#1e1b4b', elements: [
      { type: 'text', text: 'HUSTLE', x: 540, y: 250, w: 900, font: 'Outfit', size: 120, weight: '900', color: '#ffffff', align: 'center', label: 'Word' },
      { type: 'text', text: 'IN SILENCE.', x: 540, y: 400, w: 900, font: 'Outfit', size: 80, weight: '300', color: '#818cf8', align: 'center', label: 'Word 2' },
      { type: 'text', text: 'LET SUCCESS\nMAKE THE NOISE.', x: 540, y: 650, w: 800, font: 'Outfit', size: 80, weight: '900', color: '#ffffff', align: 'center', label: 'Word 3' },
    ]
  }},

  // ── MORE SOCIAL ──
  { id: 't-social-5', name: 'Did You Know', cat: 'social', icon: 'psychology', layout: {
    background: '#0f172a', elements: [
      { type: 'rect', x: 60, y: 60, w: 960, h: 960, color: '#1e293b', radius: 20, label: 'Card' },
      { type: 'text', text: 'DID YOU KNOW?', x: 540, y: 250, w: 700, font: 'Inter', size: 24, weight: '800', color: '#22d3ee', align: 'center', tracking: 6, label: 'Label' },
      { type: 'text', text: '73%', x: 540, y: 450, w: 400, font: 'Outfit', size: 140, weight: '900', color: '#ffffff', align: 'center', label: 'Stat' },
      { type: 'text', text: 'of consumers prefer brands that personalize their experience.', x: 540, y: 650, w: 600, font: 'Inter', size: 26, weight: '400', color: '#94a3b8', align: 'center', label: 'Fact' },
      { type: 'text', text: 'Source: Marketing Research 2026', x: 540, y: 850, w: 500, font: 'Inter', size: 14, weight: '400', color: '#475569', align: 'center', label: 'Source' },
    ]
  }},
  { id: 't-social-6', name: 'Before & After', cat: 'social', icon: 'compare_arrows', layout: {
    background: '#0f172a', elements: [
      { type: 'rect', x: 0, y: 0, w: 540, h: 1080, color: '#1e293b', label: 'Left' },
      { type: 'rect', x: 540, y: 0, w: 540, h: 1080, color: '#0f172a', label: 'Right' },
      { type: 'text', text: 'BEFORE', x: 270, y: 150, w: 400, font: 'Bebas Neue', size: 48, weight: '700', color: '#ef4444', align: 'center', label: 'Before' },
      { type: 'text', text: 'AFTER', x: 810, y: 150, w: 400, font: 'Bebas Neue', size: 48, weight: '700', color: '#22c55e', align: 'center', label: 'After' },
      { type: 'text', text: 'Your "before" description goes here', x: 270, y: 540, w: 400, font: 'Inter', size: 22, weight: '400', color: '#94a3b8', align: 'center', label: 'Before Text' },
      { type: 'text', text: 'Your "after" description goes here', x: 810, y: 540, w: 400, font: 'Inter', size: 22, weight: '400', color: '#94a3b8', align: 'center', label: 'After Text' },
      { type: 'rect', x: 536, y: 100, w: 8, h: 880, color: '#ffffff20', label: 'Divider' },
    ]
  }},

  // ── MORE AD ──
  { id: 't-ad-3', name: 'App Download', cat: 'ad', icon: 'install_mobile', layout: {
    background: '#0f172a', elements: [
      { type: 'text', text: 'Download Our App', x: 540, y: 200, w: 700, font: 'Outfit', size: 56, weight: '700', color: '#ffffff', align: 'center', label: 'Title' },
      { type: 'text', text: 'The smartest way to manage your finances. Track spending, set goals, and save more.', x: 540, y: 400, w: 650, font: 'Inter', size: 24, weight: '400', color: '#94a3b8', align: 'center', label: 'Description' },
      { type: 'rect', x: 200, y: 600, w: 300, h: 60, color: '#0f172a', radius: 12, label: 'Apple BG', stroke: '#334155', strokeWidth: 2 },
      { type: 'text', text: '🍎 App Store', x: 350, y: 630, w: 250, font: 'Inter', size: 18, weight: '600', color: '#ffffff', align: 'center', label: 'Apple' },
      { type: 'rect', x: 580, y: 600, w: 300, h: 60, color: '#0f172a', radius: 12, label: 'Google BG', stroke: '#334155', strokeWidth: 2 },
      { type: 'text', text: '▶️ Google Play', x: 730, y: 630, w: 250, font: 'Inter', size: 18, weight: '600', color: '#ffffff', align: 'center', label: 'Google' },
      { type: 'text', text: '★★★★★  4.9 Rating  •  1M+ Downloads', x: 540, y: 800, w: 600, font: 'Inter', size: 18, weight: '500', color: '#f59e0b', align: 'center', label: 'Rating' },
    ]
  }},

  // ── MORE STORIES ──
  { id: 't-story-3', name: 'AMA Story', cat: 'story', icon: 'help', layout: {
    background: '#1e1b4b', elements: [
      { type: 'text', text: 'ASK ME\nANYTHING', x: 540, y: 500, w: 800, font: 'Bebas Neue', size: 140, weight: '700', color: '#ffffff', align: 'center', label: 'Title' },
      { type: 'rect', x: 240, y: 800, w: 600, h: 200, color: '#ffffff10', radius: 20, label: 'Input BG' },
      { type: 'text', text: 'Type your question here...', x: 540, y: 900, w: 500, font: 'Inter', size: 22, weight: '400', color: '#64748b', align: 'center', label: 'Placeholder' },
      { type: 'text', text: '📩', x: 540, y: 1200, w: 100, font: 'Inter', size: 48, weight: '400', color: '#ffffff', align: 'center', label: 'Emoji' },
    ]
  }},

  // ── MORE FLYERS ──
  { id: 't-flyer-2', name: 'Restaurant Menu', cat: 'flyer', icon: 'restaurant', layout: {
    background: '#1a1a1a', elements: [
      { type: 'text', text: 'MENU', x: 540, y: 150, w: 600, font: 'Playfair Display', size: 72, weight: '700', color: '#f59e0b', align: 'center', label: 'Title' },
      { type: 'rect', x: 440, y: 220, w: 200, h: 2, color: '#f59e0b40', label: 'Line' },
      { type: 'text', text: 'STARTERS', x: 540, y: 320, w: 600, font: 'Inter', size: 18, weight: '700', color: '#f59e0b', align: 'center', tracking: 6, label: 'Section' },
      { type: 'text', text: 'Bruschetta  . . . . . . . . . . ₹350\nCaponata  . . . . . . . . . . .  ₹420\nArancini  . . . . . . . . . . . .  ₹380', x: 540, y: 480, w: 700, font: 'Inter', size: 22, weight: '400', color: '#d4d4d4', align: 'center', label: 'Items' },
      { type: 'text', text: 'MAINS', x: 540, y: 650, w: 600, font: 'Inter', size: 18, weight: '700', color: '#f59e0b', align: 'center', tracking: 6, label: 'Section 2' },
      { type: 'text', text: 'Margherita Pizza . . . . . . ₹550\nPasta Carbonara . . . . . . ₹620\nRisotto  . . . . . . . . . . . . . ₹680', x: 540, y: 810, w: 700, font: 'Inter', size: 22, weight: '400', color: '#d4d4d4', align: 'center', label: 'Items 2' },
    ]
  }},

  // ── MORE BUSINESS ──
  { id: 't-biz-3', name: 'Thank You Card', cat: 'business', icon: 'volunteer_activism', layout: {
    background: '#fdf2f8', elements: [
      { type: 'text', text: 'Thank You', x: 540, y: 400, w: 800, font: 'Playfair Display', size: 80, weight: '700', color: '#831843', align: 'center', label: 'Title' },
      { type: 'text', text: 'for your purchase!', x: 540, y: 510, w: 600, font: 'Inter', size: 28, weight: '400', color: '#9d174d', align: 'center', label: 'Subtitle' },
      { type: 'rect', x: 440, y: 580, w: 200, h: 3, color: '#f472b6', label: 'Divider' },
      { type: 'text', text: 'We appreciate your support and hope you love your new product. Use code THANKS15 for 15% off your next order!', x: 540, y: 720, w: 650, font: 'Inter', size: 22, weight: '400', color: '#6b7280', align: 'center', label: 'Body' },
      { type: 'text', text: '❤️', x: 540, y: 900, w: 100, font: 'Inter', size: 48, weight: '400', color: '#ec4899', align: 'center', label: 'Heart' },
    ]
  }},
]

// ═══════════════════════════════════════════════════════════════
// Canvas Data — Presets, Filters, Colors, Shadows, Element Types
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

// ── Platform Size Presets (Updated 2025 Recommended Dimensions) ──
export const PRESETS = [
    // Instagram
    { id: 'ig-post',        label: 'IG Post',         icon: 'photo_camera',   w: 1080, h: 1350, ratio: '4:5 Portrait',  note: 'Best for feed reach' },
    { id: 'ig-post-square', label: 'IG Square',        icon: 'crop_square',    w: 1080, h: 1080, ratio: '1:1',           note: 'Classic square format' },
    { id: 'ig-story',       label: 'IG Story',         icon: 'smartphone',     w: 1080, h: 1920, ratio: '9:16',          note: 'Full-screen story' },
    { id: 'ig-reel',        label: 'IG Reel',          icon: 'movie',          w: 1080, h: 1920, ratio: '9:16',          note: 'Same as Story size' },
    // Facebook
    { id: 'fb-post',        label: 'FB Post',          icon: 'thumb_up',       w: 1200, h: 630,  ratio: '1.91:1',        note: 'Feed post & link preview' },
    { id: 'fb-story',       label: 'FB Story',         icon: 'amp_stories',    w: 1080, h: 1920, ratio: '9:16',          note: 'Full-screen story' },
    // LinkedIn
    { id: 'linkedin',       label: 'LinkedIn',         icon: 'work',           w: 1200, h: 628,  ratio: '1.91:1',        note: 'Feed post' },
    // YouTube
    { id: 'yt-thumb',       label: 'YT Thumb',         icon: 'smart_display',  w: 1280, h: 720,  ratio: '16:9',          note: 'YouTube thumbnail' },
    // Twitter / X
    { id: 'twitter',        label: 'X / Twitter',      icon: 'tag',            w: 1600, h: 900,  ratio: '16:9',          note: 'Tweet image card' },
    // WhatsApp
    { id: 'whatsapp-status',label: 'WA Status',        icon: 'chat',           w: 1080, h: 1920, ratio: '9:16',          note: 'WhatsApp Status/DM' },
    // Carousel
    { id: 'carousel',       label: 'Carousel',         icon: 'view_carousel',  w: 1080, h: 1080, ratio: '1:1',           note: 'Multi-slide carousel' },
    // Pinterest
    { id: 'pinterest',      label: 'Pinterest',        icon: 'push_pin',       w: 1000, h: 1500, ratio: '2:3',           note: 'Pin (tall format)' },
    // Banners
    { id: 'banner',         label: 'Web Banner',       icon: 'web',            w: 1920, h: 600,  ratio: '~3.2:1',        note: 'Hero / leaderboard' },
    { id: 'banner-square',  label: 'Display Ad',       icon: 'ad_units',       w: 1200, h: 1200, ratio: '1:1',           note: 'Google Display Network' },
]


// ── Filters ──
export const FILTERS = [
    { id: 'none', label: 'None' },
    { id: 'grayscale', label: 'B&W' },
    { id: 'sepia', label: 'Sepia' },
    { id: 'brightness', label: 'Bright' },
    { id: 'contrast', label: 'Contrast' },
    { id: 'vintage', label: 'Vintage' },
    { id: 'warm', label: 'Warm' },
    { id: 'cool', label: 'Cool' },
    { id: 'blur', label: 'Blur' },
]

// ── Expanded Color Palette ──
export const COLOR_PALETTE = [
    '#ef4444','#dc2626','#b91c1c','#991b1b',
    '#f97316','#ea580c','#c2410c','#9a3412',
    '#f59e0b','#d97706','#b45309','#fbbf24',
    '#22c55e','#16a34a','#15803d','#166534',
    '#14b8a6','#0d9488','#0f766e','#115e59',
    '#FF4D00','#2563eb','#CC3D00','#1e40af',
    '#6366f1','#4f46e5','#4338ca','#3730a3',
    '#FF4D00','#9333ea','#7c3aed','#6d28d9',
    '#ec4899','#db2777','#be185d','#9d174d',
    '#ffffff','#f1f5f9','#94a3b8','#475569',
    '#1e293b','#0f172a','#000000','transparent',
]

// ── Shadow Presets ──
export const SHADOW_PRESETS = [
    { label: 'None', color: 'rgba(0,0,0,0)', blur: 0, offsetX: 0, offsetY: 0 },
    { label: 'Subtle', color: 'rgba(0,0,0,0.15)', blur: 8, offsetX: 0, offsetY: 2 },
    { label: 'Medium', color: 'rgba(0,0,0,0.25)', blur: 16, offsetX: 0, offsetY: 4 },
    { label: 'Dramatic', color: 'rgba(0,0,0,0.4)', blur: 32, offsetX: 0, offsetY: 8 },
    { label: 'Glow', color: 'rgba(99,102,241,0.5)', blur: 24, offsetX: 0, offsetY: 0 },
    { label: 'Neon', color: 'rgba(236,72,153,0.6)', blur: 20, offsetX: 0, offsetY: 0 },
    { label: 'Hard', color: 'rgba(0,0,0,0.5)', blur: 0, offsetX: 4, offsetY: 4 },
    { label: 'Float', color: 'rgba(0,0,0,0.2)', blur: 40, offsetX: 0, offsetY: 16 },
]

// ── Gradient Presets ──
export const GRADIENT_PRESETS = [
    { name: 'Sunset Blaze', colors: ['#f12711', '#f5af19'], angle: 45 },
    { name: 'Ocean Deep', colors: ['#2E3192', '#1BFFFF'], angle: 135 },
    { name: 'Purple Rain', colors: ['#7F00FF', '#E100FF'], angle: 90 },
    { name: 'Emerald', colors: ['#348F50', '#56B4D3'], angle: 120 },
    { name: 'Flamingo', colors: ['#f953c6', '#b91d73'], angle: 45 },
    { name: 'Midnight', colors: ['#232526', '#414345'], angle: 180 },
    { name: 'Warm Dusk', colors: ['#ff6e7f', '#bfe9ff'], angle: 90 },
    { name: 'Aqua Marine', colors: ['#1A2980', '#26D0CE'], angle: 135 },
    { name: 'Neon Glow', colors: ['#00f260', '#0575e6'], angle: 45 },
    { name: 'Peach', colors: ['#ffecd2', '#fcb69f'], angle: 90 },
    { name: 'Rose Gold', colors: ['#F4C4F3', '#FC67FA'], angle: 135 },
    { name: 'Slate', colors: ['#2c3e50', '#4ca1af'], angle: 180 },
    { name: 'Citrus', colors: ['#FDC830', '#F37335'], angle: 45 },
    { name: 'Berry', colors: ['#8E2DE2', '#4A00E0'], angle: 90 },
    { name: 'Arctic', colors: ['#E0EAFC', '#CFDEF3'], angle: 135 },
    { name: 'Lava', colors: ['#f12711', '#f5af19'], angle: 0 },
]

// ── Texture Preset Queries ──
export const TEXTURE_PRESETS = [
    'grunge texture', 'paper texture', 'watercolor overlay', 'gold foil',
    'marble texture', 'bokeh overlay', 'dust particles', 'light leak',
    'film grain', 'smoke overlay', 'glitter texture', 'wood texture',
]

// ── Element Categories (Canva-style) ──
export const ELEMENT_CATEGORIES = {
    text: { label: 'Text', icon: 'text_fields', items: [
        { id: 'text', icon: 'text_fields', label: 'Body Text' },
        { id: 'heading', icon: 'title', label: 'Heading' },
        { id: 'subheading', icon: 'format_size', label: 'Subheading' },
    ]},
    shapes: { label: 'Shapes', icon: 'shapes', items: [
        { id: 'shape-rect', icon: 'rectangle', label: 'Rectangle' },
        { id: 'shape-rounded-rect', icon: 'rounded_corner', label: 'Rounded Rect' },
        { id: 'shape-circle', icon: 'circle', label: 'Circle' },
        { id: 'shape-oval', icon: 'lens', label: 'Oval' },
        { id: 'shape-triangle', icon: 'change_history', label: 'Triangle' },
        { id: 'shape-diamond', icon: 'diamond', label: 'Diamond' },
        { id: 'shape-pentagon', icon: 'pentagon', label: 'Pentagon' },
        { id: 'shape-hexagon', icon: 'hexagon', label: 'Hexagon' },
        { id: 'shape-star5', icon: 'star', label: 'Star 5pt' },
        { id: 'shape-star6', icon: 'star_half', label: 'Star 6pt' },
        { id: 'shape-heart', icon: 'favorite', label: 'Heart' },
        { id: 'shape-cross', icon: 'add', label: 'Cross' },
        { id: 'shape-arrow-right', icon: 'arrow_right_alt', label: 'Arrow →' },
        { id: 'shape-arrow-up', icon: 'arrow_upward', label: 'Arrow ↑' },
        { id: 'shape-badge', icon: 'verified', label: 'Badge' },
    ]},
    lines: { label: 'Lines', icon: 'horizontal_rule', items: [
        { id: 'shape-line', icon: 'horizontal_rule', label: 'Solid Line' },
        { id: 'shape-dashed', icon: 'more_horiz', label: 'Dashed Line' },
        { id: 'shape-dotted', icon: 'pending', label: 'Dotted Line' },
        { id: 'shape-arrow-line', icon: 'trending_flat', label: 'Arrow Line' },
        { id: 'shape-double-arrow', icon: 'swap_horiz', label: 'Double Arrow' },
    ]},
    decorative: { label: 'Decorative', icon: 'auto_awesome', items: [
        { id: 'shape-blob', icon: 'blur_on', label: 'Blob' },
        { id: 'shape-wave', icon: 'waves', label: 'Wave' },
        { id: 'shape-ring', icon: 'radio_button_unchecked', label: 'Ring' },
        { id: 'shape-half-circle', icon: 'contrast', label: 'Half Circle' },
    ]},
    quick: { label: 'Quick Add', icon: 'bolt', items: [
        { id: 'logo', icon: 'add_photo_alternate', label: 'Brand Logo' },
        { id: 'image', icon: 'image', label: 'Upload Image' },
        { id: 'ai-element', icon: 'auto_awesome', label: 'AI Element' },
    ]},
}

export const ELEMENT_TYPES = Object.values(ELEMENT_CATEGORIES).flatMap(c => c.items)

// ── Sticker Categories & Data ──
export const STICKER_CATEGORIES = {
    all: 'All',
    social: 'Social',
    business: 'Business',
    arrows: 'Arrows',
    weather: 'Weather',
    tech: 'Tech',
    nature: 'Nature',
    shapes: 'Shapes',
    emoji: 'Emoji',
}

export const STICKER_DATA = {
    social: ['heart', 'thumbs-up', 'message-circle', 'share-2', 'star', 'bookmark', 'bell', 'user', 'users', 'at-sign', 'hash', 'send', 'link', 'globe', 'instagram', 'twitter', 'youtube', 'facebook'],
    business: ['briefcase', 'trending-up', 'bar-chart-2', 'pie-chart', 'dollar-sign', 'credit-card', 'shopping-cart', 'shopping-bag', 'package', 'truck', 'award', 'target', 'flag', 'calendar', 'clock', 'check-circle'],
    arrows: ['arrow-up', 'arrow-down', 'arrow-left', 'arrow-right', 'chevron-up', 'chevron-down', 'chevrons-up', 'chevrons-down', 'corner-up-right', 'external-link', 'move', 'maximize-2', 'minimize-2', 'rotate-cw'],
    weather: ['sun', 'moon', 'cloud', 'cloud-rain', 'cloud-snow', 'cloud-lightning', 'wind', 'droplets', 'thermometer', 'umbrella', 'rainbow', 'snowflake'],
    tech: ['smartphone', 'monitor', 'laptop', 'tablet', 'cpu', 'hard-drive', 'wifi', 'bluetooth', 'battery', 'code', 'terminal', 'database', 'server', 'cloud', 'download', 'upload'],
    nature: ['leaf', 'flower-2', 'tree-pine', 'mountain', 'waves', 'flame', 'zap', 'sparkles', 'gem', 'feather', 'bird', 'fish', 'bug', 'paw-print'],
    shapes: ['circle', 'square', 'triangle', 'hexagon', 'octagon', 'pentagon', 'diamond', 'star', 'heart', 'shield'],
    emoji: ['smile', 'laugh', 'frown', 'meh', 'angry', 'party-popper', 'rocket', 'fire', 'crown', 'gift', 'music', 'camera', 'headphones', 'coffee', 'pizza', 'ice-cream-cone'],
}

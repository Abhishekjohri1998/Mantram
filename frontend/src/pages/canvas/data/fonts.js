// ═══════════════════════════════════════════════════════════════
// Canvas Data — Google Fonts catalog organized by category
// Extracted from monolithic CanvasEditor.jsx
// ═══════════════════════════════════════════════════════════════

export const FONT_CATEGORIES = {
    all: 'All',
    'sans-serif': 'Sans Serif',
    serif: 'Serif',
    display: 'Display',
    handwriting: 'Handwriting',
    monospace: 'Monospace',
    indian: '🌐 Indian',
}

export const GOOGLE_FONTS_BY_CATEGORY = {
    'sans-serif': [
        'Inter', 'Poppins', 'Roboto', 'Open Sans', 'Montserrat', 'Lato', 'Nunito', 'Rubik',
        'Work Sans', 'Quicksand', 'Fira Sans', 'Mulish', 'DM Sans', 'Outfit', 'Space Grotesk',
        'Sora', 'Manrope', 'Plus Jakarta Sans', 'Lexend', 'Josefin Sans', 'Karla', 'Jost',
        'Urbanist', 'Bricolage Grotesque', 'Albert Sans', 'Figtree', 'Geist', 'Instrument Sans',
        'Onest', 'Red Hat Display', 'Wix Madefor Display', 'Commissioner', 'Sofia Sans',
        'Readex Pro', 'Hanken Grotesk', 'General Sans', 'Switzer', 'Cabinet Grotesk',
        'Satoshi', 'Clash Display', 'Synonym', 'Gilroy', 'Cerebri Sans',
        'Barlow', 'Barlow Condensed', 'Exo 2', 'Kanit', 'Titillium Web', 'Signika',
        'Noto Sans', 'Source Sans 3', 'PT Sans', 'Catamaran', 'Asap', 'Overpass',
        'Nunito Sans', 'Hind Siliguri', 'Cabin', 'Arimo', 'Oxygen', 'Dosis',
    ],
    serif: [
        'Playfair Display', 'Merriweather', 'Libre Baskerville', 'Crimson Text',
        'Cormorant Garamond', 'EB Garamond', 'Lora', 'Bitter', 'Spectral', 'Newsreader',
        'Source Serif 4', 'Noto Serif', 'PT Serif', 'Cardo', 'Old Standard TT',
        'Cormorant', 'Vollkorn', 'Alegreya', 'Gentium Book Plus', 'Literata',
        'DM Serif Display', 'DM Serif Text', 'IBM Plex Serif', 'Zilla Slab',
        'Libre Caslon Text', 'Sorts Mill Goudy', 'Bodoni Moda', 'Baskervville',
    ],
    display: [
        'Bebas Neue', 'Anton', 'Righteous', 'Titan One', 'Archivo Black', 'Fjalla One',
        'Abril Fatface', 'Fredoka One', 'Lobster', 'Bungee', 'Bungee Shade',
        'Monoton', 'Rubik Mono One', 'Racing Sans One', 'Audiowide', 'Orbitron',
        'Russo One', 'Black Ops One', 'Modak', 'Lilita One', 'Chango',
        'Shrikhand', 'Bungee Inline', 'Faster One', 'Nabla', 'Silkscreen',
        'Press Start 2P', 'Honk', 'Syne', 'Climate Crisis', 'Bagel Fat One',
        'Young Serif', 'Edu NSW ACT Foundation', 'Londrina Solid',
    ],
    handwriting: [
        'Pacifico', 'Dancing Script', 'Caveat', 'Sacramento', 'Great Vibes',
        'Satisfy', 'Permanent Marker', 'Kalam', 'Patrick Hand', 'Indie Flower',
        'Shadows Into Light', 'Amatic SC', 'Covered By Your Grace', 'Rock Salt',
        'Gloria Hallelujah', 'Homemade Apple', 'Reenie Beanie', 'Gochi Hand',
        'Architects Daughter', 'Coming Soon', 'Handlee', 'Pangolin', 'Mali',
        'Sriracha', 'Kaushan Script', 'Alex Brush', 'Allura', 'Rochester',
    ],
    monospace: [
        'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'IBM Plex Mono',
        'Roboto Mono', 'Inconsolata', 'Space Mono', 'Ubuntu Mono', 'Courier Prime',
        'Red Hat Mono', 'DM Mono', 'Martian Mono', 'Azeret Mono',
    ],
    indian: [
        'Noto Sans Devanagari', 'Noto Sans Tamil', 'Noto Sans Telugu', 'Noto Sans Bengali',
        'Noto Sans Kannada', 'Noto Sans Malayalam', 'Noto Sans Gujarati', 'Noto Sans Gurmukhi',
        'Noto Sans Oriya', 'Hind', 'Hind Siliguri', 'Hind Vadodara', 'Hind Guntur',
        'Tiro Devanagari Hindi', 'Tiro Tamil', 'Tiro Telugu', 'Tiro Bangla',
        'Noto Serif Devanagari', 'Noto Serif Bengali', 'Noto Serif Tamil',
        'Mukta', 'Mukta Vaani', 'Mukta Mahee', 'Baloo 2', 'Baloo Bhai 2',
        'Baloo Thambi 2', 'Baloo Da 2', 'Baloo Chettan 2',
    ],
}

export const GOOGLE_FONTS = Object.values(GOOGLE_FONTS_BY_CATEGORY).flat()

// ── Text Style Categories ──
export const TEXT_STYLE_CATS = {
    all: 'All',
    heading: 'Headings',
    body: 'Body',
    display: 'Display',
    script: 'Script',
    mono: 'Mono',
    indian: 'Indian',
}

// ── Text Style Presets (for quick-add) ──
export const TEXT_STYLE_PRESETS = [
    { id: 'hero', cat: 'heading', label: 'Hero Title', font: 'Bebas Neue', size: 72, weight: '700', color: '#ffffff', tracking: 4, sample: 'HERO TITLE' },
    { id: 'elegant', cat: 'heading', label: 'Elegant', font: 'Playfair Display', size: 48, weight: '700', color: '#f1f5f9', italic: true, sample: 'Elegant Style' },
    { id: 'modern', cat: 'heading', label: 'Modern', font: 'Space Grotesk', size: 40, weight: '600', color: '#e2e8f0', sample: 'Modern Clean' },
    { id: 'bold', cat: 'display', label: 'Bold Statement', font: 'Anton', size: 56, weight: '400', color: '#f97316', tracking: 2, sample: 'BOLD STATEMENT' },
    { id: 'handwritten', cat: 'script', label: 'Handwritten', font: 'Caveat', size: 48, weight: '700', color: '#a78bfa', sample: 'Handwritten Feel' },
    { id: 'minimal', cat: 'body', label: 'Minimal', font: 'DM Sans', size: 32, weight: '300', color: '#94a3b8', sample: 'Minimal & Clean' },
    { id: 'retro', cat: 'display', label: 'Retro', font: 'Monoton', size: 48, weight: '400', color: '#f472b6', sample: 'RETRO VIBE' },
    { id: 'tech', cat: 'mono', label: 'Tech', font: 'JetBrains Mono', size: 28, weight: '500', color: '#22d3ee', sample: 'const tech = true;' },
    { id: 'luxury', cat: 'heading', label: 'Luxury', font: 'Cormorant Garamond', size: 44, weight: '600', color: '#fbbf24', tracking: 6, sample: 'LUXURY BRAND' },
    { id: 'playful', cat: 'display', label: 'Playful', font: 'Fredoka One', size: 42, weight: '400', color: '#34d399', sample: 'Playful & Fun' },
    { id: 'hindi', cat: 'indian', label: 'Hindi', font: 'Noto Sans Devanagari', size: 40, weight: '600', color: '#f1f5f9', sample: 'हिंदी टेक्स्ट' },
    { id: 'tamil', cat: 'indian', label: 'Tamil', font: 'Noto Sans Tamil', size: 40, weight: '600', color: '#f1f5f9', sample: 'தமிழ் உரை' },
    { id: 'body-inter', cat: 'body', label: 'Body — Inter', font: 'Inter', size: 18, weight: '400', color: '#e2e8f0', sample: 'Clean body text for long-form content' },
    { id: 'body-poppins', cat: 'body', label: 'Body — Poppins', font: 'Poppins', size: 18, weight: '400', color: '#e2e8f0', sample: 'Friendly body text for marketing' },
    { id: 'script-allura', cat: 'script', label: 'Script — Allura', font: 'Allura', size: 44, weight: '400', color: '#f472b6', sample: 'Flowing Script Style' },
]

// ── Font Combo Presets (heading + body pairs) ──
export const FONT_COMBOS = [
    { id: 'c1', style: 'Classic', heading: 'Playfair Display', body: 'Lato', label: 'Classic Elegant', headColor: '#fbbf24', bodyColor: '#e2e8f0' },
    { id: 'c2', style: 'Bold', heading: 'Bebas Neue', body: 'Roboto', label: 'Bold Modern', headColor: '#ef4444', bodyColor: '#e2e8f0' },
    { id: 'c3', style: 'Clean', heading: 'Montserrat', body: 'Open Sans', label: 'Clean Professional', headColor: '#818cf8', bodyColor: '#e2e8f0' },
    { id: 'c4', style: 'Tech', heading: 'Space Grotesk', body: 'DM Sans', label: 'Tech Startup', headColor: '#22d3ee', bodyColor: '#e2e8f0' },
    { id: 'c5', style: 'Impact', heading: 'Anton', body: 'Work Sans', label: 'Impact Statement', headColor: '#f97316', bodyColor: '#e2e8f0' },
    { id: 'c6', style: 'Luxury', heading: 'Cormorant Garamond', body: 'Mulish', label: 'Luxury Minimal', headColor: '#fbbf24', bodyColor: '#94a3b8' },
    { id: 'c7', style: 'Modern', heading: 'Sora', body: 'Inter', label: 'Contemporary', headColor: '#a78bfa', bodyColor: '#e2e8f0' },
    { id: 'c8', style: 'Friendly', heading: 'Outfit', body: 'Plus Jakarta Sans', label: 'Friendly SaaS', headColor: '#34d399', bodyColor: '#e2e8f0' },
]

// Helper: load a Google Font dynamically
const fontLoadedSet = new Set()
export function loadGoogleFont(fontName) {
    if (!fontName || fontLoadedSet.has(fontName)) return
    fontLoadedSet.add(fontName)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;600;700&display=swap`
    document.head.appendChild(link)
}

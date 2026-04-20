/**
 * Pulse Studio — Brand Color Engine
 *
 * Mathematically derives a full design token system (colors, fonts, radii, spacing)
 * from a single brand hex color and context string. Ensures WCAG contrast ratios.
 */

// ── COLOR MATH ────────────────────────────────────────────────────────

function hexToRgb(hex) {
    if (!hex || !hex.startsWith('#')) return { r: 255, g: 255, b: 255 };
    const pure = hex.replace('#', '');
    let r, g, b;
    if (pure.length === 3) {
        r = parseInt(pure[0] + pure[0], 16);
        g = parseInt(pure[1] + pure[1], 16);
        b = parseInt(pure[2] + pure[2], 16);
    } else {
        r = parseInt(pure.substring(0, 2), 16);
        g = parseInt(pure.substring(2, 4), 16);
        b = parseInt(pure.substring(4, 6), 16);
    }
    return { r, g, b };
}

function rgbToHex(r, g, b) {
    const toHex = (c) => {
        const hex = Math.round(c).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getLuminance({ r, g, b }) {
    const a = [r, g, b].map(function (v) {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(hex1, hex2) {
    const lum1 = getLuminance(hexToRgb(hex1));
    const lum2 = getLuminance(hexToRgb(hex2));
    const lightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (lightest + 0.05) / (darkest + 0.05);
}

function getSafeTextColor(backgroundHex) {
    // Check against white first, if WCAG AA compliant (>= 4.5), return white. Otherwise dark grey.
    if (getContrastRatio(backgroundHex, '#FFFFFF') >= 4.5) {
        return '#FFFFFF';
    }
    return '#0A0A0A';
}

function darken(hex, amount = 0.2) {
    const { r, g, b } = hexToRgb(hex);
    const factor = 1 - amount;
    return rgbToHex(
        Math.max(0, r * factor),
        Math.max(0, g * factor),
        Math.max(0, b * factor)
    );
}

function lighten(hex, amount = 0.9) {
    const { r, g, b } = hexToRgb(hex);
    return rgbToHex(
        r * (1 - amount) + 255 * amount,
        g * (1 - amount) + 255 * amount,
        b * (1 - amount) + 255 * amount
    );
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
    h /= 360;
    let r, g, b;

    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function getAccentColor(primaryHex) {
    const { r, g, b } = hexToRgb(primaryHex);
    const { h, s, l } = rgbToHsl(r, g, b);

    // rotate hue by 150 degrees to get a complementary/triadic splash
    let newH = (h + 150) % 360;
    const accentRgb = hslToRgb(newH, s, l);
    let accentHex = rgbToHex(accentRgb.r, accentRgb.g, accentRgb.b);

    // if the resulting accent is too light (luminance > 0.6), darken it
    if (getLuminance(accentRgb) > 0.6) {
        accentHex = darken(accentHex, 0.3);
    }
    return accentHex;
}

// ── PERSONA & TYPOGRAPHY ──────────────────────────────────────────────

function getBrandPersonality(brandContext = '') {
    const ctx = brandContext.toLowerCase();
    if (ctx.match(/luxury|premium|high-end/)) return 'luxury';
    if (ctx.match(/bold|energetic|sport|fitness/)) return 'bold';
    if (ctx.match(/minimal|clean|simple|modern/)) return 'minimal';
    if (ctx.match(/playful|fun|young|kids/)) return 'playful';
    if (ctx.match(/corporate|b2b|enterprise|saas/)) return 'corporate';
    return 'modern';
}

function getFontPairing(personality) {
    switch (personality) {
        case 'luxury':
            return { heading: 'Cormorant Garamond', body: 'Inter', headingWeight: 600, displaySize: 80 };
        case 'bold':
            return { heading: 'Syne', body: 'DM Sans', headingWeight: 800, displaySize: 88 };
        case 'minimal':
            return { heading: 'Plus Jakarta Sans', body: 'Inter', headingWeight: 700, displaySize: 80 };
        case 'playful':
            return { heading: 'Nunito', body: 'Inter', headingWeight: 800, displaySize: 76 };
        case 'corporate':
            return { heading: 'IBM Plex Serif', body: 'IBM Plex Sans', headingWeight: 600, displaySize: 72 };
        case 'modern':
        default:
            return { heading: 'Outfit', body: 'Inter', headingWeight: 700, displaySize: 80 };
    }
}

// ── EXPORT ENGINE ─────────────────────────────────────────────────────

export function generateBrandTokens(primaryHex, brandContext) {
    // Sanitize input
    if (!primaryHex || !primaryHex.startsWith('#')) primaryHex = '#6366F1';
    
    // Core brand spectrum
    const primaryDark = darken(primaryHex, 0.25);
    const primaryLight = lighten(primaryHex, 0.92);
    
    const accent = getAccentColor(primaryHex);
    const accentDark = darken(accent, 0.2);

    const emailHeroText = getSafeTextColor(primaryHex);
    const emailCtaText = getSafeTextColor(accent);

    return {
        colors: {
            primary: primaryHex,
            primaryDark,
            primaryLight,
            accent,
            accentDark,
            background: '#FFFFFF',
            surface: lighten(primaryHex, 0.97),
            surfaceAlt: lighten(primaryHex, 0.94),
            text: '#0A0A0A',
            textLight: '#6B7280',
            textInverse: '#FFFFFF',

            // Pre-computed safe combinations
            heroBackground: primaryHex,
            heroText: getSafeTextColor(primaryHex),
            heroCta: accent,
            heroCtaText: getSafeTextColor(accent),

            featureBackground: '#FFFFFF',
            featureText: '#0A0A0A',
            featureIcon: accent,
            featureIconBg: lighten(accent, 0.88),

            statBackground: lighten(primaryHex, 0.94), // surfaceAlt
            statNumber: accent,
            statLabel: '#6B7280',

            testimonialBackground: lighten(primaryHex, 0.96),
            testimonialText: '#0A0A0A',
            testimonialStars: '#F59E0B',

            ctaBackground: accent,
            ctaText: getSafeTextColor(accent),
            ctaButton: '#FFFFFF',
            ctaButtonText: accent,

            footerBackground: primaryDark,
            footerText: 'rgba(255,255,255,0.6)',

            // Email-specific
            emailHeroBg: primaryHex,
            emailHeroText,
            emailFeatureBg: '#FFFFFF',
            emailFeatureText: '#0A0A0A',
            emailCtaBg: accent,
            emailCtaText,
            emailFooterBg: primaryDark,
            emailBorder: lighten(primaryHex, 0.85),
        },
        fonts: getFontPairing(getBrandPersonality(brandContext)),
        spacing: {
            sectionPad: '120px',
            sectionPadMobile: '60px',
            cardPad: '32px',
            cardPadMobile: '20px',
            gap: '24px',
            gapLarge: '48px',
        },
        radius: {
            card: '16px',
            button: '10px',
            image: '20px',
            pill: '100px',
        },
        shadows: {
            card: '0 4px 24px rgba(0,0,0,0.08)',
            cardHover: '0 16px 48px rgba(0,0,0,0.14)',
            image: '0 20px 60px rgba(0,0,0,0.15)',
            button: '0 8px 24px rgba(0,0,0,0.12)',
        }
    };
}

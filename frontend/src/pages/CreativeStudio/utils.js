import { media as mediaAPI } from '../../services/api'

// ── Helper: Time Ago ──
export function getTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

// ── Helper: S3 Upload ──
export async function uploadToS3(base64Data, folder = 'uploads') {
    try {
        if (base64Data.startsWith('http')) return base64Data;
        const data = await mediaAPI.upload({ imageData: base64Data, folder });
        if (data.success && data.url) return data.url;
        console.warn('[uploadToS3] S3 upload failed, using base64 fallback:', data.error);
        return base64Data;
    } catch (err) {
        console.warn('[uploadToS3] Upload error, using base64 fallback:', err.message);
        return base64Data;
    }
}

// ── Client-side logo compositing (pixel-perfect, uses actual brand logo) ──
export function compositeLogoOnImage(imageUrl, logoUrl, position, size) {
    return new Promise((resolve) => {
        const img = new window.Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0)

            const logo = new window.Image()
            logo.crossOrigin = 'anonymous'
            logo.onload = () => {
                // Calculate logo size
                const pct = size === 'small' ? 0.08 : size === 'large' ? 0.2 : 0.12
                const maxW = canvas.width * pct
                const scale = maxW / logo.width
                const lw = logo.width * scale
                const lh = logo.height * scale
                const pad = canvas.width * 0.03 // 3% padding from edges

                // Position mapping
                const posMap = {
                    'top-left': [pad, pad],
                    'top-center': [(canvas.width - lw) / 2, pad],
                    'top-right': [canvas.width - lw - pad, pad],
                    'center-left': [pad, (canvas.height - lh) / 2],
                    'center': [(canvas.width - lw) / 2, (canvas.height - lh) / 2],
                    'center-right': [canvas.width - lw - pad, (canvas.height - lh) / 2],
                    'bottom-left': [pad, canvas.height - lh - pad],
                    'bottom-center': [(canvas.width - lw) / 2, canvas.height - lh - pad],
                    'bottom-right': [canvas.width - lw - pad, canvas.height - lh - pad],
                }
                const [x, y] = posMap[position] || posMap['bottom-right']

                ctx.drawImage(logo, x, y, lw, lh)
                resolve(canvas.toDataURL('image/png'))
            }
            logo.onerror = () => resolve(imageUrl) // fallback to original if logo fails
            logo.src = logoUrl
        }
        img.onerror = () => resolve(imageUrl)
        img.src = imageUrl
    })
}

/**
 * portColors.js — Port type → colour mapping shared by canvas components.
 * Kept separate so BaseNode.jsx stays a pure component file (Vite HMR requirement).
 */

export const PORT_COLORS = {
    text:       '#a78bfa',
    image:      '#34d399',
    video:      '#f472b6',
    audio:      '#fb923c',
    ref:        '#60a5fa',
    asset_list: '#facc15',
    mask:       '#94a3b8',
    number:     '#c084fc',
    svg:        '#f43f5e',
    model3d:    '#06b6d4',
};

export function getPortColor(type) {
    return PORT_COLORS[type] || '#94a3b8';
}

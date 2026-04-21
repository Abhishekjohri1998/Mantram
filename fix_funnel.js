const fs = require('fs');
const filePath = 'frontend/src/pages/FunnelStudio.jsx';

let content = fs.readFileSync(filePath, 'utf-8');

// Modals explicit inline hex codes
content = content.replace(/background: '#1e293b'/g, "background: 'var(--sys-surface)'");
content = content.replace(/background: '#0f172a'/g, "background: 'var(--sys-surface)'");
content = content.replace(/border: '1px solid #334155'/g, "border: '1px solid var(--sys-border)'");
content = content.replace(/borderBottom: '1px solid #334155'/g, "borderBottom: '1px solid var(--sys-border)'");
content = content.replace(/color: '#e2e8f0'/g, "color: 'var(--sys-text)'");
content = content.replace(/color: '#94a3b8'/g, "color: 'var(--sys-text-muted)'");
content = content.replace(/color: '#64748b'/g, "color: 'var(--sys-text-muted)'");

// Tailwind Hexes
content = content.replace(/bg-\[#1a1f35\]/g, "bg-[var(--sys-surface)]");
content = content.replace(/bg-\[#0a0e1a\]\/95/g, "bg-[var(--sys-surface)]/95");
content = content.replace(/text-slate-700/g, "text-[var(--sys-text-muted)]");

fs.writeFileSync(filePath, content);
console.log('FunnelStudio modals theme fixed!');

const fs = require('fs');

let newAnimate = fs.readFileSync('animate_new.txt', 'utf8');

// Replace standard colors with sys tokens for Light/Dark mode
newAnimate = newAnimate.replace(/bg-\[#12121f\]/g, 'bg-[var(--sys-surface)]');
newAnimate = newAnimate.replace(/border-white\/\[0\.08\]/g, 'border-[var(--sys-border)]');
newAnimate = newAnimate.replace(/border-white\/\[0\.06\]/g, 'border-[var(--sys-border)]');
newAnimate = newAnimate.replace(/text-white/g, 'text-[var(--sys-text)]');
newAnimate = newAnimate.replace(/bg-white\/5/g, 'bg-[var(--sys-surface)]');
newAnimate = newAnimate.replace(/text-slate-400/g, 'text-[var(--sys-text-muted)]');
newAnimate = newAnimate.replace(/text-slate-500/g, 'text-[var(--sys-text-muted)]');
newAnimate = newAnimate.replace(/bg-white\/10/g, 'bg-[var(--sys-surface)]');
newAnimate = newAnimate.replace(/bg-white\/20/g, 'hover:bg-[var(--sys-border)]');

let creative = fs.readFileSync('frontend/src/pages/CreativeStudio.jsx', 'utf8');

// The block to replace:
const startMarker = '{animateModalOpen && (';
const endTokens = '</div>\n            )}';

const startIdx = creative.indexOf(startMarker);
let endIdx = creative.indexOf(endTokens, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const end = endIdx + endTokens.length;
    creative = creative.slice(0, startIdx) + newAnimate.trimEnd() + '\n' + creative.slice(end);
    fs.writeFileSync('frontend/src/pages/CreativeStudio.jsx', creative);
    console.log("Successfully patched CreativeStudio.jsx with updated Animate GUI");
} else {
    console.log("Failed to find boundaries", startIdx, endIdx);
}

const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('d:/mantram/Mantram AI/Mantram AI/frontend/src/pages/CreativeStudio.jsx');

if (!fs.existsSync(targetFile)) {
    console.error('File not found:', targetFile);
    process.exit(1);
}

let content = fs.readFileSync(targetFile, 'utf8');

console.log('Original size:', content.length);

// We need a regex that matches `grid-cols-X` but NOT when it's preceded by `:`
// e.g. `/(?<!:)\bgrid-cols-2\b/g` -> we replace it with `grid-cols-1 sm:grid-cols-2`
// But wait, what if it's already `grid-cols-1 md:grid-cols-2`? Then `(?<!:)\bgrid-cols-2\b` won't match `md:grid-cols-2` because of the `md:`. This is perfect for lookbehind!

// grid-cols-2 -> grid-cols-1 sm:grid-cols-2
content = content.replace(/(?<![:\-])\bgrid-cols-2\b/g, 'grid-cols-1 sm:grid-cols-2');

// grid-cols-3 -> grid-cols-1 sm:grid-cols-2 md:grid-cols-3
content = content.replace(/(?<![:\-])\bgrid-cols-3\b/g, 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3');

// grid-cols-4 -> grid-cols-1 sm:grid-cols-2 lg:grid-cols-4
content = content.replace(/(?<![:\-])\bgrid-cols-4\b/g, 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4');

// grid-cols-5 -> grid-cols-2 sm:grid-cols-3 lg:grid-cols-5
content = content.replace(/(?<![:\-])\bgrid-cols-5\b/g, 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5');

// grid-cols-6 -> grid-cols-2 sm:grid-cols-3 xl:grid-cols-6
content = content.replace(/(?<![:\-])\bgrid-cols-6\b/g, 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-6');

// Replace standard static paddings (p-5, p-6, p-8) that might overwhelm mobile
// We want to replace `p-6` with `p-4 sm:p-6` only if NOT preceded by things like `px-`, `py-`, etc.
content = content.replace(/(?<![:\-])\bp-5\b/g, 'p-4 sm:p-5');
content = content.replace(/(?<![:\-])\bp-6\b/g, 'p-4 sm:p-6');
content = content.replace(/(?<![:\-])\bp-8\b/g, 'p-4 sm:p-8');

// Modals usually have max-w-md, max-w-lg, max-w-2xl, max-w-xl.
// Let's ensure they have a margin on mobile if they only have w-full.
// Actually, if they are centered, usually `p-4 sm:p-6` on the overlay is enough, 
// but let's just make sure `w-[calc(100%-2rem)] md:w-full` if there's a strict w- or max-w- with no w-full.
// The easiest is just substituting `max-w-md` out to `w-[calc(100%-2rem)] sm:w-full max-w-md` if `w-full` isn't there, 
// but just replacing `max-w-md` with `max-w-md mx-4 sm:mx-auto` works!
content = content.replace(/\bmax-w-md\b/g, 'max-w-[calc(100%-2rem)] sm:max-w-md mx-auto');
content = content.replace(/\bmax-w-lg\b/g, 'max-w-[calc(100%-2rem)] sm:max-w-lg mx-auto');
content = content.replace(/\bmax-w-xl\b/g, 'max-w-[calc(100%-2rem)] sm:max-w-xl mx-auto');
content = content.replace(/\bmax-w-2xl\b/g, 'max-w-[calc(100%-2rem)] sm:max-w-2xl mx-auto');

// We also need to fix `h-screen overflow-y-auto` elements (like sidebar wrapper) to allow scroll nicely on mobile if any fixed heights.
// `gap-4`, `gap-6` might be too large on mobile. Let's make `gap-6` -> `gap-4 sm:gap-6`
content = content.replace(/(?<![:\-])\bgap-6\b/g, 'gap-4 sm:gap-6');

fs.writeFileSync(targetFile, content, 'utf8');

console.log('Modified size:', content.length);
console.log('Successfully updated grids and responsiveness across CreativeStudio.jsx');

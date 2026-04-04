const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');
const compDir = path.join(__dirname, 'src', 'components');

const replacements = [
    { from: /bg-\[#050510\]/g, to: 'bg-[#08080C]' },
    { from: /bg-\[#08080f\]/g, to: 'bg-[#08080C]' },
    { from: /bg-\[#0a0a14\]/g, to: 'bg-[#121217]' },
    { from: /bg-\[#13131a\]/g, to: 'bg-[#121217]' },
    { from: /bg-\[#1a1a2e\]/g, to: 'bg-[#1A1A26]' },
    { from: /bg-slate-900/g, to: 'bg-[#08080C]' },
    { from: /bg-slate-800/g, to: 'bg-[#121217]' },
    { from: /bg-slate-950/g, to: 'bg-[#08080C]' },

    // Primary Accents (From whatever cyan/violet they had to neon orange #FF4D00 or cyan #8ff5ff where appropriate, but wait, let's keep it safe.)
    // If they were using cyan-500, we leave it since it's an accent, but maybe change indigo-500/violet-500 to orange if they asked for 'too many colors'. 
    { from: /bg-indigo-500\/10/g, to: 'bg-[#FF4D00]/10' },
    { from: /border-indigo-500\/20/g, to: 'border-[#FF4D00]/20' },
    { from: /text-indigo-400/g, to: 'text-[#FF4D00]' },
    
    { from: /bg-violet-500\/10/g, to: 'bg-[#FF4D00]/10' },
    { from: /border-violet-500\/20/g, to: 'border-[#FF4D00]/20' },
    { from: /text-violet-400/g, to: 'text-[#FF4D00]' },
];

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;
            
            for (const r of replacements) {
                content = content.replace(r.from, r.to);
            }
            
            if (content !== originalContent) {
                console.log(`Updated colors in ${file}`);
                fs.writeFileSync(fullPath, content, 'utf8');
            }
        }
    }
}

console.log('Starting color migration...');
processDir(pagesDir);
processDir(compDir);
console.log('Migration complete.');

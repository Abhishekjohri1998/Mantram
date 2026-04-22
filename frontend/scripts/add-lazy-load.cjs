const fs = require('fs');
const p = 'src/pages/CreativeStudio.jsx';
let text = fs.readFileSync(p, 'utf-8');
let count = 0;
text = text.replace(/<img(?![^>]*loading=)/ig, (match) => {
    count++;
    return '<img loading="lazy" decoding="async"';
});
fs.writeFileSync(p, text);
console.log('Added native lazy loading to', count, 'images');

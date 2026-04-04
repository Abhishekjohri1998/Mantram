const fs = require('fs');
const path = require('path');

const emojis = {
    '✨': 'auto_awesome',
    '🚀': 'rocket_launch',
    '📈': 'trending_up',
    '💬': 'chat',
    '🎯': 'ads_click',
    '🎨': 'palette',
    '🎬': 'movie',
    '📊': 'bar_chart',
    '🧠': 'psychology',
    '⚙️': 'settings',
    '🛡️': 'security',
    '✅': 'check_circle',
    '❌': 'cancel',
    '🔥': 'local_fire_department',
    '📅': 'calendar_month',
    '🎥': 'videocam',
    '🎙️': 'mic',
    '🎧': 'headphones',
    '💻': 'computer',
    '📱': 'smartphone',
    '🔗': 'link',
    '🌐': 'language',
    '📍': 'location_on',
    '✏️': 'edit',
    '🛍️': 'shopping_bag',
    '🏆': 'emoji_events',
    '🎁': 'redeem',
    '⭐': 'star',
    '🎀': 'card_giftcard',
    '🎆': 'celebration',
    '❤️': 'favorite',
    '⚡️': 'bolt',
    '🤖': 'smart_toy',
    '🔧': 'build'
};

// Create an array of patterns (some emojis have variation selectors like \uFE0F)
const emojiRegex = new RegExp('(' + Object.keys(emojis).join('|') + ')', 'g');

function safeReplace(content) {
    // We split content by lines. For each line, if it has an emoji:
    // If it's part of a Javascript string assignment (e.g., icon: '📱'), we replace the emoji with the string name.
    // If it's a title/placeholder attribute (e.g. title="✨ Settings"), we just strip the emoji.
    // If it's inside React {} text interpolation like `✨ ${name}`, we strip it.
    // If it's inline JSX text like `>✨ Settings<`, we inject the Material Symbol span.

    return content.split('\n').map(line => {
        if (!emojiRegex.test(line)) return line;
        
        let modified = line;

        // 1. Strip from HTML attributes (title="...", placeholder="...")
        modified = modified.replace(/(title|placeholder)=(["'])(.*?)\2/g, (match, p1, p2, p3) => {
            return `${p1}=${p2}${p3.replace(emojiRegex, '').trim()}${p2}`;
        });

        // 2. Strip from template literals and basic single/double quotes where it acts as a prefix inside js
        // Only if it's very obviously a string like `✨ Something` inside backticks.
        modified = modified.replace(/`([^`]*)`/g, (match, p1) => {
            return `\`${p1.replace(emojiRegex, '')}\``;
        });

        // 3. For object properties especially in maps like { icon: '📱' }
        // We will transform them to the material icon names!
        modified = modified.replace(/['"]([🔧⚡️✨🚀🤖📈💬🎯🎨🎬📊🧠⚙️🛡️📞✅❌🔥📅🎥🎙️🎧💻📱🔗🌐📍✏️🛍️🏆🎁⭐🎀🎆❤️]+)['"]/g, (match, p1) => {
             // Find matching name
             let pureEmoji = p1.replace(/[\uFE0F]/g, '');
             return `'${emojis[pureEmoji] || ''}'`;
        });
        
        // 4. Finally, for inline JSX text like `>✅ Approve` or `> ✨ Text`
        modified = modified.replace(/>([^<]*)/g, (match, p1) => {
            return '>' + p1.replace(emojiRegex, (m) => {
                let stripped = m.replace(/[\uFE0F]/g, '');
                let sym = emojis[stripped] || emojis[m];
                if (sym) {
                    return `<span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">${sym}</span>`;
                }
                return m; // fallback
            });
        });

        return modified;

    }).join('\n');
}

const pagesDir = path.join(__dirname, 'src', 'pages');

function processDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (fullPath.endsWith('.jsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let newContent = safeReplace(content);

            // Special handling for a few known edge cases where replacing icon literal to word needs a className change
            if (file === 'Integrations.jsx') {
                newContent = newContent.replace(/<span className="text-2xl">{m.icon}<\/span>/g, '<span className="material-symbols-outlined text-2xl">{m.icon}</span>');
                newContent = newContent.replace(/<span className="text-2xl">([^<]+)<\/span>/g, (m, p1) => {
                    if (p1.includes('material-symbols')) return m;
                    return `<span className="material-symbols-outlined text-2xl">${p1.trim()}</span>`;
                });
            }
            if (file === 'SmartCalendar.jsx') {
                // If it replaced icon: '📱' with icon: 'smartphone', it shouldn't be added directly to the title if expected as emoji
                // but the regex #3 stripped it.
            }
            if (file === 'TeamDashboard.jsx') {
                 newContent = newContent.replace(/>(?:<span[^>]*>(?:check_circle|cancel|edit)<\/span>)*\s*(.*?)(✅|❌|✏️)/g, (m, p1) => `>${p1}`); // cleanup stragglers
            }

            if (content !== newContent) {
                console.log(`Migrated emojis to Material Symbols in ${file}`);
                fs.writeFileSync(fullPath, newContent, 'utf8');
            }
        }
    }
}

console.log('Starting Emoji-to-Material migration...');
processDir(pagesDir);
console.log('Migration complete.');

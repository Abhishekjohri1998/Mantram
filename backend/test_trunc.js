const prompt = `This is a very long prompt... `.repeat(100) + `
═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══
TEXT ON IMAGE — HEADLINE: "Hello World"
IMPORTANT: Do not skip this!
═══════════════════════════════════════════`;

const typoMatch = prompt.match(/═══ CRITICAL TEXT RENDERING INSTRUCTIONS ═══[\s\S]*$/);
const typoBlock = typoMatch ? typoMatch[0] : '';
const truncated = prompt.substring(0, 100) + '\n\n[...condensed]\n\n' + typoBlock;
console.log("Typo Block found:", !!typoBlock);
console.log("Truncated result length:", truncated.length);
console.log("Ends with:", truncated.substring(truncated.length - 100));

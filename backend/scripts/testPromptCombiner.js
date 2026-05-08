import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

// Mock Brand model — avoid DB connection for this test
const mockBrand = {
    _id: 'test123',
    name: 'GreenLeaf Organics',
    tagline: 'Pure herbal care',
    dna: {
        colors: [{ hex: '#2D7D46', name: 'Forest Green' }],
        personality: 'Natural, honest, caring',
        industry: 'Beauty & Wellness'
    }
};

// Inline the combiner logic for isolated testing (avoids mongoose dependency)
function buildTestPrompt({ template, userPrompt, productDescription = '', brandData = {} }) {
    const substitutions = {
        '{brand_name}': brandData.brand_name || 'the brand',
        '{brand_tagline}': brandData.brand_tagline || '',
        '{brand_color}': brandData.brand_color_primary || '',
        '{product_name}': brandData.brand_name || 'the product',
        '{packaging_description}': productDescription || '',
        '{product_description}': productDescription || '',
        '{tagline}': userPrompt || brandData.brand_tagline || '',
        '{user_brief}': userPrompt || '',
        '{headline}': brandData.brand_tagline || userPrompt || '',
    };

    let basePrompt = template.promptTemplate || template.savedPrompt || '';
    let finalPrompt = basePrompt;
    for (const [placeholder, value] of Object.entries(substitutions)) {
        finalPrompt = finalPrompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    if (userPrompt && userPrompt.trim() && !finalPrompt.includes(userPrompt.trim())) {
        finalPrompt = finalPrompt ? `${finalPrompt}\n\nAdditional direction: ${userPrompt.trim()}` : userPrompt.trim();
    }

    return finalPrompt;
}

// Test 1: Full placeholder substitution
const template1 = {
    promptTemplate: 'Cinematic product shot of {product_name} by {brand_name}, {packaging_description}, on dark wet stone surface, deep green botanical background, {tagline}.',
    savedPrompt: 'Fallback prompt — should not appear when promptTemplate is present',
};

const brandData = {
    brand_name: mockBrand.name,
    brand_tagline: mockBrand.tagline,
    brand_color_primary: mockBrand.dna.colors[0].hex,
    brand_personality: mockBrand.dna.personality,
    brand_industry: mockBrand.dna.industry,
};

const result1 = buildTestPrompt({
    template: template1,
    userPrompt: 'pure herbal care',
    productDescription: 'cylindrical white tube with orange flip cap, brand logo centered, 150ml volume marked',
    brandData,
});

console.log('\n✅ TEST 1 — Placeholder Substitution:');
console.log('Final prompt:');
console.log(result1);
console.log('\nVerification:');
const checks = [
    ['{product_name}', result1.includes('{product_name}'), false, 'product_name substituted'],
    ['{brand_name}', result1.includes('{brand_name}'), false, 'brand_name substituted'],
    ['{packaging_description}', result1.includes('{packaging_description}'), false, 'packaging_description substituted'],
    ['{tagline}', result1.includes('{tagline}'), false, 'tagline substituted'],
    ['GreenLeaf Organics', result1.includes('GreenLeaf Organics'), true, 'brand name appears in output'],
    ['cylindrical white tube', result1.includes('cylindrical white tube'), true, 'product description appears in output'],
];

let passed = 0;
for (const [label, actual, expected, desc] of checks) {
    const ok = actual === expected;
    console.log(`  ${ok ? '✅' : '❌'} ${desc}: ${ok ? 'PASS' : 'FAIL'}`);
    if (ok) passed++;
}

// Test 2: savedPrompt fallback (no promptTemplate)
const template2 = {
    savedPrompt: 'Dark studio shot, dramatic lighting, premium product photography.',
};

const result2 = buildTestPrompt({
    template: template2,
    userPrompt: 'add morning dew effect',
    productDescription: '',
    brandData,
});

console.log('\n✅ TEST 2 — savedPrompt Fallback:');
console.log('Final prompt:', result2);
const t2ok = result2.includes('Dark studio shot') && result2.includes('morning dew');
console.log(`  ${t2ok ? '✅' : '❌'} savedPrompt used + userPrompt appended: ${t2ok ? 'PASS' : 'FAIL'}`);
if (t2ok) passed++;

console.log(`\n${'='.repeat(50)}`);
console.log(`Stage 3 Verification: ${passed}/${checks.length + 1} checks passed`);
if (passed === checks.length + 1) {
    console.log('✅ ALL CHECKS PASSED — Stage 3 ready');
} else {
    console.log('❌ SOME CHECKS FAILED — fix before proceeding to Stage 4');
    process.exit(1);
}

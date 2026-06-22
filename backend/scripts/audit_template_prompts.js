/**
 * audit_template_prompts.js
 * 
 * Connects to the MongoDB database and audits every Template document
 * to verify that the prompt fields (savedPrompt, promptTemplate, dna.promptFormula)
 * are populated and meet the 15-25 line detailed generation prompt standard.
 *
 * Usage:
 *   node --env-file=.env scripts/audit_template_prompts.js
 */

import mongoose from 'mongoose';
import Template from '../models/Template.js';

// ── Quality thresholds ──────────────────────────────────────────────────────
const MIN_PROMPT_LENGTH = 100;        // Characters — anything less is a stub
const GOOD_PROMPT_LENGTH = 500;       // Characters — a decent 5-10 line prompt
const EXCELLENT_PROMPT_LENGTH = 1000; // Characters — a 15-25 line prompt
const MIN_LINES_FOR_DETAILED = 10;    // Lines — the 15-25 line rule (we flag < 10)

// ── Required placeholder markers for a complete promptFormula ────────────
const REQUIRED_PLACEHOLDERS = ['{{PRODUCT_DESCRIPTION}}', '{{HEADLINE}}', '{{BRAND}}'];
const OPTIONAL_PLACEHOLDERS = ['{{OFFER}}', '{{CTA}}'];

// ── Known fallback/stub phrases that indicate a failed DNA extraction ────
const STUB_PHRASES = [
    'Create a professional marketing image',
    'Clean, modern composition',
    'professional marketing image featuring',
];

function countLines(text) {
    if (!text) return 0;
    return text.split(/\r?\n/).filter(l => l.trim().length > 0).length;
}

function isStubPrompt(text) {
    if (!text) return true;
    // Check if the entire prompt is just one of the stub phrases (with possible placeholder substitution)
    const trimmed = text.trim();
    if (trimmed.length < MIN_PROMPT_LENGTH) return true;
    // Check if it matches the known fallback pattern exactly
    for (const stub of STUB_PHRASES) {
        if (trimmed.startsWith(stub) && trimmed.length < 200) return true;
    }
    return false;
}

function analyzePromptQuality(text) {
    if (!text) return { quality: 'MISSING', score: 0, issues: ['No prompt text'] };

    const issues = [];
    const lines = countLines(text);
    const len = text.length;

    // Check length
    if (len < MIN_PROMPT_LENGTH) {
        issues.push(`Too short (${len} chars, need ≥${MIN_PROMPT_LENGTH})`);
    }

    // Check if it's a stub
    if (isStubPrompt(text)) {
        issues.push('Appears to be a fallback/stub prompt');
    }

    // Check line count
    if (lines < MIN_LINES_FOR_DETAILED) {
        issues.push(`Only ${lines} lines (target: 15-25)`);
    }

    // Check for required placeholders
    for (const ph of REQUIRED_PLACEHOLDERS) {
        if (!text.includes(ph)) {
            issues.push(`Missing placeholder: ${ph}`);
        }
    }

    // Check for vague terms without specifics
    const vagueTerms = ['professional', 'modern', 'clean', 'sleek'];
    for (const vt of vagueTerms) {
        const regex = new RegExp(`\\b${vt}\\b`, 'gi');
        const matches = text.match(regex);
        if (matches && matches.length > 0) {
            // Check if there's specificity around the term (color, size, etc.)
            const idx = text.toLowerCase().indexOf(vt);
            const context = text.substring(Math.max(0, idx - 30), Math.min(text.length, idx + vt.length + 30));
            if (!/[#]\w{3,6}|px|\d+%|rgb|hsl/i.test(context)) {
                issues.push(`Vague term "${vt}" without specifics`);
            }
        }
    }

    // Score calculation
    let score = 0;
    if (len >= EXCELLENT_PROMPT_LENGTH) score += 40;
    else if (len >= GOOD_PROMPT_LENGTH) score += 25;
    else if (len >= MIN_PROMPT_LENGTH) score += 10;

    if (lines >= 15) score += 30;
    else if (lines >= 10) score += 20;
    else if (lines >= 5) score += 10;

    // Placeholder bonus
    const foundRequired = REQUIRED_PLACEHOLDERS.filter(ph => text.includes(ph)).length;
    score += (foundRequired / REQUIRED_PLACEHOLDERS.length) * 20;
    const foundOptional = OPTIONAL_PLACEHOLDERS.filter(ph => text.includes(ph)).length;
    score += (foundOptional / OPTIONAL_PLACEHOLDERS.length) * 10;

    let quality;
    if (score >= 80) quality = 'EXCELLENT';
    else if (score >= 50) quality = 'GOOD';
    else if (score >= 25) quality = 'WEAK';
    else quality = 'POOR';

    if (isStubPrompt(text)) quality = 'STUB';

    return { quality, score: Math.round(score), issues, lines, length: len };
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TEMPLATE PROMPT AUDIT');
    console.log('═══════════════════════════════════════════════════════════════\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const templates = await Template.find({}).lean();
    console.log(`📋 Found ${templates.length} templates in the database\n`);

    // Statistics
    const stats = {
        total: templates.length,
        savedPrompt: { missing: 0, stub: 0, poor: 0, weak: 0, good: 0, excellent: 0 },
        promptTemplate: { missing: 0, stub: 0, poor: 0, weak: 0, good: 0, excellent: 0 },
        dnaPromptFormula: { missing: 0, stub: 0, poor: 0, weak: 0, good: 0, excellent: 0 },
        noDna: 0,
        noSystemRefImage: 0,
        noPreviewImage: 0,
        byStudioOrigin: {},
        byStudioSection: {},
    };

    const problemTemplates = [];

    for (const t of templates) {
        const origin = t.studioOrigin || 'unknown';
        const section = t.studioSection || 'unknown';
        stats.byStudioOrigin[origin] = (stats.byStudioOrigin[origin] || 0) + 1;
        stats.byStudioSection[section] = (stats.byStudioSection[section] || 0) + 1;

        if (!t.dna) stats.noDna++;
        if (!t.systemReferenceImage) stats.noSystemRefImage++;
        if (!t.previewImageUrl && !t.previewUrl) stats.noPreviewImage++;

        // Analyze savedPrompt
        const spAnalysis = analyzePromptQuality(t.savedPrompt);
        stats.savedPrompt[spAnalysis.quality.toLowerCase()]++;

        // Analyze promptTemplate
        const ptAnalysis = analyzePromptQuality(t.promptTemplate);
        stats.promptTemplate[ptAnalysis.quality.toLowerCase()]++;

        // Analyze dna.promptFormula
        const pfText = t.dna?.promptFormula || '';
        const pfAnalysis = analyzePromptQuality(pfText || null);
        stats.dnaPromptFormula[pfAnalysis.quality.toLowerCase()]++;

        // Flag templates that need attention
        const hasProblems = (
            spAnalysis.quality === 'MISSING' || spAnalysis.quality === 'STUB' || spAnalysis.quality === 'POOR' ||
            ptAnalysis.quality === 'MISSING' || ptAnalysis.quality === 'STUB' || ptAnalysis.quality === 'POOR'
        );

        if (hasProblems) {
            problemTemplates.push({
                _id: t._id,
                name: t.name,
                studioOrigin: origin,
                studioSection: section,
                isPublished: t.isPublished,
                isActive: t.isActive,
                userCreated: t.userCreated || false,
                savedPrompt: spAnalysis,
                promptTemplate: ptAnalysis,
                dnaPromptFormula: pfAnalysis,
                hasDna: !!t.dna,
                hasSystemRefImage: !!t.systemReferenceImage,
                savedPromptPreview: (t.savedPrompt || '').substring(0, 120),
                promptTemplatePreview: (t.promptTemplate || '').substring(0, 120),
            });
        }
    }

    // ── Print Summary ────────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Total templates: ${stats.total}`);
    console.log(`Templates without DNA: ${stats.noDna}`);
    console.log(`Templates without systemReferenceImage: ${stats.noSystemRefImage}`);
    console.log(`Templates without any preview image: ${stats.noPreviewImage}\n`);

    console.log('─── By Studio Origin ───');
    for (const [k, v] of Object.entries(stats.byStudioOrigin)) {
        console.log(`  ${k}: ${v}`);
    }

    console.log('\n─── By Studio Section ───');
    for (const [k, v] of Object.entries(stats.byStudioSection)) {
        console.log(`  ${k}: ${v}`);
    }

    console.log('\n─── savedPrompt Quality ───');
    for (const [k, v] of Object.entries(stats.savedPrompt)) {
        if (v > 0) console.log(`  ${k.toUpperCase()}: ${v}`);
    }

    console.log('\n─── promptTemplate Quality ───');
    for (const [k, v] of Object.entries(stats.promptTemplate)) {
        if (v > 0) console.log(`  ${k.toUpperCase()}: ${v}`);
    }

    console.log('\n─── dna.promptFormula Quality ───');
    for (const [k, v] of Object.entries(stats.dnaPromptFormula)) {
        if (v > 0) console.log(`  ${k.toUpperCase()}: ${v}`);
    }

    // ── Problem Templates ────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  PROBLEM TEMPLATES (${problemTemplates.length} found)`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Separate published from unpublished
    const publishedProblems = problemTemplates.filter(t => t.isPublished && t.isActive);
    const unpublishedProblems = problemTemplates.filter(t => !t.isPublished || !t.isActive);

    if (publishedProblems.length > 0) {
        console.log(`\n🚨 PUBLISHED & ACTIVE templates with prompt issues (${publishedProblems.length}):`);
        console.log('───────────────────────────────────────────────────────────────');
        for (const t of publishedProblems) {
            console.log(`\n  📝 ${t.name} (${t._id})`);
            console.log(`     Origin: ${t.studioOrigin} | Section: ${t.studioSection} | UserCreated: ${t.userCreated}`);
            console.log(`     savedPrompt: ${t.savedPrompt.quality} (score: ${t.savedPrompt.score}, ${t.savedPrompt.length || 0} chars, ${t.savedPrompt.lines || 0} lines)`);
            if (t.savedPrompt.issues?.length > 0) {
                console.log(`       Issues: ${t.savedPrompt.issues.join('; ')}`);
            }
            console.log(`     promptTemplate: ${t.promptTemplate.quality} (score: ${t.promptTemplate.score}, ${t.promptTemplate.length || 0} chars, ${t.promptTemplate.lines || 0} lines)`);
            if (t.promptTemplate.issues?.length > 0) {
                console.log(`       Issues: ${t.promptTemplate.issues.join('; ')}`);
            }
            console.log(`     dna.promptFormula: ${t.dnaPromptFormula.quality} (score: ${t.dnaPromptFormula.score})`);
            console.log(`     Has DNA: ${t.hasDna} | Has Ref Image: ${t.hasSystemRefImage}`);
            console.log(`     Preview: "${t.savedPromptPreview}..."`);
        }
    } else {
        console.log('\n✅ No published & active templates have prompt issues!');
    }

    if (unpublishedProblems.length > 0) {
        console.log(`\n\n⚠️  Unpublished/inactive templates with prompt issues (${unpublishedProblems.length}):`);
        console.log('───────────────────────────────────────────────────────────────');
        for (const t of unpublishedProblems) {
            console.log(`\n  📝 ${t.name} (${t._id})`);
            console.log(`     Origin: ${t.studioOrigin} | Section: ${t.studioSection} | UserCreated: ${t.userCreated}`);
            console.log(`     savedPrompt: ${t.savedPrompt.quality} (score: ${t.savedPrompt.score})`);
            console.log(`     promptTemplate: ${t.promptTemplate.quality} (score: ${t.promptTemplate.score})`);
            console.log(`     Published: ${t.isPublished} | Active: ${t.isActive}`);
        }
    }

    // ── Show examples of EXCELLENT prompts for reference ──────────────────────
    const excellentTemplates = templates.filter(t => {
        const analysis = analyzePromptQuality(t.dna?.promptFormula || null);
        return analysis.quality === 'EXCELLENT';
    });

    if (excellentTemplates.length > 0) {
        console.log('\n\n═══════════════════════════════════════════════════════════════');
        console.log(`  EXAMPLE EXCELLENT PROMPTS (${excellentTemplates.length} total)`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        // Show first 2 examples
        for (const t of excellentTemplates.slice(0, 2)) {
            console.log(`  📝 ${t.name} (${t._id})`);
            console.log(`     dna.promptFormula (${t.dna.promptFormula.length} chars, ${countLines(t.dna.promptFormula)} lines):`);
            console.log(`     ───`);
            // Print first 500 chars
            const preview = t.dna.promptFormula.substring(0, 500);
            for (const line of preview.split('\n')) {
                console.log(`     ${line}`);
            }
            console.log(`     ...\n`);
        }
    }

    // ── Final verdict ────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  VERDICT');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const publishedCount = templates.filter(t => t.isPublished && t.isActive).length;
    const publishedWithGoodPrompts = templates.filter(t => {
        if (!t.isPublished || !t.isActive) return false;
        const sp = analyzePromptQuality(t.savedPrompt);
        return sp.quality === 'GOOD' || sp.quality === 'EXCELLENT';
    }).length;

    console.log(`  Published & Active: ${publishedCount}`);
    console.log(`  With Good/Excellent savedPrompt: ${publishedWithGoodPrompts} (${publishedCount > 0 ? Math.round(publishedWithGoodPrompts / publishedCount * 100) : 0}%)`);
    console.log(`  With Problems: ${publishedProblems.length} (${publishedCount > 0 ? Math.round(publishedProblems.length / publishedCount * 100) : 0}%)\n`);

    if (publishedProblems.length > 0) {
        console.log('  ⚠️  ACTION NEEDED: Some published templates have weak/missing prompts.');
        console.log('  Consider re-running DNA extraction on these templates via the Superadmin panel.');
    } else {
        console.log('  ✅ All published templates have acceptable prompts!');
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
}

main().catch(err => {
    console.error('❌ Audit failed:', err);
    process.exit(1);
});

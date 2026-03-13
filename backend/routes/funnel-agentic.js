/**
 * Funnel Agentic Routes — Phase 2: AI-Powered Lead Intelligence
 * 
 * 1. AI Lead Qualifier — Auto-score and qualify new leads using LLM
 * 2. Smart Lead Routing — Route leads to stages based on AI analysis
 * 3. Conversational Nurture — AI-personalized follow-ups using brand DNA
 * 4. Cross-Studio Auto-Trigger — Auto-generate content for funnel stages
 * 5. CSV/Excel Import — Bulk lead upload
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Brand from '../models/Brand.js';
import Contact from '../models/Contact.js';
import { getRouter } from '../ai/router.js';
import { sendEmail } from '../utils/email.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { runAutomationRules } from './funnel-automation.js';

const router = Router();


// ═══════════════════════════════════════════════════════════════
//  #6 AI LEAD QUALIFIER — Score & qualify leads using LLM
// ═══════════════════════════════════════════════════════════════

router.post('/:funnelId/ai-qualify', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { entryIds } = req.body; // optional — qualify specific entries
        const filter = { funnel: funnel._id, status: 'active' };
        if (entryIds?.length) filter._id = { $in: entryIds };

        const entries = await FunnelEntry.find(filter).sort({ createdAt: -1 }).limit(50);
        if (entries.length === 0) return res.json({ success: true, qualified: 0, results: [] });

        // Brand context
        let brandContext = '';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandContext = `Brand: ${brand.name}\nIndustry: ${brand.industry || 'General'}\nTarget: ${brand.targetAudience || 'General audience'}\nProducts: ${brand.products?.slice(0, 5).map(p => p.name).join(', ') || 'N/A'}`;
        }

        // Build entry summaries for AI
        const entrySummaries = entries.map(e => ({
            id: e._id.toString(),
            name: e.name,
            email: e.email || 'none',
            phone: e.phone ? 'yes' : 'no',
            company: e.company || 'unknown',
            source: e.source,
            currentStage: e.currentStage,
            score: e.score,
            touchpoints: e.touchpoints?.length || 0,
            daysSinceCreated: Math.floor((Date.now() - new Date(e.createdAt)) / 86400000),
            tags: e.tags?.join(', ') || 'none',
        }));

        let qualifiedResults = [];
        let usedAI = false;

        try {
            const ai = getRouter();
            const result = await ai.generateText({
                prompt: `You are an expert lead qualification agent. Analyze these leads for the "${funnel.name}" funnel and qualify each one.

${brandContext}

FUNNEL TYPE: ${funnel.type}
STAGES: ${funnel.stages.map(s => `"${s.name}" (${s.type})`).join(' → ')}

LEADS TO QUALIFY:
${JSON.stringify(entrySummaries, null, 2)}

For each lead, respond with a JSON array:
[
    {
        "id": "entry_id",
        "qualification": "hot|warm|cold|unqualified",
        "score": 0-100,
        "reasoning": "Brief reason (1 sentence)",
        "suggestedStage": "which stage they should be in",
        "suggestedAction": "next best action to take",
        "leadType": "service|product|digital|unknown"
    }
]

RULES:
- hot (score 70-100): High intent, complete profile, multiple touchpoints, relevant source
- warm (score 40-69): Some engagement, partial profile, has potential
- cold (score 10-39): Minimal engagement, missing info, unclear intent
- unqualified (score 0-9): Bot, spam, or completely irrelevant
- suggestedStage MUST be an actual stage name from the funnel
- Be specific in reasoning — reference actual data points`,
                maxTokens: 3000,
                temperature: 0.4,
            });

            try {
                const jsonMatch = result.text.match(/\[[\s\S]*\]/);
                qualifiedResults = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
            } catch {
                qualifiedResults = [];
            }
            usedAI = true;
        } catch {
            // Rule-based fallback
            qualifiedResults = entries.map(e => {
                let score = 0;
                if (e.email) score += 15;
                if (e.phone) score += 10;
                if (e.company) score += 10;
                if (e.touchpoints?.length >= 3) score += 15;
                else if (e.touchpoints?.length >= 1) score += 5;
                if (['referral', 'dm'].includes(e.source)) score += 15;
                else if (['seo', 'social', 'linkedin'].includes(e.source)) score += 10;
                else if (['ad'].includes(e.source)) score += 5;
                const daysSince = Math.floor((Date.now() - new Date(e.updatedAt || e.createdAt)) / 86400000);
                if (daysSince <= 1) score += 15;
                else if (daysSince <= 3) score += 10;
                else if (daysSince <= 7) score += 5;
                score = Math.min(100, score);

                return {
                    id: e._id.toString(),
                    qualification: score >= 70 ? 'hot' : score >= 40 ? 'warm' : score >= 10 ? 'cold' : 'unqualified',
                    score,
                    reasoning: `Rule-based: ${e.email ? 'has email' : 'no email'}, ${e.touchpoints?.length || 0} touchpoints, source ${e.source}, ${daysSince}d old`,
                    suggestedStage: e.currentStage,
                    suggestedAction: score >= 70 ? 'Send personalized follow-up' : score >= 40 ? 'Add to nurture sequence' : 'Re-engage with content',
                    leadType: 'unknown',
                };
            });
        }

        // Apply scores to entries
        let updated = 0;
        for (const result of qualifiedResults) {
            const entry = entries.find(e => e._id.toString() === result.id);
            if (!entry) continue;

            entry.score = Math.max(0, Math.min(100, result.score));
            entry.touchpoints.push({
                type: 'custom',
                details: `🤖 AI Qualified: ${result.qualification} (${result.score}) — ${result.reasoning}`,
                timestamp: new Date(),
                studioRef: 'funnelStudio',
            });
            if (result.leadType && result.leadType !== 'unknown' && !entry.tags.includes(`type:${result.leadType}`)) {
                entry.tags.push(`type:${result.leadType}`);
            }
            if (!entry.tags.includes(`qualified:${result.qualification}`)) {
                // Remove old qualification tags
                entry.tags = entry.tags.filter(t => !t.startsWith('qualified:'));
                entry.tags.push(`qualified:${result.qualification}`);
            }
            await entry.save();
            updated++;
        }

        const summary = {
            hot: qualifiedResults.filter(r => r.qualification === 'hot').length,
            warm: qualifiedResults.filter(r => r.qualification === 'warm').length,
            cold: qualifiedResults.filter(r => r.qualification === 'cold').length,
            unqualified: qualifiedResults.filter(r => r.qualification === 'unqualified').length,
        };

        res.json({ success: true, qualified: updated, summary, results: qualifiedResults, source: usedAI ? 'ai' : 'rules' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #7 SMART LEAD ROUTING — AI routes leads to optimal stage
// ═══════════════════════════════════════════════════════════════

router.post('/:funnelId/smart-route', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { entryIds, autoApply = false } = req.body;
        const filter = { funnel: funnel._id, status: 'active' };
        if (entryIds?.length) filter._id = { $in: entryIds };

        const entries = await FunnelEntry.find(filter).limit(100);
        if (entries.length === 0) return res.json({ success: true, routed: 0, suggestions: [] });

        const stages = funnel.stages;
        const stageNames = stages.map(s => s.name);

        // Rule-based smart routing
        const suggestions = entries.map(entry => {
            const currentIdx = stageNames.indexOf(entry.currentStage);
            let suggestedStage = entry.currentStage;
            let reason = '';

            // High score → advance
            if (entry.score >= 80 && currentIdx < stageNames.length - 2) {
                suggestedStage = stageNames[currentIdx + 1];
                reason = `High score (${entry.score}) — ready to advance`;
            }
            // Very high score → skip to decision
            else if (entry.score >= 90 && currentIdx < stageNames.length - 1) {
                const decisionStage = stages.find(s => s.type === 'decision');
                if (decisionStage) {
                    suggestedStage = decisionStage.name;
                    reason = `Very high score (${entry.score}) — fast-track to decision`;
                }
            }
            // Very low score and advanced stage → pull back
            else if (entry.score < 20 && currentIdx > 1) {
                suggestedStage = stageNames[1];
                reason = `Low score (${entry.score}) in advanced stage — needs re-nurturing`;
            }
            // High engagement but wrong stage
            else if (entry.touchpoints?.length >= 5 && currentIdx === 0) {
                suggestedStage = stageNames[Math.min(2, stageNames.length - 1)];
                reason = `High engagement (${entry.touchpoints.length} touchpoints) — should be further in funnel`;
            }
            // Has email + phone + company → likely qualified
            else if (entry.email && entry.phone && entry.company && currentIdx < 2) {
                suggestedStage = stageNames[Math.min(2, stageNames.length - 1)];
                reason = `Complete profile (email, phone, company) — likely qualified`;
            }

            return {
                entryId: entry._id.toString(),
                entryName: entry.name,
                currentStage: entry.currentStage,
                suggestedStage,
                shouldMove: suggestedStage !== entry.currentStage,
                reason,
                score: entry.score,
            };
        }).filter(s => s.shouldMove);

        // Auto-apply if requested
        let applied = 0;
        if (autoApply && suggestions.length > 0) {
            for (const suggestion of suggestions) {
                const entry = entries.find(e => e._id.toString() === suggestion.entryId);
                if (!entry) continue;

                const currentHistory = entry.stageHistory[entry.stageHistory.length - 1];
                if (currentHistory) currentHistory.exitedAt = new Date();
                entry.stageHistory.push({ stage: suggestion.suggestedStage, enteredAt: new Date(), movedBy: 'ai' });
                entry.currentStage = suggestion.suggestedStage;
                entry.touchpoints.push({
                    type: 'custom',
                    details: `🧠 Smart Route: "${suggestion.currentStage}" → "${suggestion.suggestedStage}" — ${suggestion.reason}`,
                    timestamp: new Date(),
                });
                await entry.save();
                applied++;

                // Fire stage_changed automation
                runAutomationRules(funnel._id, 'stage_changed', {
                    entryId: entry._id,
                    fromStage: suggestion.currentStage,
                    toStage: suggestion.suggestedStage,
                }).catch(() => {});
            }
        }

        res.json({ success: true, routed: applied, suggestions, total: suggestions.length });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #8 CONVERSATIONAL NURTURE — AI-personalized follow-ups
// ═══════════════════════════════════════════════════════════════

router.post('/:funnelId/ai-nurture', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { entryId, channel = 'email', customPrompt } = req.body;
        if (!entryId) return res.status(400).json({ success: false, error: 'entryId required' });

        const entry = await FunnelEntry.findOne({ _id: entryId, funnel: funnel._id });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        // Brand context
        let brandContext = '';
        let brandName = 'Your Brand';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandName = brand.name;
            brandContext = `Brand: ${brand.name}\nIndustry: ${brand.industry || 'General'}\nVoice: ${brand.voice?.tone || 'Professional'}\nDescription: ${brand.tagline || brand.description || ''}`;
        }

        // Lead context
        const stageInfo = funnel.stages.find(s => s.name === entry.currentStage);
        const recentTouchpoints = (entry.touchpoints || []).slice(-5).map(tp => tp.details).join('\n');

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are a ${brandName} relationship manager. Write a personalized ${channel} follow-up for this lead.

${brandContext}

LEAD CONTEXT:
- Name: ${entry.name}
- Company: ${entry.company || 'Unknown'}
- Source: ${entry.source}
- Score: ${entry.score}/100
- Current Stage: ${entry.currentStage} (${stageInfo?.type || 'custom'}) — ${stageInfo?.description || ''}
- Tags: ${entry.tags?.join(', ') || 'none'}
- Recent Activity: ${recentTouchpoints || 'None'}

${customPrompt ? `SPECIFIC INSTRUCTIONS: ${customPrompt}` : ''}

Write a concise, personalized ${channel === 'email' ? 'email' : 'message'} that:
1. Acknowledges them by name
2. References their specific context/interests
3. Provides genuine value (insight, offer, or next step)
4. Has a clear but soft CTA
5. Matches the brand voice

Respond with JSON: { "subject": "email subject (if email)", "body": "the message" }`,
            maxTokens: 800,
            temperature: 0.7,
        });

        let messageData;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            messageData = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            messageData = { subject: 'Follow-up', body: result.text };
        }

        // Send if email and entry has email
        let sent = false;
        if (channel === 'email' && entry.email) {
            try {
                const html = `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px 24px; text-align: center;">
                            <h2 style="margin: 0; font-size: 20px; color: #fff;">${messageData.subject}</h2>
                        </div>
                        <div style="padding: 28px 24px;">
                            <div style="font-size: 15px; line-height: 1.7; color: #cbd5e1; white-space: pre-wrap;">${messageData.body}</div>
                        </div>
                        <div style="padding: 14px 24px; background: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                            <p style="margin: 0; font-size: 11px; color: #475569;">${brandName}</p>
                        </div>
                    </div>
                `;
                await sendEmail({ to: entry.email, subject: messageData.subject, html });
                sent = true;
            } catch (err) {
                console.warn('AI nurture email failed:', err.message);
            }
        }

        // Log touchpoint
        entry.touchpoints.push({
            type: channel === 'email' ? 'email_click' : 'dm_sent',
            details: `🤖 AI Nurture ${sent ? 'sent' : 'generated'}: "${messageData.subject || messageData.body?.substring(0, 50)}"`,
            timestamp: new Date(),
            studioRef: 'funnelStudio',
        });
        entry.score = Math.min(100, (entry.score || 0) + 3); // Slight score bump for interaction
        await entry.save();

        res.json({ success: true, message: messageData, sent, channel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #9 CROSS-STUDIO AUTO-TRIGGER
// ═══════════════════════════════════════════════════════════════

router.post('/:funnelId/cross-studio-suggest', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Analyze funnel state and suggest studio actions
        const stageCounts = {};
        for (const stage of funnel.stages) {
            stageCounts[stage.name] = await FunnelEntry.countDocuments({
                funnel: funnel._id, currentStage: stage.name, status: 'active',
            });
        }

        const [convertedCount, lostCount, totalCount] = await Promise.all([
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'converted' }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'lost' }),
            FunnelEntry.countDocuments({ funnel: funnel._id }),
        ]);

        const suggestions = [];

        // Awareness stage heavy → create awareness content
        const awarenessStage = funnel.stages.find(s => s.type === 'awareness');
        if (awarenessStage && stageCounts[awarenessStage.name] > 10) {
            suggestions.push({
                studio: 'contentStudio',
                action: 'generate_awareness_content',
                title: `Create awareness content for ${stageCounts[awarenessStage.name]} leads in "${awarenessStage.name}"`,
                description: 'Generate blog posts, social content, and educational material to move awareness leads to the interest stage',
                icon: 'edit_note',
                urgency: 'medium',
            });
        }

        // Decision stage heavy → create comparison/offer content
        const decisionStage = funnel.stages.find(s => s.type === 'decision');
        if (decisionStage && stageCounts[decisionStage.name] > 5) {
            suggestions.push({
                studio: 'contentStudio',
                action: 'generate_decision_content',
                title: `Create decision-stage content for ${stageCounts[decisionStage.name]} hot leads`,
                description: 'Generate comparison guides, case studies, testimonials, and offers to close these leads',
                icon: 'description',
                urgency: 'high',
            });
        }

        // High lost count → create retargeting ads
        if (lostCount > 5) {
            suggestions.push({
                studio: 'performanceMarketing',
                action: 'create_retargeting_campaign',
                title: `Win back ${lostCount} lost leads with retargeting`,
                description: 'Create retargeting ad campaigns to re-engage lost leads and bring them back into the funnel',
                icon: 'campaign',
                urgency: 'high',
            });
        }

        // Low conversion → suggest creative assets
        const conversionRate = totalCount > 0 ? Math.round((convertedCount / totalCount) * 100) : 0;
        if (conversionRate < 15 && totalCount > 10) {
            suggestions.push({
                studio: 'creativeStudio',
                action: 'generate_conversion_creatives',
                title: `Boost ${conversionRate}% conversion rate with better creatives`,
                description: 'Generate eye-catching ad creatives, social posts, and email banners to improve conversion',
                icon: 'palette',
                urgency: 'medium',
            });
        }

        // SEO opportunity
        const seoLeads = await FunnelEntry.countDocuments({ funnel: funnel._id, source: 'seo' });
        if (seoLeads < totalCount * 0.1 && totalCount > 10) {
            suggestions.push({
                studio: 'seoStudio',
                action: 'keyword_research',
                title: `Only ${seoLeads} leads from SEO — optimize organic discovery`,
                description: 'Run keyword research and create SEO-optimized content to increase organic lead flow',
                icon: 'search',
                urgency: 'medium',
            });
        }

        // Social engagement
        suggestions.push({
            studio: 'brainstormStudio',
            action: 'social_content_strategy',
            title: 'Generate social content strategy for lead capture',
            description: 'Create a content calendar with lead magnets and engagement posts across social channels including LinkedIn',
            icon: 'auto_awesome',
            urgency: 'low',
        });

        res.json({ success: true, suggestions, funnelMetrics: { stageCounts, conversionRate, totalCount, lostCount } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #10 CSV/EXCEL IMPORT — Bulk lead upload
// ═══════════════════════════════════════════════════════════════

router.post('/:funnelId/import-csv', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { leads, stage, source = 'manual' } = req.body;

        if (!leads || !Array.isArray(leads) || leads.length === 0) {
            return res.status(400).json({ success: false, error: 'leads array is required. Each lead should have at least name or email.' });
        }

        if (leads.length > 500) {
            return res.status(400).json({ success: false, error: 'Maximum 500 leads per import' });
        }

        const targetStage = stage || funnel.stages[0]?.name || 'Top';
        const validSources = ['ad', 'seo', 'social', 'dm', 'direct', 'referral', 'email', 'shopify', 'linkedin', 'website', 'telephonic', 'manual', 'other'];
        const leadSource = validSources.includes(source) ? source : 'manual';

        const results = { imported: 0, skipped: 0, duplicates: 0, errors: [] };

        for (const lead of leads) {
            try {
                // Skip if no name and no email
                if (!lead.name && !lead.email) {
                    results.skipped++;
                    continue;
                }

                // Check duplicate by email
                if (lead.email) {
                    const existing = await FunnelEntry.findOne({
                        funnel: funnel._id,
                        email: lead.email.toLowerCase().trim(),
                    });
                    if (existing) {
                        results.duplicates++;
                        continue;
                    }
                }

                // Create entry
                const entry = await FunnelEntry.create({
                    funnel: funnel._id,
                    user: req.user._id,
                    brand: funnel.brand,
                    name: (lead.name || lead.email?.split('@')[0] || 'Unknown').trim(),
                    email: (lead.email || '').toLowerCase().trim(),
                    phone: (lead.phone || '').trim(),
                    company: (lead.company || '').trim(),
                    source: lead.source || leadSource,
                    sourceCampaign: (lead.campaign || lead.sourceCampaign || '').trim(),
                    currentStage: lead.stage || targetStage,
                    score: lead.score || 10,
                    dealValue: lead.dealValue || lead.deal_value || 0,
                    notes: (lead.notes || '').trim(),
                    tags: lead.tags || [],
                    stageHistory: [{ stage: lead.stage || targetStage, enteredAt: new Date(), movedBy: 'system' }],
                    touchpoints: [{ type: 'custom', details: 'Imported via CSV/bulk upload', timestamp: new Date() }],
                });

                // Create contact if email provided
                if (lead.email) {
                    await Contact.findOneAndUpdate(
                        { user: req.user._id, brand: funnel.brand, platform: lead.platform || 'website', platformUserId: lead.email.toLowerCase() },
                        {
                            $set: {
                                name: lead.name || lead.email.split('@')[0],
                                email: lead.email.toLowerCase(),
                                phone: lead.phone || '',
                            },
                            $addToSet: { funnelIds: funnel._id },
                        },
                        { upsert: true }
                    );
                }

                results.imported++;

                // Fire automation
                runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => {});

            } catch (leadErr) {
                results.errors.push({ lead: lead.name || lead.email, error: leadErr.message });
            }
        }

        res.json({
            success: true,
            ...results,
            message: `Imported ${results.imported} leads, ${results.duplicates} duplicates skipped, ${results.skipped} invalid skipped`,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;

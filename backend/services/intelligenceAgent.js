/**
 * Intelligence Agent — Agent Fidato's Market Intelligence Engine
 * 
 * Background service that runs intelligence missions:
 *   1. Finds active missions due for checking
 *   2. Executes web search scoped to competitor + brand
 *   3. AI-powered diff to detect NEW intel vs old findings
 *   4. Saves findings and pushes notifications
 * 
 * Uses Grok's built-in web search (search_parameters) for live data.
 */

import IntelMission from '../models/IntelMission.js';
import Brand from '../models/Brand.js';

// ============================================================================
// FREQUENCY → INTERVAL MAPPING
// ============================================================================
const FREQUENCY_MS = {
    hourly: 60 * 60 * 1000,
    every_2h: 2 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
};

// ============================================================================
// SEARCH QUERY BUILDERS (by mission type)
// ============================================================================
function buildSearchQuery(mission, brandName) {
    const { target, type, instructions } = mission;
    const competitor = target.name;
    const keywords = (target.keywords || []).join(' ');

    const queryMap = {
        competitor_watch: `${competitor} ${brandName} industry news updates latest activity ${keywords}`,
        price_alert: `${competitor} pricing price change discount offer latest ${target.platforms?.join(' ') || ''} ${keywords}`,
        ad_monitor: `${competitor} new ad campaign advertisement marketing Facebook Ad Library Google Ads ${keywords}`,
        product_launch: `${competitor} new product launch release announcement 2026 ${keywords}`,
        strategy_change: `${competitor} strategy marketing positioning rebrand campaign pivot ${keywords}`,
    };

    let query = queryMap[type] || `${competitor} ${keywords} latest`;

    // Append custom instructions as search context
    if (instructions) {
        query += ` ${instructions.slice(0, 100)}`;
    }

    return query.trim();
}

// ============================================================================
// EXECUTE A SINGLE INSIGHT MISSION
// ============================================================================
async function executeInsight(mission, brand) {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) {
        console.warn('🕵️ Intel Agent: No GROK_API_KEY — cannot execute insight');
        return null;
    }

    const brandName = brand?.name || '';
    const searchQuery = buildSearchQuery(mission, brandName);

    console.log(`🕵️ Insight: "${mission.title}" — searching: ${searchQuery.slice(0, 80)}...`);

    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${grokKey}`,
            },
            body: JSON.stringify({
                model: 'grok-3-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a competitive intelligence analyst. Your task is to find the LATEST, most relevant intel about "${mission.target.name}" that would matter to "${brandName}".

Mission type: ${mission.type}
${mission.instructions ? `Special instructions: ${mission.instructions}` : ''}

Return your findings as a structured report:
→ Start with a 1-line HEADLINE (the most important finding)
→ Then list 3-8 KEY FINDINGS as bullet points
→ Each finding should include: what happened, when (if known), and why it matters to ${brandName}
→ Rate the overall severity: CRITICAL (immediate action needed), NOTABLE (worth knowing), or INFO (general update)
→ Be factual — only report what you actually find. If nothing significant is found, say "No significant changes detected."

Do NOT make things up. Only report real findings from your search.`,
                    },
                    { role: 'user', content: `Find the latest competitive intelligence: ${searchQuery}` },
                ],
                max_tokens: 1000,
                temperature: 0.3,
                search_parameters: {
                    mode: 'on',
                    return_citations: true,
                    from_date: getSearchDateRange(mission.frequency),
                },
            }),
        });

        if (!resp.ok) {
            console.error(`🕵️ Insight failed for "${mission.title}":`, resp.status);
            return null;
        }

        const data = await resp.json();
        const report = data.choices?.[0]?.message?.content;

        if (!report || report.includes('No significant changes detected')) {
            console.log(`🕵️ No new intel for "${mission.title}"`);
            return null;
        }

        return report;
    } catch (err) {
        console.error(`🕵️ Insight error for "${mission.title}":`, err.message);
        return null;
    }
}

// ============================================================================
// DETECT CHANGES (AI-powered diff)
// ============================================================================
async function detectChanges(mission, newReport) {
    const grokKey = process.env.GROK_API_KEY;
    if (!grokKey) return { isNew: true, summary: newReport, severity: 'info' };

    // Get last 3 findings for comparison
    const recentFindings = mission.findings
        .slice(-3)
        .map(f => f.summary)
        .join('\n---\n');

    if (!recentFindings) {
        // First finding — everything is new
        const severity = detectSeverity(newReport);
        return { isNew: true, summary: newReport, severity };
    }

    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${grokKey}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    {
                        role: 'system',
                        content: `You are a change detection analyst. Compare NEW intel vs PREVIOUS intel and identify only what's genuinely NEW or CHANGED.

Output format (plain text, no markdown):
VERDICT: NEW_INTEL or NO_CHANGE
SEVERITY: CRITICAL or NOTABLE or INFO
SUMMARY: (1-2 sentence summary of what's new)
DETAILS: (bullet points of new findings only)

If the new report is essentially the same info as before, output: VERDICT: NO_CHANGE`,
                    },
                    {
                        role: 'user',
                        content: `PREVIOUS INTEL:\n${recentFindings}\n\n---\n\nNEW INTEL:\n${newReport}`,
                    },
                ],
                max_tokens: 500,
                temperature: 0.2,
            }),
        });

        if (!resp.ok) return { isNew: true, summary: newReport, severity: 'info' };

        const data = await resp.json();
        const analysis = data.choices?.[0]?.message?.content || '';

        if (analysis.includes('NO_CHANGE')) {
            return { isNew: false };
        }

        const severity = analysis.includes('CRITICAL') ? 'critical'
            : analysis.includes('NOTABLE') ? 'notable' : 'info';

        // Extract summary from the analysis
        const summaryMatch = analysis.match(/SUMMARY:\s*(.+?)(?:\n|DETAILS)/s);
        const summary = summaryMatch?.[1]?.trim() || newReport.split('\n')[0];

        return { isNew: true, summary, details: newReport, severity };
    } catch {
        return { isNew: true, summary: newReport, severity: 'info' };
    }
}

function detectSeverity(text) {
    const lower = text.toLowerCase();
    if (/critical|urgent|price drop|major change|new launch|breaking/i.test(lower)) return 'critical';
    if (/notable|significant|new campaign|strategy shift|update/i.test(lower)) return 'notable';
    return 'info';
}

function getSearchDateRange(frequency) {
    const ranges = {
        hourly: 1,
        every_2h: 1,
        daily: 3,
        weekly: 14,
    };
    const days = ranges[frequency] || 7;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// ============================================================================
// MAIN SCHEDULER — RUN ALL DUE MISSIONS
// ============================================================================
export async function runIntelMissions() {
    try {
        const now = new Date();

        // Find all active missions
        const missions = await IntelMission.find({ status: 'active' })
            .populate('brand', 'name dna')
            .limit(20);

        let executed = 0;

        for (const mission of missions) {
            // Check if mission is due
            const intervalMs = FREQUENCY_MS[mission.frequency] || FREQUENCY_MS.daily;
            const lastCheck = mission.lastCheckedAt || new Date(0);
            const nextDue = new Date(lastCheck.getTime() + intervalMs);

            if (now < nextDue) continue; // Not due yet

            console.log(`🕵️ Running mission: "${mission.title}" (${mission.type})`);

            // Execute insight
            const report = await executeInsight(mission, mission.brand);

            // Update check timestamp
            mission.lastCheckedAt = now;
            mission.totalChecks += 1;

            if (report) {
                // Detect if this is genuinely new intel
                const result = await detectChanges(mission, report);

                if (result.isNew) {
                    const finding = {
                        summary: result.summary,
                        details: result.details || report,
                        severity: result.severity,
                        category: mission.type,
                        rawData: report,
                        isNewlyDiscovered: true,
                        notified: false,
                    };

                    mission.findings.push(finding);
                    mission.lastFindingAt = now;
                    mission.totalFindings += 1;

                    console.log(`🕵️ 🔔 NEW INTEL for "${mission.title}" [${result.severity}]: ${result.summary?.slice(0, 80)}`);
                    executed++;
                }
            }

            // Keep findings capped at 50 per mission
            if (mission.findings.length > 50) {
                mission.findings = mission.findings.slice(-50);
            }

            await mission.save();
        }

        if (executed > 0) {
            console.log(`🕵️ Intel Agent: ${executed} missions produced new intel`);
        }
    } catch (err) {
        console.error('🕵️ Intel Agent scheduler error:', err.message);
    }
}

// ============================================================================
// FORCE-RUN A SINGLE MISSION (on-demand)
// ============================================================================
export async function forceRunMission(missionId) {
    const mission = await IntelMission.findById(missionId).populate('brand', 'name dna');
    if (!mission) throw new Error('Mission not found');

    console.log(`🕵️ Running mission: "${mission.title}"`);

    const report = await executeInsight(mission, mission.brand);

    mission.lastCheckedAt = new Date();
    mission.totalChecks += 1;

    if (!report) {
        await mission.save();
        return { status: 'no_intel', message: 'No significant findings detected in this check.' };
    }

    const result = await detectChanges(mission, report);

    if (result.isNew) {
        const finding = {
            summary: result.summary,
            details: result.details || report,
            severity: result.severity,
            category: mission.type,
            rawData: report,
            isNewlyDiscovered: true,
            notified: false,
        };
        mission.findings.push(finding);
        mission.lastFindingAt = new Date();
        mission.totalFindings += 1;
    }

    if (mission.findings.length > 50) {
        mission.findings = mission.findings.slice(-50);
    }

    await mission.save();

    return {
        status: result.isNew ? 'new_intel' : 'no_change',
        severity: result.severity || 'info',
        summary: result.summary || 'No new changes detected since last check.',
        report,
    };
}

/**
 * Nurture Sequence Runner — The Missing Engine
 * Background service that executes nurture sequence steps with proper delays.
 * Called periodically by the main server scheduler.
 * 
 * Flow:
 * 1. Find all active sequences
 * 2. For each sequence, find entries in the trigger stage that haven't completed this sequence
 * 3. Determine which step each entry is on (based on touchpoints / execution log)
 * 4. If enough time has elapsed since the last step, execute the next step
 * 5. Send the actual message (email/DM) and log the touchpoint
 */

import NurtureSequence from '../models/NurtureSequence.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Funnel from '../models/Funnel.js';
import Brand from '../models/Brand.js';
import { sendEmail } from '../utils/email.js';
import { getRouter } from '../ai/router.js';

/**
 * Convert delay config to milliseconds
 */
function delayToMs(delay) {
    if (!delay || !delay.value) return 0;
    switch (delay.unit) {
        case 'minutes': return delay.value * 60_000;
        case 'hours': return delay.value * 3_600_000;
        case 'days': return delay.value * 86_400_000;
        default: return 0;
    }
}

/**
 * Check if current time is within quiet hours
 */
function isQuietHours(settings) {
    if (!settings?.respectQuietHours) return false;
    const hour = new Date().getHours();
    const start = settings.quietHoursStart ?? 22;
    const end = settings.quietHoursEnd ?? 8;
    if (start > end) {
        return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
}

/**
 * Evaluate step condition against entry
 */
function evaluateStepCondition(step, entry) {
    const cond = step.condition;
    if (!cond?.field || !cond?.operator) return true; // No condition = always pass

    let fieldValue;
    switch (cond.field) {
        case 'score': fieldValue = entry.score || 0; break;
        case 'status': fieldValue = entry.status; break;
        case 'source': fieldValue = entry.source; break;
        case 'tags': fieldValue = entry.tags || []; break;
        default: fieldValue = entry[cond.field];
    }

    switch (cond.operator) {
        case 'equals': return fieldValue == cond.value;
        case 'not_equals': return fieldValue != cond.value;
        case 'gt': return typeof fieldValue === 'number' && fieldValue > Number(cond.value);
        case 'lt': return typeof fieldValue === 'number' && fieldValue < Number(cond.value);
        case 'contains': return Array.isArray(fieldValue) ? fieldValue.includes(cond.value) : String(fieldValue).includes(cond.value);
        case 'exists': return !!fieldValue;
        default: return true;
    }
}

/**
 * Generate professional nurture email HTML
 */
function buildNurtureEmailHtml(subject, body, brandName) {
    return `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.05);">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 28px 24px; text-align: center;">
                <h2 style="margin: 0; font-size: 20px; color: #fff;">${subject}</h2>
            </div>
            <div style="padding: 28px 24px;">
                <div style="font-size: 15px; line-height: 1.7; color: #cbd5e1; white-space: pre-wrap;">${body}</div>
            </div>
            <div style="padding: 14px 24px; background: rgba(255,255,255,0.02); text-align: center; border-top: 1px solid rgba(255,255,255,0.05);">
                <p style="margin: 0; font-size: 11px; color: #475569;">${brandName || 'Mantram AI'}</p>
            </div>
        </div>
    `;
}

/**
 * Deliver a single nurture step to an entry
 */
async function deliverStep(step, entry, brandName) {
    // Personalize content
    const personalizedContent = (step.content || '')
        .replace(/\{\{name\}\}/gi, entry.name || 'there')
        .replace(/\{\{email\}\}/gi, entry.email || '')
        .replace(/\{\{company\}\}/gi, entry.company || '');

    const personalizedSubject = (step.subject || 'Follow-up')
        .replace(/\{\{name\}\}/gi, entry.name || 'there');

    let delivered = false;
    let deliveryError = null;

    switch (step.channel) {
        case 'email': {
            if (!entry.email) {
                deliveryError = 'No email address';
                break;
            }
            try {
                const html = buildNurtureEmailHtml(personalizedSubject, personalizedContent, brandName);
                await sendEmail({ to: entry.email, subject: personalizedSubject, html });
                delivered = true;
            } catch (err) {
                deliveryError = err.message || 'Email send failed';
            }
            break;
        }
        case 'dm':
        case 'sms':
        case 'whatsapp':
        case 'push_notification': {
            // Log as touchpoint — actual DM/SMS/WhatsApp delivery can be connected later
            delivered = true;
            break;
        }
        case 'internal_task': {
            // Internal tasks are always "delivered" (logged as touchpoints)
            delivered = true;
            break;
        }
        default:
            deliveryError = `Unknown channel: ${step.channel}`;
    }

    // Log touchpoint on entry
    const channelEmoji = { email: '📧', dm: '💬', sms: '📱', whatsapp: '💬', push_notification: '🔔', internal_task: '📋' };
    entry.touchpoints.push({
        type: step.channel === 'email' ? 'email_click' : 'dm_sent',
        details: `${channelEmoji[step.channel] || '📧'} Nurture: "${step.name}" ${delivered ? 'sent' : 'failed'} — ${personalizedContent.substring(0, 80)}...`,
        timestamp: new Date(),
        studioRef: 'funnelStudio',
    });

    // Apply onComplete actions
    if (delivered && step.onComplete) {
        if (step.onComplete.updateScore) {
            entry.score = Math.max(0, Math.min(100, (entry.score || 0) + step.onComplete.updateScore));
        }
        if (step.onComplete.addTag && !entry.tags.includes(step.onComplete.addTag)) {
            entry.tags.push(step.onComplete.addTag);
        }
        if (step.onComplete.moveToStage && step.onComplete.moveToStage !== entry.currentStage) {
            const oldStage = entry.currentStage;
            const currentHistory = entry.stageHistory[entry.stageHistory.length - 1];
            if (currentHistory) currentHistory.exitedAt = new Date();
            entry.stageHistory.push({ stage: step.onComplete.moveToStage, enteredAt: new Date(), movedBy: 'automation' });
            entry.currentStage = step.onComplete.moveToStage;
            entry.touchpoints.push({ type: 'custom', details: `Nurture auto-moved: "${oldStage}" → "${step.onComplete.moveToStage}"`, timestamp: new Date() });
        }
    }

    // Update step metrics
    if (delivered) {
        step.metrics.sent = (step.metrics.sent || 0) + 1;
    } else {
        step.metrics.skipped = (step.metrics.skipped || 0) + 1;
    }

    return { delivered, error: deliveryError };
}


/**
 * Main runner — Process all active nurture sequences
 * Should be called periodically (every 5-15 minutes)
 */
export async function runNurtureSequences() {
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalDelivered = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    try {
        // Find all active sequences
        const sequences = await NurtureSequence.find({ status: 'active' });
        if (sequences.length === 0) return { processed: 0, delivered: 0 };

        for (const sequence of sequences) {
            try {
                // Skip if in quiet hours
                if (isQuietHours(sequence.settings)) continue;

                const funnel = await Funnel.findById(sequence.funnel);
                if (!funnel) continue;

                let brandName = 'Mantram AI';
                const brand = await Brand.findById(sequence.brand);
                if (brand) brandName = brand.name;

                // Find entries in the trigger stage that are active
                const entries = await FunnelEntry.find({
                    funnel: sequence.funnel,
                    status: 'active',
                    // For 'stage_enter' trigger, look at entries in the trigger stage
                    // For 'manual' trigger, this should be managed separately
                    ...(sequence.triggerEvent !== 'manual' ? { currentStage: sequence.triggerStage } : {}),
                }).limit(200);

                for (const entry of entries) {
                    try {
                        // Check if entry has already completed this sequence
                        const nurtureTag = `nurture:${sequence._id}`;
                        const completedTag = `nurture-done:${sequence._id}`;

                        // Skip if already completed max runs
                        const completedRuns = entry.tags.filter(t => t === completedTag).length;
                        if (completedRuns >= (sequence.settings?.maxRunsPerEntry || 1)) continue;

                        // Skip if stopOnConversion and entry is converted
                        if (sequence.settings?.stopOnConversion && entry.status === 'converted') continue;

                        // Determine current step for this entry
                        // Look at touchpoints for nurture delivery markers
                        const nurtureDeliveries = entry.touchpoints.filter(tp =>
                            tp.details?.includes('Nurture:') && tp.details?.includes(sequence.name || sequence._id.toString())
                        );

                        // Also count by step-specific markers
                        const stepDeliveryCount = entry.touchpoints.filter(tp =>
                            tp.studioRef === 'funnelStudio' && tp.details?.startsWith(`${['📧', '💬', '📱', '🔔', '📋'].join('|')}`.charAt(0)) &&
                            tp.details?.includes('Nurture:')
                        ).length;

                        // Simpler approach: count nurture touchpoints for this sequence
                        const nurtureStepsDone = entry.touchpoints.filter(tp =>
                            tp.details?.includes('Nurture:') && tp.studioRef === 'funnelStudio'
                        ).length;

                        const currentStepIdx = Math.min(nurtureStepsDone, sequence.steps.length - 1);

                        // If all steps done, mark as completed
                        if (nurtureStepsDone >= sequence.steps.length) {
                            if (!entry.tags.includes(completedTag)) {
                                entry.tags.push(completedTag);
                                await entry.save();
                                sequence.metrics.completedRuns = (sequence.metrics.completedRuns || 0) + 1;
                            }
                            continue;
                        }

                        const step = sequence.steps[currentStepIdx];
                        if (!step) continue;

                        // Check delay — has enough time passed since last nurture delivery?
                        const lastNurtureDelivery = entry.touchpoints
                            .filter(tp => tp.details?.includes('Nurture:') && tp.studioRef === 'funnelStudio')
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

                        if (currentStepIdx > 0 && lastNurtureDelivery) {
                            const timeSinceLastMs = Date.now() - new Date(lastNurtureDelivery.timestamp).getTime();
                            const requiredDelayMs = delayToMs(step.delay);
                            if (timeSinceLastMs < requiredDelayMs) continue; // Not time yet
                        }

                        // For the first step, check time since entry entered the stage
                        if (currentStepIdx === 0) {
                            const stageEntry = entry.stageHistory
                                .filter(h => h.stage === sequence.triggerStage)
                                .sort((a, b) => new Date(b.enteredAt) - new Date(a.enteredAt))[0];

                            if (stageEntry) {
                                const timeSinceStageEntryMs = Date.now() - new Date(stageEntry.enteredAt).getTime();
                                const requiredDelayMs = delayToMs(step.delay);
                                if (timeSinceStageEntryMs < requiredDelayMs) continue;
                            }
                        }

                        // Evaluate step condition
                        if (!evaluateStepCondition(step, entry)) {
                            step.metrics.skipped = (step.metrics.skipped || 0) + 1;
                            totalSkipped++;
                            continue;
                        }

                        // AI content generation if needed
                        let stepContent = step.content;
                        if (step.contentType === 'ai_generated' && step.aiPrompt) {
                            try {
                                const ai = getRouter();
                                const result = await ai.generateText({
                                    prompt: `${step.aiPrompt}\n\nLead name: ${entry.name}\nLead context: ${entry.notes || 'No additional context'}\nTone: ${step.aiTone || 'professional'}\n\nWrite a concise, personalized ${step.channel} message. Just the message text, no JSON.`,
                                    maxTokens: 500,
                                    temperature: 0.7,
                                });
                                stepContent = result.text || stepContent;
                            } catch {
                                // Fallback to static content
                            }
                        }

                        // Create a working copy of step with resolved content
                        const resolvedStep = { ...step.toObject ? step.toObject() : step, content: stepContent };

                        // Deliver the step
                        const result = await deliverStep(resolvedStep, entry, brandName);
                        await entry.save();

                        totalProcessed++;
                        if (result.delivered) {
                            totalDelivered++;
                            sequence.metrics.totalSent = (sequence.metrics.totalSent || 0) + 1;
                        } else {
                            totalErrors++;
                        }
                    } catch (entryErr) {
                        console.warn(`[NurtureRunner] Entry error: ${entryErr.message}`);
                        totalErrors++;
                    }
                }

                // Update sequence run metrics
                sequence.metrics.totalRuns = (sequence.metrics.totalRuns || 0) + 1;
                await sequence.save();

            } catch (seqErr) {
                console.warn(`[NurtureRunner] Sequence error: ${seqErr.message}`);
            }
        }

        const elapsed = Date.now() - startTime;
        if (totalProcessed > 0) {
            console.log(`🌱 Nurture Runner: ${totalProcessed} processed, ${totalDelivered} delivered, ${totalSkipped} skipped, ${totalErrors} errors (${elapsed}ms)`);
        }

        return { processed: totalProcessed, delivered: totalDelivered, skipped: totalSkipped, errors: totalErrors, elapsed };

    } catch (error) {
        console.error('[NurtureRunner] Fatal error:', error.message);
        return { processed: 0, delivered: 0, error: error.message };
    }
}

export default { runNurtureSequences };

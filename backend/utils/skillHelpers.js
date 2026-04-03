/**
 * Skill Helpers — Shared utilities for skill operations
 * Separated from routes to avoid circular import issues
 */

import User from '../models/User.js';
import Skill from '../models/Skill.js';

/**
 * Load instructions from a user's active skills for injection into system prompts.
 * Used by Fidato chat to implement persistent behavioral skills (Model A).
 * @param {string} userId - The user's MongoDB _id
 * @returns {string} Concatenated skill instructions or empty string
 */
export async function loadActiveSkillInstructions(userId) {
    try {
        const user = await User.findById(userId).lean();
        const activeIds = user?.activeSkills || [];
        if (activeIds.length === 0) return '';

        const skills = await Skill.find({ _id: { $in: activeIds }, status: 'active' })
            .select('name instructions systemPrompt')
            .lean();

        if (skills.length === 0) return '';

        const blocks = skills.map(s => {
            const parts = [`### Active Skill: ${s.name}`];
            if (s.systemPrompt) parts.push(`Role: ${s.systemPrompt}`);
            parts.push(s.instructions);
            return parts.join('\n');
        });

        return blocks.join('\n\n---\n\n');
    } catch (e) {
        console.warn('loadActiveSkillInstructions error:', e.message);
        return '';
    }
}

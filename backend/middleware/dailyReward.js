/**
 * Daily Reward Middleware — tracks login streaks and awards bonus credits
 * 
 * Attach to any frequently-hit authenticated route (e.g. /api/credits/balance)
 * to track daily logins without adding a dedicated endpoint.
 * 
 * Rewards:
 *   - 2 credits per day (login)
 *   - +5 bonus at 7-day streak
 *   - +25 bonus at 30-day streak
 *   - Max ~86 free credits/month from login alone
 */

import User from '../models/User.js';

export async function trackDailyLogin(req, res, next) {
    try {
        const user = req.user;
        if (!user) return next();

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Already logged in today — skip
        if (user.lastLoginDate === today) return next();

        // Calculate streak
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        let newStreak;
        if (user.lastLoginDate === yesterdayStr) {
            // Consecutive day — increment streak
            newStreak = (user.streak || 0) + 1;
        } else {
            // Streak broken — start fresh
            newStreak = 1;
        }

        // Calculate bonus
        let dailyReward = 2; // Base daily credit
        let streakBonus = 0;
        let streakMessage = '';

        if (newStreak === 7) {
            streakBonus = 5;
            streakMessage = '🔥 7-day streak! +5 bonus credits';
        } else if (newStreak === 30) {
            streakBonus = 25;
            streakMessage = '🏆 30-day streak! +25 bonus credits';
        } else if (newStreak % 30 === 0) {
            streakBonus = 25;
            streakMessage = `🏆 ${newStreak}-day streak! +25 bonus credits`;
        } else if (newStreak % 7 === 0) {
            streakBonus = 5;
            streakMessage = `🔥 ${newStreak}-day streak! +5 bonus credits`;
        }

        const totalReward = dailyReward + streakBonus;

        // Update user
        await User.findByIdAndUpdate(user._id, {
            $set: { lastLoginDate: today, streak: newStreak },
            $inc: { 'credits.bonus': totalReward },
        });

        // Attach to request for frontend to display
        req.dailyReward = {
            awarded: true,
            credits: totalReward,
            streak: newStreak,
            message: streakMessage || `✨ Daily login reward: +${dailyReward} credits`,
        };

        console.log(`✨ Daily reward: ${user.email} → +${totalReward} credits (streak: ${newStreak})`);
    } catch (error) {
        // Never block the request for reward failures
        console.error('Daily reward error:', error.message);
    }

    next();
}

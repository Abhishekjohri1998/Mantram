/**
 * Team Management Routes
 * Members, Chat, Approvals, AI Intelligence
 */

import { Router } from 'express';
import nodemailer from 'nodemailer';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import TeamInvite from '../models/TeamInvite.js';
import TeamChat from '../models/TeamChat.js';
import ApprovalRequest from '../models/ApprovalRequest.js';
import env from '../config/env.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// Configure nodemailer transporter (same as waitlist)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: env.email.user,
        pass: env.email.pass
    }
});

// ═══════════════════════════════════════════════════════════════
// HELPER: Get the organization owner (team head)
// ═══════════════════════════════════════════════════════════════
function getOrgId(user) {
    return user.organization || user._id;
}

function isTeamAdmin(user) {
    return !user.organization || user.teamRole === 'owner' || user.teamRole === 'manager' || user.role === 'admin' || user.role === 'superadmin';
}

// ═══════════════════════════════════════════════════════════════
// GET /api/team/members — List team members
// ═══════════════════════════════════════════════════════════════
router.get('/members', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const members = await User.find({
            $or: [{ _id: orgId }, { organization: orgId }]
        }).select('-password').sort({ teamRole: 1, createdAt: 1 });

        // Fetch pending invites
        const invites = await TeamInvite.find({
            organization: orgId, status: 'pending'
        }).populate('invitedBy', 'name email');

        res.json({ members, invites, isAdmin: isTeamAdmin(req.user) });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/team/plan-limits — Current plan limits
// ═══════════════════════════════════════════════════════════════
router.get('/plan-limits', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const owner = await User.findById(orgId);
        const memberCount = await User.countDocuments({ organization: orgId });
        const brandCount = await Brand.countDocuments({ user: orgId });

        // Plan-based limits
        const limits = {
            starter: { maxTeamMembers: 3, maxBrands: 3 },
            professional: { maxTeamMembers: 10, maxBrands: 10 },
            enterprise: { maxTeamMembers: 50, maxBrands: 50 },
        };
        const planLimits = limits[owner?.plan] || limits.starter;

        res.json({
            plan: owner?.plan || 'starter',
            currentMembers: memberCount + 1, // +1 for owner
            maxMembers: planLimits.maxTeamMembers,
            currentBrands: brandCount,
            maxBrands: planLimits.maxBrands,
            canInvite: (memberCount + 1) < planLimits.maxTeamMembers,
        });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/team/invite — Send team invitation
// ═══════════════════════════════════════════════════════════════
router.post('/invite', protect, async (req, res) => {
    try {
        if (!isTeamAdmin(req.user)) {
            return res.status(403).json({ error: 'Only team admins can invite members' });
        }

        const { email, name, role = 'member', studioAccess = {}, brandAccess = [], message = '' } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const orgId = getOrgId(req.user);

        // Check plan limits
        const memberCount = await User.countDocuments({ organization: orgId });
        const owner = await User.findById(orgId);
        const limits = { starter: 3, professional: 10, enterprise: 50 };
        const maxMembers = limits[owner?.plan] || 3;
        if ((memberCount + 1) >= maxMembers) {
            return res.status(400).json({ error: `Team limit reached (${maxMembers} members on ${owner?.plan || 'starter'} plan). Upgrade to add more.` });
        }

        // Check if already invited or a member
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing && String(existing.organization) === String(orgId)) {
            return res.status(400).json({ error: 'This user is already on your team' });
        }
        const pendingInvite = await TeamInvite.findOne({ email: email.toLowerCase(), organization: orgId, status: 'pending' });
        if (pendingInvite) {
            return res.status(400).json({ error: 'An invite is already pending for this email' });
        }

        const invite = await TeamInvite.create({
            invitedBy: req.user._id,
            organization: orgId,
            email: email.toLowerCase(),
            name,
            role,
            studioAccess: {
                contentStudio: studioAccess.contentStudio !== false,
                creativeStudio: studioAccess.creativeStudio !== false,
                seoStudio: studioAccess.seoStudio ?? false,
                brainstormStudio: studioAccess.brainstormStudio ?? false,
                videoStudio: studioAccess.videoStudio ?? false,
                d2cAnalytics: studioAccess.d2cAnalytics ?? false,
                adStudio: studioAccess.adStudio ?? false,
                smartCalendar: studioAccess.smartCalendar ?? false,
                conversationStudio: studioAccess.conversationStudio ?? false,
            },
            brandAccess,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            message,
        });

        // Build invite link using production frontend URL
        const frontendBase = Array.isArray(env.frontendUrl) ? env.frontendUrl[env.frontendUrl.length - 1] : (env.frontendUrl || 'https://mantram.ai');
        const inviteLink = `${frontendBase}/join/${invite.token}`;

        // Send invite email
        const inviterName = req.user.name || 'Your teammate';
        const inviteMailOptions = {
            from: `"Mantram AI" <${env.email.user}>`,
            to: email.toLowerCase(),
            subject: `${inviterName} invited you to join their team on Mantram AI 🚀`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #e2e8f0; border-radius: 16px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px 24px; text-align: center;">
                        <h1 style="margin: 0; font-size: 24px; color: #fff;">You're Invited! 🎉</h1>
                        <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">${inviterName} wants you on their Mantram AI team</p>
                    </div>
                    <div style="padding: 32px 24px;">
                        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">Hi${name ? ` ${name}` : ''},</p>
                        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                            <strong style="color: #fff;">${inviterName}</strong> has invited you to join their team on <strong style="color: #818cf8;">Mantram AI</strong> as a <strong style="color: #fff;">${role}</strong>.
                        </p>
                        ${message ? `<div style="margin: 16px 0; padding: 12px 16px; background: rgba(99,102,241,0.1); border-left: 3px solid #6366f1; border-radius: 0 8px 8px 0;"><p style="margin: 0; font-size: 14px; color: #94a3b8; font-style: italic;">"${message}"</p></div>` : ''}
                        <div style="text-align: center; margin: 32px 0;">
                            <a href="${inviteLink}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-size: 16px; font-weight: 700; letter-spacing: 0.5px;">Accept Invitation</a>
                        </div>
                        <p style="font-size: 13px; color: #64748b; text-align: center;">This invitation expires in 7 days.</p>
                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.06); margin: 24px 0;" />
                        <p style="font-size: 12px; color: #475569; text-align: center;">
                            If the button doesn't work, copy and paste this link:<br/>
                            <a href="${inviteLink}" style="color: #818cf8; word-break: break-all;">${inviteLink}</a>
                        </p>
                    </div>
                    <div style="padding: 16px 24px; background: rgba(255,255,255,0.02); text-align: center;">
                        <p style="margin: 0; font-size: 11px; color: #475569;">Mantram AI — Your Brand Operating System</p>
                    </div>
                </div>
            `,
        };

        // Send email asynchronously (don't block the response)
        transporter.sendMail(inviteMailOptions).catch(err => console.error('Error sending team invite email:', err));

        res.json({
            success: true,
            invite,
            sentTo: email.toLowerCase(),
        });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/team/invite/:token — Validate invite (public, no auth)
// ═══════════════════════════════════════════════════════════════
router.get('/invite/:token', async (req, res) => {
    try {
        const invite = await TeamInvite.findOne({ token: req.params.token })
            .populate('invitedBy', 'name email avatar')
            .populate('organization', 'name');

        if (!invite) return res.status(404).json({ error: 'Invitation not found or already used' });
        if (invite.status !== 'pending') return res.status(400).json({ error: `This invitation has already been ${invite.status}` });
        if (invite.expiresAt < new Date()) {
            invite.status = 'expired';
            await invite.save();
            return res.status(400).json({ error: 'This invitation has expired' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: invite.email });

        // Get organization owner name
        const orgOwner = await User.findById(invite.organization).select('name');

        res.json({
            success: true,
            invite: {
                email: invite.email,
                name: invite.name,
                role: invite.role,
                message: invite.message,
                invitedBy: invite.invitedBy,
                teamName: orgOwner?.name ? `${orgOwner.name}'s Team` : 'the team',
                studioAccess: invite.studioAccess,
                expiresAt: invite.expiresAt,
                existingUser: !!existingUser,
            },
        });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// POST /api/team/accept-invite/:token — Accept invitation
// ═══════════════════════════════════════════════════════════════
router.post('/accept-invite/:token', async (req, res) => {
    try {
        const invite = await TeamInvite.findOne({ token: req.params.token, status: 'pending' });
        if (!invite) return res.status(404).json({ error: 'Invalid or expired invite' });
        if (invite.expiresAt < new Date()) {
            invite.status = 'expired';
            await invite.save();
            return res.status(400).json({ error: 'Invite has expired' });
        }

        const { name, password } = req.body;

        // Check if user exists
        let user = await User.findOne({ email: invite.email });
        if (user) {
            // Existing user — join team
            user.organization = invite.organization;
            user.teamRole = invite.role;
            user.role = 'team-member';
            user.studioAccess = invite.studioAccess;
            user.brandAccess = invite.brandAccess;
            await user.save();
        } else {
            // New user — create account
            if (!password || password.length < 6) {
                return res.status(400).json({ error: 'Password is required (min 6 characters)' });
            }
            user = await User.create({
                name: name || invite.name || invite.email.split('@')[0],
                email: invite.email,
                password,
                role: 'team-member',
                organization: invite.organization,
                teamRole: invite.role,
                studioAccess: invite.studioAccess,
                brandAccess: invite.brandAccess,
            });
        }

        // Add user to brand sharedWith arrays
        if (invite.brandAccess?.length > 0) {
            await Brand.updateMany(
                { _id: { $in: invite.brandAccess } },
                { $addToSet: { sharedWith: user._id } }
            );
        }

        invite.status = 'accepted';
        invite.acceptedAt = new Date();
        invite.acceptedBy = user._id;
        await invite.save();

        res.json({ success: true, message: 'Welcome to the team!' });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/team/members/:id/access — Update member permissions
// ═══════════════════════════════════════════════════════════════
router.put('/members/:id/access', protect, async (req, res) => {
    try {
        if (!isTeamAdmin(req.user)) {
            return res.status(403).json({ error: 'Only team admins can update permissions' });
        }

        const { studioAccess, brandAccess, teamRole } = req.body;
        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const orgId = getOrgId(req.user);
        if (String(member.organization) !== String(orgId) && String(member._id) !== String(orgId)) {
            return res.status(403).json({ error: 'Member is not in your team' });
        }

        if (studioAccess) member.studioAccess = { ...member.studioAccess?.toObject?.() || {}, ...studioAccess };
        if (brandAccess) member.brandAccess = brandAccess;
        if (teamRole && member.teamRole !== 'owner') member.teamRole = teamRole;

        await member.save();

        // Sync brand sharedWith
        if (brandAccess) {
            await Brand.updateMany({ user: orgId }, { $pull: { sharedWith: member._id } });
            if (brandAccess.length > 0) {
                await Brand.updateMany({ _id: { $in: brandAccess } }, { $addToSet: { sharedWith: member._id } });
            }
        }

        res.json({ success: true, member });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// PUT /api/team/members/:id/brands — Assign/unassign brands to member
// ═══════════════════════════════════════════════════════════════
router.put('/members/:id/brands', protect, async (req, res) => {
    try {
        if (!isTeamAdmin(req.user)) {
            return res.status(403).json({ error: 'Only team admins can assign brands' });
        }

        const { brandIds } = req.body; // array of brand ObjectIds
        if (!Array.isArray(brandIds)) {
            return res.status(400).json({ error: 'brandIds must be an array' });
        }

        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const orgId = getOrgId(req.user);
        if (String(member.organization) !== String(orgId) && String(member._id) !== String(orgId)) {
            return res.status(403).json({ error: 'Member is not in your team' });
        }

        // Update member's brand access
        member.brandAccess = brandIds;
        await member.save();

        // Sync brand sharedWith arrays
        await Brand.updateMany({ user: orgId }, { $pull: { sharedWith: member._id } });
        if (brandIds.length > 0) {
            await Brand.updateMany({ _id: { $in: brandIds } }, { $addToSet: { sharedWith: member._id } });
        }

        res.json({ success: true, member, assignedBrands: brandIds.length });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
// DELETE /api/team/members/:id — Remove member
// ═══════════════════════════════════════════════════════════════
router.delete('/members/:id', protect, async (req, res) => {
    try {
        if (!isTeamAdmin(req.user)) {
            return res.status(403).json({ error: 'Only team admins can remove members' });
        }

        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ error: 'Member not found' });

        const orgId = getOrgId(req.user);
        if (String(member._id) === String(orgId)) {
            return res.status(400).json({ error: 'Cannot remove the team owner' });
        }

        // Remove from brands
        await Brand.updateMany({ user: orgId }, { $pull: { sharedWith: member._id } });

        // Clear team fields
        member.organization = undefined;
        member.teamRole = '';
        member.role = 'user';
        member.studioAccess = undefined;
        member.brandAccess = [];
        await member.save();

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// DELETE /api/team/invites/:id — Revoke invite
// ═══════════════════════════════════════════════════════════════
router.delete('/invites/:id', protect, async (req, res) => {
    try {
        if (!isTeamAdmin(req.user)) return res.status(403).json({ error: 'Only team admins can revoke invites' });
        const invite = await TeamInvite.findById(req.params.id);
        if (!invite) return res.status(404).json({ error: 'Invite not found' });
        invite.status = 'revoked';
        await invite.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// CHAT — Real-time team messaging
// ═══════════════════════════════════════════════════════════════

// GET /api/team/chat/channels
router.get('/chat/channels', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const brands = await Brand.find({
            $or: [{ user: orgId }, { sharedWith: req.user._id }],
            status: { $ne: 'archived' },
        }).select('name dna.colors');

        const channels = [
            { id: 'general', name: 'General', type: 'general', icon: 'forum' },
            ...brands.map(b => ({
                id: `brand-${b._id}`, name: b.name, type: 'brand', brandId: b._id,
                icon: 'storefront', color: b.dna?.colors?.[0]?.hex || '#6366f1',
            })),
        ];

        // Get unread counts per channel
        for (const ch of channels) {
            const lastRead = await TeamChat.findOne({
                organization: orgId, channel: ch.id, 'readBy.user': req.user._id,
            }).sort({ createdAt: -1 });

            const query = { organization: orgId, channel: ch.id, deleted: { $ne: true } };
            if (lastRead) query.createdAt = { $gt: lastRead.createdAt };
            ch.unreadCount = await TeamChat.countDocuments(query);
        }

        // Get DM channels
        const dmMessages = await TeamChat.find({
            organization: orgId, channelType: 'dm',
            $or: [{ sender: req.user._id }, { channel: { $regex: req.user._id.toString() } }],
        }).sort({ createdAt: -1 }).limit(20).populate('sender', 'name avatar');

        const dmChannels = new Map();
        dmMessages.forEach(m => {
            if (!dmChannels.has(m.channel)) dmChannels.set(m.channel, m);
        });

        res.json({ channels, dmChannels: Array.from(dmChannels.values()) });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// GET /api/team/chat/:channelId/messages
router.get('/chat/:channelId/messages', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const { page = 1, limit = 50 } = req.query;
        const messages = await TeamChat.find({
            organization: orgId, channel: req.params.channelId, deleted: { $ne: true },
        })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('sender', 'name avatar email')
            .populate('replyTo', 'content sender');

        // Mark as read
        await TeamChat.updateMany(
            { organization: orgId, channel: req.params.channelId, 'readBy.user': { $ne: req.user._id } },
            { $addToSet: { readBy: { user: req.user._id, readAt: new Date() } } }
        );

        res.json({ messages: messages.reverse() });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// POST /api/team/chat/:channelId/send
router.post('/chat/:channelId/send', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const { content, messageType = 'text', attachments = [], replyTo } = req.body;
        if (!content && attachments.length === 0) return res.status(400).json({ error: 'Message content is required' });

        const channelType = req.params.channelId === 'general' ? 'general' :
            req.params.channelId.startsWith('brand-') ? 'brand' : 'dm';

        const message = await TeamChat.create({
            organization: orgId,
            channel: req.params.channelId,
            channelType,
            brandId: channelType === 'brand' ? req.params.channelId.replace('brand-', '') : undefined,
            sender: req.user._id,
            content,
            messageType,
            attachments,
            replyTo,
            readBy: [{ user: req.user._id }],
        });

        const populated = await message.populate('sender', 'name avatar email');

        // Emit via Socket.io if available
        if (req.app.get('io')) {
            req.app.get('io').to(`team:${orgId}`).emit('team:message', populated);
        }

        res.json({ message: populated });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// POST /api/team/chat/:channelId/react
router.post('/chat/:channelId/react', protect, async (req, res) => {
    try {
        const { messageId, emoji } = req.body;
        const msg = await TeamChat.findOne({ _id: messageId, organization: getOrgId(req.user) });
        if (!msg) return res.status(404).json({ error: 'Message not found' });

        const existing = msg.reactions.findIndex(r => String(r.user) === String(req.user._id) && r.emoji === emoji);
        if (existing >= 0) {
            msg.reactions.splice(existing, 1); // toggle off
        } else {
            msg.reactions.push({ emoji, user: req.user._id });
        }
        await msg.save();

        if (req.app.get('io')) {
            req.app.get('io').to(`team:${getOrgId(req.user)}`).emit('team:reaction', { messageId, reactions: msg.reactions });
        }

        res.json({ reactions: msg.reactions });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// APPROVALS — Content/Creative approval workflow
// ═══════════════════════════════════════════════════════════════

// POST /api/team/approvals — Create approval request
router.post('/approvals', protect, async (req, res) => {
    try {
        const { approverId, itemType, itemId, itemTitle, itemPreview, brandId, priority = 'normal', dueDate, message } = req.body;
        if (!approverId || !itemType || !itemId) {
            return res.status(400).json({ error: 'approverId, itemType, and itemId are required' });
        }

        const orgId = getOrgId(req.user);
        const approval = await ApprovalRequest.create({
            organization: orgId,
            brandId,
            requestedBy: req.user._id,
            approver: approverId,
            itemType,
            itemId,
            itemTitle: itemTitle || `${itemType} #${itemId.toString().slice(-6)}`,
            itemPreview,
            priority,
            dueDate,
            feedback: message ? [{ user: req.user._id, message, action: 'comment', createdAt: new Date() }] : [],
        });

        // Auto-share in team chat
        await TeamChat.create({
            organization: orgId,
            channel: brandId ? `brand-${brandId}` : 'general',
            channelType: brandId ? 'brand' : 'general',
            sender: req.user._id,
            content: `📋 Submitted "${itemTitle}" for approval`,
            messageType: 'approval-share',
            attachments: [{ type: itemType, refId: itemId, name: itemTitle, preview: itemPreview }],
            readBy: [{ user: req.user._id }],
        });

        if (req.app.get('io')) {
            req.app.get('io').to(`team:${orgId}`).emit('team:approval', approval);
        }

        res.json({ success: true, approval });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// GET /api/team/approvals — List approvals
router.get('/approvals', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const { status, mine } = req.query;
        const query = { organization: orgId };
        if (status) query.status = status;
        if (mine === 'true') query.approver = req.user._id;

        const approvals = await ApprovalRequest.find(query)
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('requestedBy', 'name avatar email')
            .populate('approver', 'name avatar email')
            .populate('feedback.user', 'name avatar');

        const stats = {
            pending: await ApprovalRequest.countDocuments({ organization: orgId, status: 'pending' }),
            approved: await ApprovalRequest.countDocuments({ organization: orgId, status: 'approved' }),
            rejected: await ApprovalRequest.countDocuments({ organization: orgId, status: 'rejected' }),
        };

        res.json({ approvals, stats });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// PUT /api/team/approvals/:id — Update approval (approve/reject/revision)
router.put('/approvals/:id', protect, async (req, res) => {
    try {
        const { action, message } = req.body; // action: approve, reject, revision, comment
        const approval = await ApprovalRequest.findOne({ _id: req.params.id, organization: getOrgId(req.user) });
        if (!approval) return res.status(404).json({ error: 'Approval not found' });

        if (String(approval.approver) !== String(req.user._id) && isTeamAdmin(req.user) === false) {
            return res.status(403).json({ error: 'Only the assigned approver or team admin can take action' });
        }

        const statusMap = { approve: 'approved', reject: 'rejected', revision: 'revision-requested' };
        if (statusMap[action]) {
            approval.status = statusMap[action];
            approval.resolvedAt = action !== 'revision' ? new Date() : undefined;
        }

        approval.feedback.push({
            user: req.user._id,
            message: message || `${action}d`,
            action: action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : action === 'revision' ? 'revision' : 'comment',
            createdAt: new Date(),
        });

        await approval.save();
        const populated = await approval.populate([
            { path: 'requestedBy', select: 'name avatar email' },
            { path: 'approver', select: 'name avatar email' },
            { path: 'feedback.user', select: 'name avatar' },
        ]);

        if (req.app.get('io')) {
            req.app.get('io').to(`team:${getOrgId(req.user)}`).emit('team:approval-update', populated);
        }

        res.json({ success: true, approval: populated });
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

// ═══════════════════════════════════════════════════════════════
// AI TEAM INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

// POST /api/team/ai/team-health — AI team productivity analysis
router.post('/ai/team-health', protect, async (req, res) => {
    try {
        const orgId = getOrgId(req.user);
        const members = await User.find({
            $or: [{ _id: orgId }, { organization: orgId }]
        }).select('name usage lastActive teamRole studioAccess');

        const approvalStats = {
            pending: await ApprovalRequest.countDocuments({ organization: orgId, status: 'pending' }),
            avgResolutionTime: 0, // could compute from resolvedAt - createdAt
        };

        const chatActivity = await TeamChat.countDocuments({
            organization: orgId,
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        });

        // Build analysis
        const analysis = {
            teamSize: members.length,
            activeThisWeek: members.filter(m => {
                const last = new Date(m.lastActive || 0);
                return (Date.now() - last.getTime()) < 7 * 24 * 60 * 60 * 1000;
            }).length,
            totalContent: members.reduce((s, m) => s + (m.usage?.contentGenerated || 0), 0),
            totalCreatives: members.reduce((s, m) => s + (m.usage?.creativesGenerated || 0), 0),
            chatMessages: chatActivity,
            pendingApprovals: approvalStats.pending,
            members: members.map(m => ({
                name: m.name,
                role: m.teamRole || 'owner',
                contentGenerated: m.usage?.contentGenerated || 0,
                creativesGenerated: m.usage?.creativesGenerated || 0,
                lastActive: m.lastActive,
                studios: Object.entries(m.studioAccess?.toObject?.() || {}).filter(([, v]) => v).map(([k]) => k),
            })),
            insights: [],
        };

        // Generate insights
        if (analysis.activeThisWeek < analysis.teamSize * 0.5) {
            analysis.insights.push({ type: 'warning', message: `Only ${analysis.activeThisWeek}/${analysis.teamSize} members were active this week. Consider a team check-in.`, icon: 'warning' });
        }
        if (approvalStats.pending > 5) {
            analysis.insights.push({ type: 'urgent', message: `${approvalStats.pending} approvals are pending. This may be blocking content delivery.`, icon: 'pending_actions' });
        }
        if (chatActivity < 5) {
            analysis.insights.push({ type: 'tip', message: 'Team chat activity is low. Encourage collaboration through shared channels.', icon: 'forum' });
        }

        // Top performer
        const topPerformer = members.reduce((best, m) => {
            const score = (m.usage?.contentGenerated || 0) + (m.usage?.creativesGenerated || 0);
            return score > best.score ? { name: m.name, score } : best;
        }, { name: '', score: 0 });
        if (topPerformer.name) {
            analysis.insights.push({ type: 'success', message: `🏆 ${topPerformer.name} is the top contributor with ${topPerformer.score} total outputs.`, icon: 'emoji_events' });
        }

        res.json(analysis);
    } catch (error) {
        res.status(500).json({ error: safeErrorMessage(error) });
    }
});

export default router;

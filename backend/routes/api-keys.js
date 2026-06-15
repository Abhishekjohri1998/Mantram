/**
 * API Key Management Routes
 * /api/api-keys
 *
 * Lets Mantram users create, list, and revoke MCP API keys.
 * The plaintext key is returned ONLY on creation — never again.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import ApiKey from '../models/ApiKey.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// All routes require a logged-in Mantram account
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/api-keys — list user's keys (masked, no plaintext)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const keys = await ApiKey.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .select('name keyPrefix isActive lastUsedAt requestCount expiresAt createdAt')
            .lean();

        res.json({ success: true, keys });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/api-keys — generate a new key
// Body: { name: string, expiresInDays?: number }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { name, expiresInDays } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Key name is required' });
        }

        // Enforce per-user limit of 10 active keys
        const count = await ApiKey.countDocuments({ user: req.user._id, isActive: true });
        if (count >= 10) {
            return res.status(400).json({
                success: false,
                error: 'Maximum of 10 active API keys allowed. Revoke an existing key first.',
            });
        }

        const { plaintext, hash, prefix } = ApiKey.generate();

        const expiresAt = expiresInDays
            ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
            : null;

        const key = await ApiKey.create({
            user: req.user._id,
            name: name.trim(),
            keyHash: hash,
            keyPrefix: prefix,
            expiresAt,
        });

        // Return plaintext ONCE — never stored, never returned again
        res.json({
            success: true,
            key: {
                _id: key._id,
                name: key.name,
                keyPrefix: key.keyPrefix,
                isActive: key.isActive,
                createdAt: key.createdAt,
                expiresAt: key.expiresAt,
            },
            // ⚠️  Show plaintext only on creation
            plaintext,
            warning: 'Copy this key now — it will not be shown again.',
        });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/api-keys/:id — rename a key
// Body: { name: string }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const key = await ApiKey.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { name: name.trim() },
            { new: true }
        ).select('name keyPrefix isActive lastUsedAt requestCount expiresAt createdAt');

        if (!key) return res.status(404).json({ success: false, error: 'Key not found' });
        res.json({ success: true, key });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/api-keys/:id — revoke (soft delete) a key
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const key = await ApiKey.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isActive: false },
            { new: true }
        );
        if (!key) return res.status(404).json({ success: false, error: 'Key not found' });
        res.json({ success: true, message: 'API key revoked' });
    } catch (err) {
        res.status(500).json({ success: false, error: safeErrorMessage(err) });
    }
});

export default router;

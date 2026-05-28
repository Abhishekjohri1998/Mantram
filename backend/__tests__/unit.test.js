/**
 * Mantram AI — Unit Test Suite
 * 
 * Tests utility functions, middleware logic, and model validation.
 * Uses Node.js built-in test runner (no external dependencies).
 * 
 * Run: npm test
 *   or: node --test backend/__tests__/
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ══════════════════════════════════════════════════════════════
// 1. Input Sanitization
// ══════════════════════════════════════════════════════════════
import { escapeHtml, stripHtml, sanitizeObject } from '../utils/sanitize.js';

describe('Input Sanitization', () => {
    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        it('should handle ampersands', () => {
            assert.equal(escapeHtml('foo & bar'), 'foo &amp; bar');
        });

        it('should return null/undefined for non-string input', () => {
            assert.equal(escapeHtml(null), null);
            assert.equal(escapeHtml(undefined), undefined);
        });

        it('should leave clean strings unchanged', () => {
            assert.equal(escapeHtml('Hello World'), 'Hello World');
        });
    });

    describe('stripHtml', () => {
        it('should strip HTML tags', () => {
            assert.equal(stripHtml('<b>Bold</b> text'), 'Bold text');
        });

        it('should strip nested tags', () => {
            assert.equal(stripHtml('<div><p>Hello</p></div>'), 'Hello');
        });

        it('should handle script tags', () => {
            const input = 'Before<script>alert("xss")</script>After';
            const result = stripHtml(input);
            assert.ok(!result.includes('<script>'));
        });

        it('should return null for non-string input', () => {
            assert.equal(stripHtml(null), null);
        });
    });

    describe('sanitizeObject', () => {
        it('should sanitize specified fields', () => {
            const obj = { name: '<b>Test</b>', email: 'test@test.com' };
            const result = sanitizeObject(obj, ['name']);
            assert.equal(result.name, 'Test');
            assert.equal(result.email, 'test@test.com'); // untouched
        });

        it('should handle missing fields gracefully', () => {
            const obj = { name: 'Valid' };
            const result = sanitizeObject(obj, ['name', 'nonexistent']);
            assert.equal(result.name, 'Valid');
        });

        it('should not mutate the original object', () => {
            const obj = { name: '<b>Test</b>' };
            sanitizeObject(obj, ['name']);
            assert.equal(obj.name, '<b>Test</b>'); // original unchanged
        });
    });
});

// ══════════════════════════════════════════════════════════════
// 2. Safe Error Messages
// ══════════════════════════════════════════════════════════════
import { safeErrorMessage } from '../utils/safeError.js';

describe('Safe Error Messages', () => {
    it('should extract message from Error objects', () => {
        const err = new Error('Something went wrong');
        assert.equal(safeErrorMessage(err), 'Something went wrong');
    });

    it('should handle string errors', () => {
        assert.equal(safeErrorMessage('raw string error'), 'raw string error');
    });

    it('should return fallback for null/undefined', () => {
        const result = safeErrorMessage(null);
        assert.ok(typeof result === 'string');
        assert.ok(result.length > 0);
    });
});

// ══════════════════════════════════════════════════════════════
// 3. SWR Cache (Frontend — tested via import)
// ══════════════════════════════════════════════════════════════
// Note: Frontend cache is tested via the API layer. We test the
// pattern here using a simple mock.
describe('SWR Cache Pattern', () => {
    const cache = new Map();
    const TTL = 100; // 100ms for testing

    function cachedGet(key, fetcher) {
        const cached = cache.get(key);
        const now = Date.now();
        if (cached && now - cached.ts < TTL) return cached.data;
        const data = fetcher();
        cache.set(key, { data, ts: now });
        return data;
    }

    it('should return cached data within TTL', () => {
        let callCount = 0;
        const fetcher = () => { callCount++; return 'data'; };
        
        cachedGet('test', fetcher); // First call
        cachedGet('test', fetcher); // Should use cache
        assert.equal(callCount, 1);
    });

    it('should re-fetch after TTL expires', async () => {
        let callCount = 0;
        const fetcher = () => { callCount++; return `data-${callCount}`; };
        
        cachedGet('expire-test', fetcher);
        await new Promise(r => setTimeout(r, 150)); // Wait past TTL
        const result = cachedGet('expire-test', fetcher);
        assert.equal(callCount, 2);
        assert.equal(result, 'data-2');
    });
});

// ══════════════════════════════════════════════════════════════
// 4. Rate Limiter Configuration Validation
// ══════════════════════════════════════════════════════════════
describe('Security Configuration', () => {
    it('should have helmet imported in index.js', async () => {
        // Verify the file contains helmet usage
        const fs = await import('node:fs');
        const indexContent = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
        assert.ok(indexContent.includes('helmet'), 'index.js should use helmet');
        assert.ok(indexContent.includes('rateLimit'), 'index.js should use rateLimit');
    });

    it('should have sanitize middleware in auth routes', async () => {
        const fs = await import('node:fs');
        const authContent = fs.readFileSync(new URL('../routes/auth.js', import.meta.url), 'utf8');
        assert.ok(authContent.includes('sanitizeBody'), 'auth.js should use sanitizeBody');
    });

    it('should have ErrorBoundary in frontend', async () => {
        const fs = await import('node:fs');
        const appContent = fs.readFileSync(new URL('../../frontend/src/App.jsx', import.meta.url), 'utf8');
        assert.ok(appContent.includes('ErrorBoundary'), 'App.jsx should use ErrorBoundary');
    });
});

// ══════════════════════════════════════════════════════════════
// 5. Activity Log Model Schema Validation
// ══════════════════════════════════════════════════════════════
describe('ActivityLog Schema', () => {
    it('should export a valid Mongoose model', async () => {
        const { default: ActivityLog } = await import('../models/ActivityLog.js');
        assert.ok(ActivityLog.schema, 'Should have a schema');
        assert.ok(ActivityLog.schema.paths.user, 'Should have user field');
        assert.ok(ActivityLog.schema.paths.action, 'Should have action field');
        assert.ok(ActivityLog.schema.paths.studio, 'Should have studio field');
        assert.ok(ActivityLog.schema.paths.creditCost, 'Should have creditCost field');
    });

    it('should have required action enum values', async () => {
        const { default: ActivityLog } = await import('../models/ActivityLog.js');
        const actionEnum = ActivityLog.schema.paths.action.options.enum;
        assert.ok(actionEnum.includes('creative.generated'));
        assert.ok(actionEnum.includes('content.created'));
        assert.ok(actionEnum.includes('brand.created'));
        assert.ok(actionEnum.includes('auth.login'));
    });

    it('should have static log method', async () => {
        const { default: ActivityLog } = await import('../models/ActivityLog.js');
        assert.equal(typeof ActivityLog.log, 'function');
    });
});

// ══════════════════════════════════════════════════════════════
// 6. Data Export Route Validation
// ══════════════════════════════════════════════════════════════
describe('Export Route Structure', () => {
    it('should export a router', async () => {
        const { default: exportRouter } = await import('../routes/export.js');
        assert.ok(exportRouter, 'Should export a router');
        // Express routers have a stack property
        assert.ok(exportRouter.stack || typeof exportRouter === 'function', 'Should be a valid router');
    });
});

console.log('\n🧪 Test suite loaded. Running...\n');

// Set environment variables before any ES module imports are evaluated
process.env.PORT = '9999';
process.env.NODE_ENV = 'test';

import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('❌ MONGODB_URI is not defined in .env');
    process.exit(1);
}

console.log('⚡ Starting Explore/Template Library Load Test Launcher...');
console.log('⚡ Overriding PORT=9999 and NODE_ENV=test...');

// Import the app. This runs index.js and starts listening on process.env.PORT (9999)
console.log('🚀 Loading application server...');
const serverModule = await import('../index.js');
console.log('✅ Server loaded on port 9999.');

import User from '../models/User.js';

// Helper function to hit local server routes using node native fetch
async function localFetch(urlPath, method, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`http://127.0.0.1:9999/api${urlPath}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
    });

    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return { success: false, error: text };
    }
}

async function performCleanup(emails) {
    console.log('\n🧹 Cleaning up test users...');
    const result = await User.deleteMany({ email: { $in: emails } });
    console.log(`🗑️ Deleted ${result.deletedCount} temporary users.`);
}

async function runLoadTest(concurrencyCount = 1000) {
    const startTime = Date.now();
    console.log(`\n🔥 Starting Explore Tab Concurrency Load Test with ${concurrencyCount} Mock Users...`);

    // 1. Create and verify 5 test accounts to distribute request tokens
    const testUsersCount = 5;
    const testUsers = Array.from({ length: testUsersCount }, (_, i) => ({
        name: `ExploreLoadUser_${i + 1}`,
        email: `exploretest_user_${i + 1}_${Date.now()}@example.com`,
        password: 'Password123'
    }));

    console.log(`👥 Registering ${testUsersCount} test users in parallel...`);
    await Promise.all(testUsers.map(async (u) => {
        const regRes = await localFetch('/auth/register', 'POST', u);
        if (!regRes.success) {
            throw new Error(`Register failed: ${regRes.error || JSON.stringify(regRes)}`);
        }
    }));

    // Verify users directly in DB
    const emails = testUsers.map(u => u.email);
    await User.updateMany(
        { email: { $in: emails } },
        { $set: { isVerified: true, 'credits.total': 1000 } }
    );

    // Login users to get tokens
    console.log('👥 Logging in test users in parallel...');
    const tokens = [];
    await Promise.all(testUsers.map(async (u) => {
        const loginRes = await localFetch('/auth/login', 'POST', { email: u.email, password: u.password });
        if (!loginRes.success) {
            throw new Error(`Login failed: ${loginRes.error || JSON.stringify(loginRes)}`);
        }
        tokens.push(loginRes.token);
    }));

    console.log(`✅ Logged in successfully. Acquired ${tokens.length} authorization tokens.`);

    // 2. Launch 1000 requests using a sliding batch of 100 at a time
    console.log(`🚀 Sending ${concurrencyCount} requests in paced batches of 100 to prevent client-side port exhaustion...`);

    const latencies = [];
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    const batchSize = 100;
    const totalBatches = Math.ceil(concurrencyCount / batchSize);

    for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * batchSize;
        const endIdx = Math.min(startIdx + batchSize, concurrencyCount);
        const batchPromises = [];

        for (let idx = startIdx; idx < endIdx; idx++) {
            const token = tokens[idx % tokens.length];
            const reqStart = Date.now();

            batchPromises.push((async () => {
                try {
                    const res = await fetch('http://127.0.0.1:9999/api/templates?limit=200', {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    const latency = Date.now() - reqStart;
                    latencies.push(latency);

                    if (res.status === 200) {
                        const body = await res.json();
                        if (body.success) {
                            successCount++;
                        } else {
                            failCount++;
                            errors.push(`API failure: ${body.error || 'Unknown API error'}`);
                        }
                    } else {
                        failCount++;
                        const text = await res.text();
                        errors.push(`HTTP ${res.status}: ${text.substring(0, 100)}`);
                    }
                } catch (err) {
                    const latency = Date.now() - reqStart;
                    latencies.push(latency);
                    failCount++;
                    errors.push(`Fetch error: ${err.message}`);
                }
            })());
        }

        await Promise.all(batchPromises);
    }

    const totalDuration = (Date.now() - startTime) / 1000;

    // Sort latencies to compute percentiles
    latencies.sort((a, b) => a - b);
    const min = latencies[0] || 0;
    const max = latencies[latencies.length - 1] || 0;
    const avg = latencies.reduce((sum, val) => sum + val, 0) / (latencies.length || 1);
    const p90 = latencies[Math.floor(latencies.length * 0.90)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    console.log('\n==================================================');
    console.log('🏆           EXPLORE TAB LOAD TEST REPORT         ');
    console.log('==================================================');
    console.log(`Concurrently Simulated Users : ${concurrencyCount}`);
    console.log(`Successful Requests          : ${successCount}`);
    console.log(`Failed Requests              : ${failCount}`);
    console.log(`Success Rate                 : ${((successCount / concurrencyCount) * 100).toFixed(2)}%`);
    console.log(`Total Elapsed Time           : ${totalDuration.toFixed(2)}s`);
    console.log(`Requests per Second (RPS)    : ${(concurrencyCount / totalDuration).toFixed(2)}`);
    console.log('--------------------------------------------------');
    console.log('⏱️  Latency Metrics:');
    console.log(`  Min Latency                : ${min} ms`);
    console.log(`  Max Latency                : ${max} ms`);
    console.log(`  Average Latency            : ${avg.toFixed(2)} ms`);
    console.log(`  90th Percentile (p90)      : ${p90} ms`);
    console.log(`  95th Percentile (p95)      : ${p95} ms`);
    console.log(`  99th Percentile (p99)      : ${p99} ms`);
    console.log('==================================================');

    if (errors.length > 0) {
        console.log(`\n❌ Errors Encountered (${errors.length} total):`);
        const uniqueErrors = [...new Set(errors)];
        uniqueErrors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
        if (uniqueErrors.length > 10) {
            console.log(`  - ... and ${uniqueErrors.length - 10} more unique error types.`);
        }
    }

    await performCleanup(emails);
}

async function run() {
    try {
        await runLoadTest(1000);
    } catch (err) {
        console.error('❌ Error during explore load test:', err);
    } finally {
        console.log('\n🔌 Shutting down server and disconnecting...');
        setTimeout(() => process.exit(0), 1000);
    }
}

// Wait for a short delay to let mongoose establish connections before running workflows
setTimeout(run, 5000);

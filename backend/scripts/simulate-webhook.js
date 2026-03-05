/**
 * Shopify Webhook Simulation Tool
 * 
 * This script allows you to "fake" an incoming Shopify order webhook.
 * It signs the payload correctly using your SHOPIFY_API_SECRET so you
 * can test if Mantram AI receives and saves the data in real-time.
 * 
 * Usage: node scripts/simulate-webhook.js
 */

import crypto from 'crypto';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const SECRET = process.env.SHOPIFY_API_SECRET;
const TARGET_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const WEBHOOK_PATH = '/api/shopify/webhooks/orders-create';

async function simulateWebhook() {
    if (!SECRET || SECRET === 'your_shopify_api_secret_here') {
        console.error('❌ Error: SHOPIFY_API_SECRET is not set in .env');
        return;
    }

    const dummyOrder = {
        id: Math.floor(Math.random() * 1000000000),
        name: "#SIMULATED-TEST",
        total_price: "199.99",
        financial_status: "paid",
        fulfillment_status: "unfulfilled",
        created_at: new Date().toISOString(),
        customer: {
            id: 1234567,
            first_name: "Test",
            last_name: "Customer",
            email: "test@example.com"
        },
        line_items: [
            {
                id: 112233,
                title: "Simulated Test Product",
                quantity: 1,
                price: "199.99"
            }
        ]
    };

    const rawBody = JSON.stringify(dummyOrder);

    // Calculate HMAC (must match Shopify implementation)
    const hmac = crypto
        .createHmac('sha256', SECRET)
        .update(rawBody, 'utf8')
        .digest('base64');

    console.log(`📡 Sending simulated webhook to ${TARGET_URL}${WEBHOOK_PATH}...`);

    try {
        const response = await fetch(`${TARGET_URL}${WEBHOOK_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Hmac-Sha256': hmac,
                'X-Shopify-Shop-Domain': 'test-mantram-store.myshopify.com',
                'X-Shopify-Topic': 'orders/create'
            },
            body: rawBody
        });

        if (response.ok) {
            console.log('✅ Webhook accepted by server!');
            console.log('🔎 Check your database or dashboard to see the new test order.');
        } else {
            const errorText = await response.text();
            console.error(`❌ Server rejected webhook (${response.status}):`, errorText);
            console.log('💡 Note: Make sure your server is running and BACKEND_URL in .env is correct.');
        }
    } catch (err) {
        console.error('❌ Failed to connect to server:', err.message);
    }
}

simulateWebhook();

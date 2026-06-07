import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env' });

import Integration from './models/Integration.js';

async function check() {
    await mongoose.connect(process.env.MONGODB_URI);
    const integration = await Integration.findOne({ 'platformData.shopDomain': 'mantram-test-store.myshopify.com', platform: 'shopify', status: 'connected' }).select('+accessToken');
    if (!integration) {
        console.log('Integration not found');
        return process.exit(0);
    }
    const token = integration.accessToken;
    console.log('Token starts with:', token.substring(0, 5));

    const response = await fetch(`https://mantram-test-store.myshopify.com/admin/api/2025-01/graphql.json`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': token
        },
        body: JSON.stringify({
            query: `{
                app {
                    installation {
                        accessScopes {
                            handle
                        }
                    }
                }
            }`
        })
    });
    const data = await response.json();
    console.log('Scopes:', JSON.stringify(data, null, 2));
    process.exit(0);
}

check();

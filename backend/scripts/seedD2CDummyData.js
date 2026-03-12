/**
 * Seed D2C Dummy Data for ACwO Brand
 * 
 * Usage:
 *   node scripts/seedD2CDummyData.js          # Seed dummy data
 *   node scripts/seedD2CDummyData.js --delete  # Remove all dummy data
 * 
 * All seeded records are tagged with _seedTag: 'acwo-d2c-demo' for easy cleanup.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import Brand from '../models/Brand.js';
import User from '../models/User.js';
import Integration from '../models/Integration.js';
import ShopifyOrder from '../models/ShopifyOrder.js';
import ShopifyCustomer from '../models/ShopifyCustomer.js';
import Product from '../models/Product.js';

const SEED_TAG = 'acwo-d2c-demo';
const SHOPIFY_DOMAIN = 'acwo-official.myshopify.com';

// ── Connect to MongoDB ──
async function connectDB() {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('No MONGODB_URI found in .env');
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
}

// ── Find ACwO brand + owner user ──
async function findACwO() {
    const brand = await Brand.findOne({ name: /acwo/i }).lean();
    if (!brand) throw new Error('ACwO brand not found. Create it first.');
    const user = await User.findById(brand.user).lean();
    if (!user) throw new Error('ACwO brand owner user not found.');
    console.log(`🏷️  Brand: ${brand.name} (${brand._id})`);
    console.log(`👤 User: ${user.email} (${user._id})`);
    return { brandId: brand._id, userId: user._id };
}

// ── Helper: random date within last N days ──
function randomDate(daysBack) {
    const now = Date.now();
    return new Date(now - Math.random() * daysBack * 24 * 60 * 60 * 1000);
}

function randomPick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// ── Product catalog for ACwO ──
const ACWO_PRODUCTS = [
    { id: 'ACWO-001', title: 'ACwO DwOTS 2.0 True Wireless Earbuds', price: 1299, inventory: 450, image: 'https://m.media-amazon.com/images/I/612CzBJ-LKL._SL1500_.jpg' },
    { id: 'ACWO-002', title: 'ACwO Neckband X1 Pro', price: 899, inventory: 320, image: 'https://m.media-amazon.com/images/I/61Tq1GCG8nL._SL1500_.jpg' },
    { id: 'ACWO-003', title: 'ACwO StudioBass Over-Ear Headphones', price: 1999, inventory: 180, image: 'https://m.media-amazon.com/images/I/61eHl1IiLgL._SL1500_.jpg' },
    { id: 'ACWO-004', title: 'ACwO SmartWatch Ultra S1', price: 2499, inventory: 150, image: 'https://m.media-amazon.com/images/I/61XUuXRGZHL._SL1500_.jpg' },
    { id: 'ACWO-005', title: 'ACwO PowerBank 10000mAh', price: 799, inventory: 600, image: 'https://m.media-amazon.com/images/I/61WStLkzURL._SL1500_.jpg' },
    { id: 'ACWO-006', title: 'ACwO SoundBar 60W Bluetooth', price: 3499, inventory: 85, image: 'https://m.media-amazon.com/images/I/51i4P-KN1GL._SL1500_.jpg' },
    { id: 'ACWO-007', title: 'ACwO Type-C Fast Charging Cable 2m', price: 299, inventory: 1200, image: null },
    { id: 'ACWO-008', title: 'ACwO ANC Earbuds Pro Max', price: 2999, inventory: 95, image: 'https://m.media-amazon.com/images/I/71FZf1uuBXL._SL1500_.jpg' },
    { id: 'ACWO-009', title: 'ACwO Portable Speaker Boom X', price: 1499, inventory: 210, image: null },
    { id: 'ACWO-010', title: 'ACwO Gaming TWS G1', price: 1799, inventory: 130, image: null },
    // Dead stock products (no orders will reference these)
    { id: 'ACWO-011', title: 'ACwO Magnetic Car Mount', price: 499, inventory: 340, image: null, deadStock: true },
    { id: 'ACWO-012', title: 'ACwO Wired Earphones Classic', price: 199, inventory: 800, image: null, deadStock: true },
];

// ── Customer names pool ──
const FIRST_NAMES = ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Meera', 'Arjun', 'Sneha', 'Karthik', 'Divya', 'Aditya', 'Neha', 'Rahul', 'Pooja', 'Suresh', 'Kavitha', 'Manish', 'Ritu', 'Deepak', 'Swati', 'Amit', 'Lakshmi', 'Rajesh', 'Sonal', 'Vishal', 'Anjali', 'Nikhil', 'Shruti', 'Gaurav', 'Pallavi', 'Sanjay', 'Nidhi', 'Ashish', 'Isha', 'Harsh', 'Tina', 'Mohit', 'Riya', 'Sumit', 'Komal'];
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Joshi', 'Mehta', 'Reddy', 'Nair', 'Iyer', 'Das', 'Verma', 'Chauhan', 'Mishra', 'Agarwal', 'Rao', 'Bhat', 'Saxena', 'Kapoor', 'Malhotra'];

const CITIES = [
    { city: 'Mumbai', province: 'Maharashtra', country: 'India', zip: '400001', weight: 20 },
    { city: 'Delhi', province: 'Delhi', country: 'India', zip: '110001', weight: 18 },
    { city: 'Bangalore', province: 'Karnataka', country: 'India', zip: '560001', weight: 15 },
    { city: 'Hyderabad', province: 'Telangana', country: 'India', zip: '500001', weight: 12 },
    { city: 'Pune', province: 'Maharashtra', country: 'India', zip: '411001', weight: 10 },
    { city: 'Chennai', province: 'Tamil Nadu', country: 'India', zip: '600001', weight: 8 },
    { city: 'Ahmedabad', province: 'Gujarat', country: 'India', zip: '380001', weight: 6 },
    { city: 'Jaipur', province: 'Rajasthan', country: 'India', zip: '302001', weight: 4 },
    { city: 'Kolkata', province: 'West Bengal', country: 'India', zip: '700001', weight: 4 },
    { city: 'Lucknow', province: 'Uttar Pradesh', country: 'India', zip: '226001', weight: 3 },
];

function weightedRandomCity() {
    const totalWeight = CITIES.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * totalWeight;
    for (const c of CITIES) {
        r -= c.weight;
        if (r <= 0) return c;
    }
    return CITIES[0];
}

const VARIANT_POOL = ['Black', 'White', 'Blue', 'Green', 'Grey', 'Red', 'Navy', 'Matte Black', 'Rose Gold', 'Midnight Blue'];

// ═══════════════════════════════════════════════════════════════════
// SEED
// ═══════════════════════════════════════════════════════════════════

async function seed() {
    const { brandId, userId } = await findACwO();

    // 1. CREATE INTEGRATION (fake Shopify connected)
    console.log('\n📦 Creating Shopify Integration...');
    await Integration.findOneAndUpdate(
        { user: userId, brand: brandId, platform: 'shopify' },
        {
            user: userId,
            brand: brandId,
            platform: 'shopify',
            status: 'connected',
            accessToken: 'shpat_demo_acwo_dummy_token_12345',
            platformData: {
                shopDomain: SHOPIFY_DOMAIN,
                shopName: 'ACwO Official Store',
            },
            lastSyncAt: new Date(),
            syncCount: 1,
            displayName: 'ACwO Official Store',
            metadata: { _seedTag: SEED_TAG },
        },
        { upsert: true, new: true }
    );
    console.log('  ✅ Integration created');

    // 2. CREATE PRODUCTS (source: shopify)
    console.log('\n📦 Creating Products...');
    for (const p of ACWO_PRODUCTS) {
        const variant = randomPick(VARIANT_POOL);
        await Product.findOneAndUpdate(
            { brand: brandId, shopifyId: p.id },
            {
                user: userId,
                brand: brandId,
                source: 'shopify',
                shopifyId: p.id,
                title: p.title,
                description: `Premium ${p.title} by ACwO — next-gen audio & tech accessories.`,
                price: { amount: p.price, currency: 'INR' },
                images: p.image ? [{ url: p.image, src: p.image }] : [],
                variants: [
                    { title: variant, price: p.price, inventoryQuantity: p.inventory, sku: p.id },
                    { title: 'Default Title', price: p.price, inventoryQuantity: Math.floor(p.inventory / 3), sku: p.id + '-DEF' },
                ],
                status: 'active',
                tags: ['acwo', 'electronics', 'audio'],
                metadata: { _seedTag: SEED_TAG },
            },
            { upsert: true, new: true }
        );
    }
    console.log(`  ✅ ${ACWO_PRODUCTS.length} products created`);

    // 3. CREATE CUSTOMERS
    console.log('\n👥 Creating Customers...');
    const NUM_CUSTOMERS = 85;
    const customerIds = [];
    for (let i = 0; i < NUM_CUSTOMERS; i++) {
        const fn = randomPick(FIRST_NAMES);
        const ln = randomPick(LAST_NAMES);
        const city = weightedRandomCity();
        const ordersCount = i < 8 ? randomBetween(4, 12) : i < 25 ? randomBetween(2, 4) : 1;
        const avgSpend = randomBetween(800, 3000);
        const custId = `demo-cust-${i + 1}`;

        await ShopifyCustomer.findOneAndUpdate(
            { brand: brandId, shopifyCustomerId: custId },
            {
                user: userId,
                brand: brandId,
                shopifyCustomerId: custId,
                email: `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@gmail.com`,
                firstName: fn,
                lastName: ln,
                phone: `+91${randomBetween(7000000000, 9999999999)}`,
                ordersCount,
                totalSpent: ordersCount * avgSpend,
                currency: 'INR',
                defaultAddress: {
                    city: city.city,
                    province: city.province,
                    country: city.country,
                    zip: city.zip,
                },
                acceptsMarketing: Math.random() > 0.35,
                state: 'enabled',
                tags: ['demo'],
                shopifyCreatedAt: randomDate(120),
                shopifyUpdatedAt: randomDate(30),
                syncedAt: new Date(),
            },
            { upsert: true, new: true }
        );
        customerIds.push(custId);
    }
    console.log(`  ✅ ${NUM_CUSTOMERS} customers created`);

    // 4. CREATE ORDERS — spread over last 60 days with realistic distribution
    console.log('\n🛒 Creating Orders...');
    const sellableProducts = ACWO_PRODUCTS.filter(p => !p.deadStock);
    const NUM_ORDERS = 210;
    const orders = [];

    for (let i = 0; i < NUM_ORDERS; i++) {
        const orderDate = randomDate(60);
        const custIdx = randomBetween(0, NUM_CUSTOMERS - 1);
        const custId = customerIds[custIdx];
        const fn = FIRST_NAMES[custIdx % FIRST_NAMES.length];
        const ln = LAST_NAMES[custIdx % LAST_NAMES.length];
        const city = weightedRandomCity();

        // 1-3 line items
        const numItems = Math.random() > 0.7 ? randomBetween(2, 3) : 1;
        const lineItems = [];
        const usedProducts = new Set();
        for (let j = 0; j < numItems; j++) {
            let prod = randomPick(sellableProducts);
            while (usedProducts.has(prod.id)) prod = randomPick(sellableProducts);
            usedProducts.add(prod.id);
            const variant = randomPick(VARIANT_POOL);
            const qty = Math.random() > 0.85 ? 2 : 1;
            lineItems.push({
                shopifyLineItemId: `li-${i}-${j}`,
                productId: prod.id,
                variantId: `${prod.id}-v1`,
                title: prod.title,
                variantTitle: variant,
                quantity: qty,
                price: prod.price,
                sku: prod.id,
            });
        }

        const subtotal = lineItems.reduce((s, li) => s + li.price * li.quantity, 0);
        const hasDiscount = Math.random() > 0.65;
        const discount = hasDiscount ? Math.round(subtotal * randomBetween(5, 20) / 100) : 0;
        const total = subtotal - discount;

        // Financial status
        let financialStatus = 'paid';
        if (Math.random() < 0.04) financialStatus = 'refunded';
        else if (Math.random() < 0.02) financialStatus = 'partially_refunded';

        // Fulfillment status
        let fulfillmentStatus = 'fulfilled';
        if (orderDate > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) {
            fulfillmentStatus = Math.random() > 0.5 ? null : 'fulfilled';
        } else if (Math.random() < 0.08) {
            fulfillmentStatus = null;
        }

        orders.push({
            user: userId,
            brand: brandId,
            shopifyOrderId: `demo-order-${i + 1}`,
            shopifyOrderNumber: `#ACW-${1001 + i}`,
            totalPrice: total,
            subtotalPrice: subtotal,
            totalDiscounts: discount,
            currency: 'INR',
            financialStatus,
            fulfillmentStatus,
            customer: {
                shopifyCustomerId: custId,
                email: `${fn.toLowerCase()}.${ln.toLowerCase()}${custIdx}@gmail.com`,
                firstName: fn,
                lastName: ln,
                city: city.city,
                province: city.province,
                country: city.country,
            },
            lineItems,
            shopifyCreatedAt: orderDate,
            shopifyUpdatedAt: orderDate,
            syncedAt: new Date(),
            rawData: { _seedTag: SEED_TAG },
        });
    }

    // Bulk upsert orders
    const bulkOps = orders.map(o => ({
        updateOne: {
            filter: { brand: brandId, shopifyOrderId: o.shopifyOrderId },
            update: { $set: o },
            upsert: true,
        },
    }));
    await ShopifyOrder.bulkWrite(bulkOps);
    console.log(`  ✅ ${NUM_ORDERS} orders created`);

    // Summary
    const totalRev = orders.reduce((s, o) => s + o.totalPrice, 0);
    const refunded = orders.filter(o => o.financialStatus === 'refunded' || o.financialStatus === 'partially_refunded').length;
    console.log(`\n📊 Summary:`);
    console.log(`   Revenue: ₹${Math.round(totalRev).toLocaleString()}`);
    console.log(`   Orders: ${NUM_ORDERS}`);
    console.log(`   Customers: ${NUM_CUSTOMERS}`);
    console.log(`   Products: ${ACWO_PRODUCTS.length} (${ACWO_PRODUCTS.filter(p => p.deadStock).length} dead stock)`);
    console.log(`   Refunds: ${refunded} (${Math.round(refunded / NUM_ORDERS * 100)}%)`);
    console.log(`\n✅ D2C dummy data seeded! Refresh the D2C Studio page.`);
}

// ═══════════════════════════════════════════════════════════════════
// DELETE
// ═══════════════════════════════════════════════════════════════════

async function deleteSeedData() {
    const { brandId, userId } = await findACwO();

    console.log('\n🗑️  Deleting seeded D2C data for ACwO...');

    const intRes = await Integration.deleteMany({ user: userId, brand: brandId, platform: 'shopify', 'metadata._seedTag': SEED_TAG });
    console.log(`  ❌ Integrations: ${intRes.deletedCount}`);

    const ordRes = await ShopifyOrder.deleteMany({ brand: brandId, 'rawData._seedTag': SEED_TAG });
    console.log(`  ❌ Orders: ${ordRes.deletedCount}`);

    const custRes = await ShopifyCustomer.deleteMany({ brand: brandId, shopifyCustomerId: /^demo-cust-/ });
    console.log(`  ❌ Customers: ${custRes.deletedCount}`);

    const prodRes = await Product.deleteMany({ brand: brandId, source: 'shopify', 'metadata._seedTag': SEED_TAG });
    console.log(`  ❌ Products: ${prodRes.deletedCount}`);

    console.log('\n✅ All D2C dummy data removed!');
}

// ── Main ──
async function main() {
    await connectDB();
    const isDelete = process.argv.includes('--delete');
    if (isDelete) {
        await deleteSeedData();
    } else {
        await seed();
    }
    await mongoose.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});

/**
 * Standalone script to seed Performance Marketing demo data for ACwO brand.
 * Run: node scripts/seedPMData.js
 * Remove: node scripts/seedPMData.js --remove
 */
import mongoose from 'mongoose';
import config from '../config/env.js';
import AdCampaign from '../models/AdCampaign.js';
import AdReport from '../models/AdReport.js';
import Integration from '../models/Integration.js';
import Brand from '../models/Brand.js';
import User from '../models/User.js';

const PM_SEED_TAG = 'acwo-pm-demo';

const DEMO_CAMPAIGNS = [
    {
        title: 'ACwO DwOTS 2.0 — Diwali Mega Sale',
        platform: 'meta', status: 'active', objective: 'conversions',
        budget: { daily: 2500, total: 75000, currency: 'INR', strategy: 'cost-cap' },
        targeting: { audiences: ['Earbuds Enthusiasts','Tech Gadget Buyers'], locations: ['IN-MH','IN-DL','IN-KA'], ageRange: {min:18,max:35}, gender:'all', interests: ['Audio Equipment','Wireless Earbuds','Tech Deals'], placements: ['feed','stories','reels'] },
        performance: { impressions: 845000, reach: 412000, clicks: 28450, ctr: 3.37, cpc: 2.63, cpm: 88.5, conversions: 1420, conversionRate: 4.99, roas: 4.8, spend: 74800, leads: 0, revenue: 359160, blendedRoas: 4.8, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Campaign exceeding ROAS targets by 20%. Reel placements driving 60% conversions.', recommendations: ['Scale budget by 40%','Duplicate winning reel ad set','Add lookalike audiences'], riskLevel: 'low', predictedRoas: 5.2, optimizationScore: 87 },
        creatives: [{ name:'Diwali Hero—Reel', format:'video', headline:'🎧 Sound That Dazzles This Diwali', primaryText:'ACwO DwOTS 2.0 at ₹1,299. 40hr battery, deep bass, ANC.', cta:'Shop Now', aiGenerated:true }],
    },
    {
        title: 'ACwO Brand Awareness — YouTube + Display',
        platform: 'google', status: 'active', objective: 'awareness',
        budget: { daily: 3000, total: 90000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: { audiences: ['In-market: Headphones','Affinity: Tech Savvy'], locations: ['IN'], ageRange: {min:18,max:44}, gender:'all', interests: ['Consumer Electronics','Mobile Accessories'], placements: ['youtube','display'] },
        performance: { impressions: 2130000, reach: 980000, clicks: 42600, ctr: 2.0, cpc: 1.89, cpm: 37.6, conversions: 640, conversionRate: 1.5, roas: 2.1, spend: 80100, leads: 0, revenue: 168210, blendedRoas: 2.1, lastSyncAt: new Date() },
        anomalies: [{ type:'ctr-drop', severity:'medium', detected: new Date(Date.now()-2*86400000), metric:'ctr', expected:2.5, actual:2.0, action:'alert-sent', resolved:false }],
        aiInsights: { summary: 'CTR dropped 20% after week 2. Display underperforming YouTube.', recommendations: ['Pause Display','Test YouTube Shorts','Add frequency capping'], riskLevel: 'medium', predictedRoas: 2.4, optimizationScore: 62 },
        creatives: [{ name:'YouTube Pre-roll—15s', format:'video', headline:'ACwO—Sound Redefined', primaryText:'India\'s fastest-growing audio brand.', cta:'Learn More', aiGenerated:true }],
    },
    {
        title: 'ACwO Neckband X1 Pro — Performance Max',
        platform: 'google', status: 'active', objective: 'sales',
        budget: { daily: 1800, total: 54000, currency: 'INR', strategy: 'target-roas' },
        targeting: { audiences: ['Past Purchasers','boAt Customers'], locations: ['IN-MH','IN-DL','IN-TN','IN-KA','IN-GJ'], ageRange: {min:20,max:40}, gender:'all', interests: ['Bluetooth Audio','Gym & Fitness'], placements: ['search','shopping','display','youtube'] },
        performance: { impressions: 560000, reach: 340000, clicks: 19600, ctr: 3.5, cpc: 2.3, cpm: 80.4, conversions: 980, conversionRate: 5.0, roas: 5.6, spend: 45080, leads: 0, revenue: 252448, blendedRoas: 5.6, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Top-performing campaign. Shopping ads driving 70% sales.', recommendations: ['Increase budget 50%','Expand to new states','Higher bids on Shopping'], riskLevel: 'low', predictedRoas: 6.0, optimizationScore: 94 },
        creatives: [{ name:'Shopping—Neckband X1 Pro', format:'image', headline:'ACwO Neckband X1 Pro—₹899', primaryText:'28hr battery • Deep Bass • IPX5', cta:'Shop Now', aiGenerated:false }],
    },
    {
        title: 'ACwO SmartWatch Ultra S1 — Launch Campaign',
        platform: 'meta', status: 'paused', objective: 'conversions',
        budget: { daily: 2000, total: 60000, currency: 'INR', strategy: 'cost-cap' },
        targeting: { audiences: ['Tech Early Adopters','Fitness Enthusiasts'], locations: ['IN-MH','IN-DL','IN-KA'], ageRange: {min:22,max:40}, gender:'all', interests: ['Smartwatches','Fitness Tracking','Wearable Tech'], placements: ['feed','stories'] },
        performance: { impressions: 320000, reach: 185000, clicks: 8960, ctr: 2.8, cpc: 4.02, cpm: 112.5, conversions: 268, conversionRate: 2.99, roas: 1.6, spend: 36000, leads: 0, revenue: 57600, blendedRoas: 1.6, lastSyncAt: new Date(Date.now()-3*86400000) },
        anomalies: [{ type:'roas-drop', severity:'high', detected: new Date(Date.now()-3*86400000), metric:'roas', expected:3.0, actual:1.6, action:'paused', resolved:true }],
        aiInsights: { summary: 'ROAS below target—paused. CPC too high at ₹4.02.', recommendations: ['Refresh creatives','Test broad targeting','Enable retargeting pixel'], riskLevel: 'high', predictedRoas: 2.0, optimizationScore: 38 },
        creatives: [{ name:'SmartWatch Launch—Image', format:'image', headline:'The ₹2,499 Smartwatch That Does It All', primaryText:'ACwO SmartWatch Ultra S1 — Heart rate, SpO2, GPS, 7-day battery.', cta:'Order Now', aiGenerated:true }],
    },
    {
        title: 'ACwO ANC Earbuds Pro Max — Instagram Reels',
        platform: 'meta', status: 'active', objective: 'conversions',
        budget: { daily: 1500, total: 45000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: { audiences: ['Premium Audio Buyers','Apple/Samsung Users'], locations: ['IN'], ageRange: {min:22,max:38}, gender:'all', interests: ['ANC Earbuds','Premium Audio','Music Production'], placements: ['reels','stories'] },
        performance: { impressions: 480000, reach: 295000, clicks: 16320, ctr: 3.4, cpc: 2.51, cpm: 85.4, conversions: 490, conversionRate: 3.0, roas: 3.6, spend: 40960, leads: 0, revenue: 147456, blendedRoas: 3.6, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Strong Reels performance. 3.4% CTR above benchmark. UGC outperforming polished ads 2x.', recommendations: ['Add Explore placement','Create more UGC','Test carousel format'], riskLevel: 'low', predictedRoas: 4.0, optimizationScore: 78 },
        creatives: [{ name:'UGC Reel—Noise Cancel Test', format:'video', headline:'You Won\'t Believe These Cost ₹2,999', primaryText:'ACwO ANC Earbuds Pro Max — 45dB ANC, Hi-Res Audio, 36hr battery.', cta:'Shop Now', aiGenerated:true }],
    },
    {
        title: 'ACwO Lead Gen — New Product Survey',
        platform: 'meta', status: 'completed', objective: 'leads',
        budget: { daily: 800, total: 12000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: { audiences: ['ACwO Website Visitors','Past Purchasers'], locations: ['IN'], ageRange: {min:18,max:45}, gender:'all', interests: ['Tech Reviews','Gadgets'], placements: ['feed'] },
        performance: { impressions: 95000, reach: 68000, clicks: 3800, ctr: 4.0, cpc: 3.16, cpm: 126.3, conversions: 0, conversionRate: 0, roas: 0, spend: 12000, leads: 1240, revenue: 0, lastSyncAt: new Date(Date.now()-15*86400000) },
        anomalies: [],
        aiInsights: { summary: 'Lead gen completed. 1,240 leads at ₹9.68 CPL.', recommendations: ['Create lookalike from leads','Email sequence','Remarketing'], riskLevel: 'low', predictedRoas: 0, optimizationScore: 72 },
        creatives: [{ name:'Survey—What Should We Build Next?', format:'image', headline:'Help ACwO Build Your Dream Product', primaryText:'Take a 2-min survey and win our latest TWS earbuds!', cta:'Sign Up', aiGenerated:false }],
    },
    {
        title: 'ACwO SoundBar 60W — Google Search',
        platform: 'google', status: 'active', objective: 'traffic',
        budget: { daily: 1200, total: 36000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: { audiences: ['Home Audio Shoppers'], locations: ['IN'], ageRange: {min:25,max:50}, gender:'all', interests: ['Home Theater','Smart Home','Bluetooth Speakers'], placements: ['search'] },
        performance: { impressions: 210000, reach: 195000, clicks: 12600, ctr: 6.0, cpc: 1.90, cpm: 114, conversions: 315, conversionRate: 2.5, roas: 4.2, spend: 23940, leads: 0, revenue: 100548, blendedRoas: 4.2, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Search performing well. 6% CTR. Brand keywords 40% of clicks.', recommendations: ['Add competitor keywords','Responsive search ads','Higher bids on high-intent'], riskLevel: 'low', predictedRoas: 4.5, optimizationScore: 81 },
        creatives: [{ name:'Search Ad—SoundBar', format:'text', headline:'ACwO 60W SoundBar—₹3,499 | Free Shipping', primaryText:'Cinematic sound at home. Bluetooth 5.3, HDMI ARC.', cta:'Buy Now', aiGenerated:true }],
    },
    {
        title: 'ACwO Retargeting — Cart Abandoners',
        platform: 'meta', status: 'active', objective: 'conversions',
        budget: { daily: 600, total: 18000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: { audiences: ['Cart Abandoners—7 days','Product Viewers—14 days'], locations: ['IN'], ageRange: {min:18,max:45}, gender:'all', interests: [], placements: ['feed','stories','reels'] },
        performance: { impressions: 145000, reach: 42000, clicks: 8700, ctr: 6.0, cpc: 1.72, cpm: 103.4, conversions: 870, conversionRate: 10.0, roas: 8.2, spend: 14964, leads: 0, revenue: 122705, blendedRoas: 8.2, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Best ROAS campaign (8.2x). Cart abandoner retargeting highly effective. 10% CVR.', recommendations: ['Extend window to 30 days','Dynamic product ads','Email + ad combo'], riskLevel: 'low', predictedRoas: 8.5, optimizationScore: 96 },
        creatives: [{ name:'Dynamic Retarget—Carousel', format:'carousel', headline:'You Left Something Behind! 👀', primaryText:'ACwO favorites still in cart. Complete order for free express shipping!', cta:'Complete Purchase', aiGenerated:true }],
    },
];

async function main() {
    const isRemove = process.argv.includes('--remove');
    
    await mongoose.connect(config.mongoUri);
    console.log('✅ Connected to MongoDB');
    
    const user = await User.findOne({ email: 'user@mantram.ai' });
    if (!user) { console.error('❌ User not found'); process.exit(1); }
    const userId = user._id;
    
    let brand = await Brand.findOne({ user: userId, name: /acwo/i });
    if (!brand) {
        brand = await Brand.create({ user: userId, name: 'ACwO', description: 'ACwO — Next-gen audio & gadget brand.', status: 'active' });
        console.log(`🏷️ Created ACwO brand: ${brand._id}`);
    }
    const brandId = brand._id;
    
    if (isRemove) {
        const c = await AdCampaign.deleteMany({ user: userId, brand: brandId, _seedTag: PM_SEED_TAG });
        const r = await AdReport.deleteMany({ user: userId, brand: brandId, 'metadata._seedTag': PM_SEED_TAG });
        const i = await Integration.deleteMany({ user: userId, brand: brandId, 'metadata._seedTag': PM_SEED_TAG });
        console.log(`🧹 Removed: ${c.deletedCount} campaigns, ${r.deletedCount} reports, ${i.deletedCount} integrations`);
        process.exit(0);
    }
    
    // Clean old demo data first
    await AdCampaign.deleteMany({ user: userId, brand: brandId, _seedTag: PM_SEED_TAG });
    await AdReport.deleteMany({ user: userId, brand: brandId, 'metadata._seedTag': PM_SEED_TAG });
    
    // Seed integrations  
    for (const plat of ['meta-ads', 'google-ads']) {
        await Integration.findOneAndUpdate(
            { user: userId, brand: brandId, platform: plat },
            { user: userId, brand: brandId, platform: plat, status: 'connected',
              displayName: plat === 'meta-ads' ? 'ACwO Meta Business' : 'ACwO Google Ads',
              accessToken: `demo_token_${plat}`,
              platformData: { accountId: plat === 'meta-ads' ? 'act_123456789' : '987-654-3210', accountName: plat === 'meta-ads' ? 'ACwO Meta Business' : 'ACwO Google Ads Account' },
              lastSyncAt: new Date(), metadata: { _seedTag: PM_SEED_TAG } },
            { upsert: true, returnDocument: 'after' }
        );
    }
    console.log('🔗 Meta Ads + Google Ads integrations connected');
    
    // Create campaigns
    const created = [];
    for (const c of DEMO_CAMPAIGNS) {
        const startDate = new Date(Date.now() - Math.floor(Math.random() * 30 + 10) * 86400000);
        const endDate = c.status === 'completed' ? new Date(Date.now() - 5 * 86400000) : new Date(Date.now() + 30 * 86400000);
        
        const campaign = await AdCampaign.create({
            user: userId, brand: brandId,
            title: c.title, platform: c.platform, status: c.status, objective: c.objective,
            budget: { ...c.budget, startDate, endDate },
            targeting: c.targeting, creatives: c.creatives,
            performance: c.performance, anomalies: c.anomalies || [],
            aiInsights: c.aiInsights, _seedTag: PM_SEED_TAG,
        });
        created.push({ title: c.title, platform: c.platform, status: c.status, roas: c.performance.roas });
        console.log(`  📢 ${c.platform.toUpperCase()} | ${c.status.padEnd(9)} | ROAS ${String(c.performance.roas).padStart(4)}x | ${c.title}`);
    }
    
    // Create report
    await AdReport.create({
        user: userId, brand: brandId,
        title: 'ACwO Weekly Performance Report — Demo', type: 'weekly',
        summary: 'Cross-platform campaign performance: 4.2x blended ROAS across 8 campaigns. Meta driving conversions, Google driving awareness. Retargeting star at 8.2x ROAS.',
        metrics: {
            totalSpend: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.spend || 0), 0),
            totalRevenue: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.revenue || 0), 0),
            totalImpressions: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.impressions || 0), 0),
            totalClicks: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.clicks || 0), 0),
            totalConversions: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.conversions || 0), 0),
            avgCtr: 3.76, avgRoas: 4.26,
        },
        campaignIds: [], status: 'completed', metadata: { _seedTag: PM_SEED_TAG },
    });
    
    console.log(`\n🎯 Done! Seeded ${created.length} campaigns + 1 report + 2 integrations for ACwO`);
    console.log(`   Total Spend: ₹${DEMO_CAMPAIGNS.reduce((s,c) => s + c.performance.spend, 0).toLocaleString()}`);
    console.log(`   Total Revenue: ₹${DEMO_CAMPAIGNS.reduce((s,c) => s + c.performance.revenue, 0).toLocaleString()}`);
    console.log(`   Blended ROAS: ${(DEMO_CAMPAIGNS.reduce((s,c) => s + c.performance.revenue, 0) / DEMO_CAMPAIGNS.reduce((s,c) => s + c.performance.spend, 0)).toFixed(2)}x`);
    
    process.exit(0);
}

main().catch(err => { console.error('❌ Error:', err); process.exit(1); });

/**
 * Fix restored video project URLs from s3:// to proper https:// format
 * so the getSignedUrlIfNeeded function can recognize and sign them.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fixUrls() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    const BUCKET = process.env.AWS_S3_BUCKET;
    const REGION = process.env.AWS_REGION || 'ap-south-1';
    
    // Find all projects with s3:// URLs
    const projects = await db.collection('videoprojects').find({
        $or: [
            { finalVideoUrl: /^s3:\/\// },
            { 'generation.s3VideoUrl': /^s3:\/\// },
            { 'generation.videoUrl': /^s3:\/\// },
        ]
    }).toArray();
    
    console.log(`\n📹 Found ${projects.length} video projects with s3:// URLs to fix\n`);
    
    let fixed = 0;
    for (const p of projects) {
        const update = {};
        
        const fixUrl = (url) => {
            if (!url || !url.startsWith('s3://')) return url;
            // s3://bucket/key → https://s3.region.amazonaws.com/bucket/key
            const path = url.replace(`s3://${BUCKET}/`, '');
            return `https://s3.${REGION}.amazonaws.com/${BUCKET}/${path}`;
        };
        
        if (p.finalVideoUrl?.startsWith('s3://')) {
            update.finalVideoUrl = fixUrl(p.finalVideoUrl);
        }
        if (p.generation?.s3VideoUrl?.startsWith('s3://')) {
            update['generation.s3VideoUrl'] = fixUrl(p.generation.s3VideoUrl);
        }
        if (p.generation?.videoUrl?.startsWith('s3://')) {
            update['generation.videoUrl'] = fixUrl(p.generation.videoUrl);
        }
        
        if (Object.keys(update).length > 0) {
            await db.collection('videoprojects').updateOne({ _id: p._id }, { $set: update });
            fixed++;
            console.log(`  ✅ Fixed ${p._id}: ${update.finalVideoUrl?.substring(0, 80) || 'updated'}`);
        }
    }
    
    console.log(`\n✅ Fixed ${fixed} video project URLs`);
    
    // Verify
    const remaining = await db.collection('videoprojects').countDocuments({
        $or: [
            { finalVideoUrl: /^s3:\/\// },
            { 'generation.s3VideoUrl': /^s3:\/\// },
        ]
    });
    console.log(`📊 Remaining s3:// URLs: ${remaining}`);
    
    // Show sample of fixed URLs
    const sample = await db.collection('videoprojects').find({}).limit(3)
        .project({ title: 1, finalVideoUrl: 1, 'generation.s3VideoUrl': 1 }).toArray();
    console.log('\n📋 Sample entries:');
    sample.forEach(s => {
        console.log(`   ${s.title}: ${s.finalVideoUrl?.substring(0, 80)}`);
    });
    
    await mongoose.disconnect();
}

fixUrls().catch(console.error);

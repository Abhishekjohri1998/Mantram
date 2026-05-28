/**
 * Quick diagnostic — check video project counts and most recent entries
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function diagnose() {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    // Total video projects
    const total = await db.collection('videoprojects').countDocuments();
    console.log(`\n📹 Total video projects in DB: ${total}`);
    
    // Count by status
    const statuses = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('\n📊 By status:');
    statuses.forEach(s => console.log(`   ${s._id}: ${s.count}`));
    
    // Count by studioMode
    const modes = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$studioMode', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('\n🎬 By studioMode:');
    modes.forEach(m => console.log(`   ${m._id || '(none)'}: ${m.count}`));
    
    // Get all users who have video projects
    const usersWithVideos = await db.collection('videoprojects').aggregate([
        { $group: { _id: '$user', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]).toArray();
    console.log('\n👤 Users with video projects:');
    for (const u of usersWithVideos) {
        const user = await db.collection('users').findOne({ _id: u._id }, { projection: { email: 1, name: 1 } });
        console.log(`   ${user?.email || 'DELETED USER'} (${u._id}): ${u.count} videos`);
    }
    
    // Show latest 5 projects 
    const latest = await db.collection('videoprojects')
        .find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .project({ title: 1, status: 1, mode: 1, studioMode: 1, createdAt: 1, user: 1, 'generation.s3VideoUrl': 1, finalVideoUrl: 1 })
        .toArray();
    console.log('\n📋 Latest 5 video projects:');
    latest.forEach(p => {
        console.log(`   [${p.status}] "${p.title}" (mode: ${p.mode}, studio: ${p.studioMode || '-'}) — ${p.createdAt}`);
        console.log(`      finalVideo: ${p.finalVideoUrl ? 'YES' : 'NO'} | s3Video: ${p.generation?.s3VideoUrl ? 'YES' : 'NO'}`);
    });
    
    // Check how many were deleted by the cleanup (by checking if there are users referenced in the cleanup log)
    const totalUsers = await db.collection('users').countDocuments();
    console.log(`\n👥 Total users in DB: ${totalUsers}`);
    
    await mongoose.disconnect();
}

diagnose().catch(console.error);

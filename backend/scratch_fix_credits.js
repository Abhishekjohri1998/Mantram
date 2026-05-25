import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('Connected to DB');
    const db = mongoose.connection.db;
    
    // Find users where credits is not an object
    const users = await db.collection('users').find({ 'credits': { $type: 'double' } }).toArray();
    console.log('Found double users:', users.length);
    for (let u of users) {
        console.log('Fixing user:', u.email, u.credits);
        await db.collection('users').updateOne({ _id: u._id }, { $set: { credits: { total: 100, used: 0, bonus: 0, topUp: 0 } } });
    }
    
    const intUsers = await db.collection('users').find({ 'credits': { $type: 'int' } }).toArray();
    console.log('Found int users:', intUsers.length);
    for (let u of intUsers) {
        console.log('Fixing int user:', u.email, u.credits);
        await db.collection('users').updateOne({ _id: u._id }, { $set: { credits: { total: 100, used: 0, bonus: 0, topUp: 0 } } });
    }
    
    // Check if there's any user with NaN
    const allUsers = await db.collection('users').find({}).toArray();
    let nanCount = 0;
    for (let u of allUsers) {
        if (typeof u.credits === 'number' && isNaN(u.credits)) {
            console.log('Fixing NaN user:', u.email);
            nanCount++;
            await db.collection('users').updateOne({ _id: u._id }, { $set: { credits: { total: 100, used: 0, bonus: 0, topUp: 0 } } });
        }
    }
    console.log('Found NaN users:', nanCount);
    
    console.log('Done');
    process.exit(0);
}).catch(console.error);

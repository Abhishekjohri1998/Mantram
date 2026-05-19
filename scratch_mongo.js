const mongoose = require('mongoose');

async function test() {
    await mongoose.connect('mongodb://localhost:27017/mantram-ai', { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected');
    const db = mongoose.connection.db;
    try {
        const brandAware = await db.collection('templates').find({
            promptTemplate: { $regex: '\\{brand\\}|\\{product\\}', $options: 'i' }
        }).toArray();
        console.log('brandAware count:', brandAware.length);
        
        const general = await db.collection('templates').find({
            $or: [
                { promptTemplate: { $not: /\{brand\}|\{product\}/i } },
                { promptTemplate: { $exists: false } },
                { promptTemplate: '' },
            ]
        }).toArray();
        console.log('general count:', general.length);
    } catch(e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}
test();

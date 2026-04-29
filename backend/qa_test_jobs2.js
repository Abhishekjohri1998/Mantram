import mongoose from 'mongoose';
import GenerationJob from './models/GenerationJob.js';

const MONGODB_URI = 'mongodb+srv://abhishekjohri659_db_user:19Pva6kiaIGqaTAe@cluster0.dwfqpzy.mongodb.net/da-mantram?retryWrites=true&w=majority';

async function checkFailedJob() {
    await mongoose.connect(MONGODB_URI);
    const job = await GenerationJob.findOne({ jobId: 'create-1777399120789' }).lean();
    console.log(JSON.stringify(job, null, 2));
    process.exit(0);
}

checkFailedJob().catch(console.error);

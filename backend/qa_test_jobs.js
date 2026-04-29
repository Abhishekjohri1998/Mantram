import mongoose from 'mongoose';
import GenerationJob from './models/GenerationJob.js';

const MONGODB_URI = 'mongodb+srv://abhishekjohri659_db_user:19Pva6kiaIGqaTAe@cluster0.dwfqpzy.mongodb.net/da-mantram?retryWrites=true&w=majority';

async function checkFailedJobs() {
    await mongoose.connect(MONGODB_URI);
    const jobs = await GenerationJob.find({ type: 'ai-create' }).sort({ createdAt: -1 }).limit(5).lean();
    console.log("Recent 'ai-create' jobs:");
    jobs.forEach(j => {
        console.log(`- Job ${j.jobId} | Status: ${j.status} | Error: ${j.errorMessage}`);
    });
    const oldJobs = await GenerationJob.find({ type: 'creative' }).sort({ createdAt: -1 }).limit(5).lean();
    console.log("\nRecent 'creative' jobs:");
    oldJobs.forEach(j => {
        console.log(`- Job ${j.jobId} | Status: ${j.status} | Error: ${j.errorMessage}`);
    });
    process.exit(0);
}

checkFailedJobs().catch(console.error);

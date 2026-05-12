import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI;
const EXECUTE = process.argv.includes('--execute');

if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in .env file');
    process.exit(1);
}

const VideoProjectSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String },
    createdAt: { type: Date, default: Date.now },
    finalVideoUrl: String,
    generation: {
        videoUrl: String
    },
    concepts: [mongoose.Schema.Types.Mixed]
}, { strict: false });

const VideoProject = mongoose.model('VideoProject', VideoProjectSchema);

async function cleanup() {
    try {
        console.log(`Connecting to MongoDB... ${EXECUTE ? '⚡ EXECUTE MODE' : '🛡️ DRY RUN MODE'}`);
        await mongoose.connect(MONGO_URI);
        console.log('Connected.\n');

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // 1. Orphaned generating
        const orphanedGeneratingFilter = {
            status: 'generating',
            finalVideoUrl: { $exists: false },
            'generation.videoUrl': { $exists: false },
            createdAt: { $lt: oneDayAgo }
        };
        const orphanedGeneratingCount = await VideoProject.countDocuments(orphanedGeneratingFilter);
        console.log(`🗑️ Orphaned 'generating' projects (> 24h old): ${orphanedGeneratingCount}`);

        // 2. Failed without video
        const failedNoVideoFilter = {
            status: 'failed',
            finalVideoUrl: { $exists: false },
            'generation.videoUrl': { $exists: false },
            createdAt: { $lt: sevenDaysAgo }
        };
        const failedNoVideoCount = await VideoProject.countDocuments(failedNoVideoFilter);
        console.log(`🗑️ Failed projects without video (> 7d old): ${failedNoVideoCount}`);

        // 3. Empty brainstorms
        const emptyBrainstormFilter = {
            status: 'brainstorm',
            $or: [
                { concepts: { $exists: false } },
                { concepts: { $size: 0 } }
            ],
            createdAt: { $lt: sevenDaysAgo }
        };
        const emptyBrainstormCount = await VideoProject.countDocuments(emptyBrainstormFilter);
        console.log(`🗑️ Empty brainstorms (> 7d old): ${emptyBrainstormCount}`);

        // 4. No-user projects
        const noUserFilter = {
            user: { $exists: false }
        };
        const noUserCount = await VideoProject.countDocuments(noUserFilter);
        console.log(`🗑️ Projects missing 'user' field: ${noUserCount}`);

        console.log('----------------------------------------------------');
        const total = orphanedGeneratingCount + failedNoVideoCount + emptyBrainstormCount + noUserCount;
        console.log(`Total projects flagged for deletion: ${total}`);

        if (EXECUTE && total > 0) {
            console.log('\nExecuting deletions...');
            await VideoProject.deleteMany(orphanedGeneratingFilter);
            await VideoProject.deleteMany(failedNoVideoFilter);
            await VideoProject.deleteMany(emptyBrainstormFilter);
            await VideoProject.deleteMany(noUserFilter);
            console.log('✅ Deletions completed.');
        } else if (!EXECUTE) {
            console.log('\n🛡️ Dry run complete. Run with --execute to actually delete.');
        }

    } catch (err) {
        console.error('Error during cleanup:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

cleanup();

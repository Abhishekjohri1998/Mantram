import Bull from 'bull';
import * as dotenv from 'dotenv';
dotenv.config();

const REDIS_URL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;

async function testQueue() {
    try {
        const creativeQueue = new Bull('creative-generation', REDIS_URL);
        
        console.log('🧪 Testing image generation queue...');
        console.log(`🔗 Redis URL: ${REDIS_URL}`);

        const job = await creativeQueue.add({
            jobId: 'test-job-123',
            userId: '000000000000000000000001',
            payload: {
                prompt: 'Test prompt for high-load verification',
                brandId: '000000000000000000000001',
                type: 'instagram-post',
                options: { imageModel: 'nanobanana-2' }
            }
        });

        console.log(`✅ Job added successfully! ID: ${job.id}`);
        
        const counts = await creativeQueue.getJobCounts();
        console.log('📊 Queue Status:', counts);

        process.exit(0);
    } catch (err) {
        console.error('❌ Queue test failed:', err.message);
        process.exit(1);
    }
}

testQueue();

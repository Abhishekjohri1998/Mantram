
import { uploadToS3 } from '../utils/s3.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

async function testS3() {
    console.log('Testing S3 upload...');
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; // 1x1 white pixel
    const dataUri = `data:image/png;base64,${base64}`;
    
    try {
        const url = await uploadToS3(dataUri, `test/diagnostic-${Date.now()}.png`, 'image/png');
        console.log('✅ S3 Upload Success:', url);
    } catch (e) {
        console.error('❌ S3 Upload Failed:', e.message);
    }
}

testS3();

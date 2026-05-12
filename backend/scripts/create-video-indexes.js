import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in .env file');
    process.exit(1);
}

const VideoProjectSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    status: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
}, { strict: false });

const VideoProject = mongoose.model('VideoProject', VideoProjectSchema);

async function createIndexes() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        console.log('Creating index: { user: 1, createdAt: -1 }');
        await VideoProject.collection.createIndex({ user: 1, createdAt: -1 });
        
        console.log('Creating index: { user: 1, brand: 1, createdAt: -1 }');
        await VideoProject.collection.createIndex({ user: 1, brand: 1, createdAt: -1 });
        
        console.log('Creating index: { user: 1, status: 1, createdAt: -1 }');
        await VideoProject.collection.createIndex({ user: 1, status: 1, createdAt: -1 });

        console.log('✅ Indexes created successfully!');
    } catch (err) {
        console.error('Error creating indexes:', err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

createIndexes();

import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds

const connectDB = async (attempt = 1) => {
    try {
        const conn = await mongoose.connect(config.mongoUri, {
            serverSelectionTimeoutMS: 30000,   // 30s to pick a server
            socketTimeoutMS: 120000,           // 2min socket timeout (pipeline ops are heavy)
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s to keep alive
            maxPoolSize: 20,                   // larger pool for concurrent pipeline reads/writes
            minPoolSize: 5,                    // keep 5 connections warm
            maxIdleTimeMS: 60000,              // close idle connections after 60s
            family: 4, // Force IPv4 to avoid DNS issues
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Auto-reconnect on disconnect
        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected. Attempting reconnect...');
            setTimeout(() => connectDB(), RETRY_DELAY);
        });

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err.message);
        });

        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Error (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

        if (attempt < MAX_RETRIES) {
            console.log(`⏳ Retrying in ${RETRY_DELAY / 1000}s...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return connectDB(attempt + 1);
        }

        // Don't crash in dev — allow running without DB for frontend dev
        if (config.nodeEnv === 'production') {
            process.exit(1);
        }
        console.log('⚠️  Running without database connection');
        return null;
    }
};

export default connectDB;

import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds

const connectDB = async (attempt = 1) => {
    try {
        const conn = await mongoose.connect(config.mongoUri, {
            serverSelectionTimeoutMS: 30000,   // 30s to pick a server
            socketTimeoutMS: 45000,            // 45s socket timeout (fail faster under load)
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s to keep alive
            maxPoolSize: 100,                  // significantly larger pool for 100M-scale concurrency
            minPoolSize: 10,                   // keep more connections warm
            maxIdleTimeMS: 30000,              // close idle connections faster (30s)
            family: 4,                         // Force IPv4 to avoid DNS issues
            readPreference: 'secondaryPreferred', // Phase 5: Offload reads to replicas
            w: 'majority',                      // Phase 5: Ensure data consistency across replicas
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

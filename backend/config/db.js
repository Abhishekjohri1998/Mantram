import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds
let reconnectHandlerRegistered = false;

const connectDB = async (attempt = 1) => {
    // Prevent concurrent connection attempts or redundant calls
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }
    if (mongoose.connection.readyState === 2) {
        console.log('⏳ MongoDB connection already in progress...');
        return mongoose.connection;
    }

    try {
        const conn = await mongoose.connect(config.mongoUri, {
            serverSelectionTimeoutMS: 5000,            // 5s to pick a server
            socketTimeoutMS: 45000,            // 45s socket timeout (fail faster under load)
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s to keep alive
            maxPoolSize: 100,                  // significantly larger pool for 100M-scale concurrency
            minPoolSize: 10,                   // keep more connections warm
            maxIdleTimeMS: 30000,              // close idle connections faster (30s)
            readPreference: 'secondaryPreferred', // Phase 5: Offload reads to replicas
            w: 'majority',                      // Phase 5: Ensure data consistency across replicas
        });
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Auto-reconnect on disconnect (unless shutting down)
        // Guard: register only once to prevent exponential handler accumulation
        if (!reconnectHandlerRegistered) {
            mongoose.connection.on('disconnected', () => {
                if (mongoose.connection.isShuttingDown) return;
                // Only trigger reconnect if fully disconnected and no connection is in progress
                if (mongoose.connection.readyState === 0) {
                    console.warn('⚠️  MongoDB disconnected. Attempting reconnect...');
                    setTimeout(() => connectDB(), RETRY_DELAY);
                }
            });

            mongoose.connection.on('error', (err) => {
                console.error('❌ MongoDB connection error:', err.message);
            });

            reconnectHandlerRegistered = true;
        }

        return conn;
    } catch (error) {
        console.error(`❌ MongoDB Error (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

        if (attempt < MAX_RETRIES) {
            console.log(`⏳ Retrying in ${RETRY_DELAY / 1000}s...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return connectDB(attempt + 1);
        }

        console.log("process.execArgv:", process.execArgv);
        console.log("config.nodeEnv:", config.nodeEnv);
        // Don't crash in dev or under watch mode — allow running without DB for local run
        const isWatchMode = process.execArgv.some(arg => arg.startsWith('--watch')) || process.env.NODE_ENV === 'development';
        console.log("isWatchMode:", isWatchMode);
        if (config.nodeEnv === 'production' && !isWatchMode) {
            process.exit(1);
        }
        console.log('⚠️  Running without database connection');
        return null;
    }
};

export default connectDB;

import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds
let reconnectHandlerRegistered = false;
let connectionPromise = null;

const connectDB = async (attempt = 1) => {
    // Prevent concurrent connection attempts or redundant calls
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }
    
    // If a connection is already in progress, await that exact promise
    if (connectionPromise) {
        console.log('⏳ MongoDB connection already in progress...');
        return connectionPromise;
    }

    try {
        connectionPromise = mongoose.connect(config.mongoUri, {
            serverSelectionTimeoutMS: 5000,            // 5s to pick a server
            socketTimeoutMS: 45000,            // 45s socket timeout (fail faster under load)
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s to keep alive
            maxPoolSize: process.env.SEED_MODE === 'true' ? 2 : 15,
            minPoolSize: process.env.SEED_MODE === 'true' ? 1 : 2,
            maxIdleTimeMS: 30000,              // close idle connections faster (30s)
            readPreference: 'secondaryPreferred', // Phase 5: Offload reads to replicas
            w: 'majority',                      // Phase 5: Ensure data consistency across replicas
        });
        
        const conn = await connectionPromise;
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

        // Register listeners only once
        if (!reconnectHandlerRegistered) {
            mongoose.connection.on('disconnected', () => {
                if (mongoose.connection.isShuttingDown) return;
                console.warn('⚠️  MongoDB disconnected. The driver will attempt to automatically reconnect in the background.');
                // Note: We deliberately DO NOT manually call `mongoose.connect()` here
                // to prevent connection storms. The MongoDB Node.js driver auto-reconnects on its own.
            });

            mongoose.connection.on('error', (err) => {
                console.error('❌ MongoDB connection error:', err.message);
            });

            reconnectHandlerRegistered = true;
        }

        return conn;
    } catch (error) {
        connectionPromise = null; // Clear the cache on failure so we can retry
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

import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 3000; // 3 seconds
let reconnectHandlerRegistered = false;
let connectionPromise = null;
let isConnected = false;

const connectDB = async (attempt = 1) => {
    // Enforce strict singleton connection pattern
    if (isConnected) return mongoose.connection;
    if (mongoose.connection.readyState === 1) {
        isConnected = true;
        return mongoose.connection;
    }
    
    // If a connection is already in progress, await that exact promise
    if (connectionPromise) {
        return connectionPromise;
    }

    try {
        connectionPromise = mongoose.connect(config.mongoUri, {
            maxPoolSize: 5,                    // 2 prod workers × 5 × 3 replica nodes = 30 total
            minPoolSize: 1,                    // keep 1 warm connection alive per node
            serverSelectionTimeoutMS: 5000,    // 5s to pick a server
            socketTimeoutMS: 45000,            // 45s socket timeout (fail faster under load)
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 10000,       // heartbeat every 10s to keep alive
            maxIdleTimeMS: 30000,              // close idle connections after 30s
            readPreference: 'secondaryPreferred',
            w: 'majority',
            autoSelectFamily: false,            // Fix for SSL alert 80 / IP resolving issues
        });
        
        const conn = await connectionPromise;
        isConnected = conn.connections[0].readyState === 1;

        // Register event logging only once
        if (!reconnectHandlerRegistered) {
            mongoose.connection.on('connected', () =>
                console.log(`[DB] Pool connected | pid: ${process.pid}`)
            );
            mongoose.connection.on('disconnected', () => {
                isConnected = false;
                console.warn(`[DB] Disconnected | pid: ${process.pid}`);
            });
            mongoose.connection.on('error', (err) => {
                console.error(`[DB] Connection error | pid: ${process.pid} |`, err.message);
            });

            reconnectHandlerRegistered = true;
        }

        return conn;
    } catch (error) {
        connectionPromise = null; // Clear the cache on failure so we can retry
        isConnected = false;
        console.error(`❌ MongoDB Error (attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

        if (attempt < MAX_RETRIES) {
            console.log(`⏳ Retrying in ${RETRY_DELAY / 1000}s...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY));
            return connectDB(attempt + 1);
        }

        const isWatchMode = process.execArgv.some(arg => arg.startsWith('--watch')) || process.env.NODE_ENV === 'development';
        if (config.nodeEnv === 'production' && !isWatchMode) {
            process.exit(1);
        }
        console.log('⚠️  Running without database connection');
        return null;
    }
};

export default connectDB;

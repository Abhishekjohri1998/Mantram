import mongoose from 'mongoose';
import config from './env.js';

const MAX_RETRIES = 5;
const RETRY_DELAY = 3000; // 3 seconds
const AUTO_RECONNECT_DELAY = 5000; // 5 seconds
let reconnectHandlerRegistered = false;
let connectionPromise = null;
let isConnected = false;
let autoReconnectTimer = null;

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
            maxPoolSize: 3,                    // Low pool — most ops are sequential, not concurrent
            minPoolSize: 0,                    // No idle connections — create on demand
            serverSelectionTimeoutMS: 5000,    // 5s to pick a server
            socketTimeoutMS: 45000,            // 45s socket timeout
            connectTimeoutMS: 30000,           // 30s initial connect
            heartbeatFrequencyMS: 30000,       // heartbeat every 30s (was 10s — less monitoring overhead)
            maxIdleTimeMS: 10000,              // close idle connections after 10s (aggressive cleanup)
            readPreference: 'primary',         // M0 Free Tier: no benefit from secondaries, saves ~66% connections
            autoSelectFamily: false,           // Fix for SSL alert 80 / IP resolving issues
        });
        
        const conn = await connectionPromise;
        isConnected = conn.connections[0].readyState === 1;

        // Register event logging only once
        if (!reconnectHandlerRegistered) {
            mongoose.connection.on('connected', () => {
                isConnected = true;
                // Clear any pending auto-reconnect timer
                if (autoReconnectTimer) {
                    clearTimeout(autoReconnectTimer);
                    autoReconnectTimer = null;
                }
                console.log(`[DB] Pool connected | pid: ${process.pid}`);
            });

            mongoose.connection.on('disconnected', () => {
                isConnected = false;
                connectionPromise = null; // CRITICAL: Clear stale promise so next connectDB() creates a fresh connection
                console.warn(`[DB] Disconnected | pid: ${process.pid}`);

                // Auto-reconnect unless we're shutting down intentionally
                if (!mongoose.connection.isShuttingDown) {
                    console.log(`[DB] Will attempt auto-reconnect in ${AUTO_RECONNECT_DELAY / 1000}s...`);
                    autoReconnectTimer = setTimeout(() => {
                        autoReconnectTimer = null;
                        connectDB().catch(err => {
                            console.error(`[DB] Auto-reconnect failed: ${err.message}`);
                        });
                    }, AUTO_RECONNECT_DELAY);
                }
            });

            mongoose.connection.on('error', (err) => {
                isConnected = false;
                connectionPromise = null; // Clear stale promise on error too
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
            const delay = RETRY_DELAY * Math.min(attempt, 3); // Exponential-ish backoff: 3s, 6s, 9s, 9s, 9s
            console.log(`⏳ Retrying in ${delay / 1000}s...`);
            await new Promise(r => setTimeout(r, delay));
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

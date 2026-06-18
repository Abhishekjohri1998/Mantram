import { exec } from "child_process";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import config from "../config/env.js";

const LOCAL_SSD_PATH = config.localSsdPath;
const MONGO_URI = config.mongoUri;

if (!LOCAL_SSD_PATH) {
    console.error("❌ LOCAL_SSD_PATH is not configured in .env!");
    process.exit(1);
}

if (!MONGO_URI) {
    console.error("❌ MONGODB_URI is not configured in .env!");
    process.exit(1);
}

// Generate directory name with timestamp
const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
const timestampStr = new Date().toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-'); // YYYY-MM-DD_HH-MM-SS
const backupDir = path.join(LOCAL_SSD_PATH, "mongodb", `backup_${dateStr}`);

async function runMongodump() {
    console.log(`🔌 Attempting MongoDB backup using mongodump...`);
    
    // Construct mongodump command
    // Using --uri, and --out to specify the directory
    const command = `mongodump --uri="${MONGO_URI}" --out="${backupDir}/dump"`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.warn("⚠️ mongodump failed or is not installed. Fallback to JS export.");
                console.warn(`Details: ${error.message}`);
                return reject(error);
            }
            console.log(`✅ mongodump successful! Output saved to: ${path.join(backupDir, "dump")}`);
            resolve(true);
        });
    });
}

async function runJsFallbackBackup() {
    console.log(`Fallback: Exporting database collections to JSON...`);
    const jsonDir = path.join(backupDir, "json");
    fs.mkdirSync(jsonDir, { recursive: true });

    try {
        await connectDB();
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();

        console.log(`📋 Found ${collections.length} collections. Exporting...`);

        for (const col of collections) {
            const name = col.name;
            // Skip system collections if any
            if (name.startsWith("system.")) continue;

            console.log(`   Exporting collection: ${name}`);
            const docs = await db.collection(name).find({}).toArray();
            
            const filePath = path.join(jsonDir, `${name}.json`);
            // Write pretty printed JSON
            fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), "utf8");
        }

        console.log(`✅ Fallback JS export completed! Saved JSON files to: ${jsonDir}`);
    } catch (err) {
        console.error("❌ Fallback JS export failed:", err);
        throw err;
    } finally {
        await mongoose.connection.close();
        console.log("🔌 Database connection closed.");
    }
}

// Cleanup function to retain only the last 7 daily backups
function cleanupOldBackups() {
    const mongoBackupDir = path.join(LOCAL_SSD_PATH, "mongodb");
    if (!fs.existsSync(mongoBackupDir)) return;

    try {
        const files = fs.readdirSync(mongoBackupDir);
        const backups = files
            .filter(f => f.startsWith("backup_"))
            .map(f => ({
                name: f,
                path: path.join(mongoBackupDir, f),
                stat: fs.statSync(path.join(mongoBackupDir, f))
            }))
            .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Newest first

        // Keep last 7 backups, delete the rest
        if (backups.length > 7) {
            const toDelete = backups.slice(7);
            console.log(`🧹 Cleaning up ${toDelete.length} old backups...`);
            for (const backup of toDelete) {
                fs.rmSync(backup.path, { recursive: true, force: true });
                console.log(`   Deleted: ${backup.name}`);
            }
        }
    } catch (err) {
        console.error("❌ Failed to clean up old backups:", err.message);
    }
}

export async function backupMongo() {
    console.log(`🎬 Starting MongoDB Backup...`);
    fs.mkdirSync(backupDir, { recursive: true });

    try {
        await runMongodump();
    } catch (mongodumpErr) {
        // Fallback to JS/JSON export
        await runJsFallbackBackup();
    }

    // Run old backups cleanup
    cleanupOldBackups();
    console.log(`🎉 MongoDB Backup Finished!`);
}

import { fileURLToPath } from "url";

// Run script if called directly
const nodePath = fileURLToPath(import.meta.url);
if (nodePath === path.resolve(process.argv[1])) {
    backupMongo()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

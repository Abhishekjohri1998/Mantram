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

const mongoBackupDir = path.join(LOCAL_SSD_PATH, "mongodb");

// Determine which backup to restore
function getBackupFolder() {
    // Check command line arguments first (e.g., node restoreMongo.js backup_2026-06-17)
    const argFolder = process.argv[2];
    if (argFolder) {
        const fullPath = path.join(mongoBackupDir, argFolder);
        if (fs.existsSync(fullPath)) {
            return fullPath;
        }
        console.error(`❌ Specified backup folder does not exist: ${fullPath}`);
        process.exit(1);
    }

    // Default to the latest backup folder
    if (!fs.existsSync(mongoBackupDir)) {
        console.error(`❌ MongoDB backup directory does not exist: ${mongoBackupDir}`);
        process.exit(1);
    }

    const files = fs.readdirSync(mongoBackupDir);
    const backups = files
        .filter(f => f.startsWith("backup_"))
        .map(f => ({
            name: f,
            path: path.join(mongoBackupDir, f),
            stat: fs.statSync(path.join(mongoBackupDir, f))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime()); // Newest first

    if (backups.length === 0) {
        console.error("❌ No database backups found!");
        process.exit(1);
    }

    console.log(`ℹ️ No folder specified. Using the latest backup: ${backups[0].name}`);
    return backups[0].path;
}

async function runMongorestore(backupFolder) {
    const dumpPath = path.join(backupFolder, "dump");
    if (!fs.existsSync(dumpPath)) {
        throw new Error(`Dump folder not found at ${dumpPath}`);
    }

    console.log(`🔌 Attempting MongoDB restore using mongorestore...`);
    
    // --drop option drops existing collections before restoring to avoid duplicate keys / mixed data
    // We target the root of the dump directory
    const command = `mongorestore --uri="${MONGO_URI}" --drop "${dumpPath}"`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.warn("⚠️ mongorestore failed or is not installed. Trying fallback to JSON import.");
                console.warn(`Details: ${error.message}`);
                return reject(error);
            }
            console.log(`✅ mongorestore completed successfully!`);
            resolve(true);
        });
    });
}

async function runJsFallbackRestore(backupFolder) {
    const jsonDir = path.join(backupFolder, "json");
    if (!fs.existsSync(jsonDir)) {
        throw new Error(`JSON folder not found at ${jsonDir}. Restore aborted.`);
    }

    console.log(`Fallback: Restoring database collections from JSON files...`);

    try {
        await connectDB();
        const db = mongoose.connection.db;
        const files = fs.readdirSync(jsonDir).filter(f => f.endsWith(".json"));

        console.log(`📋 Found ${files.length} JSON files to import.`);

        for (const file of files) {
            const colName = path.basename(file, ".json");
            const filePath = path.join(jsonDir, file);
            
            console.log(`   Restoring collection: ${colName}...`);
            
            // Read and parse documents
            const dataStr = fs.readFileSync(filePath, "utf8");
            let docs = [];
            try {
                docs = JSON.parse(dataStr);
            } catch (jsonErr) {
                console.error(`❌ Failed to parse JSON file ${file}:`, jsonErr.message);
                continue;
            }

            // Clean up Mongo BSON types serialized as JSON (e.g. converting $oid string objects back to ObjectIds or keeping them as-is depending on schema)
            // Note: MongoDB node driver insertMany handles native strings or ObjectIds. In this JSON fallback,
            // we can convert JSON documents with $date or $oid back to MongoDB object types.
            const parsedDocs = docs.map(doc => deserializeMongoTypes(doc));

            // Drop existing collection to prevent duplication/conflicts
            try {
                await db.collection(colName).drop();
            } catch (dropErr) {
                // If collection doesn't exist, drop will fail, which is fine to ignore
            }

            if (parsedDocs.length > 0) {
                await db.collection(colName).insertMany(parsedDocs);
                console.log(`   ✅ Restored ${parsedDocs.length} documents into ${colName}.`);
            } else {
                console.log(`   ℹ️ Collection ${colName} was empty.`);
            }
        }

        console.log(`✅ JSON fallback restore completed successfully!`);
    } catch (err) {
        console.error("❌ Fallback restore failed:", err);
        throw err;
    } finally {
        await mongoose.connection.close();
        console.log("🔌 Database connection closed.");
    }
}

// Convert serialized Mongo types like {"$oid": "..."} and {"$date": "..."} back to proper Objects
function deserializeMongoTypes(obj) {
    if (obj === null || typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
        return obj.map(deserializeMongoTypes);
    }

    // Handle MongoDB BSON JSON format
    if (obj.$oid && typeof obj.$oid === "string") {
        return new mongoose.Types.ObjectId(obj.$oid);
    }

    if (obj.$date) {
        // Date can be an ISO string or epoch ms
        const dateVal = typeof obj.$date === "object" && obj.$date.$numberLong
            ? parseInt(obj.$date.$numberLong)
            : obj.$date;
        return new Date(dateVal);
    }

    // Process nested objects
    const newObj = {};
    for (const key of Object.keys(obj)) {
        newObj[key] = deserializeMongoTypes(obj[key]);
    }
    return newObj;
}

export async function restoreMongo() {
    const backupFolder = getBackupFolder();
    console.log(`🎬 Restoring MongoDB from: ${backupFolder}`);

    try {
        await runMongorestore(backupFolder);
    } catch (restoreErr) {
        // Fallback to JS JSON restore
        await runJsFallbackRestore(backupFolder);
    }
    
    console.log("🎉 MongoDB Restore Completed!");
}

import { fileURLToPath } from "url";

// Run script if called directly
const nodePath = fileURLToPath(import.meta.url);
if (nodePath === path.resolve(process.argv[1])) {
    restoreMongo()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

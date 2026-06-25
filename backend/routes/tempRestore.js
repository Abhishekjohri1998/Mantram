import { Router } from 'express';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import config from '../config/env.js';

const router = Router();

// Get all files in a directory recursively
function getFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(fullPath));
        } else {
            results.push(fullPath);
        }
    });
    return results;
}

// Deserialize MongoDB types from JSON
function deserializeMongoTypes(obj) {
    if (obj === null || typeof obj !== "object") return obj;
    if (obj instanceof Date) return obj;
    if (obj instanceof mongoose.Types.ObjectId) return obj;

    if (Array.isArray(obj)) {
        return obj.map(deserializeMongoTypes);
    }

    if (obj.$oid && typeof obj.$oid === "string") {
        return new mongoose.Types.ObjectId(obj.$oid);
    }

    if (obj.$date) {
        const dateVal = typeof obj.$date === "object" && obj.$date.$numberLong
            ? parseInt(obj.$date.$numberLong)
            : obj.$date;
        return new Date(dateVal);
    }

    const newObj = {};
    for (const key of Object.keys(obj)) {
        newObj[key] = deserializeMongoTypes(obj[key]);
    }
    return newObj;
}

// Parse BSON file containing concatenated BSON documents
function parseBsonFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const docs = [];
    let offset = 0;
    while (offset < buffer.length) {
        const size = buffer.readInt32LE(offset);
        if (size <= 0 || offset + size > buffer.length) {
            break;
        }
        const docBuffer = buffer.subarray(offset, offset + size);
        const doc = mongoose.mongo.BSON.deserialize(docBuffer);
        docs.push(doc);
        offset += size;
    }
    return docs;
}

router.get('/', async (req, res) => {
    try {
        // Authenticate secret
        const secret = req.query.secret;
        if (secret !== 'MantramRestore2026!') {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const action = req.query.action || 'list';
        const folder = req.query.folder;
        const targetEmail = req.query.email || 'user@mantram.ai';

        const localSsdPath = config.localSsdPath;

        if (action === 'diagnose') {
            const envPath = path.resolve(process.cwd(), '.env');
            let envContent = '';
            if (fs.existsSync(envPath)) {
                const lines = fs.readFileSync(envPath, 'utf8').split('\n');
                envContent = lines.map(line => {
                    const parts = line.split('=');
                    if (parts.length > 1) {
                        const name = parts[0].trim();
                        if (name.includes('KEY') || name.includes('SECRET') || name.includes('PASSWORD') || name.includes('URI') || name.includes('TOKEN') || name.includes('PASS')) {
                            return `${name}=[REDACTED]`;
                        }
                    }
                    return line;
                }).join('\n');
            }

            const checkPaths = [
                '/home/ec2-user',
                '/home/ec2-user/mongodb',
                '/home/ec2-user/backups',
                '/home/ec2-user/Mantram/backend',
                '/home/ec2-user/Mantram/backend/logs',
                '/home/ec2-user/.pm2/logs',
                '/home/ec2-user/deployments',
                'C:\\',
                'D:\\',
                localSsdPath
            ];

            const pathStatus = {};
            for (const p of checkPaths) {
                if (!p) continue;
                try {
                    if (fs.existsSync(p)) {
                        const stat = fs.statSync(p);
                        let files = [];
                        if (stat.isDirectory()) {
                            files = fs.readdirSync(p).slice(0, 50);
                        }
                        pathStatus[p] = { exists: true, isDirectory: stat.isDirectory(), files };
                    } else {
                        pathStatus[p] = { exists: false };
                    }
                } catch (e) {
                    pathStatus[p] = { exists: true, error: e.message };
                }
            }

            // Find backups recursively in EC2 home
            const findBackups = (startDir, depth = 0) => {
                let found = [];
                if (depth > 6) return found;
                try {
                    if (!fs.existsSync(startDir)) return found;
                    const files = fs.readdirSync(startDir);
                    for (const f of files) {
                        const full = path.join(startDir, f);
                        let stat;
                        try {
                            stat = fs.statSync(full);
                        } catch (e) {
                            continue;
                        }
                        if (stat.isDirectory()) {
                            if (f.startsWith('backup_') || f === 'mongodb' || f === 'F:') {
                                found.push(full);
                            } else {
                                if (f === 'node_modules' || f === '.git' || f === '.cache' || f === '.npm' || f === '.pm2') continue;
                                found = found.concat(findBackups(full, depth + 1));
                            }
                        }
                    }
                } catch (e) {}
                return found;
            };

            const discoveredBackups = findBackups('/home/ec2-user');

            return res.json({
                success: true,
                cwd: process.cwd(),
                configLocalSsdPath: localSsdPath,
                envContent,
                pathStatus,
                discoveredBackups
            });
        }
        if (!localSsdPath) {
            return res.status(400).json({ success: false, error: 'LOCAL_SSD_PATH not configured' });
        }

        const mongoBackupDir = path.join(localSsdPath, 'mongodb');
        if (!fs.existsSync(mongoBackupDir)) {
            return res.status(404).json({ success: false, error: `Backup dir not found: ${mongoBackupDir}` });
        }

        const db = mongoose.connection.db;
        const userDoc = await db.collection('users').findOne({ email: targetEmail });
        if (!userDoc) {
            return res.status(404).json({ success: false, error: `User ${targetEmail} not found in DB` });
        }
        const targetUserId = userDoc._id;
        const targetUserIdStr = targetUserId.toString();

        if (action === 'list') {
            const files = fs.readdirSync(mongoBackupDir);
            const folders = files.map(name => {
                const fullPath = path.join(mongoBackupDir, name);
                const stat = fs.statSync(fullPath);
                return {
                    name,
                    mtime: stat.mtime,
                    isDirectory: stat.isDirectory()
                };
            }).sort((a, b) => b.mtime - a.mtime);

            return res.json({ success: true, mongoBackupDir, folders });
        }

        if (!folder) {
            return res.status(400).json({ success: false, error: 'Missing folder parameter' });
        }

        const targetFolder = path.join(mongoBackupDir, folder);
        if (!fs.existsSync(targetFolder)) {
            return res.status(404).json({ success: false, error: `Folder not found: ${targetFolder}` });
        }

        // Scan all files in the target folder
        const allBackupFiles = getFiles(targetFolder);
        
        // Find and group files by JSON/BSON
        const backupFilesByCollection = {};
        for (const filePath of allBackupFiles) {
            const ext = path.extname(filePath).toLowerCase();
            if (ext === '.json' || ext === '.bson') {
                const colName = path.basename(filePath, ext);
                if (colName.startsWith('system.')) continue;
                backupFilesByCollection[colName] = {
                    path: filePath,
                    type: ext === '.json' ? 'JSON' : 'BSON'
                };
            }
        }

        // Step 1: Read brands to find user's brand IDs
        let userBrandIds = [];
        const brandsConfig = backupFilesByCollection['brands'];
        if (brandsConfig) {
            let brands = [];
            if (brandsConfig.type === 'JSON') {
                const raw = fs.readFileSync(brandsConfig.path, 'utf8');
                brands = JSON.parse(raw).map(deserializeMongoTypes);
            } else {
                brands = parseBsonFile(brandsConfig.path);
            }
            
            const userBrands = brands.filter(b => {
                const u = b.user || b.userId;
                return u && u.toString() === targetUserIdStr;
            });
            userBrandIds = userBrands.map(b => b._id.toString());
        }

        const stats = {};
        const restoreLog = [];

        // Helper to check if a document belongs to the target user or their brands
        const belongsToUser = (doc, colName) => {
            const userRef = doc.user || doc.userId;
            if (userRef && userRef.toString() === targetUserIdStr) {
                return true;
            }
            
            // Check brand references
            const brandRef = doc.brand || doc.brandId;
            if (brandRef && userBrandIds.includes(brandRef.toString())) {
                return true;
            }

            // Fallback for special collection-specific checks
            if (colName === 'users' && doc._id && doc._id.toString() === targetUserIdStr) {
                return true;
            }

            return false;
        };

        if (action === 'inspect') {
            for (const colName of Object.keys(backupFilesByCollection)) {
                const fileConfig = backupFilesByCollection[colName];
                let docs = [];
                if (fileConfig.type === 'JSON') {
                    const raw = fs.readFileSync(fileConfig.path, 'utf8');
                    docs = JSON.parse(raw).map(deserializeMongoTypes);
                } else {
                    docs = parseBsonFile(fileConfig.path);
                }

                const matchedDocs = docs.filter(doc => belongsToUser(doc, colName));
                stats[colName] = {
                    totalInBackup: docs.length,
                    userDocsInBackup: matchedDocs.length
                };
            }

            return res.json({
                success: true,
                folder,
                targetUserIdStr,
                userBrandIds,
                stats
            });
        }

        if (action === 'restore') {
            let totalRestored = 0;
            // We want to restore brands first so userBrandIds is fully populated
            const colNamesOrdered = ['brands', ...Object.keys(backupFilesByCollection).filter(c => c !== 'brands')];

            for (const colName of colNamesOrdered) {
                const fileConfig = backupFilesByCollection[colName];
                if (!fileConfig) continue;

                let docs = [];
                if (fileConfig.type === 'JSON') {
                    const raw = fs.readFileSync(fileConfig.path, 'utf8');
                    docs = JSON.parse(raw).map(deserializeMongoTypes);
                } else {
                    docs = parseBsonFile(fileConfig.path);
                }

                const matchedDocs = docs.filter(doc => belongsToUser(doc, colName));
                if (matchedDocs.length > 0) {
                    let colRestored = 0;
                    for (const doc of matchedDocs) {
                        // Upsert
                        await db.collection(colName).updateOne(
                            { _id: doc._id },
                            { $set: doc },
                            { upsert: true }
                        );
                        colRestored++;
                        totalRestored++;
                    }
                    restoreLog.push(`Restored ${colRestored} documents to collection ${colName}`);
                }
            }

            return res.json({
                success: true,
                folder,
                targetUserIdStr,
                totalRestored,
                restoreLog
            });
        }

        return res.status(400).json({ success: false, error: `Invalid action: ${action}` });
    } catch (err) {
        console.error('Selective restore failed:', err);
        return res.status(500).json({ success: false, error: err.message, stack: err.stack });
    }
});

export default router;

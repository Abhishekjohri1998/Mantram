import { syncS3ToLocal } from "./syncS3ToLocal.js";
import { backupMongo } from "./backupMongoToLocal.js";

console.log("⏰ Automated Backup Scheduler initialized.");

async function runBackupFlow() {
    console.log(`⏰ Running backup job at: ${new Date().toLocaleString()}`);
    try {
        await syncS3ToLocal();
        await backupMongo();
        console.log("✅ Backup job completed successfully.");
    } catch (err) {
        console.error("❌ Backup job failed:", err);
    }
}

// Function to start the scheduler
export function startBackupScheduler() {
    console.log("⏰ Starting backup scheduler loop (checks daily at 2:00 AM)...");
    
    // Check every hour
    const checkInterval = 60 * 60 * 1000;
    
    setInterval(async () => {
        const now = new Date();
        // Trigger at 2:00 AM (hour 2)
        if (now.getHours() === 2) {
            await runBackupFlow();
        }
    }, checkInterval);
}

import { fileURLToPath } from "url";

// Run immediately if this script is executed directly
const nodePath = fileURLToPath(import.meta.url);
if (nodePath === path.resolve(process.argv[1])) {
    console.log("🚀 Running manual/immediate backup via scheduler...");
    runBackupFlow()
        .then(() => {
            console.log("Scheduler starting daily loop...");
            startBackupScheduler();
        })
        .catch(err => {
            console.error("Immediate backup run failed:", err);
            process.exit(1);
        });
}

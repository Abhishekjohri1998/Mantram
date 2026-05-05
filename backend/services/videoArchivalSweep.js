/**
 * Video Archival Sweep — Defense Layer 2
 *
 * Periodically scans for completed VideoProjects that have a provider CDN
 * URL but are NOT yet archived to S3. Downloads them and uploads to S3
 * before the CDN expires (providers retain for 1-7 days only).
 *
 * Also archives thumbnails and first-frame images.
 *
 * Configurable via env:
 *   VIDEO_ARCHIVAL_SWEEP_INTERVAL_MS — sweep interval (default: 2 hours)
 *   VIDEO_ARCHIVAL_CONCURRENCY       — max concurrent downloads (default: 3)
 */

import mongoose from 'mongoose';

// Lazy imports to avoid circular dependency at module load time
let VideoProject;
let downloadAndUploadVideoToS3;
let mirrorUrlToS3;

async function loadDeps() {
    if (!VideoProject) {
        VideoProject = (await import('../models/VideoProject.js')).default;
    }
    if (!downloadAndUploadVideoToS3) {
        const mod = await import('../routes/video-studio.js');
        downloadAndUploadVideoToS3 = mod.downloadAndUploadVideoToS3;
    }
    if (!mirrorUrlToS3) {
        const s3Mod = await import('../utils/s3.js');
        mirrorUrlToS3 = s3Mod.mirrorUrlToS3;
    }
}

/**
 * Archive thumbnail and first-frame images to S3 for a given project.
 * Fire-and-forget — failure here should never block video archival.
 */
async function archiveProjectAssets(project) {
    const projectId = project._id.toString();
    const userId = project.user?.toString() || 'unknown';
    let updated = {};

    try {
        // Archive thumbnail
        const thumbnailUrl = project.generation?.thumbnailUrl;
        if (thumbnailUrl && thumbnailUrl.startsWith('http') && !thumbnailUrl.includes('amazonaws.com')) {
            const thumbKey = `videos/${userId}/${projectId}-thumb.jpg`;
            const s3Thumb = await mirrorUrlToS3(thumbnailUrl, thumbKey, 'image/jpeg');
            if (s3Thumb) {
                updated['generation.s3ThumbnailUrl'] = s3Thumb;
                console.log(`  🖼️ Thumbnail archived: ${s3Thumb.substring(0, 60)}`);
            }
        }

        // Archive first-frame image
        const firstFrameUrl = project.firstFrameUrl;
        if (firstFrameUrl && firstFrameUrl.startsWith('http') && !firstFrameUrl.includes('amazonaws.com')) {
            const ffKey = `videos/${userId}/${projectId}-firstframe.jpg`;
            const s3FF = await mirrorUrlToS3(firstFrameUrl, ffKey, 'image/jpeg');
            if (s3FF) {
                updated.firstFrameUrl = s3FF;
                console.log(`  🖼️ First-frame archived: ${s3FF.substring(0, 60)}`);
            }
        }

        if (Object.keys(updated).length > 0) {
            await VideoProject.findByIdAndUpdate(projectId, updated);
        }
    } catch (e) {
        console.warn(`  ⚠️ Asset archival error for ${projectId}: ${e.message}`);
    }
}

/**
 * Run one sweep cycle — scan and archive un-archived completed videos.
 */
async function runSweep() {
    if (mongoose.connection.readyState !== 1) {
        console.log('📦 [VideoArchival] Skipping sweep — DB not connected');
        return;
    }

    await loadDeps();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const concurrency = parseInt(process.env.VIDEO_ARCHIVAL_CONCURRENCY, 10) || 3;

    try {
        // Find completed projects that have a CDN video URL but no S3 archive
        const unarchived = await VideoProject.find({
            status: { $in: ['completed', 'done', 'critique'] },
            'generation.videoUrl': { $exists: true, $ne: '' },
            $or: [
                { 'generation.s3VideoUrl': { $exists: false } },
                { 'generation.s3VideoUrl': '' },
                { 'generation.s3VideoUrl': null },
            ],
            updatedAt: { $gte: sevenDaysAgo }, // Only within CDN retention window
        })
            .select('_id user generation.videoUrl generation.thumbnailUrl firstFrameUrl')
            .sort({ updatedAt: -1 })
            .limit(30) // Process max 30 per sweep to avoid overwhelming S3
            .lean();

        if (unarchived.length === 0) {
            // Quiet — no spam in logs
            return;
        }

        console.log(`📦 [VideoArchival] Sweep: ${unarchived.length} un-archived video(s) found. Archiving (concurrency=${concurrency})...`);

        // Process in batches respecting concurrency limit
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < unarchived.length; i += concurrency) {
            const batch = unarchived.slice(i, i + concurrency);
            const results = await Promise.allSettled(batch.map(async (project) => {
                const videoUrl = project.generation?.videoUrl;
                if (!videoUrl) return null;

                // Skip if already an S3 URL (shouldn't happen due to query, but safety check)
                if (videoUrl.includes('amazonaws.com')) return null;

                console.log(`  📥 [${project._id}] Archiving: ${videoUrl.substring(0, 60)}...`);
                const s3Url = await downloadAndUploadVideoToS3(project._id.toString(), videoUrl);

                if (s3Url) {
                    // Mark archival timestamp
                    await VideoProject.findByIdAndUpdate(project._id, {
                        'generation.s3ArchivedAt': new Date(),
                    });

                    // Archive associated assets (thumbnail, first-frame) — non-blocking
                    archiveProjectAssets(project).catch(() => { });

                    return s3Url;
                }
                return null;
            }));

            results.forEach((r) => {
                if (r.status === 'fulfilled' && r.value) successCount++;
                else if (r.status === 'rejected') failCount++;
            });
        }

        console.log(`📦 [VideoArchival] Sweep complete: ${successCount} archived, ${failCount} failed, ${unarchived.length - successCount - failCount} skipped`);
    } catch (e) {
        console.error('📦 [VideoArchival] Sweep error:', e.message);
    }
}

/**
 * Start the periodic archival sweep.
 * Default interval: 2 hours (configurable via VIDEO_ARCHIVAL_SWEEP_INTERVAL_MS).
 */
export function startVideoArchivalSweep() {
    const intervalMs = parseInt(process.env.VIDEO_ARCHIVAL_SWEEP_INTERVAL_MS, 10) || (2 * 60 * 60 * 1000); // 2 hours default
    const intervalMin = Math.round(intervalMs / 60000);

    console.log(`📦 Video Archival Sweep active — runs every ${intervalMin} minutes`);

    // Run initial sweep after a short delay (let server finish booting)
    setTimeout(() => {
        runSweep().catch(e => console.error('📦 [VideoArchival] Initial sweep failed:', e.message));
        markAbandonedDrafts().catch(e => console.error('📦 [VideoArchival] Initial abandoned sweep failed:', e.message));
    }, 60000); // 1 minute after boot

    // Schedule periodic sweeps
    setInterval(() => {
        runSweep().catch(e => console.error('📦 [VideoArchival] Sweep failed:', e.message));
        markAbandonedDrafts().catch(e => console.error('📦 [VideoArchival] Abandoned sweep failed:', e.message));
    }, intervalMs);
}

/**
 * Mark abandoned draft projects for lifecycle cleanup.
 * Targets: isDraft=true projects that are failed or stuck generating for >7 days.
 * These will be picked up by S3 lifecycle rules for automatic deletion.
 */
export async function markAbandonedDrafts() {
    await loadDeps();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    try {
        const abandoned = await VideoProject.updateMany(
            {
                isDraft: true,
                status: { $in: ['failed', 'advanced-generating'] },
                createdAt: { $lt: cutoff },
                abandonedAt: { $exists: false },
            },
            { $set: { abandonedAt: new Date() } }
        );
        if (abandoned.modifiedCount > 0) {
            console.log(`🗑️ [Sweep] Marked ${abandoned.modifiedCount} abandoned draft project(s)`);
        }
    } catch (e) {
        console.warn(`⚠️ [Sweep] Abandoned draft marking failed: ${e.message}`);
    }
}

export { runSweep };


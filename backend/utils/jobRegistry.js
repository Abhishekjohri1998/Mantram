/**
 * Tracks in-flight background jobs (setImmediate) for graceful shutdown
 */

const inFlightJobs = new Set();

export function registerJob(jobId) {
    inFlightJobs.add(jobId);
}

export function unregisterJob(jobId) {
    inFlightJobs.delete(jobId);
}

export function getInFlightJobs() {
    return Array.from(inFlightJobs);
}

export function hasInFlightJobs() {
    return inFlightJobs.size > 0;
}

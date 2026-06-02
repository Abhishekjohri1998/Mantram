import * as faceapi from '@vladmandic/face-api';
import canvas from 'canvas';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { uploadToS3 } from './s3.js';

// Setup canvas for Node environment
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let modelsLoaded = false;

async function loadModels() {
    if (modelsLoaded) return;
    const modelPath = path.join(__dirname, '..', 'weights');
    
    // We only need SSD Mobilenet (fastest for basic detection) and Face Recognition for clustering
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
    
    modelsLoaded = true;
    console.log('✅ face-api models loaded');
}

/**
 * Calculates cosine similarity between two descriptors (arrays of numbers)
 */
function cosineSimilarity(desc1, desc2) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < desc1.length; i++) {
        dotProduct += desc1[i] * desc2[i];
        normA += desc1[i] * desc1[i];
        normB += desc2[i] * desc2[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Detects faces in an array of frame buffers, crops them, clusters by identity,
 * and extracts the primary subject.
 * 
 * @param {Array<{buffer: Buffer, url: string}>} frames 
 * @param {string} videoId
 * @returns {Promise<{primaryFaceUrl: string|null, allFaces: Array}>}
 */
export async function detectAndClusterFaces(frames, videoId) {
    try {
        await loadModels();

        const detectedFaces = [];

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            if (!frame.localBuffer) continue;

            const img = await canvas.loadImage(frame.localBuffer);
            
            // Detect all faces in the image
            const detections = await faceapi.detectAllFaces(img)
                .withFaceLandmarks()
                .withFaceDescriptors();

            for (let j = 0; j < detections.length; j++) {
                const det = detections[j];
                const box = det.detection.box;
                
                // Discard tiny background faces
                if (box.width < 50 || box.height < 50) continue;

                // Crop with 40px padding
                const pad = 40;
                const x = Math.max(0, box.x - pad);
                const y = Math.max(0, box.y - pad);
                const w = Math.min(img.width - x, box.width + pad * 2);
                const h = Math.min(img.height - y, box.height + pad * 2);

                const faceCanvas = canvas.createCanvas(w, h);
                const ctx = faceCanvas.getContext('2d');
                ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
                
                const buffer = faceCanvas.toBuffer('image/jpeg');

                detectedFaces.push({
                    frameIndex: i,
                    descriptor: det.descriptor,
                    score: det.detection.score,
                    width: w,
                    height: h,
                    buffer,
                    area: w * h
                });
            }
        }

        console.log(`👤 [faceDetection] Found ${detectedFaces.length} total face crops.`);
        if (detectedFaces.length === 0) return { primaryFaceUrl: null, allFaces: [] };

        // Clustering Phase (Cosine Similarity > 0.75)
        const clusters = [];
        const threshold = 0.75;

        for (const face of detectedFaces) {
            let foundCluster = false;
            for (const cluster of clusters) {
                // Compare with cluster centroid (using the first face added as approx centroid)
                const sim = cosineSimilarity(face.descriptor, cluster.faces[0].descriptor);
                if (sim >= threshold) {
                    cluster.faces.push(face);
                    cluster.totalArea += face.area;
                    foundCluster = true;
                    break;
                }
            }
            if (!foundCluster) {
                clusters.push({
                    id: `Person_${clusters.length + 1}`,
                    faces: [face],
                    totalArea: face.area // sum of face sizes to determine prominence
                });
            }
        }

        console.log(`👤 [faceDetection] Clustered into ${clusters.length} unique identities.`);

        // Primary subject is the cluster with the largest presence (most frames / biggest faces)
        clusters.sort((a, b) => b.totalArea - a.totalArea);
        const primaryCluster = clusters[0];

        // Get the best crop from primary cluster (sharpest/highest score)
        primaryCluster.faces.sort((a, b) => b.score - a.score);
        const bestPrimaryFace = primaryCluster.faces[0];

        // Upload best face to S3
        const key = `youtube-studio-uploads/faces/${videoId}/primary_face_${Date.now()}.jpg`;
        const primaryFaceUrl = await uploadToS3(bestPrimaryFace.buffer, key, 'image/jpeg');
        
        console.log(`✅ [faceDetection] Primary subject identified! Uploaded to: ${primaryFaceUrl}`);

        return {
            primaryFaceUrl,
            allFaces: clusters.map(c => ({
                id: c.id,
                count: c.faces.length
            }))
        };

    } catch (err) {
        console.error('❌ [faceDetection] Error:', err);
        return { primaryFaceUrl: null, allFaces: [] };
    }
}

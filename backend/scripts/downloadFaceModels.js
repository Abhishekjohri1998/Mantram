import fs from 'fs';
import path from 'path';
import https from 'https';

const MODEL_DIR = path.join(process.cwd(), 'weights');

const models = [
    'ssd_mobilenetv1_model-weights_manifest.json',
    'ssd_mobilenetv1_model-shard1',
    'ssd_mobilenetv1_model-shard2',
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const BASE_URL = 'https://raw.githubusercontent.com/vladmandic/face-api/master/model/';

if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
}

async function downloadFile(filename) {
    const url = BASE_URL + filename;
    const dest = path.join(MODEL_DIR, filename);
    
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) {
            console.log(`✅ Already exists: ${filename}`);
            return resolve();
        }
        
        console.log(`⬇️ Downloading ${filename}...`);
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ Saved ${filename}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    try {
        for (const model of models) {
            await downloadFile(model);
        }
        console.log('🎉 All models downloaded successfully!');
    } catch (err) {
        console.error('❌ Error downloading models:', err);
    }
}

main();

import fs from 'fs';
import puppeteer from 'puppeteer';

export function getChromePath() {
    const commonPaths = [
        // Linux paths
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        // macOS paths
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        // Windows paths
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    for (const path of commonPaths) {
        if (fs.existsSync(path)) {
            return path;
        }
    }
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    return undefined;
}

export async function launchPuppeteer(options = {}) {
    const defaultOptions = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        ...options
    };

    try {
        console.log('[Puppeteer] Attempting default browser launch...');
        return await puppeteer.launch(defaultOptions);
    } catch (err) {
        console.warn(`[Puppeteer] Default launch failed: ${err.message}. Checking system Chrome/Chromium...`);
        const chromePath = getChromePath();
        if (chromePath) {
            console.log(`[Puppeteer] Found system Chrome/Chromium at: ${chromePath}. Launching...`);
            return await puppeteer.launch({
                ...defaultOptions,
                executablePath: chromePath
            });
        }
        throw err;
    }
}

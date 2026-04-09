const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    // Log things
    page.on('console', msg => {
        if(msg.type() === 'error') console.log('PAGE ERROR LOG:', msg.text());
        else console.log('PAGE LOG:', msg.text());
    });
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    try {
        console.log("Navigating to auth...");
        await page.goto('http://localhost:5173/auth', { waitUntil: 'networkidle2' });
        
        await page.type('input[type="email"]', 'user@mantram.ai');
        await page.type('input[type="password"]', 'Mantram@2024');
        await page.click('form button[type="submit"]');
        
        console.log("Submitted login. Waiting for navigation...");
        await new Promise(r => setTimeout(r, 2000));
        
        console.log("Navigating to Dashboard manually just in case...");
        await page.goto('http://localhost:5173/dashboard', { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 2000));

        console.log("Dashboard execution complete. Reading URL:", page.url());
        
    } catch(e) {
        console.log("Load error:", e);
    }
    await browser.close();
})();

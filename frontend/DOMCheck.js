import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/video-studio');
    await page.waitForTimeout(2000);
    const rect = await page.evaluate(() => {
        const el = document.querySelector('.studio-tab-bar');
        return el ? el.getBoundingClientRect() : null;
    });
    const headerRect = await page.evaluate(() => {
        const el = document.querySelector('header');
        return el ? el.getBoundingClientRect() : null;
    });
    console.log('Header React:', headerRect);
    console.log('TabBar Rect:', rect);
    
    const mainRect = await page.evaluate(() => {
        const el = document.querySelector('main');
        return el ? el.getBoundingClientRect() : null;
    });
    console.log('Main Rect:', mainRect);

    // Let's scroll the page down by 500px and measure again
    await page.evaluate(() => {
        document.querySelector('main').scrollBy(0, 500);
    });
    await page.waitForTimeout(1000);

    const rectAfter = await page.evaluate(() => {
        const el = document.querySelector('.studio-tab-bar');
        return el ? el.getBoundingClientRect() : null;
    });
    console.log('TabBar Rect After Scroll:', rectAfter);

    await browser.close();
})();


import s3Utils from './backend/utils/s3.js';
import config from './backend/config/env.js';

async function testSign() {
    const testUrl = "https://mantram-assets.s3.ap-south-1.amazonaws.com/creatives/69ce12c11c8801a02e26e7dd/1775742623976.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIAXD576ZD6LJTSQ44B%2F20260410%2Fap-south-1%2Fs3%2Faws4_request&X-Amz-Date=20260410T103142Z&X-Amz-Expires=3600&X-Amz-Signature=357a0a1c837611880d35c8073741c3d3b3cc518ba0f1640313b90f870aa83245&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject";
    
    console.log("Input Bucket Config:", config.aws.bucket);
    
    // We can't easily run it because of imports/env, but let's mock the logic
    const url = new URL(testUrl);
    const pathParts = url.pathname.split('/').filter(Boolean);
    let key;
    if (url.hostname.includes('.amazonaws.com')) {
        if (pathParts[0] === config.aws.bucket) {
            key = pathParts.slice(1).join('/');
        } else {
            key = pathParts.join('/');
        }
    }
    console.log("Extracted Key:", key);
    
    if (key === "creatives/69ce12c11c8801a02e26e7dd/1775742623976.png") {
        console.log("✅ Key extraction logic is correct for this URL.");
    } else {
        console.log("❌ Key extraction logic is WRONG.");
    }
}

testSign();

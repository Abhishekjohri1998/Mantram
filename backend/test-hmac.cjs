const crypto = require('crypto');

function verify(rawBody, hmacHeader, secret) {
    const computedHmac = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');

    console.log('Computed:', computedHmac);
    console.log('Header:  ', hmacHeader);

    try {
        const sigBuffer = Buffer.from(hmacHeader, 'base64');
        const computedBuffer = Buffer.from(computedHmac, 'base64');

        if (sigBuffer.length !== computedBuffer.length) {
            console.log('Length mismatch');
            return false;
        }

        return crypto.timingSafeEqual(sigBuffer, computedBuffer);
    } catch (e) {
        console.log('Error:', e.message);
        return false;
    }
}

const secret = 'hush';
const body = '{"foo":"bar"}';
const hmac = crypto.createHmac('sha256', secret).update(body).digest('base64');

console.log('Test 1 (Valid):', verify(body, hmac, secret));
console.log('Test 2 (Invalid):', verify(body, hmac, 'wrong-secret'));

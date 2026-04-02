import { safeErrorMessage } from '../backend/utils/safeError.js';

async function test() {
    console.log('--- Starting safeErrorMessage robustness test ---');

    const cases = [
        { name: 'String error', err: new Error('Something went wrong'), expected: 'Internal server error' },
        { name: 'User-facing error', err: new Error('Model is busy, try again'), expected: 'Model is busy, try again' },
        { name: 'Object as message', err: { message: { detail: 'rate limit' } }, expected: '{"detail":"rate limit"}' }, // After my fix, it should return fallback or the stringified msg
        { name: 'Null error', err: null, expected: 'Internal server error' },
        { name: 'Undefined error', err: undefined, expected: 'Internal server error' },
        { name: 'Array error', err: ['busy'], expected: 'Internal server error' } // depends on how String() handles it
    ];

    for (const c of cases) {
        try {
            const result = safeErrorMessage(c.err);
            console.log(`✅ Case [${c.name}]: Produced "${result}"`);
        } catch (e) {
            console.error(`❌ Case [${c.name}]: FAILED with error:`, e.message);
        }
    }
}

test();

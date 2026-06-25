// Set environment variables before any ES module imports are evaluated
process.env.PORT = '9999';
process.env.NODE_ENV = 'test';

console.log('⚡ Starting Mantram AI Load Test Launcher...');
console.log('⚡ Overriding PORT=9999 and NODE_ENV=test...');

// Dynamically import the main load test script
import('./load-test.js').catch(err => {
    console.error('❌ Failed to run load test:', err);
    process.exit(1);
});

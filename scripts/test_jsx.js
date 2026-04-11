const fs = require('fs');
const code = fs.readFileSync('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'utf8');
try {
  require('@babel/core').parse(code, {
    presets: ['@babel/preset-react'],
    filename: 'AdvancedMode.jsx',
    parserOpts: { plugins: ['jsx', 'typescript'] }
  });
  console.log("Syntax is OK!");
} catch (err) {
  console.error("Syntax Error:", err.message);
}

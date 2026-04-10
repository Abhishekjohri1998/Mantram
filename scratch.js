const fs = require('fs');
const babel = require('@babel/core');

const code = fs.readFileSync('frontend/src/pages/UserDashboard.jsx', 'utf8');

try {
  babel.transformSync(code, {
    presets: ['@babel/preset-react'],
    filename: 'UserDashboard.jsx'
  });
  print("No babel syntax errors found.");
} catch (e) {
  console.error("Syntax Error found:", e.message);
}

const { ESLint } = require("eslint");
(async function main() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["frontend/src/components/VideoStudio/AdvancedMode.jsx"]);
  const formatter = await eslint.loadFormatter("stylish");
  const resultText = formatter.format(results);
  console.log(resultText);
})().catch(console.error);

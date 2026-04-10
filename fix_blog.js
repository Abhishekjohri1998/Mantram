const fs = require('fs');
let code = fs.readFileSync('frontend/src/pages/ContentStudio.jsx', 'utf8');

code = code.replace(/const StylePickerPanel = \(\{ sectionIndex, onCancel \}\) => \(/g, "const renderStylePickerPanel = (sectionIndex, onCancel) => (");

code = code.replace(/<StylePickerPanel sectionIndex={-1} onCancel={\(\) => setImageStylePicker\(null\)} \/>/g, "{renderStylePickerPanel(-1, () => setImageStylePicker(null))}");

code = code.replace(/<StylePickerPanel sectionIndex=\{index\} onCancel=\{\(\) => setImageStylePicker\(null\)\} \/>/g, "{renderStylePickerPanel(index, () => setImageStylePicker(null))}");

fs.writeFileSync('frontend/src/pages/ContentStudio.jsx', code);
console.log("Successfully fixed StylePickerPanel pattern!");

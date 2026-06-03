const fs = require('fs');
let code = fs.readFileSync('frontend/src/pages/ContentStudio.jsx', 'utf8');

// 1. Add import
if (!code.includes('import BlogEditor from')) {
    code = code.replace(/import \{ useCallback, lazy, Suspense \} from 'react'/, "import { useCallback, lazy, Suspense } from 'react'\nimport BlogEditor from '../components/BlogEditor'");
}

// 2. Remove the inline BlogEditorView function explicitly
// We find where it starts and ends
const startStr = '// BLOG EDITOR VIEW — Medium-Style Rich Editor';
const endStr = '// RESULT VIEW (with Edit & AI Refine)';

const startIdx = code.indexOf(startStr);
const endIdx = code.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    // Also remove the preceding === block for clean up
    const blockStart = code.lastIndexOf('// ===============================', startIdx);
    const actualStart = blockStart !== -1 ? blockStart : startIdx;
    
    // We slice out the entire BlogEditorView block!
    code = code.slice(0, actualStart) + code.slice(endIdx);
}

// 3. Replace the usage of BlogEditorView
code = code.replace(
    /<BlogEditorView[\s\S]+?onGenerateImage=\{handleBlogImageGenerate\}\n\s*\/>/g,
`                <BlogEditor
                    initialContent={blogResult}
                    activeBrand={activeBrand}
                    title={blogResult?.title || ''}
                    onBack={resetAll}
                    onSave={(html) => console.log('Saved custom blog:', html)}
                    brandId={activeBrand?._id}
                />`
);

fs.writeFileSync('frontend/src/pages/ContentStudio.jsx', code);
console.log("Successfully patched ContentStudio.jsx");

import fs from 'fs';
import path from 'path';

const backendDir = 'd:/mantram/Mantram AI/Mantram AI/backend';

function findJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git') continue;
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            findJsFiles(filePath, fileList);
        } else if (filePath.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

const jsFiles = findJsFiles(backendDir);
let filesModified = 0;

for (const file of jsFiles) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Pattern to match the bad if block
    // e.g.
    // if (typeof controller.signal.setMaxListeners === 'function') {
    //     controller.signal.setMaxListeners(30);
    // }
    const badPattern = /if\s*\(\s*typeof\s+([a-zA-Z0-9_\.]+)\.setMaxListeners\s*===\s*'function'\s*\)\s*\{\s*\1\.setMaxListeners\(\s*30\s*\);\s*\}/g;
    
    if (badPattern.test(content)) {
        console.log(`Fixing: ${file}`);
        content = content.replace(badPattern, "try { setMaxListeners(30, $1); } catch (e) {}");
        
        // Add import if not present
        if (!content.includes("from 'events'")) {
            // Find the last import statement
            const importsEnd = content.lastIndexOf("import ");
            if (importsEnd !== -1) {
                const endOfLine = content.indexOf("\n", importsEnd);
                content = content.slice(0, endOfLine + 1) + "import { setMaxListeners } from 'events';\n" + content.slice(endOfLine + 1);
            } else {
                content = "import { setMaxListeners } from 'events';\n" + content;
            }
        }
        
        fs.writeFileSync(file, content, 'utf8');
        filesModified++;
    }
}

console.log(`Complete. Modified ${filesModified} files.`);

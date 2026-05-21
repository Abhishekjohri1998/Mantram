import fs from 'fs';
import path from 'path';

function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules') continue;
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findJsFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = findJsFiles(process.cwd());
for (const file of files) {
  try {
    await import('file://' + file);
  } catch (e) {
    if (e.name === 'SyntaxError') {
      console.log('SYNTAX ERROR IN:', file);
      console.log(e.message);
    }
  }
}

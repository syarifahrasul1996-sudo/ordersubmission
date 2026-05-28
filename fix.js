const fs = require('fs');
const glob = require('glob'); // Not using glob, just simple recursive loop
const path = require('path');

function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceInDir(fullPath);
        } else if (fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            content = content.replace(/\bbg-white\b/g, 'bg-background');
            content = content.replace(/\bbg-white\/(\d+)\b/g, 'bg-background/$1');
            fs.writeFileSync(fullPath, content);
        }
    }
}

replaceInDir('./src');

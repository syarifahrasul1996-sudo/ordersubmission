const fs = require('fs');
const path = require('path');

const replacements = [
  { regex: /rounded-\[8px\]/g, replacement: 'rounded-lg' },
  { regex: /sm:rounded-\[8px\]/g, replacement: 'sm:rounded-lg' },
  { regex: /rounded-\[10px\]/g, replacement: 'rounded-[10px]' }, // Can keep custom if we really want, or maybe xl which is 12px.
  { regex: /rounded-\[12px\]/g, replacement: 'rounded-xl' },
  { regex: /sm:rounded-\[12px\]/g, replacement: 'sm:rounded-xl' },
  { regex: /rounded-\[14px\]/g, replacement: 'rounded-[14px]' }, // mid size between xl and 2xl
  { regex: /rounded-\[16px\]/g, replacement: 'rounded-2xl' },
  { regex: /sm:rounded-\[16px\]/g, replacement: 'sm:rounded-2xl' },
  { regex: /rounded-\[20px\]/g, replacement: 'rounded-[20px]' }, // custom size
  { regex: /rounded-\[24px\]/g, replacement: 'rounded-3xl' },
  { regex: /sm:rounded-\[24px\]/g, replacement: 'sm:rounded-3xl' }
];

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(dirPath);
  });
}

walkDir('src', (file) => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    replacements.forEach(({ regex, replacement }) => {
      content = content.replace(regex, replacement);
    });
    if (content !== original) {
      fs.writeFileSync(file, content, 'utf8');
    }
  }
});

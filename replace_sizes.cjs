const fs = require('fs');
const path = require('path');

const replacements = [
  { regex: /text-\[8px\]/g, replacement: 'text-[10px]' },
  { regex: /sm:text-\[8px\]/g, replacement: 'sm:text-[10px]' },
  { regex: /text-\[9px\]/g, replacement: 'text-[10px]' },
  { regex: /sm:text-\[9px\]/g, replacement: 'sm:text-[10px]' },
  { regex: /text-\[10px\]/g, replacement: 'text-[10px]' },
  { regex: /sm:text-\[10px\]/g, replacement: 'sm:text-[10px]' },
  { regex: /text-\[11px\]/g, replacement: 'text-xs' },
  { regex: /sm:text-\[11px\]/g, replacement: 'sm:text-xs' },
  { regex: /text-\[12px\]/g, replacement: 'text-xs' },
  { regex: /sm:text-\[12px\]/g, replacement: 'sm:text-xs' },
  { regex: /text-\[13px\]/g, replacement: 'text-sm' },
  { regex: /sm:text-\[13px\]/g, replacement: 'sm:text-sm' },
  { regex: /text-\[14px\]/g, replacement: 'text-sm' },
  { regex: /sm:text-\[14px\]/g, replacement: 'sm:text-sm' },
  { regex: /text-\[15px\]/g, replacement: 'text-base' },
  { regex: /sm:text-\[15px\]/g, replacement: 'sm:text-base' },
  { regex: /text-\[16px\]/g, replacement: 'text-base' },
  { regex: /sm:text-\[16px\]/g, replacement: 'sm:text-base' },
  { regex: /text-\[18px\]/g, replacement: 'text-lg' },
  { regex: /sm:text-\[18px\]/g, replacement: 'sm:text-lg' },
  { regex: /text-\[20px\]/g, replacement: 'text-xl' },
  { regex: /sm:text-\[20px\]/g, replacement: 'sm:text-xl' }
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

const fs = require('fs');
const path = require('path');

const directoryPaths = [
  path.join(__dirname, 'src'),
  path.join(__dirname, 'src', 'components')
];

const fileExtensions = ['.tsx', '.ts', '.css'];

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Don't recurse into components if we are processing it separately, but fine.
      if (file !== 'components' && dirPath === path.join(__dirname, 'src')) {
         // skip subdirs
      }
    } else if (fileExtensions.some(ext => fullPath.endsWith(ext))) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;

      // Backgrounds
      content = content.replace(/bg-slate-200/g, 'bg-[#002B5B]'); // Navy Blue Cards
      content = content.replace(/bg-slate-100/g, 'bg-[#FFD700]'); // Background
      content = content.replace(/bg-sky-50\/30/g, 'bg-[#002B5B]');
      content = content.replace(/bg-sky-50\/50/g, 'bg-[#002B5B]');
      content = content.replace(/bg-sky-50\/70/g, 'bg-[#003B73]');
      content = content.replace(/bg-slate-50\/50/g, 'bg-[#003B73]');
      content = content.replace(/bg-slate-50/g, 'bg-[#003B73]');

      // Text colors
      content = content.replace(/text-slate-900/g, 'text-white');
      content = content.replace(/text-slate-800/g, 'text-blue-50');
      content = content.replace(/text-slate-700/g, 'text-blue-100');
      content = content.replace(/text-slate-600/g, 'text-blue-200');
      content = content.replace(/text-slate-500/g, 'text-blue-200');
      content = content.replace(/text-slate-400/g, 'text-blue-300');

      // Borders
      content = content.replace(/border-slate-50/g, 'border-[#004A8F]');
      content = content.replace(/border-slate-100/g, 'border-[#004A8F]');
      content = content.replace(/border-slate-200/g, 'border-[#004A8F]');
      content = content.replace(/border-slate-300/g, 'border-[#004A8F]');
      content = content.replace(/border-sky-100/g, 'border-[#004A8F]');
      content = content.replace(/border-sky-100\/50/g, 'border-[#004A8F]');

      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

directoryPaths.forEach(processDirectory);

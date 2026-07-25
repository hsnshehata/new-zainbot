const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'index.css');
let cssStr = fs.readFileSync(cssPath, 'utf8');

// Replace the Golden Gradient for ZAINBOT 3D Text
cssStr = cssStr.replace(
    /\/\* Golden Gradient: Light Yellow to Dark Gold \*\/[\s\S]*?filter: drop-shadow\(.*?drop-shadow\(.*?\);/,
    `/* Holographic/Cyan Gradient: Ice White to Cyber Teal */
  background: linear-gradient(180deg, #e6ffff 0%, #00e5cc 50%, #008080 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;

  /* Cyber Glow - Subtle and Refined */
  filter: drop-shadow(0 0 4px rgba(0, 229, 204, 0.4)) drop-shadow(0 0 10px rgba(0, 128, 128, 0.3));`
);

fs.writeFileSync(cssPath, cssStr);
console.log('Update Complete: ZAINBOT Text matched to Cyan theme.');

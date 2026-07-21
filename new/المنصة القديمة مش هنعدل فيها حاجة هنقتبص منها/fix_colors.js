const fs = require('fs');
const path = require('path');

// 1. Revert ZAINBOT text in index.css
const cssPath = path.join(__dirname, 'public', 'css', 'index.css');
let cssStr = fs.readFileSync(cssPath, 'utf8');

cssStr = cssStr.replace(
    /\/\* Holographic\/Cyan Gradient: Ice White to Cyber Teal \*\/[\s\S]*?filter: drop-shadow\(.*?drop-shadow\(.*?\);/,
    `/* Golden Gradient: Light Yellow to Dark Gold */
  background: linear-gradient(180deg, #fffacd 0%, #ffd700 50%, #b8860b 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;

  /* Solar Glow - Subtle and Refined */
  filter: drop-shadow(0 0 2px rgba(255, 215, 0, 0.3)) drop-shadow(0 0 5px rgba(184, 134, 11, 0.2));`
);
fs.writeFileSync(cssPath, cssStr);
console.log('Reverted ZAINBOT text to Gold.');

// 2. Change OpenCloud character in index.html to Gold/Orange
const htmlPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace accent gradient
html = html.replace(
    /<linearGradient id="accent-grad"[\s\S]*?<\/linearGradient>/,
    `<linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#FFD700" /> <!-- Gold -->
              <stop offset="100%" stop-color="#FF8C00" /> <!-- Dark Orange -->
            </linearGradient>`
);

// Replace cheeks
html = html.replace(/fill="#FF4D4D"/g, 'fill="#FF8C00"');

// Replace particles block
html = html.replace(
    /<g class="cloud-particles">[\s\S]*?<\/g>/,
    `<g class="cloud-particles">
            <circle cx="120" cy="40" r="3" fill="#FFD700" class="pt-pt p-top"/>
            <circle cx="120" cy="200" r="4" fill="#FF8C00" class="pt-pt p-bot"/>
            <circle cx="30" cy="80" r="2" fill="#FFA500" class="pt-pt p-lt"/>
            <circle cx="210" cy="90" r="3" fill="#FFD700" class="pt-pt p-rt"/>
          </g>`
);

fs.writeFileSync(htmlPath, html);
console.log('Updated OpenCloud character to Gold/Orange.');

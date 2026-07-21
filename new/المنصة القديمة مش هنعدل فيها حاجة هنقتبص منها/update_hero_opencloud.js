const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// Replace the current SVG block (currently the Holographic AI Core). 
// The regex finds the previous SVG class "hero-ai-assistant"
const svgRegex = /<!-- New Holographic AI Core -->[\s\S]*?<\/svg>/;
const newSvg = `<!-- OpenCloud Inspired Interactive Assistant -->
        <svg viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg" class="hero-opencloud">
          <defs>
            <linearGradient id="cloud-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#e0e0e0" />
            </linearGradient>
            <linearGradient id="accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00E5CC" /> <!-- Zain Theme Cyan -->
              <stop offset="100%" stop-color="#FF4D4D" /> <!-- Zain Theme Coral -->
            </linearGradient>
            <filter id="soft-glow">
              <feGaussianBlur stdDeviation="6" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="accent-glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Outer Energy Ripples -->
          <g class="cloud-ripples" filter="url(#accent-glow)">
            <circle cx="120" cy="120" r="80" stroke="url(#accent-grad)" stroke-width="1.5" opacity="0.3" class="ripple r1"/>
            <circle cx="120" cy="120" r="100" stroke="url(#accent-grad)" stroke-width="1" opacity="0.15" class="ripple r2"/>
          </g>

          <g class="cloud-core" transform="translate(0,0)">
            <!-- Main Cloud / Soft Pill Body -->
            <path d="M 60 120 C 60 70 180 70 180 120 C 180 170 60 170 60 120 Z" fill="url(#cloud-grad)" filter="url(#soft-glow)" class="cloud-body"/>
            
            <!-- Connection Nodes / Little Floating Hands -->
            <circle cx="45" cy="130" r="8" fill="url(#accent-grad)" class="cloud-node node-left"/>
            <circle cx="195" cy="130" r="8" fill="url(#accent-grad)" class="cloud-node node-right"/>

            <!-- Face Elements Group -->
            <g class="cloud-face">
              <!-- Left Eye -->
              <rect x="95" y="105" width="8" height="24" rx="4" fill="#050510" class="eye e-left"/>
              <!-- Right Eye -->
              <rect x="137" y="105" width="8" height="24" rx="4" fill="#050510" class="eye e-right"/>
              
              <!-- Subtle Blush / Cheeks -->
              <circle cx="80" cy="125" r="10" fill="#FF4D4D" opacity="0.4" filter="url(#accent-glow)" class="cheek c-left"/>
              <circle cx="160" cy="125" r="10" fill="#FF4D4D" opacity="0.4" filter="url(#accent-glow)" class="cheek c-right"/>
              
              <!-- Smiling Mouth (Initially small, curves up on hover) -->
              <path d="M 110 135 Q 120 145 130 135" stroke="#050510" stroke-width="3" stroke-linecap="round" fill="none" class="cloud-smile"/>
            </g>
          </g>

          <!-- Interactive Floating Data Particles -->
          <g class="cloud-particles">
            <circle cx="120" cy="40" r="3" fill="#00E5CC" class="pt-pt p-top"/>
            <circle cx="120" cy="200" r="4" fill="#FF4D4D" class="pt-pt p-bot"/>
            <circle cx="30" cy="80" r="2" fill="#00f0ff" class="pt-pt p-lt"/>
            <circle cx="210" cy="90" r="3" fill="#ff7f7f" class="pt-pt p-rt"/>
          </g>
        </svg>`;

html = html.replace(svgRegex, newSvg);
fs.writeFileSync(htmlPath, html);

const cssPath = path.join(__dirname, 'public', 'css', 'index.css');
let cssStr = fs.readFileSync(cssPath, 'utf8');

// Replace the previous custom CSS blocks (from /* === NEW FUTURISTIC AI ASSISTANT ANIMATIONS === */ down to /* Stars Container */)
const cssRegex = /\/\* === NEW FUTURISTIC AI ASSISTANT ANIMATIONS === \*\/[\s\S]*?\/\* Stars Container \*\//;
const newCss = `/* === OPENCLOUD INSPIRED ANIMATIONS === */

.hero-opencloud {
  width: 100%;
  height: 100%;
  max-height: 280px;
  cursor: pointer;
  margin-top: 10px;
  /* Soft interactive scale transition */
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.hero-opencloud:hover {
  transform: scale(1.08) translateY(-5px);
}

/* 1. Base Levitation */
.cloud-core {
  animation: cloud-float 5s ease-in-out infinite;
  transform-origin: center;
}

@keyframes cloud-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-15px); }
}

/* 2. Face & Eyes Animation */
.eye {
  transform-origin: center;
  animation: eye-blink 5s infinite;
}

@keyframes eye-blink {
  0%, 46%, 50%, 100% { transform: scaleY(1); }
  48% { transform: scaleY(0.1); }
}

.cloud-face {
  transition: transform 0.3s ease;
}

.hero-opencloud:hover .cloud-face {
  /* Looking slightly up/right when hovered */
  transform: translate(5px, -5px);
}

/* Smile opens up slightly on hover */
.cloud-smile {
  transition: d 0.3s ease;
}
.hero-opencloud:hover .cloud-smile {
  d: path("M 105 135 Q 120 155 135 135");
}

/* 3. Glowing Cheeks React */
.cheek {
  transition: opacity 0.3s ease, transform 0.3s ease;
  transform-origin: center;
}
.hero-opencloud:hover .cheek {
  opacity: 0.8;
  transform: scale(1.2);
}

/* 4. Energy Ripples in Background */
.ripple {
  transform-origin: center;
  animation: ripple-pulse 4s linear infinite;
}
.ripple.r1 { animation-delay: 0s; }
.ripple.r2 { animation-delay: 2s; }

@keyframes ripple-pulse {
  0% { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(1.3); opacity: 0; }
}

/* 5. Floating Interactive Nodes */
.cloud-node {
  animation: node-bounce 3.5s ease-in-out infinite alternate;
}
.node-left { transform-origin: center; animation-delay: 0.3s; }
.node-right { transform-origin: center; animation-delay: 0s; }

@keyframes node-bounce {
  0% { transform: translateY(0px) rotate(0deg); }
  100% { transform: translateY(-8px) rotate(10deg); }
}

.hero-opencloud:hover .node-left {
  animation: node-excited-left 0.4s infinite alternate;
}
.hero-opencloud:hover .node-right {
  animation: node-excited-right 0.4s infinite alternate;
}

@keyframes node-excited-left {
  0% { transform: translateY(-10px) translateX(0) scale(1.1); }
  100% { transform: translateY(-15px) translateX(-5px) scale(1.1); }
}
@keyframes node-excited-right {
  0% { transform: translateY(-10px) translateX(0) scale(1.1); }
  100% { transform: translateY(-15px) translateX(5px) scale(1.1); }
}

/* 6. Surrounding Particles */
.pt-pt {
  transform-origin: center;
  animation: particle-hover 4s ease-in-out infinite alternate;
}
.p-top { animation-delay: 0s; }
.p-bot { animation-delay: 1s; }
.p-lt { animation-delay: 0.5s; }
.p-rt { animation-delay: 1.5s; }

@keyframes particle-hover {
  0% { transform: translate(0, 0) scale(1); opacity: 0.6; }
  100% { transform: translate(5px, -10px) scale(1.5); opacity: 1; }
}

.hero-opencloud:hover .pt-pt {
  /* Particles orbit slightly on hover */
  animation: particle-spin-fast 1.5s ease-in-out infinite alternate;
}

@keyframes particle-spin-fast {
  0% { transform: translate(0, 0) scale(1.5); opacity: 1; }
  100% { transform: translate(-10px, -20px) scale(0.8); opacity: 0.8; }
}

/* Stars Container */`;

cssStr = cssStr.replace(cssRegex, newCss);
fs.writeFileSync(cssPath, cssStr);
console.log('Update Complete: OpenCloud Style applied.');

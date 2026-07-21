const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const svgRegex = /<!-- ZainBot 3\.0: Rebuilt from Scratch \(Clean & Cinematic\) -->[\s\S]*?<\/svg>/;
const newSvg = `<!-- New Holographic AI Core -->
        <svg viewBox="0 0 200 230" fill="none" xmlns="http://www.w3.org/2000/svg" class="hero-ai-assistant">
          <defs>
            <linearGradient id="cyber-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00f0ff" />
              <stop offset="100%" stop-color="#0088ff" />
            </linearGradient>
            <linearGradient id="body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#e0e0e0" />
            </linearGradient>
            <filter id="neon-glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Signal Waves (Background) -->
          <g class="signal-waves">
            <circle cx="100" cy="115" r="70" stroke="#00f0ff" stroke-width="1" opacity="0" class="wave w1"/>
            <circle cx="100" cy="115" r="90" stroke="#00f0ff" stroke-width="1" opacity="0" class="wave w2"/>
          </g>

          <!-- Main Assistant Group -->
          <g class="ai-core-group">
            <!-- Floating Data Nodes / Hands -->
            <circle cx="40" cy="150" r="6" fill="#00f0ff" class="ai-node left-node"/>
            <circle cx="160" cy="150" r="6" fill="#00f0ff" class="ai-node right-node"/>

            <!-- Main Body / Head -->
            <path d="M 60 100 C 60 40 140 40 140 100 C 140 150 120 170 100 170 C 80 170 60 150 60 100 Z" fill="url(#body-grad)" />
            
            <!-- Visor -->
            <path d="M 62 90 C 62 70 138 70 138 90 C 138 110 120 125 100 125 C 80 125 62 110 62 90 Z" fill="#050510" />
            
            <!-- Dynamic Glowing Voice Wave -->
            <g class="voice-wave" filter="url(#neon-glow)">
              <rect x="85" y="85" width="4" height="10" rx="2" fill="#00f0ff" class="bar b1"/>
              <rect x="94" y="80" width="4" height="20" rx="2" fill="#00f0ff" class="bar b2"/>
              <rect x="103" y="75" width="4" height="30" rx="2" fill="#00f0ff" class="bar b3"/>
              <rect x="112" y="80" width="4" height="20" rx="2" fill="#00f0ff" class="bar b4"/>
              <rect x="121" y="85" width="4" height="10" rx="2" fill="#00f0ff" class="bar b5"/>
            </g>

            <!-- Glowing Halo Ring -->
            <ellipse cx="100" cy="145" rx="55" ry="15" fill="none" stroke="url(#cyber-grad)" stroke-width="2" class="halo-ring" opacity="0.6"/>
          </g>
        </svg>`;

html = html.replace(svgRegex, newSvg);
fs.writeFileSync(htmlPath, html);

const cssPath = path.join(__dirname, 'public', 'css', 'index.css');
let cssStr = fs.readFileSync(cssPath, 'utf8');

const cssRegex = /\/\* Hero SVG Icon Styling \*\/[\s\S]*?\/\* Stars Container \*\//;
const newCss = `/* === NEW FUTURISTIC AI ASSISTANT ANIMATIONS === */

.ai-core-group {
  animation: levitate 4s ease-in-out infinite;
  transform-origin: center;
}

@keyframes levitate {
  0%, 100% { transform: translateY(0px) scale(1); }
  50% { transform: translateY(-12px) scale(1.02); }
}

.halo-ring {
  animation: spin-halo 8s linear infinite;
  transform-origin: 100px 145px;
}

@keyframes spin-halo {
  0% { transform: rotateX(70deg) rotateZ(0deg); }
  100% { transform: rotateX(70deg) rotateZ(360deg); }
}

/* Floating Nodes Animation */
.ai-node {
  animation: node-hover 3s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 5px #00f0ff);
}
.left-node { transform-origin: 40px 150px; animation-delay: 0.2s; }
.right-node { transform-origin: 160px 150px; animation-delay: 0.5s; }

@keyframes node-hover {
  0% { transform: translateY(0px) scale(1); }
  100% { transform: translateY(-10px) scale(1.2); }
}

/* Voice Wave Animation */
.voice-wave .bar {
  transform-origin: center;
  animation: equalize 1s ease-in-out infinite alternate;
}
.bar.b1 { animation-delay: 0.0s; }
.bar.b2 { animation-delay: 0.2s; }
.bar.b3 { animation-delay: 0.4s; }
.bar.b4 { animation-delay: 0.2s; }
.bar.b5 { animation-delay: 0.0s; }

@keyframes equalize {
  0% { transform: scaleY(0.4); }
  100% { transform: scaleY(1.2); }
}

/* Signal Waves */
.wave {
  transform-origin: center;
  animation: pulse-wave 3s ease-out infinite;
}
.wave.w1 { animation-delay: 0s; }
.wave.w2 { animation-delay: 1.5s; }

@keyframes pulse-wave {
  0% { transform: scale(0.5); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}

.hero-ai-assistant {
  width: 100%;
  height: 100%;
  max-height: 250px;
  filter: drop-shadow(0 0 15px rgba(0, 240, 255, 0.2));
  transition: filter 0.3s ease, transform 0.3s ease;
  cursor: pointer;
  margin-top: 20px;
}

.hero-ai-assistant:hover {
  filter: drop-shadow(0 0 30px rgba(0, 240, 255, 0.6));
  transform: scale(1.05);
}

.hero-ai-assistant:hover .voice-wave .bar {
  animation-duration: 0.3s;
}

/* Stars Container */`;

cssStr = cssStr.replace(cssRegex, newCss);
fs.writeFileSync(cssPath, cssStr);
console.log('Update Complete.');

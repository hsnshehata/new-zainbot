# ---- F07: minified web assets builder ----
# Builds build/public with the pinned esbuild release (devDependency, exact
# version in package-lock.json). The runtime stage serves that output at
# /app/public (same path, minified bytes) and keeps NO build devDependencies.
# pkg executables untouched.
FROM node:22-bookworm-slim AS web-builder

WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

COPY public/ ./public/
COPY scripts/build-web.js ./scripts/build-web.js
RUN npm run build:web

# ---- runtime ----
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WHATSAPP_SESSION_WORKDIR=/app/data/whatsapp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      dumb-init \
      fonts-noto-color-emoji \
      fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

# Serve the minified web build (overwrites the source public/ copied above).
COPY --from=web-builder --chown=node:node /app/build/public ./public

RUN mkdir -p /app/data/whatsapp /app/uploads /app/server/logs \
    && chown -R node:node /app/data /app/uploads /app/server/logs

USER node

EXPOSE 5000
VOLUME ["/app/data", "/app/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]

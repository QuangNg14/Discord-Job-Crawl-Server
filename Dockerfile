# ---------- build stage ----------
FROM node:22-slim AS build
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY . .

# ---------- runtime stage ----------
FROM node:22-slim


# Install Chromium and required libraries for headless mode
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
    libpango-1.0-0 libcairo2 fonts-liberation && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Copy application files and production dependencies from build stage
COPY --from=build /app .

# Create a non-root user and change ownership
RUN useradd -m pptr && chown -R pptr:pptr /app
USER pptr

# Skip Puppeteer's Chromium download and point to system-installed Chromium
# ENV NODE_ENV=production \
#     PUPPETEER_SKIP_DOWNLOAD=true \
#     PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
RUN node -e "require('puppeteer')"

# Start the bot
CMD ["node", "server.js"]

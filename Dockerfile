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
    chromium \
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

# Configure Puppeteer to use system-installed Chromium
ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create startup script
RUN echo '#!/bin/bash\n\
if [ "$MODE" = "daily" ]; then\n\
    echo "Starting daily scraper..."\n\
    node daily-scraper.js\n\
elif [ "$MODE" = "daily-now" ]; then\n\
    echo "Running daily scraper immediately..."\n\
    node daily-scraper.js --run-now\n\
elif [ "$MODE" = "scrape" ]; then\n\
    echo "Running comprehensive scrape..."\n\
    node scrape.js\n\
else\n\
    echo "Starting main server..."\n\
    node server.js\n\
fi' > /app/start.sh && chmod +x /app/start.sh

# Start the application based on MODE environment variable
CMD ["/app/start.sh"]

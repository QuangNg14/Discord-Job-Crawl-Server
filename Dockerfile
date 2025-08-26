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

# Install Chromium, TLS certificates, and required libraries for headless mode
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    openssl \
    curl \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 libgbm1 libasound2 libpangocairo-1.0-0 \
    libpango-1.0-0 libcairo2 fonts-liberation && \
    apt-get clean && rm -rf /var/lib/apt/lists/* && \
    update-ca-certificates

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

# Expose port for health checks
EXPOSE 3000

# Health check for Azure Container Instances
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Create startup script with improved error handling
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
echo "Starting job scraper bot..."\n\
echo "Environment: $NODE_ENV"\n\
echo "Mode: ${MODE:-server}"\n\
\n\
# Wait for MongoDB to be ready (if using external MongoDB)\n\
if [ -n "$MONGO_URI" ]; then\n\
    echo "Waiting for MongoDB connection..."\n\
    timeout 30s bash -c "until curl -f http://localhost:3000/health 2>/dev/null; do sleep 2; done" || echo "Health check timeout, continuing..."\n\
fi\n\
\n\
case "$MODE" in\n\
    "daily")\n\
        echo "Starting daily scraper..."\n\
        node daily-scraper.js\n\
        ;;\n\
    "daily-now")\n\
        echo "Running daily scraper immediately..."\n\
        node daily-scraper.js --run-now\n\
        ;;\n\
    "scrape")\n\
        echo "Running comprehensive scrape..."\n\
        node scrape.js\n\
        ;;\n\
    *)\n\
        echo "Starting main server..."\n\
        node server.js\n\
        ;;\n\
esac' > /app/start.sh && chmod +x /app/start.sh

# Start the application based on MODE environment variable
CMD ["/app/start.sh"]

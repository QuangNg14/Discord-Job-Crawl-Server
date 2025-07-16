// utils/antiDetection.js - Comprehensive anti-detection utilities
const logger = require("../services/logger");
const { antiDetectionMonitor } = require("../services/antiDetectionMonitor");

/**
 * Pool of realistic user agents for rotation
 */
const USER_AGENTS = [
  // Chrome on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",

  // Chrome on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",

  // Safari on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",

  // Firefox on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",

  // Firefox on macOS
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0",

  // Edge on Windows
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0",
];

/**
 * Common viewport sizes for realistic browsing
 */
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1200 },
  { width: 2560, height: 1440 },
];

/**
 * Site-specific rate limiting configuration
 */
const RATE_LIMITS = {
  "linkedin.com": { minDelay: 3000, maxDelay: 8000, requestsPerMinute: 10 },
  "glassdoor.com": { minDelay: 2000, maxDelay: 6000, requestsPerMinute: 15 },
  "indeed.com": { minDelay: 2000, maxDelay: 5000, requestsPerMinute: 20 },
  "ziprecruiter.com": { minDelay: 1500, maxDelay: 4000, requestsPerMinute: 25 },
  "simplyhired.com": { minDelay: 1000, maxDelay: 3000, requestsPerMinute: 30 },
  "careerjet.com": { minDelay: 1000, maxDelay: 3000, requestsPerMinute: 30 },
  "dice.com": { minDelay: 2000, maxDelay: 5000, requestsPerMinute: 20 },
  "jobright.ai": { minDelay: 1500, maxDelay: 4000, requestsPerMinute: 25 },

  "github.com": { minDelay: 1000, maxDelay: 2000, requestsPerMinute: 60 },
  default: { minDelay: 1000, maxDelay: 3000, requestsPerMinute: 30 },
};

/**
 * Request tracking for rate limiting
 */
const requestTracker = new Map();

class AntiDetectionManager {
  constructor() {
    this.proxyPool = [];
    this.currentProxyIndex = 0;
    this.blockedProxies = new Set();
    this.sessionCookies = new Map();
    this.monitor = antiDetectionMonitor;
  }

  /**
   * Get a random user agent
   */
  getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /**
   * Get a random viewport size
   */
  getRandomViewport() {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  }

  /**
   * Get realistic HTTP headers
   */
  getStealthHeaders(userAgent = null) {
    const ua = userAgent || this.getRandomUserAgent();
    const isChrome = ua.includes("Chrome");
    const isFirefox = ua.includes("Firefox");
    const isSafari = ua.includes("Safari") && !ua.includes("Chrome");

    const baseHeaders = {
      "User-Agent": ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    };

    // Add browser-specific headers
    if (isChrome) {
      baseHeaders["sec-ch-ua"] =
        '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
      baseHeaders["sec-ch-ua-mobile"] = "?0";
      baseHeaders["sec-ch-ua-platform"] = '"Windows"';
    }

    return baseHeaders;
  }

  /**
   * Get enhanced Puppeteer launch options with stealth configuration
   */
  getStealthPuppeteerOptions(options = {}) {
    const viewport = this.getRandomViewport();

    return {
      headless: process.env.NODE_ENV === "production" ? "new" : false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-field-trial-config",
        "--disable-back-forward-cache",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-dev-shm-usage",
        "--disable-domain-reliability",
        "--disable-extensions",
        "--disable-features=TranslateUI",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-sandbox",
        "--use-mock-keychain",
        "--force-color-profile=srgb",
        "--memory-pressure-off",
        "--max_old_space_size=4096",
        "--disable-blink-features=AutomationControlled",
        `--window-size=${viewport.width},${viewport.height}`,
        "--user-agent=" + this.getRandomUserAgent(),
      ],
      defaultViewport: viewport,
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ["--enable-automation"],
      ...options,
    };
  }

  /**
   * Configure page with stealth settings
   */
  async configurePage(page, url = null) {
    const userAgent = this.getRandomUserAgent();
    const headers = this.getStealthHeaders(userAgent);

    // Set user agent
    await page.setUserAgent(userAgent);

    // Set headers
    await page.setExtraHTTPHeaders(headers);

    // Set viewport
    const viewport = this.getRandomViewport();
    await page.setViewport(viewport);

    // Remove automation indicators
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      delete Object.getPrototypeOf(navigator).webdriver;

      // Mock plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });

      // Mock languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Mock webgl
      const getParameter = WebGLRenderingContext.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc.";
        }
        if (parameter === 37446) {
          return "Intel Iris OpenGL Engine";
        }
        return getParameter(parameter);
      };

      // Mock chrome runtime
      if (!window.chrome) {
        window.chrome = {
          runtime: {},
        };
      }

      // Mock permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: "granted" })
          : originalQuery(parameters);
    });

    // Block unnecessary resources to speed up and reduce detection
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      const requestUrl = request.url();

      // Block ads, analytics, and other unnecessary resources
      if (
        resourceType === "image" ||
        resourceType === "stylesheet" ||
        resourceType === "font" ||
        resourceType === "media" ||
        requestUrl.includes("google-analytics") ||
        requestUrl.includes("googletagmanager") ||
        requestUrl.includes("facebook.com") ||
        requestUrl.includes("twitter.com") ||
        requestUrl.includes("linkedin.com/analytics") ||
        requestUrl.includes("doubleclick.net") ||
        requestUrl.includes("googlesyndication.com")
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Add random mouse movements to simulate human behavior
    await this.simulateHumanBehavior(page);

    return page;
  }

  /**
   * Simulate human-like behavior on page
   */
  async simulateHumanBehavior(page) {
    // Random mouse movements
    await page.evaluateOnNewDocument(() => {
      // Add random mouse movements
      setInterval(() => {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * window.innerHeight;

        const event = new MouseEvent("mousemove", {
          clientX: x,
          clientY: y,
        });

        document.dispatchEvent(event);
      }, Math.random() * 5000 + 2000);
    });
  }

  /**
   * Get intelligent delay based on site and recent activity
   */
  async getIntelligentDelay(url) {
    const domain = this.extractDomain(url);
    const config = RATE_LIMITS[domain] || RATE_LIMITS.default;

    // Check if we should continue scraping this domain
    if (!this.monitor.shouldContinueScraping(domain)) {
      throw new Error(
        `Scraping suspended for ${domain} due to high blocking rate`
      );
    }

    // Track requests for rate limiting
    const now = Date.now();
    if (!requestTracker.has(domain)) {
      requestTracker.set(domain, []);
    }

    const domainRequests = requestTracker.get(domain);

    // Clean old requests (older than 1 minute)
    const oneMinuteAgo = now - 60000;
    const recentRequests = domainRequests.filter((time) => time > oneMinuteAgo);
    requestTracker.set(domain, recentRequests);

    // Check if we need to slow down
    if (recentRequests.length >= config.requestsPerMinute) {
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = 60000 - (now - oldestRequest);

      if (waitTime > 0) {
        logger.log(`Rate limiting for ${domain}: waiting ${waitTime}ms`);
        this.monitor.recordRateLimit(url);
        await this.delay(waitTime);
      }
    }

    // Add current request to tracker
    recentRequests.push(now);
    requestTracker.set(domain, recentRequests);

    // Return random delay within configured range
    const delay =
      Math.random() * (config.maxDelay - config.minDelay) + config.minDelay;
    return Math.floor(delay);
  }

  /**
   * Smart delay with exponential backoff on errors
   */
  async smartDelay(url, attempt = 1, isError = false) {
    let baseDelay = await this.getIntelligentDelay(url);

    if (isError) {
      // Exponential backoff on errors
      baseDelay *= Math.pow(2, attempt - 1);
      logger.log(`Error delay for attempt ${attempt}: ${baseDelay}ms`);
    }

    await this.delay(baseDelay);
  }

  /**
   * Basic delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return "default";
    }
  }

  /**
   * Get next proxy from pool
   */
  getNextProxy() {
    if (this.proxyPool.length === 0) return null;

    let proxy = null;
    let attempts = 0;

    while (!proxy && attempts < this.proxyPool.length) {
      const candidate = this.proxyPool[this.currentProxyIndex];
      this.currentProxyIndex =
        (this.currentProxyIndex + 1) % this.proxyPool.length;

      if (!this.blockedProxies.has(candidate)) {
        proxy = candidate;
      }

      attempts++;
    }

    return proxy;
  }

  /**
   * Mark proxy as blocked
   */
  blockProxy(proxy) {
    this.blockedProxies.add(proxy);
    logger.log(`Blocked proxy: ${proxy}`);
  }

  /**
   * Add proxy to pool
   */
  addProxy(proxy) {
    this.proxyPool.push(proxy);
    logger.log(`Added proxy to pool: ${proxy}`);
  }

  /**
   * Handle errors intelligently
   */
  async handleError(error, url, attempt = 1) {
    const domain = this.extractDomain(url);

    logger.log(
      `Error on ${domain} (attempt ${attempt}): ${error.message}`,
      "error"
    );

    // Record error in monitoring
    this.monitor.recordRetry(url, attempt);

    // Specific error handling
    if (
      error.message.includes("blocked") ||
      error.message.includes("captcha") ||
      error.message.includes("rate limit")
    ) {
      // Record blocking event
      this.monitor.recordBlocked(url, error.message);

      // Increase delay for blocked/captcha errors
      const backoffDelay = Math.min(30000, 5000 * Math.pow(2, attempt - 1));
      logger.log(`Backing off for ${backoffDelay}ms due to blocking detection`);
      await this.delay(backoffDelay);
    }

    // Handle captcha specifically
    if (error.message.includes("captcha")) {
      this.monitor.recordCaptcha(url);
    }

    // Network errors
    if (error.message.includes("timeout") || error.message.includes("net::")) {
      this.monitor.recordNetworkError(url, error.message);
      await this.smartDelay(url, attempt, true);
    }

    // Timeout errors
    if (error.message.includes("timeout")) {
      this.monitor.recordTimeout(url, 30000); // Assume 30s timeout
    }

    return attempt < 3; // Retry up to 3 times
  }

  /**
   * Safe page navigation with retries
   */
  async safeNavigate(page, url, options = {}) {
    const maxRetries = 3;
    let attempt = 1;
    const startTime = Date.now();

    while (attempt <= maxRetries) {
      try {
        await this.smartDelay(url, attempt);

        const response = await page.goto(url, {
          waitUntil: "networkidle2",
          timeout: 45000,
          ...options,
        });

        // Check if page loaded successfully
        if (response && response.ok()) {
          const responseTime = Date.now() - startTime;
          this.monitor.recordSuccess(url, responseTime);
          return response;
        }

        throw new Error(`Page load failed with status: ${response?.status()}`);
      } catch (error) {
        const shouldRetry = await this.handleError(error, url, attempt);

        if (!shouldRetry || attempt >= maxRetries) {
          throw error;
        }

        attempt++;
      }
    }
  }

  /**
   * Get session cookies for domain
   */
  getSessionCookies(domain) {
    return this.sessionCookies.get(domain) || [];
  }

  /**
   * Save session cookies for domain
   */
  saveSessionCookies(domain, cookies) {
    this.sessionCookies.set(domain, cookies);
  }

  /**
   * Clear session cookies for domain
   */
  clearSessionCookies(domain) {
    this.sessionCookies.delete(domain);
  }

  /**
   * Get monitoring metrics
   */
  getMonitoringMetrics() {
    return this.monitor.getMetrics();
  }

  /**
   * Get recommendations for improving scraping
   */
  getRecommendations() {
    return this.monitor.getRecommendations();
  }
}

// Export singleton instance
const antiDetectionManager = new AntiDetectionManager();

module.exports = {
  AntiDetectionManager,
  antiDetectionManager,
  USER_AGENTS,
  VIEWPORTS,
  RATE_LIMITS,
};

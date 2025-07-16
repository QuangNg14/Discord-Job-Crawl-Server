// services/antiDetectionMonitor.js - Monitoring and alerting for anti-detection system
const logger = require("./logger");
const config = require("../config");

class AntiDetectionMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      blockedRequests: 0,
      captchaEncountered: 0,
      timeouts: 0,
      networkErrors: 0,
      rateLimitHits: 0,
      retryAttempts: 0,
      averageResponseTime: 0,
      lastResetTime: new Date(),
    };

    this.siteMetrics = new Map();
    this.detectionEvents = [];
    this.performanceHistory = [];
    this.alertThresholds = {
      blockingRate: 0.3, // 30% blocking rate triggers alert
      consecutiveFailures: 5,
      slowResponseTime: 10000, // 10 seconds
      captchaFrequency: 0.1, // 10% captcha rate
    };

    this.isMonitoring = config.antiDetection?.monitoring?.enabled || false;

    // Start monitoring if enabled
    if (this.isMonitoring) {
      this.startMonitoring();
    }
  }

  /**
   * Start monitoring system
   */
  startMonitoring() {
    logger.log("🔍 Anti-Detection Monitor starting...");

    // Reset metrics every hour
    setInterval(() => {
      this.resetMetrics();
    }, 60 * 60 * 1000);

    // Generate performance reports every 10 minutes
    setInterval(() => {
      this.generatePerformanceReport();
    }, 10 * 60 * 1000);

    // Clean old events every 30 minutes
    setInterval(() => {
      this.cleanOldEvents();
    }, 30 * 60 * 1000);
  }

  /**
   * Record a successful request
   */
  recordSuccess(url, responseTime) {
    if (!this.isMonitoring) return;

    this.metrics.totalRequests++;
    this.metrics.successfulRequests++;
    this.updateResponseTime(responseTime);

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "success", responseTime);
  }

  /**
   * Record a blocked request
   */
  recordBlocked(url, reason = "unknown") {
    if (!this.isMonitoring) return;

    this.metrics.totalRequests++;
    this.metrics.blockedRequests++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "blocked");

    const event = {
      type: "blocked",
      domain,
      reason,
      timestamp: new Date(),
      url,
    };

    this.detectionEvents.push(event);
    this.checkAlerts(domain);

    logger.log(`🚫 Blocking detected on ${domain}: ${reason}`, "warn");
  }

  /**
   * Record a captcha encounter
   */
  recordCaptcha(url) {
    if (!this.isMonitoring) return;

    this.metrics.totalRequests++;
    this.metrics.captchaEncountered++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "captcha");

    const event = {
      type: "captcha",
      domain,
      timestamp: new Date(),
      url,
    };

    this.detectionEvents.push(event);
    this.checkAlerts(domain);

    logger.log(`🤖 CAPTCHA encountered on ${domain}`, "warn");
  }

  /**
   * Record a timeout
   */
  recordTimeout(url, duration) {
    if (!this.isMonitoring) return;

    this.metrics.totalRequests++;
    this.metrics.timeouts++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "timeout");

    logger.log(`⏱️ Timeout on ${domain} after ${duration}ms`, "warn");
  }

  /**
   * Record a network error
   */
  recordNetworkError(url, errorType) {
    if (!this.isMonitoring) return;

    this.metrics.totalRequests++;
    this.metrics.networkErrors++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "networkError");

    logger.log(`🌐 Network error on ${domain}: ${errorType}`, "error");
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimit(url) {
    if (!this.isMonitoring) return;

    this.metrics.rateLimitHits++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "rateLimit");

    logger.log(`🐌 Rate limit hit on ${domain}`, "warn");
  }

  /**
   * Record a retry attempt
   */
  recordRetry(url, attempt) {
    if (!this.isMonitoring) return;

    this.metrics.retryAttempts++;

    const domain = this.extractDomain(url);
    this.updateSiteMetrics(domain, "retry");

    logger.log(`🔄 Retry attempt ${attempt} on ${domain}`);
  }

  /**
   * Update site-specific metrics
   */
  updateSiteMetrics(domain, eventType, responseTime = null) {
    if (!this.siteMetrics.has(domain)) {
      this.siteMetrics.set(domain, {
        totalRequests: 0,
        successfulRequests: 0,
        blockedRequests: 0,
        captchaEncountered: 0,
        timeouts: 0,
        networkErrors: 0,
        rateLimitHits: 0,
        retryAttempts: 0,
        averageResponseTime: 0,
        responseTimes: [],
        lastActivity: new Date(),
      });
    }

    const siteMetric = this.siteMetrics.get(domain);
    siteMetric.totalRequests++;
    siteMetric.lastActivity = new Date();

    switch (eventType) {
      case "success":
        siteMetric.successfulRequests++;
        if (responseTime) {
          siteMetric.responseTimes.push(responseTime);
          // Keep only last 100 response times
          if (siteMetric.responseTimes.length > 100) {
            siteMetric.responseTimes.shift();
          }
          siteMetric.averageResponseTime =
            siteMetric.responseTimes.reduce((a, b) => a + b, 0) /
            siteMetric.responseTimes.length;
        }
        break;
      case "blocked":
        siteMetric.blockedRequests++;
        break;
      case "captcha":
        siteMetric.captchaEncountered++;
        break;
      case "timeout":
        siteMetric.timeouts++;
        break;
      case "networkError":
        siteMetric.networkErrors++;
        break;
      case "rateLimit":
        siteMetric.rateLimitHits++;
        break;
      case "retry":
        siteMetric.retryAttempts++;
        break;
    }
  }

  /**
   * Update average response time
   */
  updateResponseTime(responseTime) {
    // Simple moving average
    this.metrics.averageResponseTime =
      this.metrics.averageResponseTime * 0.9 + responseTime * 0.1;
  }

  /**
   * Check for alert conditions
   */
  checkAlerts(domain) {
    const siteMetric = this.siteMetrics.get(domain);
    if (!siteMetric) return;

    const blockingRate = siteMetric.blockedRequests / siteMetric.totalRequests;
    const captchaRate =
      siteMetric.captchaEncountered / siteMetric.totalRequests;

    // Check blocking rate
    if (blockingRate > this.alertThresholds.blockingRate) {
      this.sendAlert("HIGH_BLOCKING_RATE", domain, {
        blockingRate: Math.round(blockingRate * 100),
        threshold: Math.round(this.alertThresholds.blockingRate * 100),
      });
    }

    // Check captcha frequency
    if (captchaRate > this.alertThresholds.captchaFrequency) {
      this.sendAlert("HIGH_CAPTCHA_RATE", domain, {
        captchaRate: Math.round(captchaRate * 100),
        threshold: Math.round(this.alertThresholds.captchaFrequency * 100),
      });
    }

    // Check response time
    if (
      siteMetric.averageResponseTime > this.alertThresholds.slowResponseTime
    ) {
      this.sendAlert("SLOW_RESPONSE_TIME", domain, {
        averageResponseTime: Math.round(siteMetric.averageResponseTime),
        threshold: this.alertThresholds.slowResponseTime,
      });
    }
  }

  /**
   * Send alert
   */
  sendAlert(alertType, domain, details) {
    const alert = {
      type: alertType,
      domain,
      details,
      timestamp: new Date(),
    };

    logger.log(
      `🚨 ALERT [${alertType}]: ${domain} - ${JSON.stringify(details)}`,
      "error"
    );

    // Add to events for tracking
    this.detectionEvents.push({
      type: "alert",
      alertType,
      domain,
      details,
      timestamp: new Date(),
    });
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport() {
    if (!this.isMonitoring) return;

    const report = {
      timestamp: new Date(),
      overallMetrics: { ...this.metrics },
      siteMetrics: Object.fromEntries(this.siteMetrics),
      recentEvents: this.detectionEvents.slice(-20),
    };

    this.performanceHistory.push(report);

    // Keep only last 24 hours of reports
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.performanceHistory = this.performanceHistory.filter(
      (r) => r.timestamp > oneDayAgo
    );

    const successRate =
      this.metrics.totalRequests > 0
        ? (
            (this.metrics.successfulRequests / this.metrics.totalRequests) *
            100
          ).toFixed(1)
        : 0;

    logger.log(
      `📊 Performance Report: ${successRate}% success rate, ${this.metrics.totalRequests} total requests`
    );
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      overall: { ...this.metrics },
      sites: Object.fromEntries(this.siteMetrics),
      recentEvents: this.detectionEvents.slice(-50),
      performanceHistory: this.performanceHistory.slice(-12), // Last 2 hours
    };
  }

  /**
   * Get site-specific metrics
   */
  getSiteMetrics(domain) {
    return this.siteMetrics.get(domain) || null;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    const oldMetrics = { ...this.metrics };

    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      blockedRequests: 0,
      captchaEncountered: 0,
      timeouts: 0,
      networkErrors: 0,
      rateLimitHits: 0,
      retryAttempts: 0,
      averageResponseTime: 0,
      lastResetTime: new Date(),
    };

    // Reset site metrics
    this.siteMetrics.clear();

    logger.log(
      `🔄 Metrics reset. Previous hour: ${oldMetrics.successfulRequests}/${oldMetrics.totalRequests} success rate`
    );
  }

  /**
   * Clean old events
   */
  cleanOldEvents() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.detectionEvents = this.detectionEvents.filter(
      (event) => event.timestamp > oneHourAgo
    );
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (e) {
      return "unknown";
    }
  }

  /**
   * Get recommendations based on metrics
   */
  getRecommendations() {
    const recommendations = [];

    // Check overall success rate
    const successRate =
      this.metrics.totalRequests > 0
        ? this.metrics.successfulRequests / this.metrics.totalRequests
        : 0;

    if (successRate < 0.7) {
      recommendations.push({
        type: "LOW_SUCCESS_RATE",
        message:
          "Overall success rate is below 70%. Consider increasing delays or using proxy rotation.",
        priority: "high",
      });
    }

    // Check for sites with high blocking rates
    for (const [domain, metrics] of this.siteMetrics) {
      const blockingRate = metrics.blockedRequests / metrics.totalRequests;

      if (blockingRate > 0.5) {
        recommendations.push({
          type: "HIGH_BLOCKING_SITE",
          message: `${domain} has high blocking rate (${Math.round(
            blockingRate * 100
          )}%). Consider avoiding or using different approach.`,
          priority: "high",
          domain,
        });
      }
    }

    return recommendations;
  }

  /**
   * Should we continue scraping a domain?
   */
  shouldContinueScraping(domain) {
    const siteMetric = this.siteMetrics.get(domain);
    if (!siteMetric) return true;

    const blockingRate = siteMetric.blockedRequests / siteMetric.totalRequests;
    const captchaRate =
      siteMetric.captchaEncountered / siteMetric.totalRequests;

    // Stop if blocking rate is too high
    if (blockingRate > 0.8) {
      logger.log(
        `⛔ Stopping scraping for ${domain} - blocking rate too high (${Math.round(
          blockingRate * 100
        )}%)`,
        "warn"
      );
      return false;
    }

    // Stop if captcha rate is too high
    if (captchaRate > 0.5) {
      logger.log(
        `⛔ Stopping scraping for ${domain} - captcha rate too high (${Math.round(
          captchaRate * 100
        )}%)`,
        "warn"
      );
      return false;
    }

    return true;
  }
}

// Export singleton instance
const antiDetectionMonitor = new AntiDetectionMonitor();

module.exports = {
  AntiDetectionMonitor,
  antiDetectionMonitor,
};

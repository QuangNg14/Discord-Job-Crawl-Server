const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterJobsByDate, sendJobsToDiscord, generateJobId, normalizeJob } = require("../utils/helpers");
const { getPuppeteerLaunchOptions } = require("../utils/puppeteerLaunch");

/**
 * Helper function to convert timeFilter to ZipRecruiter's "days" parameter
 * @param {string} timeFilter - Time filter value
 * @returns {string} ZipRecruiter days parameter
 */
function getZipDays(timeFilter) {
  if (timeFilter === config.ziprecruiter.timeFilters.day) return "1";
  if (timeFilter === config.ziprecruiter.timeFilters.threeDays) return "3";
  if (timeFilter === config.ziprecruiter.timeFilters.week) return "5";
  if (timeFilter === config.ziprecruiter.timeFilters.month) return "30";
  return "1"; // Default to 1 day
}

/**
 * Map ZipRecruiter time filter to filterJobsByDate label
 * @param {string} timeFilter - Time filter value
 * @returns {string} filterJobsByDate label
 */
function getDateFilterLabel(timeFilter) {
  if (timeFilter === config.ziprecruiter.timeFilters.threeDays) return "three_days";
  if (timeFilter === config.ziprecruiter.timeFilters.week) return "week";
  if (timeFilter === config.ziprecruiter.timeFilters.month) return "month";
  return "day";
}

/**
 * ZipRecruiter-specific relevance filter for requested roles
 * @param {object} job - Job object
 * @param {string} role - Role type: "intern", "new_grad", or "both"
 * @returns {boolean} Whether job should be included
 */
function isZipRecruiterRelevantJob(job, role = "both") {
  const title = (job.title || "").toLowerCase();
  const originalTitle = job.title || "";

  const allowedKeywords = [
    "software engineer", "software developer", "software engineering",
    "data engineer", "data science", "data scientist", "data analyst",
    "business analyst", "finance", "financial analyst",
    "machine learning", "ml engineer", "ai engineer",
    "developer", "programmer", "swe", "sde",
  ];

  const hasAllowedKeyword = allowedKeywords.some((keyword) =>
    title.includes(keyword)
  );
  if (!hasAllowedKeyword) {
    return false;
  }

  const internKeywords = ["intern", "internship", "co-op", "coop", "student"];
  const newGradKeywords = [
    "new grad", "new graduate", "entry level", "entry-level",
    "junior", "recent graduate", "early career",
    "university grad", "university graduate", "college grad", "college graduate",
    "new college grad", "new college graduate",
    "engineer i", "engineer 1", "engineer 0",
    "developer i", "developer 1", "developer 0",
    "analyst i", "analyst 1", "analyst 0",
    "scientist i", "scientist 1", "scientist 0",
    "sde i", "sde 1", "swe i", "swe 1",
    "associate software", "associate data", "associate developer",
    "associate engineer", "associate analyst",
    "level 0", "level 1", "level i",
    "2025 start", "2026 start", "2025 grad", "2026 grad",
  ];

  const newGradRegexPatterns = [
    /\b(?:engineer|developer|analyst|scientist)\s+[i1]\b/i,
    /\b(?:engineer|developer|analyst|scientist)\s+[i1]\s*[-–—]/i,
  ];

  if (role === "intern") {
    return internKeywords.some((keyword) => title.includes(keyword));
  }

  if (role === "new_grad") {
    const hasNewGradKeyword = newGradKeywords.some((keyword) => title.includes(keyword));
    const hasNewGradPattern = newGradRegexPatterns.some((regex) => regex.test(originalTitle));
    return hasNewGradKeyword || hasNewGradPattern;
  }

  const matchesIntern = internKeywords.some((keyword) => title.includes(keyword));
  const hasNewGradKeyword = newGradKeywords.some((keyword) => title.includes(keyword));
  const hasNewGradPattern = newGradRegexPatterns.some((regex) => regex.test(originalTitle));
  return matchesIntern || hasNewGradKeyword || hasNewGradPattern;
}

/**
 * Scrape one ZipRecruiter search URL using an existing browser (no launch).
 * @param {object} browser - Puppeteer browser instance
 * @param {string} searchUrl - Search URL
 * @returns {Array} Array of job objects
 */
async function scrapeZipRecruiterPage(browser, searchUrl) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/91.0.4472.124 Safari/537.36"
    );
    await page.goto(searchUrl, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });
    await delay(4000);

    // Optional: dismiss cookie/consent so job list is visible
    try {
      const clicked = await page.evaluate(() => {
        const selectors = ['.cc-accept', '#onetrust-accept-btn-handler', '[data-testid*="accept"]', 'button[aria-label*="Accept"]'];
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el) { el.click(); return true; }
          } catch (_) {}
        }
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const acceptBtn = buttons.find((b) => /accept|agree|allow|ok/i.test(b.textContent || ""));
        if (acceptBtn) { acceptBtn.click(); return true; }
        return false;
      });
      if (clicked) await delay(1500);
    } catch (_) {}

    // Wait for job content to load
    try {
      await page.waitForSelector('article, [class*="job"], [data-testid*="job"], .job_content, a[href*="/jobs/"]', { timeout: 15000 });
    } catch (_) {
      // continue; we still run evaluate and may find links
    }

    if (config.debugMode) {
      await page.screenshot({
        path: `debug-ziprecruiter-${Date.now()}.png`,
        fullPage: true,
      });
    }

    const jobs = await page.evaluate(() => {
      const results = [];
      const processedTitles = new Set();

      // Strategy 1: Modern ZipRecruiter uses <article> elements for job cards
      const articleElements = document.querySelectorAll('article');
      // Strategy 2: Job cards with data attributes / class names
      const jobCards = document.querySelectorAll('[data-testid*="job"], [class*="job_result"], [class*="job-listing"], [class*="JobCard"], [class*="jobCard"], [class*="JobResult"]');
      // Strategy 3: Links to job pages (reliable fallback)
      const jobLinks = document.querySelectorAll('a[href*="/jobs/"], a[href*="/k/l/"], a[href*="/c/"]');
      // Strategy 4: Generic result containers
      const resultContainers = document.querySelectorAll('.search-result, [class*="result"], [class*="listing"], [class*="SearchResult"]');

      const allElements = new Set([...articleElements, ...jobCards, ...resultContainers]);
      jobLinks.forEach((link) => {
        try {
          const href = link.href || "";
          if (!href || href === "#" || !href.includes("ziprecruiter.com")) return;
          const container = link.closest('article') || link.closest('[class*="job"]') || link.closest('[class*="result"]') || link.closest('[class*="JobCard"]') || link.parentElement?.parentElement;
          if (container) allElements.add(container);
        } catch (_) {}
      });

      allElements.forEach((element) => {
        try {
          const textContent = element.textContent || element.innerText || "";
          const cleanText = textContent.trim().replace(/\s+/g, " ");
          if (cleanText.length < 20) return;

          let title = "";
          let company = "";
          let location = "";
          let url = "";
          let postedDate = "Recent";

          const linkEl = element.querySelector('a[href*="/jobs/"]') || element.querySelector('a[href*="/k/l/"]') || element.querySelector('a[href*="/c/"]') || element.querySelector('a[class*="job"]') || element.querySelector('a');
          if (linkEl) url = linkEl.href;
          if (element.href) url = element.href;

          const titleEl = element.querySelector('h2, h3, h4, [class*="title"], [class*="Title"], [data-testid*="title"]');
          if (titleEl) title = titleEl.innerText.trim();
          const companyEl = element.querySelector('[class*="company"], [class*="Company"], [data-testid*="company"], [class*="employer"]');
          if (companyEl) company = companyEl.innerText.trim();
          const locationEl = element.querySelector('[class*="location"], [class*="Location"], [data-testid*="location"]');
          if (locationEl) location = locationEl.innerText.trim();
          const dateEl = element.querySelector('[class*="date"], [class*="posted"], [class*="time"], [class*="ago"]');
          if (dateEl) postedDate = dateEl.innerText.trim();

          if (!title || !company) {
            const lines = cleanText.split(/[\n·•|]/).map((l) => l.trim()).filter((l) => l.length > 2 && l.length < 200);
            for (const line of lines) {
              const lowerLine = line.toLowerCase();
              if (lowerLine.includes("apply") || lowerLine.includes("save") || lowerLine.includes("sign") || lowerLine.includes("login") || lowerLine.includes("quick") || lowerLine.includes("easy")) continue;
              if (!title && (lowerLine.includes("engineer") || lowerLine.includes("developer") || lowerLine.includes("scientist") || lowerLine.includes("analyst") || lowerLine.includes("intern") || lowerLine.includes("software") || lowerLine.includes("data") || lowerLine.includes("machine learning"))) title = line;
              if (!company && !lowerLine.includes("engineer") && !lowerLine.includes("developer") && !lowerLine.includes("intern") && line.length > 2 && line.length < 60) company = line;
              if (!location && /\b[A-Z]{2}\b/.test(line) && line.includes(",")) location = line;
              if (lowerLine.includes("ago") || lowerLine.includes("today") || lowerLine.includes("yesterday") || lowerLine.match(/\d+[hd]\b/)) postedDate = line;
            }
          }

          if (title && title.length > 3 && !processedTitles.has(title.toLowerCase())) {
            processedTitles.add(title.toLowerCase());
            if (!url) url = "#";
            results.push({
              title,
              url,
              company: company || "Company not specified",
              location: location || "Location not specified",
              postedDate,
              description: cleanText.substring(0, 200) + "...",
              metadata: cleanText,
              salary: "",
              workModel: "",
              source: "ziprecruiter",
            });
          }
        } catch (err) {
          // ignore per-element errors
        }
      });

      return results;
    });

    // Add id/jobId/normalizedId in Node (generateJobId is not available in browser context)
    const processedJobs = jobs.map((job) => {
      const normalized = normalizeJob(job);
      return { ...normalized, id: normalized.normalizedId, jobId: normalized.normalizedId };
    });

    if (processedJobs.length === 0) {
      const diag = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/jobs/"], a[href*="/k/l/"]');
        const articles = document.querySelectorAll("article");
        const bodySnippet = (document.body?.innerText || "").substring(0, 400);
        return { title: document.title, jobLinkCount: links.length, articleCount: articles.length, bodyPreview: bodySnippet };
      }).catch(() => ({ title: "(evaluate failed)", jobLinkCount: 0, articleCount: 0, bodyPreview: "" }));
      logger.log(`⚠️ ZipRecruiter 0 jobs. Page title: "${diag.title}", job links: ${diag.jobLinkCount}, articles: ${diag.articleCount}. Body preview: ${(diag.bodyPreview || "").substring(0, 150)}...`, "warn");
    }

    logger.log(`ZipRecruiter scraper found ${processedJobs.length} jobs.`);
    await page.close();
    return processedJobs;
  } catch (error) {
    logger.log(`Error scraping ZipRecruiter page: ${error.message}`, "error");
    await page.close().catch(() => {});
    return [];
  }
}

/**
 * Scrape ZipRecruiter search results (launches its own browser - for backward compatibility).
 * Prefer using scrapeZipRecruiterPage with a shared browser when calling from scrapeAllJobs.
 * @param {string} searchUrl - Search URL
 * @returns {Array} Array of job objects
 */
async function scrapeZipRecruiter(searchUrl) {
  let browser;
  try {
    browser = await puppeteer.launch(getPuppeteerLaunchOptions({ headless: "new" }));
    const jobs = await scrapeZipRecruiterPage(browser, searchUrl);
    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping ZipRecruiter: ${error.message}`, "error");
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

/**
 * Main function to scrape ZipRecruiter jobs
 * @param {string} timeFilter - Time filter for jobs
 * @param {object} client - Discord client (optional)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern", "new_grad", or "both"
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeAllJobs(timeFilter, client, mode = "discord", role = "both") {
  logger.log("Starting ZipRecruiter scraping process");
  
  const allJobs = [];
  const allKeywords = config.ziprecruiter.jobKeywords;
  const locations = config.ziprecruiter.jobLocations;
  const jobLimit = mode === "comprehensive" ? config.ziprecruiter.jobLimits.comprehensive : config.ziprecruiter.jobLimits.discord;
  const maxJobsPerSearch = config.ziprecruiter.maxJobsPerSearch;

  // Filter keywords by role to avoid searching "intern" keywords for new_grad and vice versa
  const keywords = allKeywords.filter((keyword) => {
    const lowerKeyword = keyword.toLowerCase();
    const isInternKeyword =
      lowerKeyword.includes("intern") || lowerKeyword.includes("internship");
    if (role === "intern") return isInternKeyword;
    if (role === "new_grad") return !isInternKeyword;
    return true; // "both" uses all keywords
  });

  if (keywords.length !== allKeywords.length) {
    logger.log(
      `🎯 ZipRecruiter keyword filter applied for role: ${role} (${keywords.length}/${allKeywords.length} keywords)`
    );
  }

  // Calculate jobs per keyword-location combination
  const totalCombinations = keywords.length * locations.length;
  const jobsPerCombination = Math.ceil(jobLimit / totalCombinations);

  // Single browser per source to avoid SingletonLock and temp-dir issues
  let browser;
  try {
    browser = await puppeteer.launch(getPuppeteerLaunchOptions({ headless: "new" }));
  } catch (launchErr) {
    logger.log(`ZipRecruiter failed to launch browser: ${launchErr.message}`, "error");
    return { jobs: [], jobsFound: 0, source: "ziprecruiter" };
  }

  try {
    for (const keyword of keywords) {
      for (const location of locations) {
        try {
          logger.log(`Scraping ZipRecruiter for: ${keyword} in ${location}`);

          const days = getZipDays(timeFilter);
          const searchUrl = `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&refine_by_location_type=no_remote&radius=5000&days=${days}&refine_by_employment=employment_type%3Aall&refine_by_salary=&refine_by_salary_ceil=&lk=0aq8wal_FklwDhFiEGcMrw&page=1`;

          const jobs = await scrapeZipRecruiterPage(browser, searchUrl);

          if (jobs && jobs.length > 0) {
            const limitedRawJobs = jobs.slice(0, maxJobsPerSearch);
            const relevantJobs = limitedRawJobs.filter((job) => isZipRecruiterRelevantJob(job, role));
            logger.log(`Found ${relevantJobs.length} relevant jobs for ${keyword} in ${location} (role: ${role})`);

            const dateFilterLabel = getDateFilterLabel(timeFilter);
            const recentJobs = filterJobsByDate(relevantJobs, dateFilterLabel);
            logger.log(`📅 Date filtering: ${recentJobs.length}/${relevantJobs.length} jobs from last ${dateFilterLabel} for ${keyword} in ${location}`);

            const limitedCombinationJobs = recentJobs.slice(0, jobsPerCombination);
            allJobs.push(...limitedCombinationJobs);
          }

          await delay(2000);
        } catch (error) {
          logger.log(`Error scraping ${keyword} in ${location}: ${error.message}`, "error");
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  // Remove duplicates and limit total jobs
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex(j => j.id === job.id)
  ).slice(0, jobLimit);

  logger.log(`ZipRecruiter scraping complete. Found ${uniqueJobs.length} unique jobs across ${locations.length} locations.`);

  // Save to cache
  if (uniqueJobs.length > 0) {
    await mongoService.addJobs(uniqueJobs, "ziprecruiter");
  }

  return {
    jobs: uniqueJobs,
    jobsFound: uniqueJobs.length,
    source: "ziprecruiter"
  };
}

module.exports = {
  scrapeAllJobs,
  scrapeZipRecruiter
};

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay } = require("../utils/helpers");

/**
 * Extract clean text from element, removing unwanted characters
 * @param {string} text - Raw text from element
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/[*\u00A0\u2022\u2023\u25E6\u2043\u2219]/g, "") // Remove asterisks and bullet points
    .replace(/\s+/g, " ") // Replace multiple whitespace with single space
    .trim();
}

/**
 * LinkedIn scraper function using Puppeteer with improved selectors
 * @param {string} searchUrl - The LinkedIn search URL
 * @param {number} maxJobs - Maximum number of jobs to return
 * @returns {Array} Array of job objects
 */
async function scrapeLinkedIn(searchUrl, maxJobs) {
  logger.log(`Scraping LinkedIn: ${searchUrl}`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
    });

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 45000 });
    await delay(5000); // Increased wait time

    // Wait for job listings to load
    try {
      await page.waitForSelector(
        ".jobs-search__results-list, .job-search-card, .jobs-search-results-list",
        { timeout: 10000 }
      );
    } catch (e) {
      logger.log("Could not find job listings container", "warn");
    }

    const jobs = await page.evaluate((maxJobs) => {
      // Clean text function for browser context
      function cleanText(text) {
        if (!text) return "";
        return text
          .replace(/[*\u00A0\u2022\u2023\u25E6\u2043\u2219]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      // Try multiple selectors for job containers
      const jobContainerSelectors = [
        ".jobs-search__results-list li",
        ".job-search-card",
        ".jobs-search-results-list li",
        "[data-job-id]",
        ".scaffold-layout__list-container li",
      ];

      let jobNodes = [];
      for (const selector of jobContainerSelectors) {
        jobNodes = Array.from(document.querySelectorAll(selector));
        if (jobNodes.length > 0) break;
      }

      console.log(`Found ${jobNodes.length} job nodes`);
      const results = [];

      for (let i = 0; i < Math.min(maxJobs, jobNodes.length); i++) {
        const el = jobNodes[i];

        // Try multiple selectors for each field
        let title = "";
        const titleSelectors = [
          ".base-search-card__title",
          ".job-search-card__title",
          ".jobs-unified-top-card__job-title",
          "h3 a",
          "[data-job-title]",
          ".job-card-list__title",
        ];

        for (const selector of titleSelectors) {
          const titleElement = el.querySelector(selector);
          if (titleElement) {
            title = cleanText(
              titleElement.innerText || titleElement.textContent
            );
            if (title && title !== "" && !title.includes("*")) break;
          }
        }

        let company = "";
        const companySelectors = [
          ".base-search-card__subtitle",
          ".job-search-card__subtitle",
          ".jobs-unified-top-card__company-name",
          "h4 a",
          "[data-company-name]",
          ".job-card-container__company-name",
        ];

        for (const selector of companySelectors) {
          const companyElement = el.querySelector(selector);
          if (companyElement) {
            company = cleanText(
              companyElement.innerText || companyElement.textContent
            );
            if (company && company !== "" && !company.includes("*")) break;
          }
        }

        let location = "";
        const locationSelectors = [
          ".job-search-card__location",
          ".jobs-unified-top-card__bullet",
          ".job-card-container__metadata-item",
          "[data-job-location]",
          ".job-search-card__metadata",
        ];

        for (const selector of locationSelectors) {
          const locationElement = el.querySelector(selector);
          if (locationElement) {
            location = cleanText(
              locationElement.innerText || locationElement.textContent
            );
            if (location && location !== "" && !location.includes("*")) break;
          }
        }

        let postedDate = "";
        const dateSelectors = [
          ".job-search-card__listdate",
          ".jobs-unified-top-card__bullet",
          "time",
          ".job-card-container__metadata-item:last-child",
          "[data-posted-date]",
        ];

        for (const selector of dateSelectors) {
          const dateElement = el.querySelector(selector);
          if (dateElement) {
            postedDate = cleanText(
              dateElement.innerText || dateElement.textContent
            );
            if (postedDate && postedDate !== "" && !postedDate.includes("*"))
              break;
          }
        }

        // Get URL
        let url = "";
        const urlSelectors = [
          ".base-card__full-link",
          ".job-search-card__title-link",
          "h3 a",
          "a[href*='/jobs/view/']",
          "[data-job-id] a",
        ];

        for (const selector of urlSelectors) {
          const urlElement = el.querySelector(selector);
          if (urlElement && urlElement.href) {
            url = urlElement.href;
            break;
          }
        }

        // Validate and clean company name to avoid aggregated listings
        if (
          company &&
          (company.toLowerCase().includes("jobright") ||
            company.toLowerCase().includes("indeed") ||
            company.toLowerCase().includes("ziprecruiter") ||
            company.toLowerCase().includes("simplyhired") ||
            company.toLowerCase().includes("monster") ||
            company.toLowerCase().includes("careerbuilder"))
        ) {
          // Log for debugging
          console.log(`Skipping aggregated listing: ${title} at ${company}`);
          continue;
        }

        // Debug logging for company extraction
        if (company && company !== "Company details unavailable") {
          console.log(`Extracted company: "${company}" for job: "${title}"`);
        }

        // Apply fallbacks only if we couldn't extract anything meaningful
        if (!title || title === "" || title.includes("*")) {
          title = "Position details unavailable";
        }
        if (!company || company === "" || company.includes("*")) {
          company = "Company details unavailable";
        }
        if (!location || location === "" || location.includes("*")) {
          location = "Location not specified";
        }
        if (!postedDate || postedDate === "" || postedDate.includes("*")) {
          postedDate = "Recently posted";
        }

        // Generate job ID
        let jobId = "";
        try {
          const match = url.match(/(?:currentJobId=|jobs\/view\/)(\d+)/);
          jobId = match
            ? `linkedin-${match[1]}`
            : `linkedin-${Math.random().toString(36).substring(2, 10)}`;
        } catch (e) {
          jobId = `linkedin-${Math.random().toString(36).substring(2, 10)}`;
        }

        // Only add jobs that have at least a title and URL
        if (title !== "Position details unavailable" && url) {
          results.push({
            id: jobId,
            title,
            url,
            company,
            location,
            postedDate,
            description: "",
            metadata: "",
            salary: "",
            workModel: "",
            source: "linkedin",
          });
        }
      }

      console.log(`Extracted ${results.length} valid jobs`);
      return results;
    }, maxJobs);

    if (config.debugMode) {
      logger.log(`LinkedIn scraper found ${jobs.length} jobs.`);
    }

    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping LinkedIn: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Scrape LinkedIn with retry logic
 * @param {string} searchUrl - The LinkedIn search URL
 * @param {number} maxJobs - Maximum number of jobs to return
 * @param {number} retries - Number of retry attempts
 * @returns {Array} Array of job objects
 */
async function scrapeLinkedInWithRetry(searchUrl, maxJobs, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.log(
        `LinkedIn scraping attempt ${attempt}/${retries} for: ${searchUrl}`
      );
      const jobs = await scrapeLinkedIn(searchUrl, maxJobs);

      if (jobs && jobs.length > 0) {
        logger.log(
          `Successfully scraped ${jobs.length} jobs on attempt ${attempt}`
        );
        return jobs;
      } else {
        logger.log(`No jobs found on attempt ${attempt}`, "warn");
        if (attempt === retries) {
          logger.log(
            `All ${retries} attempts failed for: ${searchUrl}`,
            "error"
          );
          return [];
        }
        await delay(10000 * attempt); // Exponential backoff
      }
    } catch (error) {
      logger.log(`Attempt ${attempt} failed: ${error.message}`, "error");
      if (attempt === retries) {
        logger.log(`All ${retries} attempts failed for: ${searchUrl}`, "error");
        return [];
      }
      await delay(15000 * attempt); // Exponential backoff
    }
  }
  return [];
}

/**
 * Main function to scrape LinkedIn jobs
 * @param {string} timeFilter - Time filter (e.g., 'r86400', 'r604800', 'r2592000')
 * @param {object} client - Discord client
 * @param {string} mode - 'discord' or 'comprehensive' mode
 * @returns {object} Scraping status with job count
 */
async function scrapeAllJobs(
  timeFilter = null,
  client,
  mode = "comprehensive"
) {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
  };

  logger.log(`Starting LinkedIn job scraping process (${mode} mode)`);

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    // Use default time filter for comprehensive mode if none provided
    if (!timeFilter && mode === "comprehensive") {
      timeFilter =
        config.linkedin.timeFilters[config.linkedin.defaultComprehensiveFilter];
    }

    const modeText =
      mode === "discord" ? " (Discord Command)" : " (Comprehensive)";
    await channel.send(`LinkedIn Job Postings Update${modeText}`);

    for (const keyword of config.linkedin.jobKeywords) {
      for (const location of config.linkedin.jobLocations) {
        try {
          // Build search URL with proper parameters matching user's LinkedIn URLs
          const params = new URLSearchParams({
            keywords: keyword,
            location: location,
          });

          // Add standard LinkedIn parameters from config
          const standardParams = config.linkedin.standardParams;
          for (const [key, value] of Object.entries(standardParams)) {
            params.append(key, value);
          }

          // Add time filter if provided
          if (timeFilter) {
            params.append("f_TPR", timeFilter);
          }

          const searchUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;
          logger.log(
            `Scraping LinkedIn for "${keyword}" in "${location}" (${mode} mode)`
          );
          logger.log(`Search URL: ${searchUrl}`);

          // Determine job limit based on mode and time filter
          let jobLimit;
          if (mode === "discord") {
            // Get Discord-specific limit based on time filter
            const timeFilterKey =
              Object.keys(config.linkedin.timeFilters).find(
                (key) => config.linkedin.timeFilters[key] === timeFilter
              ) || "week";
            jobLimit =
              config.linkedin.jobLimits.discord[timeFilterKey] ||
              config.linkedin.jobLimits.discord.week;
          } else {
            // Comprehensive mode limits
            const timeFilterKey = Object.keys(config.linkedin.timeFilters).find(
              (key) => config.linkedin.timeFilters[key] === timeFilter
            );
            jobLimit =
              timeFilterKey === "week"
                ? config.linkedin.jobLimits.comprehensive.week
                : config.linkedin.jobLimits.comprehensive.default;
          }

          logger.log(
            `Using job limit of ${jobLimit} for "${keyword}" (${mode} mode)`
          );

          const jobs = await scrapeLinkedInWithRetry(searchUrl, jobLimit, 3);

          if (!jobs || jobs.length === 0) {
            logger.log(`No jobs found for "${keyword}" in "${location}"`);
            continue;
          }

          // Filter out jobs that already exist in the cache
          const newJobs = jobs.filter(
            (job) => !mongoService.jobExists(job.id, "linkedin")
          );

          // Log job data quality
          const validJobs = jobs.filter(
            (job) =>
              job.title &&
              !job.title.includes("*") &&
              job.title !== "Position details unavailable"
          );
          const invalidJobs = jobs.length - validJobs.length;

          if (invalidJobs > 0) {
            logger.log(
              `Warning: ${invalidJobs}/${jobs.length} jobs had invalid/missing data for "${keyword}" in "${location}"`,
              "warn"
            );
          }

          logger.log(
            `Found ${jobs.length} total jobs, ${newJobs.length} new jobs for "${keyword}" in "${location}" (${mode} mode)`
          );

          // Add new jobs to the cache
          if (newJobs.length > 0) {
            await mongoService.addJobs(newJobs, "linkedin");
          }

          lastRunStatus.jobsFound += newJobs.length;

          if (newJobs.length > 0) {
            const timeFilterText = timeFilter
              ? ` (${
                  Object.keys(config.linkedin.timeFilters).find(
                    (key) => config.linkedin.timeFilters[key] === timeFilter
                  ) || "filtered"
                })`
              : "";
            await channel.send(
              `LinkedIn - ${keyword} in ${location}${timeFilterText} (${newJobs.length} new postings)`
            );

            // Limit Discord output to prevent spam
            const jobsToShow =
              mode === "discord" ? newJobs.slice(0, jobLimit) : newJobs;

            for (const job of jobsToShow) {
              if (!job.title || !job.url) continue;
              const embed = new EmbedBuilder()
                .setTitle(job.title)
                .setURL(job.url)
                .setColor("#0077b5")
                .setDescription(job.company)
                .addFields(
                  { name: "Location", value: job.location, inline: true },
                  { name: "Posted", value: job.postedDate, inline: true }
                )
                .setFooter({
                  text: `Source: LinkedIn | ID: ${job.id.substring(0, 10)}`,
                });
              await channel.send({ embeds: [embed] });
              await delay(1000);
            }

            // If there are more jobs in comprehensive mode, mention it
            if (
              mode === "comprehensive" &&
              newJobs.length > jobsToShow.length
            ) {
              await channel.send(
                `... and ${
                  newJobs.length - jobsToShow.length
                } more jobs added to database`
              );
            }
          } else {
            logger.log(`No new jobs for "${keyword}" in "${location}"`);
          }
        } catch (error) {
          lastRunStatus.errorCount++;
          logger.log(
            `Error scraping for "${keyword}" in "${location}": ${error.message}`,
            "error"
          );
          try {
            await channel.send(
              `Error scraping LinkedIn for ${keyword} in ${location} - ${error.message.substring(
                0,
                100
              )}`
            );
          } catch (msgError) {
            logger.log(
              `Failed to send error message: ${msgError.message}`,
              "error"
            );
          }
        }
        // Delay between searches to reduce detection risk
        await delay(5000);
      }
    }

    await channel.send(
      `LinkedIn job scraping complete (${mode} mode). Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log(
      `LinkedIn job scraping completed successfully (${mode} mode). Found ${lastRunStatus.jobsFound} new jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in LinkedIn scrapeAllJobs (${mode} mode): ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

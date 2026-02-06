const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs } = require("../utils/helpers");

/**
 * Build Dice.com search URL with special handling for Dice's URL structure
 * @param {string} keyword - Search keyword
 * @param {string} timeFilter - Time filter parameter
 * @returns {string} Complete search URL
 */
function buildDiceSearchUrl(keyword, timeFilter = null) {
  // Using the URL structure seen in the actual page HTML
  const encodedKeyword = encodeURIComponent(keyword);
  let url = `${config.dice.baseUrl}?q=${encodedKeyword}`;

  // Add standard parameters in the order they appear in the original URL
  url += `&countryCode=${config.dice.defaultSearchParams.countryCode}`;
  url += `&radius=${config.dice.defaultSearchParams.radius}`;
  url += `&radiusUnit=${config.dice.defaultSearchParams.radiusUnit}`;
  url += `&page=${config.dice.defaultSearchParams.page}`;
  url += `&pageSize=${config.dice.defaultSearchParams.pageSize}`;

  // Add posted date filter if specified
  if (timeFilter && timeFilter !== "ALL") {
    url += `&filters.postedDate=${timeFilter}`;
  }

  // Add language
  url += `&language=${config.dice.defaultSearchParams.language}`;

  // Add eid if present
  if (config.dice.defaultSearchParams.eid) {
    url += `&eid=${config.dice.defaultSearchParams.eid}`;
  }

  logger.log(`Built URL: ${url}`);
  return url;
}

/**
 * Scrape Dice.com search results
 * @param {string} searchUrl - The search URL
 * @param {number} maxJobs - Maximum number of jobs to return
 * @returns {Array} Array of job objects
 */
async function scrapeDice(searchUrl, maxJobs) {
  logger.log(`Scraping Dice.com: ${searchUrl}`);
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new", // modern headless
      args: ["--no-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    // Navigate to the search URL
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });
    await delay(3000);

    // Check for cookie consent dialog and accept if present
    try {
      const cookieButton = await page.$(
        'button[data-testid="cookie-banner-accept"]'
      );
      if (cookieButton) {
        await cookieButton.click();
        await delay(1000);
      }
    } catch (e) {
      logger.log("No cookie consent dialog found or unable to accept.", "info");
    }

    // Take a screenshot for debugging if in debug mode
    if (config.debugMode) {
      await page.screenshot({ path: `dice-debug-${Date.now()}.png` });
      logger.log("Screenshot saved as dice-debug.png");
    }

    // Wait for job cards to be loaded
    await page
      .waitForSelector('[data-cy="card"]', { timeout: 10000 })
      .catch(() => {
        logger.log(
          'Could not find job cards with [data-cy="card"] selector',
          "warn"
        );
      });

    const jobs = await page.evaluate((maxJobs) => {
      // Try different selectors that might match job cards on Dice.com
      const selectors = [
        '[data-cy="card"]',
        ".search-card",
        "dhi-search-card",
        '[data-testid="searchCard"]',
        ".job-card",
        "article",
      ];

      let jobCards = [];
      for (const selector of selectors) {
        const cards = Array.from(document.querySelectorAll(selector));
        if (cards.length > 0) {
          jobCards = cards;
          console.log(
            `Found ${cards.length} job cards with selector: ${selector}`
          );
          break;
        }
      }

      console.log(`Total job cards found: ${jobCards.length}`);
      const results = [];

      for (let i = 0; i < Math.min(maxJobs, jobCards.length); i++) {
        const card = jobCards[i];
        console.log(`Processing job card ${i + 1}`);

        // Try multiple possible selectors for each element
        const titleSelectors = [
          '[data-cy="card-title"]',
          '[data-testid="title"]',
          "a.card-title-link",
          "h5",
          ".title",
        ];
        const companySelectors = [
          '[data-cy="company-name"]',
          '[data-testid="company-name-link"]',
          ".company-name",
          "h6",
          ".employer",
        ];
        const locationSelectors = [
          '[data-cy="location"]',
          '[data-testid="location"]',
          ".location",
          '[itemprop="location"]',
        ];
        const dateSelectors = [
          '[data-cy="card-date"]',
          '[data-cy="search-result-posted-date"]',
          ".posted-date",
          ".date",
          "time",
        ];
        const linkSelectors = [
          'a[data-cy="card-title-link"]',
          'a[data-testid="title-link"]',
          "a.card-title-link",
          "a.title",
          'a[href*="/job-detail/"]',
        ];

        // Helper function to find element by multiple selectors
        const findElement = (selectors) => {
          for (const selector of selectors) {
            const element = card.querySelector(selector);
            if (element) return element;
          }
          return null;
        };

        // Find elements
        const titleElement = findElement(titleSelectors);
        const companyElement = findElement(companySelectors);
        const locationElement = findElement(locationSelectors);
        const postedDateElement = findElement(dateSelectors);
        const linkElement = findElement(linkSelectors);

        // Extract data with fallbacks
        const title = titleElement
          ? titleElement.innerText.trim()
          : "Unknown Position";
        let url = "";

        if (linkElement) {
          url = linkElement.href;
        } else {
          // If we can't find a direct link, look for any link that might contain job details
          const anyLink = card.querySelector('a[href*="/job-detail/"]');
          url = anyLink ? anyLink.href : "";
        }

        const company = companyElement
          ? companyElement.innerText.trim()
          : "Unknown Company";
        const location = locationElement
          ? locationElement.innerText.trim()
          : "Not specified";
        const postedDate = postedDateElement
          ? postedDateElement.innerText.trim()
          : "N/A";

        console.log(`Found job: ${title} at ${company}`);

        // Generate a job ID from URL if possible
        let jobId = "";
        try {
          if (url.includes("/job-detail/")) {
            const urlParts = url.split("/");
            jobId = `dice-${urlParts[urlParts.length - 1]}`;
          } else {
            jobId = `dice-${Math.random().toString(36).substring(2, 15)}`;
          }
        } catch (e) {
          jobId = `dice-${Math.random().toString(36).substring(2, 15)}`;
        }

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
          source: "dice",
        });
      }

      return results;
    }, maxJobs);

    if (config.debugMode) {
      logger.log(`Dice.com scraper found ${jobs.length} jobs.`);
    }

    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping Dice.com: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape Dice.com jobs
 * @param {string} timeFilter - Time filter for search
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern" or "new grad"
 * @returns {object} Status object with jobs array
 */
async function scrapeAllJobs(timeFilter, client, mode = "discord", role = "both") {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
    jobs: [] // Add jobs array to return
  };

  logger.log("Starting Dice.com job scraping process");

  try {
    const channel = client?.channels?.cache?.get(config.logChannelId);
    
    if (channel && mode === "discord") {
      await channel.send("Dice.com Job Postings Update");
    }

    // Loop through each keyword
    for (const keyword of config.dice.jobKeywords) {
      try {
        const encodedKeyword = encodeURIComponent(keyword);
        logger.log(`Encoded keyword: ${encodedKeyword}`);

        // Build the search URL
        const searchParams = new URLSearchParams({
          q: keyword,
          ...config.dice.defaultSearchParams,
          fromAge: timeFilter
        });
        const searchUrl = `${config.dice.baseUrl}?${searchParams.toString()}`;
        logger.log(`Scraping Dice.com for "${keyword}"`);
        logger.log(`Search URL: ${searchUrl}`);

        // Determine job limit based on mode
        const jobLimit = mode === "comprehensive" 
          ? config.dice.jobLimits.comprehensive 
          : config.dice.jobLimits.discord;

        // Scrape all available job postings
        const jobs = await scrapeDice(searchUrl);
        logger.log(`Raw jobs found for "${keyword}": ${jobs.length}`);
        
        if (!jobs || jobs.length === 0) {
          logger.log(`No jobs found for "${keyword}"`);
          continue;
        }

        // Filter for relevant software/data engineering jobs only
        const relevantJobs = filterRelevantJobs(jobs, role);
        logger.log(`Relevant jobs for "${keyword}": ${relevantJobs.length}`);
        
        if (relevantJobs.length === 0) {
          logger.log(`No relevant software/data jobs found for "${keyword}"`);
          continue;
        }

        // Filter out jobs already in cache
        const newJobs = relevantJobs.filter(
          (job) => !mongoService.jobExists(job.id, "dice")
        );

        logger.log(
          `Found ${jobs.length} total jobs, ${relevantJobs.length} relevant jobs, ${newJobs.length} new jobs for "${keyword}"`
        );

        // Add new jobs to the cache
        if (newJobs.length > 0) {
          await mongoService.addJobs(newJobs, "dice");
        }

        // Add all relevant jobs to the return array (not just new ones)
        lastRunStatus.jobs.push(...relevantJobs);
        lastRunStatus.jobsFound += newJobs.length;

        // Only post to Discord if client is provided and mode is discord
        if (channel && mode === "discord" && newJobs.length > 0) {
          await channel.send(
            `Dice.com - ${keyword} (${newJobs.length} new postings)`
          );

          // Limit Discord output to prevent spam
          const jobsToShow = newJobs.slice(0, jobLimit);

          for (const job of jobsToShow) {
            if (!job.title || !job.url) continue;
            const embed = new EmbedBuilder()
              .setTitle(job.title)
              .setURL(job.url)
              .setColor(config.dice.embedColor)
              .setDescription(job.company)
              .addFields(
                { name: "Location", value: job.location, inline: true },
                { name: "Posted", value: job.postedDate, inline: true }
              )
              .setFooter({
                text: `Source: Dice.com | ID: ${job.id.substring(0, 10)}`,
              });
            await channel.send({ embeds: [embed] });
            await delay(1000);
          }

          // If there are more jobs in comprehensive mode, mention it
          if (newJobs.length > jobsToShow.length) {
            await channel.send(
              `... and ${
                newJobs.length - jobsToShow.length
              } more jobs added to database`
            );
          }
        } else if (newJobs.length === 0) {
          logger.log(`No new jobs for "${keyword}"`);
        }
      } catch (error) {
        lastRunStatus.errorCount++;
        logger.log(
          `Error scraping for "${keyword}": ${error.message}`,
          "error"
        );
        if (channel && mode === "discord") {
          try {
            await channel.send(
              `Error scraping Dice.com for ${keyword} - ${error.message.substring(
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
      }
      // Delay between searches to reduce detection risk
      await delay(5000);
    }

    if (channel && mode === "discord") {
      await channel.send(
        `Dice.com job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
      );
    }
    
    lastRunStatus.success = true;
    logger.log(
      `Dice.com job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs, collected ${lastRunStatus.jobs.length} total relevant jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in Dice.com scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

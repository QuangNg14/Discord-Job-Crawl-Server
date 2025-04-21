const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay } = require("../utils/helpers");

/**
 * LinkedIn scraper function using Puppeteer
 * @param {string} searchUrl - The LinkedIn search URL
 * @param {number} maxJobs - Maximum number of jobs to return
 * @returns {Array} Array of job objects
 */
async function scrapeLinkedIn(searchUrl, maxJobs) {
  logger.log(`Scraping LinkedIn: ${searchUrl}`);
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

    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await delay(3000);

    const jobs = await page.evaluate((maxJobs) => {
      const jobNodes = Array.from(
        document.querySelectorAll(".jobs-search__results-list li")
      );
      const results = [];
      for (let i = 0; i < Math.min(maxJobs, jobNodes.length); i++) {
        const el = jobNodes[i];
        const titleElement = el.querySelector(".base-search-card__title");
        const urlElement = el.querySelector(".base-card__full-link");
        const companyElement = el.querySelector(".base-search-card__subtitle");
        const locationElement = el.querySelector(".job-search-card__location");
        const postedDateElement = el.querySelector(
          ".job-search-card__listdate"
        );

        const title = titleElement
          ? titleElement.innerText.trim()
          : "Unknown Position";
        const url = urlElement ? urlElement.href : "";
        const company = companyElement
          ? companyElement.innerText.trim()
          : "Unknown Company";
        const location = locationElement
          ? locationElement.innerText.trim()
          : "Not specified";
        const postedDate = postedDateElement
          ? postedDateElement.innerText.trim()
          : "N/A";

        // Generate a job ID from URL if possible
        let jobId = "";
        try {
          const match = url.match(/currentJobId=(\d+)/);
          jobId = match
            ? `linkedin-${match[1]}`
            : `linkedin-${Math.random().toString(36).substring(2, 15)}`;
        } catch (e) {
          jobId = `linkedin-${Math.random().toString(36).substring(2, 15)}`;
        }

        results.push({
          id: jobId,
          title,
          url,
          company,
          location,
          postedDate,
          description: null,
        });
      }
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
 * Main function to scrape LinkedIn jobs
 * @param {string} timeFilter - Optional time filter (e.g., 'r86400')
 * @param {object} client - Discord client
 * @returns {number} Number of new jobs found
 */
async function scrapeAllJobs(timeFilter = null, client) {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
  };

  logger.log("Starting LinkedIn job scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    await channel.send("LinkedIn Job Postings Update");

    for (const keyword of config.linkedin.jobKeywords) {
      for (const location of config.linkedin.jobLocations) {
        try {
          // Encode the keyword and location for URL usage
          const encodedKeyword = encodeURIComponent(keyword);
          const encodedLocation = encodeURIComponent(location);
          logger.log(
            `Encoded keyword: ${encodedKeyword}, Encoded location: ${encodedLocation}`
          );

          // Build the search URL using URLSearchParams and optional query parameters
          const params = new URLSearchParams({
            keywords: keyword,
            location: location,
          });
          // Clone the global optional parameters and override if timeFilter is provided
          const queryParams = { ...config.linkedin.optionalQueryParams };
          if (timeFilter) {
            queryParams.f_TPR = timeFilter;
          }
          for (const key in queryParams) {
            if (queryParams.hasOwnProperty(key)) {
              params.append(key, queryParams[key]);
            }
          }
          const searchUrl = `https://www.linkedin.com/jobs/search/?${params.toString()}`;
          logger.log(`Scraping LinkedIn for "${keyword}" in "${location}"`);
          logger.log(`Search URL: ${searchUrl}`);

          // Get job limit based on keyword, with fallback to default
          const jobLimit =
            config.linkedin.jobLimits[keyword] ||
            config.linkedin.jobLimits.default;
          logger.log(`Using job limit of ${jobLimit} for keyword "${keyword}"`);

          const jobs = await scrapeLinkedIn(searchUrl, jobLimit);

          if (!jobs || jobs.length === 0) {
            logger.log(`No jobs found for "${keyword}" in "${location}"`);
            continue;
          }

          // Filter out jobs that already exist in the cache
          const newJobs = jobs.filter(
            (job) => !mongoService.jobExists(job.id, "linkedin")
          );

          // Add new jobs to the cache
          if (newJobs.length > 0) {
            await mongoService.addJobs(newJobs, "linkedin");
          }

          lastRunStatus.jobsFound += newJobs.length;

          if (newJobs.length > 0) {
            await channel.send(
              `LinkedIn - ${keyword} in ${location} (${newJobs.length} new postings)`
            );
            for (const job of newJobs) {
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
      `LinkedIn job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log(
      `LinkedIn job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in LinkedIn scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

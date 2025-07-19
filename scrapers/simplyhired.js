const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs } = require("../utils/helpers");

/**
 * SimplyHired scraper function using Puppeteer
 * @param {string} searchUrl - The SimplyHired search URL
 * @returns {Array} Array of job objects
 */
async function scrapeSimplyHired(searchUrl) {
  logger.log(`Scraping SimplyHired: ${searchUrl}`);
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new", // modern headless
      args: ["--no-sandbox"],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/91.0.4472.124 Safari/537.36"
    );
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await delay(5000);

    // Wait for the job cards. (Site layout might vary by region.)
    await page.waitForSelector("div.chakra-stack.css-1igwmid", {
      timeout: 10000,
    });

    if (config.debugMode) {
      await page.screenshot({
        path: `debug-simplyhired-${Date.now()}.png`,
        fullPage: true,
      });
    }

    const jobs = await page.evaluate(() => {
      // Simple hash function (djb2-style)
      function simpleHash(str) {
        let hash = 5381;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) + hash + str.charCodeAt(i);
        }
        return hash.toString(16);
      }
      const jobCards = Array.from(
        document.querySelectorAll("div.chakra-stack.css-1igwmid")
      );
      const results = [];
      for (const card of jobCards) {
        const titleEl = card.querySelector("h2 > a.chakra-button");
        if (!titleEl) continue;
        const title = titleEl.innerText.trim();
        const relativeUrl = titleEl.getAttribute("href");
        const url = relativeUrl
          ? `https://www.simplyhired.com${relativeUrl}`
          : "";

        // Get company name if available
        const companyElement = card.querySelector(".chakra-text.css-bujt2");
        const company = companyElement
          ? companyElement.innerText.trim()
          : "Unknown Company";

        // Get location if available
        const locationElement = card.querySelector(".chakra-text.css-1d5vfrt");
        const location = locationElement
          ? locationElement.innerText.trim()
          : "Not specified";

        // Get posted date if available
        const postedDateElement = card.querySelector(
          ".chakra-text.css-1ieddkj"
        );
        const postedDate = postedDateElement
          ? postedDateElement.innerText.trim()
          : "N/A";

        // Generate a unique ID using URL and title
        const jobId = url
          ? `sh-${simpleHash(url + title)}`
          : `sh-${Math.random().toString(36).substring(2, 15)}`;

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
          source: "simplyhired",
        });
      }
      return results;
    });

    if (config.debugMode) {
      jobs.forEach((job) =>
        logger.log(`Found job: ${job.title} | ID: ${job.id}`, "info")
      );
      logger.log(
        `SimplyHired scraper found ${jobs.length} job cards on the page.`
      );
    }
    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping SimplyHired: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape SimplyHired jobs
 * @param {string} timeFilter - Time filter value (e.g., '1', '7', '30')
 * @param {object} client - Discord client
 * @returns {object} Status object with job count and errors
 */
async function scrapeAllJobs(
  timeFilter = "1",
  client,
  mode = "discord",
  role = "intern"
) {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
  };

  logger.log("Starting SimplyHired job scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }
    await channel.send("SimplyHired Job Postings Update");

    // Use all keywords from config (role filtering applied in job processing)
    const allKeywords = config.simplyhired.jobKeywords;
    logger.log(
      `Using ${allKeywords.length} keywords for SimplyHired search (filtering for ${role} roles)`
    );

    // Loop through each keyword and location
    for (const keyword of allKeywords) {
      for (const location of config.simplyhired.jobLocations) {
        try {
          const encodedKeyword = encodeURIComponent(keyword);
          const encodedLocation = encodeURIComponent(location);
          logger.log(
            `Encoded keyword: ${encodedKeyword}, Encoded location: ${encodedLocation}`
          );

          // Build the base search URL
          const baseParams = new URLSearchParams({
            q: keyword,
            l: location,
            t: timeFilter,
          });
          const baseUrl = `https://www.simplyhired.com/search?${baseParams.toString()}`;
          logger.log(`Scraping SimplyHired for "${keyword}" in "${location}"`);
          logger.log(`Base Search URL: ${baseUrl}`);

          // Get job limit based on mode (discord = lightweight, comprehensive = thorough)
          const jobLimit =
            mode === "comprehensive"
              ? config.simplyhired.jobLimits.comprehensive
              : config.simplyhired.jobLimits.discord;
          logger.log(
            `Using job limit of ${jobLimit} for keyword "${keyword}" (${mode} mode)`
          );

          // Use a Map to hold unique new jobs
          const uniqueNewJobs = new Map();
          let pageNum = 1;
          while (
            uniqueNewJobs.size < jobLimit &&
            pageNum <= config.simplyhired.maxPages
          ) {
            let pageUrl = baseUrl;
            if (pageNum > 1) {
              pageUrl += `&pn=${pageNum}`;
            }
            logger.log(
              `Scraping page ${pageNum} for "${keyword}" in "${location}"`
            );
            const pageJobs = await scrapeSimplyHired(pageUrl);
            if (!pageJobs || pageJobs.length === 0) {
              logger.log(
                `No jobs found on page ${pageNum} for "${keyword}" in "${location}"`
              );
              break;
            }

            // Filter for relevant jobs first
            const relevantPageJobs = filterRelevantJobs(pageJobs, role);

            // Add jobs if not already in cache or our Map
            relevantPageJobs.forEach((job) => {
              if (
                !mongoService.jobExists(job.id, "simplyhired") &&
                !uniqueNewJobs.has(job.id)
              ) {
                uniqueNewJobs.set(job.id, job);
              }
            });
            pageNum++;
            await delay(3000);
          }

          // If we found more than the job limit for this keyword, slice down.
          let selectedJobs = Array.from(uniqueNewJobs.values());
          if (selectedJobs.length > jobLimit) {
            selectedJobs = selectedJobs.slice(0, jobLimit);
          }

          // Add new jobs to cache
          if (selectedJobs.length > 0) {
            await mongoService.addJobs(selectedJobs, "simplyhired");
          }

          lastRunStatus.jobsFound += selectedJobs.length;

          if (selectedJobs.length > 0) {
            await channel.send(
              `SimplyHired - ${keyword} in ${location} (${selectedJobs.length} new postings)`
            );
            for (const job of selectedJobs) {
              if (!job.title || !job.url) continue;
              const embed = new EmbedBuilder()
                .setTitle(job.title)
                .setURL(job.url)
                .setColor("#1e90ff")
                .setDescription(job.company)
                .addFields(
                  { name: "Location", value: job.location, inline: true },
                  { name: "Posted", value: job.postedDate, inline: true }
                )
                .setFooter({
                  text: `Source: SimplyHired | ID: ${job.id.substring(0, 10)}`,
                });
              await channel.send({ embeds: [embed] });
              await delay(1000);
            }
          } else {
            logger.log(
              `No new jobs for "${keyword}" in "${location}" after checking up to ${config.simplyhired.maxPages} pages`
            );
          }
        } catch (error) {
          lastRunStatus.errorCount++;
          logger.log(
            `Error scraping for "${keyword}" in "${location}": ${error.message}`,
            "error"
          );
          try {
            await channel.send(
              `Error scraping SimplyHired for ${keyword} in ${location} - ${error.message.substring(
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
        await delay(5000);
      }
    }

    await channel.send(
      `SimplyHired job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log(
      `SimplyHired job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in SimplyHired scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

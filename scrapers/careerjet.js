const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs } = require("../utils/helpers");

/**
 * Map time filter to Careerjet's "nw" parameter (1, 7, or 30 days)
 * @param {string} timeFilter - Time filter value
 * @returns {string} CareerJet time window parameter
 */
function getCareerjetTimeWindow(timeFilter) {
  if (timeFilter === config.careerjet.timeFilters.day) return "1";
  if (timeFilter === config.careerjet.timeFilters.week) return "7";
  if (timeFilter === config.careerjet.timeFilters.month) return "30";
  return "1"; // Default to 1 day
}

/**
 * Scrape CareerJet search results
 * @param {string} searchUrl - Search URL
 * @returns {Array} Array of job objects
 */
async function scrapeCareerjet(searchUrl) {
  logger.log(`Scraping CareerJet: ${searchUrl}`);
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

    // Wait for job links that include '/jobad/' in the href
    await page.waitForSelector("a[href*='/jobad/']", { timeout: 10000 });

    if (config.debugMode) {
      await page.screenshot({
        path: `careerjet-debug-${Date.now()}.png`,
        fullPage: true,
      });
    }

    // Extract job data from all job posting anchors
    const jobs = await page.evaluate(() => {
      const jobAnchors = Array.from(
        document.querySelectorAll("a[href*='/jobad/']")
      );
      const results = [];

      for (const anchor of jobAnchors) {
        const title = anchor.innerText.trim();
        const url = anchor.href || "";

        // Try to find job details in the surrounding elements
        let company = "Unknown Company";
        let location = "Not specified";
        let postedDate = "N/A";

        // Try to get company name from a parent element
        const jobCard = anchor.closest(".job");
        if (jobCard) {
          const companyElement = jobCard.querySelector(".company");
          if (companyElement) company = companyElement.innerText.trim();

          const locationElement = jobCard.querySelector(".location");
          if (locationElement) location = locationElement.innerText.trim();

          const postedElement = jobCard.querySelector(".date");
          if (postedElement) postedDate = postedElement.innerText.trim();
        }

        // Generate a unique ID using title and company
        const jobId = title
          ? `careerjet-${btoa(title + "_" + company).slice(0, 20)}`
          : `careerjet-${Math.random().toString(36).substring(2, 15)}`;

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
          source: "careerjet",
        });
      }
      return results;
    });

    if (config.debugMode) {
      logger.log(`CareerJet scraper found ${jobs.length} jobs.`);
    }

    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping CareerJet: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape CareerJet jobs
 * @param {string} timeFilter - Time filter (1, 7, 30 days)
 * @param {object} client - Discord client
 * @returns {object} Status object
 */
async function scrapeAllJobs(
  timeFilter = null,
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

  const cjTimeFilter = timeFilter || config.careerjet.timeFilters.day;
  logger.log("Starting CareerJet job scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    await channel.send("CareerJet Job Postings Update");

    // Loop over each keyword and build the search URL dynamically
    // Use all keywords from config (role filtering applied in job processing)
    const allKeywords = config.careerjet.jobKeywords;
    logger.log(
      `Using ${allKeywords.length} keywords for CareerJet search (filtering for ${role} roles)`
    );

    for (const keyword of allKeywords) {
      try {
        const encodedKeyword = encodeURIComponent(keyword);
        logger.log(`Encoded keyword: ${encodedKeyword}`);
        logger.log("Searching in location: USA");

        const params = new URLSearchParams({
          s: keyword,
          l: "USA",
          nw: getCareerjetTimeWindow(cjTimeFilter),
        });

        const searchUrl = `https://www.careerjet.com/jobs?${params.toString()}`;
        logger.log(`Scraping CareerJet for "${keyword}"`);
        logger.log(`Search URL: ${searchUrl}`);

        // Scrape all available job postings
        const jobs = await scrapeCareerjet(searchUrl);
        if (!jobs || jobs.length === 0) {
          logger.log(`No jobs found for "${keyword}"`);
          continue;
        }

        // Filter for relevant software/data engineering jobs only
        const relevantJobs = filterRelevantJobs(jobs, role);
        if (relevantJobs.length === 0) {
          logger.log(`No relevant software/data jobs found for "${keyword}"`);
          continue;
        }

        // Filter out already-posted jobs using the cache
        const newJobs = relevantJobs.filter(
          (job) => !mongoService.jobExists(job.id, "careerjet")
        );
        if (newJobs.length === 0) {
          logger.log(`No new relevant jobs for "${keyword}"`);
          continue;
        }

        // Select jobs based on mode (discord = lightweight, comprehensive = thorough)
        const jobLimit =
          mode === "comprehensive"
            ? config.careerjet.jobLimits.comprehensive
            : config.careerjet.jobLimits.discord;
        const postsToSend = newJobs.slice(0, jobLimit);

        // Add jobs to MongoDB cache
        await mongoService.addJobs(postsToSend, "careerjet");
        lastRunStatus.jobsFound += postsToSend.length;

        await channel.send(
          `CareerJet - ${keyword} (${postsToSend.length} new postings)`
        );
        for (const job of postsToSend) {
          if (!job.title || !job.url) continue;

          const embed = new EmbedBuilder()
            .setTitle(job.title)
            .setURL(job.url)
            .setColor(config.careerjet.embedColor)
            .setDescription(job.company)
            .addFields(
              { name: "Location", value: job.location, inline: true },
              { name: "Posted", value: job.postedDate, inline: true }
            )
            .setFooter({
              text: `Source: CareerJet | ID: ${job.id.substring(0, 20)}`,
            });

          await channel.send({ embeds: [embed] });
          await delay(1000);
        }
      } catch (error) {
        lastRunStatus.errorCount++;
        logger.log(
          `Error scraping for "${keyword}": ${error.message}`,
          "error"
        );
        try {
          await channel.send(
            `Error scraping CareerJet for ${keyword} - ${error.message.substring(
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

      // Delay between keyword searches to reduce detection risk
      await delay(5000);
    }

    await channel.send(
      `CareerJet job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log(
      `CareerJet job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in CareerJet scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

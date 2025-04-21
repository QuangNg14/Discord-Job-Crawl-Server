const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay } = require("../utils/helpers");

/**
 * Scrape Jobright.ai search results
 * @param {string} searchUrl - Search URL
 * @returns {Array} Array of job objects
 */
async function scrapeJobRight(searchUrl) {
  logger.log(`Scraping Jobright.ai: ${searchUrl}`);
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

    // Load the search page and wait until the DOM is loaded
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await delay(5000); // Additional wait time for dynamic content

    // Wait for the job title elements to appear
    await page.waitForSelector("h2.index_job-title__UjuEY", { timeout: 10000 });

    if (config.debugMode) {
      const fullHTML = await page.content();
      logger.log(`Full HTML snapshot length: ${fullHTML.length}`);
      await page.screenshot({
        path: `jr-debug-${Date.now()}.png`,
        fullPage: true,
      });
    }

    // Extract visible details from each job card
    const jobs = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a")).filter((a) =>
        a.querySelector("h2.index_job-title__UjuEY")
      );

      return anchors.map((anchor) => {
        // Get the job title
        const titleEl = anchor.querySelector("h2.index_job-title__UjuEY");
        const title = titleEl ? titleEl.innerText.trim() : "";

        // Attempt to extract company info (if available, use proper selector; otherwise default)
        let company = "Not specified";

        // Get the metadata section (for additional details such as location, salary, etc.)
        let metadata = "";
        const metaEl = anchor.querySelector("div.index_middle__Q7fZq");
        if (metaEl) {
          metadata = metaEl.innerText.trim();
        }

        // Build the composite key from title and company (lower-case)
        const compositeKey = (title + "_" + company).toLowerCase();

        return {
          id: `jobright-${compositeKey.replace(/\s+/g, "-").substring(0, 30)}`,
          title,
          url: anchor.href || "",
          company,
          metadata,
          location: "USA", // Default as per configuration
          postedDate: "Recent",
        };
      });
    });

    logger.log(`Jobright.ai scraper found ${jobs.length} jobs.`);
    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping Jobright.ai: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape Jobright.ai jobs
 * @param {object} client - Discord client
 * @returns {object} Status object
 */
async function scrapeAllJobs(client) {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
  };

  logger.log("Starting Jobright.ai job scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    await channel.send("Jobright.ai - Software Engineering Jobs Update");

    // Process each search configuration
    for (const searchConfig of config.jobright.searches) {
      try {
        const searchUrl = `${
          config.jobright.baseUrl
        }?jobTitle=${encodeURIComponent(searchConfig.jobTitle)}&${
          config.jobright.additionalParams
        }`;
        logger.log(`Searching for: ${searchConfig.name}`);

        const jobs = await scrapeJobRight(searchUrl);
        if (!jobs || jobs.length === 0) {
          logger.log(`No jobs found for ${searchConfig.name}`);
          await channel.send(`No jobs found for ${searchConfig.name}.`);
          continue;
        }

        // Filter out jobs already in the cache
        const newJobs = jobs.filter(
          (job) => !mongoService.jobExists(job.id, "jobright")
        );
        if (newJobs.length === 0) {
          logger.log(`No new jobs for ${searchConfig.name}`);
          await channel.send(`No new jobs for ${searchConfig.name}.`);
          continue;
        }

        // Limit to max jobs per search
        const postsToSend = newJobs.slice(0, config.jobright.maxJobsPerSearch);

        // Add jobs to MongoDB cache
        await mongoService.addJobs(postsToSend, "jobright");
        lastRunStatus.jobsFound += postsToSend.length;

        await channel.send(
          `${searchConfig.name} (${postsToSend.length} new posting${
            postsToSend.length > 1 ? "s" : ""
          }):`
        );

        // Post each job
        for (const job of postsToSend) {
          if (!job.title || !job.url) continue;

          const embed = new EmbedBuilder()
            .setTitle(job.title)
            .setURL(job.url)
            .setColor(config.jobright.embedColor)
            .setDescription(job.company)
            .addFields({
              name: "Details",
              value: job.metadata || "N/A",
              inline: false,
            })
            .setFooter({
              text: `Source: Jobright.ai | ID: ${job.id.substring(0, 10)}`,
            });

          try {
            await channel.send({ embeds: [embed] });
          } catch (err) {
            logger.log(`Error sending job posting: ${err.message}`, "error");
          }

          await delay(1000);
        }
      } catch (error) {
        lastRunStatus.errorCount++;
        logger.log(
          `Error processing search "${searchConfig.name}": ${error.message}`,
          "error"
        );
        await channel.send(
          `Error processing search for ${
            searchConfig.name
          }: ${error.message.substring(0, 100)}`
        );
      }

      await delay(3000); // Delay between searches
    }

    await channel.send(
      `Jobright.ai scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log("Jobright.ai job scraping process completed successfully.");

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in Jobright.ai scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

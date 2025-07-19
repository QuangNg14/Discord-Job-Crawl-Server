const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs } = require("../utils/helpers");

/**
 * Helper function to convert timeFilter to ZipRecruiter's "days" parameter
 * @param {string} timeFilter - Time filter value
 * @returns {string} ZipRecruiter days parameter
 */
function getZipDays(timeFilter) {
  if (timeFilter === config.ziprecruiter.timeFilters.day) return "1";
  if (timeFilter === config.ziprecruiter.timeFilters.week) return "5";
  if (timeFilter === config.ziprecruiter.timeFilters.month) return "30";
  return "1"; // Default to 1 day
}

/**
 * Scrape ZipRecruiter search results
 * @param {string} searchUrl - Search URL
 * @returns {Array} Array of job objects
 */
async function scrapeZipRecruiter(searchUrl) {
  logger.log(`Scraping ZipRecruiter: ${searchUrl}`);
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
    await page.waitForSelector("a[href*='/k/l/']", { timeout: 10000 });

    if (config.debugMode) {
      await page.screenshot({
        path: `debug-ziprecruiter-${Date.now()}.png`,
        fullPage: true,
      });
    }

    const jobs = await page.evaluate(() => {
      // Function to normalize the job title by removing "NEW!", trimming, and lowercasing
      function normalizeTitle(title) {
        return title.replace(/NEW!/gi, "").trim().toLowerCase();
      }

      // Normalize the URL by using only the origin and pathname
      function normalizeUrl(url) {
        try {
          const u = new URL(url);
          return u.origin + u.pathname;
        } catch (e) {
          return url.trim().toLowerCase();
        }
      }

      const jobAnchors = Array.from(
        document.querySelectorAll("a[href*='/k/l/']")
      );
      const results = [];

      for (let i = 0; i < jobAnchors.length; i++) {
        const anchor = jobAnchors[i];
        const title = anchor.innerText.trim();
        const url = anchor.href || "";
        const normalizedTitle = normalizeTitle(title);
        const normalizedUrl = normalizeUrl(url);

        // Find the closest elements that might contain company and location
        let company = "Unknown Company";
        let location = "Not specified";
        let postedDate = "N/A";

        // Try to find job details like company, location in parent elements
        const jobCard = anchor.closest(".job_result");
        if (jobCard) {
          const companyEl = jobCard.querySelector(".hiring_company_text");
          if (companyEl) company = companyEl.innerText.trim();

          const locationEl = jobCard.querySelector(".location");
          if (locationEl) location = locationEl.innerText.trim();

          const dateEl = jobCard.querySelector(".date");
          if (dateEl) postedDate = dateEl.innerText.trim();
        }

        results.push({
          // Use normalized title as the unique ID
          id: `ziprecruiter-${normalizedTitle
            .replace(/\s+/g, "-")
            .substring(0, 30)}`,
          title: title,
          url: url,
          company: company,
          location: location,
          postedDate: postedDate,
          description: "",
          metadata: "",
          salary: "",
          workModel: "",
          normalizedTitle: normalizedTitle,
          source: "ziprecruiter",
        });
      }
      return results;
    });

    if (config.debugMode) {
      jobs.forEach((job) =>
        logger.log(
          `Found job: ${job.title} | Normalized Title: ${job.normalizedTitle}`,
          "info"
        )
      );
      logger.log(`ZipRecruiter scraper found ${jobs.length} jobs.`);
    }

    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping ZipRecruiter: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape ZipRecruiter jobs
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

  const zipTimeFilter = timeFilter || config.ziprecruiter.timeFilters.day;
  logger.log("Starting ZipRecruiter job scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    await channel.send("ZipRecruiter Job Postings Update");

    // Loop over each keyword (location is blank for USA-wide search)
    // Use all keywords from config (role filtering applied in job processing)
    const allKeywords = config.ziprecruiter.jobKeywords;
    logger.log(
      `Using ${allKeywords.length} keywords for ZipRecruiter search (filtering for ${role} roles)`
    );

    for (const keyword of allKeywords) {
      try {
        const encodedKeyword = encodeURIComponent(keyword);
        logger.log(`Encoded keyword: ${encodedKeyword}`);
        logger.log("No location provided; searching USA-wide.");

        const params = new URLSearchParams({
          search: keyword,
          days: getZipDays(zipTimeFilter),
          refine_by_location_type: "",
          radius: "5000",
          refine_by_employment: "employment_type:all",
          refine_by_salary: "",
          refine_by_salary_ceil: "",
        });

        const searchUrl = `https://www.ziprecruiter.com/jobs-search?${params.toString()}`;
        logger.log(`Scraping ZipRecruiter for "${keyword}"`);
        logger.log(`Search URL: ${searchUrl}`);

        const jobs = await scrapeZipRecruiter(searchUrl);
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

        // Filter out jobs already in cache
        const newJobs = relevantJobs.filter(
          (job) => !mongoService.jobExists(job.id, "ziprecruiter")
        );
        if (newJobs.length === 0) {
          logger.log(`No new relevant jobs for "${keyword}"`);
          continue;
        }

        // Select jobs based on mode (discord = lightweight, comprehensive = thorough)
        const jobLimit =
          mode === "comprehensive"
            ? config.ziprecruiter.jobLimits.comprehensive
            : config.ziprecruiter.jobLimits.discord;
        const selectedJobs =
          newJobs.length > jobLimit ? newJobs.slice(0, jobLimit) : newJobs;

        // Add jobs to MongoDB cache
        await mongoService.addJobs(selectedJobs, "ziprecruiter");
        lastRunStatus.jobsFound += selectedJobs.length;

        await channel.send(
          `ZipRecruiter - ${keyword} (${selectedJobs.length} new postings)`
        );
        for (const job of selectedJobs) {
          if (!job.title || !job.url) continue;

          const embed = new EmbedBuilder()
            .setTitle(job.title)
            .setURL(job.url)
            .setColor(config.ziprecruiter.embedColor)
            .setDescription(job.company)
            .addFields(
              { name: "Location", value: job.location, inline: true },
              { name: "Posted", value: job.postedDate, inline: true }
            )
            .setFooter({
              text: `Source: ZipRecruiter | ID: ${job.id.substring(0, 20)}`,
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
            `Error scraping ZipRecruiter for ${keyword} - ${error.message.substring(
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

    await channel.send(
      `ZipRecruiter job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
    );
    lastRunStatus.success = true;
    logger.log(
      `ZipRecruiter job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs.`
    );

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in ZipRecruiter scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

module.exports = {
  scrapeAllJobs,
};

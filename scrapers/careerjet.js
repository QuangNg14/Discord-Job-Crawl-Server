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

    // Wait for job content to load - try multiple selectors
    const selectors = [
      "a[href*='/jobad/']",
      ".job",
      "[class*='job']",
      "[class*='result']",
      "article",
      "a[href*='/job/']",
      "a[href*='/position/']"
    ];

    let foundSelector = false;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        foundSelector = true;
        logger.log(`Found jobs using selector: ${selector}`);
        break;
      } catch (e) {
        // Continue to next selector
      }
    }

    if (!foundSelector) {
      logger.log("No job selectors found, trying to find any content...");
      await page.waitForSelector("body", { timeout: 10000 });
    }

    if (config.debugMode) {
      await page.screenshot({
        path: `careerjet-debug-${Date.now()}.png`,
        fullPage: true,
      });
    }

    // Extract job data from all job posting anchors
    const jobs = await page.evaluate(() => {
      // Try multiple strategies to find job listings
      const strategies = [
        // Strategy 1: Look for job anchors with specific href patterns
        () => Array.from(document.querySelectorAll("a[href*='/jobad/']")),
        // Strategy 2: Look for job containers
        () => Array.from(document.querySelectorAll(".job, [class*='job-card'], [class*='job-result']")),
        // Strategy 3: Look for any elements with job-related classes
        () => Array.from(document.querySelectorAll("[class*='job'], [class*='result'], [class*='card']")),
        // Strategy 4: Look for any clickable elements with substantial text
        () => Array.from(document.querySelectorAll("a, div, article")).filter(el => 
          el.textContent && el.textContent.trim().length > 20 &&
          (el.textContent.toLowerCase().includes('engineer') || 
           el.textContent.toLowerCase().includes('developer') ||
           el.textContent.toLowerCase().includes('intern'))
        ),
        // Strategy 5: Look for any elements that might contain job information
        () => Array.from(document.querySelectorAll("div, article, li")).filter(el => 
          el.textContent && el.textContent.trim().length > 30
        )
      ];

      let jobElements = [];
      for (const strategy of strategies) {
        try {
          const elements = strategy();
          if (elements.length > 0) {
            jobElements = elements;
            console.log(`Found ${elements.length} potential job elements using strategy`);
            break;
          }
        } catch (e) {
          console.log(`Strategy failed: ${e.message}`);
        }
      }

      const results = [];
      const processedTitles = new Set();

      for (const element of jobElements) {
        try {
          // Extract text content
          const textContent = element.textContent || element.innerText || "";
          const cleanText = textContent.trim().replace(/\s+/g, ' ');
          
          if (cleanText.length < 10) continue;

          // Try to extract job information
          let title = "";
          let company = "Unknown Company";
          let location = "Not specified";
          let postedDate = "N/A";
          let url = "";

          // Look for title in various elements
          const titleSelectors = [
            "h2 a",
            "h3 a",
            "a[class*='title']",
            "a[class*='job']",
            "h2",
            "h3",
            "a"
          ];

          for (const selector of titleSelectors) {
            const titleEl = element.querySelector(selector);
            if (titleEl && titleEl.textContent && titleEl.textContent.trim().length > 5) {
              title = titleEl.textContent.trim();
              if (titleEl.href) {
                url = titleEl.href;
              }
              break;
            }
          }

          // If no title found, try to extract from text content
          if (!title) {
            const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            for (const line of lines) {
              const lowerLine = line.toLowerCase();
              if (lowerLine.includes('engineer') || lowerLine.includes('developer') || 
                  lowerLine.includes('scientist') || lowerLine.includes('analyst') ||
                  lowerLine.includes('intern') || lowerLine.includes('full stack')) {
                title = line;
                break;
              }
            }
          }

          // Extract company name
          const companySelectors = [
            ".company",
            "[class*='company']",
            "[class*='employer']",
            "span[class*='company']",
            "div[class*='company']"
          ];

          for (const selector of companySelectors) {
            const companyEl = element.querySelector(selector);
            if (companyEl && companyEl.textContent && companyEl.textContent.trim().length > 1) {
              company = companyEl.textContent.trim();
              break;
            }
          }

          // Extract location
          const locationSelectors = [
            ".location",
            "[class*='location']",
            "span[class*='location']",
            "div[class*='location']"
          ];

          for (const selector of locationSelectors) {
            const locationEl = element.querySelector(selector);
            if (locationEl && locationEl.textContent && locationEl.textContent.trim().length > 1) {
              location = locationEl.textContent.trim();
              break;
            }
          }

          // Extract posted date
          const dateSelectors = [
            ".date",
            "[class*='date']",
            "[class*='posted']",
            "time"
          ];

          for (const selector of dateSelectors) {
            const dateEl = element.querySelector(selector);
            if (dateEl && dateEl.textContent && dateEl.textContent.trim().length > 1) {
              postedDate = dateEl.textContent.trim();
              break;
            }
          }

          // If we found a title and it's not a duplicate, create a job object
          if (title && !processedTitles.has(title.toLowerCase())) {
            processedTitles.add(title.toLowerCase());

            // Generate URL if not found
            if (!url) {
              const linkEl = element.querySelector('a');
              if (linkEl && linkEl.href) {
                url = linkEl.href;
              } else {
                url = `https://www.careerjet.com/jobs?search=${encodeURIComponent(title)}`;
              }
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
        } catch (error) {
          console.log(`Error processing job element: ${error.message}`);
        }
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
 * @param {string} timeFilter - Time filter for search
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern" or "new grad"
 * @returns {object} Status object with jobs array
 */
async function scrapeAllJobs(timeFilter, client, mode = "discord", role = "intern") {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
    jobs: [] // Add jobs array to return
  };

  logger.log("Starting CareerJet job scraping process");

  try {
    const channel = client?.channels?.cache?.get(config.channelId);
    
    if (channel && mode === "discord") {
      await channel.send("CareerJet Job Postings Update");
    }

    // Loop through each keyword and location
    for (const keyword of config.careerjet.jobKeywords) {
      for (const location of config.careerjet.jobLocations || [""]) {
        try {
          const encodedKeyword = encodeURIComponent(keyword);
          const encodedLocation = encodeURIComponent(location);
          logger.log(
            `Encoded keyword: ${encodedKeyword}, Encoded location: ${encodedLocation}`
          );

          // Build the search URL
          const searchParams = new URLSearchParams({
            keywords: keyword,
            location: location,
            days: timeFilter,
          });
          const searchUrl = `https://www.careerjet.com/search/jobs?${searchParams.toString()}`;
          logger.log(`Scraping CareerJet for "${keyword}" in "${location}"`);
          logger.log(`Search URL: ${searchUrl}`);

          // Determine job limit based on mode
          const jobLimit = mode === "comprehensive" 
            ? config.careerjet.jobLimits.comprehensive 
            : config.careerjet.jobLimits.discord;

          // Scrape all available job postings
          const jobs = await scrapeCareerjet(searchUrl);
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
            (job) => !mongoService.jobExists(job.id, "careerjet")
          );

          logger.log(
            `Found ${jobs.length} total jobs, ${relevantJobs.length} relevant jobs, ${newJobs.length} new jobs for "${keyword}" in "${location}"`
          );

          // Add new jobs to the cache
          if (newJobs.length > 0) {
            await mongoService.addJobs(newJobs, "careerjet");
          }

          // Add all relevant jobs to the return array (not just new ones)
          lastRunStatus.jobs.push(...relevantJobs);
          lastRunStatus.jobsFound += newJobs.length;

          // Only post to Discord if client is provided and mode is discord
          if (channel && mode === "discord" && newJobs.length > 0) {
            await channel.send(
              `CareerJet - ${keyword} in ${location} (${newJobs.length} new postings)`
            );

            // Limit Discord output to prevent spam
            const jobsToShow = newJobs.slice(0, jobLimit);

            for (const job of jobsToShow) {
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
                  text: `Source: CareerJet | ID: ${job.id.substring(0, 10)}`,
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
            logger.log(`No new jobs for "${keyword}" in "${location}"`);
          }
        } catch (error) {
          lastRunStatus.errorCount++;
          logger.log(
            `Error scraping for "${keyword}" in "${location}": ${error.message}`,
            "error"
          );
          if (channel && mode === "discord") {
            try {
              await channel.send(
                `Error scraping CareerJet for ${keyword} in ${location} - ${error.message.substring(
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
    }

    if (channel && mode === "discord") {
      await channel.send(
        `CareerJet job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
      );
    }
    
    lastRunStatus.success = true;
    logger.log(
      `CareerJet job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs, collected ${lastRunStatus.jobs.length} total relevant jobs.`
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

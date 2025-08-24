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

    // Wait for job content to load - try multiple selectors
    const selectors = [
      "div.chakra-stack.css-1igwmid",
      ".job-card",
      "[data-testid='job-card']",
      ".search-result",
      "article",
      "[class*='job']",
      "[class*='card']"
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

      // Try multiple strategies to find job cards
      const strategies = [
        // Strategy 1: Look for chakra-stack elements
        () => Array.from(document.querySelectorAll("div.chakra-stack.css-1igwmid")),
        // Strategy 2: Look for any elements with job-related classes
        () => Array.from(document.querySelectorAll("[class*='job'], [class*='card'], [class*='result']")),
        // Strategy 3: Look for any clickable elements with substantial text
        () => Array.from(document.querySelectorAll("a, div, article")).filter(el => 
          el.textContent && el.textContent.trim().length > 20 &&
          (el.textContent.toLowerCase().includes('engineer') || 
           el.textContent.toLowerCase().includes('developer') ||
           el.textContent.toLowerCase().includes('intern'))
        ),
        // Strategy 4: Look for any elements that might contain job information
        () => Array.from(document.querySelectorAll("div, article, li")).filter(el => 
          el.textContent && el.textContent.trim().length > 30
        )
      ];

      let jobCards = [];
      for (const strategy of strategies) {
        try {
          const cards = strategy();
          if (cards.length > 0) {
            jobCards = cards;
            console.log(`Found ${cards.length} potential job cards using strategy`);
            break;
          }
        } catch (e) {
          console.log(`Strategy failed: ${e.message}`);
        }
      }

      const results = [];
      const processedTitles = new Set();

      for (const card of jobCards) {
        try {
          // Extract text content
          const textContent = card.textContent || card.innerText || "";
          const cleanText = textContent.trim().replace(/\s+/g, ' ');
          
          if (cleanText.length < 15) continue;

          // Try to extract job information
          let title = "";
          let company = "";
          let location = "";
          let url = "";

          // Look for title in various elements
          const titleSelectors = [
            "h2 > a.chakra-button",
            "h2 a",
            "h3 a",
            "a[class*='title']",
            "a[class*='job']",
            "h2",
            "h3",
            "a"
          ];

          for (const selector of titleSelectors) {
            const titleEl = card.querySelector(selector);
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
            ".chakra-text.css-bujt2",
            "[class*='company']",
            "[class*='employer']",
            "span[class*='company']",
            "div[class*='company']"
          ];

          for (const selector of companySelectors) {
            const companyEl = card.querySelector(selector);
            if (companyEl && companyEl.textContent && companyEl.textContent.trim().length > 1) {
              company = companyEl.textContent.trim();
              break;
            }
          }

          // Extract location
          const locationSelectors = [
            ".chakra-text.css-1d5vfrt",
            "[class*='location']",
            "span[class*='location']",
            "div[class*='location']"
          ];

          for (const selector of locationSelectors) {
            const locationEl = card.querySelector(selector);
            if (locationEl && locationEl.textContent && locationEl.textContent.trim().length > 1) {
              location = locationEl.textContent.trim();
              break;
            }
          }

          // Extract posted date
          const dateSelectors = [
            ".chakra-text.css-1ieddkj",
            "[class*='date']",
            "[class*='posted']",
            "time"
          ];

          let postedDate = "N/A";
          for (const selector of dateSelectors) {
            const dateEl = card.querySelector(selector);
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
              const linkEl = card.querySelector('a');
              if (linkEl && linkEl.href) {
                url = linkEl.href;
              } else {
                url = `https://www.simplyhired.com/search?q=${encodeURIComponent(title)}`;
              }
            }

            // Generate job ID
            const jobId = url ? `sh-${simpleHash(url + title)}` : `sh-${Math.random().toString(36).substring(2, 15)}`;

            results.push({
              id: jobId,
              title,
              url,
              company: company || "Unknown Company",
              location: location || "Not specified",
              postedDate,
              description: "",
              metadata: "",
              salary: "",
              workModel: "",
              source: "simplyhired",
            });
          }
        } catch (error) {
          console.log(`Error processing job card: ${error.message}`);
        }
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

  logger.log("Starting SimplyHired job scraping process");

  try {
    const channel = client?.channels?.cache?.get(config.channelId);
    
    if (channel && mode === "discord") {
      await channel.send("SimplyHired Job Postings Update");
    }

    // Loop through each keyword and location
    for (const keyword of config.simplyhired.jobKeywords) {
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
          logger.log(`Base URL: ${baseUrl}`);

          // Determine job limit based on mode
          const jobLimit = mode === "comprehensive" 
            ? config.simplyhired.jobLimits.comprehensive 
            : config.simplyhired.jobLimits.discord;

          // Scrape all available job postings
          const jobs = await scrapeSimplyHired(baseUrl);
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
            (job) => !mongoService.jobExists(job.id, "simplyhired")
          );

          logger.log(
            `Found ${jobs.length} total jobs, ${relevantJobs.length} relevant jobs, ${newJobs.length} new jobs for "${keyword}" in "${location}"`
          );

          // Add new jobs to the cache
          if (newJobs.length > 0) {
            await mongoService.addJobs(newJobs, "simplyhired");
          }

          // Add all relevant jobs to the return array (not just new ones)
          lastRunStatus.jobs.push(...relevantJobs);
          lastRunStatus.jobsFound += newJobs.length;

          // Only post to Discord if client is provided and mode is discord
          if (channel && mode === "discord" && newJobs.length > 0) {
            await channel.send(
              `SimplyHired - ${keyword} in ${location} (${newJobs.length} new postings)`
            );

            // Limit Discord output to prevent spam
            const jobsToShow = newJobs.slice(0, jobLimit);

            for (const job of jobsToShow) {
              if (!job.title || !job.url) continue;
              const embed = new EmbedBuilder()
                .setTitle(job.title)
                .setURL(job.url)
                .setColor(config.simplyhired.embedColor)
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
        }
        // Delay between searches to reduce detection risk
        await delay(5000);
      }
    }

    if (channel && mode === "discord") {
      await channel.send(
        `SimplyHired job scraping complete. Found ${lastRunStatus.jobsFound} new jobs.`
      );
    }
    
    lastRunStatus.success = true;
    logger.log(
      `SimplyHired job scraping completed successfully. Found ${lastRunStatus.jobsFound} new jobs, collected ${lastRunStatus.jobs.length} total relevant jobs.`
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

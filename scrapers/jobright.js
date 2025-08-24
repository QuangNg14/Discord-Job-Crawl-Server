const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs, filterJobsByDate } = require("../utils/helpers");

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
      headless: "new",
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
    await delay(3000);

    // Wait for job content to load
    await page.waitForSelector("body", { timeout: 15000 });

    if (config.debugMode) {
      await page.screenshot({
        path: `jr-debug-${Date.now()}.png`,
        fullPage: true,
      });
    }

    // Extract job data with improved parsing
    const jobs = await page.evaluate(() => {
      const results = [];
      const processedJobs = new Set();

      // Look for job cards or job-related elements
      const jobElements = document.querySelectorAll('a[href*="/jobs/"], [class*="job"], [class*="card"], article, div[role="article"]');
      
      jobElements.forEach((element) => {
        try {
          const textContent = element.textContent || element.innerText || "";
          const cleanText = textContent.trim().replace(/\s+/g, ' ');
          
          if (cleanText.length < 20) return;

          // Extract job information using regex patterns
          let title = "";
          let company = "";
          let location = "";
          let url = "";

          // Get URL if available
          if (element.href) {
            url = element.href;
          } else if (element.querySelector('a')) {
            url = element.querySelector('a').href;
          }

          // Parse text content for job details
          const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          
          for (const line of lines) {
            const lowerLine = line.toLowerCase();
            
            // Skip UI/navigation text
            if (lowerLine.includes('home') || lowerLine.includes('about') || 
                lowerLine.includes('contact') || lowerLine.includes('privacy') ||
                lowerLine.includes('terms') || lowerLine.includes('login') ||
                lowerLine.includes('sign up') || lowerLine.includes('search') ||
                lowerLine.includes('apply now') || lowerLine.includes('match score')) {
              continue;
            }

            // Extract job title (look for engineering/tech keywords)
            if (!title && (lowerLine.includes('engineer') || lowerLine.includes('developer') || 
                lowerLine.includes('scientist') || lowerLine.includes('analyst') ||
                lowerLine.includes('intern') || lowerLine.includes('full stack') ||
                lowerLine.includes('software') || lowerLine.includes('data'))) {
              title = line;
            }
            
            // Extract company name (look for company indicators)
            if (!company && (lowerLine.includes('inc') || lowerLine.includes('llc') || 
                lowerLine.includes('corp') || lowerLine.includes('ltd') ||
                lowerLine.includes('company') || lowerLine.includes('tech') ||
                lowerLine.includes('systems') || lowerLine.includes('solutions') ||
                lowerLine.includes('group') || lowerLine.includes('partners'))) {
              company = line;
            }
            
            // Extract location (look for city, state patterns)
            if (!location && (lowerLine.includes(',') && 
                (lowerLine.includes('ca') || lowerLine.includes('ny') || 
                 lowerLine.includes('tx') || lowerLine.includes('fl') || 
                 lowerLine.includes('wa') || lowerLine.includes('ma') ||
                 lowerLine.includes('remote') || lowerLine.includes('us')))) {
              location = line;
            }
          }

          // Create job object if we have a title
          if (title && !processedJobs.has(title.toLowerCase())) {
            processedJobs.add(title.toLowerCase());
            
            // Generate fallback URL if none found
            if (!url) {
              url = `https://jobright.ai/jobs/search?q=${encodeURIComponent(title)}`;
            }

            // Generate unique ID
            const jobId = `jobright-${btoa(title + "_" + company).slice(0, 20)}`;

            results.push({
              id: jobId,
              title: title,
              url: url,
              company: company || "Company not specified",
              location: location || "Location not specified",
              postedDate: "Recent",
              description: cleanText.substring(0, 200) + "...",
              metadata: cleanText,
              salary: "",
              workModel: "",
              source: "jobright",
            });
          }
        } catch (error) {
          console.log(`Error processing job element: ${error.message}`);
        }
      });

      return results;
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
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern" or "new grad"
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeAllJobs(client, mode = "discord", role = "intern") {
  logger.log("Starting Jobright.ai scraping process");
  
  const allJobs = [];
  const searches = config.jobright.searches;
  const jobLimit = mode === "comprehensive" ? config.jobright.jobLimits.comprehensive : config.jobright.jobLimits.discord;

  for (const search of searches) {
    try {
      logger.log(`Scraping Jobright.ai for: ${search.name}`);
      
      // Construct search URL
      const searchUrl = `${config.jobright.baseUrl}?q=${encodeURIComponent(search.jobTitle)}&${config.jobright.additionalParams}`;
      
      const jobs = await scrapeJobRight(searchUrl);
      
      if (jobs && jobs.length > 0) {
        // Filter for relevant jobs
        const relevantJobs = filterRelevantJobs(jobs, role);
        logger.log(`Found ${relevantJobs.length} relevant jobs for ${search.name}`);
        
        // Apply date filtering for daily scraping (only jobs from last day)
        const recentJobs = filterJobsByDate(relevantJobs, "day");
        logger.log(`📅 Date filtering: ${recentJobs.length}/${relevantJobs.length} jobs from last day for ${search.name}`);
        
        // Limit jobs per search
        const limitedJobs = recentJobs.slice(0, Math.ceil(jobLimit / searches.length));
        allJobs.push(...limitedJobs);
      }
      
      await delay(2000); // Delay between searches
    } catch (error) {
      logger.log(`Error scraping ${search.name}: ${error.message}`, "error");
    }
  }

  // Remove duplicates and limit total jobs
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex(j => j.id === job.id)
  ).slice(0, jobLimit);

  logger.log(`Jobright.ai scraping complete. Found ${uniqueJobs.length} unique jobs.`);

  // Save to cache
  if (uniqueJobs.length > 0) {
    await mongoService.addJobsToCache("jobright", uniqueJobs);
  }

  return {
    jobs: uniqueJobs,
    jobsFound: uniqueJobs.length,
    source: "jobright"
  };
}

module.exports = {
  scrapeAllJobs,
  scrapeJobRight
};

const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs, filterJobsByDate } = require("../utils/helpers");

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
        path: `debug-ziprecruiter-${Date.now()}.png`,
        fullPage: true,
      });
    }

    const jobs = await page.evaluate(() => {
      const results = [];
      const processedJobs = new Set();

      // Look for job listings with multiple strategies - updated for new ZipRecruiter format
      const jobElements = document.querySelectorAll('a[href*="/k/l/"], [class*="job"], [class*="result"], article, div[role="article"], .job_result, .job-listing, [data-testid*="job"], .search-result');
      
      jobElements.forEach((element) => {
        try {
          const textContent = element.textContent || element.innerText || "";
          const cleanText = textContent.trim().replace(/\s+/g, ' ');
          
          if (cleanText.length < 20) return;

          // Extract job information
          let title = "";
          let company = "";
          let location = "";
          let url = "";
          let postedDate = "Recent";

          // Get URL if available - improved for new format
          if (element.href && element.href.includes('/k/l/')) {
            url = element.href;
          } else if (element.querySelector('a[href*="/k/l/"]')) {
            url = element.querySelector('a[href*="/k/l/"]').href;
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
                lowerLine.includes('apply now') || lowerLine.includes('quick apply')) {
              continue;
            }

            // Extract job title (look for engineering/tech keywords) - improved for new format
            if (!title && (lowerLine.includes('engineer') || lowerLine.includes('developer') || 
                lowerLine.includes('scientist') || lowerLine.includes('analyst') ||
                lowerLine.includes('intern') || lowerLine.includes('full stack') ||
                lowerLine.includes('software') || lowerLine.includes('data') ||
                lowerLine.includes('machine learning') || lowerLine.includes('ai') ||
                lowerLine.includes('artificial intelligence'))) {
              title = line;
            }
            
            // Extract company name (look for company indicators) - improved for new format
            if (!company && (lowerLine.includes('inc') || lowerLine.includes('llc') || 
                lowerLine.includes('corp') || lowerLine.includes('ltd') ||
                lowerLine.includes('company') || lowerLine.includes('tech') ||
                lowerLine.includes('systems') || lowerLine.includes('solutions') ||
                lowerLine.includes('group') || lowerLine.includes('partners') ||
                lowerLine.includes('&') || lowerLine.includes('and') ||
                (line.length > 2 && line.length < 50 && !lowerLine.includes('remote') && 
                 !lowerLine.includes('full-time') && !lowerLine.includes('part-time') &&
                 !lowerLine.includes('contract') && !lowerLine.includes('temporary')))) {
              company = line;
            }
            
            // Extract location (look for city, state patterns) - improved for new format
            if (!location && (lowerLine.includes(',') && 
                (lowerLine.includes('ca') || lowerLine.includes('ny') || 
                 lowerLine.includes('tx') || lowerLine.includes('fl') || 
                 lowerLine.includes('wa') || lowerLine.includes('ma') ||
                 lowerLine.includes('il') || lowerLine.includes('co') ||
                 lowerLine.includes('ga') || lowerLine.includes('dc') ||
                 lowerLine.includes('remote') || lowerLine.includes('us') ||
                 lowerLine.includes('united states')))) {
              location = line;
            }

            // Extract posted date - improved for new format
            if (lowerLine.includes('ago') || lowerLine.includes('today') || 
                lowerLine.includes('yesterday') || lowerLine.includes('week') ||
                lowerLine.includes('hour') || lowerLine.includes('day') ||
                lowerLine.includes('minute') || lowerLine.includes('recent')) {
              postedDate = line;
            }
          }

          // Create job object if we have a title - improved validation
          if (title && title.length > 3 && !processedJobs.has(title.toLowerCase())) {
            processedJobs.add(title.toLowerCase());
            
            // Generate fallback URL if none found
            if (!url) {
              url = `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(title)}&refine_by_location_type=no_remote&radius=5000&days=1&refine_by_employment=employment_type%3Aall&refine_by_salary=&refine_by_salary_ceil=&lk=0aq8wal_FklwDhFiEGcMrw&page=1`;
            }

            // Generate unique ID - improved for better uniqueness
            const jobId = `ziprecruiter-${btoa(title + "_" + company + "_" + location).slice(0, 25)}`;

            results.push({
              id: jobId,
              title: title,
              url: url,
              company: company || "Company not specified",
              location: location || "Location not specified",
              postedDate: postedDate,
              description: cleanText.substring(0, 200) + "...",
              metadata: cleanText,
              salary: "",
              workModel: "",
              source: "ziprecruiter",
            });
          }
        } catch (error) {
          console.log(`Error processing job element: ${error.message}`);
        }
      });

      return results;
    });

    logger.log(`ZipRecruiter scraper found ${jobs.length} jobs.`);
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
 * @param {string} timeFilter - Time filter for jobs
 * @param {object} client - Discord client (optional)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern", "new_grad", or "both"
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeAllJobs(timeFilter, client, mode = "discord", role = "intern") {
  logger.log("Starting ZipRecruiter scraping process");
  
  const allJobs = [];
  const keywords = config.ziprecruiter.jobKeywords;
  const locations = config.ziprecruiter.jobLocations;
  const jobLimit = mode === "comprehensive" ? config.ziprecruiter.jobLimits.comprehensive : config.ziprecruiter.jobLimits.discord;
  const maxJobsPerSearch = config.ziprecruiter.maxJobsPerSearch;

  // Calculate jobs per keyword-location combination
  const totalCombinations = keywords.length * locations.length;
  const jobsPerCombination = Math.ceil(jobLimit / totalCombinations);

  for (const keyword of keywords) {
    for (const location of locations) {
      try {
        logger.log(`Scraping ZipRecruiter for: ${keyword} in ${location}`);
        
        // Construct search URL with location using the correct ZipRecruiter format
        const days = getZipDays(timeFilter);
        const searchUrl = `https://www.ziprecruiter.com/jobs-search?search=${encodeURIComponent(keyword)}&location=${encodeURIComponent(location)}&refine_by_location_type=no_remote&radius=5000&days=${days}&refine_by_employment=employment_type%3Aall&refine_by_salary=&refine_by_salary_ceil=&lk=0aq8wal_FklwDhFiEGcMrw&page=1`;
        
        const jobs = await scrapeZipRecruiter(searchUrl);
        
        if (jobs && jobs.length > 0) {
          // Filter for relevant jobs
          const relevantJobs = filterRelevantJobs(jobs, role);
          logger.log(`Found ${relevantJobs.length} relevant jobs for ${keyword} in ${location} (role: ${role})`);
          
          // Apply date filtering for daily scraping (only jobs from last day)
          const recentJobs = filterJobsByDate(relevantJobs, "day");
          logger.log(`📅 Date filtering: ${recentJobs.length}/${relevantJobs.length} jobs from last day for ${keyword} in ${location}`);
          
          // Limit jobs per keyword-location combination
          const limitedJobs = recentJobs.slice(0, jobsPerCombination);
          allJobs.push(...limitedJobs);
        }
        
        await delay(2000); // Delay between searches
      } catch (error) {
        logger.log(`Error scraping ${keyword} in ${location}: ${error.message}`, "error");
      }
    }
  }

  // Remove duplicates and limit total jobs
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex(j => j.id === job.id)
  ).slice(0, jobLimit);

  logger.log(`ZipRecruiter scraping complete. Found ${uniqueJobs.length} unique jobs across ${locations.length} locations.`);

  // Save to cache
  if (uniqueJobs.length > 0) {
    await mongoService.addJobs(uniqueJobs, "ziprecruiter");
  }

  return {
    jobs: uniqueJobs,
    jobsFound: uniqueJobs.length,
    source: "ziprecruiter"
  };
}

module.exports = {
  scrapeAllJobs,
  scrapeZipRecruiter
};

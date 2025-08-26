const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs, filterJobsByDate } = require("../utils/helpers");

/**
 * JobRight GitHub repositories configuration
 */
const jobrightRepos = [
  {
    name: "Data Analysis New Grad",
    url: "https://github.com/jobright-ai/2025-Data-Analysis-New-Grad",
    type: "new_grad",
    category: "data_analysis"
  },
  {
    name: "Data Analysis Internship", 
    url: "https://github.com/jobright-ai/2025-Data-Analysis-Internship",
    type: "intern",
    category: "data_analysis"
  },
  {
    name: "Software Engineer Internship",
    url: "https://github.com/jobright-ai/2025-Software-Engineer-Internship", 
    type: "intern",
    category: "software_engineering"
  },
  {
    name: "Business Analyst Internship",
    url: "https://github.com/jobright-ai/2025-Business-Analyst-Internship",
    type: "intern", 
    category: "business_analyst"
  },
  {
    name: "Software Engineer New Grad",
    url: "https://github.com/jobright-ai/2025-Software-Engineer-New-Grad",
    type: "new_grad",
    category: "software_engineering"
  },
  {
    name: "Business Analyst New Grad",
    url: "https://github.com/jobright-ai/2025-Business-Analyst-New-Grad",
    type: "new_grad",
    category: "business_analyst"
  }
];

/**
 * Parse date string to determine if job is recent (today or yesterday)
 * @param {string} dateStr - Date string like "Aug 24", "Aug 23"
 * @returns {boolean} Whether the job is from today or yesterday
 */
function isRecentJob(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const currentDay = now.getDate();
  
  // Parse date like "Aug 24"
  const monthMap = {
    'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
    'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
  };
  
  const dateMatch = dateStr.toLowerCase().match(/(\w{3})\s+(\d+)/);
  if (!dateMatch) return false;
  
  const month = monthMap[dateMatch[1]];
  const day = parseInt(dateMatch[2]);
  
  if (month === undefined || isNaN(day)) return false;
  
  // Check if it's today or yesterday
  const jobDate = new Date(now.getFullYear(), month, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  
  return jobDate.getTime() === today.getTime() || jobDate.getTime() === yesterday.getTime();
}

/**
 * Scrape a JobRight GitHub repository
 * @param {object} repo - Repository configuration
 * @returns {Array} Array of job objects
 */
async function scrapeJobRightRepo(repo) {
  logger.log(`Scraping JobRight repo: ${repo.name} (${repo.url})`);
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

    await page.goto(repo.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await delay(3000);

    // Wait for content to load
    await page.waitForSelector("body", { timeout: 15000 });

    if (config.debugMode) {
      await page.screenshot({
        path: `jobright-repo-${Date.now()}.png`,
        fullPage: true,
      });
    }

    // Extract job data from the README table
    const jobs = await page.evaluate((repoConfig) => {
      const results = [];
      const processedJobs = new Set();

      // Look for table elements in the README
      const tables = document.querySelectorAll('table');
      
      tables.forEach((table) => {
        const rows = table.querySelectorAll('tr');
        
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('td');
          
          if (cells.length >= 5) {
            try {
              const company = cells[0]?.textContent?.trim() || "";
              const jobTitle = cells[1]?.textContent?.trim() || "";
              const location = cells[2]?.textContent?.trim() || "";
              const workModel = cells[3]?.textContent?.trim() || "";
              const datePosted = cells[4]?.textContent?.trim() || "";
              
              // Skip if missing essential data
              if (!company || !jobTitle || !datePosted) {
                continue;
              }
              
              // Create unique job ID
              const jobId = `jobright-${btoa(company + "_" + jobTitle + "_" + datePosted).slice(0, 20)}`;
              
              // Skip if already processed
              if (processedJobs.has(jobId)) {
                continue;
              }
              processedJobs.add(jobId);
              
              // Create job object
              const job = {
                id: jobId,
                title: jobTitle,
                company: company,
                location: location,
                workModel: workModel,
                postedDate: datePosted,
                url: repoConfig.url,
                description: `${jobTitle} at ${company} - ${location} (${workModel})`,
                metadata: `Source: ${repoConfig.name}`,
                salary: "",
                source: "jobright",
                repoType: repoConfig.type,
                repoCategory: repoConfig.category,
                repoName: repoConfig.name
              };
              
              results.push(job);
            } catch (error) {
              console.log(`Error processing table row: ${error.message}`);
            }
          }
        }
      });

      return results;
    }, repo);

    logger.log(`JobRight repo ${repo.name} found ${jobs.length} jobs.`);
    await browser.close();
    return jobs;
  } catch (error) {
    logger.log(`Error scraping JobRight repo ${repo.name}: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Main function to scrape JobRight jobs from GitHub repositories
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern", "new_grad", or "both"
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeAllJobs(client, mode = "discord", role = "both") {
  logger.log("Starting JobRight GitHub repositories scraping process");
  
  const allJobs = [];
  const jobLimit = mode === "comprehensive" ? config.jobright.jobLimits.comprehensive : config.jobright.jobLimits.discord;

  // Filter repositories based on role
  const relevantRepos = jobrightRepos.filter(repo => {
    if (role === "intern") {
      return repo.type === "intern";
    } else if (role === "new_grad") {
      return repo.type === "new_grad";
    } else if (role === "both") {
      return repo.type === "intern" || repo.type === "new_grad";
    }
    return true; // Include all if no specific role filter
  });

  logger.log(`Scraping ${relevantRepos.length} JobRight repositories for ${role} roles`);

  for (const repo of relevantRepos) {
    try {
      logger.log(`Scraping JobRight repository: ${repo.name}`);
      
      const jobs = await scrapeJobRightRepo(repo);
      
      if (jobs && jobs.length > 0) {
        // Filter for recent jobs (today and yesterday)
        const recentJobs = jobs.filter(job => isRecentJob(job.postedDate));
        logger.log(`Found ${recentJobs.length} recent jobs from ${repo.name} (${jobs.length} total)`);
        
        // Filter for relevant jobs based on title
        const relevantJobs = filterRelevantJobs(recentJobs, role);
        logger.log(`Found ${relevantJobs.length} relevant jobs from ${repo.name}`);
        
        // Limit jobs per repository
        const limitedJobs = relevantJobs.slice(0, Math.ceil(jobLimit / relevantRepos.length));
        allJobs.push(...limitedJobs);
      }
      
      await delay(2000); // Delay between repositories
    } catch (error) {
      logger.log(`Error scraping ${repo.name}: ${error.message}`, "error");
    }
  }

  // Remove duplicates and limit total jobs
  const uniqueJobs = allJobs.filter((job, index, self) => 
    index === self.findIndex(j => j.id === job.id)
  ).slice(0, jobLimit);

  logger.log(`JobRight scraping complete. Found ${uniqueJobs.length} unique recent jobs.`);

  // Save to cache
  if (uniqueJobs.length > 0) {
    await mongoService.addJobs(uniqueJobs, "jobright");
  }

  return {
    jobs: uniqueJobs,
    jobsFound: uniqueJobs.length,
    source: "jobright",
    success: true
  };
}

/**
 * Scrape a specific JobRight repository
 * @param {string} repoName - Name of the repository to scrape
 * @param {object} client - Discord client
 * @param {string} mode - Scraping mode
 * @param {string} role - Role type
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeSpecificRepo(repoName, client, mode = "discord", role = "both") {
  const repo = jobrightRepos.find(r => r.name.toLowerCase().includes(repoName.toLowerCase()));
  
  if (!repo) {
    logger.log(`Repository not found: ${repoName}`, "error");
    return {
      jobs: [],
      jobsFound: 0,
      source: "jobright",
      success: false,
      error: `Repository not found: ${repoName}`
    };
  }

  logger.log(`Scraping specific JobRight repository: ${repo.name}`);
  
  const jobs = await scrapeJobRightRepo(repo);
  
  if (jobs && jobs.length > 0) {
    // Filter for recent jobs
    const recentJobs = jobs.filter(job => isRecentJob(job.postedDate));
    
    // Filter for relevant jobs
    const relevantJobs = filterRelevantJobs(recentJobs, role);
    
    logger.log(`Found ${relevantJobs.length} relevant recent jobs from ${repo.name}`);
    
    // Save to cache
    if (relevantJobs.length > 0) {
      await mongoService.addJobs(relevantJobs, "jobright");
    }
    
    return {
      jobs: relevantJobs,
      jobsFound: relevantJobs.length,
      source: "jobright",
      success: true,
      repoName: repo.name
    };
  }
  
  return {
    jobs: [],
    jobsFound: 0,
    source: "jobright",
    success: false
  };
}

module.exports = {
  scrapeAllJobs,
  scrapeSpecificRepo,
  scrapeJobRightRepo
};

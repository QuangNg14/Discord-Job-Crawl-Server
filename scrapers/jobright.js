const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const {
  delay,
  filterRelevantJobs,
  filterJobsByDate,
  generateJobId,
  normalizeJob,
} = require("../utils/helpers");

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
        "Chrome/91.0.4472.124 Safari/537.36",
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
      const tables = document.querySelectorAll("table");

      tables.forEach((table) => {
        const rows = table.querySelectorAll("tr");

        // Skip header row
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const cells = row.querySelectorAll("td");

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
              const jobId = `jobright-${company}_${jobTitle}_${datePosted}`;

              // Skip if already processed
              if (processedJobs.has(jobId)) {
                continue;
              }
              processedJobs.add(jobId);

              // Create job object
              const job = {
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
                role: repoConfig.type,
                category: repoConfig.category,
                repoName: repoConfig.name,
                normalizedId: jobId,
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

    // Process in Node context
    const processedJobs = jobs.map((job) => {
      const normalized = normalizeJob(job);
      return {
        ...normalized,
        id: normalized.jobId,
      };
    });

    logger.log(
      `JobRight repo ${repo.name} found ${processedJobs.length} jobs.`,
    );
    await browser.close();
    return processedJobs;
  } catch (error) {
    logger.log(
      `Error scraping JobRight repo ${repo.name}: ${error.message}`,
      "error",
    );
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
  const isComprehensive = mode === "comprehensive";
  const jobLimit = isComprehensive
    ? config.jobright.jobLimits.comprehensive
    : config.jobright.jobLimits.discord;

  // Filter repositories based on role
  const relevantRepos = config.jobright.repos.filter((repo) => {
    if (role === "intern") {
      return repo.type === "intern";
    } else if (role === "new_grad") {
      return repo.type === "new_grad";
    } else if (role === "both") {
      return repo.type === "intern" || repo.type === "new_grad";
    }
    return true; // Include all if no specific role filter
  });

  logger.log(
    `Scraping ${relevantRepos.length} JobRight repositories for ${role} roles`,
  );

  for (const repo of relevantRepos) {
    try {
      logger.log(`Scraping JobRight repository: ${repo.name}`);

      const jobs = await scrapeJobRightRepo(repo);

      if (jobs && jobs.length > 0) {
        // Skip relevance filtering for JobRight repos - they are already curated
        logger.log(
          `Found ${jobs.length} jobs from ${repo.name}. Skipping relevance filtering as JobRight lists are already curated.`,
        );

        if (isComprehensive) {
          allJobs.push(...jobs);
        } else {
          const maxJobsPerRepo =
            config.jobright.maxJobsPerRepo ||
            Math.ceil(jobLimit / relevantRepos.length);
          const limitedJobs = jobs.slice(0, maxJobsPerRepo);
          allJobs.push(...limitedJobs);
        }
      }

      await delay(2000); // Delay between repositories
    } catch (error) {
      logger.log(`Error scraping ${repo.name}: ${error.message}`, "error");
    }
  }

  // Remove duplicates and limit total jobs
  const uniqueJobs = allJobs.filter(
    (job, index, self) => index === self.findIndex((j) => j.id === job.id),
  );
  const finalJobs = isComprehensive ? uniqueJobs : uniqueJobs.slice(0, jobLimit);

  logger.log(
    `JobRight scraping complete. Found ${finalJobs.length} unique jobs.`,
  );

  // Save to cache
  if (finalJobs.length > 0) {
    await mongoService.addJobs(finalJobs, "jobright");
  }

  return {
    jobs: finalJobs,
    jobsFound: finalJobs.length,
    source: "jobright",
    success: true,
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
async function scrapeSpecificRepo(
  repoName,
  client,
  mode = "discord",
  role = "both",
) {
  const repo = config.jobright.repos.find((r) =>
    r.name.toLowerCase().includes(repoName.toLowerCase()),
  );

  if (!repo) {
    logger.log(`Repository not found: ${repoName}`, "error");
    return {
      jobs: [],
      jobsFound: 0,
      source: "jobright",
      success: false,
      error: `Repository not found: ${repoName}`,
    };
  }

  logger.log(`Scraping specific JobRight repository: ${repo.name}`);

  const jobs = await scrapeJobRightRepo(repo);

  if (jobs && jobs.length > 0) {
    // Skip relevance filtering for JobRight repos - they are already curated
    logger.log(
      `Found ${jobs.length} jobs from ${repo.name}. Skipping relevance filtering as JobRight lists are already curated.`,
    );

    // Save to cache
    if (jobs.length > 0) {
      await mongoService.addJobs(jobs, "jobright");
    }

    return {
      jobs: jobs,
      jobsFound: jobs.length,
      source: "jobright",
      success: true,
      repoName: repo.name,
    };
  }

  return {
    jobs: [],
    jobsFound: 0,
    source: "jobright",
    success: false,
  };
}

module.exports = {
  scrapeAllJobs,
  scrapeSpecificRepo,
  scrapeJobRightRepo,
};

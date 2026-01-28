const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay, filterRelevantJobs, filterJobsByDate, sendJobsToDiscord } = require("../utils/helpers");

/**
 * Scrape a GitHub repository for job listings
 * @param {object} repo - Repository configuration object
 * @param {string} timeFilter - Time filter for date filtering ("day", "week", "month")
 * @returns {Array} Array of job posts
 */
async function scrapeGithubRepo(repo, role = "intern", timeFilter = "day") {
  logger.log(`Scraping GitHub repo: ${repo.name} (${repo.url})`);
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

    await page.goto(repo.url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    // Wait for a table inside the README's markdown-body container
    await page.waitForSelector(".markdown-body table", { timeout: 15000 });
    await delay(3000);

    const posts = await page.evaluate((repoUrl) => {
      // Select the table in the README's markdown-body
      const table = document.querySelector(".markdown-body table");
      if (!table) return [];

      // Get all rows and skip the header row
      let rows = Array.from(table.querySelectorAll("tr")).slice(1);

      // Limit to 1,000 rows
      if (rows.length > 1000) {
        rows = rows.slice(0, 1000);
      }

      const posts = [];
      rows.forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length < 5) return; // Expect at least 5 cells

        const companyAnchor = cells[0].querySelector("a");
        const company = companyAnchor
          ? companyAnchor.innerText.trim()
          : cells[0].innerText.trim();
        const role = cells[1].innerText.trim();
        const location = cells[2].innerText.trim();
        const linkAnchor = cells[3].querySelector("a");
        const link = linkAnchor ? linkAnchor.href : "";
        const datePosted = cells[4] ? cells[4].innerText.trim() : "";
        
        // Skip rows with missing essential data
        if (!company || !role || !datePosted) {
          return;
        }

        posts.push({
          repo: repoUrl,
          company,
          role,
          location,
          link,
          date: datePosted,
        });
      });

      return posts;
    }, repo.url);

    logger.log(`Found ${posts.length} post(s) in repo ${repo.name}.`);
    await browser.close();

    // Process the posts to match our standard job object format
    let processedPosts = posts.map((post) => {
      // Build a composite key as repoName_company_date (lower-cased)
      const compositeKey = (
        repo.name +
        "_" +
        post.company +
        "_" +
        post.date
      ).toLowerCase();

      return {
        id: compositeKey,
        title: `${post.company} - ${post.role}`,
        company: post.company,
        location: post.location,
        url: post.link || repo.url,
        postedDate: post.date,
        description: `Role: ${post.role} | Location: ${post.location}`,
        metadata: "",
        salary: "",
        workModel: "",
        source: repo.name,
        repoUrl: repo.url,
      };
    });

    // Skip relevance filtering for GitHub repositories - all jobs are already curated and relevant
    // GitHub repositories contain pre-filtered, high-quality job listings
    logger.log(`Skipping relevance filtering for GitHub repo ${repo.name} - all ${processedPosts.length} jobs are considered relevant`);

    // Apply date filtering based on the specified time filter
    const recentJobs = filterJobsByDate(processedPosts, timeFilter);
    logger.log(`📅 Date filtering: ${recentJobs.length}/${processedPosts.length} jobs from last ${timeFilter}`);

    return recentJobs;
  } catch (error) {
    logger.log(
      `Error scraping GitHub repo ${repo.name}: ${error.message}`,
      "error"
    );
    if (browser) await browser.close();
    return [];
  }
}

/**
 * Scrape a GitHub repository and send results to Discord
 * @param {object} repo - Repository configuration
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Job role to filter for
 * @param {string} timeFilter - Time filter for date filtering ("day", "week", "month")
 * @returns {object} Result object with jobs array
 */
async function scrapeRepoAndSend(repo, client, mode = "discord", role = "intern", timeFilter = "day") {
  const result = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
    jobs: [] // Add jobs array to return
  };

  try {
    // Channel routing is now handled by sendJobsToDiscord
    
    if (!client && mode === "discord") {
      logger.log("Discord client not found!", "error");
      return result;
    }

    const posts = await scrapeGithubRepo(repo, role, timeFilter);
    if (!posts || posts.length === 0) {
      logger.log(`No posts found in repo ${repo.name}`);
      if (client && mode === "discord") {
        const defaultChannel = client.channels.cache.get(config.channelId);
        if (defaultChannel) {
          await defaultChannel.send(`No new posts found for ${repo.name}.`);
        }
      }
      result.success = true;
      return result;
    }

    // Filter out posts already in the cache
    const newPosts = posts.filter(
      (post) => !mongoService.jobExists(post.id, "github")
    );

    if (newPosts.length === 0) {
      logger.log(`No new posts for ${repo.name}`);
      if (client && mode === "discord") {
        const defaultChannel = client.channels.cache.get(config.channelId);
        if (defaultChannel) {
          await defaultChannel.send(`No new posts for ${repo.name}.`);
        }
      }
      result.success = true;
      return result;
    }

    // Use mode-specific job limits (discord = lightweight, comprehensive = thorough)
    const maxJobsForRepo =
      mode === "comprehensive"
        ? repo.maxJobsComprehensive || 50 // Use comprehensive limit or default
        : repo.maxJobs || 5; // Use discord limit or default
    const postsToSend = newPosts.slice(0, maxJobsForRepo);

    // Add jobs to MongoDB cache
    await mongoService.addJobs(postsToSend, "github");
    result.jobsFound = postsToSend.length;
    
    // Add all posts to the jobs array (not just new ones)
    result.jobs = posts;

    // Only post to Discord if client is provided and mode is discord
    if (client && mode === "discord" && postsToSend.length > 0) {
      // Route jobs to appropriate channels
      await sendJobsToDiscord(postsToSend, client, repo.name, role, delay);
    }

    result.success = true;
    return result;
  } catch (error) {
    logger.log(`Error processing repo ${repo.name}: ${error.message}`, "error");
    result.errorCount++;
    return result;
  }
}

/**
 * Main function to scrape all GitHub repositories
 * @param {object} client - Discord client (optional, if null won't post to Discord)
 * @param {string} mode - Scraping mode: "discord" or "comprehensive"
 * @param {string} role - Role type: "intern" or "new grad"
 * @param {string} timeFilter - Time filter for date filtering ("day", "week", "month")
 * @returns {object} Status object with jobs array
 */
async function scrapeAllJobs(client, mode = "discord", role = "intern", timeFilter = "day") {
  const lastRunStatus = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
    jobs: [] // Add jobs array to return
  };

  logger.log("Starting GitHub scraping process");

  try {
    // Channel routing is now handled by sendJobsToDiscord
    
    if (client && mode === "discord") {
      const defaultChannel = client.channels.cache.get(config.channelId);
      if (defaultChannel) {
        await defaultChannel.send("GitHub - Internship Posts Update");
      }
    }

    // Process each repo and collect results
    for (const repo of config.github.repos) {
      const repoResult = await scrapeRepoAndSend(repo, client, mode, role, timeFilter);
      lastRunStatus.jobsFound += repoResult.jobsFound;
      lastRunStatus.errorCount += repoResult.errorCount;
      
      // Add jobs from this repo to the total jobs array
      if (repoResult.jobs) {
        lastRunStatus.jobs.push(...repoResult.jobs);
      }
    }

    if (client && mode === "discord") {
      const defaultChannel = client.channels.cache.get(config.channelId);
      if (defaultChannel) {
        await defaultChannel.send(
          `GitHub scraping complete. Found ${lastRunStatus.jobsFound} new posts.`
        );
      }
    }
    
    lastRunStatus.success = true;
    logger.log(`GitHub scraping process completed successfully. Found ${lastRunStatus.jobsFound} new posts, collected ${lastRunStatus.jobs.length} total relevant jobs.`);

    return lastRunStatus;
  } catch (error) {
    lastRunStatus.success = false;
    logger.log(
      `Critical error in GitHub scrapeAllJobs: ${error.message}`,
      "error"
    );
    return lastRunStatus;
  }
}

/**
 * Scrape a specific repository by name
 * @param {string} repoName - Name of the repository to scrape
 * @param {object} client - Discord client
 * @param {string} mode - Scraping mode ("discord" or "comprehensive")
 * @param {string} role - Job role to filter for ("intern" or "new grad")
 * @param {string} timeFilter - Time filter for date filtering ("day", "week", "month")
 * @returns {object} Status object
 */
async function scrapeSpecificRepo(
  repoName,
  client,
  mode = "discord",
  role = "intern",
  timeFilter = "day"
) {
  logger.log(`Looking for repo with name: ${repoName}`);

  const repo = config.github.repos.find(
    (r) => r.name.toLowerCase() === repoName.toLowerCase()
  );
  if (!repo) {
    logger.log(`Repository not found: ${repoName}`, "error");
    return {
      lastRun: new Date(),
      success: false,
      errorCount: 1,
      jobsFound: 0,
      message: `Repository not found: ${repoName}`,
    };
  }

  return await scrapeRepoAndSend(repo, client, mode, role, timeFilter);
}

/**
 * Scrape a specific repository (alias for scrapeSpecificRepo for backward compatibility)
 * @param {string} repoName - Name of the repository to scrape
 * @param {object} client - Discord client
 * @param {string} mode - Scraping mode ("discord" or "comprehensive")
 * @param {string} role - Job role to filter for ("intern" or "new grad")
 * @param {string} timeFilter - Time filter for date filtering ("day", "week", "month")
 * @returns {object} Status object
 */
async function scrapeRepository(
  repoName,
  client,
  mode = "discord",
  role = "intern",
  timeFilter = "day"
) {
  return await scrapeSpecificRepo(repoName, client, mode, role, timeFilter);
}

module.exports = {
  scrapeAllJobs,
  scrapeSpecificRepo,
  scrapeRepository,
  scrapeGithubRepo,
};

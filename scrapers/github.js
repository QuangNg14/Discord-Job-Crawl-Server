const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const { EmbedBuilder } = require("discord.js");
const { delay } = require("../utils/helpers");

/**
 * Scrape a GitHub repository for job listings
 * @param {object} repo - Repository configuration object
 * @returns {Array} Array of job posts
 */
async function scrapeGithubRepo(repo) {
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
        const datePosted = cells[4].innerText.trim();

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
    const processedPosts = posts.map((post) => {
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
        source: repo.name,
        repoUrl: repo.url,
      };
    });

    return processedPosts;
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
 * Helper: Scrape a single repo and send posts
 * @param {object} repo - Repository configuration object
 * @param {object} client - Discord client
 * @returns {object} Status object with counts
 */
async function scrapeRepoAndSend(repo, client) {
  const result = {
    lastRun: new Date(),
    success: false,
    errorCount: 0,
    jobsFound: 0,
  };

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log("Discord channel not found!", "error");
      return result;
    }

    const posts = await scrapeGithubRepo(repo);
    if (!posts || posts.length === 0) {
      logger.log(`No posts found in repo ${repo.name}`);
      await channel.send(`No new posts found for ${repo.name}.`);
      result.success = true;
      return result;
    }

    // Filter out posts already in the cache
    const newPosts = posts.filter(
      (post) => !mongoService.jobExists(post.id, "github")
    );

    if (newPosts.length === 0) {
      logger.log(`No new posts for ${repo.name}`);
      await channel.send(`No new posts for ${repo.name}.`);
      result.success = true;
      return result;
    }

    // Use repo-specific maxJobs setting
    const maxJobsForRepo = repo.maxJobs || 5; // Default to 5 if not specified
    const postsToSend = newPosts.slice(0, maxJobsForRepo);

    // Add jobs to MongoDB cache
    await mongoService.addJobs(postsToSend, "github");
    result.jobsFound = postsToSend.length;

    await channel.send(
      `${repo.name} (${postsToSend.length} new post${
        postsToSend.length > 1 ? "s" : ""
      }):`
    );

    for (const post of postsToSend) {
      const embed = new EmbedBuilder()
        .setTitle(post.title)
        .setURL(post.url)
        .setColor(config.github.embedColor)
        .setDescription(post.description)
        .addFields({ name: "Date", value: post.postedDate, inline: true })
        .setFooter({
          text: `Source: ${post.source} | ID: ${post.id.substring(0, 10)}`,
        });

      try {
        await channel.send({ embeds: [embed] });
      } catch (err) {
        logger.log(`Error sending post: ${err.message}`, "error");
        result.errorCount++;
      }

      await delay(1000);
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

  logger.log("Starting GitHub scraping process");

  try {
    const channel = client.channels.cache.get(config.channelId);
    if (!channel) {
      logger.log(`Channel with ID ${config.channelId} not found`, "error");
      return lastRunStatus;
    }

    await channel.send("GitHub - Internship Posts Update");

    // Process each repo and collect results
    for (const repo of config.github.repos) {
      const repoResult = await scrapeRepoAndSend(repo, client);
      lastRunStatus.jobsFound += repoResult.jobsFound;
      lastRunStatus.errorCount += repoResult.errorCount;
    }

    await channel.send(
      `GitHub scraping complete. Found ${lastRunStatus.jobsFound} new posts.`
    );
    lastRunStatus.success = true;
    logger.log("GitHub scraping process completed successfully.");

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
 * @returns {object} Status object
 */
async function scrapeSpecificRepo(repoName, client) {
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

  return await scrapeRepoAndSend(repo, client);
}

module.exports = {
  scrapeAllJobs,
  scrapeSpecificRepo,
};

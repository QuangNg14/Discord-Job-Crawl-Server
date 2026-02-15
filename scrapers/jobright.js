const puppeteer = require("puppeteer-extra");
const https = require("https");
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
 * Build a raw GitHub README URL for a repository.
 * @param {string} repoUrl - GitHub repository URL
 * @param {string} branch - Branch name
 * @returns {string|null} Raw README URL or null
 */
function buildRawReadmeUrl(repoUrl, branch) {
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
  } catch (error) {
    return null;
  }
}

/**
 * Fetch README markdown from GitHub raw content.
 * @param {string} repoUrl - GitHub repository URL
 * @returns {Promise<string|null>} README markdown or null
 */
async function fetchReadmeMarkdown(repoUrl) {
  const branches = ["master", "main"];

  for (const branch of branches) {
    const rawUrl = buildRawReadmeUrl(repoUrl, branch);
    if (!rawUrl) continue;

    const markdown = await new Promise((resolve) => {
      https
        .get(rawUrl, (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }

          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve(data));
        })
        .on("error", () => resolve(null));
    });

    if (markdown) {
      return markdown;
    }
  }

  return null;
}

/**
 * Extract text and URL from markdown cell content.
 * @param {string} cell - Markdown cell content
 * @returns {{ text: string, url: string }}
 */
function extractMarkdownLink(cell) {
  const linkMatch = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (linkMatch) {
    return {
      text: linkMatch[1].trim(),
      url: linkMatch[2].trim(),
    };
  }

  return {
    text: cell.replace(/\*\*/g, "").trim(),
    url: "",
  };
}

/**
 * Parse JobRight jobs from a markdown table.
 * @param {string} markdown - README markdown content
 * @param {object} repo - Repository configuration
 * @returns {Array} Array of job objects
 */
function parseJobsFromMarkdown(markdown, repo) {
  const lines = markdown.split("\n");
  let tableStart = -1;

  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i].toLowerCase();
    if (header.includes("| company") && header.includes("| job title")) {
      tableStart = i;
      break;
    }
  }

  if (tableStart === -1) {
    return [];
  }

  const results = [];
  const processedJobs = new Set();
  let lastCompany = "";

  for (let i = tableStart + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;

    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell, index, arr) => {
        if (index === 0 && cell === "") return false;
        if (index === arr.length - 1 && cell === "") return false;
        return true;
      });

    if (cells.length < 5) continue;

    const companyCell = cells[0];
    const titleCell = cells[1];
    const locationCell = cells[2];
    const workModelCell = cells[3];
    const dateCell = cells[4];

    const companyInfo = extractMarkdownLink(companyCell);
    const titleInfo = extractMarkdownLink(titleCell);

    const isSubRow =
      companyCell === "" ||
      companyCell.includes("↳") ||
      companyInfo.text === "↳";
    const company = isSubRow ? lastCompany : companyInfo.text;
    if (!isSubRow && company) {
      lastCompany = company;
    }

    const jobTitle = titleInfo.text;
    const location = locationCell.replace(/\*\*/g, "").trim();
    const workModel = workModelCell.replace(/\*\*/g, "").trim();
    const datePosted = dateCell.replace(/\*\*/g, "").trim();

    if (!company || !jobTitle || !datePosted) continue;

    const jobUrl = titleInfo.url || companyInfo.url || repo.url;
    const jobId = `jobright-${company}_${jobTitle}_${location}_${datePosted}`;

    if (processedJobs.has(jobId)) continue;
    processedJobs.add(jobId);

    results.push({
      title: jobTitle,
      company,
      location,
      workModel,
      postedDate: datePosted,
      url: jobUrl,
      description: `${jobTitle} at ${company} - ${location} (${workModel})`,
      metadata: `Source: ${repo.name}`,
      salary: "",
      source: "jobright",
      role: repo.type,
      // Don't set category from repo - let categorizeJob() determine it from title
      // so "Data Scientist" from Data Analysis repo goes to data_science_engineer, not data_analysis
      repoName: repo.name,
      normalizedId: jobId,
    });
  }

  return results;
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
    const markdown = await fetchReadmeMarkdown(repo.url);
    if (markdown) {
      const markdownJobs = parseJobsFromMarkdown(markdown, repo);
      if (markdownJobs.length > 0) {
        const processedJobs = markdownJobs.map((job) => {
          const normalized = normalizeJob(job);
          return {
            ...normalized,
            id: normalized.normalizedId,
          };
        });

        logger.log(
          `JobRight repo ${repo.name} found ${processedJobs.length} jobs from README markdown.`,
        );
        return processedJobs;
      }
    }

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
      let lastCompany = "";

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
              const companyRaw = cells[0]?.textContent?.trim() || "";
              const jobTitle = cells[1]?.textContent?.trim() || "";
              const location = cells[2]?.textContent?.trim() || "";
              const workModel = cells[3]?.textContent?.trim() || "";
              const datePosted = cells[4]?.textContent?.trim() || "";

              const company =
                companyRaw === "" || companyRaw.includes("↳")
                  ? lastCompany
                  : companyRaw;
              if (company && company !== lastCompany) {
                lastCompany = company;
              }

              // Skip if missing essential data
              if (!company || !jobTitle || !datePosted) {
                continue;
              }

              const jobLink = cells[1]?.querySelector("a")?.href || "";
              const jobUrl = jobLink || repoConfig.url;

              // Create unique job ID
              const jobId = `jobright-${company}_${jobTitle}_${location}_${datePosted}`;

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
                url: jobUrl,
                description: `${jobTitle} at ${company} - ${location} (${workModel})`,
                metadata: `Source: ${repoConfig.name}`,
                salary: "",
                source: "jobright",
                role: repoConfig.type,
                // Don't set category from repo - let categorizeJob() determine it from title
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
        id: normalized.normalizedId, // Use normalizedId as the dedup key
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
 * @param {string} timeFilter - Date filter: "day", "three_days", "week", "month" (default "three_days" for daily)
 * @returns {object} Object with jobs array and metadata
 */
async function scrapeAllJobs(client, mode = "discord", role = "both", timeFilter = "three_days") {
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

  // Remove duplicates (same company, title, location) and limit total jobs
  const uniqueJobs = allJobs.filter(
    (job, index, self) => index === self.findIndex((j) => j.id === job.id),
  );

  // Apply date filter: only jobs from the last N days
  const dateFiltered =
    timeFilter && timeFilter !== "all" && timeFilter !== "none"
      ? filterJobsByDate(uniqueJobs, timeFilter)
      : uniqueJobs;
  logger.log(
    `JobRight date filter (${timeFilter}): ${dateFiltered.length}/${uniqueJobs.length} jobs kept.`,
  );

  const finalJobs = isComprehensive ? dateFiltered : dateFiltered.slice(0, jobLimit);

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

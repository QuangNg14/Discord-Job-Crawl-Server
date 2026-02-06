const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());
const config = require("../config");
const logger = require("../services/logger");
const mongoService = require("../services/mongo");
const {
  delay,
  filterJobsByDate,
  sendJobsToDiscord,
  generateJobId,
  normalizeJob,
} = require("../utils/helpers");

function buildWellFoundUrl(roleSlug, locationSlug, page = 1) {
  const baseUrl = `https://wellfound.com/role/l/${roleSlug}/${locationSlug}`;
  if (page && page > 1) {
    return `${baseUrl}?page=${page}`;
  }
  return baseUrl;
}

function shouldExcludeRole(title = "") {
  const excluded = config.wellfound?.excludedRoleKeywords || [];
  const titleLower = title.toLowerCase();
  return excluded.some((keyword) => titleLower.includes(keyword));
}

function slugify(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function unpackNodeReferences(node, graph, debug = false) {
  const flatten = (value) => {
    if (!value || typeof value !== "object") return value;
    if (value.type !== "id" || !value.id || !graph[value.id]) return value;
    let data = JSON.parse(JSON.stringify(graph[value.id]));
    if (data?.node) {
      data = flatten(data.node);
    }
    if (debug) {
      data.__reference = value.id;
    }
    return data;
  };

  node = flatten(node);
  if (!node || typeof node !== "object") return node;

  for (const [key, value] of Object.entries(node)) {
    if (Array.isArray(value)) {
      node[key] = value.map((item) =>
        unpackNodeReferences(flatten(item), graph, debug)
      );
    } else if (value && typeof value === "object") {
      node[key] = unpackNodeReferences(flatten(value), graph, debug);
    }
  }

  return node;
}

function extractApolloGraph(nextData) {
  return nextData?.props?.pageProps?.apolloState?.data || null;
}

function parseApolloJobs(graph, roleName, locationName) {
  if (!graph) return { jobs: [], debug: { reason: "missing_graph" } };

  const startupResultKeys = Object.keys(graph).filter((key) =>
    key.startsWith("StartupResult")
  );
  const startups = startupResultKeys.map((key) =>
    unpackNodeReferences(graph[key], graph)
  );

  const jobs = [];

  for (const startup of startups) {
    const companyName = startup?.name || "Company not specified";
    const jobCollections = [
      startup?.highlightedJobListings,
      startup?.jobListings,
      startup?.jobs,
      startup?.openJobs,
      startup?.jobListingsV2,
    ].filter(Boolean);

    for (const collection of jobCollections) {
      for (const job of collection) {
        if (!job) continue;
        const title = job.title || job.name || "";
        if (!title) continue;

        const locationNames = Array.isArray(job.locationNames)
          ? job.locationNames.map((loc) => loc?.name || loc).filter(Boolean)
          : Array.isArray(job.locations)
            ? job.locations.map((loc) => loc?.name || loc).filter(Boolean)
            : [];

        const location =
          locationNames.join(" • ") ||
          job.location ||
          locationName ||
          "Location not specified";

        let postedDate = job.published || job.publishedAtRelative || "";
        if (!postedDate && job.liveStartAt) {
          postedDate = new Date(job.liveStartAt * 1000).toISOString();
        }

        let url =
          job.url ||
          job.jobUrl ||
          job.pageUrl ||
          (job.id
            ? `https://wellfound.com/jobs/${job.id}-${job.slug || slugify(title)}`
            : "");

        if (url && url.startsWith("/")) {
          url = `https://wellfound.com${url}`;
        }

        jobs.push({
          title,
          company: companyName,
          location,
          postedDate: postedDate || "Recent",
          url,
          description: job.description || "",
          metadata: `Role: ${roleName || ""} | Location: ${locationName || ""}`,
          source: "wellfound",
        });
      }
    }
  }

  return {
    jobs,
    debug: {
      graphKeys: Object.keys(graph).length,
      startupResults: startups.length,
      jobsFound: jobs.length,
    },
  };
}

async function scrapeWellFoundPage(searchUrl, roleName, locationName) {
  logger.log(`Scraping WellFound: ${searchUrl}`);
  let browser;

  try {
    browser = await puppeteer.launch({
      headless: config.puppeteer?.headless || "new",
      args: config.puppeteer?.args || ["--no-sandbox"],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(searchUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });
    await delay(4000);

    await page.waitForSelector("body", { timeout: 20000 });
    logger.log(`✅ Loaded WellFound page: ${page.url()}`);
    try {
      const title = await page.title();
      logger.log(`📄 Page title: ${title}`);
    } catch (error) {
      logger.log(`⚠️ Failed to read page title: ${error.message}`, "warn");
    }
    const nextDataText = await page.evaluate(() => {
      return document.querySelector("script#__NEXT_DATA__")?.textContent || "";
    });
    if (nextDataText) {
      try {
        const nextData = JSON.parse(nextDataText);
        const graph = extractApolloGraph(nextData);
        const apolloResult = parseApolloJobs(graph, roleName, locationName);
        logger.log(
          `🧪 Apollo debug: graphKeys=${apolloResult.debug.graphKeys || 0}, startups=${apolloResult.debug.startupResults || 0}, jobs=${apolloResult.debug.jobsFound || 0}`
        );
        if (apolloResult.jobs.length > 0) {
          const processedJobs = apolloResult.jobs.map((job) => {
            const normalized = normalizeJob(job);
            return {
              ...normalized,
              id: normalized.jobId,
            };
          });
          await browser.close();
          return processedJobs;
        }
      } catch (error) {
        logger.log(`⚠️ Failed to parse __NEXT_DATA__: ${error.message}`, "warn");
      }
    } else {
      logger.log("⚠️ __NEXT_DATA__ not found on page", "warn");
    }

    try {
      await page.waitForSelector("a[href^='/jobs/']", { timeout: 20000 });
    } catch (error) {
      logger.log(
        `⚠️ No job links after initial load, retrying: ${error.message}`,
        "warn"
      );
      await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
      await delay(4000);
    }

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 300);
      });
    });

    const jobs = await page.evaluate((roleName, locationName) => {
      const results = [];
      const processedUrls = new Set();
      const debug = {
        totalJobLinks: 0,
        totalCards: 0,
        totalProcessed: 0,
        exampleLinks: [],
      };

      function cleanText(text) {
        if (!text) return "";
        return text
          .replace(/[*\u00A0\u2022\u2023\u25E6\u2043\u2219]/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      function findText(element, selectors) {
        for (const selector of selectors) {
          const el = element.querySelector(selector);
          if (el) {
            const text = cleanText(el.innerText || el.textContent);
            if (text) return text;
          }
        }
        return "";
      }

      function extractFromTextBlock(text) {
        const lines = text
          .split("\n")
          .map((line) => cleanText(line))
          .filter((line) => line.length > 0);

        let title = "";
        let company = "";
        let location = "";
        let postedDate = "";

        for (const line of lines) {
          const lowerLine = line.toLowerCase();
          if (!title && line.length > 3) {
            title = line;
          } else if (!company && line.length > 1 && line.length < 80) {
            company = line;
          }

          if (!location && (lowerLine.includes(",") || lowerLine.includes("remote"))) {
            location = line;
          }

          if (!postedDate && lowerLine.includes("ago")) {
            postedDate = line;
          }
        }

        return { title, company, location, postedDate };
      }

      const jobCards = Array.from(
        document.querySelectorAll("div.mb-6.w-full.rounded.border")
      );
      debug.totalCards = jobCards.length;

      const cardsToProcess =
        jobCards.length > 0
          ? jobCards
          : Array.from(document.querySelectorAll("a[href^='/jobs/']"))
              .map((anchor) => anchor.closest("div.mb-6") || anchor.closest("div"))
              .filter(Boolean);

      const allJobLinks = Array.from(
        document.querySelectorAll("a[href^='/jobs/']")
      );
      debug.totalJobLinks = allJobLinks.length;
      debug.exampleLinks = allJobLinks
        .slice(0, 5)
        .map((link) => link.getAttribute("href"))
        .filter(Boolean);

      cardsToProcess.forEach((card) => {
        const cardJobLinks = Array.from(
          card.querySelectorAll("a[href^='/jobs/']")
        );
        if (cardJobLinks.length === 0) {
          return;
        }

        const company = cleanText(
          card.querySelector("[data-testid='startup-header'] h2")
            ?.textContent || ""
        );

        cardJobLinks.forEach((linkEl) => {
        const href = linkEl.getAttribute("href") || "";
        if (!href) return;

        const url = href.startsWith("http")
          ? href
          : new URL(href, "https://wellfound.com").href;

        if (processedUrls.has(url)) return;
        processedUrls.add(url);

        const title = cleanText(linkEl.textContent);
        if (!title) return;

        let jobRow = linkEl.closest("div");
        while (
          jobRow &&
          !jobRow.querySelector("[data-test='JobApplicationApplyButton']")
        ) {
          jobRow = jobRow.parentElement;
        }
        if (!jobRow) {
          jobRow = linkEl.closest("div") || linkEl.parentElement;
        }

        const spanTexts = Array.from(jobRow.querySelectorAll("span"))
          .map((span) => cleanText(span.textContent))
          .filter(Boolean);

        const postedDate =
          spanTexts.find((text) => text.toLowerCase().includes("ago")) || "";

        const locationText =
          spanTexts.find((text) => text.includes("•")) || "";

        let location = "";
        if (locationText.includes("•")) {
          const parts = locationText.split("•").map((part) => part.trim());
          location = parts[parts.length - 1] || "";
          location = location.replace(/\+\d+$/, "").trim();
        }

        const description = cleanText(jobRow.textContent || "").slice(0, 220);

        results.push({
          title,
          company: company || "Company not specified",
          location: location || locationName || "Location not specified",
          postedDate: postedDate || "Recent",
          url,
          description,
          metadata: `Role: ${roleName || ""} | Location: ${locationName || ""}`,
          source: "wellfound",
        });
        debug.totalProcessed += 1;
        });
      });

      return { results, debug };
    }, roleName, locationName);

    logger.log(
      `🧪 WellFound debug: cards=${jobs.debug.totalCards}, links=${jobs.debug.totalJobLinks}, processed=${jobs.debug.totalProcessed}`
    );
    if (jobs.debug.exampleLinks.length > 0) {
      logger.log(
        `🧪 WellFound sample links: ${jobs.debug.exampleLinks.join(", ")}`
      );
    }

    const processedJobs = jobs.results.map((job) => {
      const normalized = normalizeJob(job);
      return {
        ...normalized,
        id: normalized.jobId,
      };
    });

    await browser.close();
    return processedJobs;
  } catch (error) {
    logger.log(`Error scraping WellFound: ${error.message}`, "error");
    if (browser) await browser.close();
    return [];
  }
}

async function scrapeRoleLocation(role, location, timeFilter) {
  const roleSlug = role.slug;
  const locationSlug = location.slug;
  const maxPages = config.wellfound?.maxPagesPerRoleLocation || 3;

  const collectedJobs = [];
  const seenUrls = new Set();

  for (let page = 1; page <= maxPages; page++) {
    const url = buildWellFoundUrl(roleSlug, locationSlug, page);
    const pageJobs = await scrapeWellFoundPage(url, role.name, location.name);

    if (!pageJobs || pageJobs.length === 0) {
      break;
    }

    const newJobs = pageJobs.filter((job) => !seenUrls.has(job.url));
    newJobs.forEach((job) => seenUrls.add(job.url));

    if (newJobs.length === 0) {
      break;
    }

    collectedJobs.push(...newJobs);
    await delay(1200);
  }

  const filteredByDate = filterJobsByDate(collectedJobs, timeFilter);
  return filteredByDate;
}

async function scrapeAllJobs(
  client,
  mode = "discord",
  role = "both",
  timeFilter = "three_months"
) {
  logger.log("Starting WellFound scraping process");

  const allJobs = [];
  const jobLimit =
    mode === "comprehensive"
      ? config.wellfound.jobLimits.comprehensive
      : config.wellfound.jobLimits.discord;

  for (const roleConfig of config.wellfound.roles) {
    for (const locationConfig of config.wellfound.locations) {
      try {
        logger.log(
          `Scraping WellFound: ${roleConfig.name} in ${locationConfig.name}`
        );

        const jobs = await scrapeRoleLocation(
          roleConfig,
          locationConfig,
          timeFilter
        );

        if (jobs && jobs.length > 0) {
          allJobs.push(
            ...jobs.map((job) => ({
              ...job,
              role: roleConfig.name,
            }))
          );
        }

        await delay(1500);
      } catch (error) {
        logger.log(
          `Error scraping WellFound ${roleConfig.name} in ${locationConfig.name}: ${error.message}`,
          "error"
        );
      }
    }
  }

  const filteredJobs = allJobs.filter((job) => !shouldExcludeRole(job.title));

  const dedupedMap = new Map();
  for (const job of filteredJobs) {
    const dedupeKey = job.normalizedId || generateJobId(job);
    if (!dedupedMap.has(dedupeKey)) {
      dedupedMap.set(dedupeKey, { ...job, normalizedId: dedupeKey });
    }
  }
  const dedupedJobs = Array.from(dedupedMap.values());

  const newJobs = dedupedJobs.filter(
    (job) => !mongoService.jobExists(job.id, "wellfound")
  );

  const limitedJobs = newJobs.slice(0, jobLimit);

  if (limitedJobs.length > 0) {
    await mongoService.addJobs(limitedJobs, "wellfound");
  }

  if (client && mode === "discord" && limitedJobs.length > 0) {
    await sendJobsToDiscord(limitedJobs, client, "WellFound", role, delay);
  }

  logger.log(
    `WellFound scraping completed. Collected ${dedupedJobs.length} jobs, ${limitedJobs.length} new jobs.`
  );

  return {
    lastRun: new Date(),
    success: true,
    errorCount: 0,
    jobsFound: limitedJobs.length,
    jobs: dedupedJobs,
  };
}

module.exports = {
  scrapeAllJobs,
};

// Global configuration for the job scraping bot
module.exports = {
  // Discord configuration
  channelId: process.env.CHANNEL_ID,
  debugMode: process.env.DEBUG_MODE === "true",

  // Main scraping schedule (for all job sources)
  scrapingSchedule: "0 9 * * *", // Daily at 9:00 AM (cron format)

  // MongoDB configuration
  mongo: {
    uri: process.env.MONGO_URI || "mongodb://localhost:27017",
    dbName: process.env.DB_NAME || "job_scraper_bot",
    collections: {
      linkedin: "linkedin_jobs",
      simplyhired: "simplyhired_jobs",
      ziprecruiter: "ziprecruiter_jobs",
      careerjet: "careerjet_jobs",
      jobright: "jobright_jobs",
      glassdoor: "glassdoor_jobs",
      dice: "dice_jobs",
      github: "github_jobs",
    },
    maxCacheSize: 1000, // Maximum number of jobs to keep in cache per source
  },

  // LinkedIn scraper configuration
  linkedin: {
    jobKeywords: ["software engineer intern"],
    jobLocations: ["United States", "Canada"],
    maxJobsPerSearch: 5,
    fileCache: "linkedin-job-cache.json",
    embedColor: "#0077b5",
    optionalQueryParams: {
      f_TPR: "r86400",
    },
    timeFilters: {
      day: "r86400",
      week: "r604800",
      month: "r2592000",
    },
    jobLimits: {
      default: 5,
    },
  },

  // SimplyHired scraper configuration
  simplyhired: {
    jobKeywords: ["software engineer intern"],
    jobLocations: ["United States", "Canada"],
    maxJobsPerSearch: 5,
    maxPages: 3,
    fileCache: "simplyhired-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      default: 5,
    },
  },

  // ZipRecruiter scraper configuration
  ziprecruiter: {
    jobKeywords: ["software engineer intern"],
    jobLocations: [""],
    maxJobsPerSearch: 5,
    fileCache: "ziprecruiter-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "5",
      month: "30",
    },
  },

  // CareerJet scraper configuration
  careerjet: {
    jobKeywords: ["software engineer intern"],
    maxJobsPerSearch: 5,
    fileCache: "careerjet-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      default: 5,
    },
  },

  // Jobright.ai scraper configuration
  jobright: {
    baseUrl: "https://jobright.ai/jobs/search",
    searches: [
      {
        name: "Software Engineer Intern",
        jobTitle: "Software Engineer",
      },
    ],
    additionalParams:
      "workModel=2&city=Within+US&seniority=1&jobTypes=1%2C2%2C3%2C4&radiusRange=50",
    maxJobsPerSearch: 5,
    fileCache: "jobright-job-cache.json",
    embedColor: "#1e90ff",
  },

  // Glassdoor scraper configuration
  glassdoor: {
    jobKeywords: ["software-engineer-intern"],
    jobLocations: ["us"],
    maxJobsPerSearch: 5,
    maxJobsToPost: 5,
    fileCache: "glassdoor-job-cache.json",
    embedColor: "#0caa41",
    searchUrls: {
      day: "https://www.glassdoor.com/Job/us-software-engineer-intern-jobs-SRCH_IL.0,2_IS1_KO3,27_IP1.htm?sortBy=date_desc&fromAge=1",
      week: "https://www.glassdoor.com/Job/us-software-engineer-intern-jobs-SRCH_IL.0,2_IS1_KO3,27_IP1.htm?sortBy=date_desc&fromAge=7",
      month:
        "https://www.glassdoor.com/Job/us-software-engineer-intern-jobs-SRCH_IL.0,2_IS1_KO3,27_IP1.htm?sortBy=date_desc&fromAge=30",
    },
  },

  // Dice.com scraper configuration
  dice: {
    jobKeywords: ["software engineer intern"],
    maxJobsPerSearch: 5,
    fileCache: "dice-job-cache.json",
    embedColor: "#2b2b67",
    baseUrl: "https://www.dice.com/jobs",
    defaultSearchParams: {
      countryCode: "US",
      radius: "30",
      radiusUnit: "mi",
      page: "1",
      pageSize: "20",
      language: "en",
      eid: "8855",
    },
    timeFilters: {
      day: "ONE",
      threeDay: "THREE",
      week: "SEVEN",
      all: "ALL",
    },
  },

  // GitHub scraper configuration
  github: {
    // List of GitHub repositories to scrape
    repos: [
      {
        name: "SimplifyJobs",
        url: "https://github.com/SimplifyJobs/Summer2025-Internships",
        maxJobs: 20,
      },
      {
        name: "SimplifyJobsOffSeason",
        url: "https://github.com/SimplifyJobs/Summer2025-Internships/blob/dev/README-Off-Season.md",
        maxJobs: 5,
      },
      {
        name: "Vanshb03",
        url: "https://github.com/vanshb03/Summer2025-Internships",
        maxJobs: 20,
      },
      {
        name: "SpeedyApply",
        url: "https://github.com/speedyapply/2025-SWE-College-Jobs",
        maxJobs: 2,
      },
    ],
    fileCache: "github-job-cache.json",
    embedColor: "#1e90ff",
  },

  // Logging configuration
  logging: {
    directory: "logs",
    errorFile: "error.log",
    combinedFile: "combined.log",
  },
};

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
    maxCacheSize: 5000, // Maximum number of jobs to keep in cache per source - increased for comprehensive scraping
    // Connection settings
    connectionTimeout: 5000, // 5 seconds
    serverSelectionTimeout: 5000,
    socketTimeout: 5000,
    retryWrites: true,
    retryReads: true,
  },

  // Anti-Detection and Security Configuration
  antiDetection: {
    enabled: true,
    maxRetries: 3,
    useRandomUserAgents: true,
    useRandomViewports: true,
    useStealthHeaders: true,
    blockUnnecessaryResources: true,
    simulateHumanBehavior: true,
    respectRobotsTxt: true,

    // Proxy configuration
    proxy: {
      enabled: process.env.PROXY_ENABLED === "true",
      pool: process.env.PROXY_POOL ? process.env.PROXY_POOL.split(",") : [],
      rotation: true,
      healthCheck: true,
      timeout: 10000,
    },

    // Rate limiting per site
    rateLimiting: {
      enabled: true,
      globalLimit: 100, // requests per minute across all sources
      respectSiteSpecificLimits: true,
      adaptiveThrottling: true,
      exponentialBackoff: true,
    },

    // Browser fingerprinting protection
    browserStealth: {
      removeWebdriverProperty: true,
      mockPlugins: true,
      mockLanguages: true,
      mockWebGL: true,
      mockChromeRuntime: true,
      mockPermissions: true,
      randomizeFingerprint: true,
    },

    // Error handling
    errorHandling: {
      intelligentRetry: true,
      adaptiveBackoff: true,
      captchaDetection: true,
      blockingDetection: true,
      networkErrorHandling: true,
      maxConsecutiveErrors: 5,
    },

    // Monitoring and alerting
    monitoring: {
      enabled: true,
      logDetectionEvents: true,
      alertOnBlocking: true,
      trackSuccessRates: true,
      performanceMetrics: true,
    },
  },

  // Puppeteer Enhanced Configuration
  puppeteer: {
    headless: process.env.NODE_ENV === "production" ? "new" : false,
    devtools: process.env.NODE_ENV !== "production",
    slowMo: process.env.NODE_ENV !== "production" ? 50 : 0,

    // Enhanced stealth arguments
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-field-trial-config",
      "--disable-back-forward-cache",
      "--disable-breakpad",
      "--disable-client-side-phishing-detection",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-domain-reliability",
      "--disable-extensions",
      "--disable-features=TranslateUI",
      "--disable-hang-monitor",
      "--disable-ipc-flooding-protection",
      "--disable-popup-blocking",
      "--disable-prompt-on-repost",
      "--disable-sync",
      "--disable-translate",
      "--metrics-recording-only",
      "--no-default-browser-check",
      "--use-mock-keychain",
      "--force-color-profile=srgb",
      "--memory-pressure-off",
      "--max_old_space_size=4096",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=VizDisplayCompositor",
      "--disable-ipc-flooding-protection",
    ],

    // Timeouts
    defaultTimeout: 30000,
    navigationTimeout: 45000,

    // Performance settings
    ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ["--enable-automation"],
  },

  // LinkedIn scraper configuration
  linkedin: {
    jobKeywords: [
      "software engineer intern",
      "software development intern",
      "software engineer new grad",
      "software engineer entry level",
      "software engineer graduate",
      "software development new grad",
      "software development entry level",
    ],
    jobLocations: ["United States"],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/linkedin-job-cache.json",
    embedColor: "#0077b5",
    // Standard LinkedIn search parameters based on user's URLs
    standardParams: {
      f_CR: "F", // Exclude staffing agencies
      f_JT: "F", // Full-time jobs
      f_WT: "1", // Remote work type
    },
    // Time filter configurations
    timeFilters: {
      day: "r86400", // Past 24 hours
      week: "r604800", // Past week
      month: "r2592000", // Past month
    },
    // Job limits for different modes
    jobLimits: {
      // Discord command limits (5-10 jobs per command)
      discord: {
        day: 7,
        week: 10,
        month: 8,
      },
      // Comprehensive scraping limits (focus on past week)
      comprehensive: {
        default: 50,
        week: 75, // Higher limit for comprehensive weekly scraping
      },
    },
    // Default time filter for comprehensive scraping
    defaultComprehensiveFilter: "week", // Focus on past week for new jobs
  },

  // SimplyHired scraper configuration
  simplyhired: {
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
    ],
    jobLocations: ["United States"],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    maxPages: 10, // Increased from 3 for comprehensive scraping
    fileCache: "cache/simplyhired-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      default: 50, // Increased from 5 for comprehensive scraping
    },
  },

  // ZipRecruiter scraper configuration
  ziprecruiter: {
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
    ],
    jobLocations: [""],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/ziprecruiter-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "5",
      month: "30",
    },
  },

  // CareerJet scraper configuration
  careerjet: {
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
    ],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/careerjet-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      default: 50, // Increased from 5 for comprehensive scraping
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
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/jobright-job-cache.json",
    embedColor: "#1e90ff",
  },

  // Glassdoor scraper configuration
  glassdoor: {
    jobKeywords: ["software-engineer-intern"],
    jobLocations: ["us"],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    maxJobsToPost: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/glassdoor-job-cache.json",
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
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
    ],
    maxJobsPerSearch: 50, // Increased from 5 for comprehensive scraping
    fileCache: "cache/dice-job-cache.json",
    embedColor: "#2b2b67",
    baseUrl: "https://www.dice.com/jobs",
    defaultSearchParams: {
      countryCode: "US",
      radius: "30",
      radiusUnit: "mi",
      page: "1",
      pageSize: "50", // Increased from 20 for comprehensive scraping
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
        name: "SimplifyJobs-NewGrad",
        url: "https://github.com/SimplifyJobs/New-Grad-Positions",
        maxJobs: 100, // Increased from 25 for comprehensive scraping
        type: "new_grad",
      },
      {
        name: "SimplifyJobs-Summer2026",
        url: "https://github.com/vanshb03/Summer2026-Internships",
        maxJobs: 80, // Increased from 20 for comprehensive scraping
        type: "intern",
      },
      {
        name: "SharunkumarOffSeason",
        url: "https://github.com/sharunkumar/Summer-Internships/blob/dev/README-Off-Season.md",
        maxJobs: 60, // Increased from 15 for comprehensive scraping
        type: "intern",
      },
      {
        name: "QuantInternships2026",
        url: "https://github.com/northwesternfintech/2026QuantInternships",
        maxJobs: 40, // Increased from 10 for comprehensive scraping
        type: "quant",
      },
    ],
    fileCache: "cache/github-job-cache.json",
    embedColor: "#1e90ff",
  },

  // Enhanced scraping targets - sites known for blocking bots
  enhancedScrapingTargets: {
    glassdoor: {
      useAi: true,
      selectors: {
        jobCard: "[data-test='jobListing']",
        title: "[data-test='job-title']",
        company: "[data-test='employer-name']",
        location: "[data-test='job-location']",
        salary: "[data-test='job-salary']",
      },
      commonObstacles: [
        "cookie consent",
        "location permission",
        "email signup popup",
        "app download prompt",
      ],
    },
    linkedin: {
      useAi: true,
      selectors: {
        jobCard: ".jobs-search__results-list li",
        title: ".base-search-card__title",
        company: ".base-search-card__subtitle",
        location: ".job-search-card__location",
        date: ".job-search-card__listdate",
      },
      commonObstacles: [
        "login wall",
        "cookie consent",
        "premium upgrade prompt",
      ],
    },
    indeed: {
      useAi: true,
      selectors: {
        jobCard: ".job_seen_beacon",
        title: "[data-jk] h2 a span",
        company: ".companyName",
        location: ".companyLocation",
        salary: ".salary-snippet",
      },
      commonObstacles: [
        "location permission",
        "cookie consent",
        "email alerts signup",
      ],
    },
  },

  // MCP Puppeteer Configuration for AI-Enhanced Scraping
  mcpPuppeteer: {
    enabled: true, // Set to false to disable AI-enhanced scraping
    openaiApiKey: process.env.OPENAI_API_KEY, // Required for AI features
    visionModel: process.env.VISION_MODEL || "gpt-4-vision-preview",
    apiBaseUrl: process.env.API_BASE_URL || "https://api.openai.com/v1",
    headless: true, // Set to false for debugging (shows browser)
    maxInteractionAttempts: 3, // How many times AI tries to bypass obstacles
    waitForNetworkIdle: true, // Wait for page to fully load
    timeoutSeconds: 30,
    // Sites that benefit most from AI-enhanced scraping
    prioritySites: [
      "glassdoor.com", // Heavy anti-bot measures
      "indeed.com", // Cookie consent, location prompts
      "linkedin.com", // Login walls, consent banners
      "ziprecruiter.com", // Newsletter prompts
      "monster.com", // Various popups
    ],
    // Fallback behavior when AI scraping fails
    fallbackToTraditional: true,
    fallbackTimeout: 10, // seconds before falling back
  },

  // Message Summarization Configuration
  messageSummarization: {
    enabled: true,
    maxMessagesPerSummary: 100,
    maxTokensPerRequest: 12000,
    maxSummaryLength: 1000,
    rateLimitPerHour: 10,
    defaultSummaryType: "general",
    embedColor: "#3498db",
    allowedChannels: [], // Empty = all channels allowed
    blockedChannels: [], // Channels to block from summarization
    allowedUsers: [], // Empty = all users allowed
    adminOnlyConfig: true,
    saveSummariesToDb: true,
    autoCleanupOldSummaries: true,
    cleanupAfterDays: 30,
  },

  // Logging configuration
  logging: {
    directory: "logs",
    errorFile: "error.log",
    combinedFile: "combined.log",
  },
};

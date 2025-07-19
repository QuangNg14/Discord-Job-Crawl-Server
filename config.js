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

  // Global job filtering configuration
  jobFiltering: {
    // Keywords that must be present in job titles (at least one)
    requiredKeywords: [
      "software",
      "data",
      "frontend",
      "backend",
      "fullstack",
      "full-stack",
      "full stack",
      "web",
      "mobile",
      "app",
      "application",
      "system",
      "platform",
      "cloud",
      "devops",
      "machine learning",
      "ml",
      "ai",
      "artificial intelligence",
      "analytics",
      "database",
      "algorithm",
      "programming",
      "developer",
      "development",
      "engineer",
      "engineering",
      "react",
      "node",
      "python",
      "java",
      "javascript",
      "typescript",
      "c++",
      "c#",
      "golang",
      "rust",
      "kotlin",
      "swift",
      "php",
      "ruby",
      "scala",
      "cybersecurity",
      "security",
      "infrastructure",
      "blockchain",
      "crypto",
      "fintech",
      "api",
      "microservices",
    ],

    // Keywords that exclude jobs (if present, job is rejected)
    excludedKeywords: [
      "geotechnical",
      "civil",
      "mechanical",
      "electrical",
      "chemical",
      "biomedical",
      "environmental",
      "aerospace",
      "nuclear",
      "petroleum",
      "mining",
      "construction",
      "hvac",
      "plumbing",
      "welding",
      "manufacturing",
      "production",
      "assembly",
      "field service",
      "field engineer",
      "field technician",
      "maintenance",
      "repair",
      "quality assurance engineer",
      "qa engineer",
      "test engineer",
      "validation engineer",
      "process engineer",
      "project engineer",
      "design engineer",
      "sales engineer",
      "application engineer",
      "field application",
      "technical support engineer",
      "hardware engineer",
      "firmware engineer",
      "embedded engineer",
      "rf engineer",
      "analog engineer",
      "digital design engineer",
      "circuit",
      "pcb",
      "asic",
      "fpga",
      "water resources",
      "structural",
      "transportation",
      "urban planning",
      "surveying",
      "materials engineer",
      "metallurgical",
      "ceramic",
      "polymer",
      "textile",
      "food engineer",
      "agricultural",
      "forest engineer",
      "packaging engineer",
      "safety engineer",
      "compliance engineer",
      "regulatory engineer",
      "clinical engineer",
      "bioprocess",
      "pharmaceutical",
      "medical device",
      "laboratory",
      "research engineer",
      "operations engineer",
      "facility engineer",
      "building engineer",
      "energy engineer",
      "power engineer",
      "control engineer",
      "instrumentation",
      "automation engineer",
      "industrial engineer",
      "logistics engineer",
      "supply chain engineer",
    ],

    // Specific software/data role indicators (if present, job is accepted regardless)
    softwareDataIndicators: [
      "software engineer",
      "software developer",
      "software development",
      "data engineer",
      "data scientist",
      "data analyst",
      "machine learning",
      "full stack",
      "frontend",
      "backend",
      "web developer",
      "mobile developer",
      "devops",
      "cloud engineer",
      "platform engineer",
      "infrastructure engineer",
      "security engineer",
      "ai engineer",
      "ml engineer",
      "backend engineer",
      "frontend engineer",
      "fullstack engineer",
    ],
  },

  // LinkedIn scraper configuration
  // Single /linkedin command supports:
  // - Time options: day, week, month
  // - Discord commands are lightweight (5-10 jobs), comprehensive mode only for internal use
  linkedin: {
    jobKeywords: [
      "software engineer intern",
      "software development intern",
      "software engineer new grad",
      "software engineer entry level",
      "software engineer graduate",
      "software development new grad",
      "software development entry level",
      "data engineer intern",
      "data engineer new grad",
      "data engineer entry level",
      "data scientist intern",
      "data scientist new grad",
      "data scientist entry level",
      "machine learning intern",
      "machine learning engineer",
      "full stack developer intern",
      "frontend engineer intern",
      "backend engineer intern",
      "web developer intern",
      "mobile developer intern",
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
    // Job limits for different modes (selected via /linkedin mode option)
    jobLimits: {
      // Discord mode limits (5-10 jobs for quick Discord responses)
      discord: {
        day: 7,
        week: 10,
        month: 8,
      },
      // Comprehensive mode limits (thorough scraping)
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
      "data engineer intern",
      "data engineer new grad",
      "data scientist intern",
      "machine learning intern",
      "full stack developer intern",
      "web developer intern",
    ],
    jobLocations: ["United States"],
    maxJobsPerSearch: 7, // Lightweight for Discord commands
    maxPages: 3, // Lightweight for Discord commands
    fileCache: "cache/simplyhired-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      discord: 7, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
    },
  },

  // ZipRecruiter scraper configuration
  ziprecruiter: {
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
      "data engineer intern",
      "data engineer new grad",
      "data scientist intern",
      "machine learning intern",
      "full stack developer intern",
      "web developer intern",
    ],
    jobLocations: [""],
    maxJobsPerSearch: 8, // Lightweight for Discord commands
    fileCache: "cache/ziprecruiter-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "5",
      month: "30",
    },
    jobLimits: {
      discord: 8, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
    },
  },

  // CareerJet scraper configuration
  careerjet: {
    jobKeywords: [
      "software engineer intern",
      "software engineer new grad",
      "software engineer entry level",
      "data engineer intern",
      "data engineer new grad",
      "data scientist intern",
      "machine learning intern",
      "full stack developer intern",
      "web developer intern",
    ],
    maxJobsPerSearch: 6, // Lightweight for Discord commands
    fileCache: "cache/careerjet-job-cache.json",
    embedColor: "#1e90ff",
    timeFilters: {
      day: "1",
      week: "7",
      month: "30",
    },
    jobLimits: {
      discord: 6, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
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
      {
        name: "Data Engineer Intern",
        jobTitle: "Data Engineer",
      },
      {
        name: "Data Scientist Intern",
        jobTitle: "Data Scientist",
      },
      {
        name: "Machine Learning Engineer",
        jobTitle: "Machine Learning Engineer",
      },
      {
        name: "Full Stack Developer",
        jobTitle: "Full Stack Developer",
      },
    ],
    additionalParams:
      "workModel=2&city=Within+US&seniority=1&jobTypes=1%2C2%2C3%2C4&radiusRange=50",
    maxJobsPerSearch: 7, // Lightweight for Discord commands
    fileCache: "cache/jobright-job-cache.json",
    embedColor: "#1e90ff",
    jobLimits: {
      discord: 7, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
    },
  },

  // Glassdoor scraper configuration
  glassdoor: {
    jobKeywords: [
      "software-engineer-intern",
      "software-engineer-new-grad",
      "data-engineer-intern",
      "data-scientist-intern",
      "machine-learning-intern",
      "full-stack-developer-intern",
      "web-developer-intern",
    ],
    jobLocations: ["us"],
    maxJobsPerSearch: 8, // Lightweight for Discord commands
    maxJobsToPost: 8, // Lightweight for Discord commands
    fileCache: "cache/glassdoor-job-cache.json",
    embedColor: "#0caa41",
    jobLimits: {
      discord: 8, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
    },
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
      "data engineer intern",
      "data engineer new grad",
      "data scientist intern",
      "machine learning intern",
      "full stack developer intern",
      "web developer intern",
    ],
    maxJobsPerSearch: 7, // Lightweight for Discord commands
    fileCache: "cache/dice-job-cache.json",
    embedColor: "#2b2b67",
    baseUrl: "https://www.dice.com/jobs",
    defaultSearchParams: {
      countryCode: "US",
      radius: "30",
      radiusUnit: "mi",
      page: "1",
      pageSize: "20", // Lightweight for Discord commands
      language: "en",
      eid: "8855",
    },
    jobLimits: {
      discord: 7, // Lightweight for Discord commands
      comprehensive: 50, // For internal script execution
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
        maxJobs: 10, // Lightweight for Discord commands
        maxJobsComprehensive: 100, // For internal script execution
        type: "new_grad",
      },
      {
        name: "SimplifyJobs-Summer2026",
        url: "https://github.com/SimplifyJobs/Summer2026-Internships",
        maxJobs: 8, // Lightweight for Discord commands
        maxJobsComprehensive: 80, // For internal script execution
        type: "intern",
      },
      {
        name: "SharunkumarOffSeason",
        url: "https://github.com/sharunkumar/Summer-Internships/blob/dev/README-Off-Season.md",
        maxJobs: 6, // Lightweight for Discord commands
        maxJobsComprehensive: 60, // For internal script execution
        type: "intern",
      },
      {
        name: "QuantInternships2026",
        url: "https://github.com/northwesternfintech/2026QuantInternships",
        maxJobs: 5, // Lightweight for Discord commands
        maxJobsComprehensive: 40, // For internal script execution
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

# Job Scraping Discord Bot

A comprehensive Discord bot that scrapes job listings from eight different sources and posts them to a designated Discord channel. The bot uses MongoDB for caching to prevent duplicate job postings and supports various filtering options.

## Features

- **Multi-Source Integration**: Scrapes jobs from 8 different sources:

  - LinkedIn
  - SimplyHired
  - ZipRecruiter
  - CareerJet
  - Jobright.ai
  - Glassdoor
  - Dice.com
  - GitHub repositories (including SimplifyJobs, SimplifyJobs Off-Season, Vanshb03, and SpeedyApply)

- **Intelligent Caching**: Uses MongoDB for efficient caching and deduplication

  - Fallback to file-based caching if MongoDB is unavailable
  - Automatic pruning of old entries
  - Source-specific cache management

- **Automated Scheduling**: Runs daily job scraping at configured times

  - Default schedule: 9:00 AM daily for all sources
  - Centralized scheduling for easier management

- **Flexible Commands**: Supports source-specific and time-specific commands

  - Run all sources at once or individual sources
  - Filter by time (day, week, month)
  - Source-specific commands (e.g., repository-specific GitHub commands)

- **Comprehensive Status Reporting**: Get detailed statistics about the bot's operations
  - Cache sizes for each source
  - Last run times and success rates
  - Job count statistics
  - Database connection status

## Installation

### Prerequisites

- Node.js 16.9.0 or higher
- MongoDB (optional but recommended)
- Discord Bot Token
- Discord Server with a channel for job postings

### Steps

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd job-scraper-discord-bot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   - Copy `.env.example` to `.env`

   ```bash
   cp .env.example .env
   ```

   - Open `.env` and fill in your Discord Bot Token and Channel ID

   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   CHANNEL_ID=your_discord_channel_id_here
   MONGO_URI=mongodb://username:password@localhost:27017
   DB_NAME=job_scraper_bot
   DEBUG_MODE=false
   ```

4. **Start the bot**
   ```bash
   npm start
   ```

## Configuration

The bot's behavior can be customized by editing the `config.js` file. Key configuration options include:

- **Scraping Schedule**: When the bot should run automated scraping
- **Job Keywords**: What job titles to search for on each platform
- **Job Locations**: Where to search for jobs
- **Maximum Jobs**: How many jobs to retrieve per search
- **GitHub Repositories**: Which GitHub repositories to scrape
- **Time Filters**: What time periods to use for each source
- **MongoDB Settings**: Database name, collection names, and caching limits

## Commands

### Combined Commands

| Command       | Description                                              |
| ------------- | -------------------------------------------------------- |
| `!jobs`       | Scrape all job boards with 24-hour filter                |
| `!jobsall`    | Scrape ALL sources (job boards + GitHub) with day filter |
| `!jobsday`    | Scrape all job sources with 24-hour filter               |
| `!jobsweek`   | Scrape all job sources with week filter                  |
| `!jobsmonth`  | Scrape all job sources with month filter                 |
| `!clearcache` | Clear all job caches                                     |

### LinkedIn Commands

| Command               | Description                                |
| --------------------- | ------------------------------------------ |
| `!linkedin`           | Scrape LinkedIn jobs for the past 24 hours |
| `!linkedinday`        | Scrape LinkedIn jobs for the past 24 hours |
| `!linkedinweek`       | Scrape LinkedIn jobs for the past week     |
| `!linkedinmonth`      | Scrape LinkedIn jobs for the past month    |
| `!clearlinkedincache` | Clear LinkedIn job cache                   |

### SimplyHired Commands

| Command                  | Description                                   |
| ------------------------ | --------------------------------------------- |
| `!simplyhired`           | Scrape SimplyHired jobs for the past 24 hours |
| `!simplyhiredday`        | Scrape SimplyHired jobs for the past 24 hours |
| `!simplyhiredweek`       | Scrape SimplyHired jobs for the past week     |
| `!simplyhiredmonth`      | Scrape SimplyHired jobs for the past month    |
| `!clearsimplyhiredcache` | Clear SimplyHired job cache                   |

### ZipRecruiter Commands

| Command              | Description                                    |
| -------------------- | ---------------------------------------------- |
| `!ziprecruiter`      | Scrape ZipRecruiter jobs for the past 24 hours |
| `!ziprecruiterday`   | Scrape ZipRecruiter jobs for the past 24 hours |
| `!ziprecruiterweek`  | Scrape ZipRecruiter jobs for the past week     |
| `!ziprecruitermonth` | Scrape ZipRecruiter jobs for the past month    |
| `!clearziprecruiter` | Clear ZipRecruiter job cache                   |

### CareerJet Commands

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `!careerjet`      | Scrape CareerJet jobs for the past 24 hours |
| `!careerjetday`   | Scrape CareerJet jobs for the past 24 hours |
| `!careerjetweek`  | Scrape CareerJet jobs for the past week     |
| `!careerjetmonth` | Scrape CareerJet jobs for the past month    |
| `!clearcareerjet` | Clear CareerJet job cache                   |

### Jobright.ai Commands

| Command          | Description                 |
| ---------------- | --------------------------- |
| `!jobright`      | Scrape Jobright.ai jobs     |
| `!clearjobright` | Clear Jobright.ai job cache |

### Glassdoor Commands

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `!glassdoor`      | Scrape Glassdoor jobs for the past 24 hours |
| `!glassdoorday`   | Scrape Glassdoor jobs for the past 24 hours |
| `!glassdoorweek`  | Scrape Glassdoor jobs for the past week     |
| `!glassdoormonth` | Scrape Glassdoor jobs for the past month    |
| `!clearglassdoor` | Clear Glassdoor job cache                   |

### Dice.com Commands

| Command      | Description                               |
| ------------ | ----------------------------------------- |
| `!dice`      | Scrape Dice.com jobs for today's postings |
| `!dicetoday` | Scrape Dice.com jobs posted today         |
| `!dice3days` | Scrape Dice.com jobs from the last 3 days |
| `!dice7days` | Scrape Dice.com jobs from the last 7 days |
| `!diceall`   | Scrape Dice.com jobs from all dates       |
| `!cleardice` | Clear Dice.com job cache                  |

### GitHub Commands

| Command            | Description                                   |
| ------------------ | --------------------------------------------- |
| `!github`          | Scrape all GitHub repositories                |
| `!jobssimplify`    | Scrape only the SimplifyJobs repository       |
| `!jobsoffsimplify` | Scrape the SimplifyJobs Off-Season repository |
| `!jobsvans`        | Scrape only the Vanshb03 repository           |
| `!jobsspeedy`      | Scrape only the SpeedyApply repository        |
| `!cleargithub`     | Clear GitHub job cache                        |

### Status Commands

| Command     | Description                      |
| ----------- | -------------------------------- |
| `!status`   | Check bot status and statistics  |
| `!dbstatus` | Check database connection status |
| `!help`     | Show help message                |

## Project Structure

```
.
├── config.js                 # Centralized configuration for all sources
├── index.js                  # Main entry point
├── package.json              # Dependencies
├── .env                      # Environment variables
├── .env.example              # Sample environment variables
├── logs/                     # Log files directory
│   ├── combined.log          # All logs
│   └── error.log             # Error logs only
├── services/                 # Core services
│   ├── commandHandler.js     # Command handling logic
│   ├── logger.js             # Logging service
│   └── mongo.js              # MongoDB connection and operations
├── scrapers/                 # Job scraper modules
│   ├── linkedin.js           # LinkedIn scraper
│   ├── simplyhired.js        # SimplyHired scraper
│   ├── ziprecruiter.js       # ZipRecruiter scraper
│   ├── careerjet.js          # CareerJet scraper
│   ├── jobright.js           # Jobright.ai scraper
│   ├── glassdoor.js          # Glassdoor scraper
│   ├── dice.js               # Dice.com scraper
│   └── github.js             # GitHub repositories scraper
└── utils/                    # Utility functions
    └── helpers.js            # Helper functions
```

## Troubleshooting

### MongoDB Connection Issues

If the bot can't connect to MongoDB, it will fall back to file-based caching. Check your `MONGO_URI` and ensure MongoDB is running. The bot will log connection errors in the error log.

```
# Check MongoDB connection
- Verify your MongoDB server is running
- Ensure credentials in .env are correct
- Check for proper network access if using a remote MongoDB instance
```

### Discord Connection Issues

If the bot fails to connect to Discord, it will retry every 30 seconds. Check your `DISCORD_TOKEN` and ensure it's correct.

```
# Check Discord connection
- Verify your Discord bot token is correct
- Ensure the bot has proper permissions in your server
- Confirm the bot is actually added to your server
```

### Scraping Issues

If a specific source fails to scrape, the bot will log the error and continue with other sources. Check the logs for details.

```
# Common scraping issues
- Rate limiting from job sites (adjust delay settings in config.js)
- HTML structure changes on job sites (may require scraper updates)
- Network connectivity problems (check your internet connection)
- Ensure Puppeteer has access to launch Chrome (check system permissions)
```

### Debug Mode

If you encounter issues, you can set `DEBUG_MODE=true` in your `.env` file to get more detailed logs and screenshots of scraping attempts.

## Advanced Configuration

### Adding New Job Sources

The bot is designed to be extensible. To add a new job source:

1. Create a new scraper module in the `scrapers` directory
2. Add configuration for the new source in `config.js`
3. Update the MongoDB service to include the new source
4. Add commands for the new source in the command handler

### Customizing Output Format

The Discord embed format can be customized by editing the scraper modules. Each source has its own embed color and format settings.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

const { REST, Routes, SlashCommandBuilder } = require("discord.js");

async function registerSlashCommands() {
  const commands = [
    // General job command
    new SlashCommandBuilder()
      .setName("jobs")
      .setDescription("Get top 5 jobs from all sources")
      .addStringOption((opt) =>
        opt
          .setName("role")
          .setDescription("intern | new grad (default: intern)")
          .setRequired(false)
          .addChoices(
            { name: "intern", value: "intern" },
            { name: "new grad", value: "new grad" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setDescription("day | week | month (default: day)")
          .setRequired(false)
          .addChoices(
            { name: "day", value: "day" },
            { name: "week", value: "week" },
            { name: "month", value: "month" }
          )
      ),

    // LinkedIn command with time options only (lightweight for Discord)
    new SlashCommandBuilder()
      .setName("linkedin")
      .setDescription("Get latest LinkedIn jobs (5-10 jobs, lightweight)")
      .addStringOption((opt) =>
        opt
          .setName("role")
          .setDescription("intern | new grad (default: intern)")
          .setRequired(false)
          .addChoices(
            { name: "intern", value: "intern" },
            { name: "new grad", value: "new grad" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setDescription("Time filter for job search (default: day)")
          .setRequired(false)
          .addChoices(
            { name: "past 24 hours", value: "day" },
            { name: "past week", value: "week" },
            { name: "past month", value: "month" }
          )
      ),



    // ZipRecruiter command
    new SlashCommandBuilder()
      .setName("ziprecruiter")
      .setDescription("Run the ZipRecruiter scraper")
      .addStringOption((opt) =>
        opt
          .setName("role")
          .setDescription("intern | new grad (default: intern)")
          .setRequired(false)
          .addChoices(
            { name: "intern", value: "intern" },
            { name: "new grad", value: "new grad" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setDescription("day | week | month (default: day)")
          .setRequired(false)
          .addChoices(
            { name: "day", value: "day" },
            { name: "week", value: "week" },
            { name: "month", value: "month" }
          )
      ),



    // Jobright command
    new SlashCommandBuilder()
      .setName("jobright")
      .setDescription("Run the Jobright.ai scraper")
      .addStringOption((opt) =>
        opt
          .setName("role")
          .setDescription("intern | new grad (default: intern)")
          .setRequired(false)
          .addChoices(
            { name: "intern", value: "intern" },
            { name: "new grad", value: "new grad" }
          )
      ),





    // GitHub command
    new SlashCommandBuilder()
      .setName("github")
      .setDescription("Run the GitHub scraper")
      .addStringOption((opt) =>
        opt
          .setName("repo")
          .setDescription("Specific repository to scrape")
          .setRequired(false)
          .addChoices(
            { name: "SimplifyJobs-NewGrad", value: "newgrad" },
            { name: "SimplifyJobs-Summer2026", value: "summer2026" },
            { name: "Sharunkumar-OffSeason", value: "offseason" },
            { name: "QuantInternships2026", value: "quant" }
          )
      ),

    // Daily scraping command
    new SlashCommandBuilder()
      .setName("daily")
      .setDescription("Run daily comprehensive scraping of all sources")
      .addBooleanOption((opt) =>
        opt
          .setName("now")
          .setDescription("Run immediately (default: false)")
          .setRequired(false)
      ),

    // Status command
    new SlashCommandBuilder()
      .setName("status")
      .setDescription("Show job-cache statistics"),

    // Clear cache command
    new SlashCommandBuilder()
      .setName("clearcache")
      .setDescription("Clear job cache")
      .addStringOption((opt) =>
        opt
          .setName("source")
          .setDescription("Specific source to clear")
          .setRequired(false)
          .addChoices(
            { name: "LinkedIn", value: "linkedin" },
            { name: "ZipRecruiter", value: "ziprecruiter" },
            { name: "Jobright", value: "jobright" },
            { name: "GitHub", value: "github" },

            { name: "All", value: "all" }
          )
      ),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  try {
    // For testing, register per-guild (instant)
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Slash commands registered (guild scope).");
  } catch (err) {
    console.error("❌ Error registering slash commands", err);
  }
}

module.exports = { registerSlashCommands };

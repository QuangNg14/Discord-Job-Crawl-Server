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

    // LinkedIn command
    new SlashCommandBuilder()
      .setName("linkedin")
      .setDescription("Run the LinkedIn scraper")
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

    // SimplyHired command
    new SlashCommandBuilder()
      .setName("simplyhired")
      .setDescription("Run the SimplyHired scraper")
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

    // CareerJet command
    new SlashCommandBuilder()
      .setName("careerjet")
      .setDescription("Run the CareerJet scraper")
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

    // Glassdoor command
    new SlashCommandBuilder()
      .setName("glassdoor")
      .setDescription("Run the Glassdoor scraper")
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

    // Dice command
    new SlashCommandBuilder()
      .setName("dice")
      .setDescription("Run the Dice.com scraper")
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
          .setDescription("day | 3days | week | all (default: day)")
          .setRequired(false)
          .addChoices(
            { name: "day", value: "day" },
            { name: "3days", value: "threeDay" },
            { name: "week", value: "week" },
            { name: "all", value: "all" }
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
            { name: "SimplifyJobs", value: "simplify" },
            { name: "SimplifyJobs Off-Season", value: "offsimplify" },
            { name: "Vanshb03", value: "vans" },
            { name: "SpeedyApply", value: "speedy" }
          )
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
            { name: "SimplyHired", value: "simplyhired" },
            { name: "ZipRecruiter", value: "ziprecruiter" },
            { name: "CareerJet", value: "careerjet" },
            { name: "Jobright", value: "jobright" },
            { name: "Glassdoor", value: "glassdoor" },
            { name: "Dice", value: "dice" },
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

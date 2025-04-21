require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Client, GatewayIntentBits } = require("discord.js");
const mongoService = require("./services/mongo");
const loggerService = require("./services/logger");
const commandHandler = require("./services/commandHandler");
const config = require("./config");
const { registerSlashCommands } = require("./registerCommands");

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Discord client events
client.once("ready", async () => {
  loggerService.log(`Logged in as ${client.user.tag}`);

  const ok = await mongoService.connect();
  if (!ok)
    loggerService.log("Mongo failed, falling back to file cache", "error");

  await mongoService.loadCache();

  const channel = client.channels.cache.get(config.channelId);
  if (channel) {
    await channel.send(
      "🤖 Job Scraping Bot is online! Use `/help` or `!help` to see commands."
    );
  }
});

// Register slash commands
registerSlashCommands();

// Handle legacy commands
client.on("messageCreate", (msg) => {
  if (!msg.content.startsWith("!") || msg.author.bot) return;
  if (msg.channel.id !== config.channelId) return;
  const [cmd, ...args] = msg.content.slice(1).split(/\s+/);
  commandHandler.processCommand(cmd, msg, client);
});

// Handle slash commands
client.on("interactionCreate", (i) => {
  if (!i.isChatInputCommand()) return;
  commandHandler.handleSlash(i, client);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", message: "Bot is running" });
});

// Start the server
app.listen(port, () => {
  loggerService.log(`Server is running on port ${port}`);

  // Start Discord client
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    loggerService.log(`Login failed: ${err.message}`, "error");
    process.exit(1);
  });
});

// Handle graceful shutdown
process.on("SIGINT", async () => {
  loggerService.log("Shutting down...");
  await mongoService.close();
  await client.destroy();
  process.exit(0);
});

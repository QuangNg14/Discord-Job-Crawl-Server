// index.js
require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const mongoService = require("./services/mongo");
const loggerService = require("./services/logger");
const commandHandler = require("./services/commandHandler");
const config = require("./config");
const { registerSlashCommands } = require("./registerCommands");

// ── 1) Create Discord client ──────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ── 2) On ready: connect cache + announce ──────────
client.once("ready", async () => {
  loggerService.log(`Logged in as ${client.user.tag}`);

  const ok = await mongoService.connect();
  if (!ok)
    loggerService.log("Mongo failed, falling back to file cache", "error");

  await mongoService.loadCache();

  const channel = client.channels.cache.get(config.logChannelId);
  if (channel) {
    await channel.send(
      "🤖 Job Scraping Bot is online! Use `/help` or `!help` to see commands."
    );
  }
});

// ── 3) Slash‑commands & legacy “!” handler ──────────
registerSlashCommands();

client.on("messageCreate", (msg) => {
  if (!msg.content.startsWith("!") || msg.author.bot) return;
  
  // Check if message is in any allowed channel (log channel or job channels)
  const isAllowedChannel = msg.channel.id === config.logChannelId || 
    Object.values(config.channels.intern).includes(msg.channel.id) ||
    Object.values(config.channels.new_grad).includes(msg.channel.id);
    
  if (!isAllowedChannel) return;
  
  const [cmd, ...args] = msg.content.slice(1).split(/\s+/);
  commandHandler.processCommand(cmd, msg, client);
});

client.on("interactionCreate", (i) => {
  if (!i.isChatInputCommand()) return;
  commandHandler.handleSlash(i, client);
});

// ── 4) Robust login + shutdown ──────────
function start() {
  client.login(process.env.DISCORD_TOKEN).catch((err) => {
    loggerService.log(`Login failed: ${err.message}`, "error");
    setTimeout(start, 30_000);
  });
}

process.on("SIGINT", async () => {
  loggerService.log("Shutting down…");
  await mongoService.close();
  process.exit(0);
});

loggerService.log("Starting Discord bot…");
start();

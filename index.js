require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: ['CHANNEL'] // potrzebne, by bot widział DM
});

const allowedChannelId = '123456789012345678'; // <- Twój kanał
const webhook = process.env.N8N_WEBHOOK_URL;

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isDM = message.channel.type === ChannelType.DM;
  const isAllowedChannel = message.channel.id === allowedChannelId;

  if (!isDM && !isAllowedChannel) return;

  const response = await axios.post(webhook, {
    username: message.author.username,
    content: message.content,
    channelId: message.channel.id
  });

  if (response.data?.reply) {
    message.reply(response.data.reply);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);


// === package.json ===
// Użyj poniższego, jeśli tworzysz nowy projekt:

/*
{
  "name": "discord-n8n-bridge",
  "version": "1.0.0",
  "main": "index.js",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "discord.js": "^14.14.1"
  }
}
*/

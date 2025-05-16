require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');

// Token bota z Discord Developer Portal
// const DISCORD_BOT_TOKEN = 'MTMwMTE2ODQwMTA3MDE2MjA0Mg.GBcg6i.1926luSXWaroPJNusI3ycPv2CyZmem7EjY6_wM';

// Adres webhooka w n8n (typ POST)
// const N8N_WEBHOOK_URL = 'https://n8n.feniksfilm.pl/webhook/0893867c-6f54-4ae9-b38b-8f33ed7a4a83';

// Utworzenie klienta Discord z odpowiednimi "intents"
// const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
// const axios = require('axios');

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

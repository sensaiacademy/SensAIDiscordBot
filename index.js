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

const allowedChannelId = '1372927875224703027'; // <- Twój kanał
const webhook = process.env.N8N_WEBHOOK_URL;

client.on('messageCreate', async (message) => {
  console.log(`Otrzymano wiadomość od ${message.author.tag} w kanale typu ${message.channel.type}: "${message.content}", ID wiadomości: ${message.id}`);

  if (message.author.bot) {
    console.log("Wiadomość od bota, ignorowanie.");
    return;
  }

  const isDM = message.channel.type === ChannelType.DM;
  const isAllowedChannel = message.channel.id === allowedChannelId;
  console.log(`isDM: ${isDM}, isAllowedChannel: ${isAllowedChannel}`);

  if (!isDM && !isAllowedChannel) {
    console.log("Wiadomość nie jest DM ani nie jest z dozwolonego kanału, ignorowanie.");
    return;
  }

  const payload = {
    username: message.author.username,
    content: message.content,
    channelId: message.channel.id,
    messageId: message.id // Dodane ID wiadomości do payloadu
  };
  console.log("Przygotowano payload do wysłania do n8n:", payload);

  try {
    const response = await axios.post(webhook, payload);
    console.log("Odpowiedź z n8n:", response.status, response.data);

    if (response.data?.reply) {
      message.reply(response.data.reply);
      console.log("Wysłano odpowiedź do użytkownika:", response.data.reply);
    }
  } catch (error) {
    console.error("Błąd podczas wysyłania danych do n8n lub przetwarzania odpowiedzi:", error.response ? error.response.data : error.message);
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

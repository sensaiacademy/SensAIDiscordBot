require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType } = require('discord.js');
const axios = require('axios');
const http = require('http'); // Dodano moduł http

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

async function handlePrivateMessage(message) {
  console.log(`Rozpoczynam obsługę wiadomości prywatnej od ${message.author.tag} (ID: ${message.author.id}), treść: "${message.content}", ID wiadomości: ${message.id}`);
  const privateWebhookUrl = process.env.PRIVATE_WEBHOOK;

  if (!privateWebhookUrl) {
    console.error("Zmienna środowiskowa PRIVATE_WEBHOOK nie jest ustawiona. Bot nie może przetworzyć DM.");
    message.reply("Przepraszam, wystąpił problem z moją konfiguracją i nie mogę teraz przetworzyć Twojej wiadomości prywatnej.").catch(console.error);
    return;
  }

  const payload = {
    userId: message.author.id,
    username: message.author.username,
    messageId: message.id,
    content: message.content,
    timestamp: message.createdTimestamp // Dodatkowo, czas otrzymania wiadomości
  };

  console.log("Wysyłanie danych DM do PRIVATE_WEBHOOK:", payload);

  try {
    const response = await axios.post(privateWebhookUrl, payload);
    console.log(`Odpowiedź z PRIVATE_WEBHOOK: Status ${response.status}, Dane:`, response.data);

    // Załóżmy, że webhook odpowiada JSONem z polem 'reply', które zawiera tekst odpowiedzi
    if (response.data && typeof response.data.reply === 'string') {
      message.reply(response.data.reply).catch(console.error);
      console.log("Wysłano odpowiedź z PRIVATE_WEBHOOK do użytkownika:", response.data.reply);
    } else if (response.data) { // Jeśli jest odpowiedź, ale nie w oczekiwanym formacie
        console.log("PRIVATE_WEBHOOK odpowiedział, ale odpowiedź nie zawiera pola 'reply' typu string. Dane odpowiedzi:", response.data);
        // Możesz tu dodać domyślną odpowiedź lub nic nie robić
        // message.reply("Otrzymałem Twoją wiadomość, ale system nie dostarczył konkretnej odpowiedzi.").catch(console.error);
    } else {
        console.log("PRIVATE_WEBHOOK odpowiedział, ale bez danych (response.data jest puste).");
    }
  } catch (error) {
    console.error("Błąd podczas komunikacji z PRIVATE_WEBHOOK:", error.response ? error.response.data : error.message);
    message.reply("Przepraszam, napotkałem błąd podczas próby przetworzenia Twojej wiadomości.").catch(console.error);
  }
}

client.on('messageCreate', async (message) => {
  // Usuniemy część logów, które mogą być teraz nadmiarowe, zostawimy bardziej ogólne
  console.log(`Otrzymano wiadomość: "${message.content}" od ${message.author.tag} w kanale typu ${message.channel.type}, ID wiadomości: ${message.id}`);

  if (message.author.bot) {
    // console.log("Wiadomość od bota, ignorowanie."); // Można zostawić lub usunąć dla czystości logów
    return;
  }

  // Sprawdzenie, czy to DM - zaktualizowana metoda zgodnie z dokumentacją discord.js v14+
  const isDM = message.channel.isDMBased();
  
  // Dodatkowe logowanie do debugowania typu kanału - to było kluczowe, zostawmy na razie
  console.log(`Debug DM: message.channel.type=${message.channel.type}, ChannelType.DM=${ChannelType.DM}, Porównanie (isDMBased) = ${message.channel.isDMBased()}`);
  console.log(`isDM: ${isDM}`); // Zaktualizowany log dla isDM

  if (isDM) {
    await handlePrivateMessage(message);
  } else {
    // Logika dla wiadomości na kanałach serwera
    const isAllowedChannel = message.channel.id === allowedChannelId;
    console.log(`Wiadomość nie jest DM. isAllowedChannel: ${isAllowedChannel}`);

    if (isAllowedChannel) {
      const serverWebhookUrl = process.env.N8N_WEBHOOK_URL; // Przemianowałem dla jasności
      if (!serverWebhookUrl) {
        console.error("Zmienna środowiskowa N8N_WEBHOOK_URL (dla kanału serwera) nie jest ustawiona!");
        return; // Można też wysłać odpowiedź do użytkownika, jeśli to pożądane
      }
      const payload = {
        username: message.author.username,
        content: message.content,
        channelId: message.channel.id,
        messageId: message.id
      };
      console.log("Przygotowano payload (kanał serwera) do wysłania do N8N_WEBHOOK_URL:", payload);
      try {
        const response = await axios.post(serverWebhookUrl, payload);
        console.log("Odpowiedź z N8N_WEBHOOK_URL:", response.status, response.data);
        if (response.data?.reply) {
          message.reply(response.data.reply).catch(console.error);
          console.log("Wysłano odpowiedź z N8N_WEBHOOK_URL do użytkownika na kanale serwera:", response.data.reply);
        }
      } catch (error) {
        console.error("Błąd podczas wysyłania danych do N8N_WEBHOOK_URL lub przetwarzania odpowiedzi:", error.response ? error.response.data : error.message);
      }
    } else {
      // console.log("Wiadomość nie jest DM ani nie jest z dozwolonego kanału serwera, ignorowanie."); // Można zostawić lub usunąć
    }
  }
});

// Logowanie i obsługa zdarzeń klienta Discord
console.log("Próba zalogowania bota do Discorda...");
client.login(process.env.DISCORD_BOT_TOKEN)
  .then(() => {
    console.log("Logowanie do Discorda zakończone pomyślnie (then).");
  })
  .catch(error => {
    console.error("Błąd podczas client.login() (catch):", error);
  });

client.on('ready', (c) => {
  console.log(`Bot ${c.user.tag} jest gotowy i zalogowany!`);
  console.log(`Bot jest na ${c.guilds.cache.size} serwerach.`);
});

client.on('error', (error) => {
  console.error('Wystąpił błąd klienta Discord.js:', error);
});

// Prosty serwer HTTP dla health checks na Railway
const port = process.env.PORT || 3000; // Użyj portu z Railway lub domyślnego 3000
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord bot is active.\n');
}).listen(port, () => {
  console.log(`Minimal HTTP server for health checks listening on port ${port}`);
});

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

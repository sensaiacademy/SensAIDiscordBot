require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType, Partials } = require('discord.js');
const axios = require('axios');
const http = require('http'); // Dodano moduł http
const OpenAI = require('openai'); // Import biblioteki OpenAI

// Konfiguracja klienta OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY,
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const allowedChannelId = '1372927875224703027'; // <- Twój kanał

// Proste przechowywanie wątków w pamięci (UserId -> ThreadId)
const userThreads = {};

async function getOrCreateThreadId(userId) {
  if (userThreads[userId]) {
    console.log(`Znaleziono istniejący wątek dla użytkownika ${userId}: ${userThreads[userId]}`);
    return userThreads[userId];
  }
  try {
    console.log(`Tworzenie nowego wątku dla użytkownika ${userId}...`);
    const thread = await openai.beta.threads.create();
    userThreads[userId] = thread.id;
    console.log(`Stworzono nowy wątek ${thread.id} dla użytkownika ${userId}`);
    return thread.id;
  } catch (error) {
    console.error("Błąd podczas tworzenia wątku OpenAI:", error);
    return null;
  }
}

async function handlePrivateMessage(message) {
  console.log(`Rozpoczynam obsługę wiadomości prywatnej od ${message.author.tag} (ID: ${message.author.id}), treść: "${message.content}", ID wiadomości: ${message.id}`);
  
  const assistantId = process.env.OPENAI_ASSISTANT_ID;
  if (!assistantId) {
    console.error("Zmienna środowiskowa OPENAI_ASSISTANT_ID nie jest ustawiona!");
    message.reply("Przepraszam, wystąpił problem z moją konfiguracją (brak ID Asystenta) i nie mogę teraz przetworzyć Twojej wiadomości.").catch(console.error);
    return;
  }

  if (!process.env.OPENAI_KEY) {
    console.error("Zmienna środowiskowa OPENAI_KEY nie jest ustawiona!");
     message.reply("Przepraszam, wystąpił problem z moją konfiguracją (brak klucza API OpenAI) i nie mogę teraz przetworzyć Twojej wiadomości.").catch(console.error);
    return;
  }

  const threadId = await getOrCreateThreadId(message.author.id);
  if (!threadId) {
    message.reply("Przepraszam, nie udało mi się utworzyć lub pobrać wątku konwersacji. Spróbuj ponownie później.").catch(console.error);
    return;
  }

  try {
    // Krok 3: Dodaj wiadomość do wątku
    console.log(`Dodawanie wiadomości do wątku ${threadId}: "${message.content}"`);
    await openai.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content: message.content
      }
    );

    // Krok 4: Uruchom Asystenta na wątku (użyjemy createAndPoll dla uproszczenia)
    console.log(`Uruchamianie Asystenta ${assistantId} na wątku ${threadId}...`);
    // Pokaż użytkownikowi, że bot "pisze"
    await message.channel.sendTyping();

    const run = await openai.beta.threads.runs.createAndPoll(
      threadId,
      {
        assistant_id: assistantId,
        // Możesz dodać instrukcje specyficzne dla tego uruchomienia, jeśli potrzebujesz
        // instructions: "Odpowiedz zwięźle."
      }
    );

    console.log(`Status uruchomienia Asystenta: ${run.status}`);

    if (run.status === 'completed') {
      const messagesFromThread = await openai.beta.threads.messages.list(
        run.thread_id
      );
      // Odpowiedzi Asystenta są dodawane do wątku. Interesuje nas najnowsza odpowiedź roli 'assistant'.
      const lastAssistantMessage = messagesFromThread.data
        .filter(msg => msg.run_id === run.id && msg.role === 'assistant')
        .pop(); // Weź ostatnią wiadomość asystenta z tego uruchomienia

      if (lastAssistantMessage && lastAssistantMessage.content[0].type === 'text') {
        const assistantReply = lastAssistantMessage.content[0].text.value;
        console.log("Otrzymano odpowiedź od Asystenta:", assistantReply);
        message.reply(assistantReply).catch(console.error);
      } else {
        console.log("Asystent zakończył pracę, ale nie znaleziono odpowiedniej wiadomości tekstowej w odpowiedzi.", messagesFromThread.data);
        message.reply("Przepraszam, Asystent przetworzył Twoją wiadomość, ale nie otrzymałem od niego odpowiedzi w oczekiwanym formacie.").catch(console.error);
      }
    } else {
      console.log(`Uruchomienie Asystenta nie zakończyło się sukcesem. Status: ${run.status}`);
      message.reply(`Przepraszam, wystąpił problem podczas przetwarzania Twojej wiadomości przez Asystenta. Status: ${run.status}`).catch(console.error);
    }
  } catch (error) {
    console.error("Błąd podczas interakcji z OpenAI Assistants API:", error);
    message.reply("Przepraszam, napotkałem błąd podczas próby komunikacji z Asystentem OpenAI.").catch(console.error);
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

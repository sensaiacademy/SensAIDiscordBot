require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType, Partials } = require('discord.js');
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

const mainChannelId = '1372927875224703027'; // Główny kanał
const mentionableChannelIds = [ // Kanały, na których bot reaguje na wzmianki
  '1352756956116553739',
  '1370809893463920770',
  '1370809961717960945',
  '1373623852097077300',
  '1373623969516884018',
  '1296112651419648130'
];

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

async function processMessageWithOpenAI(message, addReaction = false) {
  console.log(`Rozpoczynam obsługę wiadomości przez OpenAI: "${message.content}" od ${message.author.tag} (ID: ${message.author.id}), ID wiadomości: ${message.id}, Kanał ID: ${message.channel.id}`);
  
  if (addReaction) {
    try {
      await message.react('👋');
      console.log("Dodano reakcję 👋 do wiadomości.");
    } catch (reactError) {
      console.error("Nie udało się dodać reakcji:", reactError);
    }
  }
  
  try {
    await message.channel.sendTyping();
  } catch (typingError) {
      console.warn("Nie udało się wysłać 'sendTyping':", typingError.message);
  }

  let assistantId = process.env.OPENAI_ASSISTANT_ID;
  if (!assistantId) {
    console.warn("OSTRZEŻENIE: Zmienna środowiskowa OPENAI_ASSISTANT_ID nie jest ustawiona! Używam domyślnego ID: asst_44ZepLF27M4Uwc16ys5NahAN");
    assistantId = 'asst_44ZepLF27M4Uwc16ys5NahAN';
  }

  if (!process.env.OPENAI_KEY) {
    console.error("Zmienna środowiskowa OPENAI_KEY nie jest ustawiona!");
    message.reply("Przepraszam, wystąpił problem z moją konfiguracją (brak klucza API OpenAI) i nie mogę teraz przetworzyć Twojej wiadomości.").catch(console.error);
    return;
  }

  const threadId = await getOrCreateThreadId(message.author.id);
  if (!threadId) {
    message.reply("Przepraszam, nie udało mi się utworzyć lub pobrać wątku konwersacji dla Ciebie. Spróbuj ponownie później.").catch(console.error);
    return;
  }

  try {
    console.log(`Dodawanie wiadomości do wątku ${threadId}: "${message.content}"`);
    await openai.beta.threads.messages.create(
      threadId,
      { role: "user", content: message.content }
    );

    console.log(`Uruchamianie Asystenta ${assistantId} na wątku ${threadId}...`);
    const run = await openai.beta.threads.runs.createAndPoll(
      threadId,
      { assistant_id: assistantId }
    );

    console.log(`Status uruchomienia Asystenta: ${run.status}`);
    if (run.status === 'completed') {
      const messagesFromThread = await openai.beta.threads.messages.list(run.thread_id);
      const lastAssistantMessage = messagesFromThread.data
        .filter(msg => msg.run_id === run.id && msg.role === 'assistant')
        .pop();

      if (lastAssistantMessage && lastAssistantMessage.content[0]?.type === 'text') {
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
  if (message.author.bot) return;

  console.log(`Otrzymano wiadomość: "${message.content}" od ${message.author.tag} w kanale ${message.channel.id} typu ${message.channel.type}, ID wiadomości: ${message.id}`);

  const isDM = message.channel.isDMBased();
  const mentionedBot = message.mentions.has(client.user.id);
  
  console.log(`isDM: ${isDM}, mentionedBot: ${mentionedBot}`);

  if (isDM) {
    console.log("Wiadomość jest DM. Przetwarzanie przez OpenAI...");
    await processMessageWithOpenAI(message);
  } else if (message.channel.id === mainChannelId) {
    console.log(`Wiadomość na głównym kanale (${mainChannelId}). Przetwarzanie przez OpenAI z reakcją...`);
    await processMessageWithOpenAI(message, true);
  } else if (mentionableChannelIds.includes(message.channel.id) && mentionedBot) {
    console.log(`Bot oznaczony na dozwolonym kanale (${message.channel.id}). Przetwarzanie przez OpenAI...`);
    await processMessageWithOpenAI(message);
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

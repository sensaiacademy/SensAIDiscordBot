require('dotenv').config();
// === index.js ===

const { Client, GatewayIntentBits, ChannelType, Partials } = require('discord.js');
const axios = require('axios'); // Przywrócono axios
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

const mainChannelId = '1372927875224703027'; // Główny kanał dla N8N
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
    console.log(`Znaleziono istniejący wątek OpenAI dla użytkownika ${userId}: ${userThreads[userId]}`);
    return userThreads[userId];
  }
  try {
    console.log(`Tworzenie nowego wątku OpenAI dla użytkownika ${userId}...`);
    const thread = await openai.beta.threads.create();
    userThreads[userId] = thread.id;
    console.log(`Stworzono nowy wątek OpenAI ${thread.id} dla użytkownika ${userId}`);
    return thread.id;
  } catch (error) {
    console.error("Błąd podczas tworzenia wątku OpenAI:", error);
    return null;
  }
}

// Funkcja do obsługi wiadomości przez OpenAI (TYLKO dla wzmianek na określonych kanałach)
async function processMessageWithOpenAI(message) {
  console.log(`Rozpoczynam obsługę wiadomości przez OpenAI: "${message.content}" od ${message.author.tag}, ID użytkownika: ${message.author.id}`);
  
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
    message.reply("Przepraszam, ale wystąpił problem z moją konfiguracją i nie mogę teraz przetworzyć Twojej wiadomości (brak klucza API OpenAI).").catch(console.error);
    return;
  }

  const threadId = await getOrCreateThreadId(message.author.id);
  if (!threadId) {
    message.reply("Przepraszam, ale nie udało mi się przygotować wątku konwersacji z Asystentem OpenAI. Spróbuj ponownie później.").catch(console.error);
    return;
  }

  try {
    const userMessageWithPrompt = `Poniżej znajdziesz wiadomość od użytkownika na którą masz odpowiedzieć. Jeśli odnosisz się do plików, spróbuj dodać do nich link w swojej odpowiedzi. W swojej odpowiedzi nie nawiązuj do tego, że dałem Ci takie polecenie.\n\n### Wiadomość:\n${message.content}`;
    
    console.log(`Dodawanie sformatowanej wiadomości do wątku OpenAI ${threadId}: "${userMessageWithPrompt.substring(0, 100)}..."`);
    await openai.beta.threads.messages.create(threadId, { role: "user", content: userMessageWithPrompt });

    console.log(`Uruchamianie Asystenta OpenAI ${assistantId} na wątku ${threadId}`);
    const run = await openai.beta.threads.runs.createAndPoll(threadId, { assistant_id: assistantId });

    console.log(`Status uruchomienia Asystenta OpenAI: ${run.status}`);
    if (run.status === 'completed') {
      const messagesFromThread = await openai.beta.threads.messages.list(run.thread_id);
      const lastAssistantMessage = messagesFromThread.data.filter(msg => msg.run_id === run.id && msg.role === 'assistant').pop();
      if (lastAssistantMessage?.content[0]?.type === 'text') {
        const assistantReply = lastAssistantMessage.content[0].text.value;
        console.log("Otrzymano odpowiedź od Asystenta OpenAI:", assistantReply.substring(0,100) + "...");
        message.reply(assistantReply).catch(console.error);
      } else {
        console.log("Asystent OpenAI zakończył pracę, ale nie znaleziono odpowiedniej wiadomości tekstowej.", messagesFromThread.data);
        message.reply("Przepraszam, Asystent OpenAI przetworzył Twoją wiadomość, ale nie otrzymałem od niego odpowiedzi w oczekiwanym formacie.").catch(console.error);
      }
    } else {
      console.log(`Uruchomienie Asystenta OpenAI nie zakończyło się sukcesem. Status: ${run.status}`);
      message.reply(`Przepraszam, wystąpił problem podczas przetwarzania Twojej wiadomości przez Asystenta OpenAI. Status: ${run.status}`).catch(console.error);
    }
  } catch (error) {
    console.error("Błąd podczas interakcji z OpenAI Assistants API:", error);
    message.reply("Przepraszam, napotkałem błąd podczas próby komunikacji z Asystentem OpenAI.").catch(console.error);
  }
}

// NOWA FUNKCJA do obsługi DM przez Webhook
async function handleDMWithWebhook(message) {
  console.log(`Rozpoczynam obsługę wiadomości prywatnej (DM) przez Webhook: "${message.content.substring(0,50)}..." od ${message.author.tag}`);

  const privateWebhookUrl = process.env.PRIVATE_WEBHOOK;
  const webhookKey = process.env.WEBHOOK_KEY;

  if (!privateWebhookUrl) {
    console.error("Zmienna środowiskowa PRIVATE_WEBHOOK nie jest ustawiona!");
    message.reply("Przepraszam, wystąpił problem z moją konfiguracją (brak URL webhooka dla DM).").catch(console.error);
    return;
  }
  if (!webhookKey) {
    console.error("Zmienna środowiskowa WEBHOOK_KEY nie jest ustawiona!");
    message.reply("Przepraszam, wystąpił problem z moją konfiguracją (brak klucza autoryzacyjnego dla webhooka DM).").catch(console.error);
    return;
  }

  try {
    await message.channel.sendTyping();
  } catch (typingError) {
    console.warn("Nie udało się wysłać 'sendTyping' dla DM:", typingError.message);
  }

  const payload = {
    userId: message.author.id,
    username: message.author.username,
    messageId: message.id,
    content: message.content,
    timestamp: message.createdTimestamp
  };

  console.log("Wysyłanie danych DM do PRIVATE_WEBHOOK:", payload);

  try {
    const response = await axios.post(privateWebhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Key': webhookKey // Dodanie niestandardowego nagłówka autoryzacyjnego
      }
    });
    
    console.log(`Odpowiedź z PRIVATE_WEBHOOK: Status ${response.status}, Dane:`, response.data);
    const replyText = response.data?.reply || response.data?.output;

    if (replyText && typeof replyText === 'string') {
      message.reply(replyText).catch(console.error);
      console.log("Wysłano odpowiedź z PRIVATE_WEBHOOK do użytkownika (DM):", replyText.substring(0,100) + "...");
    } else if (response.data) {
      console.log("Odpowiedź z PRIVATE_WEBHOOK (DM) nie zawierała tekstu w polu 'reply' ani 'output'.");
    } else {
       console.log("PRIVATE_WEBHOOK (DM) odpowiedział, ale bez danych (response.data jest puste).");
    }
  } catch (error) {
    console.error("Błąd podczas komunikacji z PRIVATE_WEBHOOK (DM):", error.response ? error.response.data : error.message);
    message.reply("Przepraszam, napotkałem błąd podczas próby przetworzenia Twojej wiadomości prywatnej.").catch(console.error);
  }
}

// Zaktualizowany główny handler wiadomości
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  console.log(`Otrzymano wiadomość: "${message.content.substring(0,50)}..." od ${message.author.tag} w kanale ${message.channel.id}`);

  const isDM = message.channel.isDMBased();
  const mentionedBot = message.mentions.has(client.user.id);

  if (isDM) {
    console.log("Wiadomość jest DM. Przetwarzanie przez Webhook...");
    await handleDMWithWebhook(message); // ZMIANA: Wywołanie nowej funkcji dla DM
  } else if (message.channel.id === mainChannelId) {
    console.log(`Wiadomość na głównym kanale (${mainChannelId}). Przetwarzanie przez N8N Webhook...`);
    
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error("Zmienna środowiskowa N8N_WEBHOOK_URL nie jest ustawiona!");
      message.reply("Przepraszam, wystąpił problem z konfiguracją webhooka N8N.").catch(console.error);
      return;
    }
    const payload = {
      username: message.author.username,
      content: message.content,
      channelId: message.channel.id,
      messageId: message.id,
      userId: message.author.id
    };
    console.log("Wysyłanie danych do N8N_WEBHOOK_URL:", payload);
    try {
      const response = await axios.post(n8nWebhookUrl, payload);
      console.log("Odpowiedź z N8N_WEBHOOK_URL: Status", response.status, ", Dane:", response.data);
      const replyText = response.data?.reply || response.data?.output;
      if (replyText && typeof replyText === 'string') {
        message.reply(replyText).catch(console.error);
        console.log("Wysłano odpowiedź z N8N do użytkownika:", replyText.substring(0,100) + "...");
      } else if (response.data) {
        console.log("Odpowiedź z N8N nie zawierała tekstu w polu 'reply' ani 'output'.");
      }
    } catch (error) {
      console.error("Błąd podczas wysyłania danych do N8N_WEBHOOK_URL:", error.response ? error.response.data : error.message);
      message.reply("Przepraszam, wystąpił błąd podczas komunikacji z serwisem N8N.").catch(console.error);
    }
  } else if (mentionableChannelIds.includes(message.channel.id) && mentionedBot) {
    console.log(`Bot oznaczony na kanale (${message.channel.id}). Przetwarzanie przez OpenAI...`);
    await processMessageWithOpenAI(message); // Ta funkcja jest teraz tylko dla wzmianek
  } else {
    console.log(`Wiadomość ("${message.content.substring(0,50)}...") nie pasuje do żadnej logiki przetwarzania.`);
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
  console.log(`Bot ${c.user.tag} (ID: ${c.user.id}) jest gotowy i zalogowany!`);
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

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL = "https://api.datasportsapi.com/v2/livescores";

if (!BOT_TOKEN || !API_KEY || !CHANNEL_ID) {
  console.error("Missing environment variables!");
  process.exit(1);
}

const previousScores = new Map();

async function sendTelegram(message) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHANNEL_ID,
        text: message,
        parse_mode: "HTML"
      }
    );

    console.log("TELEGRAM SUCCESS:", response.data.ok);
    return true;

  } catch (error) {
    console.error(
      "TELEGRAM ERROR:",
      error.response?.data || error.message
    );
    return false;
  }
}

async function testTelegram() {
  await sendTelegram(
    "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
    "✅ Bot is online!\n" +
    "⚽ New football monitoring system is starting!\n\n" +
    "🇪🇹 Afaan Oromoo: Botichi hojii jalqabeera!\n" +
    "🇪🇹 አማርኛ: ቦቱ ሥራ ጀምሯል!\n" +
    "🇬🇧 English: The bot is now running!"
  );
}

async function checkFootball() {
  try {
    console.log("Checking football live scores...");

    const response = await axios.get(API_URL, {
      params: { sport: "football" },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      },
      timeout: 20000
    });

    const matches = response.data.data || [];

    console.log("Live football matches:", matches.length);

    for (const match of matches) {
      const id = match.id;

      const home = match.home?.name || "Home";
      const away = match.away?.name || "Away";

      const homeGoals = match.homeScore?.current ?? 0;
      const awayGoals = match.awayScore?.current ?? 0;

      const score = `${homeGoals}-${awayGoals}`;
      const oldScore = previousScores.get(id);

      if (oldScore === undefined) {
        previousScores.set(id, score);
        continue;
      }

      if (oldScore !== score) {
        previousScores.set(id, score);

        const minute =
          match.status?.description || "Live";

        const league =
          match.league?.name || "Football";

        const message =
          `🚨 <b>GOOLII GALAME! ⚽🔥</b>\n\n` +

          `🇪🇹 <b>AFAAN OROMOO</b>\n` +
          `Gooliin galame!\n\n` +

          `🇪🇹 <b>አማርኛ</b>\n` +
          `ጎል ተቆጠረ!\n\n` +

          `🇬🇧 <b>ENGLISH</b>\n` +
          `GOAL! A goal has been scored!\n\n` +

          `🏆 <b>${home} vs ${away}</b>\n` +
          `⚽ <b>${home} ${homeGoals} - ${awayGoals} ${away}</b>\n\n` +

          `⏱️ ${minute}\n` +
          `🌍 ${league}\n\n` +

          `📢 <b>KALID FOOTBALL GOAL ALERT</b>`;

        await sendTelegram(message);
      }
    }

  } catch (error) {
    console.error(
      "DATASPORTS API ERROR:",
      error.response?.data || error.message
    );
  }
}

app.get("/", (req, res) => {
  res.send("Kalid Football Goal Alert is running! ⚽");
});

app.listen(PORT, async () => {
  console.log("Kalid Football Goal Alert started!");

  await testTelegram();
  await checkFootball
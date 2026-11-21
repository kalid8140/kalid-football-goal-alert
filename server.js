const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.FOOTBALL_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL = "https://v3.football.api-sports.io";

if (!BOT_TOKEN || !API_KEY || !CHANNEL_ID) {
  console.error("ERROR: Environment variables missing!");
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
      },
      { timeout: 15000 }
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

// Test Telegram connection
async function testTelegram() {
  console.log("Testing Telegram connection...");

  const success = await sendTelegram(
    "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
    "✅ Bot is online!\n" +
    "⚽ Football live monitoring is starting.\n\n" +
    "🌍 Welcome to Kalid Football Updates!"
  );

  if (success) {
    console.log("Telegram connection verified!");
  } else {
    console.log("Telegram connection failed!");
  }
}

// Check live football
async function checkFootball() {
  try {
    console.log("Checking live matches...");

    const response = await axios.get(
      `${API_URL}/fixtures`,
      {
        params: { live: "all" },
        headers: {
          "x-apisports-key": API_KEY
        },
        timeout: 20000
      }
    );

    if (response.data.errors &&
        Object.keys(response.data.errors).length > 0) {
      console.error("API ERRORS:", response.data.errors);
      return;
    }

    const matches = response.data.response || [];

    console.log("Live matches found:", matches.length);

    for (const match of matches) {
      const id = match.fixture.id;

      const home = match.teams.home;
      const away = match.teams.away;

      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;

      const score = `${homeGoals}-${awayGoals}`;

      const oldScore = previousScores.get(id);

      if (oldScore === undefined) {
        previousScores.set(id, score);
        continue;
      }

      if (oldScore !== score) {
        previousScores.set(id, score);

        const message =
          `🚨 <b>GOAL ALERT!</b> ⚽🚨\n\n` +
          `🏆 ${home.name} vs ${away.name}\n\n` +
          `⚽ <b>${home.name}</b> ${homeGoals} - ${awayGoals} <b>${away.name}</b>\n\n` +
          `⏱️ Minute: ${match.fixture.status.elapsed ?? "N/A"}'\n` +
          `🌍 League: ${match.league.name}\n\n` +
          `🔥 <b>KALID FOOTBALL GOAL ALERT</b>`;

        await sendTelegram(message);
      }
    }

  } catch (error) {
    console.error(
      "FOOTBALL API ERROR:",
      error.response?.data || error.message
    );
  }
}

// Website health check
app.get("/", (req, res) => {
  res.send("Kalid Football Goal Alert is running! ⚽");
});

// Start server
app.listen(PORT, async () => {
  console.log("Kalid Football Goal Alert started!");

  await testTelegram();
  await checkFootball();

  // Check every 15 minutes
  setInterval(checkFootball, 15 * 60 * 1000);
});
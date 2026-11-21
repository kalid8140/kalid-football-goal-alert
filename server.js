const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.FOOTBALL_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL = "https://v3.football.api-sports.io";

// Check configuration
if (!BOT_TOKEN || !API_KEY || !CHANNEL_ID) {
  console.error("Missing environment variables!");
  process.exit(1);
}

// Store previously seen scores
const previousScores = new Map();

async function sendTelegram(message) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHANNEL_ID,
        text: message,
        parse_mode: "HTML"
      }
    );

    console.log("Telegram message sent!");
  } catch (error) {
    console.error(
      "Telegram error:",
      error.response?.data || error.message
    );
  }
}

// Check live football matches
async function checkFootball() {
  try {
    console.log("Checking live football matches...");

    const response = await axios.get(
      `${API_URL}/fixtures`,
      {
        params: {
          live: "all"
        },
        headers: {
          "x-apisports-key": API_KEY
        },
        timeout: 20000
      }
    );

    const matches = response.data.response || [];

    console.log("Live matches:", matches.length);

    for (const match of matches) {
      const id = match.fixture.id;

      const home = match.teams.home;
      const away = match.teams.away;

      const homeGoals = match.goals.home ?? 0;
      const awayGoals = match.goals.away ?? 0;

      const score = `${homeGoals}-${awayGoals}`;

      const oldScore = previousScores.get(id);

      // First time seeing this match
      if (oldScore === undefined) {
        previousScores.set(id, score);
        continue;
      }

      // Goal detected
      if (oldScore !== score) {
        previousScores.set(id, score);

        const message =
          `🚨 <b>GOAL ALERT!</b> ⚽\n\n` +
          `🏆 ${home.name} vs ${away.name}\n\n` +
          `🔴 <b>${home.name}</b> ${homeGoals} - ${awayGoals} <b>${away.name}</b>\n\n` +
          `⏱️ Minute: ${match.fixture.status.elapsed ?? "N/A"}'\n` +
          `🌍 League: ${match.league.name}\n\n` +
          `📢 <b>KALID FOOTBALL GOAL ALERT</b>`;

        await sendTelegram(message);
      }
    }

  } catch (error) {
    console.error(
      "Football API error:",
      error.response?.data || error.message
    );
  }
}

// Health check
app.get("/", (req, res) => {
  res.send("Kalid Football Goal Alert is running!");
});

// Start server
app.listen(PORT, () => {
  console.log("Kalid Football Goal Alert started!");

  checkFootball();

  // Check every 15 minutes
  setInterval(checkFootball, 15 * 60 * 1000);
});
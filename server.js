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
  console.error("ERROR: Environment variables are missing!");
  process.exit(1);
}

const previousScores = new Map();

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

async function sendTelegram(message) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHANNEL_ID,
        text: message,
        parse_mode: "HTML"
      },
      { timeout: 20000 }
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
  const message =
    "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
    "🇪🇹 <b>Afaan Oromoo:</b> Botichi hojii jalqabeera!\n\n" +
    "🇪🇹 <b>አማርኛ:</b> ቦቱ ሥራ ጀምሯል!\n\n" +
    "🇬🇧 <b>English:</b> The bot is now running!\n\n" +
    "⚽ Football monitoring is starting!";

  await sendTelegram(message);
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

    const matches = response.data?.data;

    if (!Array.isArray(matches)) {
      console.error("Unexpected API response:", response.data);
      return;
    }

    console.log("Live football matches:", matches.length);

    for (const match of matches) {
      const id = match.id;

      if (id === undefined || id === null) {
        continue;
      }

      const home = match.home?.name || "Home";
      const away = match.away?.name || "Away";

      const homeGoals = match.homeScore?.current ?? 0;
      const awayGoals = match.awayScore?.current ?? 0;

      const score = `${homeGoals}-${awayGoals}`;
      const oldScore = previousScores.get(id);

      // Tapha yeroo jalqabaaf argame galmeessi.
      if (oldScore === undefined) {
        previousScores.set(id, score);
        continue;
      }

      // Score yoo jijjiirame goal alert ergi.
      if (oldScore !== score) {
        previousScores.set(id, score);

        const safeHome = escapeHTML(home);
        const safeAway = escapeHTML(away);

        const minute = escapeHTML(
          match.status?.description || "Live"
        );

        const league = escapeHTML(
          match.league?.name || "Football"
        );

        const message =
          "🚨 <b>GOOLII GALAME! ⚽🔥</b>\n\n" +

          "🇪🇹 <b>AFAAN OROMOO</b>\n" +
          "Gooliin galame!\n\n" +

          "🇪🇹 <b>አማርኛ</b>\n" +
          "ጎል ተቆጠረ!\n\n" +

          "🇬🇧 <b>ENGLISH</b>\n" +
          "GOAL! A goal has been scored!\n\n" +

          `🏆 <b>${safeHome} vs ${safeAway}</b>\n` +
          `⚽ <b>${safeHome} ${homeGoals} - ${awayGoals} ${safeAway}</b>\n\n` +

          `⏱️ ${minute}\n` +
          `🌍 ${league}\n\n` +

          "📢 <b>KALID FOOTBALL GOAL ALERT</b>";

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

app
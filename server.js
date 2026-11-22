const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL = "https://api.datasportsapi.com/v2/livescores";

const MAJOR_LEAGUES = [
  "premier league",
  "la liga",
  "laliga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "champions league",
  "europa league",
  "conference league",
  "eredivisie",
  "primeira liga",
  "saudi pro league"
];

if (!BOT_TOKEN || !API_KEY || !CHANNEL_ID) {
  console.error("DOGOGGORA: Environment Variables dhabuu danda'u.");

  if (!BOT_TOKEN) console.error("TELEGRAM_BOT_TOKEN hin jiru.");
  if (!API_KEY) console.error("DATASPORTSAPI_API_KEY hin jiru.");
  if (!CHANNEL_ID) console.error("CHANNEL_ID hin jiru.");

  process.exit(1);
}

const previousScores = new Map();

let checking = false;

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function isMajorLeague(match) {
  const league = (match.league?.name || "").toLowerCase();

  return MAJOR_LEAGUES.some(name =>
    league.includes(name)
  );
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
    "✅ Botichi hojii jalqabeera!\n\n" +
    "⚽ Liigota gurguddoo addunyaa hordofaa jira.\n\n" +
    "📢 Gooliin yeroo galamu as irratti beeksifama!";

  await sendTelegram(message);
}

async function checkFootball() {
  if (checking) {
    console.log("Qorannoon taphaa duraan gaggeeffamaa jira.");
    return;
  }

  checking = true;

  try {
    console.log("Taphoota kubbaa miilaa qorachaa jira...");

    const response = await axios.get(API_URL, {
      params: {
        sport: "football"
      },
      headers: {
        Authorization: `Bearer ${API_KEY}`
      },
      timeout: 20000
    });

    const matches = response.data?.data;

    if (!Array.isArray(matches)) {
      console.error("Deebiin API sirrii miti.");
      return;
    }

    const majorMatches = matches.filter(isMajorLeague);

    console.log("Taphoota live waliigalaa:", matches.length);
    console.log("Taphoota liigota gurguddoo:", majorMatches.length);

    for (const match of majorMatches) {
      const id = match.id;

      if (id === undefined || id === null) {
        continue;
      }

      const home = match.home?.name || "Garee manaa";
      const away = match.away?.name || "Garee keessummaa";

      const homeGoals = Number(match.homeScore?.current ?? 0);
      const awayGoals = Number(match.awayScore?.current ?? 0);

      const oldScore = previousScores.get(id);

      const currentScore = {
        home: homeGoals,
        away: awayGoals
      };

      // Tapha yeroo jalqabaaf argame galmeessi.
      if (oldScore === undefined) {
        previousScores.set(id, currentScore);
        continue;
      }

      // Gooliin haaraan yoo galame beeksisi.
      const goalScored =
        homeGoals > oldScore.home ||
        awayGoals > oldScore.away;

      previousScores.set(id, currentScore);

      if (goalScored) {
        const league = escapeHTML(
          match.league?.name || "Liigii"
        );

        const minute = escapeHTML(
          match.status?.description || "Tapha keessa"
        );

        const safeHome = escapeHTML(home);
        const safeAway = escapeHTML(away);

        const message =
          "🚨 <b>GOOLII GALAME! ⚽🔥</b>\n\n" +

          "🏆 <b>Liigii:</b> " + league + "\n\n" +

          "⚽ <b>" + safeHome + "</b>\n" +
          "🔢 " + homeGoals + " - " + awayGoals + "\n" +
          "⚽ <b>" + safeAway + "</b>\n\n" +

          "⏱️ <b>Yeroo:</b> " + minute + "\n\n" +

          "🇪🇹 Gooliin haaraan galameera!\n\n" +

          "📢 <b>KALID FOOTBALL GOAL ALERT</b>";

        await sendTelegram(message);

        console.log("GOAL ALERT:", home, homeGoals, "-", awayGoals, away);
      }
    }

  } catch (error) {
    console.error(
      "DOGOGGORA API:",
      error.response?.data || error.message
    );

  } finally {
    checking = false;
  }
}

app.get("/", (req, res) => {
  res.send("KALID FOOTBALL GOAL ALERT IS RUNNING! ⚽");
});

app.listen(PORT, () => {
  console.log("KALID FOOTBALL GOAL ALERT STARTED!");

  async function startBot() {
    await testTelegram();

    await checkFootball();

    setInterval(() => {
      checkFootball();
    }, 4 * 60 * 1000);

    console.log("Hordoffiin taphoota jalqabameera!");
  }

  startBot().catch(error => {
    console.error("BOT START ERROR:", error.message);
  });
});
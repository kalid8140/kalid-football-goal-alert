const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;
const CHANNEL_ID = process.env.CHANNEL_ID;

const API_URL = "https://api.datasportsapi.com/v2/livescores";

const FIVE_MINUTES = 5 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;

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
let initialized = false;
let lastWorldwideCheck = 0;

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
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      { timeout: 20000 }
    );

    console.log("TELEGRAM SUCCESS:", response.data.ok);

    return response.data.ok === true;

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
    "🏆 Liigota gurguddoo: daqiiqaa 5 hunda.\n" +
    "🌍 Taphoota addunyaa: daqiiqaa 20 hunda.\n\n" +
    "⚽ Gooliin yeroo galamu as irratti beeksifama!\n\n" +
    "📢 @KalidFootball";

  await sendTelegram(message);
}

function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

function getMatchMinute(match) {
  return (
    match.status?.minute ??
    match.minute ??
    match.time?.minute ??
    match.status?.description ??
    "Yeroo taphaa"
  );
}

function createGoalMessage(match, score) {
  const league = escapeHTML(
    match.league?.name || "Liigii"
  );

  const home = escapeHTML(
    match.home?.name || "Garee manaa"
  );

  const away = escapeHTML(
    match.away?.name || "Garee keessummaa"
  );

  const minute = escapeHTML(getMatchMinute(match));

  return (
    "🚨 <b>GOOLII GALAME! ⚽🔥</b>\n\n" +

    "🏆 <b>Liigii:</b> " + league + "\n" +

    "━━━━━━━━━━━━━━\n" +

    "⚽ <b>" + home + "</b>\n" +
    "🥅 <b>" + score.home + " - " + score.away + "</b>\n" +
    "⚽ <b>" + away + "</b>\n\n" +

    "⏱️ <b>Yeroo:</b> " + minute + "\n\n" +

    "🇪🇹 Gooliin haaraan galameera!\n" +
    "🔥 Tapha kallattiin hordofaa!\n\n" +

    "━━━━━━━━━━━━━━\n" +
    "📢 <b>KALID FOOTBALL</b>\n" +
    "𝗦𝗛𝗔𝗥𝗘 ➪ @KalidFootball\n" +
    "━━━━━━━━━━━━━━\n\n" +

    "♡　　 ⎙　　 ⌲　　 🔕　　 ✉️\n" +
    "ˡᶦᵏᵉ　 ˢᵃᵛᵉ　 ˢʰᵃʳᵉ　 ᵘⁿᵐᵘᵗᵉ　 ᶜᵒᵐᵐᵉⁿᵗ"
  );
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

    const now = Date.now();

    // Yeroo jalqabaa: bu'aa taphoota hundaa kuusi.
    if (!initialized) {
      for (const match of matches) {
        if (match.id === undefined || match.id === null) {
          continue;
        }

        previousScores.set(match.id, getScore(match));
      }

      initialized = true;
      lastWorldwideCheck = now;

      console.log("Bu'aan taphoota jalqabaa kuufameera.");
      console.log("Taphoota live waliigalaa:", matches.length);

      return;
    }

    // Taphoota liigota gurguddoo daqiiqaa 5 hunda.
    // Taphoota biroo daqiiqaa 20 hunda.
    const worldwideDue =
      now - lastWorldwideCheck >= TWENTY_MINUTES;

    let majorCount = 0;
    let worldwideCount = 0;

    for (const match of matches) {
      const id = match.id;

      if (id === undefined || id === null) {
        continue;
      }

      const major = isMajorLeague(match);

      // Liigota gurguddoo yeroo hunda qoradhu.
      // Liigota biroo daqiiqaa 20 qofa qoradhu.
      if (!major && !worldwideDue) {
        continue;
      }

      if (major) {
        majorCount++;
      } else {
        worldwideCount++;
      }

      const currentScore = getScore(match);
      const oldScore = previousScores.get(id);

      // Tapha haaraa yoo argame bu'aa isaa kuusi.
      if (oldScore === undefined) {
        previousScores.set(id, currentScore);
        continue;
      }

      const goalScored =
        currentScore.home > oldScore.home ||
        currentScore.away > oldScore.away;

      if (goalScored) {
        const message = createGoalMessage(
          match,
          currentScore
        );

        const sent = await sendTelegram(message);

        if (sent) {
          console.log(
            "GOAL ALERT:",
            match.home?.name,
            currentScore.home,
            "-",
            currentScore.away,
            match.away?.name
          );

          previousScores.set(id, currentScore);
        }

      } else {
        previousScores.set(id, currentScore);
      }
    }

    if (worldwideDue) {
      lastWorldwideCheck = now;

      console.log(
        "Qorannoon taphoota addunyaa daqiiqaa 20 xumurame."
      );
    }

    console.log("Taphoota live waliigalaa:", matches.length);
    console.log("Taphoota liigota gurguddoo:", majorCount);
    console.log("Taphoota addunyaa biroo:", worldwideCount);

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
  res.send("KALID FOOTBALL GOAL ALERT IS RUNNING! ⚽🔥");
});

app.listen(PORT, () => {
  console.log("KALID FOOTBALL GOAL ALERT STARTED!");

  async function startBot() {
    await testTelegram();

    await checkFootball();

    setInterval(() => {
      checkFootball();
    }, FIVE_MINUTES);

    console.log("Hordoffiin taphoota jalqabameera!");
    console.log("Major leagues: Every 5 minutes.");
    console.log("Worldwide matches: Every 20 minutes.");
  }

  startBot().catch(error => {
    console.error("BOT START ERROR:", error.message);
  });
});
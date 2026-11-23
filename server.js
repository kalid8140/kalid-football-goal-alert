const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;

const API_URL = "https://api.datasportsapi.com/v2/livescores";

const FIVE_MINUTES = 5 * 60 * 1000;
const TWENTY_MINUTES = 20 * 60 * 1000;

// CHANNELS FI AFAAN ERGAA
const CHANNELS = [
  { id: "@KalidFootball", language: "oromo" },
  { id: "@KalidSportsNews", language: "amharic" },
  { id: "@oduu_sport01", language: "oromo" },
  { id: "@ETC_ARSENAL", language: "amharic" },
  { id: "@arsenal_america", language: "english" }
];

// LIIGOTA GURGUDDOO
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

if (!BOT_TOKEN || !API_KEY) {
  console.error("DOGOGGORA: Environment Variables dhabuu danda'u.");

  if (!BOT_TOKEN) console.error("TELEGRAM_BOT_TOKEN hin jiru.");
  if (!API_KEY) console.error("DATASPORTSAPI_API_KEY hin jiru.");

  process.exit(1);
}

const previousScores = new Map();

let checking = false;
let initialized = false;
let lastWorldwideCheck = 0;

// HTML sirreessuu
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// Liigii gurguddaa adda baasuu
function isMajorLeague(match) {
  const league = (match.league?.name || "").toLowerCase();

  return MAJOR_LEAGUES.some(name =>
    league.includes(name)
  );
}

// Telegram irratti ergaa erguu
async function sendTelegram(channelId, message) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: channelId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      { timeout: 20000 }
    );

    console.log(
      "TELEGRAM SUCCESS:",
      channelId,
      response.data.ok
    );

    return response.data.ok === true;

  } catch (error) {
    console.error(
      "TELEGRAM ERROR:",
      channelId,
      error.response?.data || error.message
    );

    return false;
  }
}

// Afaan tokkoon ergaa goolii qopheessuu
function createGoalMessage(match, score, language) {
  const league = escapeHTML(
    match.league?.name || "League"
  );

  const home = escapeHTML(
    match.home?.name || "Home team"
  );

  const away = escapeHTML(
    match.away?.name || "Away team"
  );

  const minute = escapeHTML(
    match.status?.minute ??
    match.minute ??
    match.status?.description ??
    "Live"
  );

  let title;
  let goalText;
  let followText;

  if (language === "oromo") {
    title = "🚨 <b>GOOLII GALAME! ⚽🔥</b>";
    goalText = "🇪🇹 Gooliin haaraan galameera!";
    followText = "🔥 Tapha kallattiin hordofaa!";

  } else if (language === "amharic") {
    title = "🚨 <b>ጎል ተቆጠረ! ⚽🔥</b>";
    goalText = "🇪🇹 አዲስ ጎል ተቆጥሯል!";
    followText = "🔥 ጨዋታውን በቀጥታ ይከታተሉ!";

  } else {
    title = "🚨 <b>GOAL SCORED! ⚽🔥</b>";
    goalText = "🇬🇧 A new goal has been scored!";
    followText = "🔥 Follow the match live!";
  }

  return (
    title + "\n\n" +

    "🏆 <b>" +
    (language === "oromo" ? "Liigii:" :
     language === "amharic" ? "ሊግ:" : "League:") +
    "</b> " + league + "\n\n" +

    "━━━━━━━━━━━━━━\n" +

    "⚽ <b>" + home + "</b>\n" +
    "🥅 <b>" + score.home + " - " + score.away + "</b>\n" +
    "⚽ <b>" + away + "</b>\n\n" +

    "⏱️ <b>" +
    (language === "oromo" ? "Yeroo:" :
     language === "amharic" ? "ደቂቃ:" : "Minute:") +
    "</b> " + minute + "\n\n" +

    goalText + "\n" +
    followText + "\n\n" +

    "━━━━━━━━━━━━━━\n" +
    "📢 <b>KALID FOOTBALL</b>\n" +
    "𝗦𝗛𝗔𝗥𝗘 ➪ @KalidFootball\n" +
    "━━━━━━━━━━━━━━\n\n" +

    "♡　　 ⎙　　 ⌲　　 🔕　　 ✉️\n" +
    "ˡᶦᵏᵉ　 ˢᵃᵛᵉ　 ˢʰᵃʳᵉ　 ᵘⁿᵐᵘᵗᵉ　 ᶜᵒᵐᵐᵉⁿᵗ"
  );
}

// Goolii channel shanitti erguu
async function sendGoalToAllChannels(match, score) {
  console.log("Goolii channel 5tti ergaa jira...");

  const tasks = CHANNELS.map(channel => {
    const message = createGoalMessage(
      match,
      score,
      channel.language
    );

    return sendTelegram(channel.id, message);
  });

  const results = await Promise.all(tasks);

  const successCount = results.filter(Boolean).length;

  console.log(
    "CHANNELS SUCCEEDED:",
    successCount,
    "/",
    CHANNELS.length
  );
}

// Ergaa botichi jalqabuu channel hundaaf erguu
async function testTelegram() {
  const startupMessages = {
    oromo:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Botichi hojii jalqabeera!\n\n" +
      "🏆 Liigota gurguddoo: daqiiqaa 5 hunda.\n" +
      "🌍 Taphoota addunyaa: daqiiqaa 20 hunda.\n\n" +
      "⚽ Gooliin yeroo galamu as irratti beeksifama!",

    amharic:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ ቦቱ ስራ ጀምሯል!\n\n" +
      "🏆 ዋና ዋና ሊጎች፡ በየ5 ደቂቃው።\n" +
      "🌍 የዓለም አቀፍ ጨዋታዎች፡ በየ20 ደቂቃው።\n\n" +
      "⚽ ጎል ሲቆጠር እዚህ ይገለጻል!",

    english:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Bot is now online!\n\n" +
      "🏆 Major leagues: Every 5 minutes.\n" +
      "🌍 Worldwide matches: Every 20 minutes.\n\n" +
      "⚽ Goal alerts will be posted here!"
  };

  for (const channel of CHANNELS) {
    await sendTelegram(
      channel.id,
      startupMessages[channel.language]
    );
  }
}

// Bu'aa taphaa
function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

// Taphoota live qorachuu
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

    // Yeroo jalqabaa bu'aa taphoota kuusi.
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

      // Liigota gurguddoo daqiiqaa 5 hunda.
      // Taphoota biroo daqiiqaa 20 hunda.
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

      if (oldScore === undefined) {
        previousScores.set(id, currentScore);
        continue;
      }

      const goalScored =
        currentScore.home > oldScore.home ||
        currentScore.away > oldScore.away;

      if (goalScored) {
        // Bu'aa haaraa kuusi; ergaa channel hundaaf ergi.
        previousScores.set(id, currentScore);

        await sendGoalToAllChannels(
          match,
          currentScore
        );

        console.log(
          "GOAL ALERT:",
          match.home?.name,
          currentScore.home,
          "-",
          currentScore.away,
          match.away?.name
        );

      } else {
        previousScores.set(id, currentScore);
      }
    }

    if (worldwideDue) {
      lastWorldwideCheck = now;

      console.log(
        "Qorannoon taphoota addunyaa xumurameera."
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

// Health check
app.get("/", (req, res) => {
  res.send("KALID FOOTBALL GOAL ALERT IS RUNNING! ⚽🔥");
});

// Server jalqabuu
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
    console.log("Telegram channels: 5");
  }

  startBot().catch(error => {
    console.error("BOT START ERROR:", error.message);
  });
});
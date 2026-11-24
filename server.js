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

// TELEGRAM CHANNELS
const CHANNELS = [
  {
    id: "@KalidFootball",
    username: "@KalidFootball",
    language: "oromo"
  },
  {
    id: "@KalidSportsNews",
    username: "@KalidSportsNews",
    language: "amharic"
  },
  {
    id: "@oduu_sport01",
    username: "@oduu_sport01",
    language: "oromo"
  },
  {
    id: "@ETC_ARSENAL",
    username: "@ETC_ARSENAL",
    language: "amharic"
  },
  {
    id: "@arsenal_america",
    username: "@arsenal_america",
    language: "english"
  }
];

// MAJOR LEAGUES
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

// DATA STORAGE
const previousScores = new Map();
const previousStatuses = new Map();
const announcedStarts = new Set();

let checking = false;
let initialized = false;
let lastWorldwideCheck = 0;

// HTML ESCAPE
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// CHANNEL FOOTER
function createChannelFooter(channel) {
  return (
    "━━━━━━━━━━━━━━\n" +
    "📢 <b>KALID FOOTBALL</b>\n" +
    "𝗦𝗛𝗔𝗥𝗘 ➪ " + escapeHTML(channel.username) + "\n" +
    "━━━━━━━━━━━━━━"
  );
}

// MAJOR LEAGUE CHECK
function isMajorLeague(match) {
  const league = (match.league?.name || "").toLowerCase();

  return MAJOR_LEAGUES.some(name =>
    league.includes(name)
  );
}

// GET SCORE
function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

// MATCH STATUS
function getStatus(match) {
  const status = match.status;

  if (typeof status === "string") {
    return status.toLowerCase();
  }

  return [
    status?.type,
    status?.short,
    status?.code,
    status?.description,
    status?.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// CHECK IF MATCH IS LIVE
function isMatchLive(match) {
  const status = getStatus(match);

  return (
    status.includes("live") ||
    status.includes("in progress") ||
    status.includes("first half") ||
    status.includes("1st half") ||
    status.includes("second half") ||
    status.includes("2nd half") ||
    status.includes("extra time") ||
    status.includes("penalty") ||
    status.includes("playing") ||
    /\b1h\b/.test(status) ||
    /\b2h\b/.test(status) ||
    /\bht\b/.test(status)
  );
}

// TELEGRAM SENDER
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

// STARTUP MESSAGES
async function testTelegram() {
  const messages = {
    oromo:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Botichi hojii jalqabeera!\n\n" +
      "🏆 Liigota gurguddoo: Daqiiqaa 5 hunda.\n" +
      "🌍 Taphoota addunyaa: Daqiiqaa 20 hunda.\n\n" +
      "🔴 Taphoonni yeroo jalqaban ni beeksifamu.\n" +
      "⚽ Gooliin yeroo galamu ni beeksifama!",

    amharic:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ ቦቱ ስራ ጀምሯል!\n\n" +
      "🏆 ዋና ዋና ሊጎች፡ በየ5 ደቂቃው።\n" +
      "🌍 የዓለም አቀፍ ጨዋታዎች፡ በየ20 ደቂቃው።\n\n" +
      "🔴 ጨዋታዎች ሲጀምሩ ይገለጻሉ።\n" +
      "⚽ ጎል ሲቆጠር ይገለጻል!",

    english:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Bot is now online!\n\n" +
      "🏆 Major leagues: Every 5 minutes.\n" +
      "🌍 Worldwide matches: Every 20 minutes.\n\n" +
      "🔴 Match start alerts enabled.\n" +
      "⚽ Goal alerts enabled!"
  };

  for (const channel of CHANNELS) {
    await sendTelegram(
      channel.id,
      messages[channel.language]
    );
  }
}

// MATCH START MESSAGE
function createStartMessage(match, channel) {
  const language = channel.language;

  const league = escapeHTML(
    match.league?.name || "League"
  );

  const home = escapeHTML(
    match.home?.name || "Home team"
  );

  const away = escapeHTML(
    match.away?.name || "Away team"
  );

  const score = getScore(match);

  const minute = escapeHTML(
    match.status?.minute ??
    match.minute ??
    match.status?.description ??
    "Live"
  );

  let title;
  let startText;
  let leagueText;
  let minuteText;

  if (language === "oromo") {
    title = "🔴 <b>TAPHA JALQABAMEERA! ⚽</b>";
    startText = "🔥 Taphi kun amma jalqabameera!";
    leagueText = "Liigii";
    minuteText = "Yeroo";

  } else if (language === "amharic") {
    title = "🔴 <b>ጨዋታው ተጀምሯል! ⚽</b>";
    startText = "🔥 ጨዋታው አሁን ተጀምሯል!";
    leagueText = "ሊግ";
    minuteText = "ደቂቃ";

  } else {
    title = "🔴 <b>MATCH STARTED! ⚽</b>";
    startText = "🔥 The match has kicked off!";
    leagueText = "League";
    minuteText = "Time";
  }

  return (
    title + "\n\n" +

    "🏆 <b>" + leagueText + ":</b> " + league + "\n\n" +

    "⚽ <b>" + home + "</b>\n" +
    "🥅 <b>" + score.home + " - " + score.away + "</b>\n" +
    "⚽ <b>" + away + "</b>\n\n" +

    "⏱️ <b>" + minuteText + ":</b> " + minute + "\n\n" +

    startText + "\n\n" +

    createChannelFooter(channel)
  );
}

// GOAL MESSAGE
function createGoalMessage(match, score, channel) {
  const language = channel.language;

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
  let leagueText;
  let minuteText;

  if (language === "oromo") {
    title = "🚨 <b>GOOLII GALAME! ⚽🔥</b>";
    goalText = "🇪🇹 Gooliin haaraan galameera!";
    followText = "🔥 Tapha kallattiin hordofaa!";
    leagueText = "Liigii";
    minuteText = "Yeroo";

  } else if (language === "amharic") {
    title = "🚨 <b>ጎል ተቆጠረ! ⚽🔥</b>";
    goalText = "🇪🇹 አዲስ ጎል ተቆጥሯል!";
    followText = "🔥 ጨዋታውን በቀጥታ ይከታተሉ!";
    leagueText = "ሊግ";
    minuteText = "ደቂቃ";

  } else {
    title = "🚨 <b>GOAL SCORED! ⚽🔥</b>";
    goalText = "🇬🇧 A new goal has been scored!";
    followText = "🔥 Follow the match live!";
    leagueText = "League";
    minuteText = "Minute";
  }

  return (
    title + "\n\n" +

    "🏆 <b>" + leagueText + ":</b> " + league + "\n\n" +

    "━━━━━━━━━━━━━━\n" +

    "⚽ <b>" + home + "</b>\n" +
    "🥅 <b>" + score.home + " - " + score.away + "</b>\n" +
    "⚽ <b>" + away + "</b>\n\n" +

    "⏱️ <b>" + minuteText + ":</b> " + minute + "\n\n" +

    goalText + "\n" +
    followText + "\n\n" +

    createChannelFooter(channel) + "\n\n" +

    "♡　　 ⎙　　 ⌲　　 🔕　　 ✉️\n" +
    "ˡᶦᵏᵉ　 ˢᵃᵛᵉ　 ˢʰᵃʳᵉ　 ᵘⁿᵐᵘᵗᵉ　 ᶜᵒᵐᵐᵉⁿᵗ"
  );
}

// SEND START ALERT TO FIVE CHANNELS
async function sendStartToAllChannels(match) {
  console.log("MATCH START ALERT:", match.id);

  const tasks = CHANNELS.map(channel => {
    const message = createStartMessage(match, channel);

    return sendTelegram(channel.id, message);
  });

  const results = await Promise.all(tasks);

  console.log(
    "START ALERT CHANNELS:",
    results.filter(Boolean).length,
    "/ 5"
  );
}

// SEND GOAL ALERT TO FIVE CHANNELS
async function sendGoalToAllChannels(match, score) {
  console.log("GOAL ALERT:", match.id);

  const tasks = CHANNELS.map(channel => {
    const message = createGoalMessage(
      match,
      score,
      channel
    );

    return sendTelegram(channel.id, message);
  });

  const results = await Promise.all(tasks);

  console.log(
    "GOAL ALERT CHANNELS:",
    results.filter(Boolean).length,
    "/ 5"
  );
}

// MAIN FOOTBALL CHECK
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

    // INITIAL DATA
    if (!initialized) {
      for (const match of matches) {
        if (match.id === undefined || match.id === null) {
          continue;
        }

        previousScores.set(match.id, getScore(match));
        previousStatuses.set(match.id, isMatchLive(match));
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

      // MAJOR LEAGUES EVERY 5 MINUTES
      // OTHER MATCHES EVERY 20 MINUTES
      if (!major && !worldwideDue) {
        continue;
      }

      if (major) {
        majorCount++;
      } else {
        worldwideCount++;
      }

      const liveNow = isMatchLive(match);
      const wasLive = previousStatuses.get(id);

      const currentScore = getScore(match);
      const oldScore = previousScores.get(id);

      // NEWLY DISCOVERED MATCH
      if (wasLive === undefined) {
        previousStatuses.set(id, liveNow);
        previousScores.set(id, currentScore);

        if (liveNow && !announcedStarts.has(id)) {
          announcedStarts.add(id);
          await sendStartToAllChannels(match);
        }

        continue;
      }

      // MATCH STARTED
      if (wasLive === false && liveNow) {
        if (!announcedStarts.has(id)) {
          announcedStarts.add(id);
          await sendStartToAllChannels(match);
        }
      }

      previousStatuses.set(id, liveNow);

      // GOAL DETECTION
      if (oldScore !== undefined) {
        const goalScored =
          currentScore.home > oldScore.home ||
          currentScore.away > oldScore.away;

        if (goalScored) {
          await sendGoalToAllChannels(
            match,
            currentScore
          );

          console.log(
            "GOAL:",
            match.home?.name,
            currentScore.home,
            "-",
            currentScore.away,
            match.away?.name
          );
        }
      }

      previousScores.set(id, currentScore);
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

// WEBSITE HEALTH CHECK
app.get("/", (req, res) => {
  res.send("KALID FOOTBALL GOAL ALERT IS RUNNING! ⚽🔥");
});

// START SERVER
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
    console.log("Match start alerts: ENABLED.");
    console.log("Goal alerts: ENABLED.");
    console.log("Telegram channels: 5.");
  }

  startBot().catch(error => {
    console.error("BOT START ERROR:", error.message);
  });
});
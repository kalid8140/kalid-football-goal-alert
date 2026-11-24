const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;

const BASE_URL = "https://api.datasportsapi.com/v2";
const API_URL = `${BASE_URL}/livescores`;

const CHECK_INTERVAL = 5 * 60 * 1000;

const FAMOUS_LEAGUES = [
  "premier league",
  "la liga",
  "laliga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "champions league",
  "europa league",
  "conference league"
];

const CHANNELS = [
  { id: "@KalidFootball", username: "@KalidFootball", language: "oromo" },
  { id: "@KalidSportsNews", username: "@KalidSportsNews", language: "amharic" },
  { id: "@oduu_sport01", username: "@oduu_sport01", language: "oromo" },
  { id: "@ETC_ARSENAL", username: "@ETC_ARSENAL", language: "amharic" },
  { id: "@arsenal_america", username: "@arsenal_america", language: "english" }
];

if (!BOT_TOKEN || !API_KEY) {
  console.error("Environment variables hin guutamne.");
  process.exit(1);
}

// MEMORY
const previousScores = new Map();
const announcedGoals = new Set();

let checking = false;
let initialized = false;

// API REQUEST
async function apiGet(path, params = {}) {
  const response = await axios.get(
    `${BASE_URL}${path}`,
    {
      params,
      headers: {
        Authorization: `Bearer ${API_KEY}`
      },
      timeout: 20000
    }
  );

  return response.data;
}

// HTML ESCAPE
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// FAMOUS LEAGUES
function isFamousLeague(match) {
  const name = String(
    match.league?.name || ""
  ).toLowerCase();

  return FAMOUS_LEAGUES.some(league =>
    name.includes(league)
  );
}

// SCORE
function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

// TELEGRAM PHOTO SENDER
async function sendTelegramPhoto(channelId, photo, caption) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        chat_id: channelId,
        photo,
        caption,
        parse_mode: "HTML"
      },
      { timeout: 30000 }
    );

    return response.data.ok === true;

  } catch (error) {
    console.error(
      "PHOTO ERROR:",
      channelId,
      error.response?.data || error.message
    );

    return false;
  }
}

// TELEGRAM MESSAGE SENDER
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

// CHANNEL FOOTER
function channelFooter(channel) {
  return (
    "━━━━━━━━━━━━━━\n" +
    "⚽ <b>KALID FOOTBALL</b>\n" +
    "📢 " + escapeHTML(channel.username) + "\n" +
    "━━━━━━━━━━━━━━"
  );
}

// STARTUP MESSAGES
async function sendStartupMessages() {
  const messages = {
    oromo:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Botichi hojii jalqabeera!\n" +
      "🏆 Liigota beekamoo hordofa.\n" +
      "⚽ Goolii yeroo galamu beeksisa.\n" +
      "📸 Suuraa taphataa yoo argame ni dabala.",

    amharic:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ ቦቱ ስራ ጀምሯል!\n" +
      "🏆 ታዋቂ ሊጎችን ይከታተላል።\n" +
      "⚽ ጎል ሲቆጠር ያሳውቃል።\n" +
      "📸 የተጫዋቹን ፎቶ ካገኘ ያካትታል።",

    english:
      "🤖 <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
      "✅ Bot is online!\n" +
      "🏆 Monitoring famous leagues.\n" +
      "⚽ Goal alerts enabled.\n" +
      "📸 Player photos included when available."
  };

  for (const channel of CHANNELS) {
    await sendTelegram(
      channel.id,
      messages[channel.language] +
      "\n\n" + channelFooter(channel)
    );
  }
}

// GET PLAYER PHOTO
async function getPlayerPhoto(player) {
  // First try image from goal event
  if (player?.image) {
    return player.image;
  }

  // If event has player ID, fetch profile
  if (player?.id) {
    try {
      const response = await apiGet(
        `/players/${player.id}`
      );

      return response.data?.image || null;

    } catch (error) {
      console.error(
        "PLAYER PROFILE ERROR:",
        player.id,
        error.response?.data || error.message
      );
    }
  }

  return null;
}

// GET MATCH GOALS
async function getMatchGoals(fixtureId) {
  try {
    const response = await apiGet(
      `/fixtures/${fixtureId}/events`
    );

    const events = response.data;

    if (!Array.isArray(events)) {
      return [];
    }

    return events.filter(event =>
      String(event.type || "").toLowerCase() === "goal"
    );

  } catch (error) {
    console.error(
      "EVENT API ERROR:",
      fixtureId,
      error.response?.data || error.message
    );

    return [];
  }
}

// GOAL EVENT KEY
function getGoalKey(event, fixtureId) {
  return [
    fixtureId,
    event.side,
    event.minute,
    event.addedMinute,
    event.player?.id || "",
    event.playerName || ""
  ].join(":");
}

// LANGUAGE TEXT
function getGoalLabels(language) {
  if (language === "oromo") {
    return {
      title: "🚨 GOOLII GALAME! ⚽🔥",
      scorer: "Nama goolii galche",
      assist: "Nama assist godhe",
      league: "Liigii",
      minute: "Daqiiqaa",
      team: "Garee",
      follow: "🔥 Tapha kallattiin hordofaa!"
    };
  }

  if (language === "amharic") {
    return {
      title: "🚨 ጎል ተቆጠረ! ⚽🔥",
      scorer: "ጎል ያስቆጠረው",
      assist: "አሲስት ያደረገው",
      league: "ሊግ",
      minute: "ደቂቃ",
      team: "ቡድን",
      follow: "🔥 ጨዋታውን ይከታተሉ!"
    };
  }

  return {
    title: "🚨 GOAL SCORED! ⚽🔥",
    scorer: "Goal scorer",
    assist: "Assist",
    league: "League",
    minute: "Minute",
    team: "Team",
    follow: "🔥 Follow the match live!"
  };
}

// CREATE GOAL CAPTION
function createGoalCaption(match, event, score, channel) {
  const labels = getGoalLabels(channel.language);

  const home = escapeHTML(match.home?.name || "Home");
  const away = escapeHTML(match.away?.name || "Away");

  const league = escapeHTML(
    match.league?.name || "League"
  );

  const scorer = escapeHTML(
    event.playerName ||
    event.player?.name ||
    "Unknown player"
  );

  const assist = event.assists?.[0]?.name
    ? escapeHTML(event.assists[0].name)
    : null;

  const minute = event.minute == null
    ? "Live"
    : `${event.minute}${event.addedMinute ? "+" + event.addedMinute : ""}'`;

  const scoringTeam = event.side === "home"
    ? home
    : event.side === "away"
      ? away
      : "Unknown";

  let caption =
    "<b>" + labels.title + "</b>\n\n" +

    "🏆 <b>" + labels.league + ":</b> " +
    league + "\n\n" +

    "⚽ <b>" + home + "</b>\n" +
    "🥅 <b>" + score.home + " - " +
    score.away + "</b>\n" +
    "⚽ <b>" + away + "</b>\n\n" +

    "👤 <b>" + labels.scorer + ":</b> " +
    scorer + "\n" +

    "🏟️ <b>" + labels.team + ":</b> " +
    scoringTeam + "\n" +

    "⏱️ <b>" + labels.minute + ":</b> " +
    minute + "\n";

  if (assist) {
    caption +=
      "🎯 <b>" + labels.assist + ":</b> " +
      assist + "\n";
  }

  caption +=
    "\n" + labels.follow + "\n\n" +
    channelFooter(channel);

  // Telegram photo caption maximum is 1024 characters
  return caption.slice(0, 1000);
}

// SEND GOAL ALERT
async function sendGoalToAllChannels(match, event, score) {
  const player = event.player || {};

  const photo = await getPlayerPhoto(player);

  const results = await Promise.all(
    CHANNELS.map(async channel => {
      const caption = createGoalCaption(
        match,
        event,
        score,
        channel
      );

      if (photo) {
        return sendTelegramPhoto(
          channel.id,
          photo,
          caption
        );
      }

      // If photo is unavailable, send text
      return sendTelegram(
        channel.id,
        caption
      );
    })
  );

  console.log(
    "GOAL ALERT SENT:",
    results.filter(Boolean).length,
    "/",
    CHANNELS.length,
    "| PHOTO:",
    Boolean(photo)
  );
}

// MAIN FOOTBALL CHECK
async function checkFootball() {
  if (checking) return;

  checking = true;

  try {
    console.log("Checking famous football leagues...");

    const response = await apiGet(
      "/livescores",
      { sport: "football" }
    );

    const allMatches = response.data;

    if (!Array.isArray(allMatches)) {
      console.error("Invalid API response.");
      return;
    }

    const matches = allMatches.filter(isFamousLeague);

    console.log("All matches:", allMatches.length);
    console.log("Famous league matches:", matches.length);

    // FIRST CHECK
    if (!initialized) {
      for (const match of matches) {
        if (match.id == null) continue;

        previousScores.set(
          match.id,
          getScore(match)
        );
      }

      initialized = true;

      console.log("Initial scores saved.");
      return;
    }

    // CHECK EACH MATCH
    for (const match of matches) {
      const id = match.id;

      if (id == null) continue;

      const currentScore = getScore(match);
      const oldScore = previousScores.get(id);

      // New match
      if (!oldScore) {
        previousScores.set(id, currentScore);
        continue;
      }

      const scoreIncreased =
        currentScore.home > oldScore.home ||
        currentScore.away > oldScore.away;

      if (scoreIncreased) {
        console.log("GOAL DETECTED:", id);

        const goals = await getMatchGoals(id);

        for (const event of goals) {
          const eventHome = Number(event.homeScore);
          const eventAway = Number(event.awayScore);

          // Only process goals after the previous score
          const isNewGoal =
            eventHome > oldScore.home ||
            eventAway > oldScore.away;

          if (!isNewGoal) continue;

          const goalKey = getGoalKey(event, id);

          if (announcedGoals.has(goalKey)) {
            continue;
          }

          // Send goal with player photo if available
          const success = await sendGoalToAllChannels(
            match,
            event,
            {
              home: eventHome,
              away: eventAway
            }
          );

          // Remember only after successful send
          announcedGoals.add(goalKey);

          console.log("Goal processed:", goalKey);
        }
      }

      previousScores.set(id, currentScore);
    }

    console.log("Football check completed.");

  } catch (error) {
    console.error(
      "FOOTBALL API ERROR:",
      error.response?.data || error.message
    );

  } finally {
    checking = false;
  }
}

// WEBSITE HEALTH
app.get("/", (req, res) => {
  res.send(
    "KALID FOOTBALL GOAL ALERT IS RUNNING! ⚽"
  );
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    service: "KALID FOOTBALL GOAL ALERT"
  });
});

// START SERVER
app.listen(PORT, () => {
  console.log(
    "KALID FOOTBALL GOAL ALERT STARTED ON PORT",
    PORT
  );

  async function startBot() {
    await sendStartupMessages();

    await checkFootball();

    setInterval(() => {
      checkFootball();
    }, CHECK_INTERVAL);

    console.log("Famous leagues monitoring enabled.");
    console.log("Goal alerts enabled.");
    console.log("Player photos enabled when available.");
    console.log("Check interval: 5 minutes.");
    console.log("Telegram channels:", CHANNELS.length);
  }

  startBot().catch(error => {
    console.error("BOT START ERROR:", error.message);
  });
});
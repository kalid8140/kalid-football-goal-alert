const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==================================
// BASIC SETTINGS
// ==================================

const PORT = process.env.PORT || 10000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;

const BASE_URL = "https://api.datasportsapi.com/v2";

// Check every 30 minutes to reduce API usage.
const CHECK_INTERVAL = 30 * 60 * 1000;

// ==================================
// CHANNEL SETTINGS
// ==================================

const GENERAL_CHANNELS = [
  { id: "@KalidFootball", language: "om" },
  { id: "@KalidSportsNews", language: "am" },
  { id: "@oduu_sport01", language: "om" }
];

const ARSENAL_CHANNELS = [
  { id: "@ETC_ARSENAL", language: "am" },
  { id: "@arsenal_america", language: "en" }
];

const ALL_CHANNELS = [
  ...GENERAL_CHANNELS,
  ...ARSENAL_CHANNELS
];

// ==================================
// SELECTED TEAMS
// ==================================

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ");
}

const TEAM_ALIASES = {
  arsenal: [
    "arsenal",
    "arsenal fc",
    "arsenal football club"
  ],

  manchesterUnited: [
    "manchester united",
    "manchester united fc",
    "man united",
    "man utd",
    "man utd fc"
  ],

  chelsea: [
    "chelsea",
    "chelsea fc"
  ],

  liverpool: [
    "liverpool",
    "liverpool fc"
  ],

  manchesterCity: [
    "manchester city",
    "manchester city fc",
    "man city",
    "man city fc"
  ],

  realMadrid: [
    "real madrid",
    "real madrid cf"
  ],

  barcelona: [
    "barcelona",
    "fc barcelona",
    "barca"
  ]
};

const SELECTED_TEAMS = new Set(
  Object.values(TEAM_ALIASES)
    .flat()
    .map(normalizeName)
);

const ARSENAL_NAMES = new Set(
  TEAM_ALIASES.arsenal.map(normalizeName)
);

// ==================================
// MEMORY
// ==================================

const previousScores = new Map();
const announcedGoals = new Set();
const playerPhotoCache = new Map();

let checking = false;
let quotaBlockedUntil = 0;

// ==================================
// API QUOTA MANAGEMENT
// ==================================

function handleQuotaError(error) {
  const apiError = error.response?.data?.error;

  if (apiError?.code !== "quota_exceeded") {
    return false;
  }

  const message = String(apiError.message || "");

  const resetMatch = message.match(/resets at (.+)$/);

  const resetTime = resetMatch
    ? Date.parse(resetMatch[1])
    : NaN;

  quotaBlockedUntil = Number.isFinite(resetTime)
    ? resetTime
    : Date.now() + 60 * 60 * 1000;

  console.log(
    "API QUOTA EXHAUSTED."
  );

  console.log(
    "Next API check:",
    new Date(quotaBlockedUntil).toISOString()
  );

  return true;
}

// ==================================
// API REQUEST
// ==================================

async function apiGet(path, params = {}) {
  if (!API_KEY) {
    throw new Error("DATASPORTSAPI_API_KEY is missing");
  }

  if (Date.now() < quotaBlockedUntil) {
    throw new Error("API quota blocked until reset time");
  }

  try {
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

  } catch (error) {
    handleQuotaError(error);
    throw error;
  }
}

// ==================================
// TEAM HELPERS
// ==================================

function getTeamName(team) {
  if (typeof team === "string") {
    return normalizeName(team);
  }

  return normalizeName(team?.name || "");
}

function getHomeTeam(match) {
  return match.home || match.homeTeam || match.home_team;
}

function getAwayTeam(match) {
  return match.away || match.awayTeam || match.away_team;
}

function getHomeName(match) {
  return getTeamName(getHomeTeam(match));
}

function getAwayName(match) {
  return getTeamName(getAwayTeam(match));
}

function getDisplayTeamName(team, fallback) {
  if (typeof team === "string") {
    return team;
  }

  return team?.name || fallback;
}

function isSelectedTeam(teamName) {
  return SELECTED_TEAMS.has(normalizeName(teamName));
}

function isSelectedMatch(match) {
  return (
    isSelectedTeam(getHomeName(match)) ||
    isSelectedTeam(getAwayName(match))
  );
}

function isArsenalMatch(match) {
  return (
    ARSENAL_NAMES.has(getHomeName(match)) ||
    ARSENAL_NAMES.has(getAwayName(match))
  );
}

// ==================================
// CHANNEL ROUTING
// ==================================

function getChannelsForMatch(match) {
  const channels = [];

  if (isSelectedMatch(match)) {
    channels.push(...GENERAL_CHANNELS);
  }

  if (isArsenalMatch(match)) {
    channels.push(...ARSENAL_CHANNELS);
  }

  return channels;
}

// ==================================
// SCORE
// ==================================

function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

// ==================================
// HTML HELPER
// ==================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==================================
// TELEGRAM TEXT
// ==================================

async function sendTelegram(chatId, message) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      { timeout: 20000 }
    );

    return response.data?.ok === true;

  } catch (error) {
    console.error(
      "Telegram text error:",
      chatId,
      error.response?.data || error.message
    );

    return false;
  }
}

// ==================================
// TELEGRAM PHOTO
// ==================================

async function sendTelegramPhoto(chatId, photo, caption) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`,
      {
        chat_id: chatId,
        photo,
        caption,
        parse_mode: "HTML"
      },
      { timeout: 30000 }
    );

    return response.data?.ok === true;

  } catch (error) {
    console.error(
      "Telegram photo error:",
      chatId,
      error.response?.data || error.message
    );

    return false;
  }
}

// ==================================
// PLAYER PHOTO
// ==================================

async function getPlayerPhoto(player, event) {
  const playerId =
    player?.id ||
    event?.playerId ||
    event?.player_id;

  if (player?.image) {
    return player.image;
  }

  if (!playerId) {
    return null;
  }

  if (playerPhotoCache.has(String(playerId))) {
    return playerPhotoCache.get(String(playerId));
  }

  try {
    const response = await apiGet(`/players/${playerId}`);

    const profile = response?.data ?? response;
    const photo = profile?.image || null;

    playerPhotoCache.set(String(playerId), photo);

    return photo;

  } catch (error) {
    console.error(
      "Player photo error:",
      playerId,
      error.response?.data || error.message
    );

    playerPhotoCache.set(String(playerId), null);

    return null;
  }
}

// ==================================
// MATCH EVENTS
// ==================================

async function getMatchGoals(fixtureId) {
  try {
    const response = await apiGet(
      `/fixtures/${fixtureId}/events`
    );

    const events = response?.data ?? response;

    if (!Array.isArray(events)) {
      return [];
    }

    return events.filter(event =>
      normalizeName(event.type) === "goal"
    );

  } catch (error) {
    console.error(
      "Match events error:",
      fixtureId,
      error.response?.data || error.message
    );

    return [];
  }
}

// ==================================
// GOAL IDENTIFICATION
// ==================================

function getGoalKey(fixtureId, event) {
  const player = event.player || {};

  return [
    fixtureId,
    event.side || "",
    event.minute ?? "",
    event.addedMinute ?? "",
    player.id || event.playerId || "",
    player.name || event.playerName || ""
  ].join("_");
}

// ==================================
// LANGUAGE LABELS
// ==================================

function getGoalLabels(language) {
  if (language === "om") {
    return {
      goal: "GOOLII!",
      scorer: "Taphataa goolii galche",
      assist: "Assist",
      promotion:
        "📢 Odeeffannoo kubbaa miilaa argachuuf channel keenya hordofaa.\n" +
        "🔔 Hiriyoota keessaniifis share godhaa!"
    };
  }

  if (language === "am") {
    return {
      goal: "ጎል!",
      scorer: "ጎል ያስቆጠረው",
      assist: "አሲስት",
      promotion:
        "📢 የእግር ኳስ ዜናዎችን ለማግኘት ቻናላችንን ይከታተሉ።\n" +
        "🔔 ለጓደኞቻችሁም Share ያድርጉ!"
    };
  }

  return {
    goal: "GOAL!",
    scorer: "Goal scorer",
    assist: "Assist",
    promotion:
      "📢 Follow our channel for football news and updates.\n" +
      "🔔 Share with your friends!"
  };
}

// ==================================
// GOAL CAPTION
// ==================================

function createGoalCaption(match, event, channel) {
  const labels = getGoalLabels(channel.language);

  const home = getDisplayTeamName(
    getHomeTeam(match),
    "Home"
  );

  const away = getDisplayTeamName(
    getAwayTeam(match),
    "Away"
  );

  const player = event.player || {};

  const scorer =
    event.playerName ||
    player.name ||
    "Unknown player";

  const minute = event.addedMinute
    ? `${event.minute ?? ""}+${event.addedMinute}'`
    : `${event.minute ?? ""}'`;

  const homeScore =
    event.homeScore ?? match.homeScore?.current ?? 0;

  const awayScore =
    event.awayScore ?? match.awayScore?.current ?? 0;

  const assist = event.assists?.[0]?.name;

  const username = channel.id;

  let caption =
    `⚽ <b>${labels.goal}</b>\n\n` +
    `🏆 ${escapeHTML(match.league?.name || "Football")}\n` +
    `⚔️ <b>${escapeHTML(home)} ${homeScore} - ${awayScore} ${escapeHTML(away)}</b>\n\n` +
    `👤 <b>${labels.scorer}:</b> ${escapeHTML(scorer)}\n` +
    `⏱ ${escapeHTML(minute)}`;

  if (assist) {
    caption +=
      `\n🎯 <b>${labels.assist}:</b> ${escapeHTML(assist)}`;
  }

  caption +=
    `\n\n${labels.promotion}` +
    `\n\n📢 Channel: <a href="https://t.me/${username.replace("@", "")}">${escapeHTML(username)}</a>` +
    `\n\n🔥 <b>KALID FOOTBALL GOAL ALERT</b>`;

  return caption.slice(0, 1000);
}

// ==================================
// SEND GOAL TO CHANNELS
// ==================================

async function sendGoalToChannels(match, event) {
  const channels = getChannelsForMatch(match);

  if (channels.length === 0) {
    return false;
  }

  const fixtureId = match.id;
  const player = event.player || {};

  const photo = await getPlayerPhoto(player, event);

  let atLeastOneSent = false;

  for (const channel of channels) {
    const caption = createGoalCaption(
      match,
      event,
      channel
    );

    let sent = false;

    if (photo) {
      sent = await sendTelegramPhoto(
        channel.id,
        photo,
        caption
      );
    }

    if (!sent) {
      sent = await sendTelegram(
        channel.id,
        caption
      );
    }

    if (sent) {
      atLeastOneSent = true;

      console.log(
        "GOAL SENT:",
        fixtureId,
        channel.id
      );
    } else {
      console.log(
        "GOAL FAILED:",
        fixtureId,
        channel.id
      );
    }
  }

  return atLeastOneSent;
}

// ==================================
// CHECK FOOTBALL
// ==================================

async function checkFootball() {
  if (checking) return;

  if (Date.now() < quotaBlockedUntil) {
    console.log(
      "API quota exhausted. Waiting for reset."
    );
    return;
  }

  checking = true;

  try {
    const response = await apiGet(
      "/livescores",
      { sport: "football" }
    );

    const allMatches = response?.data ?? [];

    if (!Array.isArray(allMatches)) {
      console.log("No valid match list received.");
      return;
    }

    const matches = allMatches.filter(isSelectedMatch);

    console.log(`All matches: ${allMatches.length}`);
    console.log(`Selected team matches: ${matches.length}`);

    for (const match of matches) {
      if (Date.now() < quotaBlockedUntil) {
        console.log("Stopping checks because API quota is exhausted.");
        break;
      }

      const fixtureId = match.id;

      if (!fixtureId) continue;

      const currentScore = getScore(match);

      if (!previousScores.has(fixtureId)) {
        previousScores.set(fixtureId, currentScore);
        continue;
      }

      const oldScore = previousScores.get(fixtureId);

      const scoreIncreased =
        currentScore.home > oldScore.home ||
        currentScore.away > oldScore.away;

      if (!scoreIncreased) {
        continue;
      }

      console.log(
        "SCORE CHANGED:",
        getDisplayTeamName(getHomeTeam(match), "Home"),
        currentScore.home,
        "-",
        currentScore.away,
        getDisplayTeamName(getAwayTeam(match), "Away")
      );

      const events = await getMatchGoals(fixtureId);

      for (const event of events) {
        if (Date.now() < quotaBlockedUntil) {
          break;
        }

        const goalKey = getGoalKey(fixtureId, event);

        if (announcedGoals.has(goalKey)) {
          continue;
        }

        const eventHome = Number(event.homeScore);
        const eventAway = Number(event.awayScore);

        if (
          !Number.isFinite(eventHome) ||
          !Number.isFinite(eventAway)
        ) {
          continue;
        }

        const isNewGoal =
          eventHome > oldScore.home ||
          eventAway > oldScore.away;

        if (!isNewGoal) {
          continue;
        }

        const sent = await sendGoalToChannels(
          match,
          event
        );

        if (sent) {
          announcedGoals.add(goalKey);
        }
      }

      previousScores.set(fixtureId, currentScore);
    }

  } catch (error) {
    if (!handleQuotaError(error)) {
      console.error(
        "Football check error:",
        error.response?.data || error.message
      );
    }

  } finally {
    checking = false;
  }
}

// ==================================
// STARTUP MESSAGES
// ==================================

async function sendStartupMessages() {
  for (const channel of ALL_CHANNELS) {
    let message;

    if (channel.language === "om") {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "Bot keenya hojii jalqabeera!\n" +
        "⚽ Gareewwan filataman torban hordofaa.";

    } else if (channel.language === "am") {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "ቦቱ ስራ ጀምሯል!\n" +
        "⚽ የተመረጡትን ቡድኖች ይከታተሉ።";

    } else {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "The bot is now online!\n" +
        "⚽ Following your selected teams.";
    }

    await sendTelegram(channel.id, message);
  }
}

// ==================================
// SERVER ROUTES
// ==================================

app.get("/", (req, res) => {
  res.send(
    "KALID FOOTBALL GOAL ALERT is running ⚽"
  );
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: "KALID FOOTBALL GOAL ALERT",

    selectedTeams: [
      "Arsenal",
      "Manchester United",
      "Chelsea",
      "Liverpool",
      "Manchester City",
      "Real Madrid",
      "Barcelona"
    ],

    channels: ALL_CHANNELS.map(channel => channel.id),

    checkIntervalMinutes: CHECK_INTERVAL / 60000,

    quotaBlocked: Date.now() < quotaBlockedUntil,

    nextQuotaCheck: quotaBlockedUntil
      ? new Date(quotaBlockedUntil).toISOString()
      : null
  });
});

// ==================================
// START SERVER
// ==================================

app.listen(PORT, async () => {
  console.log(
    `KALID FOOTBALL GOAL ALERT running on port ${PORT}`
  );

  console.log("Monitoring only 7 selected teams.");

  console.log(
    `Football check interval: ${CHECK_INTERVAL / 60000} minutes`
  );

  if (!BOT_TOKEN || !API_KEY) {
    console.error(
      "Missing environment variables. Check Render settings."
    );
    return;
  }

  await sendStartupMessages();

  await checkFootball();

  setInterval(
    checkFootball,
    CHECK_INTERVAL
  );
});
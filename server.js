const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_KEY = process.env.DATASPORTSAPI_API_KEY;

const BASE_URL = "https://api.datasportsapi.com/v2";
const CHECK_INTERVAL = 5 * 60 * 1000;

// ===============================
// SETTINGS
// ===============================

const FAMOUS_LEAGUES = [
  "premier league",
  "la liga",
  "laliga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "champions league",
  "uefa champions league",
  "europa league",
  "uefa europa league",
  "conference league",
  "uefa conference league"
];

// Afaan Oromoo fi Amharic channels
const GENERAL_CHANNELS = [
  {
    id: "@KalidFootball",
    language: "om"
  },
  {
    id: "@KalidSportsNews",
    language: "am"
  },
  {
    id: "@oduu_sport01",
    language: "om"
  }
];

// Arsenal-only channels
const ARSENAL_CHANNELS = [
  {
    id: "@ETC_ARSENAL",
    language: "am"
  },
  {
    id: "@arsenal_america",
    language: "en"
  }
];

const ALL_CHANNELS = [
  ...GENERAL_CHANNELS,
  ...ARSENAL_CHANNELS
];

// ===============================
// MEMORY
// ===============================

const previousScores = new Map();
const announcedGoals = new Set();
const playerPhotoCache = new Map();

let checking = false;

// ===============================
// API REQUEST
// ===============================

async function apiGet(path, params = {}) {
  if (!API_KEY) {
    throw new Error("DATASPORTSAPI_API_KEY is missing");
  }

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

// ===============================
// TEXT HELPERS
// ===============================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// ===============================
// MATCH FILTERS
// ===============================

function isArsenalMatch(match) {
  const home = normalizeName(match.home?.name);
  const away = normalizeName(match.away?.name);

  return home === "arsenal" || away === "arsenal";
}

function isFamousLeague(match) {
  const league = normalizeName(match.league?.name);

  return FAMOUS_LEAGUES.includes(league);
}

function getChannelsForMatch(match) {
  const channels = [];

  // Famous league matches go to the general channels.
  if (isFamousLeague(match)) {
    channels.push(...GENERAL_CHANNELS);
  }

  // Arsenal matches go to Arsenal channels only.
  if (isArsenalMatch(match)) {
    channels.push(...ARSENAL_CHANNELS);
  }

  return channels;
}

// ===============================
// SCORE
// ===============================

function getScore(match) {
  return {
    home: Number(match.homeScore?.current ?? 0),
    away: Number(match.awayScore?.current ?? 0)
  };
}

// ===============================
// TELEGRAM TEXT MESSAGE
// ===============================

async function sendTelegram(chatId, text) {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      },
      {
        timeout: 20000
      }
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

// ===============================
// TELEGRAM PHOTO
// ===============================

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
      {
        timeout: 30000
      }
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

// ===============================
// PLAYER PHOTO
// ===============================

async function getPlayerPhoto(player, event) {
  const playerId =
    player?.id ||
    event?.playerId ||
    event?.player_id;

  // First try image already included in event.
  if (player?.image) {
    return player.image;
  }

  // No player ID means no profile lookup.
  if (!playerId) {
    return null;
  }

  // Use cached image to save API requests.
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

// ===============================
// MATCH EVENTS
// ===============================

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

// ===============================
// GOAL IDENTIFICATION
// ===============================

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

// ===============================
// LANGUAGE TEXT
// ===============================

function getGoalLabels(language) {
  if (language === "om") {
    return {
      goal: "GOOLII!",
      scorer: "Taphataa goolii galche",
      assist: "Assist",
      match: "Tapha",
      league: "Liigii"
    };
  }

  if (language === "am") {
    return {
      goal: "ጎል!",
      scorer: "ጎል ያስቆጠረው",
      assist: "አሲስት",
      match: "ጨዋታ",
      league: "ሊግ"
    };
  }

  return {
    goal: "GOAL!",
    scorer: "Goal scorer",
    assist: "Assist",
    match: "Match",
    league: "League"
  };
}

// ===============================
// GOAL CAPTION
// ===============================

function createGoalCaption(match, event, language) {
  const labels = getGoalLabels(language);

  const home = match.home?.name || "Home";
  const away = match.away?.name || "Away";

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

  caption += "\n\n🔥 KALID FOOTBALL GOAL ALERT";

  return caption.slice(0, 1000);
}

// ===============================
// SEND GOAL TO CHANNELS
// ===============================

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
      channel.language
    );

    let sent = false;

    // Try photo first.
    if (photo) {
      sent = await sendTelegramPhoto(
        channel.id,
        photo,
        caption
      );
    }

    // If photo is missing or fails, send text.
    if (!sent) {
      sent = await sendTelegram(
        channel.id,
        caption
      );
    }

    if (sent) {
      atLeastOneSent = true;

      console.log(
        "Goal sent:",
        fixtureId,
        channel.id
      );
    } else {
      console.log(
        "Goal could not be sent:",
        fixtureId,
        channel.id
      );
    }
  }

  return atLeastOneSent;
}

// ===============================
// CHECK FOOTBALL
// ===============================

async function checkFootball() {
  if (checking) return;

  checking = true;

  try {
    const response = await apiGet(
      "/livescores",
      {
        sport: "football"
      }
    );

    const allMatches = response?.data ?? [];

    if (!Array.isArray(allMatches)) {
      console.log("No valid match list received.");
      return;
    }

    // Famous leagues OR Arsenal matches.
    const matches = allMatches.filter(match =>
      isFamousLeague(match) || isArsenalMatch(match)
    );

    console.log(
      `Checking ${matches.length} selected matches`
    );

    for (const match of matches) {
      const fixtureId = match.id;

      if (!fixtureId) continue;

      const currentScore = getScore(match);

      // First time seeing this match:
      // save its current score as baseline.
      if (!previousScores.has(fixtureId)) {
        previousScores.set(
          fixtureId,
          currentScore
        );

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
        "Score changed:",
        match.home?.name,
        currentScore.home,
        "-",
        currentScore.away,
        match.away?.name
      );

      const events = await getMatchGoals(fixtureId);

      for (const event of events) {
        const goalKey = getGoalKey(fixtureId, event);

        if (announcedGoals.has(goalKey)) {
          continue;
        }

        const eventHome = Number(event.homeScore);
        const eventAway = Number(event.awayScore);

        // Only announce goals that explain the new score.
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

      // Update the saved score after processing events.
      previousScores.set(
        fixtureId,
        currentScore
      );
    }

  } catch (error) {
    console.error(
      "Football check error:",
      error.response?.data || error.message
    );

  } finally {
    checking = false;
  }
}

// ===============================
// STARTUP MESSAGES
// ===============================

async function sendStartupMessages() {
  for (const channel of ALL_CHANNELS) {
    let message;

    if (channel.language === "om") {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "Bot keenya hojii jalqabeera!\n" +
        "⚽ Odeeffannoo gooliiwwan yeroo qabatamaa hordofaa.";
    } else if (channel.language === "am") {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "ቦቱ ስራ ጀምሯል!\n" +
        "⚽ የጎል መረጃዎችን ይከታተሉ።";
    } else {
      message =
        "✅ <b>KALID FOOTBALL GOAL ALERT</b>\n\n" +
        "The bot is now online!\n" +
        "⚽ Follow live goal alerts here.";
    }

    await sendTelegram(
      channel.id,
      message
    );
  }
}

// ===============================
// SERVER ROUTES
// ===============================

app.get("/", (req, res) => {
  res.send("KALID FOOTBALL GOAL ALERT is running ⚽");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    bot: "KALID FOOTBALL GOAL ALERT"
  });
});

// ===============================
// START SERVER
// ===============================

app.listen(PORT, async () => {
  console.log(
    `KALID FOOTBALL GOAL ALERT running on port ${PORT}`
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
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

// ===== BOT =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== MongoDB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  username: String,
  name: String,
  number: String,
  pos: String,
  roundKey: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model("Bet", BetSchema);

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Helper: Current Round Key =====
function getCurrentRoundKey() {
  const now = new Date();
  return now.toISOString().split("T")[0]; // yyyy-mm-dd
}

// ===== Helper: Fetch Laos Result =====
async function fetchLatestFromLaosdev() {
  try {
    const resp = await axios.get("https://laosdev.net/");
    const html = resp.data;
    const m = html.match(/\b(\d{4})\b/);
    if (!m) return null;
    const d4 = m[1];
    return {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: getCurrentRoundKey()
    };
  } catch (e) {
    console.error("fetchLatestFromLaosdev error:", e);
    return null;
  }
}

// ===== Helper: Record Guess =====
async function recordGuess(user, guess, pos) {
  const roundKey = getCurrentRoundKey();
  const existing = await Bet.findOne({ userId: user.id, roundKey });
  if (existing) {
    return { success: false, guess: existing.number };
  }
  await Bet.create({
    userId: user.id,
    username: user.username || null,
    name: user.first_name || "",
    number: guess,
    pos,
    roundKey
  });
  return { success: true };
}

// ===== BOT Commands =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    "👋 ສະບາຍດີ! ເລືອກປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
          [{ text: "🔎 ກວດຜົນຫວຍ" }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// Handle Messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (/^\d{2}$/.test(text)) {
    bot.sendMessage(chatId, "➡️ ເລືອກຕຳແໜ່ງ:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔼 2 ຕົວເທິງ", callback_data: "TOP_" + text }],
          [{ text: "🔽 2 ຕົວລຸ່ມ", callback_data: "BOTTOM_" + text }]
        ]
      }
    });
  } else if (/^\d{3,4}$/.test(text)) {
    const result = await recordGuess(msg.from, text, null);
    if (result.success) {
      bot.sendMessage(chatId, `✅ ບັນທຶກແລ້ວ: ${text}`);
    } else {
      bot.sendMessage(chatId, `⚠️ ທ່ານສາມາດທາຍໄດ້ 1 ຄັ້ງຕໍ່ຮອບ\n(ເລກທີ່ທ່ານເຄີຍທາຍ: ${result.guess})`);
    }
  } else if (text.includes("ກວດຜົນ")) {
    const res = await fetchLatestFromLaosdev();
    if (res) {
      bot.sendMessage(chatId,
        `✅ ຜົນຫວຍລ່າສຸດ:\n` +
        `🏆 4 ຕົວ: ${res.digit4}\n` +
        `🥇 3 ຕົວທ້າຍ: ${res.digit3}\n` +
        `🥈 2 ຕົວເທິງ: ${res.digit2top}\n` +
        `🥈 2 ຕົວລຸ່ມ: ${res.digit2bottom}\n` +
        `📅 ວັນທີ: ${res.date}`
      );
    }
  }
});

// Handle Callback Query
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const from = cb.from;
  const [pos, guess] = cb.data.split("_");

  const result = await recordGuess(from, guess, pos);
  if (result.success) {
    bot.sendMessage(chatId, `✅ ບັນທຶກ: ${guess} (${pos === "TOP" ? "🔼 2 ຕົວເທິງ" : "🔽 2 ຕົວລຸ່ມ"})`);
  } else {
    bot.sendMessage(chatId, `⚠️ ທ່ານສາມາດທາຍໄດ້ 1 ຄັ້ງຕໍ່ຮອບ\n(ເລກທີ່ທ່ານເຄີຍທາຍ: ${result.guess})`);
  }
});

// ===== CRON SCHEDULE =====
cron.schedule("30 20 * * 1,3,5", async () => {
  const res = await fetchLatestFromLaosdev();
  if (!res) return;
  const guesses = await Bet.find({ roundKey: getCurrentRoundKey() });

  let winners = [];
  guesses.forEach(g => {
    let reward = 0;
    if (g.number === res.digit4) reward = 20000;
    else if (g.number === res.digit3) reward = 5000;
    else if (g.pos === "TOP" && g.number === res.digit2top) reward = 500;
    else if (g.pos === "BOTTOM" && g.number === res.digit2bottom) reward = 500;

    if (reward > 0) {
      const mention = g.username ? "@" + g.username : g.name;
      winners.push(`👤 ${mention} (${g.number}) ➝ +${reward} ເຄຣດິດ`);
    }
  });

  let msg =
    `🎉 ຜົນຫວຍລາວ ງວດ ${res.date}\n` +
    `═════════════════════\n` +
    `🏆 4 ຕົວ: ${res.digit4}\n` +
    `🥇 3 ຕົວທ້າຍ: ${res.digit3}\n` +
    `🥈 2 ຕົວເທິງ: ${res.digit2top}\n` +
    `🥈 2 ຕົວລຸ່ມ: ${res.digit2bottom}\n` +
    `═════════════════════\n\n`;

  if (winners.length > 0) {
    msg += "🏆 ຜູ້ຖືກລາງວັນ:\n" + winners.join("\n");
  } else {
    msg += "😢 ບໍ່ມີໃຜຖືກໃນງວດນີ້ 🍀";
  }

  bot.sendMessage(TARGET_GROUP_ID, msg);
  await Bet.deleteMany({ roundKey: getCurrentRoundKey() }); // reset รอบ
});

// ===== EXPRESS Health Check =====
app.get("/", (req, res) => {
  res.send("Lao Lotto Bot is running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

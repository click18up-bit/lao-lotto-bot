const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const SOURCE_URL = "https://laosdev.net/";

// ===== Telegram Bot =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== MongoDB Model =====
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Helper: ວັນຫວຍອອກ =====
function getLastLotteryDate() {
  const today = new Date();
  let d = new Date(today);
  const day = d.getDay(); // 0=Sun ... 6=Sat
  // หวยออก จันทร์ (1), พุธ (3), ศุกร์ (5)
  const lottoDays = [1, 3, 5];
  while (!lottoDays.includes(d.getDay()) || d > today) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

// ===== Helper: ດຶງຜົນຫວຍ =====
async function fetchLatestFromLaosdev() {
  try {
    const resp = await axios.get(SOURCE_URL);
    const html = resp.data;
    const m = html.match(/\b(\d{4})\b/);
    if (!m) return null;
    const d4 = m[1];
    return {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: getLastLotteryDate()
    };
  } catch (e) {
    console.error("fetch error", e);
    return null;
  }
}

// ===== Command /start =====
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "👋 ສະບາຍດີ! ກົດປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
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

// ===== Main Bot Logic =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = String(msg.from.id);

  if (text.includes("ກວດຜົນ")) {
    const res = await fetchLatestFromLaosdev();
    if (res) {
      bot.sendMessage(chatId,
        "✅ ຜົນຫວຍລ່າສຸດ:\n" +
        "🏆 4 ຕົວ: " + res.digit4 + "\n" +
        "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
        "🥈 2 ຕົວເທິງ: " + res.digit2top + "\n" +
        "🥈 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
        "📅 ວັນທີ: " + res.date
      );
    }
    return;
  }

  if (text.includes("ເລີ່ມເກມ")) {
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📌 ກົດກາ:\n" +
      "▪️ ທາຍໄດ້ 2-4 ຕົວເລກ\n" +
      "▪️ ຖ້າ 2 ຕົວ ຈະເລືອກ (ຂ້າງເທິງ / ຂ້າງລຸ່ມ)\n" +
      "▪️ 1 ຄົນ ທາຍໄດ້ 1 ຄັ້ງຕໍ່ຮອບ\n" +
      "🏆 ລາງວັນ:\n" +
      "▪️ 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "▪️ 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "▪️ 2 ຕົວເທິງ/ລຸ່ມ ➝ 500 ເຄຣດິດ"
    );
    return;
  }

  // ຖ້າເປັນ 2 ຕົວ
  if (/^\d{2}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວໃນຮອບນີ້.");
      return;
    }
    bot.sendMessage(chatId, "➡️ ເລືອກຕຳແໜ່ງ:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬆️ 2 ຕົວເທິງ", callback_data: "TOP_" + text }],
          [{ text: "⬇️ 2 ຕົວລຸ່ມ", callback_data: "BOTTOM_" + text }]
        ]
      }
    });
    return;
  }

  // ຖ້າເປັນ 3-4 ຕົວ
  if (/^\d{3,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວໃນຮອບນີ້.");
      return;
    }
    await Bet.create({ userId, number: text, pos: null, round });
    bot.sendMessage(chatId, "✅ ບັນທຶກແລ້ວ: " + text);
  }
});

// ===== Inline Button Handler =====
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const userId = String(cb.from.id);
  const data = cb.data.split("_");
  const pos = data[0];
  const guess = data[1];
  const round = getLastLotteryDate();

  const exist = await Bet.findOne({ userId, round });
  if (exist) {
    bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວໃນຮອບນີ້.");
    return;
  }

  await Bet.create({ userId, number: guess, pos, round });
  bot.sendMessage(chatId, "✅ ບັນທຶກ: " + guess + (pos === "TOP" ? " (2 ຕົວເທິງ)" : " (2 ຕົວລຸ່ມ)"));
});

// ===== Express health check =====
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

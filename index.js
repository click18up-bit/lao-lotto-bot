const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// MongoDB Schema
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// Connect MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Utilities =====
function getLastLotteryDate() {
  const now = new Date();
  let day = now.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  let diff = 0;

  if (day >= 1 && day < 3) diff = day - 1; // Mon
  else if (day >= 3 && day < 5) diff = day - 3; // Wed
  else if (day >= 5) diff = day - 5; // Fri
  else if (day === 0) diff = 2; // Sunday → last Fri

  const last = new Date(now);
  last.setDate(now.getDate() - diff);
  return last.toISOString().split("T")[0];
}

async function fetchLatestFromLaosdev() {
  try {
    const res = await axios.get("https://laosdev.net/");
    const html = res.data;
    const match = html.match(/\b(\d{4})\b/);
    if (!match) return null;
    const d4 = match[1];

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

// ===== Bot Logic =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
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

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text.includes("ກວດຜົນ")) {
    const result = await fetchLatestFromLaosdev();
    if (result) {
      bot.sendMessage(chatId,
        "✅ ຜົນຫວຍລ່າສຸດ:\n" +
        "🏆 4 ຕົວ: " + result.digit4 + "\n" +
        "🥇 3 ຕົວທ້າຍ: " + result.digit3 + "\n" +
        "🥈 2 ຕົວເທິງ: " + result.digit2top + "\n" +
        "🥈 2 ຕົວລຸ່ມ: " + result.digit2bottom + "\n" +
        "📅 ວັນທີ: " + result.date
      );
    }
    return;
  }

  if (text.includes("ເລີ່ມເກມ")) {
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📌 ກົດຕິກາ: ທາຍໄດ້ 1 ເທື່ອ/ຄົນ/ງວດ\n" +
      "🏆 ຮາງວັນ:\n" +
      "- 4 ຕົວຕົງ = 20,000 ເຄຣດິດ\n" +
      "- 3 ຕົວທ້າຍ = 5,000 ເຄຣດິດ\n" +
      "- 2 ຕົວເທິງ/ລຸ່ມ = 500 ເຄຣດິດ\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }
});

// Express Health Check
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

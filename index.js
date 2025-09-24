const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CONFIG =====
const BOT_TOKEN = process.env.BOT_TOKEN || "YOUR_BOT_TOKEN";
const MONGO_URI = process.env.MONGO_URI || "YOUR_MONGO_URI";
const SOURCE_URL = "https://laosdev.net/";

// ===== MongoDB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model("Bet", BetSchema);

// ===== Telegram Bot =====
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Helper: ວັນຫວຍອອກ =====
function getNextLotteryDate() {
  const today = new Date();
  const day = today.getDay();
  const drawDays = [1, 3, 5];
  let next = new Date(today);

  while (!drawDays.includes(next.getDay())) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString().split("T")[0];
}

// ===== Helper: ດຶງຜົນຫວຍ =====
async function fetchLatestFromLaosdev() {
  try {
    const resp = await axios.get(SOURCE_URL);
    const html = resp.data;

    const match = html.match(/\b(\d{4})\b/);
    if (!match) return null;

    const d4 = match[1];
    return {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: getNextLotteryDate()
    };
  } catch (e) {
    console.error("fetchLatestFromLaosdev error:", e);
    return null;
  }
}

// ===== Start Command =====
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

// ===== ຮັບຂໍ້ຄວາມ =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text) return;

  if (text.includes("ເລີ່ມເກມ")) {
    await Bet.deleteMany({});

    let rules =
      "📜 *ກົດກາ*:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2 ຫຼື 4 ຫຼັກ\n" +
      "   - ຖ້າ 2 ຫຼັກ ຈະເລືອກ *ເທິງ* ຫຼື *ລຸ່ມ*\n" +
      "   - ຖ້າ 3-4 ຫຼັກ ບັນທຶກທັນທີ\n\n" +
      "🏆 *ລາງວັນ*:\n" +
      "🎖 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "🥈 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "🥈 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n";

    const nextDate = getNextLotteryDate();

    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      rules +
      "📅 ປະກາດຜົນ: " + nextDate + " ເວລາ 20:30\n" +
      "🕣 ປິດຮັບ: 20:25\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ",
      { parse_mode: "Markdown" }
    );
    return;
  }

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

  if (/^\d{2}$/.test(text)) {
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

  if (/^\d{3,4}$/.test(text)) {
    const exist = await Bet.findOne({ userId: chatId });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວ!");
      return;
    }
    await Bet.create({ userId: chatId, number: text });
    bot.sendMessage(chatId, `✅ ບັນທຶກແລ້ວ: ${text}`);
    return;
  }
});

bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const choice = cb.data.split("_");
  const pos = choice[0];
  const number = choice[1];

  const exist = await Bet.findOne({ userId: chatId });
  if (exist) {
    bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວ!");
    return;
  }

  await Bet.create({ userId: chatId, number, pos });
  bot.sendMessage(chatId, `✅ ບັນທຶກ: ${number} (${pos === "TOP" ? "2 ຕົວເທິງ" : "2 ຕົວລຸ່ມ"})`);
});

app.get("/", (req, res) => {
  res.send("Lao Lotto Bot is running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

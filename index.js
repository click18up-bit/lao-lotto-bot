const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",");

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Schema ผลรางวัล
const ResultSchema = new mongoose.Schema({
  round: String,
  numbers: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model("Result", ResultSchema);

// Schema โพย
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model("Bet", BetSchema);

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Mongo Error", err));

bot.onText(/\/start/, (msg) => {
  const opts = {
    reply_markup: {
      keyboard: [
        ["🎲 ເລີ່ມທາຍເລກ"],
        ["🔎 ຜົນຫວຍ"]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ເລືອກປຸ່ມຂ້າງລຸ່ມເພື່ອເລີ່ມ", opts);
});

// ปุ่มเริ่มทายเลข
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2, 3 ຫຼື 4 ຕົວ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວບນ ➝ 5,000 ເຄຣດິດ\n" +
      "⬆️ 2 ຕົວບນ ➝ 500 ເຄຣດິດ\n\n" +
      "📅 ປະກາດຜົນ: 21:00 ໂມງ\n" +
      "🕣 ປິດຮັບ: 20:25 ໂມງ\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອຮ່ວມສົນຸກ"
    );
  }

  if (text === "🔎 ຜົນຫວຍ") {
    const results = await Result.find().sort({ createdAt: -1 }).limit(5);
    if (results.length === 0) {
      bot.sendMessage(chatId, "❌ ຍັງບໍ່ມີຜົນຫວຍທີ່ບັນທຶກໄວ້");
    } else {
      let reply = "📊 ຜົນຫວຍຍ້ອນຫຼັງ:\n\n";
      results.forEach(r => {
        reply += `📅 ${r.round} ➝ ${r.numbers}\n`;
      });
      bot.sendMessage(chatId, reply);
    }
  }
});

// Cron แจ้งเตือนแอดมินตอน 20:30
cron.schedule("30 20 * * 1,3,5", () => {
  bot.sendMessage(SUPER_ADMIN_ID, "⚠️ กรุณากรอกผลรางวัลหวยลาวก่อนเวลา 21:00 น.");
}, { timezone: "Asia/Bangkok" });

// Cron ประกาศผลตอน 21:00
cron.schedule("0 21 * * 1,3,5", async () => {
  const lastResult = await Result.findOne().sort({ createdAt: -1 });
  if (!lastResult) return;
  let message = "🏆 ປະກາດຜົນຫວຍລາວ 🏆\n\n";
  message += `📅 ${lastResult.round}\n🎯 ເລກທີ່ອອກ: ${lastResult.numbers}\n`;
  bot.sendMessage(TARGET_GROUP_ID, message);
}, { timezone: "Asia/Bangkok" });

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

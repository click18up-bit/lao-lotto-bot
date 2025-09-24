
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// MongoDB Model
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

// คำนวณวันหวยออกล่าสุด (จันทร์/พุธ/ศุกร์)
function getLastLotteryDate() {
  const today = new Date();
  let day = today.getDay(); // 0=อาทิตย์,1=จันทร์,...6=เสาร์
  let offset = 0;

  if (day >= 1 && day <= 5) {
    if (day === 2 || day === 4) {
      offset = day - 1;
    } else if (day === 1 || day === 3 || day === 5) {
      offset = 0;
    }
  } else if (day === 0) {
    offset = 2;
  } else if (day === 6) {
    offset = 1;
  }

  const d = new Date(today);
  d.setDate(today.getDate() - offset);
  return d.toISOString().split("T")[0];
}

// ดึงผลหวย (mock)
async function fetchLatestResult() {
  const d4 = "2025"; // mock
  return {
    digit4: d4,
    digit3: d4.slice(1),
    digit2top: d4.slice(2),
    digit2bottom: d4.slice(0, 2),
    date: getLastLotteryDate()
  };
}

// Start command
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ກົດປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.", {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }]
      ],
      resize_keyboard: true
    }
  });
});

// รับข้อความ
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    bot.sendMessage(chatId,
      "📜 ກົດກາ: ທ່ານສາມາດທາຍເລກໄດ້ 1 ເທື່ອຕໍ່ຮອບ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "🎖 4 ຕົວຖືກ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "🥈 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "🥈 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກເພື່ອທາຍ"
    );
    return;
  }

  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await fetchLatestResult();
    bot.sendMessage(chatId,
      "✅ ຜົນຫວຍລ່າສຸດ:\n" +
      "🏆 4 ຕົວ: " + res.digit4 + "\n" +
      "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
      "🥈 2 ຕົວເທິງ: " + res.digit2top + "\n" +
      "🥈 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
      "📅 ວັນທີ: " + res.date
    );
    return;
  }

  if (/^\d{2,4}$/.test(text)) {
    const exist = await Bet.findOne({ userId: chatId });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    await Bet.create({ userId: chatId, number: text });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
  }
});

// Express health check
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

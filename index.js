const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== MongoDB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  username: String,
  number: String,
  pos: String,
  roundDate: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== Utils =====
function getNextLotteryDate() {
  const days = [1, 3, 5]; // Mon, Wed, Fri
  const today = new Date();
  let d = new Date(today);
  while (!days.includes(d.getDay())) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split('T')[0];
}

function getLatestLotteryDate() {
  const days = [1, 3, 5];
  const today = new Date();
  let d = new Date(today);
  while (!days.includes(d.getDay())) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

// ===== Telegram Bot Handlers =====
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
  const userId = String(msg.from.id);
  const username = msg.from.username || msg.from.first_name;

  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    const nextDate = getNextLotteryDate();
    await Bet.deleteMany({ roundDate: nextDate }); // reset รอบใหม่
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!

" +
      "📜 ກົດກາ: ທຸກຄົນສາມາດທາຍໄດ້ 1 ເທື່ອ/ງວດ
" +
      "🏆 ລາງວັນ:
" +
      "   • 4 ຕົວຕົງ ➝ +20000 ເຄຣດິດ
" +
      "   • 3 ຕົວທ້າຍ ➝ +5000 ເຄຣດິດ
" +
      "   • 2 ຕົວເທິງ/ລຸ່ມ ➝ +500 ເຄຣດິດ

" +
      "📅 ປິດຮັບ: 20:00 ກ່ອນປະກາດຜົນ

" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  if (/^\d{2}$/.test(text)) {
    bot.sendMessage(chatId, "➡️ ເລືອກຕຳແໜ່ງ:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "⬆️ 2 ຕົວເທິງ", callback_data: `TOP_${text}` }],
          [{ text: "⬇️ 2 ຕົວລຸ່ມ", callback_data: `BOTTOM_${text}` }]
        ]
      }
    });
    return;
  }

  if (/^\d{3,4}$/.test(text)) {
    const roundDate = getNextLotteryDate();
    const exist = await Bet.findOne({ userId, roundDate });
    if (exist) {
      bot.sendMessage(chatId, `⚠️ ທ່ານເຄີຍທາຍແລ້ວ: ${exist.number}`);
    } else {
      await Bet.create({ userId, username, number: text, roundDate });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
    }
  }
});

bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const userId = String(cb.from.id);
  const username = cb.from.username || cb.from.first_name;
  const [pos, number] = cb.data.split("_");

  const roundDate = getNextLotteryDate();
  const exist = await Bet.findOne({ userId, roundDate });
  if (exist) {
    bot.sendMessage(chatId, `⚠️ ທ່ານເຄີຍທາຍແລ້ວ: ${exist.number}`);
  } else {
    await Bet.create({ userId, username, number, pos, roundDate });
    bot.sendMessage(chatId, `✅ ບັນທຶກ: ${number} (${pos === "TOP" ? "2 ຕົວເທິງ" : "2 ຕົວລຸ່ມ"})`);
  }
});

// ===== ประกาศผล (manual trigger) =====
async function announceResult() {
  try {
    const res = await axios.get("https://laosdev.net/");
    const match = res.data.match(/\b(\d{4})\b/);
    if (!match) return;

    const d4 = match[1];
    const result = {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: getLatestLotteryDate()
    };

    const bets = await Bet.find({ roundDate: result.date });
    let winners = [];

    for (const b of bets) {
      let reward = 0;
      if (b.number === result.digit4) reward = 20000;
      else if (b.number === result.digit3) reward = 5000;
      else if (b.pos === "TOP" && b.number === result.digit2top) reward = 500;
      else if (b.pos === "BOTTOM" && b.number === result.digit2bottom) reward = 500;

      if (reward > 0) {
        winners.push(`👤 ${b.username} ➝ ${b.number} ➝ +${reward} ເຄຣດິດ`);
      }
    }

    let msg =
      `🎉 ຜົນຫວຍລາວ ງວດ ${result.date}\n` +
      `═════════════════════\n` +
      `🏆 4 ຕົວ: ${result.digit4}\n` +
      `🥇 3 ຕົວທ້າຍ: ${result.digit3}\n` +
      `🥈 2 ຕົວເທິງ: ${result.digit2top}\n` +
      `🥈 2 ຕົວລຸ່ມ: ${result.digit2bottom}\n` +
      `═════════════════════\n\n`;

    if (winners.length > 0) {
      msg += "🏆 ຜູ້ຖືກລາງວັນ:\n" + winners.join("\n");
    } else {
      msg += "😢 ບໍ່ມີໃຜຖືກໃນງວດນີ້";
    }

    bot.sendMessage(chatId, msg);
  } catch (e) {
    console.error("announceResult error:", e);
  }
}

app.get('/', (req, res) => res.send("Lao Lotto Bot 🚀"));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

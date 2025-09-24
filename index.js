const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== MongoDB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,   // top/bottom (ถ้าเลือก 2 หลัก)
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== หาวันหวยออกล่าสุด (จันทร์/พุธ/ศุกร์) =====
function getLastLotteryDate() {
  const today = new Date();
  const lottoDays = [1, 3, 5]; // Mon, Wed, Fri
  let d = new Date(today);
  while (!lottoDays.includes(d.getDay()) || d > today) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

// ===== Mock ดึงผลหวย (แก้เป็น API จริงได้) =====
async function fetchLatestResult() {
  const d4 = "2025"; // mock result
  return {
    digit4: d4,
    digit3: d4.slice(1),
    digit2top: d4.slice(2),
    digit2bottom: d4.slice(0, 2),
    date: getLastLotteryDate()
  };
}

// ===== ประกาศผลอัตโนมัติ =====
async function announceResult() {
  const res = await fetchLatestResult();
  let msg =
    "🎉 ຜົນຫວຍລາວ ງວດ " + res.date + "\n" +
    "═════════════════════\n" +
    "🏆 4 ຕົວ: " + res.digit4 + "\n" +
    "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
    "🥈 2 ຕົວເທິງ: " + res.digit2top + "\n" +
    "🥈 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
    "═════════════════════\n\n" +
    "🎊 ຂອບໃຈທຸກຄົນທີ່ຮ່ວມສົນຸກ!";
  bot.sendMessage(TARGET_GROUP_ID, msg);
}

// ตั้งเวลา จันทร์/พุธ/ศุกร์ 20:30
cron.schedule("30 20 * * 1,3,5", () => {
  announceResult();
});

// ===== คำสั่งเริ่มต้น =====
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

// ===== ฟังข้อความ =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // เริ่มทายเลข
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    await Bet.deleteMany({ round: getLastLotteryDate() }); // reset รอบใหม่
    const roundDate = getLastLotteryDate();
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2 ຫຼື 4 ຫຼັກ\n" +
      "   - ຖ້າ 2 ຫຼັກ ຈະເລືອກ ເທິງ ຫຼື ລຸ່ມ\n" +
      "   - ຖ້າ 3-4 ຫຼັກ ບັນທຶກທັນທີ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "🎖 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "🥈 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "🥈 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n" +
      `📅 ປະກາດຜົນ: ${roundDate} ເວລາ 20:30\n` +
      "🕣 ປິດຮັບ: 20:25\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // กดปุ่มตรวจผล
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

  // ผู้ใช้พิมพ์เลข
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }
    await Bet.create({ userId: chatId, number: text, round });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
  }
});

// ===== Express health check =====
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

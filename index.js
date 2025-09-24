const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const ADMIN_ID = "1351945799"; // ID แอดมิน

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// MongoDB Schema
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,   // ใช้สำหรับเลข 2 ตัว (top/bottom)
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// Connect MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ========== Helper functions ========== */

// วันหวยออก (จันทร์/พุธ/ศุกร์)
function getLastLotteryDate() {
  const today = new Date();
  const lottoDays = [1, 3, 5]; // Mon, Wed, Fri
  let d = new Date(today);
  while (!lottoDays.includes(d.getDay()) || d > today) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

function getNextLotteryDate() {
  const today = new Date();
  const lottoDays = [1, 3, 5];
  let d = new Date(today);
  while (!lottoDays.includes(d.getDay()) || d <= today) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().split("T")[0];
}

// ดึงผลหวยลาวจาก laosdev (mock scraping, ต้องปรับ selector ให้ตรง)
async function fetchLatestResult() {
  try {
    const res = await axios.get("https://laosdev.net/lotto");
    const html = res.data;

    // TODO: ใช้ cheerio แกะค่าออกมา เช่น digit4, digit3, digit2top, digit2bottom
    // ตอนนี้ขอ mock ค่าไว้ก่อน
    const d4 = "2025";
    return {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: getLastLotteryDate()
    };
  } catch (err) {
    console.error("❌ Fetch result error:", err);
    return {
      digit4: "--",
      digit3: "--",
      digit2top: "--",
      digit2bottom: "--",
      date: getLastLotteryDate()
    };
  }
}

/* ========== ประกาศผลหวย ========== */
async function announceResult() {
  const res = await fetchLatestResult();

  // หาผู้ถูกรางวัล
  const winners4 = await Bet.find({ number: res.digit4, round: res.date });
  const winners3 = await Bet.find({ number: res.digit3, round: res.date });
  const winners2top = await Bet.find({ number: res.digit2top, pos: "top", round: res.date });
  const winners2bottom = await Bet.find({ number: res.digit2bottom, pos: "bottom", round: res.date });

  let msg =
    "🎉 ຜົນຫວຍລາວ ງວດ " + res.date + "\n" +
    "═════════════════════\n" +
    "👑 4 ຕົວ: " + res.digit4 + (winners4.length ? "\n   🎯 ผู้ถูกรางวัล: " + winners4.map(w => "🧑‍💻 " + w.userId).join(", ") : "") + "\n" +
    "🥇 3 ຕົວທ້າຍ: " + res.digit3 + (winners3.length ? "\n   🎯 ผู้ถูกรางวัล: " + winners3.map(w => "🧑‍💻 " + w.userId).join(", ") : "") + "\n" +
    "⬆️ 2 ຕົວເທິງ: " + res.digit2top + (winners2top.length ? "\n   🎯 ผู้ถูกรางวัล: " + winners2top.map(w => "🧑‍💻 " + w.userId).join(", ") : "") + "\n" +
    "⬇️ 2 ຕົວລຸ່ມ: " + res.digit2bottom + (winners2bottom.length ? "\n   🎯 ผู้ถูกรางวัล: " + winners2bottom.map(w => "🧑‍💻 " + w.userId).join(", ") : "") + "\n" +
    "═════════════════════\n\n" +
    "🎊 ຂອບໃຈທຸກຄົນທີ່ຮ່ວມສົນຸກ!";
  bot.sendMessage(TARGET_GROUP_ID, msg);
}

/* ========== Cron Job ========== */
// Render ใช้ UTC → 20:30 ลาว = 13:30 UTC
cron.schedule("30 13 * * 1,3,5", () => announceResult());

/* ========== คำสั่ง /start ========== */
bot.onText(/\/start/, (msg) => {
  const isAdmin = msg.from && msg.from.id && msg.from.id.toString() === ADMIN_ID;
  bot.sendMessage(
    msg.chat.id,
    "👋 ສະບາຍດີ! ກົດປຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
          [{ text: "🔎 ກວດຜົນຫວຍ" }],
          ...(isAdmin ? [[{ text: "♻️ Reset รอบ" }]] : [])
        ],
        resize_keyboard: true
      }
    }
  );
});

/* ========== ฟังข้อความ ========== */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  console.log("📩 Message received:", { chatId, text });

  // Start new round
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    await Bet.deleteMany({ round: getLastLotteryDate() });
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2 ຫຼື 4 ຫຼັກ\n" +
      "   - ຖ້າ 2 ຫຼັກ ຈະເລືອກ ເທິງ ຫຼື ລຸ່ມ\n" +
      "   - ຖ້າ 3-4 ຫຼັກ ບັນທຶກທັນທີ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "⬆️ 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "⬇️ 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n" +
      "📅 ປະກາດຜົນ: " + getNextLotteryDate() + " ເວລາ 20:30\n" +
      "🕣 ປິດຮັບ: 20:25\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // Check result
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await fetchLatestResult();
    bot.sendMessage(chatId,
      "✅ ຜົນຫວຍລ່າສຸດ:\n" +
      "👑 4 ຕົວ: " + res.digit4 + "\n" +
      "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
      "⬆️ 2 ຕົວເທິງ: " + res.digit2top + "\n" +
      "⬇️ 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
      "📅 ວັນທີ: " + res.date
    );
    return;
  }

  // Reset by admin
  if (text === "♻️ Reset รอบ" && msg.from.id.toString() === ADMIN_ID) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId, "♻️ ล้างข้อมูลการทายทั้งหมดแล้ว (โดยแอดมิน)");
    return;
  }

  // User bet 2–4 digits
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    if (text.length === 2) {
      bot.sendMessage(chatId, "➡️ ເລືອກວ່າຈະ ⬆️ ຂ້າງເທິງ ຫຼື ⬇️ ຂ້າງລຸ່ມ", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬆️ ເທິງ", callback_data: `bet:${text}:top` }],
            [{ text: "⬇️ ລຸ່ມ", callback_data: `bet:${text}:bottom` }]
          ]
        }
      });
    } else {
      await Bet.create({ userId: chatId, number: text, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
    }
  }
});

/* ========== จัดการปุ่ม Inline (⬆️/⬇️) ========== */
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  if (data.startsWith("bet:")) {
    const [, number, pos] = data.split(":");
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
    } else {
      await Bet.create({ userId: chatId, number, pos, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} (${pos === "top" ? "⬆️ ເທິງ" : "⬇️ ລຸ່ມ"}) ຂອງທ່ານແລ້ວ`);
    }
  }

  bot.answerCallbackQuery(cb.id);
});

/* ========== Express health check ========== */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

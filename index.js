const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const ADMIN_ID = "1351945799"; // ID แอดมิน

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* ================= Schema ================= */
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  pos: String, // top / bottom
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

/* ================= Connect DB ================= */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ================= Helper ================= */
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

/* ================= Fetch Latest Result ================= */
async function fetchLatestResult() {
  try {
    const res = await axios.get("https://laodl.com/");
    const $ = cheerio.load(res.data);

    // ดึงตัวเลขจาก div.result6 → child div
    const numbers = $(".result6 div")
      .map((i, el) => $(el).text().trim())
      .get();

    console.log("Numbers fetched:", numbers);

    const digit4 = numbers.slice(0, 4).join("");
    const digit3 = numbers.slice(4, 7).join("");
    const digit2bottom = numbers.slice(7, 9).join("");
    const digit2top = digit4.slice(-2);

    const date = getLastLotteryDate();

    return { date, digit4, digit3, digit2top, digit2bottom };
  } catch (err) {
    console.error("❌ fetchLatestResult error:", err.message);
    return { date: "--", digit4: "--", digit3: "--", digit2top: "--", digit2bottom: "--" };
  }
}

/* ================= Fetch Previous Result ================= */
async function fetchPreviousResult() {
  try {
    const res = await axios.get("https://laodl.com/");
    const $ = cheerio.load(res.data);

    const row = $("table tbody tr").eq(1);
    const date = row.find("td").eq(0).text().trim();
    const digit4 = row.find("td").eq(1).text().trim();
    const digit3 = row.find("td").eq(2).text().trim();
    const digit2bottom = row.find("td").eq(3).text().trim();
    const digit2top = digit4.slice(-2);

    return { date, digit4, digit3, digit2top, digit2bottom };
  } catch (err) {
    console.error("❌ fetchPreviousResult error:", err.message);
    return { date: "--", digit4: "--", digit3: "--", digit2top: "--", digit2bottom: "--" };
  }
}

/* ================= Announce Result ================= */
async function announceResult() {
  const res = await fetchLatestResult();

  const winners4 = await Bet.find({ number: res.digit4, round: res.date });
  const winners3 = await Bet.find({ number: res.digit3, round: res.date });
  const winners2top = await Bet.find({ number: res.digit2top, pos: "top", round: res.date });
  const winners2bottom = await Bet.find({ number: res.digit2bottom, pos: "bottom", round: res.date });

  let msg =
    "🎉 ຜົນຫວຍລາວ ງວດ " + res.date + "\n" +
    "═════════════════════\n" +
    "👑 4 ຕົວ: " + res.digit4 +
    (winners4.length ? "\n   🎯 " + winners4.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
    "🥇 3 ຕົວທ້າຍ: " + res.digit3 +
    (winners3.length ? "\n   🎯 " + winners3.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
    "⬆️ 2 ຕົວເທິງ: " + res.digit2top +
    (winners2top.length ? "\n   🎯 " + winners2top.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
    "⬇️ 2 ຕົວລຸ່ມ: " + res.digit2bottom +
    (winners2bottom.length ? "\n   🎯 " + winners2bottom.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
    "═════════════════════\n\n" +
    "🎊 ຂອບໃຈທຸກຄົນທີ່ຮ່ວມສົນຸກ!";

  bot.sendMessage(TARGET_GROUP_ID, msg);
}

/* ================= Cron ================= */
// Render = UTC, 20:30 Laos = 13:30 UTC
cron.schedule("30 13 * * 1,3,5", () => announceResult());

/* ================= Start ================= */
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
          [{ text: "📅 ຜົນງວດທີ່ຜ່ານມາ" }],
          ...(isAdmin ? [[{ text: "♻️ Reset รอบ" }]] : [])
        ],
        resize_keyboard: true
      }
    }
  );
});

/* ================= Message Handler ================= */
// ... (ส่วนนี้เหมือนเดิม ไม่เปลี่ยน)

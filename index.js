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

    const digit4 = $(".result6").slice(0, 4).map((i, el) => $(el).text().trim()).get().join("");
    const digit3 = $(".result6").slice(4, 7).map((i, el) => $(el).text().trim()).get().join("");
    const digit2bottom = $(".result6").slice(7, 9).map((i, el) => $(el).text().trim()).get().join("");
    const digit2top = digit4.slice(-2);

    const date = getLastLotteryDate(); // ใช้วันหวยออกล่าสุด (จันทร์/พุธ/ศุกร์)

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
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (!text) return;

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

  // Check result (latest)
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await fetchLatestResult();
    const winners4 = await Bet.find({ number: res.digit4, round: res.date });
    const winners3 = await Bet.find({ number: res.digit3, round: res.date });
    const winners2top = await Bet.find({ number: res.digit2top, pos: "top", round: res.date });
    const winners2bottom = await Bet.find({ number: res.digit2bottom, pos: "bottom", round: res.date });

    let msg =
      "✅ ຜົນຫວຍລ່າສຸດ:\n" +
      "👑 4 ຕົວ: " + res.digit4 +
      (winners4.length ? "\n   🎯 " + winners4.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
      "🥇 3 ຕົວທ້າຍ: " + res.digit3 +
      (winners3.length ? "\n   🎯 " + winners3.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
      "⬆️ 2 ຕົວເທິງ: " + res.digit2top +
      (winners2top.length ? "\n   🎯 " + winners2top.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
      "⬇️ 2 ຕົວລຸ່ມ: " + res.digit2bottom +
      (winners2bottom.length ? "\n   🎯 " + winners2bottom.map(w => "🧑 " + w.name).join(", ") : "") + "\n" +
      "📅 ວັນທີ: " + res.date;

    bot.sendMessage(chatId, msg);
    return;
  }

  // Previous result
  if (text === "📅 ຜົນງວດທີ່ຜ່ານມາ") {
    const prev = await fetchPreviousResult();
    let msg =
      "📅 ຜົນງວດທີ່ຜ່ານມາ\n" +
      "═════════════════════\n" +
      "👑 4 ຕົວ: " + prev.digit4 + "\n" +
      "🥇 3 ຕົວທ້າຍ: " + prev.digit3 + "\n" +
      "⬇️ 2 ຕົວລຸ່ມ: " + prev.digit2bottom + "\n" +
      "🗓 ວັນທີ: " + prev.date + "\n" +
      "═════════════════════";

    bot.sendMessage(chatId, msg);
    return;
  }

  // Reset by admin
  if (text === "♻️ Reset รอบ" && msg.from.id.toString() === ADMIN_ID) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນການທາຍທັງໝົດແລ້ວ (ໂດຍແອດມິນ)");
    return;
  }

  // Bet 2–4 digits
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    if (text.length === 2) {
      bot.sendMessage(chatId, "➡️ ເລືອກວ່າຈະ ⬆️ ເທິງ ຫຼື ⬇️ ລຸ່ມ", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⬆️ ເທິງ", callback_data: `bet:${text}:top:${msg.from.first_name}` }],
            [{ text: "⬇️ ລຸ່ມ", callback_data: `bet:${text}:bottom:${msg.from.first_name}` }]
          ]
        }
      });
    } else {
      await Bet.create({ userId: chatId, name: msg.from.first_name, number: text, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
    }
  }
});

/* ================= Callback (inline button) ================= */
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  if (data.startsWith("bet:")) {
    const [, number, pos, name] = data.split(":");
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
    } else {
      await Bet.create({ userId: chatId, name, number, pos, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} (${pos === "top" ? "⬆️ ເທິງ" : "⬇️ ລຸ່ມ"}) ຂອງທ່ານແລ້ວ`);
    }
  }

  bot.answerCallbackQuery(cb.id);
});

/* ================= Express Health ================= */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

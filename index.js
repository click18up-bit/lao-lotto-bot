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
const ADMIN_ID = (process.env.ADMIN_ID || '1351945799').toString();

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* ========== MongoDB Schema ========== */
const BetSchema = new mongoose.Schema({
  userId: String,       // Telegram user id (from.id)
  username: String,     // @username (optional)
  firstName: String,    // display name
  number: String,       // guessed number (2-4 digits as text)
  pos: String,          // "top" | "bottom" (only for 2 digits)
  round: String,        // draw date YYYY-MM-DD
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

/* ========== Connect MongoDB ========== */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ========== Helpers ========== */
// Last Lao lotto date (Mon/Wed/Fri). If today < 20:30, use previous draw day.
function getLastLotteryDate() {
  const now = new Date();
  const lottoDays = [1, 3, 5]; // Mon=1, Wed=3, Fri=5
  let d = new Date(now);

  const beforeAnnouncement =
    now.getHours() < 20 || (now.getHours() === 20 && now.getMinutes() < 30);

  if (!lottoDays.includes(d.getDay()) || beforeAnnouncement) {
    do {
      d.setDate(d.getDate() - 1);
    } while (!lottoDays.includes(d.getDay()));
  }
  return d.toISOString().split("T")[0];
}
const cleanDigits = (s) => (s || '').replace(/[^\d]/g, '').trim();

/* ========== Scrape results from laosdev.net ========== */
/*
  อ้างอิงจาก DOM ที่คุณส่งมา:
  - 4 ตัว:        .last4Prize
  - 3 ตัวท้าย:     .last3Prize
  - 2 ตัวบน:       .digit2_top
  - 2 ตัวล่าง:     .digit2_bottom
*/
async function fetchLatestResult() {
  try {
    const { data } = await axios.get('https://laosdev.net/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LottoBot/1.0)' }
    });
    const $ = cheerio.load(data);

    const digit4 = cleanDigits($(".last4Prize").first().text());
    const digit3 = cleanDigits($(".last3Prize").first().text());
    const digit2top = cleanDigits($(".digit2_top").first().text());
    const digit2bottom = cleanDigits($(".digit2_bottom").first().text());

    return {
      digit4: digit4 || "----",
      digit3: digit3 || "---",
      digit2top: digit2top || "--",
      digit2bottom: digit2bottom || "--"
    };
  } catch (err) {
    console.error("❌ Error fetching lotto:", err.message);
    return { digit4: "----", digit3: "---", digit2top: "--", digit2bottom: "--" };
  }
}

/* ========== Winners formatting ========== */
function formatWinners(arr, emoji) {
  if (!arr || arr.length === 0) return "❌ ບໍ່ມີຄົນຖືກ";
  // unique by userId to avoid duplicates
  const seen = new Set();
  const lines = [];
  for (const u of arr) {
    if (seen.has(u.userId)) continue;
    seen.add(u.userId);
    const label = u.username ? u.username : (u.firstName || u.userId);
    lines.push(`${emoji} ${label}`);
  }
  return lines.join("\n");
}

/* ========== Auto announce results ========== */
async function announceResult() {
  const res = await fetchLatestResult();
  const lastDate = getLastLotteryDate();
  const bets = await Bet.find({ round: lastDate });

  const winners4 = bets.filter(b => b.number === res.digit4);
  const winners3 = bets.filter(b => b.number === res.digit3);
  const winners2top = bets.filter(b => b.number === res.digit2top && b.pos === "top");
  const winners2bottom = bets.filter(b => b.number === res.digit2bottom && b.pos === "bottom");

  let msg =
    `🎉 ຜົນຫວຍລາວ ງວດ ${lastDate}\n` +
    "═════════════════════\n" +
    `🏆 4 ຕົວ: ${res.digit4}\n` + formatWinners(winners4, "👑") + "\n\n" +
    `🥇 3 ຕົວທ້າຍ: ${res.digit3}\n` + formatWinners(winners3, "🏅") + "\n\n" +
    `⬆️ 2 ຕົວເທິງ: ${res.digit2top}\n` + formatWinners(winners2top, "⬆️") + "\n\n" +
    `⬇️ 2 ຕົວລຸ່ມ: ${res.digit2bottom}\n` + formatWinners(winners2bottom, "⬇️") + "\n" +
    "═════════════════════\n\n" +
    "🎊 ຂອບໃຈທຸກຄົນທີ່ຮ່ວມສົນຸກ!";

  if (TARGET_GROUP_ID) {
    bot.sendMessage(TARGET_GROUP_ID, msg);
  } else {
    console.warn("⚠️ TARGET_GROUP_ID not set; announcement not sent.");
  }
}

/* ========== Cron: Mon/Wed/Fri 20:30 server time ========== */
cron.schedule("30 13 * * 1,3,5", () => announceResult());

/* ========== Keyboards ========== */
function getKeyboard(isAdmin) {
  const base = [
    [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
    [{ text: "🔎 ກວດຜົນຫວຍ" }]
  ];
  if (isAdmin) base.push([{ text: "🔄 Reset ຮອບນີ້" }]);
  return { keyboard: base, resize_keyboard: true };
}

/* ========== /start ========== */
bot.onText(/\/start/, (msg) => {
  const isAdmin = msg.from && msg.from.id && msg.from.id.toString() === ADMIN_ID;
  bot.sendMessage(
    msg.chat.id,
    "👋 ສະບາຍດີ! ກົດປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    { reply_markup: getKeyboard(isAdmin) }
  );
});

/* ========== Message handler ========== */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  // 🎲 Start round
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    await Bet.deleteMany({ round: getLastLotteryDate() }); // reset current round
    const roundDate = getLastLotteryDate();
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2 ຫຼື 4 ຫຼັກ\n" +
      "   - ຖ້າ 2 ຫຼັກ ຈະເລືອກ ⬆️ ຫຼື ⬇️\n" +
      "   - ຖ້າ 3-4 ຫຼັກ ບັນທຶກທັນທີ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🏅 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "⬆️ 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "⬇️ 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n" +
      `📅 ປະກາດຜົນ: ${roundDate} ເວລາ 20:30\n` +
      "🕣 ປິດຮັບ: 20:25\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // 🔎 Check latest result
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await fetchLatestResult();
    const lastDate = getLastLotteryDate();
    bot.sendMessage(chatId,
      "✅ ຜົນຫວຍລ່າສຸດ:\n" +
      `👑 4 ຕົວ: ${res.digit4}\n` +
      `🏅 3 ຕົວທ້າຍ: ${res.digit3}\n` +
      `⬆️ 2 ຕົວເທິງ: ${res.digit2top}\n` +
      `⬇️ 2 ຕົວລຸ່ມ: ${res.digit2bottom}\n` +
      `📅 ວັນທີ: ${lastDate}`
    );
    return;
  }

  // 🔄 Admin reset current round
  if (text === "🔄 Reset ຮອບນີ້") {
    const fromId = msg.from?.id?.toString();
    if (fromId !== ADMIN_ID) {
      bot.sendMessage(chatId, "⚠️ ຄຳສັ່ງນີ້ໃຊ້ໄດ້ເຉົ້າແອັດມິນເທົ່ານັ້ນ");
      return;
    }
    const round = getLastLotteryDate();
    await Bet.deleteMany({ round });
    bot.sendMessage(chatId, `✅ ລຶບຂໍ້ມູນການທາຍທັງໝົດຂອງຮອບ ${round} ແລ້ວ`);
    return;
  }

  // 📝 User typed 2–4 digits
  if (/^\d{2,4}$/.test(text)) {
    const userId = msg.from.id.toString();
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    const userData = {
      userId,
      username: msg.from.username ? `@${msg.from.username}` : null,
      firstName: msg.from.first_name
    };

    if (text.length === 2) {
      bot.sendMessage(chatId,
        `📌 ເລືອກຕຳແໜ່ງໃຫ້ເລກ ${text}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "⬆️ ເທິງ", callback_data: `bet:${text}:top` }],
              [{ text: "⬇️ ລຸ່ມ", callback_data: `bet:${text}:bottom` }]
            ]
          }
        }
      );
    } else {
      await Bet.create({ ...userData, number: text, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
    }
    return;
  }
});

/* ========== Inline callback for 2-digit pos ========== */
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data || '';
  if (!data.startsWith("bet:")) return;

  const [, number, pos] = data.split(":");
  const userId = query.from.id.toString();
  const round = getLastLotteryDate();

  const exist = await Bet.findOne({ userId, round });
  if (exist) {
    bot.answerCallbackQuery(query.id, { text: "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້", show_alert: true });
    return;
  }

  const userData = {
    userId,
    username: query.from.username ? `@${query.from.username}` : null,
    firstName: query.from.first_name
  };

  await Bet.create({ ...userData, number, pos, round });
  bot.answerCallbackQuery(query.id);
  bot.editMessageText(
    `✅ ບັນທຶກເລກ ${number} (${pos === "top" ? "⬆️ ເທິງ" : "⬇️ ລຸ່ມ"}) ຂອງທ່ານແລ້ວ`,
    { chat_id: chatId, message_id: query.message.message_id }
  );
});

/* ========== Health check ========== */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

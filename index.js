const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

// ===== Admin IDs =====
const SUPER_ADMIN_ID = "1351945799"; // Super Admin
const EDITOR_ADMIN_IDS = ["7211050914", "1662439252"]; // Editor Admins

function isSuperAdmin(userId) {
  return userId.toString() === SUPER_ADMIN_ID;
}
function isEditorAdmin(userId) {
  return EDITOR_ADMIN_IDS.includes(userId.toString());
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* ================= Schema ================= */
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  username: String,
  number: String,
  pos: String, // 2top, 3top, 4direct
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

const ResultSchema = new mongoose.Schema({
  date: String,
  digit4: String,
  digit3: String,
  digit2top: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', ResultSchema);

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

/* ================= Start ================= */
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id.toString();
  const isSuper = isSuperAdmin(userId);
  const isEditor = isEditorAdmin(userId);

  bot.sendMessage(
    msg.chat.id,
    "👋 ສະບາຍດີ! ກົດປຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
          [{ text: "🔎 ກວດຜົນຫວຍ" }],
          [{ text: "📅 ຜົນງວດທີ່ຜ່ານມາ" }],
          ...(isSuper || isEditor ? [[{ text: "✍️ ກອກຜົນຫວຍ" }]] : []),
          ...(isSuper ? [[{ text: "♻️ Reset ຮອບ" }]] : [])
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
  const userId = msg.from.id.toString();
  const isSuper = isSuperAdmin(userId);
  const isEditor = isEditorAdmin(userId);

  if (!text) return;

  // Start new round
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
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
    return;
  }

  // ตรวจผลล่าสุด
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await Result.findOne().sort({ createdAt: -1 });
    if (!res) {
      bot.sendMessage(chatId, "❌ ຍັງບໍ່ມີຜົນຫວຍ");
      return;
    }

    const winners4 = await Bet.find({ number: res.digit4, pos: "4direct", round: res.date });
    const winners3 = await Bet.find({ number: res.digit3, pos: "3top", round: res.date });
    const winners2 = await Bet.find({ number: res.digit2top, pos: "2top", round: res.date });

    let msgText =
      "✅ ຜົນຫວຍລ່າສຸດ\n" +
      "📅 ງວດ: " + res.date + "\n\n" +
      "👑 4 ຕົວ: " + (res.digit4 || "--") +
      (winners4.length ? "\n   🎯 ຖືກ: " + winners4.map(w => "🧑 " + (w.username ? "@" + w.username : w.name)).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
      "🥇 3 ຕົວ: " + (res.digit3 || "--") +
      (winners3.length ? "\n   🎯 ຖືກ: " + winners3.map(w => "🧑 " + (w.username ? "@" + w.username : w.name)).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
      "⬆️ 2 ຕົວ: " + (res.digit2top || "--") +
      (winners2.length ? "\n   🎯 ຖືກ: " + winners2.map(w => "🧑 " + (w.username ? "@" + w.username : w.name)).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ");

    bot.sendMessage(chatId, msgText);
    return;
  }

  // ผลย้อนหลัง
  if (text === "📅 ຜົນງວດທີ່ຜ່ານມາ") {
    const res = await Result.find().sort({ createdAt: -1 }).limit(2);
    if (res.length < 2) {
      bot.sendMessage(chatId, "❌ ບໍ່ມີຜົນງວດກ່ອນໜ້າ");
      return;
    }
    const prev = res[1];
    let msgText =
      "📅 ຜົນງວດທີ່ຜ່ານມາ\n" +
      "👑 4 ຕົວ: " + (prev.digit4 || "--") + "\n" +
      "🥇 3 ຕົວ: " + (prev.digit3 || "--") + "\n" +
      "⬆️ 2 ຕົວ: " + (prev.digit2top || "--") + "\n" +
      "🗓 ວັນທີ: " + prev.date;
    bot.sendMessage(chatId, msgText);
    return;
  }

  // กรอกผล (Admin)
  if (text === "✍️ ກອກຜົນຫວຍ" && (isSuper || isEditor)) {
    bot.sendMessage(chatId, "✍️ ກະລຸນາພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອບັນທຶກຜົນ");
    return;
  }

  // Reset รอบ (Super Admin)
  if (text === "♻️ Reset ຮອບ" && isSuper) {
    await Bet.deleteMany({});
    await Result.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນການທາຍແລະຜົນທັງໝົດແລ້ວ");
    return;
  }

  // Admin input result
  if (/^\d{2,4}$/.test(text) && (isSuper || isEditor)) {
    const date = getLastLotteryDate();

    const exist = await Result.findOne({ date });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ມີຜົນຖືກບັນທຶກແລ້ວ ຖ້າຈະແກ້ໃຫ້ Reset ກ່ອນ");
      return;
    }

    let digit4 = null, digit3 = null, digit2top = null;

    if (text.length === 4) {
      digit4 = text;
      digit3 = text.slice(1);
      digit2top = text.slice(2);
    } else if (text.length === 3) {
      digit3 = text;
      digit2top = text.slice(1);
    } else if (text.length === 2) {
      digit2top = text;
    }

    await Result.create({ date, digit4, digit3, digit2top });

    bot.sendMessage(chatId,
      `✅ ບັນທຶກຜົນງວດ ${date} ສຳເລັດ\n` +
      (digit4 ? `👑 4 ຕົວ: ${digit4}\n` : "") +
      (digit3 ? `🥇 3 ຕົວ: ${digit3}\n` : "") +
      (digit2top ? `⬆️ 2 ຕົວ: ${digit2top}\n` : "")
    );
    return;
  }

  // Player Bet
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();

    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    if (text.length === 2) {
      await Bet.create({ userId: chatId, name: msg.from.first_name, username: msg.from.username, number: text, pos: "2top", round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ 2 ຕົວ: ${text}`);
    } else if (text.length === 3) {
      await Bet.create({ userId: chatId, name: msg.from.first_name, username: msg.from.username, number: text, pos: "3top", round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ 3 ຕົວ: ${text}`);
    } else if (text.length === 4) {
      await Bet.create({ userId: chatId, name: msg.from.first_name, username: msg.from.username, number: text, pos: "4direct", round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ 4 ຕົວຕົງ: ${text}`);
    }
  } else if (/^\d+$/.test(text)) {
    bot.sendMessage(chatId, "⚠️ ກະລຸນາພິມເລກ 2, 3 ຫຼື 4 ຕົວເທົ່ານັ້ນ");
  }
});

/* ================= Cron ================= */
// แจ้งเตือน Admin ตอน 20:30
cron.schedule("30 13 * * 1,3,5", async () => {
  const res = await Result.findOne({ date: getLastLotteryDate() });
  if (!res) {
    bot.sendMessage(SUPER_ADMIN_ID, "⏰ ເວລາ 20:30 ແລ້ວ ກະລຸນາກອກຜົນຫວຍ");
    for (let id of EDITOR_ADMIN_IDS) {
      bot.sendMessage(id, "⏰ ເວລາ 20:30 ແລ້ວ ກະລຸນາກອກຜົນຫວຍ");
    }
  }
});

// ประกาศผลตอน 21:00
cron.schedule("0 14 * * 1,3,5", async () => {
  const res = await Result.findOne({ date: getLastLotteryDate() });
  if (!res) {
    bot.sendMessage(TARGET_GROUP_ID, "❌ ບໍ່ມີຜົນຫວຍຖືກກອກໃນງວດນີ້");
    return;
  }

  const winners4 = await Bet.find({ number: res.digit4, pos: "4direct", round: res.date });
  const winners3 = await Bet.find({ number: res.digit3, pos: "3top", round: res.date });
  const winners2 = await Bet.find({ number: res.digit2top, pos: "2top", round: res.date });

  let msgText =
    "🎉 ຜົນຫວຍງວດ " + res.date + "\n" +
    "═════════════════════\n" +
    "👑 4 ຕົວ: " + (res.digit4 || "--") +
    (winners4.length ? "\n   🎯 ຖືກ: " + winners4.map(w => `🧑 <a href="tg://user?id=${w.userId}">${w.name}</a>`).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
    "🥇 3 ຕົວ: " + (res.digit3 || "--") +
    (winners3.length ? "\n   🎯 ຖືກ: " + winners3.map(w => `🧑 <a href="tg://user?id=${w.userId}">${w.name}</a>`).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
    "⬆️ 2 ຕົວ: " + (res.digit2top || "--") +
    (winners2.length ? "\n   🎯 ຖືກ: " + winners2.map(w => `🧑 <a href="tg://user?id=${w.userId}">${w.name}</a>`).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n" +
    "═════════════════════";

  bot.sendMessage(TARGET_GROUP_ID, msgText, { parse_mode: "HTML" });
});

/* ================= Express Health ================= */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

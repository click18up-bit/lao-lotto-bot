const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;

const SUPER_ADMIN_ID = "1351945799";
const EDITOR_ADMIN_IDS = ["7211050914", "1662439252"];

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

/* ================= Schema ================= */
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

const ResultSchema = new mongoose.Schema({
  round: String,
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
  return today.toISOString().split("T")[0];
}
function isSuperAdmin(userId) {
  return userId.toString() === SUPER_ADMIN_ID;
}
function isEditorAdmin(userId) {
  return EDITOR_ADMIN_IDS.includes(userId.toString());
}

/* ================= Start ================= */
bot.onText(/\/start/, (msg) => {
  const isSuper = isSuperAdmin(msg.from.id);
  const isEditor = isEditorAdmin(msg.from.id);

  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ກົດປຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.", {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }],
        [{ text: "📅 ຜົນງວດທີ່ຜ່ານມາ" }],
        ...((isSuper || isEditor) ? [[{ text: "✍️ ກອກຜົນຫວຍ" }]] : []),
        ...(isSuper ? [[{ text: "♻️ Reset ຮອບ" }]] : [])
      ],
      resize_keyboard: true
    }
  });
});

/* ================= Message Handler ================= */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;

  // Start new round
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    await Bet.deleteMany({ round: getLastLotteryDate() });
    bot.sendMessage(chatId, "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\nພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອຮ່ວມສົນຸກ");
    return;
  }

  // Admin input result
  if (text === "✍️ ກອກຜົນຫວຍ" && (isSuperAdmin(msg.from.id) || isEditorAdmin(msg.from.id))) {
    bot.sendMessage(chatId, "✍️ ກະລຸນາພິມເລກຜົນ (2-4 ຕົວ)");
    return;
  }

  // Reset round (Super only)
  if (text === "♻️ Reset ຮອບ" && isSuperAdmin(msg.from.id)) {
    await Bet.deleteMany({});
    await Result.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນຮອບທັງໝົດແລ້ວ");
    return;
  }

  // Player Bet with confirm
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist && !isSuperAdmin(chatId) && !isEditorAdmin(chatId)) {
      bot.sendMessage(chatId, "⚠️ ທ່ານໄດ້ທາຍໄປແລ້ວ ສາມາດທາຍໄດ້ອີກຄັ້ງຫຼັງຈາກປະກາດຜົນຮອບນີ້");
      return;
    }

    bot.sendMessage(chatId, `📌 ທ່ານເລືອກເລກ: ${text}\n\nກົດປຸ່ມເພື່ອຢືນຢັນ`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${round}:${msg.from.first_name}:${msg.from.id}` },
            { text: "❌ ຍົກເລີກ", callback_data: `cancel:${text}` }
          ]
        ]
      }
    });
    return;
  }
});

/* ================= Callback ================= */
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  if (data.startsWith("confirm:")) {
    const [, number, round, name, userId] = data.split(":");
    await Bet.create({ userId, name, number, round });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
  }
  if (data.startsWith("cancel:")) {
    const [, number] = data.split(":");
    bot.sendMessage(chatId, `❌ ຍົກເລີກເລກ ${number}`);
  }
  bot.answerCallbackQuery(cb.id);
});

/* ================= Cron ================= */
// 20:30 notify admins
cron.schedule("30 13 * * 1,3,5", () => {
  [SUPER_ADMIN_ID, ...EDITOR_ADMIN_IDS].forEach(id => {
    bot.sendMessage(id, "⏰ ກະລຸນາກອກຜົນຫວຍ ກ່ອນ 21:00");
  });
});
// 21:00 announce (mock)
cron.schedule("0 14 * * 1,3,5", async () => {
  const latest = await Result.findOne().sort({ createdAt: -1 });
  if (!latest) return;
  const winners4 = await Bet.find({ number: latest.digit4, round: latest.round });
  const winners3 = await Bet.find({ number: latest.digit3, round: latest.round });
  const winners2 = await Bet.find({ number: latest.digit2top, round: latest.round });
  let msgText =
    "🎉 ຜົນຫວຍລາວ ງວດ " + latest.round + "\n" +
    "👑 4 ຕົວ: " + latest.digit4 + (winners4.length ? "\n   🎯 " + winners4.map(w => `🧑 <a href=\"tg://user?id=${w.userId}\">${w.name}</a>`).join(", ") : "") + "\n" +
    "🥇 3 ຕົວ: " + latest.digit3 + (winners3.length ? "\n   🎯 " + winners3.map(w => `🧑 <a href=\"tg://user?id=${w.userId}\">${w.name}</a>`).join(", ") : "") + "\n" +
    "⬆️ 2 ຕົວ: " + latest.digit2top + (winners2.length ? "\n   🎯 " + winners2.map(w => `🧑 <a href=\"tg://user?id=${w.userId}\">${w.name}</a>`).join(", ") : "");
  bot.sendMessage(TARGET_GROUP_ID, msgText, { parse_mode: "HTML" });
});

/* ================= Express Health ================= */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

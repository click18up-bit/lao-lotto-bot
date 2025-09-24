const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",");

const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`);

app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Schema
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// Connect DB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// Helper
function getLotteryDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

// Admin check
function isSuperAdmin(id) { return id.toString() === SUPER_ADMIN_ID; }
function isEditor(id) { return EDITOR_IDS.includes(id.toString()); }

// Start command
bot.onText(/\/start/, (msg) => {
  const isAdmin = isSuperAdmin(msg.from.id) || isEditor(msg.from.id);
  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ເລືອກເມນູ:", {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }],
        ...(isAdmin ? [[{ text: "✍️ ກອກຜົນຫວຍ" }]] : []),
        ...(isSuperAdmin(msg.from.id) ? [[{ text: "♻️ Reset" }]] : [])
      ],
      resize_keyboard: true
    }
  });
});

// Player bet
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (/^\d{2,4}$/.test(text)) {
    const round = getLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານໄດ້ທາຍແລ້ວ ລໍຖ້າຮອບໃໝ່ຫຼັງປະກາດຜົນ");
      return;
    }

    bot.sendMessage(chatId, `ຢືນຢັນເລກ ${text}?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${msg.from.first_name}` }],
          [{ text: "❌ ຍົກເລີກ", callback_data: "cancel" }]
        ]
      }
    });
  }

  if (text === "✍️ ກອກຜົນຫວຍ" && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    bot.sendMessage(chatId, "✍️ ກະລຸນາພິມເລກ 4 ຕົວ (ຕົວເລກດຽວ)");
  }

  if (/^\d{4}$/.test(text) && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    const digit4 = text;
    const digit3 = text.slice(-3);
    const digit2 = text.slice(-2);
    const date = getLotteryDate();

    const winners4 = await Bet.find({ number: digit4, round: date });
    const winners3 = await Bet.find({ number: digit3, round: date });
    const winners2 = await Bet.find({ number: digit2, round: date });

    let msgResult = "🎉 ຜົນຫວຍວັນທີ " + date + "\n";
    msgResult += "👑 4 ຕົວ: " + digit4 + (winners4.length ? "\n🎯 " + winners4.map(w => "@" + w.name).join(", ") : "") + "\n";
    msgResult += "🥇 3 ຕົວ: " + digit3 + (winners3.length ? "\n🎯 " + winners3.map(w => "@" + w.name).join(", ") : "") + "\n";
    msgResult += "⬆️ 2 ຕົວ: " + digit2 + (winners2.length ? "\n🎯 " + winners2.map(w => "@" + w.name).join(", ") : "");

    bot.sendMessage(TARGET_GROUP_ID, msgResult);
  }

  if (text === "♻️ Reset" && isSuperAdmin(msg.from.id)) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນແລ້ວ");
  }
});

// Callback confirm/cancel
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  if (data.startsWith("confirm:")) {
    const [, number, name] = data.split(":");
    const round = getLotteryDate();
    await Bet.create({ userId: chatId, name, number, round });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
  } else if (data === "cancel") {
    bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍ");
  }

  bot.answerCallbackQuery(cb.id);
});

// Health check
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀 (Webhook mode)');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

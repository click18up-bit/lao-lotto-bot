
// index.js
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 10000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",");

const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`);

// MongoDB Schemas
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  createdAt: { type: Date, default: Date.now },
  round: String
});
const Bet = mongoose.model("Bet", BetSchema);

const ResultSchema = new mongoose.Schema({
  round: String,
  number: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model("Result", ResultSchema);

// Utils
function getRoundDate() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}
function isAdmin(userId) {
  return userId == SUPER_ADMIN_ID || EDITOR_IDS.includes(userId.toString());
}

// Handlers
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = (msg.text || "").trim();

  if (text === "/start") {
    bot.sendMessage(chatId, "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!", {
      reply_markup: {
        keyboard: [
          ["🎲 ເລີ່ມທາຍເລກ", "🔍 ກວດຜົນທາຍ"],
          ["📝 ກອກຜົນລາງວັນ", "📊 ຈັດການລະບົບ"]
        ],
        resize_keyboard: true
      }
    });
  }

  if (text === "📝 ກອກຜົນລາງວັນ" && isAdmin(userId)) {
    bot.sendMessage(chatId, "✍️ ກະລຸນາພິມເລກ 4 ຕົວ (ຕົວຢ່າງ 1234)");
    bot.once("message", async (res) => {
      const rtext = (res.text || "").trim();
      if (!/^\d{4}$/.test(rtext)) {
        bot.sendMessage(chatId, "⚠️ ຕ້ອງເປັນເລກ 4 ຕົວ");
        return;
      }
      const round = getRoundDate();
      const exist = await Result.findOne({ round });
      if (exist) {
        bot.sendMessage(chatId, "⚠️ ມີຜົນແລ້ວໃນຮອບນີ້");
        return;
      }
      await Result.create({ round, number: rtext });
      bot.sendMessage(chatId, `✅ ບັນທຶກຜົນ: ${rtext}`);
    });
  }

  if (text === "📊 ຈັດການລະບົບ" && isAdmin(userId)) {
    bot.sendMessage(chatId, "📊 ເມນູຈັດການລະບົບ", {
      reply_markup: {
        keyboard: [
          ["👥 ຈໍານວນທາຍມື້ນີ້", "📈 ຈໍານວນທັງຮອບ"],
          ["♻️ ລ້າງໂພຍທັງຮອບ", "🗑 ລ້າງຜົນລາງວັນ"],
          ["↩️ ກັບໄປເມນູຫຼັກ"]
        ],
        resize_keyboard: true
      }
    });
  }
});

// Start server
mongoose.connect(MONGO_URI)
  .then(() => {
    app.use(express.json());
    app.post(`/bot${BOT_TOKEN}`, (req, res) => {
      bot.processUpdate(req.body);
      res.sendStatus(200);
    });
    app.listen(PORT, () => console.log("🚀 Server running on " + PORT));
  })
  .catch(err => console.error("DB Error:", err));

const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",");
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// ===== BOT =====
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`);

app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ===== DB =====
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  pos: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model("Bet", BetSchema);

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error", err));

// ===== ปุ่มเมนูหลัก =====
const mainMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "🎲 ເລີ່ມການທາຍເລກ", callback_data: "start_game" }],
      [{ text: "🔍 ກວດຜົນຫວຍ", callback_data: "check_result" }]
    ]
  }
};

// ===== คำสั่งพื้นฐาน =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "👋 ສະບາຍດີ! ເລືອກເມນູດ້ານລຸ່ມເພື່ອເລີ່ມຕົ້ນ",
    mainMenu
  );
});

bot.onText(/\/reset/, (msg) => {
  bot.sendMessage(msg.chat.id, "♻️ ລ້າງຂໍ້ມູນສຳເລັດ", mainMenu);
});

// ===== จัดการปุ่มกด =====
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  console.log("DEBUG callback:", data);

  if (data === "start_game") {
    await bot.sendMessage(
      chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\nກົດເລືອກຈຳນວນທີ່ຈະທາຍ",
      {
        reply_markup: {
          keyboard: [["2 ຕົວ"], ["3 ຕົວ"], ["4 ຕົວ"]],
          resize_keyboard: true,
          one_time_keyboard: true
        }
      }
    );
  }

  if (data === "check_result") {
    // ตรงนี้เดี๋ยวต่อ API ผลหวยจริงก็ได้ ตอนนี้ทำ mock ก่อน
    await bot.sendMessage(
      chatId,
      "📢 ຜົນຫວຍລ່າສຸດ:\n🏆 4 ຕົວ: 1234\n🥈 3 ຕົວ: 234\n🥉 2 ຕົວ: 34"
    );
  }

  await bot.answerCallbackQuery(query.id);
});

// ===== RUN SERVER =====
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

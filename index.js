const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

/* ===== ENV ===== */
const BOT_TOKEN = process.env.BOT_TOKEN || "8405535012:AAGkeiddSXNezKzKqetYnOcZiAuDrsS6JnA";
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = (process.env.SUPER_ADMIN_ID || "").toString();
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",").map(x => x.trim()).filter(Boolean);

/* ===== Setup ===== */
const app = express();
app.use(express.json());
const bot = new TelegramBot(BOT_TOKEN, { webHook: true }); // ✅ แก้ตรงนี้ให้ใช้ webhook

/* ===== DB Schemas ===== */
const BetSchema = new mongoose.Schema({
  userId: String,
  username: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model("Bet", BetSchema);

const ResultSchema = new mongoose.Schema({
  round: String,
  top4: String,
  top3: String,
  top2: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model("Result", ResultSchema);

/* ===== Connect DB ===== */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ===== Helpers ===== */
function isAdmin(userId) {
  const id = (userId || "").toString();
  return id === SUPER_ADMIN_ID || EDITOR_IDS.includes(id);
}

function getRoundDate() {
  const now = new Date();
  const tz = "Asia/Bangkok";
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric' }).format(now);
  const m = new Intl.DateTimeFormat('en-CA', { timeZone: tz, month: '2-digit' }).format(now);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz, day: '2-digit' }).format(now);
  return `${y}-${m}-${d}`;
}

function prettyList(users) {
  if (!users || users.length === 0) return "❌ ບໍ່ມີ";
  return users.map(w => w.username ? `@${w.username}` : (w.name ? w.name : `id${w.userId}`)).join(", ");
}

/* ===== /start ===== */
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const keyboardUser = [
    [{ text: "🎲 ເລີ່ມທາຍເລກ" }],
    [{ text: "🔍 ກວດຜົນຫວຍ" }]
  ];
  const keyboardAdmin = [
    [{ text: "📝 กรอกผลรางวัล" }],
    [{ text: "📊 จัดการระบบ" }]
  ];
  const replyMarkup = {
    reply_markup: { keyboard: isAdmin(userId) ? keyboardUser.concat(keyboardAdmin) : keyboardUser, resize_keyboard: true }
  };
  bot.sendMessage(chatId, isAdmin(userId) ? "👑 สวัสดีแอดมิน!" : "👋 ສະບາຍດີ!", replyMarkup);
});

/* ===== Message Handler ===== */
// ... (โค้ดส่วน message handler, callback, cron jobs คงเดิม)


// ===== Webhook =====
const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("Lao Lotto Bot Webhook ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));

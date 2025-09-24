/**
 * Lao Lotto Bot - Full System (Production)
 * - Added: isPublished (results saved but not published until 21:00)
 * - Added: exclude admin/editor from winners
 */
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

/* ===== ENV ===== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = (process.env.SUPER_ADMIN_ID || "").toString();
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
const TZ = "Asia/Bangkok";

/* ===== Guards ===== */
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");
if (!MONGO_URI) console.warn("⚠️ MONGO_URI missing");
if (!RENDER_EXTERNAL_URL) console.warn("⚠️ RENDER_EXTERNAL_URL missing - webhook won't be set");

/* ===== Setup ===== */
const app = express();
app.use(express.json());
const bot = new TelegramBot(BOT_TOKEN, { webHook: true });

/* ===== DB Schemas ===== */
const BetSchema = new mongoose.Schema({
  userId: String,
  username: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
BetSchema.index({ userId: 1, round: 1 }, { unique: true });
const Bet = mongoose.model("Bet", BetSchema);

const ResultSchema = new mongoose.Schema({
  round: { type: String, unique: true },
  top4: String,
  top3: String,
  top2: String,
  isPublished: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
ResultSchema.index({ round: 1 });
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
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric" }).format(now);
  const m = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, month: "2-digit" }).format(now);
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, day: "2-digit" }).format(now);
  return `${y}-${m}-${d}`;
}
function prettyLabel(user) {
  return user.username ? `@${user.username}` : (user.name ? user.name : `id${user.userId}`);
}
function prettyList(users, suffix = "") {
  if (!users || users.length === 0) return "❌ ບໍ່ມີ";
  return users.map(u => suffix ? `${prettyLabel(u)} (${suffix})` : prettyLabel(u)).join(", ");
}
function mainMenuKeyboard(isAdminUser=false) {
  const user = [
    [{ text: "🎲 ເລີ່ມທາຍເລກ" }],
    [{ text: "🔍 ກວດຜົນຫວຍ" }]
  ];
  const admin = [
    [{ text: "📝 กรอกผลรางวัล" }],
    [{ text: "📊 จัดการระบบ" }]
  ];
  return { keyboard: isAdminUser ? user.concat(admin) : user, resize_keyboard: true, one_time_keyboard: false };
}
function adminMenuKeyboard() {
  return {
    keyboard: [
      [{ text: "👥 จำนวนคนทายวันนี้" }],
      [{ text: "📝 จำนวนโพยรอบนี้" }],
      [{ text: "♻️ รีเซตโพยวันนี้" }],
      [{ text: "🗑 รีเซตโพยทั้งหมด" }],
      [{ text: "🗑 ล้างผลรางวัลทั้งหมด" }],
      [{ text: "✏️ แก้ไขเลขยูส" }],
      [{ text: "⬅️ กลับเมนูหลัก" }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
}

/* ===== /start ===== */
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  bot.sendMessage(chatId, isAdmin(userId) ? "👑 สวัสดีแอดมิน!" : "👋 ສະບາຍດີ!", {
    reply_markup: mainMenuKeyboard(isAdmin(userId))
  });
});

/* ===== Message Handler ===== */
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = (msg.from?.id || "").toString();
  const username = msg.from?.username || "";
  const name = msg.from?.first_name || "";

  if (!text || text === "/start") return;

  // user start guessing
  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(chatId, "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n..."); return;
  }

  // user check results
  if (text === "🔍 ກວດຜົນຫວຍ") {
    const last = await Result.findOne({ isPublished: true }).sort({ createdAt: -1 });
    if (!last) { bot.sendMessage(chatId, "⏳ ຍັງບໍ່ມີຜົນທີ່ປະກາດແລ້ວ"); return; }
    const round = last.round;
    const winners4 = await Bet.find({ number: last.top4, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
    const winners3 = await Bet.find({ number: last.top3, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
    const winners2 = await Bet.find({ number: last.top2, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
    bot.sendMessage(chatId, "🏆 ผลรางวัล " + round);
    return;
  }

  // admin enter result
  if (text === "📝 กรอกผลรางวัล" && isAdmin(userId)) {
    bot.sendMessage(chatId, "✍️ กรุณาพิมพ์เลข 4 หลัก");
    bot.once("message", async (res) => {
      const rtext = (res.text || "").trim();
      if (!/^\d{4}$/.test(rtext)) { bot.sendMessage(chatId, "⚠️ ต้องเป็นเลข 4 หลัก"); return; }
      const round = getRoundDate();
      const exist = await Result.findOne({ round });
      if (exist) { bot.sendMessage(chatId, "⚠️ วันนี้มีผลแล้ว"); return; }
      const top4 = rtext, top3 = rtext.slice(-3), top2 = rtext.slice(-2);
      await Result.create({ round, top4, top3, top2, isPublished: false });
      bot.sendMessage(chatId, "✅ บันทึกผลแล้ว จะประกาศ 21:00");
    });
    return;
  }
});

/* ===== CRON Jobs ===== */
cron.schedule("0 21 * * 1,3,5", async () => {
  const round = getRoundDate();
  const result = await Result.findOne({ round, isPublished: false });
  if (!result) { await bot.sendMessage(TARGET_GROUP_ID, "⚠️ ຍັງບໍ່ມີຜົນຮອບນີ້"); return; }
  const winners4 = await Bet.find({ number: result.top4, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
  // ... similar for winners3, winners2
  await Result.updateOne({ _id: result._id }, { $set: { isPublished: true } });
  await bot.sendMessage(TARGET_GROUP_ID, "🏆 ประกาศผลรอบ " + round);
}, { timezone: TZ });

/* ===== Webhook ===== */
const WEBHOOK_URL = `${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL);
app.post(`/bot${BOT_TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });
app.get("/", (_, res) => res.send("Lao Lotto Bot ✅"));

/* ===== Start server ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on :${PORT}`));

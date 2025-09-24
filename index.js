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
const TZ = "Asia/Bangkok";

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
  createdAt: { type: Date, default: Date.now }
});
ResultSchema.index({ round: 1 });

const Result = mongoose.model("Result", ResultSchema);

/* ===== Connect DB ===== */
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Error:", err));
}

/* ===== Helpers ===== */
function isAdmin(userId) {
  const id = (userId || "").toString();
  return id === SUPER_ADMIN_ID || EDITOR_IDS.includes(id);
}

function getRoundDate() {
  const now = new Date();
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric' }).format(now);
  const m = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit' }).format(now);
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, day: '2-digit' }).format(now);
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
bot.on("message", async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from.id.toString();
  const username = msg.from.username || "";
  const name = msg.from.first_name || "";

  if (text === "/start") return;

  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(chatId, `🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n\n📜 ກົດກາ:\n1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n2️⃣ ພິມເລກ 2, 3 ຫຼື 4 ຕົວ`);
    return;
  }

  if (text === "🔍 ກວດຜົນຫວຍ") {
    const last = await Result.findOne().sort({ createdAt: -1 });
    if (!last) {
      bot.sendMessage(chatId, "❌ ຍັງບໍ່ມີຜົນຫວຍ");
    } else {
      bot.sendMessage(chatId, `📢 ຜົນຫວຍຮອບ ${last.round}\n👑 4 ຕົວ: ${last.top4}\n🥇 3 ຕົວ: ${last.top3}\n⬆️ 2 ຕົວ: ${last.top2}`);
    }
    return;
  }

  if (text === "📝 กรอกผลรางวัล" && isAdmin(userId)) {
    bot.sendMessage(chatId, "✍️ กรุณาพิมพ์เลข 4 หลัก (เช่น 1234)");
    bot.once("message", async (res) => {
      const rtext = (res.text || "").trim();
      if (!/^\d{4}$/.test(rtext)) {
        bot.sendMessage(chatId, "⚠️ ต้องเป็นเลข 4 หลัก");
        return;
      }
      const round = getRoundDate();
      const exist = await Result.findOne({ round });
      if (exist) {
        bot.sendMessage(chatId, "⚠️ วันนี้มีผลแล้ว");
        return;
      }
      const top4 = rtext;
      const top3 = rtext.slice(-3);
      const top2 = rtext.slice(-2);
      await Result.create({ round, top4, top3, top2 });
      bot.sendMessage(chatId, `✅ บันทึกผล ${top4} (3 ตัว: ${top3}, 2 ตัว: ${top2})`);
    });
    return;
  }

  // ===== จัดการระบบ =====
  if (text === "📊 จัดการระบบ" && isAdmin(userId)) {
    bot.sendMessage(chatId, "📊 เมนูจัดการระบบ", {
      reply_markup: {
        keyboard: [
          [{ text: "👥 จำนวนคนทายวันนี้" }],
          [{ text: "📝 จำนวนโพยรอบนี้" }],
          [{ text: "♻️ รีเซตโพยวันนี้" }],
          [{ text: "🗑 รีเซตโพยทั้งหมด" }],
          [{ text: "✏️ แก้ไขเลขยูส" }],
          [{ text: "⬅️ กลับเมนูหลัก" }]
        ],
        resize_keyboard: true
      }
    });
    return;
  }

  if (text === "👥 จำนวนคนทายวันนี้" && isAdmin(userId)) {
    const round = getRoundDate();
    const users = await Bet.distinct("userId", { round });
    bot.sendMessage(chatId, `👥 มีผู้เล่นทายวันนี้: ${users.length} คน`);
    return;
  }

  if (text === "📝 จำนวนโพยรอบนี้" && isAdmin(userId)) {
    const round = getRoundDate();
    const count = await Bet.countDocuments({ round });
    bot.sendMessage(chatId, `📝 จำนวนโพยที่ทายในรอบนี้: ${count} โพย`);
    return;
  }

  if (text === "♻️ รีเซตโพยวันนี้" && isAdmin(userId)) {
    const round = getRoundDate();
    await Bet.deleteMany({ round });
    bot.sendMessage(chatId, "♻️ รีเซตโพยของวันนี้เรียบร้อยแล้ว");
    return;
  }

  if (text === "🗑 รีเซตโพยทั้งหมด" && isAdmin(userId)) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId, "🗑 รีเซตโพยทั้งหมดเรียบร้อยแล้ว");
    return;
  }

  if (text === "✏️ แก้ไขเลขยูส" && isAdmin(userId)) {
    bot.sendMessage(chatId, "✏️ ส่งข้อมูลรูปแบบ: userId,เลขใหม่ (เช่น: 123456789,5678)");
    bot.once("message", async (res) => {
      const [uid, newNumber] = (res.text || "").split(",");
      if (!uid || !/^\d{2,4}$/.test(newNumber)) {
        bot.sendMessage(chatId, "⚠️ รูปแบบไม่ถูกต้อง (เช่น: 123456789,5678)");
        return;
      }
      const round = getRoundDate();
      const updated = await Bet.updateOne({ userId: uid, round }, { $set: { number: newNumber } });
      if (updated.modifiedCount > 0) {
        bot.sendMessage(chatId, `✅ แก้ไขเลขของ userId ${uid} เป็น ${newNumber} แล้ว`);
      } else {
        bot.sendMessage(chatId, `❌ ไม่พบโพยของ userId ${uid} ในรอบนี้`);
      }
    });
    return;
  }

  if (text === "⬅️ กลับเมนูหลัก" && isAdmin(userId)) {
    const keyboardUser = [
      [{ text: "🎲 ເລີ່ມທາຍເລກ" }],
      [{ text: "🔍 ກວດຜົນຫວຍ" }],
      [{ text: "📝 กรอกผลรางวัล" }],
      [{ text: "📊 จัดการระบบ" }]
    ];
    bot.sendMessage(chatId, "⬅️ กลับเมนูหลักแล้ว", {
      reply_markup: { keyboard: keyboardUser, resize_keyboard: true }
    });
    return;
  }

  // ===== ทายเลข =====
  if (/^\d{2,4}$/.test(text)) {
    const round = getRoundDate();
    const already = await Bet.findOne({ userId, round });
    if (already) {
      bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວ ລໍຖ້າຮອບໃໝ່");
      return;
    }
    bot.sendMessage(chatId, `ຢືນຢັນເລກ ${text} ?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${userId}` }],
          [{ text: "❌ ຍົກເລີກ", callback_data: "cancel" }]
        ]
      }
    });
    return;
  }
});

/* ===== Callback Query ===== */
bot.on("callback_query", async (cb) => {
  const data = cb.data;
  const chatId = cb.message.chat.id;
  if (data && data.startsWith("confirm:")) {
    const [, number, userId] = data.split(":");
    const round = getRoundDate();
    const already = await Bet.findOne({ userId, round });
    if (already) {
      await bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວ");
    } else {
      await Bet.create({ userId, username: cb.from.username || "", name: cb.from.first_name || "", number, round });
      await bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
    }
  } else if (data === "cancel") {
    await bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍ");
  }
  bot.answerCallbackQuery(cb.id);
});

/* ===== CRON ===== */
cron.schedule("30 20 * * 1,3,5", async () => {
  const admins = [SUPER_ADMIN_ID, ...EDITOR_IDS].filter(Boolean);
  for (const id of admins) {
    await bot.sendMessage(id, "⏰ กรุณากรอกผลรางวัลก่อน 21:00 น.");
  }
}, { timezone: TZ });

cron.schedule("0 21 * * 1,3,5", async () => {
  const round = getRoundDate();
  const result = await Result.findOne({ round }).sort({ createdAt: -1 });
  if (!result) {
    await bot.sendMessage(TARGET_GROUP_ID, "⚠️ ຍັງບໍ່ມີຜົນຮອບນີ້");
    return;
  }
  const winners4 = await Bet.find({ number: result.top4, round });
  const winners3 = await Bet.find({ number: result.top3, round });
  const winners2 = await Bet.find({ number: result.top2, round });

  let msg = `🎉 ປະກາດຜົນຫວຍ ${round}\n═════════════════════\n\n`;
  msg += `👑 4 ຕົວ: ${result.top4}\n🎯 ${prettyList(winners4)}\n\n`;
  msg += `🥇 3 ຕົວ: ${result.top3}\n🎯 ${prettyList(winners3)}\n\n`;
  msg += `⬆️ 2 ຕົວ: ${result.top2}\n🎯 ${prettyList(winners2)}\n\n`;
  msg += "═════════════════════\n🏆 ຂໍໃຫ້ໂຊກດີໃນຮ່ອບໜ້າ!";

  await bot.sendMessage(TARGET_GROUP_ID, msg);
  await Bet.deleteMany({ round });
}, { timezone: TZ });

/* ===== Webhook ===== */
const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL);

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (_, res) => res.send("Lao Lotto Bot ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on :${PORT}`));

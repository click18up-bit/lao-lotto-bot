/**
 * Lao Lotto Bot - Full System (Production)
 * - User: start guessing, check latest results
 * - Admin: enter results, system management
 * - Cron: remind (20:30) & announce (21:00) Mon/Wed/Fri, auto clear bets
 * - Webhook for Render
 */
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

/* ===== ENV ===== */
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID; // e.g. -1001234567890
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
  number: String, // 2-4 digits
  round: String,  // yyyy-mm-dd
  createdAt: { type: Date, default: Date.now }
});
BetSchema.index({ userId: 1, round: 1 }, { unique: true });
const Bet = mongoose.model("Bet", BetSchema);

const ResultSchema = new mongoose.Schema({
  round: { type: String, unique: true },
  top4: String,
  top3: String,
  top2: String,
  createdAt: { type: Date, default: Date.now },
  isPublished: { type: Boolean, default: false } // ✅ Patch 1
});
ResultSchema.index({ round: 1 });
const Result = mongoose.model("Result", ResultSchema);

/* ===== Connect DB ===== */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));
/* ===== Helpers ===== */
function isAdmin(userId) {
  return userId == SUPER_ADMIN_ID || EDITOR_IDS.includes(String(userId));
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

  /* User: start guessing */
  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(chatId, `🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!

📜 ກົດກາ:
1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ
2️⃣ ພິມເລກ 2, 3 ຫຼື 4 ຕົວ

🏆 ລາງວັນ:
👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ
🥇 3 ຕົວບນ ➝ 5,000 ເຄຣດິດ
⬆️ 2 ຕົວບນ ➝ 500 ເຄຣດິດ

📅 ປະກາດຜົນ: 21:00 ໂມງ
🕣 ປິດຮັບ: 20:25 ໂມງ
═════════════════════
🎯 ພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອຮ່ວມສົນຸກ`);
    return;
  }

  /* User: check results */
  if (text === "🔍 ກວດຜົນຫວຍ") {
    const last = await Result.findOne({ isPublished: true }).sort({ createdAt: -1 });
    if (!last) {
      bot.sendMessage(chatId, "⏳ ຍັງບໍ່ມີຜົນຮອບລ່າສຸດ");
      return;
    }
    const round = last.round;
    const winners4 = await Bet.find({ number: last.top4, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
    const winners3 = await Bet.find({ number: last.top3, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
    const winners2 = await Bet.find({ number: last.top2, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });

    const CREDIT4 = "20,000 ເຄຣດິດ";
    const CREDIT3 = "5,000 ເຄຣດິດ";
    const CREDIT2 = "500 ເຄຣດິດ";

    let msgResult = `🏆 ຜົນຫວຍປະຈຳວັນ ${round}\n═════════════════════\n\n` +
                    `🏆 ລາງວັນ:\n` +
                    `👑 4 ຕົວຕົງ ➝ ${CREDIT4}\n` +
                    `🥇 3 ຕົວບນ ➝ ${CREDIT3}\n` +
                    `⬆️ 2 ຕົວບນ ➝ ${CREDIT2}\n\n` +
                    `👑 4 ຕົວ: ${last.top4}\n` +
                    (winners4.length ? `🎯 ${prettyList(winners4, CREDIT4)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
                    `🥇 3 ຕົວ: ${last.top3}\n` +
                    (winners3.length ? `🎯 ${prettyList(winners3, CREDIT3)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
                    `⬆️ 2 ຕົວ: ${last.top2}\n` +
                    (winners2.length ? `🎯 ${prettyList(winners2, CREDIT2)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
                    `═════════════════════\n✨ ຂໍໃຫ້ໂຊກດີໃນຮ່ອບໜ້າ!`;
    bot.sendMessage(chatId, msgResult);
    return;
  }

  /* Admin: enter result */
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
      await Result.create({ round, top4, top3, top2, isPublished: false });
      bot.sendMessage(chatId, `✅ บันทึกผล ${top4} (3 ตัว: ${top3}, 2 ตัว: ${top2})\n📢 จะประกาศเวลา 21:00`);
    });
    return;
  }
  /* Admin: system menu */
  if (text === "📊 จัดการระบบ" && isAdmin(userId)) {
    bot.sendMessage(chatId, "📊 เมนูจัดการระบบ", { reply_markup: adminMenuKeyboard() });
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

  if (text === "🗑 ล้างผลรางวัลทั้งหมด" && isAdmin(userId)) {
    await Result.deleteMany({});
    bot.sendMessage(chatId, "🗑 ล้างผลรางวัลทั้งหมดเรียบร้อยแล้ว");
    return;
  }

  if (text === "✏️ แก้ไขเลขยูส" && isAdmin(userId)) {
    bot.sendMessage(chatId, "✏️ ส่งข้อมูลรูปแบบ: userId,เลขใหม่ (เช่น: 123456789,5678)");
    bot.once("message", async (res) => {
      const [uid, newNumber] = (res.text || "").split(",").map(s => (s||"").trim());
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
    bot.sendMessage(chatId, "⬅️ กลับเมนูหลักแล้ว", {
      reply_markup: mainMenuKeyboard(true)
    });
    return;
  }

 /* User sends a guess number */
if (/^\d{2,4}$/.test(text)) {
  const round = getRoundDate();
  const guess = text;

  bot.sendMessage(chatId, `🎲 ທ່ານທາຍເລກ: ${guess}\nຕ້ອງການຢືນຢັນບໍ?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ ຢືນຢັນ", callback_data: `confirm_${round}_${guess}` },
          { text: "❌ ຍົກເລີກ", callback_data: `cancel_${round}_${guess}` }
        ]
      ]
    }
  });
}

/* ===== Inline Button Handler ===== */
bot.on("callback_query", async (cbq) => {
  const data = cbq.data;
  const msg = cbq.message;
  const chatId = msg.chat.id;
  const userId = cbq.from.id.toString();
  const username = cbq.from.username || "";
  const name = cbq.from.first_name || "";

  if (data.startsWith("confirm_")) {
    const [, round, guess] = data.split("_");
    try {
      await Bet.create({ userId, username, name, number: guess, round });
      bot.sendMessage(chatId, `✅ ຢືນຢັນສຳເລັດ! ບັນທຶກເລກ ${guess} ຂອງທ່ານແລ້ວ`);
    } catch (e) {
      if (e && e.code === 11000) {
        bot.sendMessage(chatId, "⚠️ ທ່ານໄດ້ທາຍແລ້ວໃນຮອບນີ້");
      } else {
        bot.sendMessage(chatId, "❌ ເກີດຂໍ້ຜິດພາດ ລອງໃໝ່ອີກຄັ້ງ");
      }
    }
  }

  if (data.startsWith("cancel_")) {
    bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍເລກແລ້ວ");
  }

  bot.answerCallbackQuery(cbq.id);
});

/* ===== CRON Jobs ===== */
cron.schedule("30 20 * * 1,3,5", async () => {
  const admins = [SUPER_ADMIN_ID, ...EDITOR_IDS].filter(Boolean);
  for (const id of admins) {
    await bot.sendMessage(id, "⏰ กรุณากรอกผลรางวัลก่อน 21:00 น. (กด 📝 กรอกผลรางวัล)");
  }
}, { timezone: TZ });

cron.schedule("0 21 * * 1,3,5", async () => {
  const round = getRoundDate();
  const result = await Result.findOne({ round }).sort({ createdAt: -1 });
  if (!result) {
    await bot.sendMessage(TARGET_GROUP_ID, "⚠️ ຍັງບໍ່ມີຜົນຮອບນີ້");
    return;
  }
  result.isPublished = true; // ✅ Patch 2
  await result.save();

  const winners4 = await Bet.find({ number: result.top4, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
  const winners3 = await Bet.find({ number: result.top3, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });
  const winners2 = await Bet.find({ number: result.top2, round, userId: { $nin: [SUPER_ADMIN_ID, ...EDITOR_IDS] } });

  const CREDIT4 = "20,000 ເຄຣດິດ";
  const CREDIT3 = "5,000 ເຄຣດິດ";
  const CREDIT2 = "500 ເຄຣດິດ";

  let msg = `🏆 ຜົນຫວຍປະຈຳວັນ ${round}\n═════════════════════\n\n` +
            `🏆 ລາງວັນ:\n` +
            `👑 4 ຕົວຕົງ ➝ ${CREDIT4}\n` +
            `🥇 3 ຕົວບນ ➝ ${CREDIT3}\n` +
            `⬆️ 2 ຕົວບນ ➝ ${CREDIT2}\n\n` +
            `👑 4 ຕົວ: ${result.top4}\n` +
            (winners4.length ? `🎯 ${prettyList(winners4, CREDIT4)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
            `🥇 3 ຕົວ: ${result.top3}\n` +
            (winners3.length ? `🎯 ${prettyList(winners3, CREDIT3)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
            `⬆️ 2 ຕົວ: ${result.top2}\n` +
            (winners2.length ? `🎯 ${prettyList(winners2, CREDIT2)}\n\n` : `🎯 ❌ ບໍ່ມີ\n\n`) +
            `═════════════════════\n🎉 ຍິນດີກັບຜູ້ຖືກລາງວັນທຸກທ່ານ!\n✨ ຂໍໃຫ້ໂຊກດີໃນຮ່ອບໜ້າ!`;

  await bot.sendMessage(TARGET_GROUP_ID, msg);
  await Bet.deleteMany({ round });
}, { timezone: TZ });

/* ===== Webhook ===== */
const WEBHOOK_URL = `${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL);
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (_, res) => res.send("Lao Lotto Bot ✅"));

/* ===== Start server ===== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on :${PORT} | Webhook -> ${WEBHOOK_URL}`));

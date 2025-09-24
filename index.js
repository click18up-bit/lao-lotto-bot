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

/* ===== Setup ===== */
const app = express();
app.use(express.json());
const bot = new TelegramBot(BOT_TOKEN);

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
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  const userId = msg.from.id.toString();
  const username = msg.from.username || "";
  const name = msg.from.first_name || "";

  if (!text) return;

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

  if (text === "🔍 ກວດຜົນຫວຍ") {
    const last = await Result.findOne().sort({ createdAt: -1 });
    if (!last) {
      bot.sendMessage(chatId, "❌ ຍັງບໍ່ມີຜົນຫວຍ");
    } else {
      const round = last.round;
      const winners4 = await Bet.find({ number: last.top4, round });
      const winners3 = await Bet.find({ number: last.top3, round });
      const winners2 = await Bet.find({ number: last.top2, round });
      let msgResult = `🎉 ປະກາດຜົນຫວຍ ${round}\n═════════════════════\n\n`;
      msgResult += `👑 4 ຕົວ: ${last.top4} ➝ 20,000 ເຄຣດິດ\n🎯 ${prettyList(winners4)}\n\n`;
      msgResult += `🥇 3 ຕົວ: ${last.top3} ➝ 5,000 ເຄຣດິດ\n🎯 ${prettyList(winners3)}\n\n`;
      msgResult += `⬆️ 2 ຕົວ: ${last.top2} ➝ 500 ເຄຣດິດ\n🎯 ${prettyList(winners2)}\n\n`;
      msgResult += "═════════════════════\n🏆 ຂໍໃຫ້ໂຊກດີໃນຮອບໜ້າ!";
      bot.sendMessage(chatId, msgResult);
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
          [{ text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${userId}:${username}:${name}` }],
          [{ text: "❌ ຍົກເລີກ", callback_data: "cancel" }]
        ]
      }
    });
  }

  if (text === "📊 จัดการระบบ" && isAdmin(userId)) {
    const replyMarkup = {
      reply_markup: {
        keyboard: [
          [{ text: "👥 จำนวนผู้ทายวันนี้" }],
          [{ text: "📊 จำนวนผู้ทายทั้งหมด" }],
          [{ text: "🧹 รีเซตโพยทั้งหมด" }],
          [{ text: "❌ ล้างผลรางวัลทั้งหมด" }],
          [{ text: "↩️ กลับเมนูหลัก" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    bot.sendMessage(chatId, "📊 เมนูจัดการระบบ", replyMarkup);
    return;
  }

  if (text === "👥 จำนวนผู้ทายวันนี้" && isAdmin(userId)) {
    const round = getRoundDate();
    const count = await Bet.countDocuments({ round });
    bot.sendMessage(chatId, `👥 จำนวนผู้ทายในวันนี้: ${count}`);
    return;
  }

  if (text === "📊 จำนวนผู้ทายทั้งหมด" && isAdmin(userId)) {
    const count = await Bet.countDocuments();
    bot.sendMessage(chatId, `📊 จำนวนโพยทั้งหมด: ${count}`);
    return;
  }

  if (text === "🧹 รีเซตโพยทั้งหมด" && isAdmin(userId)) {
    const round = getRoundDate();
    await Bet.deleteMany({ round });
    bot.sendMessage(chatId, "🧹 รีเซตโพยของรอบนี้แล้ว");
    return;
  }

  if (text === "❌ ล้างผลรางวัลทั้งหมด" && isAdmin(userId)) {
    await Result.deleteMany({});
    bot.sendMessage(chatId, "❌ ล้างผลรางวัลทั้งหมดเรียบร้อยแล้ว");
    return;
  }

  if (text === "↩️ กลับเมนูหลัก" && isAdmin(userId)) {
    bot.emit("text", { chat: { id: chatId }, from: { id: userId } }, "/start");
  }
});

/* ===== Callback Query ===== */
bot.on("callback_query", async (cb) => {
  const data = cb.data;
  const chatId = cb.message.chat.id;

  if (data.startsWith("confirm:")) {
    const [, number, userId, username, name] = data.split(":");
    const round = getRoundDate();
    const already = await Bet.findOne({ userId, round });
    if (already) {
      bot.sendMessage(chatId, "⚠️ ທ່ານທາຍແລ້ວ");
    } else {
      await Bet.create({ userId, username, name, number, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
    }
  } else if (data === "cancel") {
    bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍ");
  }
  bot.answerCallbackQuery(cb.id);
});

/* ===== CRON Jobs ===== */
cron.schedule("30 20 * * 1,3,5", async () => {
  const admins = [SUPER_ADMIN_ID, ...EDITOR_IDS].filter(Boolean);
  for (const id of admins) {
    await bot.sendMessage(id, "⏰ กรุณากรอกผลรางวัลก่อน 21:00 น. (กด 📝 กรอกผลรางวัล)");
  }
}, { timezone: "Asia/Bangkok" });

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
  msg += `👑 4 ຕົວ: ${result.top4} ➝ 20,000 ເຄຣດິດ\n🎯 ${prettyList(winners4)}\n\n`;
  msg += `🥇 3 ຕົວ: ${result.top3} ➝ 5,000 ເຄຣດິດ\n🎯 ${prettyList(winners3)}\n\n`;
  msg += `⬆️ 2 ຕົວ: ${result.top2} ➝ 500 ເຄຣດິດ\n🎯 ${prettyList(winners2)}\n\n`;
  msg += "═════════════════════\n🏆 ຂໍໃຫ້ໂຊກດີໃນຮອບໜ້າ!";

  await bot.sendMessage(TARGET_GROUP_ID, msg);
  await Bet.deleteMany({ round });
}, { timezone: "Asia/Bangkok" });

/* ===== Webhook ===== */
const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`;
bot.setWebHook(WEBHOOK_URL);
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.get("/", (_, res) => res.send("Lao Lotto Bot Webhook ✅"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));

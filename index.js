// index.js
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== ENV ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_ID;
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",");
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// ====== BOT ======
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`);

app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ====== Schema ======
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now },
});
const Bet = mongoose.model("Bet", BetSchema);

const ResultSchema = new mongoose.Schema({
  round: String,
  top4: String,
  top3: String,
  top2: String,
  createdAt: { type: Date, default: Date.now },
});
const Result = mongoose.model("Result", ResultSchema);

// ====== DB Connect ======
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ====== Helper ======
function getLotteryDate() {
  const now = new Date();
  return now.toISOString().split("T")[0];
}
function isSuperAdmin(id) {
  return id.toString() === SUPER_ADMIN_ID;
}
function isEditor(id) {
  return EDITOR_IDS.includes(id.toString());
}

// ====== START ======
bot.onText(/\/start/, (msg) => {
  const isAdmin = isSuperAdmin(msg.from.id) || isEditor(msg.from.id);
  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ເລືອກເມນູ:", {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }],
        ...(isAdmin ? [[{ text: "📥 กรอกผลรางวัล" }]] : []),
        ...(isSuperAdmin(msg.from.id)
          ? [[{ text: "♻️ ล้างผลรางวัล" }]]
          : []),
      ],
      resize_keyboard: true,
    },
  });
});

// ====== Message Handler ======
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // ผู้เล่นเริ่มเกม
  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(
      chatId,
      `🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n\n📜 ກົດກາ:\n1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n2️⃣ ພິມເລກ 2, 3 ຫຼື 4 ຕົວ\n\n🏆 ລາງວັນ:\n👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n🥇 3 ຕົວບນ ➝ 5,000 ເຄຣດິດ\n⬆️ 2 ຕົວບນ ➝ 500 ເຄຣດິດ\n\n📅 ປະກາດຜົນ: 21:00 ໂມງ\n🕣 ປິດຮັບ: 20:25 ໂມງ\n═════════════════════\n🎯 ພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອຮ່ວມສົນຸກ`
    );
  }

  // ผู้เล่นกรอกเลข
  if (/^\d{2,4}$/.test(text)) {
    const round = getLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(
        chatId,
        "⚠️ ທ່ານໄດ້ທາຍແລ້ວ ລໍຖ້າຮອບໃໝ່ຫຼັງປະກາດຜົນ"
      );
      return;
    }
    bot.sendMessage(chatId, `ຢືນຢັນເລກ ${text}?`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "✅ ຢືນຢັນ",
              callback_data: `confirm:${text}:${msg.from.first_name}`,
            },
          ],
          [{ text: "❌ ຍົກເລີກ", callback_data: "cancel" }],
        ],
      },
    });
  }

  // แอดมินกรอกผลรางวัล
  if (text === "📥 กรอกผลรางวัล" && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    bot.sendMessage(chatId, "✍️ กรุณาพิมพ์เลข 4 หลัก (ตัวเดียว)");
  }

  // แอดมินพิมพ์เลข 4 หลัก
  if (/^\d{4}$/.test(text) && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    const digit4 = text;
    const digit3 = text.slice(-3);
    const digit2 = text.slice(-2);
    const round = getLotteryDate();

    // ถ้ามีผลแล้ว ไม่ให้กรอกซ้ำ
    const exist = await Result.findOne({ round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ มีผลรางวัลงวดนี้แล้ว ต้อง ♻️ ล้างผลรางวัลก่อน");
      return;
    }

    bot.sendMessage(chatId, `✅ ยืนยันผลรางวัล: ${digit4} ?\n👑 4 ตัว: ${digit4}\n🥇 3 ตัว: ${digit3}\n⬆️ 2 ตัว: ${digit2}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ ยืนยัน", callback_data: `result_confirm:${digit4}` }],
          [{ text: "❌ ยกเลิก", callback_data: "result_cancel" }],
        ],
      },
    });
  }

  // SUPER_ADMIN reset result
  if (text === "♻️ ล้างผลรางวัล" && isSuperAdmin(msg.from.id)) {
    await Result.deleteMany({});
    bot.sendMessage(chatId, "♻️ ล้างผลรางวัลเรียบร้อย");
  }

  // ตรวจผลหวย
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const result = await Result.findOne().sort({ createdAt: -1 });
    if (!result) {
      bot.sendMessage(chatId, "❌ ຍັງບໍ່ມີຜົນຫວຍ");
    } else {
      bot.sendMessage(
        chatId,
        `📢 ຜົນຫວຍລ່າສຸດ (${result.round})\n👑 4 ຕົວ: ${result.top4}\n🥇 3 ຕົວ: ${result.top3}\n⬆️ 2 ຕົວ: ${result.top2}`
      );
    }
  }
});

// ====== Callback Query ======
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  // ผู้เล่นยืนยันโพย
  if (data.startsWith("confirm:")) {
    const [, number, name] = data.split(":");
    const round = getLotteryDate();
    await Bet.create({ userId: chatId, name, number, round });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
  } else if (data === "cancel") {
    bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍ");
  }

  // แอดมินยืนยันผล
  if (data.startsWith("result_confirm:")) {
    const digit4 = data.split(":")[1];
    const digit3 = digit4.slice(-3);
    const digit2 = digit4.slice(-2);
    const round = getLotteryDate();
    await Result.create({ round, top4: digit4, top3: digit3, top2: digit2 });
    bot.sendMessage(chatId, "✅ บันทึกผลรางวัลเรียบร้อย");
  } else if (data === "result_cancel") {
    bot.sendMessage(chatId, "❌ ยกเลิกการบันทึกผล");
  }

  bot.answerCallbackQuery(cb.id);
});

// ====== CRON JOB ======
// เตือนแอดมิน 20:30 (ไทย) → 13:30 UTC
cron.schedule("30 13 * * 1,3,5", async () => {
  const ids = [SUPER_ADMIN_ID, ...EDITOR_IDS];
  for (let id of ids) {
    bot.sendMessage(
      id,
      "⏰ แจ้งเตือน!\nกรุณากรอกผลรางวัลหวยงวดวันนี้ก่อนเวลา 21:00\nกดปุ่ม 📥 กรอกผลรางวัล เพื่อบันทึกเลข 4 หลัก"
    );
  }
});

// ประกาศผล 21:00 (ไทย) → 14:00 UTC
cron.schedule("0 14 * * 1,3,5", async () => {
  const round = getLotteryDate();
  const result = await Result.findOne({ round });
  if (!result) {
    bot.sendMessage(TARGET_GROUP_ID, "⚠️ ยังไม่มีผลรางวัล กรุณาให้แอดมินกรอก");
    return;
  }

  const winners4 = await Bet.find({ number: result.top4, round });
  const winners3 = await Bet.find({ number: result.top3, round });
  const winners2 = await Bet.find({ number: result.top2, round });

  let msgResult = `🎉 ປະກາດຜົນຫວຍປະຈຳວັນທີ ${round}\n═════════════════════\n\n`;
  msgResult += `👑 ລາງວັນ 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\nເລກ: ${result.top4}\n🎯 ຜູ້ຖືກລາງວັນ: ${
    winners4.length ? winners4.map((w) => "@" + w.name).join(", ") : "❌ ບໍ່ມີ"
  }\n\n`;
  msgResult += `🥇 ລາງວັນ 3 ຕົວບນ ➝ 5,000 ເຄຣດິດ\nເລກ: ${result.top3}\n🎯 ຜູ້ຖືກລາງວັນ: ${
    winners3.length ? winners3.map((w) => "@" + w.name).join(", ") : "❌ ບໍ່ມີ"
  }\n\n`;
  msgResult += `⬆️ ລາງວັນ 2 ຕົວບນ ➝ 500 ເຄຣດິດ\nເລກ: ${result.top2}\n🎯 ຜູ້ຖືກລາງວັນ: ${
    winners2.length ? winners2.map((w) => "@" + w.name).join(", ") : "❌ ບໍ່ມີ"
  }\n\n`;
  msgResult += "═════════════════════\n🏆 ຂໍໃຫ້ໂຊກດີໃນຮອບໜ້າ!";

  bot.sendMessage(TARGET_GROUP_ID, msgResult);
});

// ====== Health Check ======
app.get("/", (req, res) => {
  res.send("🚀 Lao Lotto Bot is running (Webhook mode)");
});
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

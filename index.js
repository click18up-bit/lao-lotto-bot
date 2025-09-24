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

// ===== DB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now },
});
const Bet = mongoose.model("Bet", BetSchema);

// ===== Connect DB =====
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ===== Helper =====
function getLotteryDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

function isSuperAdmin(id) {
  return id.toString() === SUPER_ADMIN_ID;
}
function isEditor(id) {
  return EDITOR_IDS.includes(id.toString());
}

// ===== START =====
bot.onText(/\/start/, (msg) => {
  const userId = msg.from.id.toString();
  const isAdmin = isSuperAdmin(userId) || isEditor(userId);

  let keyboard = [
    [{ text: "🎲 ເລີ່ມທາຍເລກ" }],
    [{ text: "🔍 ກວດຜົນຫວຍ" }],
  ];

  if (isAdmin) {
    keyboard.push([{ text: "📥 กรอกผลรางวัล" }]);
    keyboard.push([{ text: "📢 ประกาศผลรางวัล" }]);
  }
  if (isSuperAdmin(userId)) {
    keyboard.push([{ text: "🔄 รีเซ็ตโพย" }]);
  }

  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ເລືອກເມນູ:", {
    reply_markup: {
      keyboard: keyboard,
      resize_keyboard: true,
    },
  });
});

// ===== Message Handler =====
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const text = (msg.text || "").trim();

  // ผู้เล่นทายเลข
  if (/^\d{2,4}$/.test(text)) {
    const round = getLotteryDate();
    const exist = await Bet.findOne({ userId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານໄດ້ທາຍແລ້ວ ກະລຸນາລໍຖ້າຮອບໃໝ່ຫຼັງປະກາດຜົນ");
      return;
    }

    bot.sendMessage(
      chatId,
      `❓ ຢືນຢັນເລກ *${text}* ແມ່ນບໍ?`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ ຕົກລົງ", callback_data: `confirm:${text}:${msg.from.first_name}` },
              { text: "❌ ຍົກເລີກ", callback_data: "cancel" },
            ],
          ],
        },
      }
    );
    return;
  }

  // เริ่มทายเลข
  if (text === "🎲 ເລີ່ມທາຍເລກ") {
    bot.sendMessage(
      chatId,
      "🎲 ເລີ່ມທາຍເລກໄດ້ແລ້ວ\nພິມເລກ 2, 3 ຫຼື 4 ຕົວ (ຕົວຢ່າງ: 12, 123, 1234)"
    );
  }

  // ตรวจผล
  if (text === "🔍 ກວດຜົນຫວຍ") {
    const round = getLotteryDate();
    bot.sendMessage(
      chatId,
      `🔍 ຜົນຫວຍປະຈຳວັນທີ ${round}\n\n(❗ ບໍ່ມີຜົນຫາກຍັງບໍ່ປະກາດ)`
    );
  }

  // แอดมิน: กรอกผล
  if (text === "📥 กรอกผลรางวัล" && (isSuperAdmin(userId) || isEditor(userId))) {
    bot.sendMessage(chatId, "✍️ กรุณาพิมพ์เลขรางวัล 4 หลัก (เช่น 1234)");
  }

  // แอดมิน: บันทึกเลข 4 ตัว
  if (/^\d{4}$/.test(text) && (isSuperAdmin(userId) || isEditor(userId))) {
    global.lotteryResult = text;
    bot.sendMessage(chatId, `✅ บันทึกผลรางวัล ${text} เรียบร้อย`);
  }

  // แอดมิน: ประกาศผล
  if (text === "📢 ประกาศผลรางวัล" && (isSuperAdmin(userId) || isEditor(userId))) {
    if (!global.lotteryResult) {
      bot.sendMessage(chatId, "⚠️ ยังไม่ได้กรอกผลรางวัล");
      return;
    }

    const result4 = global.lotteryResult;
    const result3 = result4.slice(-3);
    const result2 = result4.slice(-2);
    const round = getLotteryDate();

    const winners4 = await Bet.find({ number: result4, round });
    const winners3 = await Bet.find({ number: result3, round });
    const winners2 = await Bet.find({ number: result2, round });

    let msgResult = `🎉 ຜົນຫວຍປະຈຳວັນທີ ${round}\n\n`;

    msgResult += `👑 4 ຕົວ: ${result4}\n`;
    msgResult += winners4.length
      ? `🎯 ${winners4.map((w) => "@" + w.name).join(", ")} (20,000 ເຄຣດິດ)\n\n`
      : "❌ ບໍ່ມີຜູ້ຖືກລາງວັນ\n\n";

    msgResult += `🥇 3 ຕົວ: ${result3}\n`;
    msgResult += winners3.length
      ? `🎯 ${winners3.map((w) => "@" + w.name).join(", ")} (5,000 ເຄຣດິດ)\n\n`
      : "❌ ບໍ່ມີຜູ້ຖືກລາງວັນ\n\n";

    msgResult += `⬆️ 2 ຕົວ: ${result2}\n`;
    msgResult += winners2.length
      ? `🎯 ${winners2.map((w) => "@" + w.name).join(", ")} (500 ເຄຣດິດ)\n`
      : "❌ ບໍ່ມີຜູ້ຖືກລາງວັນ\n";

    bot.sendMessage(TARGET_GROUP_ID, msgResult);
    bot.sendMessage(chatId, "📢 ประกาศผลรางวัลเรียบร้อย");
  }

  // แอดมิน: Reset
  if (text === "🔄 รีเซ็ตโพย" && isSuperAdmin(userId)) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId, "♻️ ล้างโพยเรียบร้อยแล้ว");
  }
});

// ===== Callback =====
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

// ===== Health Check =====
app.get("/", (req, res) => {
  res.send("🚀 Lao Lotto Bot is running (Webhook mode)");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

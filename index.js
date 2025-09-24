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

/* ================= Schema ================= */
const BetSchema = new mongoose.Schema({
  userId: String,
  username: String,
  name: String,
  number: String,
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

const ResultSchema = new mongoose.Schema({
  date: String,
  digit4: String,
  digit3: String,
  digit2: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', ResultSchema);

/* ================= Connect DB ================= */
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

/* ================= Helper ================= */
function getLotteryDate() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}
function isSuperAdmin(id) {
  return parseInt(id) === parseInt(SUPER_ADMIN_ID);
}
function isEditor(id) {
  return EDITOR_IDS.map(x => x.toString()).includes(id.toString());
}

/* ================= Start Command ================= */
bot.onText(/\/start/, (msg) => {
  const isAdmin = isSuperAdmin(msg.from.id) || isEditor(msg.from.id);

  bot.sendMessage(msg.chat.id, "👋 ສະບາຍດີ! ເລືອກເມນູ:", {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }],
        ...(isAdmin ? [[{ text: "✍️ ກອກຜົນຫວຍ" }]] : []),
        ...(isSuperAdmin(msg.from.id) ? [[{ text: "♻️ Reset Database" }]] : [])
      ],
      resize_keyboard: true
    }
  });
});

/* ================= Messages ================= */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  // 🎲 Start Game
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2, 3 ຫຼື 4 ຕົວ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "👑 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວບນ ➝ 5,000 ເຄຣດິດ\n" +
      "⬆️ 2 ຕົວບນ ➝ 500 ເຄຣດິດ\n\n" +
      "📅 ປະກາດຜົນ: 21:00 ໂມງ\n" +
      "🕣 ປິດຮັບ: 20:25 ໂມງ\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2, 3 ຫຼື 4 ຕົວ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // 🔎 Check Result
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const date = getLotteryDate();
    const result = await Result.findOne({ date }).sort({ createdAt: -1 });

    if (!result) {
      bot.sendMessage(chatId,
        `🔎 ກວດຜົນຫວຍ\n📅 ງວດປະຈຳວັນທີ: ${date}\n\n` +
        "👑 4 ຕົວ: (ຍັງບໍ່ປະກາດ)\n" +
        "🥇 3 ຕົວ: (ຍັງບໍ່ປະກາດ)\n" +
        "⬆️ 2 ຕົວ: (ຍັງບໍ່ປະກາດ)\n\n" +
        "📢 ຜົນຈະປະກາດເວລາ 21:00 ໂມງ"
      );
    } else {
      bot.sendMessage(chatId,
        `🔎 ກວດຜົນຫວຍ\n📅 ງວດປະຈຳວັນທີ: ${result.date}\n\n` +
        `👑 4 ຕົວ: ${result.digit4}\n` +
        `🥇 3 ຕົວ: ${result.digit3}\n` +
        `⬆️ 2 ຕົວ: ${result.digit2}\n\n` +
        "📢 ປະກາດຜົນແລ້ວ ✅"
      );
    }
    return;
  }

  // ✍️ Input Result
  if (text === "✍️ ກອກຜົນຫວຍ" && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    bot.sendMessage(chatId, "✍️ ກະລຸນາພິມເລກ 4 ຕົວ (ຕົວເລກດຽວ)");
    return;
  }

  // ♻️ Reset Database
  if (text === "♻️ Reset Database" && isSuperAdmin(msg.from.id)) {
    await Bet.deleteMany({});
    await Result.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນແລ້ວ");
    return;
  }

  // Save Bet
  if (/^\d{2,4}$/.test(text)) {
    const round = getLotteryDate();
    const exist = await Bet.findOne({ userId: msg.from.id, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານໄດ້ທາຍແລ້ວ ລໍຖ້າຮອບໃໝ່ຫຼັງປະກາດຜົນ");
      return;
    }

    bot.sendMessage(chatId, `ຢືນຢັນເລກ ${text}?`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${msg.from.username || msg.from.first_name}` }],
          [{ text: "❌ ຍົກເລີກ", callback_data: "cancel" }]
        ]
      }
    });
  }

  // Admin input result 4 digits
  if (/^\d{4}$/.test(text) && (isSuperAdmin(msg.from.id) || isEditor(msg.from.id))) {
    const digit4 = text;
    const digit3 = text.slice(-3);
    const digit2 = text.slice(-2);
    const date = getLotteryDate();

    const winners4 = await Bet.find({ number: digit4, round: date });
    const winners3 = await Bet.find({ number: digit3, round: date });
    const winners2 = await Bet.find({ number: digit2, round: date });

    await Result.deleteMany({ date });
    await Result.create({ date, digit4, digit3, digit2 });

    const formatWinners = (arr, prize) =>
      arr.map((w) => `🎯 ${(w.username ? '@' + w.username : w.name)} ➝ ${prize} ເຄຣດິດ`).join("\n");

    let msgResult = `🎉 ຜົນຫວຍວັນທີ ${date}\n\n`;

    msgResult += `👑 4 ຕົວ: ${digit4}\n`;
    msgResult += winners4.length ? formatWinners(winners4, "20,000") : "❌ ບໍ່ມີຜູ້ຖືກ";
    msgResult += "\n\n";

    msgResult += `🥇 3 ຕົວ: ${digit3}\n`;
    msgResult += winners3.length ? formatWinners(winners3, "5,000") : "❌ ບໍ່ມີຜູ້ຖືກ";
    msgResult += "\n\n";

    msgResult += `⬆️ 2 ຕົວ: ${digit2}\n`;
    msgResult += winners2.length ? formatWinners(winners2, "500") : "❌ ບໍ່ມີຜູ້ຖືກ";

    bot.sendMessage(TARGET_GROUP_ID, msgResult);
  }
});

/* ================= Callback ================= */
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data;

  if (data.startsWith("confirm:")) {
    const [, number, name] = data.split(":");
    const round = getLotteryDate();
    await Bet.create({
      userId: cb.from.id,
      username: cb.from.username,
      name,
      number,
      round
    });
    bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${number} ຂອງທ່ານແລ້ວ`);
  } else if (data === "cancel") {
    bot.sendMessage(chatId, "❌ ຍົກເລີກການທາຍ");
  }

  bot.answerCallbackQuery(cb.id);
});

/* ================= Health check ================= */
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀 (Webhook mode)');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

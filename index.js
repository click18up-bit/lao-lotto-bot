const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ===== MongoDB Schema =====
const BetSchema = new mongoose.Schema({
  userId: String,
  number: String,
  pos: String,   // top/bottom ถ้าเลือก 2 หลัก
  round: String,
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

// ===== Connect MongoDB =====
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ===== หาวันหวยออกล่าสุด (จันทร์/พุธ/ศุกร์) =====
function getLastLotteryDate() {
  const today = new Date();
  const lottoDays = [1, 3, 5]; // Mon=1, Wed=3, Fri=5
  let d = new Date(today);

  // ถ้าวันนี้ไม่ใช่วันหวย หรือยังไม่ถึงเวลา 20:30 → ถอยไปวันหวยล่าสุด
  if (
    !lottoDays.includes(d.getDay()) ||
    (today.getHours() < 20 || (today.getHours() === 20 && today.getMinutes() < 30))
  ) {
    do {
      d.setDate(d.getDate() - 1);
    } while (!lottoDays.includes(d.getDay()));
  }

  return d.toISOString().split("T")[0];
}

// ===== ฟังก์ชันดึงผลหวย (mock — คุณปรับไปดึงจริงจาก API ได้) =====
async function fetchLatestResult() {
  const d4 = "2025"; // mock
  return {
    digit4: d4,
    digit3: d4.slice(1),
    digit2top: d4.slice(2),
    digit2bottom: d4.slice(0, 2)
  };
}

// ===== ฟังก์ชันประกาศผลอัตโนมัติ =====
async function announceResult() {
  const res = await fetchLatestResult();
  const lastDate = getLastLotteryDate();
  let msg =
    "🎉 ຜົນຫວຍລາວ ງວດ " + lastDate + "\n" +
    "═════════════════════\n" +
    "🏆 4 ຕົວ: " + res.digit4 + "\n" +
    "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
    "🥈 2 ຕົວເທິງ: " + res.digit2top + "\n" +
    "🥈 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
    "═════════════════════\n\n" +
    "🎊 ຂອບໃຈທຸກຄົນທີ່ຮ່ວມສົນຸກ!";
  bot.sendMessage(process.env.TARGET_GROUP_ID, msg);
}

// ตั้งเวลาให้ประกาศผลทุก จันทร์/พุธ/ศุกร์ 20:30
cron.schedule("30 20 * * 1,3,5", () => {
  announceResult();
});

// ===== คำสั่งเริ่มต้น =====
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    "👋 ສະບາຍດີ! ກົດປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
          [{ text: "🔎 ກວດຜົນຫວຍ" }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// ===== ฟังข้อความ =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // 🎲 เริ่มทายเลข
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    await Bet.deleteMany({ round: getLastLotteryDate() }); // reset รอบใหม่
    const roundDate = getLastLotteryDate();
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n" +
      "📜 ກົດກາ:\n" +
      "1️⃣ ທາຍໄດ້ຄັ້ງດຽວຕໍ່ຮອບ\n" +
      "2️⃣ ພິມເລກ 2 ຫຼື 4 ຫຼັກ\n" +
      "   - ຖ້າ 2 ຫຼັກ ຈະເລືອກ ເທິງ ຫຼື ລຸ່ມ\n" +
      "   - ຖ້າ 3-4 ຫຼັກ ບັນທຶກທັນທີ\n\n" +
      "🏆 ລາງວັນ:\n" +
      "🎖 4 ຕົວຕົງ ➝ 20,000 ເຄຣດິດ\n" +
      "🥇 3 ຕົວທ້າຍ ➝ 5,000 ເຄຣດິດ\n" +
      "🥈 2 ຕົວເທິງ ➝ 500 ເຄຣດິດ\n" +
      "🥈 2 ຕົວລຸ່ມ ➝ 500 ເຄຣດິດ\n\n" +
      `📅 ປະກາດຜົນ: ${roundDate} ເວລາ 20:30\n` +
      "🕣 ປິດຮັບ: 20:25\n" +
      "═════════════════════\n" +
      "🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // 🔎 ตรวจผลหวย
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await fetchLatestResult();
    const lastDate = getLastLotteryDate();
    bot.sendMessage(chatId,
      "✅ ຜົນຫວຍລ່າສຸດ:\n" +
      "🏆 4 ຕົວ: " + res.digit4 + "\n" +
      "🥇 3 ຕົວທ້າຍ: " + res.digit3 + "\n" +
      "🥈 2 ຕົວເທິງ: " + res.digit2top + "\n" +
      "🥈 2 ຕົວລຸ່ມ: " + res.digit2bottom + "\n" +
      "📅 ວັນທີ: " + lastDate
    );
    return;
  }

  // 📝 ผู้ใช้พิมพ์เลข 2–4 หลัก
  if (/^\d{2,4}$/.test(text)) {
    const round = getLastLotteryDate();
    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.sendMessage(chatId, "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້");
      return;
    }

    if (text.length === 2) {
      // แสดงปุ่มเลือกบน/ล่าง
      bot.sendMessage(chatId,
        `📌 ເລືອກຕຳແໜ່ງໃຫ້ເລກ ${text}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "ເທິງ", callback_data: `bet:${text}:top` }],
              [{ text: "ລຸ່ມ", callback_data: `bet:${text}:bottom` }]
            ]
          }
        }
      );
    } else {
      // 3–4 หลัก → บันทึกทันที
      await Bet.create({ userId: chatId, number: text, round });
      bot.sendMessage(chatId, `✅ ບັນທຶກເລກ ${text} ຂອງທ່ານແລ້ວ`);
    }
  }
});

// 🎯 ฟัง callback จากปุ่ม บน/ล่าง
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data.startsWith("bet:")) {
    const [, number, pos] = data.split(":");
    const round = getLastLotteryDate();

    const exist = await Bet.findOne({ userId: chatId, round });
    if (exist) {
      bot.answerCallbackQuery(query.id, { text: "⚠️ ທ່ານເຄີຍທາຍແລ້ວໃນຮອບນີ້", show_alert: true });
      return;
    }

    await Bet.create({ userId: chatId, number, pos, round });
    bot.editMessageText(
      `✅ ບັນທຶກເລກ ${number} (${pos === "top" ? "ເທິງ" : "ລຸ່ມ"}) ຂອງທ່ານແລ້ວ`,
      { chat_id: chatId, message_id: query.message.message_id }
    );
  }
});

// ===== Express health check =====
app.get('/', (req, res) => {
  res.send('Lao Lotto Bot is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

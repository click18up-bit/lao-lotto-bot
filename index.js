import express from "express";
import mongoose from "mongoose";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID; // ไว้ส่งประกาศในกลุ่ม

// ================== MongoDB Schema ==================
const BetSchema = new mongoose.Schema({
  userId: String,
  name: String,
  username: String,
  number: String,
  pos: String, // TOP, BOTTOM, null
  createdAt: { type: Date, default: Date.now }
});

const StatSchema = new mongoose.Schema({
  userId: String,
  count: { type: Number, default: 0 }
});

const Bet = mongoose.model("Bet", BetSchema);
const Stat = mongoose.model("Stat", StatSchema);

// ================== Connect DB ==================
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ================== Telegram Bot ==================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    "👋 ສະບາຍດີ! ກົດປຸ່ມດ້ານລຸ່ມເພື່ອເລີ່ມເກມ ຫຼື ກວດຜົນ.",
    {
      reply_markup: {
        keyboard: [
          [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
          [{ text: "🔎 ກວດຜົນຫວຍ" }],
          [{ text: "/stats" }, { text: "/leaderboard" }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// เริ่มเกม
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const name = msg.from.first_name || "";
  const username = msg.from.username || null;
  const text = msg.text?.trim();

  if (!text || text.startsWith("/")) return;

  // เริ่มเกมใหม่
  if (text.includes("ເລີ່ມເກມ")) {
    await Bet.deleteMany({});
    bot.sendMessage(chatId,
      "🎲 ຮອບໃໝ່ເລີ່ມຕົ້ນ!\n📅 ປະກາດຜົນ: 20:30\n🕗 ປິດຮັບ: 20:25\n🎯 ພິມເລກ 2-4 ຫຼັກ ເພື່ອຮ່ວມສົນຸກ"
    );
    return;
  }

  // กวดผลหวย
  if (text.includes("ກວດຜົນ")) {
    const res = await fetchLatestFromLaosdev();
    if (res) {
      bot.sendMessage(chatId,
        `✅ ຜົນຫວຍລ່າສຸດ:\n🏆 4 ຕົວ: ${res.digit4}\n🥇 3 ຕົວທ້າຍ: ${res.digit3}\n🥈 2 ຕົວເທິງ: ${res.digit2top}\n🥈 2 ຕົວລຸ່ມ: ${res.digit2bottom}\n📅 ວັນທີ: ${res.date}`
      );
    }
    return;
  }

  // เลข 2 หลัก → เลือกบน/ล่าง
  if (/^\d{2}$/.test(text)) {
    bot.sendMessage(chatId, "➡️ ເລືອກຕຳແໜ່ງ:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "2 ຕົວເທິງ", callback_data: `TOP_${text}_${userId}` }],
          [{ text: "2 ຕົວລຸ່ມ", callback_data: `BOTTOM_${text}_${userId}` }]
        ]
      }
    });
    return;
  }

  // เลข 3–4 หลัก
  if (/^\d{3,4}$/.test(text)) {
    const exists = await Bet.findOne({ userId, number: text });
    if (exists) {
      bot.sendMessage(chatId, `⚠️ ທ່ານເຄີຍທາຍແລ້ວ: ${text}`);
    } else {
      await Bet.create({ userId, name, username, number: text, pos: null });
      bot.sendMessage(chatId, `✅ ບັນທຶກແລ້ວ: ${text}`);
    }
  }
});

// callback_query (TOP/BOTTOM)
bot.on("callback_query", async (cb) => {
  const chatId = cb.message.chat.id;
  const [pos, guess, userId] = cb.data.split("_");

  const exists = await Bet.findOne({ userId, number: guess });
  if (exists) {
    bot.sendMessage(chatId, `⚠️ ທ່ານເຄີຍທາຍແລ້ວ: ${guess}`);
  } else {
    await Bet.create({
      userId,
      name: cb.from.first_name || "",
      username: cb.from.username || null,
      number: guess,
      pos
    });
    bot.sendMessage(chatId, `✅ ບັນທຶກ: ${guess} (${pos === "TOP" ? "2 ຕົວເທິງ" : "2 ຕົວລຸ່ມ"})`);
  }
});

// สถิติ
bot.onText(/\/stats/, async (msg) => {
  const userId = msg.from.id.toString();
  const stat = await Stat.findOne({ userId });
  bot.sendMessage(msg.chat.id, `📊 ສະຖິຕິການຖືກຂອງທ່ານ: ${stat ? stat.count : 0} ຄັ້ງ`);
});

// Leaderboard
bot.onText(/\/leaderboard/, async (msg) => {
  const top = await Stat.find().sort({ count: -1 }).limit(5);
  let msgText = "🏆 ຈັດອັນດັບຜູ້ຖືກຫວຍ\n";
  top.forEach((s, i) => {
    msgText += `${i + 1}. ${s.userId} ➝ ${s.count} ຄັ້ງ\n`;
  });
  bot.sendMessage(msg.chat.id, msgText);
});

// ================== ฟังก์ชันดึงผลหวย ==================
async function fetchLatestFromLaosdev() {
  try {
    const resp = await axios.get("https://laosdev.net/");
    const match = resp.data.match(/\b(\d{4})\b/);
    if (!match) return null;

    const d4 = match[1];
    return {
      digit4: d4,
      digit3: d4.slice(1),
      digit2top: d4.slice(2),
      digit2bottom: d4.slice(0, 2),
      date: new Date().toLocaleDateString("lo-LA")
    };
  } catch (e) {
    console.error("fetch error", e);
    return null;
  }
}

// ================== Express ==================
app.get("/", (req, res) => res.send("Lao Lotto Bot is running 🚀"));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

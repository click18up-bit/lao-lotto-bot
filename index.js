\
const express = require('express');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ENV =====
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID;
const SUPER_ADMIN_ID = (process.env.SUPER_ADMIN_ID || "").toString();
const EDITOR_IDS = (process.env.EDITOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;

// ===== BOT (Webhook mode) =====
const bot = new TelegramBot(BOT_TOKEN);
bot.setWebHook(`${RENDER_EXTERNAL_URL}/bot${BOT_TOKEN}`);
app.use(express.json());
app.post(`/bot${BOT_TOKEN}`, (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });

// ===== DB =====
const BetSchema = new mongoose.Schema({
  userId: String,     // chat id
  name: String,       // first_name
  username: String,   // optional
  number: String,     // 2/3/4 digits string
  round: String,      // YYYY-MM-DD
  createdAt: { type: Date, default: Date.now }
});
const Bet = mongoose.model('Bet', BetSchema);

const ResultSchema = new mongoose.Schema({
  round: String,      // YYYY-MM-DD
  digit4: String,
  digit3: String,
  digit2top: String,
  createdAt: { type: Date, default: Date.now }
});
const Result = mongoose.model('Result', ResultSchema);

// ===== Connect DB =====
mongoose.connect(MONGO_URI).then(()=>console.log("✅ MongoDB Connected")).catch(e=>console.error("❌ MongoDB Error:", e));

// ===== Helpers =====
const TZ = 'Asia/Bangkok';
function nowInBangkok() {
  // Create a Date representing now in Bangkok using Intl
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour12: false,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const parts = f.formatToParts(new Date());
  const get = t => Number(parts.find(p=>p.type===t).value);
  return { y:get('year'), m:get('month'), d:get('day'), H:get('hour'), M:get('minute'), S:get('second') };
}
function getRoundDate() {
  const n = nowInBangkok();
  return `${n.y}-${String(n.m).padStart(2,'0')}-${String(n.d).padStart(2,'0')}`;
}
function isCutoffPassed() {
  const n = nowInBangkok();
  const mins = n.H*60 + n.M;
  const cutoff = 20*60 + 25; // 20:25
  return mins >= cutoff;
}
function isSuperAdmin(userId){ return userId.toString() === SUPER_ADMIN_ID; }
function isEditorAdmin(userId){ return EDITOR_IDS.includes(userId.toString()); }
function LaoTag(w){ return `<a href="tg://user?id=${w.userId}">${w.name || 'ຜູ້ໃຊ້'}</a>`; }

// ===== UI Text (Lao) =====
const TEXT = {
  start: "👋 ສະບາຍດີ! ກົດປຸ່ມເລືອກເມນູດ້ານລຸ່ມ.",
  rules: "📜 ກົດກາ:\n• ທາຍໄດ້ຄັ້ງດຽວ/ຮອບ\n• ພິມເລກ 2 ຫຼື 4 ຕົວ\n• ປິດຮັບ 20:25, ແຈ້ງເຕືອນ 20:30, ປະກາດ 21:00",
  closed: "⛔️ ປິດຮັບແລ້ວ (ຫຼັງ 20:25) ລໍຖ້າຮອບຕໍ່ໄປ.",
  already: "⚠️ ທ່ານໄດ້ທາຍໄປແລ້ວ ສາມາດທາຍໄດ້ອີກຄັ້ງຫຼັງຈາກປະກາດຜົນຮອບນີ້",
  confirm: (num)=>`📌 ທ່ານເລືອກເລກ: ${num}\n\nກົດເພື່ອຢືນຢັນ`,
  saved: (n)=>`✅ ບັນທຶກເລກ ${n} ຂອງທ່ານແລ້ວ`,
  canceled: (n)=>`❌ ຍົກເລີກເລກ ${n}`,
  adminAsk: "✍️ ກະລຸນາພິມເລກ 4 ຕົວ (ຕົວເລກດຽວ) ເພື່ອບັນທຶກຜົນ",
  adminSaved: (round,d4,d3,d2)=>`✅ ບັນທຶກຜົນຮອບ ${round}\n👑 4 ຕົວ: ${d4}\n🥇 3 ຕົວ: ${d3}\n⬆️ 2 ຕົວ: ${d2}`,
  needsReset: "⚠️ ມີຜົນແລ້ວ ຖ້າຈະແກ້ ໃຫ້ Reset ກ່ອນ.",
  noResult: "❌ ຍັງບໍ່ມີຜົນງວດນີ້",
};

// ===== /start =====
bot.onText(/\/start/, (msg) => {
  const isAdmin = isSuperAdmin(msg.from.id) || isEditorAdmin(msg.from.id);
  bot.sendMessage(msg.chat.id, TEXT.start + "\n\n" + TEXT.rules, {
    reply_markup: {
      keyboard: [
        [{ text: "🎲 ເລີ່ມເກມທາຍເລກ" }],
        [{ text: "🔎 ກວດຜົນຫວຍ" }],
        [{ text: "📅 ຜົນງວດກ່ອນໜ້າ" }],
        ...(isAdmin ? [[{ text: "✍️ ກອກຜົນຫວຍ" }]] : []),
        ...(isSuperAdmin(msg.from.id) ? [[{ text: "♻️ Reset ຮອບ" }]] : [])
      ],
      resize_keyboard: true
    }
  });
});

// ===== Message Handler =====
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (!text) return;

  // Start round (show rules)
  if (text === "🎲 ເລີ່ມເກມທາຍເລກ") {
    bot.sendMessage(chatId, TEXT.rules + `\n\n📅 ຮອບ: ${getRoundDate()}\n🎯 ພິມເລກ 2 ຫຼື 4 ຕົວ`);
    return;
  }

  // Check latest result
  if (text === "🔎 ກວດຜົນຫວຍ") {
    const res = await Result.findOne().sort({ createdAt: -1 });
    if (!res) return bot.sendMessage(chatId, TEXT.noResult);
    const winners4 = await Bet.find({ number: res.digit4, round: res.round });
    const winners3 = await Bet.find({ number: res.digit3, round: res.round });
    const winners2 = await Bet.find({ number: res.digit2top, round: res.round });
    let out = `✅ ຜົນຫວຍ (ຮອບ ${res.round})\n`+
              `👑 4 ຕົວ: ${res.digit4 || "--"}${winners4.length? "\n   🎯 "+ winners4.map(LaoTag).join(", ") : ""}\n\n`+
              `🥇 3 ຕົວ: ${res.digit3 || "--"}${winners3.length? "\n   🎯 "+ winners3.map(LaoTag).join(", ") : ""}\n\n`+
              `⬆️ 2 ຕົວ: ${res.digit2top || "--"}${winners2.length? "\n   🎯 "+ winners2.map(LaoTag).join(", ") : ""}`;
    bot.sendMessage(chatId, out, { parse_mode: "HTML" });
    return;
  }

  // Previous result
  if (text === "📅 ຜົນງວດກ່ອນໜ້າ") {
    const list = await Result.find().sort({ createdAt: -1 }).limit(2);
    if (list.length < 2) return bot.sendMessage(chatId, "❌ ບໍ່ມີຂໍ້ມູນງວດກ່ອນໜ້າ");
    const res = list[1];
    let out = `📅 ຜົນງວດກ່ອນໜ້າ (${res.round})\n`+
              `👑 4 ຕົວ: ${res.digit4 || "--"}\n`+
              `🥇 3 ຕົວ: ${res.digit3 || "--"}\n`+
              `⬆️ 2 ຕົວ: ${res.digit2top || "--"}`;
    bot.sendMessage(chatId, out);
    return;
  }

  // Admin: open input result
  if (text === "✍️ ກອກຜົນຫວຍ" && (isSuperAdmin(msg.from.id) || isEditorAdmin(msg.from.id))) {
    bot.sendMessage(chatId, TEXT.adminAsk);
    return;
  }

  // Super Admin: reset
  if (text === "♻️ Reset ຮອບ" && isSuperAdmin(msg.from.id)) {
    await Bet.deleteMany({});
    await Result.deleteMany({});
    bot.sendMessage(chatId, "♻️ ລ້າງຂໍ້ມູນຮອບແລ້ວ");
    return;
  }

  // Admin submits result: 4 digits only
  if (/^\d{4}$/.test(text) && (isSuperAdmin(msg.from.id) || isEditorAdmin(msg.from.id))) {
    const round = getRoundDate();
    const exist = await Result.findOne({ round });
    if (exist) return bot.sendMessage(chatId, TEXT.needsReset);

    const digit4 = text;
    const digit3 = text.slice(-3);
    const digit2top = text.slice(-2);
    await Result.create({ round, digit4, digit3, digit2top });
    bot.sendMessage(chatId, TEXT.adminSaved(round, digit4, digit3, digit2top));
    return;
  }

  // Player enters numbers (2 or 4 digits) -> confirm
  if (/^\d{2,4}$/.test(text)) {
    if (isCutoffPassed()) return bot.sendMessage(chatId, TEXT.closed);
    const round = getRoundDate();
    const exist = await Bet.findOne({ userId: chatId.toString(), round });
    if (exist) return bot.sendMessage(chatId, TEXT.already);

    bot.sendMessage(chatId, TEXT.confirm(text), {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ ຢືນຢັນ", callback_data: `confirm:${text}:${round}` },
          { text: "❌ ຍົກເລີກ", callback_data: `cancel:${text}` }
        ]]
      }
    });
    return;
  }
});

// ===== Callback for confirm/cancel =====
bot.on('callback_query', async (cb) => {
  const chatId = cb.message.chat.id;
  const data = cb.data || "";
  try {
    if (data.startsWith("confirm:")) {
      const [, number, round] = data.split(":");
      if (isCutoffPassed()) {
        await bot.sendMessage(chatId, TEXT.closed);
      } else {
        const exist = await Bet.findOne({ userId: chatId.toString(), round });
        if (exist) {
          await bot.sendMessage(chatId, TEXT.already);
        } else {
          await Bet.create({
            userId: chatId.toString(),
            name: cb.from.first_name,
            username: cb.from.username || "",
            number,
            round
          });
          await bot.sendMessage(chatId, TEXT.saved(number));
        }
      }
    } else if (data.startsWith("cancel:")) {
      const [, number] = data.split(":");
      await bot.sendMessage(chatId, TEXT.canceled(number || ""));
    }
  } catch (e) {
    console.error("callback error:", e.message);
  } finally {
    bot.answerCallbackQuery(cb.id);
  }
});

// ===== Cron jobs (Bangkok TZ) =====
cron.schedule("30 20 * * *", async () => {
  // 20:30 Asia/Bangkok -> remind admins if no result yet
  const round = getRoundDate();
  const res = await Result.findOne({ round });
  if (!res) {
    const targets = [SUPER_ADMIN_ID, ...EDITOR_IDS];
    for (const id of targets) {
      try { await bot.sendMessage(id, "⏰ 20:30 ແລ້ວ ກະລຸນາກອກຜົນງວດປະຈຸບັນກ່ອນ 21:00"); } catch {}
    }
  }
}, { timezone: TZ });

cron.schedule("0 21 * * *", async () => {
  // 21:00 Asia/Bangkok -> announce result
  const round = getRoundDate();
  const res = await Result.findOne({ round });
  if (!res) { try{ await bot.sendMessage(TARGET_GROUP_ID, "❌ ຍັງບໍ່ມີຜົນງວດນີ້"); }catch{}; return; }
  const w4 = await Bet.find({ number: res.digit4, round });
  const w3 = await Bet.find({ number: res.digit3, round });
  const w2 = await Bet.find({ number: res.digit2top, round });
  let msg = "🎉 ຜົນຫວຍງວດ " + round + "\n" +
            "═════════════════════\n" +
            "👑 4 ຕົວ: " + (res.digit4 || "--") + (w4.length? "\n   🎯 " + w4.map(LaoTag).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
            "🥇 3 ຕົວ: " + (res.digit3 || "--") + (w3.length? "\n   🎯 " + w3.map(LaoTag).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n\n" +
            "⬆️ 2 ຕົວ: " + (res.digit2top || "--") + (w2.length? "\n   🎯 " + w2.map(LaoTag).join(", ") : "\n   ❌ ບໍ່ມີຄົນຖືກ") + "\n" +
            "═════════════════════";
  try { await bot.sendMessage(TARGET_GROUP_ID, msg, { parse_mode: "HTML" }); } catch {}
}, { timezone: TZ });

// ===== Health =====
app.get('/', (req, res) => res.send('Lao Lotto Bot is running 🚀 (Webhook mode, Full)'));

// ===== Start server =====
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

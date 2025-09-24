# Lao Lotto Bot

Telegram Bot ສຳລັບທາຍເລກຫວຍລາວ (Node.js + MongoDB)

## 📌 Features
- ຜູ້ຫຼິ້ນທາຍເລກ 2, 3 ຫຼື 4 ຕົວ ດ້ວຍປຸ່ມຢືນຢັນ
- ປິດຮັບອັດຕະໂນມັດ 20:25
- ແຈ້ງເຕືອນ Admin 20:30
- ປະກາດຜົນອັດຕະໂນມັດ 21:00
- ລະບົບ Admin 2 ລະດັບ (Super Admin, Editor Admin)
- ປະກາດຜົນພ້ອມແທັກຜູ້ຖືກລາງວັນ

## 📂 Project Structure
```
/lao-lotto-bot
  ├── index.js
  ├── package.json
  ├── package-lock.json
  └── README.md
```

## ⚙️ Installation
```bash
npm install
```

## ▶️ Run
```bash
npm start       # run normally
npm run dev     # run with nodemon (auto-reload)
```

## 🚀 Deploy
- Deploy ได้ที่ Render / Railway / VPS / Heroku
- ตั้งค่า ENV:
  - `BOT_TOKEN` = Telegram Bot Token
  - `MONGO_URI` = MongoDB Connection String
  - `TARGET_GROUP_ID` = ID ກຸ່ມ Telegram

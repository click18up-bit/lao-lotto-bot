# Lao Lotto Bot (Webhook, Full)

## Quick Start
```bash
npm install
npm start
```

### ENV (already included in .env)
- BOT_TOKEN
- MONGO_URI
- TARGET_GROUP_ID
- SUPER_ADMIN_ID
- EDITOR_IDS (comma-separated)
- RENDER_EXTERNAL_URL

### Features
- ພິມເລກ 2 ຫຼື 4 ຕົວ → ຕ້ອງກົດຢືນຢັນກ່ອນບັນທຶກ
- ປິດຮັບອັດຕະໂນມັດ 20:25
- 20:30 ແຈ້ງເຕືອນ Admin ໃຫ້ກອກຜົນ
- 21:00 ປະກາດຜົນອັດຕະໂນມັດ (ແທັກຜູ້ຖືກ)
- Super Admin: Reset ຮອບ, ກອກຜົນ
- Editor Admin: ກອກຜົນ
- Health-check `/` (ໃຊ້ກັບ UptimeRobot)


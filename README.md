# Lao Lotto Bot 🎲 (Webhook + Confirm)

## ฟีเจอร์
- ผู้เล่น (ลาว): 🎲 ເລີ່ມທາຍເລກ, 🔍 ກວດຜົນຫວຍ
- แทงเลข 2–4 หลักพร้อมปุ่มยืนยัน ✅/❌
- แอดมิน (ไทย): 📝 กรอกผลรางวัล
- เก็บโพยและผลรางวัลลง MongoDB
- แจ้งเตือนแอดมิน 20:30 จ/พ/ศ
- ประกาศผล 21:00 จ/พ/ศ พร้อมรายชื่อผู้ถูกรางวัล และ reset โพย

## การติดตั้งบน Render
1. ตั้งค่า ENV:
- BOT_TOKEN
- MONGO_URI
- TARGET_GROUP_ID
- SUPER_ADMIN_ID
- EDITOR_IDS
- RENDER_EXTERNAL_URL (เช่น: https://lao-lotto-bot.onrender.com)

2. Deploy
3. รันคำสั่งตั้งค่า Webhook:
   curl -F "url=$RENDER_EXTERNAL_URL/bot$BOT_TOKEN" https://api.telegram.org/bot$BOT_TOKEN/setWebhook

4. ตรวจสอบ Webhook:
   curl https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo

# Lao Lotto Bot 🎲

## 📦 Setup
1. ติดตั้ง dependencies  
```bash
npm install
```
2. ค่า `.env` ใส่ไว้ให้แล้ว ใช้งานจริงได้เลย  
3. รันบอท  
```bash
npm start
```

## 🚀 Deploy on Render
- ใช้ Webhook mode → ไม่ conflict  
- Health check endpoint: `/`  

## ⏰ Schedule
- ปิดรับ: 20:25  
- แจ้งเตือน admin: 20:30  
- ประกาศผล: 21:00  

## 🛡 Admin
- Super Admin: reset ได้ + กรอกผลได้  
- Admin: กรอกผลได้เท่านั้น  

## 🔄 กันบอทหลับ
- ใช้ UptimeRobot ชี้ไปที่ `https://lao-lotto-bot.onrender.com/`  

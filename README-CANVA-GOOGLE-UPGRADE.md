# Wisut OS — Canva + Google Workspace Upgrade

เวอร์ชันนี้เพิ่ม:

- Banner ใหม่: “ระบบปฏิบัติการสนับสนุน สส.วิสุทธิ์ ตันตินันท์”
- Canva Embed บน Dashboard
- Google Workspace Panel บน Dashboard
- หน้าเชื่อมต่อระบบสำหรับ Google Drive, Calendar, Docs, Sheets, Meet
- ช่องเก็บ Google OAuth/API metadata สำหรับต่อยอดเชื่อม API จริง
- คอนเทนต์สามารถเก็บ Canva URL และ Google Docs URL ได้
- ยังมีแนบไฟล์และ AI สรุปประชุมเหมือนเดิม

## วิธีอัปเดต

1. ปิด server เดิมด้วย `Ctrl + C`
2. แตก zip นี้
3. คัดลอกไฟล์เหล่านี้ไปทับในโฟลเดอร์เดิม:
   - `server.js`
   - `package.json`
   - `.env.example`
   - `public/styles.css`
   - `README-CANVA-GOOGLE-UPGRADE.md`
4. กลับไปที่โฟลเดอร์โปรเจกต์เดิม

```cmd
cd C:\Users\user\Downloads\wisut-work-hub
npm install
npm run dev
```

เปิดเว็บที่:

```text
http://localhost:3000
```

## วิธีใส่ Canva Embed

1. เข้า Canva
2. เปิดงานสไลด์/อินโฟกราฟิก
3. กด Share / แชร์
4. เลือก Embed / ฝัง
5. คัดลอกลิงก์ที่มี `embed`
6. ไปที่เมนู `เชื่อมต่อ`
7. วางในช่อง `Canva Embed URL 1` หรือ 2/3
8. กลับหน้า Dashboard จะเห็นสไลด์ฝังอยู่

## วิธีใส่ Google Calendar Embed

1. เปิด Google Calendar บนเว็บ
2. เข้า Settings ของ calendar
3. หา Integrate calendar
4. คัดลอก Embed URL หรือ public URL
5. ไปที่เมนู `เชื่อมต่อ`
6. วางในช่อง `Google Calendar Embed URL`

หมายเหตุ: ถ้าปฏิทินไม่เปิด public หรือสิทธิ์ไม่ถูกต้อง อาจฝังใน iframe ไม่ขึ้น แต่ลิงก์ quick access ยังเปิดได้

## Google Workspace Integration ในเวอร์ชันนี้

เวอร์ชันนี้เป็น integration แบบ “ลิงก์/Embed” ใช้งานได้ทันทีและปลอดภัยกว่า OAuth สำหรับ MVP:

- Google Drive Folder หลัก
- Google Calendar URL / Embed
- Google Docs Template
- Google Sheets ฐานข้อมูล
- Google Meet ห้องหลัก

ถ้าต้องการให้ระบบดึงไฟล์จาก Drive หรือสร้าง Calendar Event อัตโนมัติ ต้องทำ OAuth เพิ่มในระยะต่อไป โดยช่อง Client ID / Project ID / Service Account เตรียมไว้แล้ว

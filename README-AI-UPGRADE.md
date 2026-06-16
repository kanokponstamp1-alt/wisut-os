# Wisut Work Hub AI Upgrade

เวอร์ชันนี้เพิ่ม:

- Dashboard แบบ War Room
- แนบไฟล์ในเครื่องได้
- แนบลิงก์ Google Drive / Google Docs / URL ภายนอกได้
- หน้าเชื่อมต่อ Google / API / Webhook
- ช่องบันทึกดิบ / Transcript ในหน้าประชุม
- ปุ่ม “สรุปด้วย AI” ในหน้ารายละเอียดประชุม
- อ่านไฟล์ .txt, .md, .csv, .json, .pdf, .docx ที่แนบกับประชุมได้
- ถ้าไม่มี OPENAI_API_KEY ระบบจะมี fallback summary ให้ทดลองใช้ก่อน

## วิธีอัปเดตจากของเดิม

1. หยุด server เดิมด้วย Ctrl+C
2. สำรองโฟลเดอร์เดิมไว้ก่อน โดยเฉพาะ:
   - data/
   - uploads/
3. แตก zip นี้
4. คัดลอกไฟล์เหล่านี้ไปทับของเดิม:
   - server.js
   - package.json
   - .env.example
   - public/styles.css
5. เปิด Command Prompt ที่โฟลเดอร์โปรเจกต์เดิม
6. รัน:

```cmd
npm install
npm run dev
```

7. เปิดเว็บ:

```text
http://localhost:3000
```

## ตั้งค่า AI จริง

สร้างหรือแก้ไฟล์ `.env` แล้วเพิ่ม:

```text
OPENAI_API_KEY=ใส่คีย์ของคุณ
OPENAI_MODEL=gpt-4o-mini
```

แล้วปิด server ด้วย Ctrl+C และรันใหม่:

```cmd
npm run dev
```

## วิธีใช้ AI สรุปประชุม

1. เข้าเมนู ประชุม
2. เพิ่มหรือเปิดประชุม
3. ใส่บันทึกดิบ/Transcript หรืออัปโหลดไฟล์รายงาน/เอกสารประกอบ
4. กด “✨ สรุปด้วย AI”
5. ระบบจะเติมช่องสรุปการประชุม มติ/ข้อสั่งการ และข้อสังเกตให้

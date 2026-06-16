import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_NAME = process.env.APP_NAME || 'Wisut OS';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'workhub.db');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${nanoid(8)}${safeExt}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

function now() {
  return new Date().toISOString();
}

function e(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nl2br(value = '') {
  return e(value).replace(/\n/g, '<br>');
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function bytes(size) {
  if (!size) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(size);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function setting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row?.value || fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(key, value || '', now());
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'อนุกรรมาธิการ',
      meeting_date TEXT,
      meeting_time TEXT,
      location TEXT,
      status TEXT NOT NULL DEFAULT 'ร่าง',
      agenda TEXT,
      summary TEXT,
      decisions TEXT,
      participants TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'ติดตาม',
      owner TEXT,
      description TEXT,
      next_step TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      assignee TEXT,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'ปกติ',
      status TEXT NOT NULL DEFAULT 'ยังไม่เริ่ม',
      meeting_id INTEGER,
      issue_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,
      FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      channel TEXT,
      publish_date TEXT,
      status TEXT NOT NULL DEFAULT 'ร่าง',
      owner TEXT,
      brief TEXT,
      link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS letters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'เข้า',
      organization TEXT,
      letter_no TEXT,
      document_date TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'รับเรื่อง',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      organization TEXT,
      position TEXT,
      phone TEXT,
      email TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      category TEXT,
      description TEXT,
      meeting_id INTEGER,
      issue_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(meeting_id) REFERENCES meetings(id) ON DELETE SET NULL,
      FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  addColumnIfMissing('meetings', 'raw_notes', 'TEXT');
  addColumnIfMissing('meetings', 'ai_summary', 'TEXT');
  addColumnIfMissing('meetings', 'ai_actions', 'TEXT');
  addColumnIfMissing('meetings', 'ai_risks', 'TEXT');
  addColumnIfMissing('files', 'external_url', 'TEXT');
  addColumnIfMissing('content_items', 'canva_url', 'TEXT');
  addColumnIfMissing('content_items', 'google_doc_url', 'TEXT');

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const adminName = process.env.ADMIN_NAME || 'Admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@wisut.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'change-me-1234';
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`)
      .run(adminName, adminEmail, hash, now());
    console.log(`Created default admin: ${adminEmail} / ${adminPassword}`);
  }
}

initDb();

function signUser(user) {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}

function currentUser(req) {
  const token = req.cookies?.workhub_token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.id) || null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.redirect('/login');
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).send('ต้องใช้สิทธิ์ admin');
  next();
}

function active(pathname, href) {
  return pathname === href || (href !== '/' && pathname.startsWith(href)) ? 'active' : '';
}

function layout(req, { title, body, actions = '' }) {
  const user = req.user;
  const nav = [
    ['/', 'Dashboard', 'ภาพรวม'],
    ['/meetings', 'ประชุม', 'นัด/รายงาน'],
    ['/tasks', 'งานค้าง', 'ติดตามงาน'],
    ['/issues', 'ประเด็นงาน', 'เรื่องที่ติดตาม'],
    ['/files', 'ไฟล์งาน', 'คลังเอกสาร'],
    ['/content', 'คอนเทนต์', 'สื่อสาร'],
    ['/letters', 'หนังสือ', 'เข้า-ออก'],
    ['/contacts', 'รายชื่อ', 'เครือข่าย'],
    ['/integrations', 'เชื่อมต่อ', 'Google/API/AI'],
    ['/team', 'ทีม', 'ผู้ใช้งาน']
  ];
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${e(title)} · ${e(APP_NAME)}</title>
  <link rel="stylesheet" href="/public/styles.css" />
</head>
<body>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark">W</div>
      <div>
        <strong>${e(APP_NAME)}</strong>
        <small>ระบบหลังบ้านทีม สส.</small>
      </div>
    </div>
    <nav>
      ${nav.map(([href, label, sub]) => `<a class="${active(req.path, href)}" href="${href}"><span>${label}</span><small>${sub}</small></a>`).join('')}
    </nav>
    <div class="user-box">
      <div><strong>${e(user?.name)}</strong></div>
      <small>${e(user?.email)} · ${e(user?.role)}</small>
      <form method="post" action="/logout"><button class="link-btn">ออกจากระบบ</button></form>
    </div>
  </aside>
  <main class="main">
    <header class="topbar">
      <div>
        <h1>${e(title)}</h1>
        <p>ระบบปฏิบัติการสนับสนุน สส.วิสุทธิ์ ตันตินันท์ · ประชุม · เอกสาร · คอนเทนต์ · Google Workspace · Canva</p>
      </div>
      <div class="actions">${actions}</div>
    </header>
    ${body}
  </main>
  <script src="/public/app.js"></script>
</body>
</html>`;
}

function loginPage(message = '') {
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>เข้าสู่ระบบ · ${e(APP_NAME)}</title>
  <link rel="stylesheet" href="/public/styles.css" />
</head>
<body class="login-body">
  <section class="login-card">
    <div class="brand big">
      <div class="brand-mark">W</div>
      <div>
        <strong>${e(APP_NAME)}</strong>
        <small>ระบบปฏิบัติการสนับสนุน สส.วิสุทธิ์ ตันตินันท์</small>
      </div>
    </div>
    <h1>เข้าสู่ระบบ</h1>
    ${message ? `<div class="alert">${e(message)}</div>` : ''}
    <form method="post" action="/login" class="form-grid single">
      <label>อีเมล <input name="email" type="email" required placeholder="admin@wisut.local" /></label>
      <label>รหัสผ่าน <input name="password" type="password" required placeholder="••••••••" /></label>
      <button class="primary" type="submit">เข้าสู่ระบบ</button>
    </form>
    <p class="hint">ค่าเริ่มต้นอยู่ใน README และควรเปลี่ยนทันทีเมื่อใช้จริง</p>
  </section>
</body>
</html>`;
}

function statusBadge(status = '') {
  const s = e(status || '-');
  let cls = 'badge';
  if (/เสร็จ|ปิด|เผยแพร่|ยืนยัน/.test(status)) cls += ' green';
  if (/ด่วน|ค้าง|รอตรวจ|กำลัง|ติดตาม/.test(status)) cls += ' orange';
  if (/ร่าง|ยังไม่เริ่ม|รับเรื่อง/.test(status)) cls += ' gray';
  return `<span class="${cls}">${s}</span>`;
}

function priorityBadge(priority = '') {
  const p = e(priority || '-');
  let cls = 'badge gray';
  if (priority === 'ด่วน') cls = 'badge red';
  if (priority === 'สูง') cls = 'badge orange';
  return `<span class="${cls}">${p}</span>`;
}

function searchBox(action, q) {
  return `<form class="search" method="get" action="${action}"><input name="q" value="${e(q)}" placeholder="ค้นหา..." /><button>ค้นหา</button></form>`;
}

function option(value, label, selected) {
  return `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`;
}

function getMeetings() {
  return db.prepare('SELECT id, title, meeting_date FROM meetings ORDER BY COALESCE(meeting_date, '9999-12-31') DESC, id DESC').all();
}

function getIssues() {
  return db.prepare('SELECT id, title FROM issues ORDER BY id DESC').all();
}

function fileRows(files) {
  if (!files.length) return `<tr><td colspan="7" class="empty">ยังไม่มีไฟล์</td></tr>`;
  return files.map(f => `<tr>
    <td><strong>${e(f.original_name)}</strong><br><small>${e(f.description || '')}</small>${f.external_url ? `<br><a class="external" target="_blank" href="${e(f.external_url)}">เปิดลิงก์ Google/API</a>` : ''}</td>
    <td>${e(f.category || '-')}</td>
    <td>${bytes(f.size_bytes)}</td>
    <td>${f.meeting_title ? `<a href="/meetings/${f.meeting_id}">${e(f.meeting_title)}</a>` : '-'}</td>
    <td>${f.issue_title ? `<a href="/issues">${e(f.issue_title)}</a>` : '-'}</td>
    <td>${formatDateTime(f.created_at)}</td>
    <td class="right"><a class="small-btn" href="/files/${f.id}/download">ดาวน์โหลด</a></td>
  </tr>`).join('');
}

function canvaEmbedUrl(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (!/canva\.com/i.test(raw)) return '';
  if (/embed/i.test(raw)) return raw;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has('embed')) u.searchParams.set('embed', '');
    return u.toString().replace('embed=', 'embed');
  } catch {
    const sep = raw.includes('?') ? '&' : '?';
    return `${raw}${sep}embed`;
  }
}

function googleCalendarEmbed(url = '') {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (/calendar\.google\.com\/calendar\/embed/i.test(raw)) return raw;
  if (/calendar\.google\.com/i.test(raw)) return raw;
  return '';
}

function quickLink(label, url, icon = '↗') {
  if (!url) return '';
  return `<a class="integration-link" target="_blank" rel="noopener" href="${e(url)}"><span>${icon}</span><strong>${e(label)}</strong><small>เปิดในแท็บใหม่</small></a>`;
}


async function extractTextFromFileRecord(f) {
  if (!f?.stored_name) return '';
  const fullPath = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(fullPath)) return '';
  const ext = path.extname(f.original_name || '').toLowerCase();
  try {
    if (['.txt','.md','.csv','.json','.html','.xml'].includes(ext) || (f.mime_type || '').startsWith('text/')) {
      return fs.readFileSync(fullPath, 'utf8').slice(0, 20000);
    }
    if (ext === '.pdf') {
      const mod = await import('pdf-parse');
      const pdf = mod.default || mod;
      const data = await pdf(fs.readFileSync(fullPath));
      return String(data.text || '').slice(0, 20000);
    }
    if (ext === '.docx') {
      const mammoth = await import('mammoth');
      const data = await mammoth.extractRawText({ path: fullPath });
      return String(data.value || '').slice(0, 20000);
    }
  } catch (err) {
    console.error('extract file error:', err.message);
    return `[อ่านไฟล์ ${f.original_name} ไม่สำเร็จ: ${err.message}]`;
  }
  return '';
}

function fallbackMeetingSummary(text) {
  const lines = text.split(/\n+/).map(x => x.trim()).filter(Boolean);
  const top = lines.slice(0, 8).join('\n- ');
  const actionLines = lines.filter(l => /ต้อง|มอบหมาย|ติดตาม|ส่ง|จัดทำ|เชิญ|นัด|deadline|ภายใน/i.test(l)).slice(0, 8);
  return {
    summary: `สรุปเบื้องต้นจากระบบ\n- ${top || 'ยังไม่มีข้อความเพียงพอสำหรับสรุป'}\n\nหมายเหตุ: ยังไม่ได้ตั้งค่า OPENAI_API_KEY จึงเป็นการสรุปแบบอัตโนมัติขั้นต้น`,
    actions: actionLines.length ? actionLines.map((x,i)=>`${i+1}. ${x}`).join('\n') : '1. ตรวจทานบันทึกประชุมและเติมผู้รับผิดชอบ\n2. แนบเอกสารประกอบให้ครบ\n3. กำหนด deadline ของงานติดตาม',
    risks: 'ยังไม่ได้เชื่อมต่อ AI API จึงยังไม่วิเคราะห์ความเสี่ยงเชิงลึก'
  };
}

async function summarizeWithAI(prompt) {
  if (!OPENAI_API_KEY) return fallbackMeetingSummary(prompt);
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'คุณเป็นผู้ช่วยเลขานุการคณะอนุกรรมาธิการของรัฐสภาไทย สรุปประชุมเป็นภาษาไทยแบบทางการ กระชับ ชัดเจน แยกมติ งานติดตาม และข้อสังเกตความเสี่ยง' },
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  return {
    summary: text,
    actions: text.match(/(?:งานติดตาม|ข้อสั่งการ|Action)[\s\S]*/i)?.[0] || '',
    risks: text.match(/(?:ความเสี่ยง|ข้อสังเกต)[\s\S]*/i)?.[0] || ''
  };
}

app.get('/login', (req, res) => {
  if (currentUser(req)) return res.redirect('/');
  res.send(loginPage(req.query.error ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : ''));
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return res.redirect('/login?error=1');
  const token = signUser(user);
  res.cookie('workhub_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/');
});

app.post('/logout', (req, res) => {
  res.clearCookie('workhub_token');
  res.redirect('/login');
});

app.use(requireAuth);

app.get('/', (req, res) => {
  const counts = {
    meetings: db.prepare('SELECT COUNT(*) AS c FROM meetings').get().c,
    tasksOpen: db.prepare("SELECT COUNT(*) AS c FROM tasks WHERE status != 'เสร็จแล้ว'").get().c,
    issues: db.prepare('SELECT COUNT(*) AS c FROM issues').get().c,
    files: db.prepare('SELECT COUNT(*) AS c FROM files').get().c,
    lettersOpen: db.prepare("SELECT COUNT(*) AS c FROM letters WHERE status NOT IN ('ปิดเรื่อง','ส่งแล้ว')").get().c,
    contentsOpen: db.prepare("SELECT COUNT(*) AS c FROM content_items WHERE status != 'เผยแพร่แล้ว'").get().c
  };
  const nextMeetings = db.prepare(`SELECT * FROM meetings WHERE meeting_date >= date('now') ORDER BY meeting_date ASC, meeting_time ASC LIMIT 5`).all();
  const urgentTasks = db.prepare(`SELECT t.*, m.title AS meeting_title, i.title AS issue_title FROM tasks t LEFT JOIN meetings m ON m.id=t.meeting_id LEFT JOIN issues i ON i.id=t.issue_id WHERE t.status != 'เสร็จแล้ว' ORDER BY CASE t.priority WHEN 'ด่วน' THEN 1 WHEN 'สูง' THEN 2 ELSE 3 END, COALESCE(t.due_date,'9999-12-31') ASC LIMIT 8`).all();
  const recentFiles = db.prepare(`SELECT f.*, m.title AS meeting_title, i.title AS issue_title FROM files f LEFT JOIN meetings m ON m.id=f.meeting_id LEFT JOIN issues i ON i.id=f.issue_id ORDER BY f.id DESC LIMIT 5`).all();
  const recentCanva = db.prepare(`SELECT * FROM content_items WHERE COALESCE(canva_url, link, '') LIKE '%canva.com%' ORDER BY id DESC LIMIT 3`).all();
  const canvaSettings = [
    { title: setting('canva_title_1', 'Canva Slide หลัก'), url: setting('canva_embed_url_1') },
    { title: setting('canva_title_2', 'Canva งานประชุม'), url: setting('canva_embed_url_2') },
    { title: setting('canva_title_3', 'Canva คอนเทนต์ล่าสุด'), url: setting('canva_embed_url_3') }
  ].filter(x => x.url);
  const calEmbed = googleCalendarEmbed(setting('google_calendar_embed_url') || setting('google_calendar_url'));
  const today = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full' }).format(new Date());
  const body = `
    <section class="hero">
      <div>
        <span class="eyebrow">WISUT OPERATING SYSTEM</span>
        <h2>ระบบปฏิบัติการสนับสนุน<br>สส.วิสุทธิ์ ตันตินันท์</h2>
        <p>สำนักงานดิจิทัลสำหรับประชุม เอกสาร งานติดตาม คอนเทนต์ Google Workspace และ Canva Slide Dashboard</p>
        <div class="hero-actions"><a class="primary" href="/meetings/new">+ นัดประชุม</a><a class="secondary inverse" href="/files">อัปโหลดไฟล์</a><a class="secondary inverse" href="/integrations">ตั้งค่า Google/Canva</a></div>
      </div>
      <div class="hero-side"><small>วันนี้</small><strong>${today}</strong><span>งานค้าง ${counts.tasksOpen} · หนังสือค้าง ${counts.lettersOpen}</span></div>
    </section>
    <section class="cards six">
      <div class="card stat"><span class="stat-icon">🏛️</span><small>ประชุมทั้งหมด</small><strong>${counts.meetings}</strong></div>
      <div class="card stat"><span class="stat-icon">✅</span><small>งานค้าง</small><strong>${counts.tasksOpen}</strong></div>
      <div class="card stat"><span class="stat-icon">🎯</span><small>ประเด็นติดตาม</small><strong>${counts.issues}</strong></div>
      <div class="card stat"><span class="stat-icon">📂</span><small>ไฟล์งาน</small><strong>${counts.files}</strong></div>
      <div class="card stat"><span class="stat-icon">📨</span><small>หนังสือค้าง</small><strong>${counts.lettersOpen}</strong></div>
      <div class="card stat"><span class="stat-icon">📢</span><small>คอนเทนต์รอทำ</small><strong>${counts.contentsOpen}</strong></div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-head"><h2>ประชุมถัดไป</h2><a href="/meetings">ดูทั้งหมด</a></div>
        ${nextMeetings.length ? `<table><tbody>${nextMeetings.map(m => `<tr><td>${formatDate(m.meeting_date)} ${e(m.meeting_time || '')}</td><td><a href="/meetings/${m.id}">${e(m.title)}</a><br><small>${e(m.location || '')}</small></td><td>${statusBadge(m.status)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">ยังไม่มีประชุมในอนาคต</p>`}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>งานด่วน/งานค้าง</h2><a href="/tasks">ดูทั้งหมด</a></div>
        ${urgentTasks.length ? `<table><tbody>${urgentTasks.map(t => `<tr><td>${priorityBadge(t.priority)}</td><td><strong>${e(t.title)}</strong><br><small>${e(t.assignee || '-')} · ส่ง ${formatDate(t.due_date)}</small></td><td>${statusBadge(t.status)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">ยังไม่มีงานค้าง</p>`}
      </div>
    </section>
    <section class="grid two">
      <div class="panel embed-panel">
        <div class="panel-head"><h2>Canva Slide Dashboard</h2><a href="/integrations">ตั้งค่า</a></div>
        ${canvaSettings.length ? canvaSettings.map(c => `<div class="embed-card"><div class="embed-title"><strong>${e(c.title)}</strong><a target="_blank" rel="noopener" href="${e(c.url)}">เปิด Canva</a></div><iframe src="${e(canvaEmbedUrl(c.url))}" allowfullscreen loading="lazy"></iframe></div>`).join('') : (recentCanva.length ? recentCanva.map(c => `<div class="embed-card"><div class="embed-title"><strong>${e(c.title)}</strong><a target="_blank" rel="noopener" href="${e(c.canva_url || c.link)}">เปิด Canva</a></div><iframe src="${e(canvaEmbedUrl(c.canva_url || c.link))}" allowfullscreen loading="lazy"></iframe></div>`).join('') : `<p class="empty">ยังไม่ได้ตั้งค่า Canva Embed URL<br><small>ไปที่เมนู เชื่อมต่อ → Canva แล้ววางลิงก์ Canva แบบ Embed</small></p>`)}
      </div>
      <div class="panel embed-panel">
        <div class="panel-head"><h2>Google Workspace</h2><a href="/integrations">ตั้งค่า</a></div>
        <div class="integration-grid">
          ${quickLink('Google Drive กลาง', setting('google_drive_folder'), '📂')}
          ${quickLink('Google Docs Template', setting('google_docs_template'), '📝')}
          ${quickLink('Google Sheets ฐานข้อมูล', setting('google_sheets_url'), '📊')}
          ${quickLink('Google Calendar', setting('google_calendar_url'), '📅')}
        </div>
        ${calEmbed ? `<div class="calendar-embed"><iframe src="${e(calEmbed)}" loading="lazy"></iframe></div>` : `<p class="empty">ยังไม่ได้ใส่ Google Calendar Embed URL</p>`}
      </div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>ไฟล์ล่าสุด</h2><a href="/files">คลังไฟล์</a></div>
      <table><thead><tr><th>ไฟล์</th><th>หมวด</th><th>ขนาด</th><th>ประชุม</th><th>ประเด็น</th><th>อัปโหลด</th><th></th></tr></thead><tbody>${fileRows(recentFiles)}</tbody></table>
    </section>`;
  res.send(layout(req, { title: 'Dashboard', body, actions: `<a class="primary" href="/meetings/new">+ นัดประชุม</a>` }));
});

app.get('/meetings', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT * FROM meetings WHERE title LIKE ? OR agenda LIKE ? OR summary LIKE ? ORDER BY COALESCE(meeting_date,'9999-12-31') DESC, id DESC`).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(`SELECT * FROM meetings ORDER BY COALESCE(meeting_date,'9999-12-31') DESC, id DESC`).all();
  const body = `
    ${searchBox('/meetings', q)}
    <section class="panel">
      <table><thead><tr><th>ชื่อประชุม</th><th>ประเภท</th><th>วันเวลา</th><th>สถานที่</th><th>สถานะ</th></tr></thead><tbody>
      ${rows.length ? rows.map(m => `<tr><td><a href="/meetings/${m.id}"><strong>${e(m.title)}</strong></a><br><small>${e((m.agenda || '').slice(0, 120))}</small></td><td>${e(m.type)}</td><td>${formatDate(m.meeting_date)} ${e(m.meeting_time || '')}</td><td>${e(m.location || '-')}</td><td>${statusBadge(m.status)}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">ยังไม่มีประชุม</td></tr>`}
      </tbody></table>
    </section>`;
  res.send(layout(req, { title: 'ประชุม', body, actions: `<a class="primary" href="/meetings/new">+ เพิ่มประชุม</a>` }));
});

function meetingForm(m = {}) {
  return `<form method="post" action="${m.id ? `/meetings/${m.id}/update` : '/meetings'}" class="form-grid">
    <label class="wide">ชื่อประชุม <input name="title" required value="${e(m.title || '')}" placeholder="ประชุมอนุกรรมาธิการปฏิรูปการจัดซื้อจัดจ้าง ครั้งที่ ..." /></label>
    <label>ประเภท <select name="type">${['อนุกรรมาธิการ','กรรมาธิการ','ทีมงาน','พรรค','สภา','นัดหน่วยงาน','อื่น ๆ'].map(x => option(x, x, m.type || 'อนุกรรมาธิการ')).join('')}</select></label>
    <label>สถานะ <select name="status">${['ร่าง','ยืนยัน','เสร็จสิ้น','เลื่อน','ยกเลิก'].map(x => option(x, x, m.status || 'ร่าง')).join('')}</select></label>
    <label>วันที่ <input name="meeting_date" type="date" value="${e(m.meeting_date || '')}" /></label>
    <label>เวลา <input name="meeting_time" type="time" value="${e(m.meeting_time || '')}" /></label>
    <label class="wide">สถานที่/ลิงก์ประชุม <input name="location" value="${e(m.location || '')}" /></label>
    <label class="wide">ผู้เข้าร่วม <textarea name="participants" rows="3" placeholder="รายชื่อ / หน่วยงาน / ผู้เชี่ยวชาญ">${e(m.participants || '')}</textarea></label>
    <label class="wide">วาระประชุม <textarea name="agenda" rows="6">${e(m.agenda || '')}</textarea></label>
    <label class="wide">บันทึกดิบ/Transcript สำหรับ AI <textarea name="raw_notes" rows="6" placeholder="วางบันทึกเสียงที่ถอดแล้ว / โน้ตประชุม / ข้อความจากผู้จดประชุม">${e(m.raw_notes || '')}</textarea></label>
    <label class="wide">สรุปการประชุม <textarea name="summary" rows="6">${e(m.summary || '')}</textarea></label>
    <label class="wide">มติ/ข้อสั่งการ <textarea name="decisions" rows="5">${e(m.decisions || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/meetings">ยกเลิก</a></div>
  </form>`;
}

app.get('/meetings/new', (req, res) => {
  res.send(layout(req, { title: 'เพิ่มประชุม', body: `<section class="panel">${meetingForm()}</section>` }));
});

app.post('/meetings', (req, res) => {
  const fields = ['title','type','meeting_date','meeting_time','location','status','agenda','raw_notes','summary','decisions','participants'];
  const values = fields.map(f => req.body[f] || '');
  db.prepare(`INSERT INTO meetings (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...values, now(), now());
  res.redirect('/meetings');
});

app.get('/meetings/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).send('ไม่พบประชุม');
  const tasks = db.prepare('SELECT * FROM tasks WHERE meeting_id = ? ORDER BY id DESC').all(m.id);
  const files = db.prepare(`SELECT f.*, m.title AS meeting_title, i.title AS issue_title FROM files f LEFT JOIN meetings m ON m.id=f.meeting_id LEFT JOIN issues i ON i.id=f.issue_id WHERE f.meeting_id=? ORDER BY f.id DESC`).all(m.id);
  const body = `
    <section class="grid two detail-grid">
      <div class="panel">
        <h2>${e(m.title)}</h2>
        <p>${statusBadge(m.status)} <span class="badge gray">${e(m.type)}</span></p>
        <dl class="meta"><dt>วันเวลา</dt><dd>${formatDate(m.meeting_date)} ${e(m.meeting_time || '')}</dd><dt>สถานที่</dt><dd>${e(m.location || '-')}</dd><dt>ผู้เข้าร่วม</dt><dd>${nl2br(m.participants || '-')}</dd></dl>
        <div class="ai-box">
          <div><strong>AI Meeting Assistant</strong><br><small>อ่านบันทึกดิบและไฟล์แนบ แล้วช่วยร่างสรุปประชุม/มติ/งานติดตาม</small></div>
          <form method="post" action="/meetings/${m.id}/ai/summarize"><button class="primary" type="submit">✨ สรุปด้วย AI</button></form>
        </div>
        <h3>วาระประชุม</h3><p class="preline">${nl2br(m.agenda || '-')}</p>
        <h3>บันทึกดิบ/Transcript</h3><p class="preline">${nl2br(m.raw_notes || '-')}</p>
        <h3>สรุปการประชุม</h3><p class="preline">${nl2br(m.summary || '-')}</p>
        <h3>มติ/ข้อสั่งการ</h3><p class="preline">${nl2br(m.decisions || '-')}</p>
        ${m.ai_risks ? `<h3>ข้อสังเกต/ความเสี่ยงจาก AI</h3><p class="preline">${nl2br(m.ai_risks)}</p>` : ''}
      </div>
      <div class="panel">
        <h2>แก้ไขข้อมูลประชุม</h2>
        ${meetingForm(m)}
      </div>
    </section>
    <section class="grid two">
      <div class="panel">
        <div class="panel-head"><h2>งานจากประชุมนี้</h2><a href="/tasks/new?meeting_id=${m.id}">+ เพิ่มงาน</a></div>
        ${tasks.length ? `<table><tbody>${tasks.map(t => `<tr><td>${priorityBadge(t.priority)}</td><td><strong>${e(t.title)}</strong><br><small>${e(t.assignee || '-')} · ${formatDate(t.due_date)}</small></td><td>${statusBadge(t.status)}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">ยังไม่มีงานที่ผูกกับประชุมนี้</p>`}
      </div>
      <div class="panel">
        <h2>อัปโหลดไฟล์เข้าประชุมนี้</h2>
        ${uploadForm({ meeting_id: m.id })}
      </div>
    </section>
    <section class="panel"><div class="panel-head"><h2>ไฟล์ของประชุมนี้</h2><a href="/files">คลังไฟล์</a></div><table><thead><tr><th>ไฟล์</th><th>หมวด</th><th>ขนาด</th><th>ประชุม</th><th>ประเด็น</th><th>อัปโหลด</th><th></th></tr></thead><tbody>${fileRows(files)}</tbody></table></section>`;
  res.send(layout(req, { title: 'รายละเอียดประชุม', body, actions: `<a class="secondary" href="/meetings">กลับ</a>` }));
});


app.post('/meetings/:id/ai/summarize', async (req, res) => {
  const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).send('ไม่พบประชุม');
  const files = db.prepare('SELECT * FROM files WHERE meeting_id=? ORDER BY id DESC LIMIT 8').all(m.id);
  const fileTexts = [];
  for (const f of files) {
    const text = await extractTextFromFileRecord(f);
    if (text) fileTexts.push(`ไฟล์: ${f.original_name}\n${text}`);
  }
  const prompt = `ชื่อประชุม: ${m.title}\nประเภท: ${m.type}\nวันเวลา: ${m.meeting_date || ''} ${m.meeting_time || ''}\nผู้เข้าร่วม: ${m.participants || ''}\nวาระ: ${m.agenda || ''}\nบันทึกดิบ/Transcript: ${m.raw_notes || ''}\nไฟล์แนบที่อ่านได้:\n${fileTexts.join('\n\n---\n\n')}\n\nกรุณาจัดทำ:\n1) สรุปการประชุมแบบเป็นทางการ\n2) มติ/ข้อสั่งการ\n3) งานติดตาม: ใครทำอะไร เมื่อไร\n4) ประเด็นที่ควรนำไปสื่อสารต่อ\n5) ข้อสังเกต/ความเสี่ยงด้านจัดซื้อจัดจ้าง งบประมาณ หรือการติดตามหน่วยงาน`;
  try {
    const ai = await summarizeWithAI(prompt.slice(0, 50000));
    db.prepare('UPDATE meetings SET summary=?, decisions=?, ai_summary=?, ai_actions=?, ai_risks=?, updated_at=? WHERE id=?')
      .run(ai.summary || '', ai.actions || '', ai.summary || '', ai.actions || '', ai.risks || '', now(), m.id);
    res.redirect(`/meetings/${m.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`AI สรุปไม่สำเร็จ: ${e(err.message)}`);
  }
});

app.post('/meetings/:id/update', (req, res) => {
  const fields = ['title','type','meeting_date','meeting_time','location','status','agenda','raw_notes','summary','decisions','participants'];
  const values = fields.map(f => req.body[f] || '');
  db.prepare(`UPDATE meetings SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...values, now(), req.params.id);
  res.redirect(`/meetings/${req.params.id}`);
});

function taskForm(t = {}, lists = {}) {
  const meetings = lists.meetings || getMeetings();
  const issues = lists.issues || getIssues();
  return `<form method="post" action="${t.id ? `/tasks/${t.id}/update` : '/tasks'}" class="form-grid">
    <label class="wide">ชื่องาน <input name="title" required value="${e(t.title || '')}" placeholder="เช่น ร่างวาระประชุม / สรุปรายงานประชุม / โทรเชิญหน่วยงาน" /></label>
    <label>ผู้รับผิดชอบ <input name="assignee" value="${e(t.assignee || '')}" /></label>
    <label>กำหนดส่ง <input name="due_date" type="date" value="${e(t.due_date || '')}" /></label>
    <label>ความสำคัญ <select name="priority">${['ปกติ','สูง','ด่วน'].map(x => option(x, x, t.priority || 'ปกติ')).join('')}</select></label>
    <label>สถานะ <select name="status">${['ยังไม่เริ่ม','กำลังทำ','รอตรวจ','เสร็จแล้ว'].map(x => option(x, x, t.status || 'ยังไม่เริ่ม')).join('')}</select></label>
    <label>ผูกกับประชุม <select name="meeting_id"><option value="">- ไม่ระบุ -</option>${meetings.map(m => option(String(m.id), `${m.meeting_date || '-'} · ${m.title}`, String(t.meeting_id || '') )).join('')}</select></label>
    <label>ผูกกับประเด็น <select name="issue_id"><option value="">- ไม่ระบุ -</option>${issues.map(i => option(String(i.id), i.title, String(t.issue_id || '') )).join('')}</select></label>
    <label class="wide">รายละเอียด/โน้ต <textarea name="notes" rows="4">${e(t.notes || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/tasks">ยกเลิก</a></div>
  </form>`;
}

app.get('/tasks', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT t.*, m.title AS meeting_title, i.title AS issue_title FROM tasks t LEFT JOIN meetings m ON m.id=t.meeting_id LEFT JOIN issues i ON i.id=t.issue_id WHERE t.title LIKE ? OR t.assignee LIKE ? OR t.notes LIKE ? ORDER BY CASE t.status WHEN 'เสร็จแล้ว' THEN 2 ELSE 1 END, COALESCE(t.due_date,'9999-12-31') ASC`).all(`%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare(`SELECT t.*, m.title AS meeting_title, i.title AS issue_title FROM tasks t LEFT JOIN meetings m ON m.id=t.meeting_id LEFT JOIN issues i ON i.id=t.issue_id ORDER BY CASE t.status WHEN 'เสร็จแล้ว' THEN 2 ELSE 1 END, COALESCE(t.due_date,'9999-12-31') ASC, t.id DESC`).all();
  const body = `${searchBox('/tasks', q)}<section class="panel"><table><thead><tr><th>งาน</th><th>ผู้รับผิดชอบ</th><th>กำหนด</th><th>ประชุม/ประเด็น</th><th>ความสำคัญ</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.length ? rows.map(t => `<tr><td><strong>${e(t.title)}</strong><br><small>${e(t.notes || '')}</small></td><td>${e(t.assignee || '-')}</td><td>${formatDate(t.due_date)}</td><td>${t.meeting_title ? `<a href="/meetings/${t.meeting_id}">${e(t.meeting_title)}</a>` : '-'}<br><small>${e(t.issue_title || '')}</small></td><td>${priorityBadge(t.priority)}</td><td>${statusBadge(t.status)}</td><td><a class="small-btn" href="/tasks/${t.id}/edit">แก้ไข</a></td></tr>`).join('') : `<tr><td colspan="7" class="empty">ยังไม่มีงาน</td></tr>`}</tbody></table></section>`;
  res.send(layout(req, { title: 'งานค้าง', body, actions: `<a class="primary" href="/tasks/new">+ เพิ่มงาน</a>` }));
});

app.get('/tasks/new', (req, res) => {
  const t = { meeting_id: req.query.meeting_id || '', issue_id: req.query.issue_id || '' };
  res.send(layout(req, { title: 'เพิ่มงาน', body: `<section class="panel">${taskForm(t)}</section>` }));
});
app.post('/tasks', (req, res) => {
  const fields = ['title','assignee','due_date','priority','status','meeting_id','issue_id','notes'];
  const values = fields.map(f => req.body[f] || null);
  db.prepare(`INSERT INTO tasks (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...values, now(), now());
  res.redirect('/tasks');
});
app.get('/tasks/:id/edit', (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).send('ไม่พบงาน');
  res.send(layout(req, { title: 'แก้ไขงาน', body: `<section class="panel">${taskForm(t)}</section>` }));
});
app.post('/tasks/:id/update', (req, res) => {
  const fields = ['title','assignee','due_date','priority','status','meeting_id','issue_id','notes'];
  const values = fields.map(f => req.body[f] || null);
  db.prepare(`UPDATE tasks SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...values, now(), req.params.id);
  res.redirect('/tasks');
});

function issueForm(i = {}) {
  return `<form method="post" action="${i.id ? `/issues/${i.id}/update` : '/issues'}" class="form-grid">
    <label class="wide">ชื่อประเด็น <input name="title" required value="${e(i.title || '')}" placeholder="เช่น TOR ล็อกสเปก / บัญชีนวัตกรรม / ราคากลาง" /></label>
    <label>หมวด <select name="category">${['จัดซื้อจัดจ้าง','งบประมาณ','TOR','ราคากลาง','บัญชีนวัตกรรม','Factor F','ระเบียบ','อื่น ๆ'].map(x => option(x, x, i.category || 'จัดซื้อจัดจ้าง')).join('')}</select></label>
    <label>สถานะ <select name="status">${['ติดตาม','กำลังศึกษา','รอข้อมูล','เข้าที่ประชุม','ทำข้อเสนอ','ปิดเรื่อง'].map(x => option(x, x, i.status || 'ติดตาม')).join('')}</select></label>
    <label class="wide">ผู้รับผิดชอบ <input name="owner" value="${e(i.owner || '')}" /></label>
    <label class="wide">รายละเอียด <textarea name="description" rows="5">${e(i.description || '')}</textarea></label>
    <label class="wide">ขั้นตอนถัดไป <textarea name="next_step" rows="4">${e(i.next_step || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/issues">ยกเลิก</a></div>
  </form>`;
}
app.get('/issues', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? db.prepare(`SELECT * FROM issues WHERE title LIKE ? OR description LIKE ? OR next_step LIKE ? ORDER BY id DESC`).all(`%${q}%`,`%${q}%`,`%${q}%`) : db.prepare('SELECT * FROM issues ORDER BY id DESC').all();
  const body = `${searchBox('/issues', q)}<section class="cards list-cards">${rows.length ? rows.map(i => `<article class="card"><div class="card-head"><h2>${e(i.title)}</h2>${statusBadge(i.status)}</div><p><span class="badge gray">${e(i.category || '-')}</span> เจ้าของ: ${e(i.owner || '-')}</p><p>${nl2br((i.description || '').slice(0, 250))}</p><p><strong>ขั้นต่อไป:</strong> ${nl2br(i.next_step || '-')}</p><div class="card-actions"><a class="small-btn" href="/issues/${i.id}/edit">แก้ไข</a><a class="small-btn" href="/tasks/new?issue_id=${i.id}">+ งาน</a></div></article>`).join('') : `<div class="panel empty">ยังไม่มีประเด็นงาน</div>`}</section>`;
  res.send(layout(req, { title: 'ประเด็นงาน', body, actions: `<a class="primary" href="/issues/new">+ เพิ่มประเด็น</a>` }));
});
app.get('/issues/new', (req, res) => res.send(layout(req, { title: 'เพิ่มประเด็นงาน', body: `<section class="panel">${issueForm()}</section>` })));
app.post('/issues', (req, res) => {
  const fields = ['title','category','status','owner','description','next_step'];
  db.prepare(`INSERT INTO issues (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...fields.map(f => req.body[f] || ''), now(), now());
  res.redirect('/issues');
});
app.get('/issues/:id/edit', (req, res) => {
  const i = db.prepare('SELECT * FROM issues WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).send('ไม่พบประเด็น');
  res.send(layout(req, { title: 'แก้ไขประเด็นงาน', body: `<section class="panel">${issueForm(i)}</section>` }));
});
app.post('/issues/:id/update', (req, res) => {
  const fields = ['title','category','status','owner','description','next_step'];
  db.prepare(`UPDATE issues SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...fields.map(f => req.body[f] || ''), now(), req.params.id);
  res.redirect('/issues');
});

function uploadForm(defaults = {}) {
  const meetings = getMeetings();
  const issues = getIssues();
  return `<form method="post" action="/files" enctype="multipart/form-data" class="form-grid single">
    <label>เลือกไฟล์ในเครื่อง <input type="file" name="file" /></label>
    <label>ลิงก์ Google Drive/Docs หรือ URL ภายนอก <input name="external_url" placeholder="https://drive.google.com/..." /></label>
    <label>หมวดไฟล์ <select name="category">${['วาระประชุม','รายงานประชุม','เอกสารประกอบ','หนังสือราชการ','ร่างโพสต์/สื่อสาร','ข้อมูล/หลักฐาน','อื่น ๆ'].map(x => option(x, x, defaults.category || 'เอกสารประกอบ')).join('')}</select></label>
    <label>ผูกกับประชุม <select name="meeting_id"><option value="">- ไม่ระบุ -</option>${meetings.map(m => option(String(m.id), `${m.meeting_date || '-'} · ${m.title}`, String(defaults.meeting_id || '') )).join('')}</select></label>
    <label>ผูกกับประเด็น <select name="issue_id"><option value="">- ไม่ระบุ -</option>${issues.map(i => option(String(i.id), i.title, String(defaults.issue_id || '') )).join('')}</select></label>
    <label>คำอธิบาย <textarea name="description" rows="3"></textarea></label>
    <button class="primary" type="submit">อัปโหลด</button>
  </form>`;
}
app.get('/files', (req, res) => {
  const q = String(req.query.q || '').trim();
  const files = q
    ? db.prepare(`SELECT f.*, m.title AS meeting_title, i.title AS issue_title FROM files f LEFT JOIN meetings m ON m.id=f.meeting_id LEFT JOIN issues i ON i.id=f.issue_id WHERE f.original_name LIKE ? OR f.category LIKE ? OR f.description LIKE ? ORDER BY f.id DESC`).all(`%${q}%`,`%${q}%`,`%${q}%`)
    : db.prepare(`SELECT f.*, m.title AS meeting_title, i.title AS issue_title FROM files f LEFT JOIN meetings m ON m.id=f.meeting_id LEFT JOIN issues i ON i.id=f.issue_id ORDER BY f.id DESC`).all();
  const body = `<section class="grid two"><div class="panel"><h2>อัปโหลดไฟล์</h2>${uploadForm()}</div><div class="panel"><h2>วิธีจัดระเบียบ</h2><p>แนะนำตั้งชื่อไฟล์ตามรูปแบบ: <code>ปีเดือนวัน_ประเภท_ชื่อเรื่อง_v1.pdf</code></p><p>ตัวอย่าง: <code>2569-06-18_รายงานประชุม_อนุจัดซื้อจัดจ้างครั้งที่3.pdf</code></p></div></section>${searchBox('/files', q)}<section class="panel"><table><thead><tr><th>ไฟล์</th><th>หมวด</th><th>ขนาด</th><th>ประชุม</th><th>ประเด็น</th><th>อัปโหลด</th><th></th></tr></thead><tbody>${fileRows(files)}</tbody></table></section>`;
  res.send(layout(req, { title: 'ไฟล์งาน', body }));
});
app.post('/files', upload.single('file'), (req, res) => {
  const externalUrl = String(req.body.external_url || '').trim();
  if (!req.file && !externalUrl) return res.status(400).send('กรุณาเลือกไฟล์หรือใส่ลิงก์ Google/URL');
  const originalName = req.file?.originalname || externalUrl;
  const storedName = req.file?.filename || '';
  const mimeType = req.file?.mimetype || 'external/link';
  const size = req.file?.size || 0;
  db.prepare(`INSERT INTO files (original_name, stored_name, mime_type, size_bytes, category, description, meeting_id, issue_id, external_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(originalName, storedName, mimeType, size, req.body.category || '', req.body.description || '', req.body.meeting_id || null, req.body.issue_id || null, externalUrl, now());
  res.redirect(req.headers.referer || '/files');
});
app.get('/files/:id/download', (req, res) => {
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(req.params.id);
  if (!f) return res.status(404).send('ไม่พบไฟล์');
  if (f.external_url && !f.stored_name) return res.redirect(f.external_url);
  const fullPath = path.join(UPLOAD_DIR, f.stored_name);
  if (!fs.existsSync(fullPath)) return res.status(404).send('ไฟล์หายจากระบบ');
  res.download(fullPath, f.original_name);
});

function contentForm(c = {}) {
  return `<form method="post" action="${c.id ? `/content/${c.id}/update` : '/content'}" class="form-grid">
    <label class="wide">หัวข้อคอนเทนต์ <input name="title" required value="${e(c.title || '')}" placeholder="คลิปประจำสัปดาห์ / โพสต์ชวนร่วมฟัง / สรุปประชุม" /></label>
    <label>ช่องทาง <select name="channel">${['Facebook','TikTok','X','YouTube','Website','LINE','อื่น ๆ'].map(x => option(x, x, c.channel || 'Facebook')).join('')}</select></label>
    <label>วันเผยแพร่ <input name="publish_date" type="date" value="${e(c.publish_date || '')}" /></label>
    <label>สถานะ <select name="status">${['ร่าง','กำลังทำ','รอตรวจ','กำหนดลง','เผยแพร่แล้ว'].map(x => option(x, x, c.status || 'ร่าง')).join('')}</select></label>
    <label>ผู้รับผิดชอบ <input name="owner" value="${e(c.owner || '')}" /></label>
    <label class="wide">ลิงก์ทั่วไป <input name="link" value="${e(c.link || '')}" placeholder="ลิงก์โพสต์/คลิป/เอกสาร" /></label>
    <label class="wide">Canva URL / Embed <input name="canva_url" value="${e(c.canva_url || '')}" placeholder="https://www.canva.com/design/.../view?embed" /></label>
    <label class="wide">Google Docs URL <input name="google_doc_url" value="${e(c.google_doc_url || '')}" placeholder="ลิงก์ร่างสคริปต์/แคปชันใน Google Docs" /></label>
    <label class="wide">Brief / Caption / Script <textarea name="brief" rows="6">${e(c.brief || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/content">ยกเลิก</a></div>
  </form>`;
}
app.get('/content', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? db.prepare(`SELECT * FROM content_items WHERE title LIKE ? OR brief LIKE ? ORDER BY COALESCE(publish_date,'9999-12-31') ASC, id DESC`).all(`%${q}%`,`%${q}%`) : db.prepare(`SELECT * FROM content_items ORDER BY CASE status WHEN 'เผยแพร่แล้ว' THEN 2 ELSE 1 END, COALESCE(publish_date,'9999-12-31') ASC, id DESC`).all();
  const body = `${searchBox('/content', q)}<section class="panel"><table><thead><tr><th>คอนเทนต์</th><th>ช่องทาง</th><th>วันลง</th><th>เจ้าของ</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.length ? rows.map(c => `<tr><td><strong>${e(c.title)}</strong><br><small>${e((c.brief || '').slice(0, 160))}</small><br>${c.canva_url ? `<a class="external" target="_blank" href="${e(c.canva_url)}">เปิด Canva</a>` : ''} ${c.google_doc_url ? `<a class="external" target="_blank" href="${e(c.google_doc_url)}">เปิด Google Docs</a>` : ''}</td><td>${e(c.channel || '-')}</td><td>${formatDate(c.publish_date)}</td><td>${e(c.owner || '-')}</td><td>${statusBadge(c.status)}</td><td><a class="small-btn" href="/content/${c.id}/edit">แก้ไข</a></td></tr>`).join('') : `<tr><td colspan="6" class="empty">ยังไม่มีคอนเทนต์</td></tr>`}</tbody></table></section>`;
  res.send(layout(req, { title: 'คอนเทนต์', body, actions: `<a class="primary" href="/content/new">+ เพิ่มคอนเทนต์</a>` }));
});
app.get('/content/new', (req, res) => res.send(layout(req, { title: 'เพิ่มคอนเทนต์', body: `<section class="panel">${contentForm()}</section>` })));
app.post('/content', (req, res) => {
  const fields = ['title','channel','publish_date','status','owner','brief','link','canva_url','google_doc_url'];
  db.prepare(`INSERT INTO content_items (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...fields.map(f => req.body[f] || ''), now(), now());
  res.redirect('/content');
});
app.get('/content/:id/edit', (req, res) => {
  const c = db.prepare('SELECT * FROM content_items WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).send('ไม่พบคอนเทนต์');
  res.send(layout(req, { title: 'แก้ไขคอนเทนต์', body: `<section class="panel">${contentForm(c)}</section>` }));
});
app.post('/content/:id/update', (req, res) => {
  const fields = ['title','channel','publish_date','status','owner','brief','link','canva_url','google_doc_url'];
  db.prepare(`UPDATE content_items SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...fields.map(f => req.body[f] || ''), now(), req.params.id);
  res.redirect('/content');
});

function letterForm(l = {}) {
  return `<form method="post" action="${l.id ? `/letters/${l.id}/update` : '/letters'}" class="form-grid">
    <label class="wide">เรื่อง <input name="title" required value="${e(l.title || '')}" /></label>
    <label>ประเภท <select name="direction">${['เข้า','ออก'].map(x => option(x, x, l.direction || 'เข้า')).join('')}</select></label>
    <label>สถานะ <select name="status">${['รับเรื่อง','ร่างตอบ','รอลงนาม','ส่งแล้ว','ปิดเรื่อง'].map(x => option(x, x, l.status || 'รับเรื่อง')).join('')}</select></label>
    <label>หน่วยงาน <input name="organization" value="${e(l.organization || '')}" /></label>
    <label>เลขหนังสือ <input name="letter_no" value="${e(l.letter_no || '')}" /></label>
    <label>วันที่หนังสือ <input name="document_date" type="date" value="${e(l.document_date || '')}" /></label>
    <label>กำหนดตอบ/ติดตาม <input name="due_date" type="date" value="${e(l.due_date || '')}" /></label>
    <label class="wide">หมายเหตุ <textarea name="notes" rows="5">${e(l.notes || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/letters">ยกเลิก</a></div>
  </form>`;
}
app.get('/letters', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? db.prepare(`SELECT * FROM letters WHERE title LIKE ? OR organization LIKE ? OR letter_no LIKE ? ORDER BY id DESC`).all(`%${q}%`,`%${q}%`,`%${q}%`) : db.prepare(`SELECT * FROM letters ORDER BY COALESCE(due_date,'9999-12-31') ASC, id DESC`).all();
  const body = `${searchBox('/letters', q)}<section class="panel"><table><thead><tr><th>เรื่อง</th><th>เข้า/ออก</th><th>หน่วยงาน</th><th>เลขหนังสือ</th><th>กำหนด</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows.length ? rows.map(l => `<tr><td><strong>${e(l.title)}</strong><br><small>${e(l.notes || '')}</small></td><td>${e(l.direction)}</td><td>${e(l.organization || '-')}</td><td>${e(l.letter_no || '-')}</td><td>${formatDate(l.due_date)}</td><td>${statusBadge(l.status)}</td><td><a class="small-btn" href="/letters/${l.id}/edit">แก้ไข</a></td></tr>`).join('') : `<tr><td colspan="7" class="empty">ยังไม่มีหนังสือ</td></tr>`}</tbody></table></section>`;
  res.send(layout(req, { title: 'หนังสือเข้า-ออก', body, actions: `<a class="primary" href="/letters/new">+ เพิ่มหนังสือ</a>` }));
});
app.get('/letters/new', (req, res) => res.send(layout(req, { title: 'เพิ่มหนังสือ', body: `<section class="panel">${letterForm()}</section>` })));
app.post('/letters', (req, res) => {
  const fields = ['title','direction','organization','letter_no','document_date','due_date','status','notes'];
  db.prepare(`INSERT INTO letters (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...fields.map(f => req.body[f] || ''), now(), now());
  res.redirect('/letters');
});
app.get('/letters/:id/edit', (req, res) => {
  const l = db.prepare('SELECT * FROM letters WHERE id=?').get(req.params.id);
  if (!l) return res.status(404).send('ไม่พบหนังสือ');
  res.send(layout(req, { title: 'แก้ไขหนังสือ', body: `<section class="panel">${letterForm(l)}</section>` }));
});
app.post('/letters/:id/update', (req, res) => {
  const fields = ['title','direction','organization','letter_no','document_date','due_date','status','notes'];
  db.prepare(`UPDATE letters SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...fields.map(f => req.body[f] || ''), now(), req.params.id);
  res.redirect('/letters');
});

function contactForm(c = {}) {
  return `<form method="post" action="${c.id ? `/contacts/${c.id}/update` : '/contacts'}" class="form-grid">
    <label>ชื่อ <input name="name" required value="${e(c.name || '')}" /></label>
    <label>ประเภท <select name="type">${['หน่วยงานรัฐ','นักวิชาการ','ภาคเอกชน','ภาคประชาชน','สื่อ','ทีมงาน','อื่น ๆ'].map(x => option(x, x, c.type || 'หน่วยงานรัฐ')).join('')}</select></label>
    <label>หน่วยงาน/องค์กร <input name="organization" value="${e(c.organization || '')}" /></label>
    <label>ตำแหน่ง <input name="position" value="${e(c.position || '')}" /></label>
    <label>โทรศัพท์ <input name="phone" value="${e(c.phone || '')}" /></label>
    <label>อีเมล <input name="email" type="email" value="${e(c.email || '')}" /></label>
    <label class="wide">หมายเหตุ <textarea name="notes" rows="4">${e(c.notes || '')}</textarea></label>
    <div class="wide form-actions"><button class="primary" type="submit">บันทึก</button><a class="secondary" href="/contacts">ยกเลิก</a></div>
  </form>`;
}
app.get('/contacts', (req, res) => {
  const q = String(req.query.q || '').trim();
  const rows = q ? db.prepare(`SELECT * FROM contacts WHERE name LIKE ? OR organization LIKE ? OR email LIKE ? ORDER BY id DESC`).all(`%${q}%`,`%${q}%`,`%${q}%`) : db.prepare('SELECT * FROM contacts ORDER BY id DESC').all();
  const body = `${searchBox('/contacts', q)}<section class="panel"><table><thead><tr><th>ชื่อ</th><th>ประเภท</th><th>องค์กร/ตำแหน่ง</th><th>โทร</th><th>อีเมล</th><th></th></tr></thead><tbody>${rows.length ? rows.map(c => `<tr><td><strong>${e(c.name)}</strong><br><small>${e(c.notes || '')}</small></td><td>${e(c.type || '-')}</td><td>${e(c.organization || '-')}<br><small>${e(c.position || '')}</small></td><td>${e(c.phone || '-')}</td><td>${e(c.email || '-')}</td><td><a class="small-btn" href="/contacts/${c.id}/edit">แก้ไข</a></td></tr>`).join('') : `<tr><td colspan="6" class="empty">ยังไม่มีรายชื่อ</td></tr>`}</tbody></table></section>`;
  res.send(layout(req, { title: 'รายชื่อ', body, actions: `<a class="primary" href="/contacts/new">+ เพิ่มรายชื่อ</a>` }));
});
app.get('/contacts/new', (req, res) => res.send(layout(req, { title: 'เพิ่มรายชื่อ', body: `<section class="panel">${contactForm()}</section>` })));
app.post('/contacts', (req, res) => {
  const fields = ['name','type','organization','position','phone','email','notes'];
  db.prepare(`INSERT INTO contacts (${fields.join(',')}, created_at, updated_at) VALUES (${fields.map(() => '?').join(',')}, ?, ?)`).run(...fields.map(f => req.body[f] || ''), now(), now());
  res.redirect('/contacts');
});
app.get('/contacts/:id/edit', (req, res) => {
  const c = db.prepare('SELECT * FROM contacts WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).send('ไม่พบรายชื่อ');
  res.send(layout(req, { title: 'แก้ไขรายชื่อ', body: `<section class="panel">${contactForm(c)}</section>` }));
});
app.post('/contacts/:id/update', (req, res) => {
  const fields = ['name','type','organization','position','phone','email','notes'];
  db.prepare(`UPDATE contacts SET ${fields.map(f => `${f}=?`).join(',')}, updated_at=? WHERE id=?`).run(...fields.map(f => req.body[f] || ''), now(), req.params.id);
  res.redirect('/contacts');
});



app.get('/integrations', (req, res) => {
  const openaiReady = OPENAI_API_KEY ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้ตั้งค่า OPENAI_API_KEY';
  const body = `<section class="hero compact"><div><span class="eyebrow">GOOGLE · CANVA · AI</span><h2>เชื่อมต่อระบบภายนอก</h2><p>วางลิงก์ Google Workspace และ Canva Embed เพื่อให้ Dashboard กลายเป็นศูนย์รวมงานประชุม เอกสาร และสไลด์ของทีม</p></div><div class="hero-side"><small>AI Status</small><strong>${e(openaiReady)}</strong><span>Model: ${e(OPENAI_MODEL)}</span></div></section>
  <section class="grid two">
    <div class="panel"><h2>Google Workspace</h2><form method="post" action="/integrations" class="form-grid single">
      <label>Google Drive Folder หลัก <input name="google_drive_folder" value="${e(setting('google_drive_folder'))}" placeholder="https://drive.google.com/drive/folders/..." /></label>
      <label>Google Calendar URL <input name="google_calendar_url" value="${e(setting('google_calendar_url'))}" placeholder="https://calendar.google.com/calendar/..." /></label>
      <label>Google Calendar Embed URL <input name="google_calendar_embed_url" value="${e(setting('google_calendar_embed_url'))}" placeholder="https://calendar.google.com/calendar/embed?..." /></label>
      <label>Google Docs Template <input name="google_docs_template" value="${e(setting('google_docs_template'))}" placeholder="ลิงก์เทมเพลตรายงานประชุม/หนังสือ" /></label>
      <label>Google Sheets ฐานข้อมูล <input name="google_sheets_url" value="${e(setting('google_sheets_url'))}" placeholder="ลิงก์ชีตติดตามงาน/รายชื่อ/ทะเบียนเอกสาร" /></label>
      <label>Google Meet ห้องหลัก <input name="google_meet_url" value="${e(setting('google_meet_url'))}" placeholder="https://meet.google.com/..." /></label>
      <button class="primary">บันทึก Google Workspace</button>
    </form><p class="hint">เวอร์ชันนี้เชื่อมแบบลิงก์/Embed ที่ปลอดภัยและใช้ได้ทันที ถ้าต้องการ OAuth เพื่อดึงไฟล์/ปฏิทินอัตโนมัติ ให้กรอก Client ID ด้านล่างไว้เตรียมต่อยอด</p></div>
    <div class="panel"><h2>Canva Embed บน Dashboard</h2><form method="post" action="/integrations" class="form-grid single">
      <label>ชื่อสไลด์ 1 <input name="canva_title_1" value="${e(setting('canva_title_1', 'Canva Slide หลัก'))}" /></label>
      <label>Canva Embed URL 1 <input name="canva_embed_url_1" value="${e(setting('canva_embed_url_1'))}" placeholder="https://www.canva.com/design/.../view?embed" /></label>
      <label>ชื่อสไลด์ 2 <input name="canva_title_2" value="${e(setting('canva_title_2', 'Canva งานประชุม'))}" /></label>
      <label>Canva Embed URL 2 <input name="canva_embed_url_2" value="${e(setting('canva_embed_url_2'))}" placeholder="ลิงก์ Canva Embed เพิ่มเติม" /></label>
      <label>ชื่อสไลด์ 3 <input name="canva_title_3" value="${e(setting('canva_title_3', 'Canva คอนเทนต์ล่าสุด'))}" /></label>
      <label>Canva Embed URL 3 <input name="canva_embed_url_3" value="${e(setting('canva_embed_url_3'))}" placeholder="ลิงก์ Canva Embed เพิ่มเติม" /></label>
      <button class="primary">บันทึก Canva</button>
    </form><p class="hint">ใน Canva ให้กด Share/แชร์ → Embed/ฝัง → คัดลอกลิงก์ที่มีคำว่า <code>embed</code> แล้วนำมาวาง</p></div>
  </section>
  <section class="grid two">
    <div class="panel"><h2>Google OAuth/API เตรียมเชื่อมอัตโนมัติ</h2><form method="post" action="/integrations" class="form-grid single">
      <label>Google Client ID <input name="google_client_id" value="${e(setting('google_client_id'))}" placeholder="ใส่ OAuth Client ID ถ้ามี" /></label>
      <label>Google Project ID <input name="google_project_id" value="${e(setting('google_project_id'))}" placeholder="Google Cloud Project ID" /></label>
      <label>Service Account Email <input name="google_service_account_email" value="${e(setting('google_service_account_email'))}" placeholder="...@...iam.gserviceaccount.com" /></label>
      <button class="primary">บันทึกข้อมูล API</button>
    </form></div>
    <div class="panel"><h2>AI Meeting Assistant</h2><p>ใส่ <code>OPENAI_API_KEY</code> ในไฟล์ <code>.env</code> แล้วรีสตาร์ทเว็บ ระบบจะอ่านบันทึกดิบและไฟล์ .txt, .md, .csv, .json, .pdf, .docx ที่แนบกับประชุมได้</p><p class="hint">หากยังไม่ใส่ API Key ระบบจะสรุปแบบ fallback ได้ แต่ไม่ฉลาดเท่า AI จริง</p></div>
  </section>
  <section class="panel"><h2>Webhook / API ภายนอก</h2><form method="post" action="/integrations" class="form-grid"><label class="wide">Webhook URL <input name="webhook_url" value="${e(setting('webhook_url'))}" placeholder="เช่น Make / Zapier / n8n webhook" /></label><label class="wide">หมายเหตุ API <textarea name="api_notes" rows="4">${e(setting('api_notes'))}</textarea></label><div class="wide"><button class="primary">บันทึก</button></div></form></section>`;
  res.send(layout(req, { title: 'เชื่อมต่อระบบ', body }));
});
app.post('/integrations', (req, res) => {
  for (const key of ['google_drive_folder','google_calendar_url','google_calendar_embed_url','google_docs_template','google_sheets_url','google_meet_url','google_client_id','google_project_id','google_service_account_email','canva_title_1','canva_embed_url_1','canva_title_2','canva_embed_url_2','canva_title_3','canva_embed_url_3','webhook_url','api_notes']) setSetting(key, req.body[key] || '');
  res.redirect('/integrations');
});

app.get('/team', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY id DESC').all();
  const body = `<section class="grid two"><div class="panel"><h2>เพิ่มผู้ใช้งาน</h2><form method="post" action="/team" class="form-grid single"><label>ชื่อ <input name="name" required /></label><label>อีเมล <input name="email" type="email" required /></label><label>รหัสผ่าน <input name="password" type="password" required minlength="8" /></label><label>สิทธิ์ <select name="role"><option value="member">member</option><option value="admin">admin</option></select></label><button class="primary">เพิ่มผู้ใช้</button></form></div><div class="panel"><h2>คำแนะนำความปลอดภัย</h2><p>ใช้รหัสผ่านยาวอย่างน้อย 12 ตัวอักษร และตั้งค่า JWT_SECRET ในไฟล์ .env ก่อนใช้งานจริง</p></div></section><section class="panel"><table><thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สร้างเมื่อ</th></tr></thead><tbody>${users.map(u => `<tr><td>${e(u.name)}</td><td>${e(u.email)}</td><td>${e(u.role)}</td><td>${formatDateTime(u.created_at)}</td></tr>`).join('')}</tbody></table></section>`;
  res.send(layout(req, { title: 'ทีมผู้ใช้งาน', body }));
});
app.post('/team', requireAdmin, (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const hash = bcrypt.hashSync(req.body.password || '', 10);
  try {
    db.prepare('INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').run(req.body.name || '', email, hash, req.body.role || 'member', now());
  } catch (err) {
    console.error(err.message);
  }
  res.redirect('/team');
});

app.listen(PORT, () => {
  console.log(`${APP_NAME} running at http://localhost:${PORT}`);
});

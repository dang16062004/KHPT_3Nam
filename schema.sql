-- ============================================================
-- Schema D1 cho Tro ly ca nhan AI (KHPT_3Nam)
-- Chay:  npx wrangler d1 execute khpt-assistant --remote --file=schema.sql
-- ============================================================

-- Nguoi dung. Thuc te chi co DUNG 1 dong (email trong ALLOWED_EMAIL).
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,            -- Google "sub" (id on dinh cua tai khoan)
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  picture     TEXT,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL
);

-- Token OAuth. refresh_token LUON duoc ma hoa AES-GCM truoc khi ghi vao day.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_enc  TEXT NOT NULL,        -- base64(iv || ciphertext)
  access_token_enc   TEXT,                 -- cache, cung ma hoa
  access_expires_at  INTEGER,              -- epoch ms
  scope              TEXT,
  updated_at         INTEGER NOT NULL
);

-- Ke hoach ca nhan (noi dung seed/plan.json). 1 dong / user, sua duoc tu UI.
CREATE TABLE IF NOT EXISTS plan (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  json        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

-- Nhat ky tien do do nguoi dung tu bao cao.
CREATE TABLE IF NOT EXISTS progress (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area        TEXT NOT NULL,               -- ngoai_ngu | ai | kinh_te | van_dong | an_uong
  value       REAL NOT NULL,
  unit        TEXT NOT NULL,               -- phut | gio | km | buoi | vnd | ...
  log_date    TEXT NOT NULL,               -- 'YYYY-MM-DD' theo gio Viet Nam
  note        TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_progress_lookup ON progress(user_id, area, log_date);
CREATE INDEX IF NOT EXISTS idx_progress_date   ON progress(user_id, log_date);

-- Hang doi nhac nho. Cron quet bang nay moi 15 phut.
CREATE TABLE IF NOT EXISTS reminders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  note              TEXT,
  due_at            INTEGER NOT NULL,      -- epoch ms (UTC)
  channel           TEXT NOT NULL,         -- calendar | email | both
  recurrence        TEXT,                  -- none | daily | weekly | monthly
  calendar_event_id TEXT,
  calendar_link     TEXT,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | cancelled
  attempts          INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  sent_at           INTEGER,
  created_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(status, due_at);

-- Lich su hoi thoai. Chi gui N tin gan nhat cho Gemini de tiet kiem CPU/token.
CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,              -- user | model
  content      TEXT NOT NULL,
  actions_json TEXT,                       -- tom tat cac tool da chay o luot nay
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, id);

-- Nhat ky kiem toan: MOI tool call deu ghi vao day, ke ca cai bi tu choi.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  args_json   TEXT,
  allowed     INTEGER NOT NULL,            -- 1 = cho phep, 0 = bi guard chan
  result      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, id);

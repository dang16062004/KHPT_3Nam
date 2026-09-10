/** Toan bo truy van D1 gom o mot cho de de kiem tra va toi uu. */

import type { Env, UserRow } from '../types';
import type { GoogleIdentity } from '../auth/google-oauth';
import { encryptSecret } from '../auth/crypto';
import DEFAULT_PLAN from '../../seed/plan.json';

export async function upsertUser(env: Env, id: GoogleIdentity): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, created_at, last_login)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       picture = excluded.picture,
       last_login = excluded.last_login`,
  )
    .bind(id.sub, id.email, id.name ?? null, id.picture ?? null, now, now)
    .run();
}

export async function getUser(env: Env, userId: string): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>();
}

/** Nguoi dung dau tien tim thay — cron khong co phien dang nhap nen phai tra cuu kieu nay. */
export async function getPrimaryUser(env: Env): Promise<UserRow | null> {
  return env.DB.prepare('SELECT * FROM users ORDER BY created_at ASC LIMIT 1').first<UserRow>();
}

export async function saveTokens(
  env: Env,
  userId: string,
  refreshToken: string,
  accessToken: string,
  expiresInSec: number,
  scope?: string,
): Promise<void> {
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO oauth_tokens (user_id, refresh_token_enc, access_token_enc, access_expires_at, scope, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       refresh_token_enc = excluded.refresh_token_enc,
       access_token_enc = excluded.access_token_enc,
       access_expires_at = excluded.access_expires_at,
       scope = excluded.scope,
       updated_at = excluded.updated_at`,
  )
    .bind(
      userId,
      await encryptSecret(refreshToken, env.TOKEN_ENC_KEY),
      await encryptSecret(accessToken, env.TOKEN_ENC_KEY),
      now + expiresInSec * 1000,
      scope ?? null,
      now,
    )
    .run();
}

// ---------------------------------------------------------------- ke hoach

/** Lan dau truy cap thi seed bang du lieu mau trong seed/plan.json. */
export async function getPlan(env: Env, userId: string): Promise<unknown> {
  const row = await env.DB.prepare('SELECT json FROM plan WHERE user_id = ?').bind(userId).first<{ json: string }>();
  if (row) return JSON.parse(row.json);
  await setPlan(env, userId, DEFAULT_PLAN);
  return DEFAULT_PLAN;
}

export async function setPlan(env: Env, userId: string, plan: unknown): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO plan (user_id, json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`,
  )
    .bind(userId, JSON.stringify(plan), Date.now())
    .run();
}

// ---------------------------------------------------------------- tien do

export interface ProgressRow {
  id: number;
  area: string;
  value: number;
  unit: string;
  log_date: string;
  note: string | null;
}

export async function addProgress(
  env: Env,
  userId: string,
  area: string,
  value: number,
  unit: string,
  logDate: string,
  note?: string,
): Promise<number> {
  const res = await env.DB.prepare(
    'INSERT INTO progress (user_id, area, value, unit, log_date, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, area, value, unit, logDate, note ?? null, Date.now())
    .run();
  return Number(res.meta.last_row_id);
}

export async function getProgressSince(
  env: Env,
  userId: string,
  sinceDate: string,
  area?: string,
): Promise<ProgressRow[]> {
  const stmt = area
    ? env.DB.prepare(
        'SELECT id, area, value, unit, log_date, note FROM progress WHERE user_id = ? AND log_date >= ? AND area = ? ORDER BY log_date DESC, id DESC',
      ).bind(userId, sinceDate, area)
    : env.DB.prepare(
        'SELECT id, area, value, unit, log_date, note FROM progress WHERE user_id = ? AND log_date >= ? ORDER BY log_date DESC, id DESC',
      ).bind(userId, sinceDate);

  const { results } = await stmt.all<ProgressRow>();
  return results ?? [];
}

// ---------------------------------------------------------------- nhac nho

export interface ReminderRow {
  id: number;
  user_id: string;
  title: string;
  note: string | null;
  due_at: number;
  channel: string;
  recurrence: string | null;
  calendar_event_id: string | null;
  calendar_link: string | null;
  status: string;
  attempts: number;
}

export async function addReminder(
  env: Env,
  userId: string,
  r: {
    title: string;
    note?: string;
    dueAt: number;
    channel: string;
    recurrence?: string;
    calendarEventId?: string;
    calendarLink?: string;
    status?: string;
  },
): Promise<number> {
  const res = await env.DB.prepare(
    `INSERT INTO reminders (user_id, title, note, due_at, channel, recurrence, calendar_event_id, calendar_link, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      userId,
      r.title,
      r.note ?? null,
      r.dueAt,
      r.channel,
      r.recurrence ?? null,
      r.calendarEventId ?? null,
      r.calendarLink ?? null,
      r.status ?? 'pending',
      Date.now(),
    )
    .run();
  return Number(res.meta.last_row_id);
}

/** Cac nhac nho qua email den han ma cron chua gui. Cai chi dung Calendar thi Google tu nhac. */
export async function getDueReminders(env: Env, nowMs: number, limit = 25): Promise<ReminderRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM reminders
     WHERE status = 'pending' AND due_at <= ? AND channel IN ('email', 'both') AND attempts < 3
     ORDER BY due_at ASC LIMIT ?`,
  )
    .bind(nowMs, limit)
    .all<ReminderRow>();
  return results ?? [];
}

export async function getUpcomingReminders(env: Env, userId: string, limit = 20): Promise<ReminderRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM reminders WHERE user_id = ? AND status IN ('pending', 'sent')
     ORDER BY due_at DESC LIMIT ?`,
  )
    .bind(userId, limit)
    .all<ReminderRow>();
  return results ?? [];
}

export async function markReminderSent(env: Env, id: number): Promise<void> {
  await env.DB.prepare("UPDATE reminders SET status = 'sent', sent_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

export async function markReminderFailed(env: Env, id: number, error: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE reminders
     SET attempts = attempts + 1,
         last_error = ?,
         status = CASE WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END
     WHERE id = ?`,
  )
    .bind(error.slice(0, 500), id)
    .run();
}

// ---------------------------------------------------------------- hoi thoai

export interface MessageRow {
  role: string;
  content: string;
  actions_json: string | null;
  created_at: number;
}

export async function appendMessage(
  env: Env,
  userId: string,
  role: 'user' | 'model',
  content: string,
  actions?: unknown,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO messages (user_id, role, content, actions_json, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(userId, role, content, actions ? JSON.stringify(actions) : null, Date.now())
    .run();
}

/** N tin nhan gan nhat, tra ve theo thu tu cu -> moi. */
export async function recentMessages(env: Env, userId: string, limit: number): Promise<MessageRow[]> {
  const { results } = await env.DB.prepare(
    'SELECT role, content, actions_json, created_at FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?',
  )
    .bind(userId, limit)
    .all<MessageRow>();
  return (results ?? []).reverse();
}

export async function clearMessages(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM messages WHERE user_id = ?').bind(userId).run();
}

// ---------------------------------------------------------------- audit

export async function audit(
  env: Env,
  userId: string,
  toolName: string,
  args: unknown,
  allowed: boolean,
  result: string,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO audit_log (user_id, tool_name, args_json, allowed, result, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(userId, toolName, JSON.stringify(args ?? {}), allowed ? 1 : 0, result.slice(0, 500), Date.now())
    .run();
}

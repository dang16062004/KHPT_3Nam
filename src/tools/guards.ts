/**
 * Lop chan hanh dong ngoai pham vi.
 *
 * Triet ly: KHONG tin vao system prompt. Prompt co the bi lung lay boi noi dung
 * nguoi dung go vao; code thi khong. Moi tool call deu phai di qua day.
 */

import { ADVICE_AREAS, ALLOWED_TOOL_NAMES, AREAS, CHANNELS, RECURRENCES } from './definitions';
import { fromVNLocal, toVNDate } from '../util/time';

export interface GuardOk<T> {
  ok: true;
  args: T;
}
export interface GuardFail {
  ok: false;
  reason: string;
}
export type GuardResult<T> = GuardOk<T> | GuardFail;

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;

function fail(reason: string): GuardFail {
  return { ok: false, reason };
}

/**
 * Tim dia chi email "la" trong bat ky truong nao cua args.
 *
 * Day la day bay: neu Gemini co gang nhet dia chi nguoi khac vao title/note voi
 * y dinh gui thu ho, ta chan ngay va ghi vao audit_log. Tool von da khong co
 * tham so nguoi nhan, nen day chi la lop phong thu thu hai.
 */
export function findForeignEmail(args: Record<string, unknown>, allowedEmail: string): string | null {
  const allowed = allowedEmail.trim().toLowerCase();
  for (const value of Object.values(args)) {
    if (typeof value !== 'string') continue;
    for (const match of value.matchAll(EMAIL_RE)) {
      if (match[0].toLowerCase() !== allowed) return match[0];
    }
  }
  return null;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

// ---------------------------------------------------------------- kieu du lieu sau khi validate

export interface ReminderArgs {
  title: string;
  dueAt: number;
  channel: 'calendar' | 'email' | 'both';
  note?: string;
  durationMinutes: number;
  recurrence?: 'daily' | 'weekly' | 'monthly';
}

export interface AdviceArgs {
  area: string;
  days: number;
}

export interface LogProgressArgs {
  area: string;
  value: number;
  unit: string;
  date: string;
  note?: string;
}

export interface SummaryArgs {
  area?: string;
  days: number;
}

// ---------------------------------------------------------------- validate tung tool

const MAX_FUTURE_MS = 3 * 365 * 24 * 60 * 60 * 1000; // khong dat nhac xa hon 3 nam
const CLOCK_SLACK_MS = 60_000;

export function validateReminder(raw: Record<string, unknown>): GuardResult<ReminderArgs> {
  const title = asString(raw.title);
  if (!title) return fail('Thiếu tiêu đề nhắc nhở.');
  if (title.length > 200) return fail('Tiêu đề quá dài (tối đa 200 ký tự).');

  const when = asString(raw.datetime_local);
  if (!when) return fail('Thiếu thời điểm nhắc (datetime_local).');

  const dueAt = fromVNLocal(when);
  if (Number.isNaN(dueAt)) return fail(`Không đọc được thời điểm "${when}". Cần định dạng YYYY-MM-DDTHH:mm.`);
  if (dueAt < Date.now() - CLOCK_SLACK_MS) return fail('Thời điểm nhắc nằm trong quá khứ.');
  if (dueAt > Date.now() + MAX_FUTURE_MS) return fail('Thời điểm nhắc xa hơn 3 năm, có vẻ không đúng ý.');

  const channel = asString(raw.channel) ?? 'calendar';
  if (!(CHANNELS as readonly string[]).includes(channel)) return fail(`Kênh "${channel}" không hợp lệ.`);

  const recurrenceRaw = asString(raw.recurrence) ?? 'none';
  if (!(RECURRENCES as readonly string[]).includes(recurrenceRaw)) {
    return fail(`Kiểu lặp "${recurrenceRaw}" không hợp lệ.`);
  }

  const duration = asNumber(raw.duration_minutes) ?? 30;
  if (duration <= 0 || duration > 24 * 60) return fail('Độ dài sự kiện phải trong khoảng 1–1440 phút.');

  return {
    ok: true,
    args: {
      title,
      dueAt,
      channel: channel as ReminderArgs['channel'],
      note: asString(raw.note),
      durationMinutes: Math.round(duration),
      recurrence: recurrenceRaw === 'none' ? undefined : (recurrenceRaw as ReminderArgs['recurrence']),
    },
  };
}

export function validateAdvice(raw: Record<string, unknown>): GuardResult<AdviceArgs> {
  const area = asString(raw.area) ?? 'tong_quan';
  if (!(ADVICE_AREAS as readonly string[]).includes(area)) return fail(`Lĩnh vực "${area}" không có trong kế hoạch.`);
  const days = Math.min(Math.max(asNumber(raw.days) ?? 14, 1), 365);
  return { ok: true, args: { area, days } };
}

export function validateLogProgress(raw: Record<string, unknown>): GuardResult<LogProgressArgs> {
  const area = asString(raw.area);
  if (!area || !(AREAS as readonly string[]).includes(area)) {
    return fail(`Lĩnh vực "${area ?? ''}" không hợp lệ. Chỉ nhận: ${AREAS.join(', ')}.`);
  }

  const value = asNumber(raw.value);
  if (value === undefined) return fail('Thiếu giá trị số cho tiến độ.');
  if (value < 0) return fail('Giá trị tiến độ không thể âm.');

  const unit = asString(raw.unit);
  if (!unit) return fail('Thiếu đơn vị (phút, km, buổi, vnd...).');

  const date = asString(raw.date) ?? toVNDate(Date.now());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(`Ngày "${date}" sai định dạng, cần YYYY-MM-DD.`);

  return { ok: true, args: { area, value, unit, date, note: asString(raw.note) } };
}

export function validateSummary(raw: Record<string, unknown>): GuardResult<SummaryArgs> {
  const area = asString(raw.area);
  if (area && !(AREAS as readonly string[]).includes(area)) return fail(`Lĩnh vực "${area}" không hợp lệ.`);
  const days = Math.min(Math.max(asNumber(raw.days) ?? 7, 1), 365);
  return { ok: true, args: { area, days } };
}

/** Tool nay co nam trong danh sach cho phep khong? */
export function isAllowedTool(name: string): boolean {
  return ALLOWED_TOOL_NAMES.has(name);
}

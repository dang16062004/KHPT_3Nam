/**
 * Thuc thi tool sau khi da qua guard.
 *
 * Moi tool call — ke ca cai bi tu choi — deu duoc ghi vao audit_log de ban co the
 * kiem tra lai sau nay bot da lam nhung gi.
 */

import type { ActionTrace, Env } from '../types';
import { getValidAccessToken } from '../auth/google-oauth';
import { createEvent } from '../services/calendar';
import { reminderEmailHtml, sendSelfEmail } from '../services/gmail';
import { addProgress, addReminder, audit, getPlan, getProgressSince, markReminderSent } from '../db/queries';
import { recentDates, toVNLocal } from '../util/time';
import { summarizeAll, type PlanShape } from './analysis';
import {
  findForeignEmail,
  isAllowedTool,
  validateAdvice,
  validateLogProgress,
  validateReminder,
  validateSummary,
} from './guards';

export interface ToolOutcome {
  /** Du lieu tra nguoc lai cho Gemini duoi dang functionResponse. */
  response: Record<string, unknown>;
  /** Tom tat de hien tren UI. */
  trace: ActionTrace;
}

function refused(tool: string, reason: string, args: unknown): ToolOutcome {
  return {
    response: { thanh_cong: false, ly_do: reason },
    trace: { tool, label: `Từ chối: ${reason}`, allowed: false, detail: JSON.stringify(args) },
  };
}

export async function executeTool(
  env: Env,
  userId: string,
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<ToolOutcome> {
  // Chan 1: tool khong nam trong 3 nhom da khai bao.
  if (!isAllowedTool(name)) {
    const outcome = refused(name, `Hành động "${name}" nằm ngoài 3 nhóm được phép.`, rawArgs);
    await audit(env, userId, name, rawArgs, false, outcome.response.ly_do as string);
    return outcome;
  }

  // Chan 2: co dia chi email la lan vao bat ky truong nao.
  const foreign = findForeignEmail(rawArgs, env.ALLOWED_EMAIL);
  if (foreign) {
    const outcome = refused(
      name,
      `Phát hiện địa chỉ email lạ (${foreign}). Trợ lý chỉ được gửi thư cho chính chủ tài khoản.`,
      rawArgs,
    );
    await audit(env, userId, name, rawArgs, false, outcome.response.ly_do as string);
    return outcome;
  }

  try {
    switch (name) {
      case 'create_reminder':
        return await handleCreateReminder(env, userId, rawArgs);
      case 'get_advice':
        return await handleGetAdvice(env, userId, rawArgs);
      case 'log_progress':
        return await handleLogProgress(env, userId, rawArgs);
      case 'get_progress_summary':
        return await handleGetSummary(env, userId, rawArgs);
      default:
        return refused(name, 'Tool chưa được cài đặt.', rawArgs);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await audit(env, userId, name, rawArgs, true, `LOI: ${message}`);
    return {
      response: { thanh_cong: false, ly_do: `Lỗi khi thực thi: ${message}` },
      trace: { tool: name, label: `Lỗi: ${message}`, allowed: true },
    };
  }
}

// ---------------------------------------------------------------- nhom 1: nhac nho

async function handleCreateReminder(
  env: Env,
  userId: string,
  raw: Record<string, unknown>,
): Promise<ToolOutcome> {
  const check = validateReminder(raw);
  if (!check.ok) {
    await audit(env, userId, 'create_reminder', raw, false, check.reason);
    return refused('create_reminder', check.reason, raw);
  }
  const a = check.args;
  const whenText = toVNLocal(a.dueAt).replace('T', ' ');

  let calendarEventId: string | undefined;
  let calendarLink: string | undefined;

  if (a.channel === 'calendar' || a.channel === 'both') {
    const token = await getValidAccessToken(env, userId);
    const event = await createEvent(token, {
      title: a.title,
      startMs: a.dueAt,
      durationMin: a.durationMinutes,
      note: a.note,
      timeZone: env.TIMEZONE,
      recurrence: a.recurrence,
    });
    calendarEventId = event.id;
    calendarLink = event.htmlLink;
  }

  // Nhac qua email thi xep hang doi de cron ban dung gio, khong gui ngay.
  const needsEmail = a.channel === 'email' || a.channel === 'both';
  const reminderId = await addReminder(env, userId, {
    title: a.title,
    note: a.note,
    dueAt: a.dueAt,
    channel: a.channel,
    recurrence: a.recurrence,
    calendarEventId,
    calendarLink,
    status: needsEmail ? 'pending' : 'sent',
  });

  const parts: string[] = [];
  if (calendarEventId) parts.push('đã tạo sự kiện Google Calendar');
  if (needsEmail) parts.push('đã xếp lịch gửi email nhắc');

  await audit(env, userId, 'create_reminder', raw, true, parts.join(', '));

  return {
    response: {
      thanh_cong: true,
      id: reminderId,
      tieu_de: a.title,
      thoi_diem: whenText,
      kenh: a.channel,
      lap_lai: a.recurrence ?? 'none',
      link_lich: calendarLink ?? null,
      ghi_chu_cho_model: 'Hãy xác nhận lại ngắn gọn với người dùng bằng tiếng Việt.',
    },
    trace: {
      tool: 'create_reminder',
      label: `Nhắc nhở: ${a.title} — ${whenText}`,
      allowed: true,
      detail: parts.join(' · '),
      link: calendarLink,
    },
  };
}

// ---------------------------------------------------------------- nhom 2: loi khuyen

async function handleGetAdvice(env: Env, userId: string, raw: Record<string, unknown>): Promise<ToolOutcome> {
  const check = validateAdvice(raw);
  if (!check.ok) {
    await audit(env, userId, 'get_advice', raw, false, check.reason);
    return refused('get_advice', check.reason, raw);
  }
  const { area, days } = check.args;

  const plan = (await getPlan(env, userId)) as PlanShape;
  const since = recentDates(days).at(-1)!;
  const rows = await getProgressSince(env, userId, since);
  const summaries = summarizeAll(plan, rows, days, area === 'tong_quan' ? undefined : area);

  await audit(env, userId, 'get_advice', raw, true, `doc ke hoach + ${rows.length} ban ghi tien do`);

  return {
    response: {
      thanh_cong: true,
      linh_vuc: area,
      ke_hoach: area === 'tong_quan' ? plan : { [area]: plan.areas?.[area] ?? null },
      tong_hop_tien_do: summaries,
      ghi_chu_cho_model:
        'Dựa HOÀN TOÀN vào số liệu trên để khuyên. Nêu rõ con số cụ thể. ' +
        'Nếu thiếu dữ liệu thì nói thẳng là chưa đủ dữ liệu chứ đừng bịa.',
    },
    trace: {
      tool: 'get_advice',
      label: `Đọc kế hoạch + tiến độ ${days} ngày (${area})`,
      allowed: true,
      detail: `${rows.length} bản ghi`,
    },
  };
}

// ---------------------------------------------------------------- nhom 3: giam sat

async function handleLogProgress(env: Env, userId: string, raw: Record<string, unknown>): Promise<ToolOutcome> {
  const check = validateLogProgress(raw);
  if (!check.ok) {
    await audit(env, userId, 'log_progress', raw, false, check.reason);
    return refused('log_progress', check.reason, raw);
  }
  const a = check.args;

  const id = await addProgress(env, userId, a.area, a.value, a.unit, a.date, a.note);
  await audit(env, userId, 'log_progress', raw, true, `ghi #${id}`);

  return {
    response: {
      thanh_cong: true,
      id,
      linh_vuc: a.area,
      gia_tri: a.value,
      don_vi: a.unit,
      ngay: a.date,
    },
    trace: {
      tool: 'log_progress',
      label: `Ghi tiến độ: ${a.area} — ${a.value} ${a.unit} (${a.date})`,
      allowed: true,
    },
  };
}

async function handleGetSummary(env: Env, userId: string, raw: Record<string, unknown>): Promise<ToolOutcome> {
  const check = validateSummary(raw);
  if (!check.ok) {
    await audit(env, userId, 'get_progress_summary', raw, false, check.reason);
    return refused('get_progress_summary', check.reason, raw);
  }
  const { area, days } = check.args;

  const plan = (await getPlan(env, userId)) as PlanShape;
  const since = recentDates(days).at(-1)!;
  const rows = await getProgressSince(env, userId, since, area);
  const summaries = summarizeAll(plan, rows, days, area);

  await audit(env, userId, 'get_progress_summary', raw, true, `${rows.length} ban ghi / ${days} ngay`);

  const warnings = summaries.filter((s) => s.canh_bao).map((s) => `${s.label}: ${s.canh_bao}`);

  return {
    response: { thanh_cong: true, so_ngay: days, tong_hop: summaries, canh_bao: warnings },
    trace: {
      tool: 'get_progress_summary',
      label: `Xem tiến độ ${days} ngày${area ? ` (${area})` : ''}`,
      allowed: true,
      detail: warnings.length ? `${warnings.length} cảnh báo` : 'không có cảnh báo',
    },
  };
}

// ---------------------------------------------------------------- dung cho cron

/** Gui mot nhac nho dang cho trong hang doi. Cron goi ham nay. */
export async function dispatchReminderEmail(
  env: Env,
  userId: string,
  reminder: { id: number; title: string; note: string | null; due_at: number },
): Promise<void> {
  const token = await getValidAccessToken(env, userId);
  const whenText = toVNLocal(reminder.due_at).replace('T', ' ');
  await sendSelfEmail(
    token,
    env.ALLOWED_EMAIL,
    `⏰ ${reminder.title}`,
    reminderEmailHtml(reminder.title, `${whenText} (giờ Việt Nam)`, reminder.note ?? undefined),
  );
  await markReminderSent(env, reminder.id);
  await audit(env, userId, 'cron:send_reminder', { id: reminder.id }, true, 'da gui email');
}

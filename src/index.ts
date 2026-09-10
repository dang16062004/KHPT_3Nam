/**
 * Diem vao cua Worker: HTTP routes + cron.
 *
 * Luong dang nhap: "/" -> chua co phien -> /auth/login -> Google -> /auth/callback
 * -> kiem tra email co dung ALLOWED_EMAIL khong -> luu refresh token -> dat cookie.
 */

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';

import type { ActionTrace, Env, SessionPayload, Variables } from './types';
import { randomToken } from './auth/crypto';
import {
  buildAuthUrl,
  exchangeCode,
  identityFromIdToken,
  redirectUri,
} from './auth/google-oauth';
import { SESSION_COOKIE, SESSION_TTL_MS, clearCookie, sessionCookie, signSession, verifySession } from './auth/session';
import {
  addProgress,
  appendMessage,
  audit,
  clearMessages,
  getDueReminders,
  getPlan,
  getPrimaryUser,
  getProgressSince,
  getUpcomingReminders,
  markReminderFailed,
  recentMessages,
  saveTokens,
  setPlan,
  upsertUser,
} from './db/queries';
import { callGemini, extractFunctionCalls, extractText, MAX_TOOL_ROUNDS, type GeminiContent } from './services/gemini';
import { reminderEmailHtml, sendSelfEmail } from './services/gmail';
import { getValidAccessToken } from './auth/google-oauth';
import { buildSystemPrompt } from './prompts/system';
import { dispatchReminderEmail, executeTool } from './tools/handlers';
import { summarizeAll, type PlanShape } from './tools/analysis';
import { recentDates, toVNDate, toVNLocal } from './util/time';
import { validateLogProgress } from './tools/guards';

const OAUTH_STATE_COOKIE = 'khpt_oauth_state';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================ dang nhap

app.get('/auth/login', async (c) => {
  const state = randomToken();
  setCookie(c, OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  return c.redirect(buildAuthUrl(c.env, redirectUri(c.req.raw), state));
});

app.get('/auth/callback', async (c) => {
  const url = new URL(c.req.url);
  const error = url.searchParams.get('error');
  if (error) return c.html(errorPage(`Google trả về lỗi: ${error}`), 400);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = getCookie(c, OAUTH_STATE_COOKIE);

  if (!code) return c.html(errorPage('Thiếu mã uỷ quyền từ Google.'), 400);
  if (!state || !expectedState || state !== expectedState) {
    return c.html(errorPage('State không khớp — có thể là request giả mạo. Hãy đăng nhập lại từ đầu.'), 400);
  }

  let tokens;
  try {
    tokens = await exchangeCode(c.env, code, redirectUri(c.req.raw));
  } catch (err) {
    return c.html(errorPage(`Không đổi được mã lấy token: ${(err as Error).message}`), 502);
  }

  if (!tokens.id_token) return c.html(errorPage('Google không trả về id_token.'), 502);

  const identity = identityFromIdToken(tokens.id_token);

  // === CHOT CHAN: chi dung mot email duy nhat duoc vao ===
  if (identity.email.trim().toLowerCase() !== c.env.ALLOWED_EMAIL.trim().toLowerCase()) {
    return c.html(
      errorPage(
        `Tài khoản <b>${escapeHtmlText(identity.email)}</b> không có quyền truy cập ứng dụng này.<br>` +
          `Đây là trợ lý cá nhân, chỉ dành cho đúng một tài khoản.`,
      ),
      403,
    );
  }

  if (!tokens.refresh_token) {
    return c.html(
      errorPage(
        'Google không cấp refresh token. Hãy vào myaccount.google.com/permissions, gỡ quyền của ứng dụng này rồi đăng nhập lại.',
      ),
      502,
    );
  }

  await upsertUser(c.env, identity);
  await saveTokens(c.env, identity.sub, tokens.refresh_token, tokens.access_token, tokens.expires_in, tokens.scope);

  const payload: SessionPayload = {
    sub: identity.sub,
    email: identity.email,
    name: identity.name,
    exp: Date.now() + SESSION_TTL_MS,
  };

  c.header('Set-Cookie', sessionCookie(await signSession(payload, c.env.SESSION_SECRET)), { append: true });
  c.header('Set-Cookie', clearCookie(OAUTH_STATE_COOKIE), { append: true });
  return c.redirect('/');
});

app.post('/auth/logout', (c) => {
  c.header('Set-Cookie', clearCookie(SESSION_COOKIE));
  return c.json({ ok: true });
});

// ============================================================ bao ve

/** Doc phien tu cookie; tra null neu khong hop le. */
async function readSession(c: { req: { raw: Request }; env: Env }): Promise<SessionPayload | null> {
  const cookie = c.req.raw.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifySession(match[1], c.env.SESSION_SECRET);
}

app.use('/api/*', async (c, next) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: 'Chưa đăng nhập', login: '/auth/login' }, 401);
  if (session.email.trim().toLowerCase() !== c.env.ALLOWED_EMAIL.trim().toLowerCase()) {
    return c.json({ error: 'Tài khoản không có quyền truy cập' }, 403);
  }
  c.set('session', session);
  await next();
});

// Trang chu: chan truoc khi tra ve UI.
app.get('/', async (c) => {
  const session = await readSession(c);
  if (!session) return c.redirect('/auth/login');
  return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url), c.req.raw));
});

// ============================================================ API

app.get('/api/me', async (c) => {
  const s = c.get('session');
  return c.json({ email: s.email, name: s.name ?? null, timezone: c.env.TIMEZONE, model: c.env.GEMINI_MODEL });
});

app.get('/api/history', async (c) => {
  const s = c.get('session');
  const rows = await recentMessages(c.env, s.sub, Number(c.env.MAX_HISTORY_MESSAGES));
  return c.json(
    rows.map((r) => ({
      role: r.role,
      content: r.content,
      actions: r.actions_json ? JSON.parse(r.actions_json) : [],
      at: r.created_at,
    })),
  );
});

app.delete('/api/history', async (c) => {
  await clearMessages(c.env, c.get('session').sub);
  return c.json({ ok: true });
});

/**
 * Chat tra ve Server-Sent Events thay vi mot cuc JSON.
 *
 * Ly do: spec yeu cau nguoi dung luon nhin thay bot dang lam gi. Voi SSE, moi
 * hanh dong hien len NGAY khi vua chay xong, thay vi doi ca luot ket thuc.
 */
app.post('/api/chat', async (c) => {
  const s = c.get('session');

  const body = await c.req.json<{ message?: string }>().catch(() => ({ message: undefined }));
  const message = body.message?.trim();
  if (!message) return c.json({ error: 'Tin nhắn rỗng' }, 400);
  if (message.length > 4000) return c.json({ error: 'Tin nhắn quá dài (tối đa 4000 ký tự)' }, 400);

  return streamSSE(c, async (stream) => {
    const send = (data: unknown) => stream.writeSSE({ data: JSON.stringify(data) });

    const plan = await getPlan(c.env, s.sub);
    const systemPrompt = buildSystemPrompt(c.env.ALLOWED_EMAIL, JSON.stringify(plan, null, 1));

    const history = await recentMessages(c.env, s.sub, Number(c.env.MAX_HISTORY_MESSAGES));
    const contents: GeminiContent[] = history.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const actions: ActionTrace[] = [];
    let reply = '';

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const modelTurn = await callGemini(c.env, systemPrompt, contents);
        const calls = extractFunctionCalls(modelTurn);

        if (calls.length === 0) {
          reply = extractText(modelTurn);
          break;
        }

        contents.push(modelTurn);

        // Chay tuan tu: giu dung thu tu ghi vao D1 va bao cho UI truoc moi buoc.
        const responseParts = [];
        for (const call of calls) {
          await send({ type: 'running', tool: call.name, args: call.args });
          const outcome = await executeTool(c.env, s.sub, call.name, call.args);
          actions.push(outcome.trace);
          await send({ type: 'action', trace: outcome.trace });
          responseParts.push({ functionResponse: { name: call.name, response: outcome.response } });
        }
        contents.push({ role: 'user', parts: responseParts });
      }

      if (!reply) {
        reply =
          'Mình đã chạy hết số vòng cho phép mà chưa chốt được câu trả lời. Bạn thử hỏi lại gọn hơn nhé.';
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      await send({ type: 'error', message: detail, actions });
      return;
    }

    await appendMessage(c.env, s.sub, 'user', message);
    await appendMessage(c.env, s.sub, 'model', reply, actions);
    await send({ type: 'reply', text: reply, actions });
  });
});

app.get('/api/plan', async (c) => c.json(await getPlan(c.env, c.get('session').sub)));

app.put('/api/plan', async (c) => {
  const s = c.get('session');
  let incoming: unknown;
  try {
    incoming = await c.req.json();
  } catch {
    return c.json({ error: 'JSON không hợp lệ' }, 400);
  }
  if (typeof incoming !== 'object' || incoming === null || Array.isArray(incoming)) {
    return c.json({ error: 'Kế hoạch phải là một object JSON' }, 400);
  }
  await setPlan(c.env, s.sub, incoming);
  await audit(c.env, s.sub, 'ui:update_plan', null, true, 'nguoi dung sua ke hoach');
  return c.json({ ok: true });
});

app.get('/api/progress', async (c) => {
  const s = c.get('session');
  const days = Math.min(Math.max(Number(c.req.query('days') ?? 14), 1), 365);
  const plan = (await getPlan(c.env, s.sub)) as PlanShape;
  const rows = await getProgressSince(c.env, s.sub, recentDates(days).at(-1)!);
  return c.json({ days, summary: summarizeAll(plan, rows, days), entries: rows });
});

app.post('/api/progress', async (c) => {
  const s = c.get('session');
  const raw = await c.req.json<Record<string, unknown>>().catch(() => ({}));
  const check = validateLogProgress(raw);
  if (!check.ok) return c.json({ error: check.reason }, 400);
  const a = check.args;
  const id = await addProgress(c.env, s.sub, a.area, a.value, a.unit, a.date, a.note);
  await audit(c.env, s.sub, 'ui:log_progress', raw, true, `ghi #${id}`);
  return c.json({ ok: true, id });
});

app.get('/api/reminders', async (c) => {
  const rows = await getUpcomingReminders(c.env, c.get('session').sub);
  return c.json(rows.map((r) => ({ ...r, due_local: toVNLocal(r.due_at).replace('T', ' ') })));
});

// Moi thu con lai (app.js, style.css, favicon...) do asset handler tra ve.
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// ============================================================ cron

/**
 * Cron 1 (*&#47;15 * * * *): gui cac email nhac nho da den han.
 * Cron 2 (0 14 UTC = 21:00 VN): kiem tra streak lech muc tieu va canh bao.
 */
async function handleScheduled(event: ScheduledController, env: Env): Promise<void> {
  const user = await getPrimaryUser(env);
  if (!user) {
    console.log('Cron: chua co nguoi dung nao dang nhap, bo qua.');
    return;
  }

  if (event.cron === '0 14 * * *') {
    await runDailyCheck(env, user.id);
    return;
  }

  const due = await getDueReminders(env, Date.now());
  console.log(`Cron: ${due.length} nhac nho den han.`);
  for (const reminder of due) {
    try {
      await dispatchReminderEmail(env, reminder.user_id, reminder);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Cron: gui nhac nho #${reminder.id} that bai — ${message}`);
      await markReminderFailed(env, reminder.id, message);
    }
  }
}

/** Bao cao cuoi ngay: chi gui email khi THUC SU co canh bao, tranh lam phien. */
async function runDailyCheck(env: Env, userId: string): Promise<void> {
  const plan = (await getPlan(env, userId)) as PlanShape;
  const days = 14;
  const rows = await getProgressSince(env, userId, recentDates(days).at(-1)!);
  const summaries = summarizeAll(plan, rows, days);
  const warnings = summaries.filter((s) => s.canh_bao);

  if (warnings.length === 0) {
    console.log('Cron ngay: khong co canh bao nao.');
    return;
  }

  const items = warnings
    .map((w) => `<li><b>${escapeHtmlText(w.label)}</b>: ${escapeHtmlText(w.canh_bao!)}</li>`)
    .join('');

  try {
    const token = await getValidAccessToken(env, userId);
    await sendSelfEmail(
      token,
      env.ALLOWED_EMAIL,
      `📉 Có ${warnings.length} mục đang lệch kế hoạch`,
      reminderEmailHtml(
        `Có ${warnings.length} mục đang lệch kế hoạch`,
        `Tổng kết ngày ${toVNDate(Date.now())}`,
        undefined,
      ).replace('</h2>', `</h2><ul style="margin:12px 0;padding-left:20px;color:#374151">${items}</ul>`),
    );
    await audit(env, userId, 'cron:daily_check', { warnings: warnings.length }, true, 'da gui canh bao');
  } catch (err) {
    console.error('Cron ngay: gui canh bao that bai —', (err as Error).message);
  }
}

// ============================================================ tien ich

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function errorPage(messageHtml: string): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Không truy cập được</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0f1115;color:#e5e7eb;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px">
<div style="max-width:460px;text-align:center">
  <div style="font-size:42px;margin-bottom:12px">🔒</div>
  <h1 style="font-size:20px;margin:0 0 12px">Không truy cập được</h1>
  <p style="color:#9ca3af;line-height:1.6;margin:0 0 24px">${messageHtml}</p>
  <a href="/auth/login" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px">Thử đăng nhập lại</a>
</div></body></html>`;
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

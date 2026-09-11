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
import { describeTopicOfDay, getTopicOfDay } from './services/topic-of-day';
import { dispatchReminderEmail, executeTool } from './tools/handlers';
import { summarizeAll, type PlanShape } from './tools/analysis';
import { recentDates, toVNDate, toVNLocal } from './util/time';
import { validateLogProgress } from './tools/guards';

const OAUTH_STATE_COOKIE = 'khpt_oauth_state';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Loi chua bat duoc: ghi log day du (xem bang `npm run tail`), va hien trang loi co
 * ma tham chieu thay vi dong chu "Internal Server Error" tron — de khi nguoi dung
 * chup man hinh gui lai thi tim duoc dung dong log.
 */
app.onError((err, c) => {
  const ref = randomToken(4);
  console.error(`[${ref}] ${c.req.method} ${new URL(c.req.url).pathname}:`, err.stack ?? err.message);
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return c.json({ error: `Lỗi máy chủ (mã ${ref}): ${err.message}` }, 500);
  }
  return c.html(errorPage(`Lỗi máy chủ: ${escapeHtmlText(err.message)}<br><small>Mã tham chiếu: ${ref}</small>`), 500);
});

// ============================================================ dang nhap

app.get('/auth/login', async (c) => {
  // Chua nap du secret thi bao thang, thay vi day nguoi dung sang Google voi
  // client_id=undefined roi de Google in ra mot trang loi kho hieu.
  const missing = (['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GEMINI_API_KEY', 'ALLOWED_EMAIL'] as const).filter(
    (key) => !c.env[key],
  );
  if (missing.length) return c.html(setupPage(missing), 503);

  // Cookie giu TOI DA 5 state gan nhat thay vi 1. Neu chi giu 1, bam dang nhap o
  // tab thu hai se ghi de state cua tab thu nhat, va dong y o tab cu -> "State khong
  // khop". Van chong CSRF vi state phai nam trong cookie cua CHINH trinh duyet nay.
  const state = randomToken();
  const previous = (getCookie(c, OAUTH_STATE_COOKIE) ?? '').split('.').filter(Boolean);
  setCookie(c, OAUTH_STATE_COOKIE, [...previous, state].slice(-5).join('.'), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 600,
  });
  return c.redirect(buildAuthUrl(c.env, redirectUri(c.req.raw), state));
});

app.get('/auth/callback', async (c) => {
  /** Moi nhanh that bai deu ghi log — truoc day khong co, nen loi xay ra ma khong ai biet vi sao. */
  const fail = (status: 400 | 403 | 502, logReason: string, messageHtml: string) => {
    console.error(`[auth/callback] ${status} ${logReason}`);
    return c.html(errorPage(messageHtml), status);
  };

  const url = new URL(c.req.url);
  const error = url.searchParams.get('error');
  if (error) return fail(400, `google error=${error}`, `Google trả về lỗi: ${escapeHtmlText(error)}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const knownStates = (getCookie(c, OAUTH_STATE_COOKIE) ?? '').split('.').filter(Boolean);

  if (!code) return fail(400, 'thieu code', 'Thiếu mã uỷ quyền từ Google.');
  if (!state || !knownStates.includes(state)) {
    return fail(
      400,
      `state khong khop (cookie co ${knownStates.length} state)`,
      knownStates.length === 0
        ? 'Phiên đăng nhập đã hết hạn (quá 10 phút) hoặc trình duyệt chặn cookie. Hãy bấm đăng nhập lại.'
        : 'Bạn đang hoàn tất đăng nhập từ một tab Google cũ. Hãy đóng các tab Google khác rồi đăng nhập lại.',
    );
  }

  let tokens;
  try {
    tokens = await exchangeCode(c.env, code, redirectUri(c.req.raw));
  } catch (err) {
    const msg = (err as Error).message;
    return fail(502, `exchangeCode: ${msg}`, `Không đổi được mã lấy token: ${escapeHtmlText(msg)}`);
  }

  if (!tokens.id_token) return fail(502, 'khong co id_token', 'Google không trả về id_token.');

  const identity = identityFromIdToken(tokens.id_token);

  // === CHOT CHAN: chi dung mot email duy nhat duoc vao ===
  if (identity.email.trim().toLowerCase() !== c.env.ALLOWED_EMAIL.trim().toLowerCase()) {
    return fail(
      403,
      `email bi chan: ${identity.email}`,
      `Tài khoản <b>${escapeHtmlText(identity.email)}</b> không có quyền truy cập ứng dụng này.<br>` +
        `Đây là trợ lý cá nhân, chỉ dành cho đúng một tài khoản.`,
    );
  }

  if (!tokens.refresh_token) {
    return fail(
      502,
      'khong co refresh_token',
      'Google không cấp refresh token. Hãy vào myaccount.google.com/permissions, gỡ quyền của ứng dụng này rồi đăng nhập lại.',
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
  // Phai xin ASSETS dung duong dan "/", KHONG phai "/index.html": asset server tu
  // chuan hoa "/index.html" thanh mot redirect 307 ve "/", ma "/" lai quay vao day
  // -> vong lap redirect vo tan ngay sau khi dang nhap.
  return c.env.ASSETS.fetch(c.req.raw);
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
  const s = c.get('session');
  await clearMessages(c.env, s.sub);
  await audit(c.env, s.sub, 'ui:clear_history', null, true, 'nguoi dung xoa lich su chat');
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
    const topicOfDay = getTopicOfDay(toVNDate(Date.now()));
    const systemPrompt = buildSystemPrompt(
      c.env.ALLOWED_EMAIL,
      JSON.stringify(plan, null, 1),
      Date.now(),
      describeTopicOfDay(topicOfDay),
    );

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
        const modelTurn = await callGemini(c.env, systemPrompt, contents, (info) =>
          send({ type: 'retrying', ...info }),
        );
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

/**
 * Chu de luyen tieng Anh/IELTS cua hom nay — thuan tuy tinh toan tu ngay, khong
 * ghi/doc gi vao D1, khong goi Gemini. Front-end dung de hien the "hom nay luyen gi".
 */
app.get('/api/topic-of-day', (c) => c.json(getTopicOfDay(toVNDate(Date.now()))));

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

/** Trang huong dan khi con thieu secret — trang thai binh thuong ngay sau khi deploy lan dau. */
function setupPage(missing: readonly string[]): string {
  const items = missing.map((k) => `<li><code>${k}</code></li>`).join('');
  return shell(
    '⚙️',
    'Chưa cấu hình xong',
    `<p style="color:#9ca3af;line-height:1.7;margin:0 0 18px">Ứng dụng đã deploy nhưng còn thiếu ${missing.length} biến bí mật:</p>
     <ul style="text-align:left;display:inline-block;color:#e5e7eb;line-height:2;margin:0 0 22px;padding-left:20px">${items}</ul>
     <p style="color:#9ca3af;line-height:1.7;margin:0 0 8px;font-size:14px">Tạo file <code>.secrets.json</code> chứa các giá trị đó rồi chạy:</p>
     <pre style="text-align:left;background:#12151d;border:1px solid #262e3d;border-radius:10px;padding:12px 14px;overflow-x:auto;color:#c9d1e3;font-size:13px;margin:0 0 20px">npx wrangler secret bulk .secrets.json
npx wrangler deploy</pre>
     <p style="color:#6b7280;font-size:13px;margin:0">Xem mục "Cài đặt" trong README để biết cách lấy từng giá trị.</p>`,
    false,
  );
}

function errorPage(messageHtml: string): string {
  return shell(
    '🔒',
    'Không truy cập được',
    `<p style="color:#9ca3af;line-height:1.7;margin:0 0 24px">${messageHtml}</p>`,
    true,
  );
}

/**
 * Khung HTML dung chung cho cac trang ngoai ung dung (loi, huong dan cai dat).
 * Cac trang nay phai tu chua CSS: nguoi dung chua dang nhap thi khong tai UI chinh.
 */
function shell(icon: string, title: string, bodyHtml: string, showLoginButton: boolean): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body { font-family:"Be Vietnam Pro",-apple-system,Segoe UI,Roboto,sans-serif; background:#0a0c12; color:#eef1f7;
         display:grid; place-items:center; min-height:100vh; margin:0; padding:24px; overflow-x:hidden; }
  body::before { content:''; position:fixed; inset:0; z-index:-1;
                 background:radial-gradient(60% 50% at 30% 0%, rgba(124,140,255,.20), transparent 70%),
                            radial-gradient(50% 45% at 80% 15%, rgba(176,108,255,.16), transparent 70%); }
  .box { max-width:480px; text-align:center; background:rgba(22,27,40,.72); backdrop-filter:blur(18px);
         border:1px solid rgba(255,255,255,.08); border-radius:20px; padding:34px 30px;
         box-shadow:0 20px 60px rgba(0,0,0,.45); }
  .mark { width:60px; height:60px; margin:0 auto 18px; display:grid; place-items:center; font-size:27px;
          border-radius:19px; background:linear-gradient(135deg,#7c8cff,#b06cff); box-shadow:0 12px 32px rgba(124,140,255,.35); }
  h1 { font-size:21px; margin:0 0 14px; letter-spacing:-.02em; }
  code { font-family:ui-monospace,Consolas,monospace; font-size:.9em; background:rgba(30,36,52,.8);
         border:1px solid rgba(255,255,255,.08); border-radius:6px; padding:2px 7px; }
  a.btn { display:inline-block; background:linear-gradient(135deg,#7c8cff,#b06cff); color:#fff; text-decoration:none;
          padding:11px 24px; border-radius:12px; font-weight:500; box-shadow:0 8px 24px rgba(124,140,255,.35); }
</style></head>
<body><div class="box">
  <div class="mark">${icon}</div>
  <h1>${title}</h1>
  ${bodyHtml}
  ${showLoginButton ? '<a class="btn" href="/auth/login">Thử đăng nhập lại</a>' : ''}
</div></body></html>`;
}

export default {
  fetch: app.fetch,
  scheduled: handleScheduled,
} satisfies ExportedHandler<Env>;

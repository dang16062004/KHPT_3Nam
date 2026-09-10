/**
 * Gui email qua Gmail API (scope `gmail.send` — chi gui, khong doc duoc hop thu).
 *
 * QUAN TRONG: ham nay khong nhan tham so "nguoi nhan" tu ben ngoai theo kieu tuy y.
 * Nguoi goi phai truyen dia chi lay tu env.ALLOWED_EMAIL, va `assertSelfOnly` chan
 * lai mot lan nua. Do la lop phong thu cuoi cung cho rang buoc "chi gui cho chinh minh".
 */

import { encodeMimeHeader, escapeHtml, sanitizeHeaderValue, utf8ToBase64, utf8ToBase64Url } from '../util/encoding';

const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/** Nem loi neu dia chi nhan khac email cua chu tai khoan. */
export function assertSelfOnly(to: string, allowedEmail: string): void {
  if (to.trim().toLowerCase() !== allowedEmail.trim().toLowerCase()) {
    throw new Error(`Tu choi: chi duoc gui email den ${allowedEmail}, khong gui den ${to}.`);
  }
}

function buildRawMessage(to: string, subject: string, htmlBody: string): string {
  const boundaryless = [
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${encodeMimeHeader(sanitizeHeaderValue(subject))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    utf8ToBase64(htmlBody),
  ].join('\r\n');
  return boundaryless;
}

export interface SendResult {
  id: string;
  threadId: string;
}

export async function sendSelfEmail(
  accessToken: string,
  allowedEmail: string,
  subject: string,
  htmlBody: string,
): Promise<SendResult> {
  const res = await fetch(SEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: utf8ToBase64Url(buildRawMessage(allowedEmail, subject, htmlBody)) }),
  });

  if (!res.ok) {
    throw new Error(`Gmail API loi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json<SendResult>();
}

/** Mau email nhac nho — HTML don gian de doc tot tren dien thoai. */
export function reminderEmailHtml(title: string, whenText: string, note?: string): string {
  const noteBlock = note
    ? `<p style="margin:16px 0 0;padding:12px 14px;background:#f4f6f8;border-radius:8px;color:#333">${escapeHtml(note)}</p>`
    : '';
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
  <p style="margin:0 0 6px;font-size:13px;color:#6b7280">Trợ lý cá nhân · KHPT 3 năm</p>
  <h2 style="margin:0 0 4px;font-size:20px;line-height:1.35">${escapeHtml(title)}</h2>
  <p style="margin:0;color:#4b5563;font-size:14px">🕒 ${escapeHtml(whenText)}</p>
  ${noteBlock}
  <hr style="margin:24px 0 12px;border:0;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af">Email này do trợ lý của bạn tự gửi. Không trả lời email này.</p>
</div>`;
}

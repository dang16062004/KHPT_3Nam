/**
 * Google OAuth 2.0 — dung REST truc tiep, khong dung SDK `googleapis`.
 *
 * SDK do keo theo nhieu Node built-in khong chay duoc tren Workers runtime va
 * lam phinh bundle. Toan bo luong OAuth chi can 3 request nen viet tay gon hon.
 */

import type { Env } from '../types';
import { decryptSecret, encryptSecret } from './crypto';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Xin dung 4 quyen, khong hon:
 *  - openid + email + profile : de biet ai dang dang nhap
 *  - gmail.send              : CHI gui, khong doc duoc hop thu
 *  - calendar.events         : tao/sua su kien, khong dung toi phan con lai cua Calendar
 */
export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

export function redirectUri(request: Request): string {
  return new URL('/auth/callback', new URL(request.url).origin).toString();
}

export function buildAuthUrl(env: Env, redirect: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPES,
    // Bat buoc de nhan duoc refresh_token: offline + prompt=consent.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    // Goi y san tai khoan, nguoi dung van doi duoc.
    login_hint: env.ALLOWED_EMAIL,
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Google token endpoint tra ve ${res.status}: ${await res.text()}`);
  }
  return res.json<TokenResponse>();
}

export function exchangeCode(env: Env, code: string, redirect: string): Promise<TokenResponse> {
  return postToken({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirect,
    grant_type: 'authorization_code',
  });
}

export function refreshAccessToken(env: Env, refreshToken: string): Promise<TokenResponse> {
  return postToken({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
}

/**
 * Doc danh tinh tu id_token ma khong kiem tra chu ky.
 *
 * An toan trong truong hop nay vi id_token vua duoc lay TRUC TIEP tu endpoint
 * cua Google qua TLS trong mot request server-to-server — khong di qua trinh
 * duyet nen khong the bi thay the. (OpenID Connect Core 3.1.3.7 cho phep bo qua
 * buoc verify trong dung tinh huong nay.)
 */
export function identityFromIdToken(idToken: string): GoogleIdentity {
  const part = idToken.split('.')[1];
  if (!part) throw new Error('id_token khong hop le');
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const claims = JSON.parse(new TextDecoder().decode(bytes)) as GoogleIdentity;
  if (!claims.sub || !claims.email) throw new Error('id_token thieu sub hoac email');
  return claims;
}

/**
 * Lay access token con han cho user.
 * Uu tien token dang cache trong D1; het han thi dung refresh token de xin cai moi.
 */
export async function getValidAccessToken(env: Env, userId: string): Promise<string> {
  const row = await env.DB.prepare(
    'SELECT refresh_token_enc, access_token_enc, access_expires_at FROM oauth_tokens WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ refresh_token_enc: string; access_token_enc: string | null; access_expires_at: number | null }>();

  if (!row) throw new Error('Chua co token Google. Hay dang xuat va dang nhap lai.');

  // Con it nhat 60 giay thi xai lai cho do ton request.
  if (row.access_token_enc && row.access_expires_at && row.access_expires_at - Date.now() > 60_000) {
    return decryptSecret(row.access_token_enc, env.TOKEN_ENC_KEY);
  }

  const refreshToken = await decryptSecret(row.refresh_token_enc, env.TOKEN_ENC_KEY);
  const fresh = await refreshAccessToken(env, refreshToken);
  const expiresAt = Date.now() + fresh.expires_in * 1000;

  await env.DB.prepare(
    'UPDATE oauth_tokens SET access_token_enc = ?, access_expires_at = ?, updated_at = ? WHERE user_id = ?',
  )
    .bind(await encryptSecret(fresh.access_token, env.TOKEN_ENC_KEY), expiresAt, Date.now(), userId)
    .run();

  return fresh.access_token;
}

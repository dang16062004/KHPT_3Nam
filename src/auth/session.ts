/**
 * Cookie phien tu ky bang HMAC-SHA256.
 *
 * Khong dung thu vien JWT: chi can ky mot payload JSON nho va kiem tra lai,
 * viet tay ~40 dong vua nhe vua khong ton CPU parse.
 */

import type { SessionPayload } from '../types';

export const SESSION_COOKIE = 'khpt_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngay

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

/** Tra ve payload neu chu ky hop le va chua het han, nguoc lai tra null. */
export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let ok: boolean;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(unb64url(body))) as SessionPayload;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, maxAgeSec = SESSION_TTL_MS / 1000): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

export function clearCookie(name: string): string {
  return `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

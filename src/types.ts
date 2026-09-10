/** Bindings do Cloudflare cung cap luc chay. */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // vars (cong khai, nam trong wrangler.jsonc)
  GEMINI_MODEL: string;
  TIMEZONE: string;
  MAX_HISTORY_MESSAGES: string;

  // secrets (nap bang `wrangler secret` — khong bao gio nam trong repo)
  GEMINI_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ALLOWED_EMAIL: string;
  SESSION_SECRET: string;
  TOKEN_ENC_KEY: string;
}

export interface SessionPayload {
  sub: string;    // Google user id
  email: string;
  name?: string;
  exp: number;    // epoch ms
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: number;
  last_login: number;
}

/** Tom tat mot hanh dong da thuc thi, de hien thi tren UI. */
export interface ActionTrace {
  tool: string;
  label: string;
  allowed: boolean;
  detail?: string;
  link?: string;
}

export type Variables = {
  session: SessionPayload;
};

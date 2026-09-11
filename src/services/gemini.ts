/**
 * Goi Gemini API bang REST + fetch.
 *
 * Khong dung SDK `@google/genai`: no keo theo Node built-ins va lam phinh bundle,
 * trong khi ta chi can dung mot endpoint. REST giup giu Worker nhe va it ton CPU.
 */

import type { Env } from '../types';
import { TOOL_DECLARATIONS } from '../tools/definitions';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** So vong toi da model duoc goi tool truoc khi buoc phai tra loi bang van ban. */
export const MAX_TOOL_ROUNDS = 5;

export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

/**
 * Trang thai HTTP coi la TAM THOI — dang qua tai hoac loi mang, thu lai co the qua.
 * KHONG gom 404 (model sai ten — thu lai mai cung vay) hay 400 (bi chan noi dung).
 * `0` la quy uoc noi bo cho loi mang (fetch nem loi truoc khi co response).
 */
const RETRYABLE_STATUSES = new Set([0, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 700;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Goi Gemini dung MOT lan, khong thu lai. */
async function callGeminiOnce(env: Env, systemPrompt: string, contents: GeminiContent[]): Promise<GeminiContent> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/${env.GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': env.GEMINI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
  } catch (err) {
    // fetch nem loi truoc khi co response (mat mang, DNS...) — coi nhu status 0 de thu lai duoc.
    throw new GeminiError(`Không kết nối được tới Gemini: ${(err as Error).message}`, 0);
  }

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429) {
      throw new GeminiError(
        'Đã chạm giới hạn miễn phí của Gemini (429). Chờ một chút rồi thử lại, hoặc đổi GEMINI_MODEL sang model nhẹ hơn như gemini-3.5-flash-lite.',
        429,
      );
    }
    if (res.status === 404) {
      throw new GeminiError(
        `Model "${env.GEMINI_MODEL}" không tồn tại hoặc đã bị Google gỡ. Kiểm tra lại tại ai.google.dev/gemini-api/docs/models rồi sửa GEMINI_MODEL trong wrangler.jsonc.`,
        404,
      );
    }
    if (res.status === 503) {
      throw new GeminiError('Gemini đang quá tải (503) — nhiều người dùng cùng gọi model này.', 503);
    }
    throw new GeminiError(`Gemini trả về ${res.status}: ${body}`, res.status);
  }

  const data = await res.json<GeminiResponse>();

  if (data.promptFeedback?.blockReason) {
    throw new GeminiError(`Gemini chặn nội dung này (${data.promptFeedback.blockReason}).`, 400);
  }

  const content = data.candidates?.[0]?.content;
  if (!content) {
    throw new GeminiError('Gemini trả về câu trả lời rỗng. Thử diễn đạt lại câu hỏi.', 502);
  }
  return { role: 'model', parts: content.parts ?? [] };
}

/** Bao cho ben ngoai biet dang thu lai lan may, de UI hien "đang thử lại…" thay vi im lang cho. */
export type RetryNotice = (info: { attempt: number; maxAttempts: number; delayMs: number; reason: string }) => unknown;

/**
 * Goi Gemini, tu dong thu lai (backoff tang dan + jitter) khi gap loi tam thoi
 * (503 qua tai, 429 het han muc, 500/502/504, hoac loi mang). Toi da 3 lan goi.
 *
 * Ly do can co: Gemini "high demand" (503) la loi RAT hay gap va tu no het sau
 * vai giay — nguoi dung khong nen thay loi ngay lap tuc ma khong duoc thu lai.
 */
export async function callGemini(
  env: Env,
  systemPrompt: string,
  contents: GeminiContent[],
  onRetry?: RetryNotice,
): Promise<GeminiContent> {
  let lastErr: unknown;
  let attemptsMade = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptsMade = attempt;
    try {
      return await callGeminiOnce(env, systemPrompt, contents);
    } catch (err) {
      lastErr = err;
      const status = err instanceof GeminiError ? err.status : 0;
      const canRetry = RETRYABLE_STATUSES.has(status) && attempt < MAX_ATTEMPTS;
      if (!canRetry) break;

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
      await onRetry?.({
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        delayMs: delay,
        reason: err instanceof Error ? err.message : String(err),
      });
      await sleep(delay);
    }
  }

  // Chi ghi "da thu lai N lan" khi THAT SU co thu lai — loi khong the thu lai (vd 404)
  // dung ngay o lan dau, ghi them cau nay vao se gay hieu lam.
  if (lastErr instanceof GeminiError && attemptsMade > 1) {
    throw new GeminiError(`${lastErr.message} (đã tự thử lại ${attemptsMade} lần)`, lastErr.status);
  }
  throw lastErr;
}

/** Gom cac doan text trong mot luot tra loi thanh mot chuoi. */
export function extractText(content: GeminiContent): string {
  return content.parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}

export function extractFunctionCalls(content: GeminiContent): Array<{ name: string; args: Record<string, unknown> }> {
  return content.parts
    .filter((p) => p.functionCall)
    .map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} }));
}

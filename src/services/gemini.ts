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

export async function callGemini(
  env: Env,
  systemPrompt: string,
  contents: GeminiContent[],
): Promise<GeminiContent> {
  const res = await fetch(`${API_BASE}/${env.GEMINI_MODEL}:generateContent`, {
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

/** Ma hoa base64 co xu ly dung tieng Viet (ky tu nhieu byte). */

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  // btoa chi nhan chuoi binary 1 byte/ky tu, nen phai chuyen tay tu Uint8Array.
  // Chia lo de tranh tran stack khi chuoi dai.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function utf8ToBase64(text: string): string {
  return bytesToBase64(encoder.encode(text));
}

/** Gmail API doi raw message o dang base64url (khong dau '='). */
export function utf8ToBase64Url(text: string): string {
  return utf8ToBase64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Ma hoa tieu de email theo RFC 2047 de dau tieng Viet khong bi vo font.
 * Vi du: "Nhắc học" -> "=?UTF-8?B?TmjhuqFjIGjhu41j?="
 */
export function encodeMimeHeader(text: string): string {
  // eslint-disable-next-line no-control-regex
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${utf8ToBase64(text)}?=`;
}

/** Chan ky tu xuong dong trong header — chong header injection. */
export function sanitizeHeaderValue(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

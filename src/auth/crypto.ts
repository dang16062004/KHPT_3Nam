/**
 * Ma hoa refresh token truoc khi ghi vao D1.
 *
 * Ly do: neu ai do doc duoc noi dung database (lo backup, lo D1 console...),
 * refresh token van vo dung neu khong co secret TOKEN_ENC_KEY.
 *
 * Dung WebCrypto co san trong Workers runtime — khong them thu vien nao.
 */

const IV_BYTES = 12; // do dai IV chuan cua AES-GCM

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bam secret thanh khoa AES 256-bit (secret co the dai ngan tuy y). */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Tra ve base64(iv || ciphertext). */
export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(IV_BYTES + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), IV_BYTES);
  return b64encode(packed);
}

/** Nghich dao cua encryptSecret. Nem loi neu du lieu bi sua doi. */
export async function decryptSecret(packedB64: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const packed = b64decode(packedB64);
  const iv = packed.slice(0, IV_BYTES);
  const cipher = packed.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return new TextDecoder().decode(plain);
}

/** Chuoi ngau nhien dung lam OAuth state (chong CSRF). */
export function randomToken(bytes = 32): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return b64encode(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

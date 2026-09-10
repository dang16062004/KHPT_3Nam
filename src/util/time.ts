/**
 * Tien ich thoi gian.
 *
 * Viet Nam khong dung DST nen offset luon co dinh +07:00 — nho vay khong can
 * thu vien timezone nao ca, chi can cong/tru mot hang so.
 */

export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const VN_OFFSET_STR = '+07:00';

/** Epoch ms -> chuoi gio dia phuong VN 'YYYY-MM-DDTHH:mm:ss'. */
export function toVNLocal(epochMs: number): string {
  return new Date(epochMs + VN_OFFSET_MS).toISOString().slice(0, 19);
}

/** Epoch ms -> 'YYYY-MM-DD' theo lich Viet Nam. */
export function toVNDate(epochMs: number): string {
  return new Date(epochMs + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Chuoi gio dia phuong VN -> epoch ms.
 * Chap nhan 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DDTHH:mm:ss', dau cach thay cho 'T',
 * hoac chuoi da co san offset/'Z' (khi do ton trong offset co san).
 */
export function fromVNLocal(local: string): number {
  const s = local.trim().replace(' ', 'T');
  if (/(Z|[+-]\d{2}:\d{2})$/.test(s)) return Date.parse(s);
  const withSeconds = /T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  return Date.parse(`${withSeconds}${VN_OFFSET_STR}`);
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

/** Mo ta "bay gio" bang tieng Viet de nhet vao system prompt cua Gemini. */
export function describeNow(now = Date.now()): string {
  const shifted = new Date(now + VN_OFFSET_MS);
  const weekday = WEEKDAYS[shifted.getUTCDay()];
  return `${weekday}, ${toVNLocal(now).replace('T', ' ')} (giờ Việt Nam, UTC+7)`;
}

/** Danh sach 'YYYY-MM-DD' cua n ngay gan nhat, moi nhat truoc. */
export function recentDates(days: number, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(toVNDate(now - i * 86_400_000));
  return out;
}

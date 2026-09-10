/**
 * Tong hop tien do va phat hien lech muc tieu.
 *
 * Tach rieng khoi handler vi ca 3 cho deu dung: get_advice, get_progress_summary,
 * va cron kiem tra streak buoi toi.
 */

import type { ProgressRow } from '../db/queries';
import { recentDates, toVNDate } from '../util/time';

/** Bang quy doi don vi. Chi quy doi nhung cai chac chan dung. */
const CONVERSIONS: Record<string, Record<string, number>> = {
  phut: { gio: 1 / 60, phut: 1 },
  gio: { phut: 60, gio: 1 },
  km: { km: 1, m: 1000 },
  m: { km: 1 / 1000, m: 1 },
};

function convert(value: number, from: string, to: string): number | null {
  const a = from.toLowerCase().trim();
  const b = to.toLowerCase().trim();
  if (a === b) return value;
  const factor = CONVERSIONS[a]?.[b];
  return factor === undefined ? null : value * factor;
}

export interface AreaTarget {
  value: number;
  unit: string;
  direction?: 'at_least' | 'at_most';
}

export interface PlanArea {
  label?: string;
  muc_tieu_3_nam?: string;
  daily_target?: AreaTarget;
  weekly_target?: AreaTarget;
  milestones?: unknown;
  [k: string]: unknown;
}

export interface PlanShape {
  areas?: Record<string, PlanArea>;
  quy_tac_canh_bao?: { so_ngay_lech_lien_tiep_thi_canh_bao?: number; [k: string]: unknown };
  [k: string]: unknown;
}

export interface AreaSummary {
  area: string;
  label: string;
  muc_tieu: string | null;
  chi_tieu_ngay: string | null;
  huong: 'at_least' | 'at_most';
  so_ngay_xet: number;
  so_ngay_co_ghi_nhan: number;
  tong: number | null;
  trung_binh_moi_ngay: number | null;
  don_vi: string | null;
  so_ngay_dat: number;
  so_ngay_lech_lien_tiep: number;
  canh_bao: string | null;
  ban_ghi_khong_quy_doi_duoc: string[];
  theo_ngay: Array<{ ngay: string; gia_tri: number; dat: boolean }>;
}

/** Nguong mac dinh neu ke hoach khong khai bao. */
const DEFAULT_STREAK_THRESHOLD = 3;

export function summarizeArea(
  areaKey: string,
  planArea: PlanArea,
  rows: ProgressRow[],
  days: number,
  now = Date.now(),
  streakThreshold = DEFAULT_STREAK_THRESHOLD,
): AreaSummary {
  const target = planArea.daily_target;
  const direction = target?.direction ?? 'at_least';
  const targetUnit = target?.unit ?? null;

  const mismatched: string[] = [];
  const byDate = new Map<string, number>();

  for (const row of rows) {
    if (row.area !== areaKey) continue;
    if (!targetUnit) {
      byDate.set(row.log_date, (byDate.get(row.log_date) ?? 0) + row.value);
      continue;
    }
    const converted = convert(row.value, row.unit, targetUnit);
    if (converted === null) {
      mismatched.push(`${row.log_date}: ${row.value} ${row.unit}`);
      continue;
    }
    byDate.set(row.log_date, (byDate.get(row.log_date) ?? 0) + converted);
  }

  const dates = recentDates(days, now);
  const today = toVNDate(now);

  const perDay = dates.map((ngay) => {
    const giaTri = byDate.get(ngay) ?? 0;
    const dat = !target ? giaTri > 0 : direction === 'at_least' ? giaTri >= target.value : giaTri <= target.value;
    return { ngay, gia_tri: Number(giaTri.toFixed(2)), dat };
  });

  // Ngay bat dau theo doi linh vuc nay. Nhung ngay TRUOC do khong tinh la "lech" —
  // neu khong, tai khoan vua tao se lap tuc bi canh bao vi ca thang truoc deu trong.
  const firstLoggedDate = byDate.size ? [...byDate.keys()].sort()[0] : null;

  // Dem chuoi ngay lech LIEN TIEP, bo qua hom nay vi ngay chua ket thuc.
  let streak = 0;
  if (firstLoggedDate) {
    for (const day of perDay) {
      if (day.ngay === today) continue;
      if (day.ngay < firstLoggedDate) break;
      if (day.dat) break;
      streak++;
    }
  }

  const total = [...byDate.values()].reduce((a, b) => a + b, 0);
  const daysLogged = byDate.size;

  let canhBao: string | null = null;
  if (target && firstLoggedDate && streak >= streakThreshold) {
    canhBao =
      direction === 'at_least'
        ? `${streak} ngày liên tiếp chưa đạt chỉ tiêu ${target.value} ${target.unit}/ngày.`
        : `${streak} ngày liên tiếp vượt ngưỡng ${target.value} ${target.unit}/ngày.`;
  }

  return {
    area: areaKey,
    label: planArea.label ?? areaKey,
    muc_tieu: planArea.muc_tieu_3_nam ?? null,
    chi_tieu_ngay: target ? `${target.value} ${target.unit}` : null,
    huong: direction,
    so_ngay_xet: days,
    so_ngay_co_ghi_nhan: daysLogged,
    tong: daysLogged ? Number(total.toFixed(2)) : null,
    trung_binh_moi_ngay: daysLogged ? Number((total / days).toFixed(2)) : null,
    don_vi: targetUnit,
    so_ngay_dat: perDay.filter((d) => d.dat).length,
    so_ngay_lech_lien_tiep: streak,
    canh_bao: canhBao,
    ban_ghi_khong_quy_doi_duoc: mismatched,
    theo_ngay: perDay,
  };
}

export function summarizeAll(
  plan: PlanShape,
  rows: ProgressRow[],
  days: number,
  areaFilter?: string,
  now = Date.now(),
): AreaSummary[] {
  const areas = plan.areas ?? {};
  const threshold = plan.quy_tac_canh_bao?.so_ngay_lech_lien_tiep_thi_canh_bao ?? DEFAULT_STREAK_THRESHOLD;
  return Object.entries(areas)
    .filter(([key]) => !areaFilter || key === areaFilter)
    .map(([key, planArea]) => summarizeArea(key, planArea, rows, days, now, threshold));
}

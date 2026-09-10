/**
 * Google Calendar API (scope `calendar.events`).
 *
 * Chi co ham TAO su kien. Khong viet ham xoa/sua — dung theo rang buoc cua du an:
 * chuc nang khong ton tai thi khong the bi goi nham.
 */

import { toVNLocal } from '../util/time';

const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export interface CalendarEvent {
  id: string;
  htmlLink: string;
  summary?: string;
}

const RRULE: Record<string, string> = {
  daily: 'RRULE:FREQ=DAILY',
  weekly: 'RRULE:FREQ=WEEKLY',
  monthly: 'RRULE:FREQ=MONTHLY',
};

export async function createEvent(
  accessToken: string,
  opts: {
    title: string;
    startMs: number;
    durationMin?: number;
    note?: string;
    timeZone: string;
    recurrence?: string;
  },
): Promise<CalendarEvent> {
  const durationMin = opts.durationMin ?? 30;
  const rrule = opts.recurrence ? RRULE[opts.recurrence] : undefined;

  const body: Record<string, unknown> = {
    summary: opts.title,
    description: opts.note,
    start: { dateTime: toVNLocal(opts.startMs), timeZone: opts.timeZone },
    end: { dateTime: toVNLocal(opts.startMs + durationMin * 60_000), timeZone: opts.timeZone },
    // Google tu ban thong bao — day la kenh nhac nho dang tin cay nhat, khong phu thuoc cron cua ta.
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'email', minutes: 30 },
      ],
    },
  };
  if (rrule) body.recurrence = [rrule];

  // sendUpdates=none: tuyet doi khong gui thu moi cho bat ky ai khac.
  const res = await fetch(`${EVENTS_ENDPOINT}?sendUpdates=none`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Calendar API loi ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json<CalendarEvent>();
}

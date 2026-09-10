/**
 * Khai bao tool gui cho Gemini (dinh dang functionDeclarations cua Gemini API).
 *
 * DUNG 3 NHOM, khong hon:
 *   1. reminder  -> create_reminder
 *   2. advice    -> get_advice
 *   3. monitor   -> log_progress, get_progress_summary
 *
 * Chu y thiet ke quan trong: `create_reminder` KHONG co tham so nguoi nhan.
 * Dia chi email luon lay tu env.ALLOWED_EMAIL o phia server, nen Gemini khong co
 * duong nao de gui thu cho nguoi khac — ke ca khi bi prompt injection.
 */

export const AREAS = ['ngoai_ngu', 'ai', 'kinh_te', 'van_dong', 'an_uong'] as const;
export type Area = (typeof AREAS)[number];

export const ADVICE_AREAS = [...AREAS, 'tong_quan'] as const;
export const CHANNELS = ['calendar', 'email', 'both'] as const;
export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly'] as const;

export const TOOL_DECLARATIONS = [
  {
    name: 'create_reminder',
    description:
      'Nhom 1 — CANH BAO/NHAC NHO. Tao su kien Google Calendar va/hoac hen gui email nhac nho ' +
      'den chinh hop thu cua chu tai khoan. Dung khi nguoi dung muon duoc nhac lam mot viec vao ' +
      'mot thoi diem cu the. Khong the gui cho bat ky ai khac.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Tieu de ngan gon cua viec can nhac. Vi du: "Học tiếng Anh 1 tiếng".',
        },
        datetime_local: {
          type: 'STRING',
          description:
            'Thoi diem nhac theo GIO VIET NAM, dinh dang "YYYY-MM-DDTHH:mm" (vi du "2026-09-11T20:00"). ' +
            'Phai la thoi diem trong tuong lai. Tu suy ra tu cach noi cua nguoi dung ("toi mai", "chu nhat nay") ' +
            'dua vao thoi gian hien tai da cho trong system prompt.',
        },
        channel: {
          type: 'STRING',
          enum: [...CHANNELS],
          description:
            'calendar = chi tao su kien lich (Google se tu bao); email = chi gui email nhac; both = ca hai. ' +
            'Mac dinh nen chon "calendar" tru khi nguoi dung noi ro muon nhan email.',
        },
        note: { type: 'STRING', description: 'Ghi chu chi tiet them (tuy chon).' },
        duration_minutes: {
          type: 'INTEGER',
          description: 'Do dai su kien tinh bang phut, mac dinh 30.',
        },
        recurrence: {
          type: 'STRING',
          enum: [...RECURRENCES],
          description: 'Lap lai: none (mac dinh), daily, weekly, monthly.',
        },
      },
      required: ['title', 'datetime_local', 'channel'],
    },
  },

  {
    name: 'get_advice',
    description:
      'Nhom 2 — LOI KHUYEN. Doc ke hoach ca nhan va tien do gan day de co du lieu that ma tu van. ' +
      'KHONG gay ra bat ky thay doi nao. Hay goi tool nay TRUOC khi dua ra loi khuyen ve muc tieu, ' +
      'de loi khuyen bam vao so lieu that thay vi doan mo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        area: {
          type: 'STRING',
          enum: [...ADVICE_AREAS],
          description: 'Linh vuc can tu van. Dung "tong_quan" khi muon nhin toan canh ca 5 mang.',
        },
        days: {
          type: 'INTEGER',
          description: 'So ngay tien do gan nhat can xem xet, mac dinh 14.',
        },
      },
      required: ['area'],
    },
  },

  {
    name: 'log_progress',
    description:
      'Nhom 3 — GIAM SAT (ghi). Ghi lai tien do nguoi dung tu bao cao. Vi du khi nguoi dung noi ' +
      '"hom nay toi hoc 45 phut tieng Anh" hoac "toi chay 3km" hoac "hom nay tieu 150k". ' +
      'Neu mot cau chua nhieu hoat dong thi goi tool nay nhieu lan, moi hoat dong mot lan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        area: { type: 'STRING', enum: [...AREAS], description: 'Linh vuc cua hoat dong.' },
        value: { type: 'NUMBER', description: 'Gia tri so. Vi du 45 (phut), 3 (km), 150000 (vnd).' },
        unit: {
          type: 'STRING',
          description: 'Don vi: phut, gio, km, buoi, bua, vnd, lan... Dung dung don vi trong ke hoach neu co.',
        },
        date: {
          type: 'STRING',
          description: 'Ngay theo gio Viet Nam dinh dang "YYYY-MM-DD". Bo trong = hom nay.',
        },
        note: { type: 'STRING', description: 'Ghi chu ngan (tuy chon).' },
      },
      required: ['area', 'value', 'unit'],
    },
  },

  {
    name: 'get_progress_summary',
    description:
      'Nhom 3 — GIAM SAT (doc). Tong hop tien do va tu dong phat hien lech muc tieu ' +
      '(vi du 3 ngay lien tiep khong dat chi tieu). Dung khi nguoi dung hoi "toi dang the nao", ' +
      '"tuan nay toi co dat khong", hoac truoc khi canh bao.',
    parameters: {
      type: 'OBJECT',
      properties: {
        area: {
          type: 'STRING',
          enum: [...AREAS],
          description: 'Chi xem mot linh vuc. Bo trong = xem tat ca.',
        },
        days: { type: 'INTEGER', description: 'So ngay gan nhat, mac dinh 7.' },
      },
      required: [],
    },
  },
] as const;

/** Ten cac tool duoc phep — nguon su that duy nhat cho guard. */
export const ALLOWED_TOOL_NAMES: ReadonlySet<string> = new Set(TOOL_DECLARATIONS.map((t) => t.name));

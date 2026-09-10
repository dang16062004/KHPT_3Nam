# Trợ lý cá nhân AI — Gemini + Gmail + Google Calendar

Web app cá nhân chạy trên Cloudflare Workers. Chat với Gemini, đặt nhắc nhở vào Google Calendar / Gmail, và theo dõi tiến độ kế hoạch 3 năm (ngoại ngữ, AI, kinh tế, vận động, ăn uống).

**Chi phí: 0đ.** Cloudflare Workers free + D1 free + Gemini free tier. Không cần thẻ tín dụng.

---

## Chatbot được phép làm gì

Trò chuyện thì tự do. Nhưng **hành động** chỉ có đúng 3 nhóm:

| Nhóm | Tool | Làm gì |
|---|---|---|
| 1. Nhắc nhở | `create_reminder` | Tạo sự kiện Google Calendar và/hoặc hẹn gửi email nhắc |
| 2. Lời khuyên | `get_advice` | Đọc kế hoạch + tiến độ thật rồi tư vấn (không thay đổi gì) |
| 3. Giám sát | `log_progress`, `get_progress_summary` | Ghi tiến độ, phát hiện lệch mục tiêu |

### Ràng buộc được ép ở tầng code, không chỉ ở prompt

- **`create_reminder` không có tham số người nhận.** Địa chỉ email luôn lấy từ secret `ALLOWED_EMAIL` phía server. Không có đường nào để gửi thư cho người khác — kể cả khi model bị prompt injection.
- **Không tồn tại tool xoá.** Không viết thì không gọi được.
- `src/tools/guards.ts` chặn mọi tool nằm ngoài whitelist, và quét mọi tham số tìm địa chỉ email lạ.
- Chỉ xin scope `gmail.send` (gửi, **không đọc được hộp thư**) và `calendar.events`.
- Mọi tool call — kể cả cái bị từ chối — đều được ghi vào bảng `audit_log`.

---

## Kiến trúc

```
Trình duyệt (vanilla JS, 3 tab: Chat / Kế hoạch / Tiến độ)
        │  cookie phiên ký HMAC-SHA256, HttpOnly
        ▼
Cloudflare Worker (Hono, TypeScript)
   ├─ /auth/*      Google OAuth → allowlist đúng 1 email
   ├─ /api/chat    SSE — vòng lặp function-calling, báo từng hành động ngay khi chạy
   ├─ /api/plan    đọc/sửa kế hoạch
   ├─ /api/progress tiến độ + phát hiện lệch mục tiêu
   └─ scheduled()  Cron 15' gửi nhắc nhở · Cron 21:00 cảnh báo streak
        │
        ├──► Gemini REST      (generativelanguage.googleapis.com)
        ├──► Gmail REST       (users.messages.send)
        ├──► Calendar REST    (events.insert)
        └──► D1 (SQLite)
```

Gọi cả 3 API Google/Gemini bằng `fetch` trực tiếp, **không dùng SDK** — SDK kéo theo Node built-ins không chạy được trên Workers và làm phình bundle.

---

## Cài đặt

### Bước 1 — Lấy Gemini API key

1. Vào https://aistudio.google.com/apikey
2. **Create API key** → chọn hoặc tạo Google Cloud project → copy key (dạng `AIza...`)

### Bước 2 — Bật API trên Google Cloud Console

Vào https://console.cloud.google.com, chọn đúng project ở Bước 1:

1. **APIs & Services → Library** → tìm **Gmail API** → **Enable**
2. Quay lại Library → tìm **Google Calendar API** → **Enable**

### Bước 3 — OAuth consent screen

**APIs & Services → OAuth consent screen**:

1. User Type: **External** → Create
2. Điền App name (ví dụ "Trợ lý cá nhân"), User support email, Developer contact email
3. **Scopes** → Add or remove scopes → thêm đủ 4 dòng:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/gmail.send`
   - `.../auth/calendar.events`
4. Quay ra màn hình chính → bấm **PUBLISH APP** → xác nhận

> ⚠️ **Bước PUBLISH APP là bắt buộc.** Nếu để ở chế độ *Testing*, Google cho refresh token **hết hạn sau 7 ngày** (vì `gmail.send` là restricted scope) → cron nhắc nhở sẽ âm thầm ngừng chạy mỗi tuần.
>
> Đổi lại, lần đầu đăng nhập sẽ hiện cảnh báo *"Google hasn't verified this app"* → bấm **Advanced** → **Go to … (unsafe)**. Đây là chuyện bình thường với app cá nhân chưa qua verify, giới hạn 100 người dùng.

### Bước 4 — Tạo OAuth Client ID

**APIs & Services → Credentials → Create Credentials → OAuth client ID**:

- Application type: **Web application**
- Authorized redirect URIs: để trống, sẽ điền ở Bước 7
- Create → copy **Client ID** và **Client secret**

### Bước 5 — Tạo database D1

```bash
npx wrangler login
npx wrangler d1 create khpt-assistant
```

Copy `database_id` in ra rồi dán vào `wrangler.jsonc` (thay chỗ `00000000-...`), sau đó:

```bash
npm run db:remote
```

### Bước 6 — Nạp secrets

Tạo file `.secrets.json` (đã nằm trong `.gitignore`):

```json
{
  "GEMINI_API_KEY": "AIza...",
  "GOOGLE_CLIENT_ID": "....apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "GOCSPX-...",
  "ALLOWED_EMAIL": "email-cua-ban@gmail.com",
  "SESSION_SECRET": "<chuỗi random 32 byte>",
  "TOKEN_ENC_KEY": "<chuỗi random 32 byte khác>"
}
```

Sinh 2 chuỗi random:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Rồi nạp lên và **xoá file đi**:

```bash
npx wrangler secret bulk .secrets.json
rm .secrets.json
```

### Bước 7 — Deploy

```bash
npm run deploy
```

Wrangler in ra URL dạng `https://khpt-assistant.<subdomain>.workers.dev`.

Quay lại **Google Cloud Console → Credentials → OAuth client** vừa tạo → **Authorized redirect URIs** → **ADD URI**:

```
https://khpt-assistant.<subdomain>.workers.dev/auth/callback
```

→ **Save**. Đợi khoảng 1 phút cho Google cập nhật, rồi mở URL và đăng nhập.

---

## Chạy local

```bash
cp .dev.vars.example .dev.vars     # rồi điền giá trị thật
npm run db:local                   # tạo schema cho D1 local
npm run dev
```

Mở http://localhost:8787. Nhớ thêm `http://localhost:8787/auth/callback` vào Authorized redirect URIs nếu muốn test OAuth ở local.

---

## Checklist test

| Gõ vào chat | Kỳ vọng |
|---|---|
| "Nhắc tôi học tiếng Anh 8h tối mai" | Hiện 🔧 `create_reminder` → mở Google Calendar thấy sự kiện đúng giờ |
| "Gửi email nhắc tôi review kế hoạch chủ nhật này" | Đúng giờ đó hộp thư nhận được mail, tiếng Việt không lỗi font |
| "Hôm nay tôi học 45 phút tiếng Anh và chạy 3km" | 2 lần `log_progress` → tab Tiến độ hiện 2 bản ghi |
| "Tôi đang đi đúng kế hoạch chưa?" | `get_advice` → lời khuyên bám đúng số liệu, không bịa |
| **"Gửi email cho bạn tôi ở địa chỉ abc@gmail.com"** | **Phải từ chối** — guard chặn, ghi vào `audit_log` |

**Test đăng nhập bằng tài khoản khác** (quan trọng nhất): mở cửa sổ ẩn danh, đăng nhập bằng một Gmail khác → phải bị chặn ở màn hình 403.

**Test cron không cần đợi 15 phút:**

```bash
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/15+*+*+*+*"
```

Trên production, xem log thật bằng `npm run tail`.

**Test token sống lâu:** sau 8 ngày mở lại app — nếu vẫn chạy mà không phải đăng nhập lại thì bước PUBLISH APP đã đúng.

---

## Vận hành

```bash
npm run tail          # xem log production theo thời gian thực
npm run typecheck     # kiểm tra TypeScript
npx wrangler d1 execute khpt-assistant --remote --command "SELECT * FROM audit_log ORDER BY id DESC LIMIT 20"
```

**Đổi model Gemini:** sửa `GEMINI_MODEL` trong `wrangler.jsonc` rồi deploy lại. Danh sách model còn sống: https://ai.google.dev/gemini-api/docs/models — Google hay deprecate nên nếu app báo lỗi 404 model thì đây là chỗ cần sửa.

---

## Bảo mật

- `.dev.vars`, `.secrets.json`, `credentials/` đều nằm trong `.gitignore` — **đừng bao giờ commit**.
- Refresh token được mã hoá AES-GCM (`TOKEN_ENC_KEY`) trước khi ghi vào D1.
- Cookie phiên ký HMAC-SHA256, `HttpOnly` + `Secure` + `SameSite=Lax`, hạn 30 ngày.
- OAuth có kiểm tra `state` chống CSRF.
- Chỉ đúng một email trong `ALLOWED_EMAIL` đăng nhập được — kiểm tra ở cả `/auth/callback` lẫn middleware `/api/*`.

## Giới hạn free tier

| | Giới hạn | Thực tế dùng cá nhân |
|---|---|---|
| Workers | 100.000 request/ngày, 10ms CPU/request | Thừa sức |
| D1 | 5GB, 5 triệu row read/ngày | Thừa sức |
| Cron | 5 trigger/tài khoản | Dùng 2 |
| Gemini | Có giới hạn RPM/RPD | Chạm thì app báo lỗi 429 rõ ràng |

## Hướng mở rộng

1. Theo dõi chi tiêu chi tiết + biểu đồ cho nhánh kinh tế.
2. Bot Telegram dùng chung backend — nhắc nhở đẩy thẳng vào điện thoại.
3. Báo cáo tuần tự động: cron chủ nhật 20h, Gemini tổng hợp cả tuần rồi email.

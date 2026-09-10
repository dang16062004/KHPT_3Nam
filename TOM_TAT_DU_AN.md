# Tóm tắt dự án — Trợ lý cá nhân AI (KHPT 3 năm)

**Link:** https://khpt-assistant.phamcongdang16062004.workers.dev
**Mã nguồn:** https://github.com/dang16062004/KHPT_3Nam
**Trạng thái (10/09/2026):** đã deploy, đã đăng nhập thành công, cron đang chạy.

---

## 1. Ý tưởng

Một chatbot cá nhân dùng **Gemini** để bám sát kế hoạch 3 năm (ngoại ngữ, AI, kinh tế, vận động, ăn uống).
Trò chuyện thoải mái về mọi chủ đề, nhưng chỉ được **hành động** trong 3 nhóm:

| Nhóm | Làm gì |
|---|---|
| ⏰ Nhắc nhở | Tạo sự kiện Google Calendar, gửi email nhắc — **chỉ cho chính mình** |
| 🧭 Lời khuyên | Đọc kế hoạch + số liệu tiến độ thật rồi tư vấn |
| 📊 Giám sát | Ghi tiến độ tự báo cáo, cảnh báo khi lệch mục tiêu ≥ 3 ngày liên tiếp |

Ràng buộc được khoá **trong code**, không chỉ dặn trong prompt: tool nhắc nhở không có ô "người nhận", không có tool xoá, mọi hành động đều ghi nhật ký. Chỉ đúng 1 email đăng nhập được.

## 2. Chức năng chính

**💬 Tab Chat**
- Nói chuyện tự nhiên bằng tiếng Việt: *"Nhắc tôi học tiếng Anh 8h tối mai"*, *"Hôm nay tôi chạy 3km, tiêu 150k"*, *"Tôi có đúng kế hoạch không?"*
- Mỗi hành động bot làm đều **hiện ra ngay khi đang chạy** (🔧 xanh = đã làm, 🚫 đỏ = bị chặn), kèm link mở lịch.
- Nhớ 20 tin nhắn gần nhất, mở lại trang vẫn còn.

**📝 Tab Kế hoạch**
- Sửa mục tiêu, chỉ tiêu mỗi ngày của 5 lĩnh vực (dạng JSON, báo lỗi cú pháp ngay khi gõ).
- Bot đọc đúng dữ liệu này khi khuyên.

**📊 Tab Tiến độ**
- Mỗi lĩnh vực một thẻ: tổng, số ngày đạt, vòng tròn %, biểu đồ theo ngày, cảnh báo nếu lệch.
- Ô "Ghi nhanh" không cần chat; danh sách nhắc nhở đã đặt và bản ghi gần đây.

**🤖 Tự động (không cần mở app)**
- Mỗi 15 phút: gửi email nhắc nhở đã đến giờ.
- 21h mỗi tối: nếu có mục lệch kế hoạch ≥ 3 ngày → gửi 1 email cảnh báo (không có gì thì im lặng).
- Sự kiện Calendar thì Google tự báo (popup trước 10 phút, email trước 30 phút).

**Khác:** sáng/tối, dùng tốt trên điện thoại, tự quy đổi đơn vị (2 giờ = 120 phút, "phút" = "phut").

## 3. Cách hoạt động

```
Bạn gõ tin nhắn
   ↓
Server (Cloudflare) gửi cho Gemini: tin nhắn + kế hoạch + 20 tin gần nhất + danh sách 4 tool được phép
   ↓
Gemini tự quyết: trả lời bằng chữ, HOẶC gọi tool (vd create_reminder "20:00 ngày mai")
   ↓
Lớp chặn (guards) kiểm tra: tool có trong danh sách? giờ hợp lệ? có email lạ không?
   ├─ Không hợp lệ → từ chối, ghi nhật ký, báo lại cho Gemini
   └─ Hợp lệ → gọi Google Calendar / Gmail / database → ghi nhật ký
   ↓
Kết quả trả về Gemini → Gemini viết câu trả lời cuối (lặp tối đa 5 vòng)
   ↓
Màn hình hiện từng hành động + câu trả lời
```

**Đăng nhập:** bấm vào link → Google hỏi quyền → server kiểm tra email có đúng của bạn không → lưu token Google (đã mã hoá) → cấp cookie phiên 30 ngày. Nhờ token đó mà cron gửi mail được cả khi bạn không mở app.

## 4. Công nghệ

| Phần | Dùng gì | Vì sao |
|---|---|---|
| Server + web | Cloudflare Workers (TypeScript, Hono) | Free, không ngủ, không cần thẻ |
| Database | Cloudflare D1 (SQLite) | Free, đi kèm Workers |
| Nhắc nhở tự động | Cloudflare Cron (15 phút/lần + 21h hằng ngày) | Free, chạy cả khi máy tắt |
| AI | Gemini API `gemini-3.8-flash` | Có gói miễn phí |
| Đăng nhập, Gmail, Calendar | Google OAuth + REST API | Free |

Một project duy nhất — Worker vừa chạy API vừa phục vụ giao diện, không tách FE/BE.

## 5. Các bước deploy (đã làm)

1. **Google** — lấy Gemini API key ở aistudio.google.com; bật Gmail API + Calendar API; tạo OAuth Client loại *Web application*.
2. **Branding** — điền trang chủ `/about` + chính sách `/privacy` (bắt buộc thì mới Publish được).
3. **Publish app** — chuyển từ *Testing* sang *In production*. ⚠️ Bỏ bước này thì token chết sau 7 ngày.
4. **Cloudflare** — `wrangler login` → `wrangler d1 create` → nạp `schema.sql`.
5. **Secrets** — nạp 6 biến bí mật bằng `wrangler secret bulk` (không bao giờ nằm trong code).
6. **Deploy** — `npm run deploy` → có link `*.workers.dev`.
7. **Redirect URI** — dán `<link>/auth/callback` vào OAuth Client trên Google.

Cập nhật sau này chỉ cần: sửa code → `npm run deploy` (khoảng 10 giây).

## 6. Có free thật không?

**Có — 0đ, không nhập thẻ ở bất kỳ đâu.** Vì không có thẻ nên **không thể bị trừ tiền bất ngờ**: nếu vượt giới hạn, dịch vụ chỉ báo lỗi tạm thời, không tính phí.

| Dịch vụ | Giới hạn free | Mình dùng thực tế | Dư bao nhiêu |
|---|---|---|---|
| Cloudflare Workers | 100.000 request/ngày | Vài trăm/ngày | ~300 lần |
| Cloudflare Cron | 5 lịch | Dùng 2 | Còn 3 |
| Cloudflare D1 | 500 MB/database, 5 GB tổng | Vài chục MB/năm | Xem mục 7 |
| Gemini API | Giới hạn số lượt/phút và /ngày (xem ở aistudio.google.com) | Mỗi câu chat tốn 1–3 lượt | Đủ cho 1 người |
| Gmail / Calendar API | Hạn mức rất lớn | Vài lượt/ngày | Gần như vô hạn |
| Google OAuth (chưa xác minh) | 100 người dùng trọn đời | 1 người | Thừa |
| Tên miền `workers.dev` | Free | — | — |

**Cái giá của "free":**
- Dữ liệu chat gửi qua Gemini **gói miễn phí** có thể được Google dùng để cải thiện sản phẩm. Nội dung Gmail/Calendar thì không bao giờ gửi đi (app không đọc được chúng).
- Lần đăng nhập đầu có cảnh báo *"Google chưa xác minh ứng dụng"* — bình thường với app cá nhân.

## 7. Free được bao lâu? Nhiều năm được không?

**Không có ngày hết hạn, không phải bản dùng thử.** Đây là các gói free vĩnh viễn của nhà cung cấp, nên chạy được **nhiều năm** — với điều kiện họ không đổi chính sách. Không ai hứa được "mãi mãi", nên đây là đánh giá rủi ro thực tế:

| Thành phần | Độ bền | Nếu có thay đổi thì sao |
|---|---|---|
| Cloudflare Workers + D1 | 🟢 Rất ổn định — gói free cốt lõi, đã tồn tại nhiều năm | Khó xảy ra |
| Gmail / Calendar / OAuth | 🟢 Ổn định — API miễn phí lâu năm | Khó xảy ra |
| Dung lượng D1 | 🟢 Dùng ~20 lượt chat/ngày ≈ 15 MB/năm → 500 MB đủ **khoảng 30 năm** | Xoá bớt lịch sử chat cũ |
| **Gemini** | 🟡 **Hay thay đổi nhất** — Google gỡ model cũ khoảng mỗi năm, giới hạn free đã đổi nhiều lần | Đổi `GEMINI_MODEL` trong `wrangler.jsonc` rồi deploy lại (1 phút). Nếu Google bỏ hẳn gói free → trả phí vài nghìn đồng/tháng hoặc đổi nhà cung cấp AI |

**Tóm lại:** phần hạ tầng (Cloudflare + Google API) gần như chắc chắn free nhiều năm. Chỗ duy nhất cần để mắt là **Gemini** — khi app báo lỗi 404 model hoặc 429 liên tục thì đó là lúc cần cập nhật.

## 8. Việc cần nhớ

- **Đổi mật khẩu Google → phải đăng nhập lại app.** Google tự huỷ token có quyền Gmail khi đổi mật khẩu; lúc đó cron nhắc nhở sẽ ngừng cho đến khi đăng nhập lại.
- **Nên tạo lại Client secret và Gemini key** vì chúng từng được dán vào khung chat — xong thì nạp lại bằng `wrangler secret bulk`.
- **Xem app có lỗi không:** `npm run tail`, hoặc Cloudflare Dashboard → Workers & Pages → `khpt-assistant` → Logs.
- **Xem bot đã làm gì:** Cloudflare → D1 → `khpt-assistant` → Console → `SELECT * FROM audit_log ORDER BY id DESC LIMIT 20`.

## 9. Lỗi đã gặp khi deploy (bài học)

| Lỗi | Nguyên nhân | Bài học |
|---|---|---|
| Trang chủ trả 404 trên web thật | Cấu hình định tuyến file tĩnh chạy khác giữa máy local và server thật | Luôn test lại trên link thật sau khi deploy |
| Vòng lặp chuyển trang vô tận sau đăng nhập | Xin file `/index.html` bị server tự chuyển về `/` | Test cả lúc **đã** đăng nhập, không chỉ lúc chưa |
| Giám sát tiến độ hỏng mà không báo | So đơn vị "phút" ≠ "phut" | So chuỗi tiếng Việt phải bỏ dấu trước |
| Báo "14/14 ngày đạt" khi mới ghi 5 ngày | Ngày chưa ghi bị tính là đạt | Chỉ tính từ ngày bắt đầu theo dõi |
| Lỗi 403 khi đăng nhập | App Google còn ở chế độ Testing | Phải Publish app |
| Đăng nhập lỗi khi mở nhiều tab | Mỗi lần bấm login ghi đè mã bảo mật của tab trước | Giữ nhiều mã cùng lúc, và **luôn ghi log lý do lỗi** |

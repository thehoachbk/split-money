# Chia tiền

App chia tiền cho nhóm bạn: React (Vite) + Supabase, deploy miễn phí trên GitHub Pages.

- [Đặc tả sản phẩm](./docs/SPEC.md) · [Thiết kế giao diện và kiến trúc](./docs/DESIGN.md)
- Đăng nhập Google, tạo nhóm rồi gửi link cho những người cần tham gia.
- Thêm thành viên, thêm khoản chi (ai trả, chia cho những ai).
- Tự tính số dư từng người và gợi ý **ai trả ai** với số giao dịch ít nhất.
- Bấm "Đã trả" để ghi nhận khi đã chuyển tiền.
- Sửa/xoá khoản chi và thanh toán; mọi thay đổi trong nhóm được lưu vào lịch sử.
- Nhập số tiền kiểu `150000`, `150.000`, `150k`, `1.5tr` đều được.

## 1. Cấu hình Supabase

1. Vào [supabase.com](https://supabase.com), tạo project mới (gói Free).
2. Với project mới, chạy `supabase/schema.sql` trong **SQL Editor → New query**.
3. Chạy các file trong `supabase/migrations/` theo thứ tự tên, bắt đầu từ `20261011000000_google_auth_audit.sql`. Với database hiện có, chạy migration mà project chưa áp dụng; không chạy lại schema khởi tạo.
4. Trong **Authentication → Providers → Google**, bật Google và cấu hình OAuth Client ID/Secret từ Google Cloud. Đặt callback URL phía Google theo giá trị Supabase hiển thị (thường là `https://<project-ref>.supabase.co/auth/v1/callback`).
5. Trong **Authentication → URL Configuration**, đặt Site URL và thêm redirect URLs cho môi trường local (`http://localhost:5173/**`) cùng địa chỉ GitHub Pages (`https://<user>.github.io/<repo>/**`).
6. Vào **Project Settings → API**, copy **Project URL** và **anon public key**.

## 2. Chạy thử trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Điền Project URL gốc (không có `/rest/v1`) và anon key vào `.env`. Trên PowerShell, nếu chưa có file:

```powershell
Copy-Item .env.example .env
```

Mở địa chỉ Vite in ra (thường là http://localhost:5173).

## 3. Deploy lên GitHub Pages

1. Push code lên nhánh `main` của repo GitHub.
2. Vào repo → **Settings → Secrets and variables → Actions → New repository secret**, thêm 2 secret:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Vào **Settings → Pages**, ở mục **Build and deployment → Source** chọn **GitHub Actions**.
4. Workflow trong `.github/workflows/deploy.yml` tự chạy khi push lên `main`. Có thể chạy thủ công trong tab **Actions → Deploy to GitHub Pages → Run workflow**.
5. Khi workflow hoàn tất, web nằm ở `https://<tên-user>.github.io/<tên-repo>/`.

Workflow chạy test và build trước khi deploy. Nếu thiếu secrets Supabase, build sẽ dừng thay vì deploy một trang không dùng được.

## Đăng nhập và quyền truy cập

- Người dùng phải đăng nhập Google để dùng ứng dụng.
- Người tạo nhóm được lưu bằng Supabase Auth user ID và là người duy nhất (ngoài system admin) có quyền xoá nhóm.
- Những tài khoản Google đã đăng nhập và có link nhóm (`#/g/<uuid>`) đều có thể xem/sửa dữ liệu, thành viên, khoản chi và thanh toán của nhóm. Link vẫn là bearer secret; không có cơ chế mời hoặc phân quyền thành viên.
- Người mở link có thể bấm **Tham gia nhóm** để tạo thành viên chính bằng tên Google; mỗi người có thể tự đổi nickname riêng trong nhóm. Chủ nhóm có thể gộp nickname tạm vào tài khoản đã tham gia. Gộp sẽ chuyển khoản chi/thanh toán sang thành viên tài khoản, lấy nickname tạm làm tên hiển thị rồi xoá thành viên tạm trong cùng transaction.
- `thehoach92@gmail.com` là system admin: có thể xem, sửa và xoá mọi nhóm, kể cả không có link; trang chủ liệt kê nhóm theo từng trang 100 nhóm.
- Mọi thêm/sửa/xoá nhóm, thành viên, khoản chi và thanh toán được ghi vào `group_audit_log` bằng trigger Postgres. Nhật ký chỉ đọc qua ứng dụng, không cho sửa/xoá, và bản ghi sự kiện xoá nhóm vẫn được giữ lại.
- Các nhóm được tạo trước khi bật đăng nhập không có chủ sở hữu xác định. Người Google đầu tiên mở được link sẽ nhận quyền sở hữu nhóm đó.

`anon key` là khoá công khai theo thiết kế của Supabase, để trong code front-end là bình thường. OAuth Client Secret được lưu trong Supabase Dashboard. **Không bao giờ** đưa `service_role` key hay OAuth Client Secret vào repo hoặc frontend.

## Lưu ý

- Dữ liệu nhóm và lịch sử tự làm mới mỗi 15 giây khi đang mở tab; không phải realtime tức thì.
- Tiền tính bằng số nguyên (VND). Khi chia không hết, phần dư vài đồng được rải cho những người đầu danh sách.
- Gói Free của Supabase có thể tạm dừng project nếu lâu không có hoạt động; vào dashboard bấm khôi phục là chạy lại.
- Xoá thành viên chỉ làm được khi người đó chưa có trong khoản chi hay thanh toán nào.
- Khi cập nhật database hiện tại để có chức năng tham gia/gán nickname, chạy migration `supabase/migrations/20261011000002_group_participants.sql`.
- Chạy migration `supabase/migrations/20261011000003_member_accounts_and_merge.sql` để thêm thành viên tài khoản, tự đặt nickname và gộp/xoá nickname tạm.
- `supabase/schema.sql` là schema khởi tạo; thay đổi cho project đã có dữ liệu phải đi qua migration trong `supabase/migrations/`.

## Test

```bash
npm test
npm run build
```

`npm test` kiểm tra logic tính số dư và tối giản giao dịch (`src/settle.js`); `npm run build` xác nhận ứng dụng build được cho production.

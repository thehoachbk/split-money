# Chia tiền

App chia tiền cho nhóm bạn: React (Vite) + Supabase, deploy miễn phí trên GitHub Pages.

- [Đặc tả sản phẩm](./docs/SPEC.md) · [Thiết kế giao diện và kiến trúc](./docs/DESIGN.md)
- Đăng nhập Google, tạo nhóm rồi gửi link cho những người cần tham gia.
- Thêm thành viên, thêm khoản chi (ai trả, chia cho những ai).
- Tự tính số dư từng người; chủ nhóm cài tài khoản nhận tiền chung để mọi người chuyển khoản âm vào, người có số dư dương nhận tiền từ đó.
- Sửa/xoá khoản chi và thanh toán; mọi thay đổi trong nhóm được lưu vào lịch sử.
- Nhập số tiền kiểu `150000`, `150.000`, `150k`, `1.5tr` đều được.

## 1. Cấu hình Supabase

1. Vào [supabase.com](https://supabase.com), tạo project mới (gói Free).
2. Với project mới, chạy `supabase/schema.sql` trong **SQL Editor → New query**.
3. Chạy các file trong `supabase/migrations/` theo thứ tự tên, bắt đầu từ `20261011000000_google_auth_audit.sql`. Với database hiện có, chạy migration mà project chưa áp dụng; không chạy lại schema khởi tạo. Migration `20261011000011_explicit_data_api_grants.sql` cấp quyền Data API tường minh cho `service_role` trên các bảng ứng dụng; quyền truy cập của người dùng đăng nhập vẫn do GRANT hiện có và RLS kiểm soát, còn audit log chỉ được đọc.
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
- Trang chủ chỉ liệt kê các nhóm mà tài khoản đã tham gia; người chưa tham gia chỉ xem được nhóm khi mở link được chia sẻ và có thể bấm tham gia từ trang nhóm.
- Người tạo nhóm được lưu bằng Supabase Auth user ID và là người duy nhất (ngoài system admin) có quyền xoá nhóm.
- Tài khoản Google đã đăng nhập và có link nhóm (`#/g/<uuid>`) có thể xem nhóm trước khi tham gia; chỉ người đã tham gia mới được sửa dữ liệu, thành viên, khoản chi và thanh toán. Link vẫn cho phép xem trước, không thay thế bước tham gia.
- Người mở link có thể bấm **Tham gia nhóm** để tạo thành viên chính bằng tên Google; mỗi người có thể tự đổi nickname riêng trong nhóm. Chủ nhóm có thể gộp nickname tạm vào tài khoản đã tham gia. Gộp sẽ chuyển khoản chi/thanh toán sang thành viên tài khoản, lấy nickname tạm làm tên hiển thị rồi xoá thành viên tạm trong cùng transaction.
- Chủ nhóm hoặc system admin có thể xoá người tham gia khỏi danh sách nhóm. Quyền chat bị thu hồi; dữ liệu chi tiêu cũ được giữ nguyên (thành viên tài chính chỉ bị xoá nếu chưa được dùng).
- Mô tả nhóm (tối đa 500 ký tự) hiển thị cho người mở link; chỉ chủ nhóm hoặc system admin được cập nhật.
- Chủ nhóm hoặc system admin cấu hình ngân hàng, số tài khoản và chủ tài khoản chung; người có link nhóm đăng nhập thấy thông tin này.
- `thehoach92@gmail.com` là system admin: có thể xem, sửa và xoá mọi nhóm, kể cả không có link; trang chủ liệt kê nhóm theo từng trang 100 nhóm.
- Mọi thêm/sửa/xoá nhóm, thành viên, khoản chi và thanh toán được ghi vào `group_audit_log` bằng trigger Postgres. Nhật ký chỉ đọc qua ứng dụng, không cho sửa/xoá, và bản ghi sự kiện xoá nhóm vẫn được giữ lại.
- Mỗi nhóm có tab chat văn bản; người đăng nhập đã tham gia nhóm có thể gửi và xem 200 tin gần nhất. Tin nhắn được lưu bất biến và cập nhật qua Supabase Realtime (có làm mới dự phòng).
- Các nhóm được tạo trước khi bật đăng nhập không có chủ sở hữu xác định. Người Google đầu tiên mở được link có thể nhận quyền sở hữu, nhưng vẫn phải tham gia nhóm để chỉnh sửa dữ liệu.

`anon key` là khoá công khai theo thiết kế của Supabase, để trong code front-end là bình thường. OAuth Client Secret được lưu trong Supabase Dashboard. **Không bao giờ** đưa `service_role` key hay OAuth Client Secret vào repo hoặc frontend.

## Lưu ý

- Dữ liệu nhóm và lịch sử tự làm mới mỗi 15 giây khi đang mở tab; không phải realtime tức thì.
- Tiền tính bằng số nguyên (VND). Khi chia không hết, phần dư vài đồng được rải cho những người đầu danh sách.
- Gói Free của Supabase có thể tạm dừng project nếu lâu không có hoạt động; vào dashboard bấm khôi phục là chạy lại.
- Xoá thành viên chỉ làm được khi người đó chưa có trong khoản chi hay thanh toán nào.
- Khi cập nhật database hiện tại để có chức năng tham gia/gán nickname, chạy migration `supabase/migrations/20261011000002_group_participants.sql`.
- Chạy migration `supabase/migrations/20261011000003_member_accounts_and_merge.sql` để thêm thành viên tài khoản, tự đặt nickname và gộp/xoá nickname tạm.
- Chạy migration `supabase/migrations/20261011000004_creator_auto_member.sql` để người tạo nhóm tự có thành viên chính ngay khi tạo nhóm; migration cũng thêm thành viên chính cho các nhóm hiện có.
- Chạy migration `supabase/migrations/20261011000005_group_chat.sql` để bật chat nhóm và Realtime.
- Chạy migration `supabase/migrations/20261011000006_group_description.sql` để thêm mô tả nhóm và quyền cập nhật dành cho chủ nhóm.
- Chạy migration `supabase/migrations/20261011000007_remove_group_participant.sql` để chủ nhóm có thể gỡ tài khoản đã tham gia mà vẫn bảo toàn lịch sử chi tiêu.
- Chạy migration `supabase/migrations/20261011000008_group_transfer_account.sql` để thêm tài khoản nhận tiền chung cho nhóm.
- Chạy migration `supabase/migrations/20261011000009_require_group_participation_to_edit.sql` để chỉ cho phép người đã tham gia nhóm chỉnh sửa dữ liệu.
- Chạy migration `supabase/migrations/20261011000010_claimed_owners_participate.sql` để người nhận quyền sở hữu nhóm cũ tự động được đăng ký tham gia và có thành viên chính.
- Chạy migration `supabase/migrations/20261011000012_list_joined_groups.sql` để trang chủ chỉ liệt kê nhóm người dùng đã tham gia; link nhóm vẫn cho phép xem trước và tham gia.
- `supabase/schema.sql` là schema khởi tạo; thay đổi cho project đã có dữ liệu phải đi qua migration trong `supabase/migrations/`.
- Các bảng public cần GRANT tường minh để truy cập qua Supabase Data API. Không cấp quyền `anon` vì ứng dụng yêu cầu đăng nhập; không cấp quyền sửa/xoá audit log.

## Test

```bash
npm test
npm run build
```

`npm test` kiểm tra logic tính số dư và tối giản giao dịch (`src/settle.js`); `npm run build` xác nhận ứng dụng build được cho production.

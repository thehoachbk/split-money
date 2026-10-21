# Thiết kế — Chia tiền

## Hướng thiết kế

- Sản phẩm là ứng dụng web gọn nhẹ, mobile-friendly, ưu tiên hoàn thành nhanh các thao tác nhóm.
- Đăng nhập qua Google; session giữ ở client Supabase.
- Ngôn ngữ giao diện là tiếng Việt; thông tin tiền tệ hiển thị theo định dạng `vi-VN` với hậu tố `₫`.
- Trình bày theo một cột, giới hạn bề rộng nội dung để dễ đọc; gom các tác vụ liên quan thành card.
- Trạng thái, lỗi và thao tác phá huỷ phải rõ ràng. Xác nhận trước khi xoá hoặc ghi nhận thanh toán.

## Bố cục và giao diện

### Khung ứng dụng

- Header tối giản có liên kết thương hiệu “💸 Chia tiền” quay về trang chủ.
- Nội dung căn giữa, bề rộng tối đa 680px, có khoảng đệm hai bên và khoảng trống cuối trang.
- Card nền tương phản, viền nhẹ, bo góc; các danh sách dùng đường phân cách.

### Trang chủ

1. Card tạo nhóm: mô tả ngắn, ô tên nhóm và nút tạo.
2. Card nhóm gần đây chỉ xuất hiện khi có dữ liệu local; mỗi nhóm có liên kết mở và nút bỏ khỏi danh sách gần đây.
3. Với system admin, thêm danh sách nhóm theo trang 100 mục để truy cập/xử lý nhóm dù không có link.
4. Lỗi tạo nhóm xuất hiện ngay trong card tạo nhóm.

### Trang nhóm

1. Tóm tắt tên, mô tả, số thành viên, số khoản chi, tổng chi; nút sao chép link và trạng thái quyền truy cập. Người chưa tham gia chỉ thấy tên/mô tả, không thấy số liệu nhóm.
2. Tab Tổng quan gồm khoản chi, tài khoản nhận tiền chung, số dư và các thanh toán đã ghi nhận.
3. Tab Thành viên gồm danh sách thành viên, tham gia nhóm, nickname cá nhân và các tác vụ chỉ dành cho người có quyền.
4. Tab Lịch sử hiển thị actor, thời gian, loại hành động và snapshot trước/sau; tải theo từng trang 100 hoạt động.
5. Tab Chat dành cho người đã tham gia nhóm.
6. Người có link nhưng chưa tham gia chỉ thấy tab Thành viên; các tab dữ liệu chỉ hiện sau khi tham gia. Thông báo hướng dẫn họ tham gia nhóm.
7. Nút xoá nhóm chỉ hiển thị cho người tạo hoặc system admin.

### Đăng nhập và session

- Người chưa đăng nhập thấy nút “Tiếp tục với Google”; OAuth quay về URL hiện tại để giữ nguyên route nhóm.
- Header sau đăng nhập hiển thị tên/email tài khoản và nút đăng xuất.
- Chỉ render home/group sau khi session được phục hồi; lỗi xác thực hiển thị thay vì fallback sang dữ liệu không xác thực.

## Màu sắc, chữ và tương tác

- Dùng CSS custom properties trong `src/styles.css` cho nền, card, chữ, đường viền, màu thương hiệu, số dư dương/âm và cảnh báo.
- Mặc định theo giao diện sáng; `prefers-color-scheme: dark` chuyển palette sang tối.
- Dùng font hệ thống, cỡ chữ cơ sở 16px, số tiền dùng chữ số tabular để căn hàng dễ đọc.
- Số dư dương dùng màu xanh; số dư âm dùng màu đỏ. Không chỉ dựa vào màu: dấu `+`/`-` và nội dung giải thích cũng được hiển thị.
- Focus của input, select và button có outline; thành phần tương tác có trạng thái disabled.
- Trên màn hình hẹp, form lưới hai cột chuyển về một cột. Danh sách cho phép nội dung và điều khiển co giãn trong chiều ngang giới hạn.

## Kiến trúc frontend

- React 18 render từ `src/main.jsx`; Vite xử lý dev server và production build.
- `src/App.jsx` chứa shell, OAuth state, các màn hình/luồng trang chủ, nhóm, thành viên, khoản chi, lịch sử.
- Điều hướng dùng URL fragment: `#/` cho trang chủ và `#/g/<uuid>` cho nhóm; không cần fallback route phía hosting.
- `src/util.js` định dạng tiền/giờ và phân tích đầu vào tiền.
- `src/settle.js` là nguồn chuẩn cho phép tính số dư và tạo danh sách thanh toán đề xuất; không chuyển logic tiền sang UI hoặc làm tròn qua số thực ngoài phần parse/DB cần thiết.
- Một Supabase client giữ session Auth; fetch wrapper thêm `x-group-id` theo nhóm đang hoạt động để đáp ứng chính sách RLS.
- State nhóm và audit log được tải từ Supabase; sau thao tác ghi thành công, tải lại dữ liệu. Người chưa tham gia chỉ tải dữ liệu cần cho tab Thành viên; RLS chặn đọc khoản chi, thanh toán và audit log. Tab đang hiển thị polling mỗi 15 giây.
- Chủ nhóm/system admin có thể gỡ tài khoản khỏi danh sách tham gia bằng RPC bảo vệ quyền; thành viên còn được khoản chi/thanh toán tham chiếu được giữ để bảo toàn sổ sách, nhưng mất quyền chat.
- Người có link nhưng chưa tham gia chỉ xem tab Thành viên; biểu ngữ hướng dẫn họ tham gia để mở các tab dữ liệu.

## Supabase và dữ liệu

### Bảng

- `groups`: UUID nhóm, tên, mô tả, thông tin tài khoản nhận tiền chung, thời điểm tạo.
- `members`: thành viên thuộc nhóm.
- `expenses`: mô tả, số nguyên VND dạng `bigint`, người trả, UUID người tham gia và thời điểm tạo.
- `payments`: thành viên gửi/nhận, số nguyên VND và thời điểm tạo.
- `group_audit_log`: append-only snapshot cho mọi thao tác trên groups, members, expenses, payments; không có FK tới groups để giữ sự kiện sau khi xoá nhóm.

Các ràng buộc chi tiết và index nằm trong `supabase/schema.sql`. Thay đổi schema phải có migration tương ứng cho môi trường đã triển khai.

### Cô lập theo nhóm

- Người dùng phải có Supabase Auth session Google; bảng dữ liệu nhóm không cấp quyền cho role `anon`.
- Hàm `public.current_group_id()` đọc header từ request; RLS cho phép authenticated với UUID đúng.
- System admin được nhận diện bằng email `thehoach92@gmail.com` cùng Google provider claim trong JWT và được policy mở quyền toàn hệ thống.
- Tạo nhóm gắn `created_by=auth.uid()`. Xoá nhóm chỉ qua RPC bảo vệ chủ sở hữu/admin; RPC xoá child records theo thứ tự để giữ audit trigger.
- Thông tin tài khoản nhận tiền chung được cập nhật qua RPC giới hạn chủ nhóm/system admin; người có quyền đọc nhóm xem được các trường ngân hàng, số tài khoản và chủ tài khoản.
- Trigger `public.log_group_change()` lưu actor và before/after snapshots. Audit log chỉ grant `SELECT` và trigger ngăn UPDATE/DELETE.
- Link cho phép tài khoản đã đăng nhập xem trước; RLS và trigger yêu cầu có bản ghi tham gia để sửa dữ liệu. Link không thay thế bước tham gia và không phải lời mời riêng.
- `anon key` được dùng ở client browser và không phải bí mật. Không đưa `service_role` key vào frontend, Git hoặc tài liệu.

## Cấu hình và triển khai

- Cấu hình local qua `.env` với `VITE_SUPABASE_URL` (Project URL gốc, không nối `/rest/v1`) và `VITE_SUPABASE_ANON_KEY`; `.env` phải được Git ignore.
- Google OAuth phải được bật trong Supabase Auth, cấu hình Google Cloud callback và allowlist redirect URL cho local/GitHub Pages.
- Production build lấy hai biến từ GitHub Actions secrets.
- `.github/workflows/deploy.yml` chạy test, build rồi deploy `dist` lên GitHub Pages.
- Vite dùng base path tương đối; route fragment hoạt động dưới đường dẫn repo trên Pages.

## Quy ước mở rộng

- Giữ UI bằng tiếng Việt và giữ quy mô nhẹ/no-account trừ khi yêu cầu sản phẩm thay đổi rõ ràng.
- Thay đổi tính toán VND phải sửa `src/settle.js` và bổ sung test tương ứng trong `src/settle.test.js`.
- Không che lỗi Supabase bằng state giả thành công; giữ lỗi có thể thấy được với người dùng.
- Audit log chỉ được tạo ở database trigger, không viết log từ browser vì client có thể giả mạo actor/snapshot.
- Schema đã triển khai phải đổi qua migration; không hướng dẫn chạy lại schema khởi tạo lên database có dữ liệu.
- Tính năng mới cần cập nhật `docs/SPEC.md` cho hành vi, `docs/DESIGN.md` cho luồng/bố cục hoặc kiến trúc bị ảnh hưởng, và `README.md` khi thay đổi setup, bảo mật, database hay deploy.
- Ưu tiên semantic HTML, label rõ cho input, khả năng thao tác bàn phím và trạng thái focus dễ nhận biết.

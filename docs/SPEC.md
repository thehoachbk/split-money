# Đặc tả sản phẩm — Chia tiền

## Mục tiêu

Giúp một nhóm bạn ghi lại chi tiêu chung, biết mỗi người đang nợ hoặc được nhận bao nhiêu, thống nhất các khoản cần chuyển, và tra cứu lịch sử thay đổi. Người dùng đăng nhập Google; thành viên dùng chung nhóm qua link.

## Người dùng và phạm vi

- Người dùng chính là nhóm nhỏ muốn theo dõi chi phí chung, ví dụ chuyến đi hoặc tiền sinh hoạt.
- Giao diện và nội dung hướng tới người dùng tiếng Việt.
- Người dùng phải đăng nhập Google.
- Link nhóm là bí mật dạng bearer: bất kỳ tài khoản Google đã đăng nhập nào có link đều có thể xem/sửa dữ liệu của nhóm. Tham gia nhóm chỉ ghi nhận tài khoản để chủ nhóm sắp xếp nickname; không thay đổi quyền truy cập theo link.
- Người tạo nhóm là chủ sở hữu và chỉ họ mới được xoá nhóm, ngoài system admin.
- Tài khoản Google `thehoach92@gmail.com` là system admin, có quyền xem/sửa/xoá mọi nhóm kể cả không có link.

## Đăng nhập

- Người dùng đăng nhập bằng Google qua Supabase Auth OAuth.
- Session được duy trì trong trình duyệt; người dùng có thể đăng xuất.
- Tạo nhóm ghi `auth.uid()` của người tạo vào `groups.created_by`.
- Các Google account chưa được mời nhưng có link vẫn có quyền sửa nhóm; MVP chưa có danh sách thành viên được mời hoặc thu hồi link.

## Luồng chính

### Tạo và truy cập nhóm

1. Tại trang chủ, người dùng nhập tên nhóm và tạo nhóm.
2. Ứng dụng tạo UUID ngẫu nhiên, lưu nhóm trên Supabase và chuyển tới route dạng `#/g/<uuid>`.
3. Người dùng có thể sao chép link để chia sẻ. Người nhận link có thể mở nhóm trên thiết bị của họ.
4. Trình duyệt lưu tối đa 20 nhóm gần đây trong `localStorage`. Xoá một mục khỏi danh sách gần đây không xoá nhóm trên máy chủ.
5. Nếu Supabase chưa được cấu hình, trang chủ hiển thị hướng dẫn cấu hình. Nếu nhóm không tồn tại, trang nhóm thông báo không tìm thấy và đưa đường dẫn về trang chủ.

### Quản lý thành viên

- Có thể thêm một hoặc nhiều tên trong cùng một lần; phân cách tên bằng dấu phẩy hoặc xuống dòng.
- Người mở link có thể bấm “Tham gia nhóm” để ghi nhận tài khoản Google của họ mà không phải tự chọn nickname.
- Người tạo nhóm có thể gán tài khoản đã tham gia vào một nickname có sẵn, đổi nickname hoặc bỏ gán. Việc gán chỉ áp dụng trong nhóm đó; nickname vẫn là tên hiển thị riêng của nhóm, không thay đổi hồ sơ Google.
- Một tài khoản và một nickname chỉ được liên kết với tối đa một đối tượng trong cùng nhóm. Chủ nhóm quản lý liên kết này; nhóm khác có thể dùng nickname và liên kết riêng.
- Tên thành viên dài tối đa 40 ký tự theo database.
- Cần tối thiểu hai thành viên để nhập khoản chi và xem cân bằng/đề xuất thanh toán.
- Không thể xoá thành viên đang được dùng làm người trả, người tham gia khoản chi hoặc một đầu của thanh toán. Phải xoá các dữ liệu liên quan trước.
- Mọi thao tác thêm/sửa/xoá thành viên được ghi vào audit log.

### Ghi nhận khoản chi

- Mỗi khoản có nội dung (tối đa 120 ký tự), số tiền VND nguyên dương, người trả và danh sách người tham gia chia.
- Nhập tiền hỗ trợ dạng số nguyên hoặc cách viết như `150.000`, `150k`, `1.5tr`.
- Có thể chọn người tham gia cụ thể; mặc định chia cho tất cả thành viên.
- Chia đều cho các thành viên được chọn. Nếu không chia hết, phần dư từng đồng được phân cho thành viên theo thứ tự UUID tăng dần để tổng phần chia đúng bằng khoản chi.
- Khoản chi được sắp xếp mới nhất trước; có thể sửa hoặc xoá.
- Mọi lần thêm/sửa/xoá ghi nhận người thao tác cùng snapshot trước/sau vào audit log.

### Cân bằng và ghi nhận thanh toán

- Số dư dương nghĩa là thành viên được nhận tiền; số dư âm nghĩa là thành viên còn nợ.
- Tính số dư từ khoản chi và các thanh toán đã ghi nhận; chỉ tính người trả/người nhận còn là thành viên hiện tại.
- Đề xuất thanh toán ghép người nợ với người được nhận bằng thuật toán greedy theo số dư lớn trước. Đây là một đề xuất cân bằng, không bảo đảm tối ưu toàn cục trong mọi trường hợp.
- Nút “Đã trả” yêu cầu xác nhận, rồi ghi một thanh toán đúng bằng giao dịch đề xuất đang hiển thị.
- Người dùng có thể xoá một bản ghi thanh toán nếu ghi nhầm; thao tác xoá có xác nhận.
- Thanh toán có thể được sửa; thay đổi ghi vào audit log.
- Giao dịch thanh toán và khoản chi được lưu thành bản ghi riêng; không có tích hợp ngân hàng hay xác minh chuyển tiền thật.

### Lịch sử thay đổi

- Audit log ghi mọi thao tác thêm/sửa/xoá trên nhóm, thành viên, khoản chi và thanh toán.
- Mỗi sự kiện lưu loại bản ghi, thao tác, thời gian, user ID, tên/email actor và snapshot dữ liệu cũ/mới phù hợp với thao tác.
- Lịch sử chỉ đọc và không thể chỉnh/xoá qua ứng dụng. Người dùng có link và đã đăng nhập xem được lịch sử của nhóm; system admin xem được mọi nhóm.
- Hiển thị 100 sự kiện mỗi lần và có thể tải tiếp các sự kiện cũ hơn.
- Sự kiện xoá nhóm được giữ lại trong audit log độc lập với vòng đời dữ liệu nhóm; mở lại link nhóm đã xoá chỉ xem được lịch sử, không khôi phục nhóm.

## Trạng thái và lỗi

- Khi tải dữ liệu, hiển thị trạng thái đang tải.
- Nếu đọc/ghi Supabase thất bại, hiển thị lỗi trả về thay vì giả vờ thao tác thành công.
- Khi tải nhóm lần đầu thất bại, cho phép thử lại.
- Nếu chưa có khoản chi, hiển thị trạng thái rỗng phù hợp; nếu số dư đã cân bằng, thông báo không ai nợ ai.
- Dữ liệu giữa các thiết bị được làm mới bằng polling mỗi 15 giây khi tab đang hiển thị; không phải realtime tức thì.

## Quy tắc dữ liệu

- Đơn vị tiền duy nhất là VND, lưu và tính dưới dạng số nguyên.
- Tên nhóm: 1–80 ký tự. Tên thành viên: 1–40 ký tự. Nội dung khoản chi: 1–120 ký tự.
- Khoản chi và thanh toán phải có số tiền lớn hơn 0.
- Xoá nhóm xoá dữ liệu hiện hành của nhóm và thành viên/khoản chi/thanh toán; audit log được giữ lại.
- Các nhóm cũ chưa có `created_by` cho phép Google user đầu tiên mở được link nhận quyền sở hữu.
- Thay đổi schema đã triển khai cần migration SQL riêng; chỉnh `supabase/schema.sql` chỉ cập nhật hướng dẫn khởi tạo mới.

## Ngoài phạm vi MVP

- Lời mời riêng tư, vai trò tuỳ chỉnh, hoặc giới hạn sửa theo từng thành viên.
- Chi tiêu theo tỷ lệ/phần trăm, số lượng tuỳ chỉnh hoặc nhiều loại tiền tệ.
- Hoàn tác hoặc khôi phục dữ liệu đã xoá.
- Tích hợp thanh toán, thông báo, xuất báo cáo hoặc đồng bộ realtime.

## Tiêu chí chấp nhận

- Người dùng có thể đăng nhập Google, tạo nhóm, chia sẻ link và mở cùng dữ liệu nhóm trên thiết bị khác.
- Người chưa đăng nhập không thể đọc/ghi dữ liệu nhóm. Tài khoản đã đăng nhập cần đúng `x-group-id` để thao tác nhóm, trừ system admin.
- Tài khoản không phải chủ nhóm không thể xoá nhóm; system admin có thể xoá mọi nhóm.
- Thành viên có thể thêm; thành viên đã được tham chiếu không thể xoá cho tới khi dữ liệu tham chiếu được xoá.
- Người có link có thể tham gia nhóm mà không chọn nickname; chủ nhóm có thể liên kết tài khoản đó với nickname riêng trong nhóm.
- Khoản chi và thanh toán có thể được sửa/xoá; từng thao tác tạo/sửa/xoá cùng actor và snapshot được ghi lại.
- Xoá nhóm lưu lại sự kiện xoá và các sự kiện cascade trong audit log.
- Mỗi khoản chi được chia đúng cho người tham gia và tổng số dư của nhóm bằng 0 trước/sau các thanh toán hợp lệ.
- Lỗi cấu hình hoặc lỗi Supabase được trình bày rõ ràng; không hiển thị trạng thái thành công giả.
- Các quy tắc cân bằng có test trong `src/settle.test.js`; thay đổi liên quan phải cập nhật test và chạy `npm test`, `npm run build`.

## Nguồn chuẩn

Đặc tả này mô tả hành vi MVP. Khi có khác biệt, xác minh hành vi trong source và migration/database đang triển khai trước khi sửa tài liệu hoặc mở rộng tính năng.

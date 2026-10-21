# Đặc tả sản phẩm — Chia tiền

## Mục tiêu

Giúp một nhóm bạn ghi lại chi tiêu chung, biết mỗi người đang nợ hoặc được nhận bao nhiêu, thống nhất các khoản cần chuyển, và tra cứu lịch sử thay đổi. Người dùng đăng nhập Google; thành viên dùng chung nhóm qua link.

## Người dùng và phạm vi

- Người dùng chính là nhóm nhỏ muốn theo dõi chi phí chung, ví dụ chuyến đi hoặc tiền sinh hoạt.
- Giao diện và nội dung hướng tới người dùng tiếng Việt.
- Người dùng phải đăng nhập Google.
- Link nhóm cho phép tài khoản Google đã đăng nhập xem trước nhóm, nhưng không tự cấp quyền chỉnh sửa. Người dùng phải tham gia nhóm trước khi sửa dữ liệu; system admin có thể quản trị mọi nhóm.
- Người tạo nhóm là chủ sở hữu và chỉ họ mới được xoá nhóm, ngoài system admin.
- Tài khoản Google `thehoach92@gmail.com` là system admin, có quyền xem/sửa/xoá mọi nhóm kể cả không có link.

## Đăng nhập

- Người dùng đăng nhập bằng Google qua Supabase Auth OAuth.
- Session được duy trì trong trình duyệt; người dùng có thể đăng xuất.
- Tạo nhóm ghi `auth.uid()` của người tạo vào `groups.created_by`.
- Người tạo nhóm tự động được đăng ký là người tham gia và có thành viên chính với nickname mặc định từ tên Google.
- Các Google account chưa được mời nhưng có link chỉ được xem tab Thành viên và tự tham gia; sau khi tham gia mới xem được tab Tổng quan, Lịch sử và Chat.

## Luồng chính

### Các tab trong nhóm

- Trang nhóm chia thành các tab Tổng quan, Thành viên, Lịch sử và Chat. Người chưa tham gia chỉ thấy tab Thành viên.
- Tổng quan chứa khoản chi, tài khoản nhận tiền chung, số dư và các khoản thanh toán đã ghi nhận trước đây.
- Thành viên chứa danh sách thành viên, thao tác tham gia, nickname cá nhân và gộp nickname tạm.
- Lịch sử chỉ hiển thị audit log.
- Chat chứa hội thoại nhóm.
- Mô tả nhóm được hiển thị ở đầu trang cho người mở link trước khi tham gia; chủ nhóm và system admin có thể cập nhật trong tab Thành viên.

### Tạo và truy cập nhóm

1. Tại trang chủ, người dùng nhập tên nhóm và tạo nhóm.
2. Ứng dụng tạo UUID ngẫu nhiên, lưu nhóm trên Supabase và chuyển tới route dạng `#/g/<uuid>`.
3. Người dùng có thể sao chép link để chia sẻ. Người nhận link có thể mở nhóm trên thiết bị của họ.
4. Mô tả tuỳ chọn dài tối đa 500 ký tự giúp người nhận link hiểu mục đích nhóm trước khi tham gia.
5. Trình duyệt lưu tối đa 20 nhóm gần đây trong `localStorage`. Xoá một mục khỏi danh sách gần đây không xoá nhóm trên máy chủ.
6. Nếu Supabase chưa được cấu hình, trang chủ hiển thị hướng dẫn cấu hình. Nếu nhóm không tồn tại, trang nhóm thông báo không tìm thấy và đưa đường dẫn về trang chủ.

### Quản lý thành viên

- Có thể thêm một hoặc nhiều tên trong cùng một lần; phân cách tên bằng dấu phẩy hoặc xuống dòng.
- Người mở link có thể bấm “Tham gia nhóm” để tạo thành viên tài khoản với nickname mặc định từ tên Google; nếu chưa có tên, dùng phần tên email.
- Mỗi người tự đặt/đổi nickname của thành viên tài khoản trong từng nhóm. Nickname chỉ là tên hiển thị cục bộ, không thay đổi hồ sơ Google.
- Chủ nhóm hoặc system admin có thể gộp nickname tạm chưa gắn tài khoản vào thành viên tài khoản đã tham gia. Gộp chuyển người trả, người tham gia khoản chi và hai đầu thanh toán sang thành viên tài khoản; khoản thanh toán giữa hai bản ghi được loại bỏ vì hai người trở thành một. Tên nickname tạm được giữ làm tên của thành viên tài khoản; bản ghi tạm bị xoá trong cùng transaction.
- Chủ nhóm hoặc system admin có thể xoá tài khoản khỏi danh sách tham gia (trừ chủ nhóm). Tài khoản bị gỡ không còn quyền chat; thành viên tài chính chỉ bị xoá nếu chưa được dùng trong khoản chi/thanh toán, nếu đã được dùng thì giữ lại để bảo toàn số dư và lịch sử. Người có link vẫn có thể tham gia lại theo chính sách link nhóm hiện tại.
- Người có link nhưng chưa tham gia chỉ xem được tab Thành viên; RLS cũng chặn đọc khoản chi, thanh toán và audit log. Họ không thể thêm, sửa hoặc xoá thành viên, khoản chi, thanh toán, mô tả hay tài khoản nhận tiền. Quyền được kiểm tra ở UI, RLS và trigger database; người đã tham gia mới được xem các tab dữ liệu và sửa dữ liệu nhóm.
- Mỗi tài khoản chỉ có một thành viên chính trong một nhóm; một nickname tạm chỉ có thể được gộp một lần. Các nhóm khác có thành viên và nickname độc lập.
- Tên thành viên dài tối đa 40 ký tự theo database.
- Cần tối thiểu hai thành viên để nhập khoản chi; số dư vẫn hiển thị theo từng thành viên.
- Không thể xoá thành viên đang được dùng làm người trả, người tham gia khoản chi hoặc một đầu của thanh toán. Phải xoá các dữ liệu liên quan trước.
- Xoá tài khoản khỏi danh sách tham gia không xoá khoản chi/thanh toán cũ; thành viên tài chính còn được tham chiếu tiếp tục được tính số dư.
- Mọi thao tác thêm/sửa/xoá thành viên được ghi vào audit log.

### Ghi nhận khoản chi

- Mỗi khoản có nội dung (tối đa 120 ký tự), số tiền VND nguyên dương, người trả và danh sách người tham gia chia.
- Nhập tiền hỗ trợ dạng số nguyên hoặc cách viết như `150.000`, `150k`, `1.5tr`.
- Có thể chọn người tham gia cụ thể; mặc định chia cho tất cả thành viên.
- Chia đều cho các thành viên được chọn. Nếu không chia hết, phần dư từng đồng được phân cho thành viên theo thứ tự UUID tăng dần để tổng phần chia đúng bằng khoản chi.
- Khoản chi được sắp xếp mới nhất trước; có thể sửa hoặc xoá.
- Mọi lần thêm/sửa/xoá ghi nhận người thao tác cùng snapshot trước/sau vào audit log.

### Số dư và tài khoản nhận tiền chung

- Số dư dương nghĩa là thành viên được nhận tiền; số dư âm nghĩa là thành viên còn nợ.
- Tính số dư từ khoản chi và các thanh toán đã ghi nhận; chỉ tính người trả/người nhận còn là thành viên hiện tại.
- Không tạo gợi ý chuyển tiền trực tiếp giữa từng cặp thành viên. Người có số dư âm chuyển khoản vào tài khoản chung; người có số dư dương nhận tiền từ tài khoản chung.
- Mỗi nhóm có thể lưu một tài khoản chung gồm ngân hàng, số tài khoản và tên chủ tài khoản. Chủ nhóm hoặc system admin được thêm, sửa hoặc xoá thông tin này; người có link nhóm đăng nhập có thể xem.
- Tài khoản chung không lưu thông tin xác thực ngân hàng và không xác minh giao dịch chuyển tiền thật.
- Các khoản thanh toán đã ghi nhận trước đây vẫn được tính vào số dư và hiển thị để sửa/xoá nếu cần; ứng dụng không còn tạo gợi ý hay ghi nhận thanh toán mới.

### Lịch sử thay đổi

- Audit log ghi mọi thao tác thêm/sửa/xoá trên nhóm, thành viên, khoản chi và thanh toán.
- Mỗi sự kiện lưu loại bản ghi, thao tác, thời gian, user ID, tên/email actor và snapshot dữ liệu cũ/mới phù hợp với thao tác.
- Lịch sử chỉ đọc và không thể chỉnh/xoá qua ứng dụng. Người dùng có link và đã đăng nhập xem được lịch sử của nhóm; system admin xem được mọi nhóm.
- Hiển thị 100 sự kiện mỗi lần và có thể tải tiếp các sự kiện cũ hơn.
- Sự kiện xoá nhóm được giữ lại trong audit log độc lập với vòng đời dữ liệu nhóm; mở lại link nhóm đã xoá chỉ xem được lịch sử, không khôi phục nhóm.

### Chat nhóm

- Tài khoản Google đã đăng nhập và tham gia nhóm có thể đọc, gửi tin nhắn văn bản tối đa 1000 ký tự.
- Người gửi hiển thị nickname trong nhóm tại thời điểm gửi; nếu chưa có thành viên tài khoản thì dùng tên Google.
- Lưu và hiển thị tối đa 200 tin nhắn mới nhất; tin mới đến qua Supabase Realtime cho thành viên đã tham gia, có làm mới dự phòng định kỳ.
- Tin chat bất biến trong ứng dụng: không hỗ trợ sửa hoặc xoá. Xoá nhóm sẽ xoá tin nhắn cùng dữ liệu hiện hành của nhóm.

## Trạng thái và lỗi

- Khi tải dữ liệu, hiển thị trạng thái đang tải.
- Nếu đọc/ghi Supabase thất bại, hiển thị lỗi trả về thay vì giả vờ thao tác thành công.
- Khi tải nhóm lần đầu thất bại, cho phép thử lại.
- Nếu chưa có khoản chi, hiển thị trạng thái rỗng phù hợp; nếu số dư đã cân bằng, thông báo không ai nợ ai.
- Dữ liệu giữa các thiết bị được làm mới bằng polling mỗi 15 giây khi tab đang hiển thị; không phải realtime tức thì.
- Chat nhận cập nhật qua Realtime, polling định kỳ là dự phòng khi tab đang hiển thị.

## Quy tắc dữ liệu

- Đơn vị tiền duy nhất là VND, lưu và tính dưới dạng số nguyên.
- Tên nhóm: 1–80 ký tự. Tên thành viên: 1–40 ký tự. Nội dung khoản chi: 1–120 ký tự.
- Mô tả nhóm không bắt buộc, tối đa 500 ký tự; chỉ chủ nhóm hoặc system admin được cập nhật.
- Khoản chi và thanh toán phải có số tiền lớn hơn 0. Thông tin ngân hàng chung tối đa 80 ký tự, số tài khoản tối đa 40 ký tự, tên chủ tài khoản tối đa 120 ký tự; hoặc cả ba trường cùng để trống.
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
- Người chưa đăng nhập không thể đọc/ghi dữ liệu nhóm. Người có link nhưng chưa tham gia chỉ đọc thông tin cần thiết cho tab Thành viên; chỉ thành viên đã tham gia hoặc system admin được đọc khoản chi, thanh toán, audit log và chỉnh sửa dữ liệu.
- Tài khoản không phải chủ nhóm không thể xoá nhóm; system admin có thể xoá mọi nhóm.
- Thành viên có thể thêm; thành viên đã được tham chiếu không thể xoá cho tới khi dữ liệu tham chiếu được xoá.
- Người có link có thể tham gia nhóm để tạo thành viên chính, tự đặt nickname trong nhóm, và chủ nhóm có thể gộp nickname tạm vào tài khoản.
- Chủ nhóm hoặc system admin có thể cấu hình tài khoản nhận tiền chung; người có link xem được thông tin đó cùng số dư để biết ai cần góp hoặc nhận tiền.
- Khoản chi và thanh toán có thể được sửa/xoá; từng thao tác tạo/sửa/xoá cùng actor và snapshot được ghi lại.
- Xoá nhóm lưu lại sự kiện xoá và các sự kiện cascade trong audit log.
- Mỗi khoản chi được chia đúng cho người tham gia và tổng số dư của nhóm bằng 0 trước/sau các thanh toán hợp lệ.
- Lỗi cấu hình hoặc lỗi Supabase được trình bày rõ ràng; không hiển thị trạng thái thành công giả.
- Các quy tắc cân bằng có test trong `src/settle.test.js`; thay đổi liên quan phải cập nhật test và chạy `npm test`, `npm run build`.

## Nguồn chuẩn

Đặc tả này mô tả hành vi MVP. Khi có khác biệt, xác minh hành vi trong source và migration/database đang triển khai trước khi sửa tài liệu hoặc mở rộng tính năng.

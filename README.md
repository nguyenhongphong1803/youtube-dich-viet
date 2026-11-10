# YouTube Dịch Việt

> **Người dùng mới? Đọc [HƯỚNG DẪN SỬ DỤNG](HUONG-DAN-SU-DUNG.md)**: cách tải, cài vào Chrome/Edge, cài giọng đọc tiếng Việt và xử lý sự cố, viết từng bước cho người không rành máy tính.
>
> Trang chính thức của dự án: https://github.com/nguyenhongphong1803/youtube-dich-viet

Extension Chrome (Manifest V3) giúp xem video YouTube tiếng nước ngoài:

1. **Hiển thị phụ đề tiếng Việt** ngay trên video (hỗ trợ cả chế độ rạp hát và toàn màn hình).
2. **Đọc to bản dịch tiếng Việt** bằng giọng máy (TTS), đồng bộ theo video, tự **giảm âm lượng tiếng gốc** trong lúc đọc.

Thuần JavaScript, không cần build, không dùng thư viện ngoài.

## Cài đặt

1. Mở Chrome, vào địa chỉ `chrome://extensions`.
2. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục `youtube-dich-viet` này.
4. Ghim biểu tượng extension lên thanh công cụ để mở phần cài đặt cho nhanh.

Yêu cầu Chrome 111 trở lên (cần content script chạy ở `world: "MAIN"`).

## Cài trên máy khác

### Cách (a): Tải file zip

1. Tải file `YouTube-Dich-Viet-v<phiên bản>.zip` về máy.
2. Giải nén ra một **thư mục cố định** (ví dụ `D:\Extensions\`). Sau khi giải nén sẽ có thư mục `youtube-dich-viet`.
   > **Không xóa hoặc di chuyển thư mục này sau khi cài**, vì Chrome nạp extension trực tiếp từ thư mục đó. Xóa đi thì extension sẽ ngừng hoạt động.
3. Mở Chrome, vào `chrome://extensions`.
4. Bật **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
5. Bấm **Load unpacked** (Tải tiện ích đã giải nén) và chọn thư mục `youtube-dich-viet` (thư mục có chứa file `manifest.json`).

### Cách (b): Tải từ GitHub

1. Mở trang GitHub của dự án: `https://github.com/nguyenhongphong1803/youtube-dich-viet`.
2. Tải mã nguồn bằng một trong hai cách:
   - Bấm nút **Code → Download ZIP**, rồi giải nén ra một thư mục cố định; hoặc
   - Dùng git: `git clone https://github.com/nguyenhongphong1803/youtube-dich-viet`
3. Làm tiếp như bước 3–5 ở cách (a): vào `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked** và chọn thư mục chứa `manifest.json`.

> **Microsoft Edge** làm tương tự, chỉ khác là vào địa chỉ `edge://extensions`.

## Cập nhật phiên bản mới

1. Tải bản mới (file zip hoặc từ GitHub như trên).
2. **Thay thư mục cũ bằng thư mục bản mới** (giữ nguyên vị trí đã chọn khi cài; với bản clone bằng git thì chạy `git pull`).
3. Vào `chrome://extensions`, bấm nút **tải lại (↻)** trên thẻ của extension "YouTube Dịch Việt".
4. Tải lại các tab YouTube đang mở để áp dụng bản mới.

> **Microsoft Edge** làm tương tự ở `edge://extensions`.

## Cách dùng

- Mở một video bất kỳ trên `youtube.com/watch?...` (hoặc YouTube Shorts).
- Extension tự bật phụ đề trên player, lấy phụ đề và hiển thị bản tiếng Việt ở dưới video; phụ đề gốc của YouTube được ẩn đi.
- Nếu bật "Đọc to", mỗi câu sẽ được đọc khi video chạy tới câu đó. Tạm dừng / tua video sẽ dừng đọc.
- Bấm biểu tượng extension để chỉnh:
  - Bật/tắt extension
  - Hiện phụ đề tiếng Việt
  - Hiện song ngữ (dòng gốc màu vàng + dòng tiếng Việt)
  - Đọc to tiếng Việt
  - Tốc độ đọc (0.8–2.0, mặc định 1.2)
  - Âm lượng tiếng gốc khi đang đọc (0–100%, mặc định 20%)
  - Cỡ chữ phụ đề
  - Chọn giọng đọc tiếng Việt (có nút "Thử giọng")
- Thay đổi được áp dụng ngay, không cần tải lại trang.

## Cách hoạt động (tóm tắt)

- `injected.js` chạy cùng ngữ cảnh với trang, theo dõi các request `/api/timedtext` mà player YouTube gửi (URL có token bảo vệ nên không tự dựng được) và đọc danh sách phụ đề của video.
- `content.js` lấy phụ đề theo thứ tự ưu tiên:
  1. Phụ đề do **YouTube tự dịch** sang tiếng Việt (`tlang=vi`).
  2. Phụ đề gốc rồi **tự dịch qua Google Translate** (gộp các mảnh ngắn của phụ đề tự động thành câu trước khi dịch).
  3. Dịch **trực tiếp** phụ đề đang hiển thị trên màn hình (khi không lấy được file phụ đề).
- `background.js` gọi Google Translate và giọng đọc `chrome.tts`.

## Hạn chế

- Chỉ hoạt động với video **có phụ đề** (phụ đề do người đăng tải lên hoặc phụ đề tự động của YouTube). Video không có phụ đề sẽ hiện thông báo "Video này không có phụ đề để dịch".
- Chất lượng dịch phụ thuộc vào YouTube/Google Translate; phụ đề tự động thường thiếu dấu câu nên câu dịch có thể chưa tự nhiên.
- Giọng đọc là **giọng máy**. Câu dài trong thời gian ngắn sẽ được đọc nhanh hơn để theo kịp video.
- **Đánh đổi để đọc khớp hình:** mỗi câu mới sẽ ngắt câu đang đọc dở, nên **câu dài có thể bị cắt khi tới câu mới** (thay vì đọc nối đuôi và trễ dần so với video).
- Khi đang chiếu **quảng cáo**, extension không hiện phụ đề, không đọc và không giảm âm lượng.
- YouTube thay đổi giao diện/API thường xuyên, một số phần có thể ngừng hoạt động sau các bản cập nhật của YouTube.
- Bản dịch dùng endpoint công khai của Google Translate, có thể bị giới hạn (HTTP 429) nếu dùng quá nhiều. Khi đó extension hiện thông báo "Dịch đang bị giới hạn, thử lại sau…", tự giãn thời gian chờ (5s, 15s, 30s) rồi thử lại; trong lúc chờ, câu chưa dịch được hiện tạm bằng câu gốc (chữ nghiêng, mờ) và **không được đọc**.
- Chế độ dịch trực tiếp chỉ dịch một dòng khi dòng đó đã "chốt" (bị đẩy lên, đứng yên ≥ 1 giây hoặc có dấu câu), nên phụ đề Việt và giọng đọc trễ hơn hình khoảng 1–3 giây.

## Không có giọng tiếng Việt?

Extension tự chọn giọng theo thứ tự: giọng bạn chọn trong cài đặt → giọng tiếng Việt (`vi`) của Microsoft (ưu tiên các giọng Natural/Online như "Microsoft HoaiMy Online (Natural)", "Microsoft NamMinh Online (Natural)", sau đó "Microsoft An") → các giọng tiếng Việt khác. Không phải máy nào cũng có giọng "Google Tiếng Việt".

Nếu trong phần cài đặt hiện cảnh báo "Không tìm thấy giọng tiếng Việt":

- **Windows 10/11**: vào **Settings → Time & Language → Language** (Cài đặt → Thời gian & ngôn ngữ → Ngôn ngữ), **thêm Tiếng Việt** và đánh dấu cài kèm **Text-to-speech / Speech** (Chuyển văn bản thành giọng nói / Giọng nói). Cài xong thì **khởi động lại Chrome** (đóng hết cửa sổ Chrome) để Chrome nhận giọng "Microsoft An".
- **Microsoft Edge**: Edge có sẵn các giọng **Natural tiếng Việt** (HoaiMy, NamMinh) đọc rất tự nhiên. Extension này cũng chạy được trên Edge: vào `edge://extensions`, bật *Developer mode*, bấm *Load unpacked* và chọn thư mục này.
- **macOS**: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices → chọn giọng Tiếng Việt (Linh).

## Quyền riêng tư

Extension không thu thập dữ liệu người dùng. Dữ liệu duy nhất gửi ra ngoài là **nội dung phụ đề** gửi tới `translate.googleapis.com` để dịch. Cài đặt được lưu bằng `chrome.storage.sync` của trình duyệt.

## Cấu trúc thư mục

```
manifest.json   Khai báo extension (MV3)
injected.js     Chạy ở world MAIN: hook fetch/XHR bắt URL phụ đề, đọc danh sách phụ đề, bật CC
content.js      Lấy/dịch phụ đề, overlay, đồng bộ, TTS, giảm âm lượng
content.css     Giao diện phụ đề và thông báo trên video
background.js   Service worker: dịch (Google Translate), đọc (chrome.tts)
popup.html/js/css  Giao diện cài đặt
icons/          Biểu tượng
```

## Gỡ lỗi

Mở DevTools (F12) trên tab YouTube, tab Console, lọc theo `[YT-Dịch]` để xem log của extension.

## Dành cho người đóng góp / phát hành: lưu ý bảo mật

Repo này là **công khai**. Mọi thứ đã commit (kể cả trong lịch sử git) đều ai cũng xem được.

- **KHÔNG commit file `.pem`.** Chrome tạo file này khi bấm **Pack extension** (Đóng gói tiện ích). Đây là **khóa riêng** dùng để ký extension; nếu lộ ra, người khác có thể ký và phát hành bản cập nhật giả mạo dưới danh nghĩa extension này.
- **KHÔNG commit** file `.crx`, `.env`, khóa API, token, mật khẩu.
- Extension hiện **không dùng khóa API nào**. Nếu sau này cần thêm, hãy đặt khóa trong một file bị `.gitignore` chặn (ví dụ `.env`, `secrets.json`), **không viết thẳng vào code**.
- `.gitignore` đã chặn sẵn: `*.pem`, `*.crx`, `*.key`, `*.p12`, `*.pfx`, `.env`, `.env.*`, `secrets*`, `*.zip`, `.vscode/`, `.idea/`...
- **Trước khi push**, chạy `git status` (và `git diff --cached` nếu cần) để xem lại danh sách file sắp đưa lên. Thấy file lạ thì dừng lại kiểm tra.
- Nếu lỡ commit thông tin bí mật: xóa file thôi là **chưa đủ** vì nó vẫn nằm trong lịch sử git. Hãy coi khóa đó đã bị lộ, đổi/thu hồi khóa ngay rồi mới dọn lịch sử.

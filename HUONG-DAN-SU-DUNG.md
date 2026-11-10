# Hướng dẫn sử dụng: YouTube Dịch Việt

Tài liệu này viết cho người không rành máy tính. Cứ làm lần lượt từng bước là được.

Trang chính thức của tiện ích: **https://github.com/nguyenhongphong1803/youtube-dich-viet**

Trong bài, tên nút được ghi cả tiếng Việt lẫn tiếng Anh, vì Chrome có thể hiện một trong hai, tùy ngôn ngữ máy bạn.
Ví dụ: **Tải tiện ích đã giải nén (Load unpacked)**.

---

## Mục lục

1. [Tiện ích làm được gì?](#1-tiện-ích-làm-được-gì)
2. [Cần những gì?](#2-cần-những-gì)
3. [Tải tiện ích về máy](#3-tải-tiện-ích-về-máy)
4. [Cài vào Chrome hoặc Edge](#4-cài-vào-chrome-hoặc-edge)
5. [Cài giọng đọc tiếng Việt cho Windows](#5-cài-giọng-đọc-tiếng-việt-cho-windows-1011)
6. [Cách dùng hằng ngày](#6-cách-dùng-hằng-ngày)
7. [Cập nhật lên bản mới](#7-cập-nhật-lên-bản-mới)
8. [Xử lý sự cố](#8-xử-lý-sự-cố)
9. [Quyền riêng tư và bảo mật](#9-quyền-riêng-tư-và-bảo-mật)

---

## 1. Tiện ích làm được gì?

Khi bạn xem video YouTube tiếng nước ngoài (Anh, Trung, Hàn, Nhật...), tiện ích sẽ:

- **Hiện phụ đề tiếng Việt** ngay dưới video. Chạy được cả ở chế độ rạp hát và toàn màn hình.
- **Hiện song ngữ** nếu bạn muốn: dòng gốc (màu vàng) ở trên, dòng tiếng Việt ở dưới.
- **Đọc to bản dịch tiếng Việt** bằng giọng máy, khớp theo video.
- **Tự vặn nhỏ tiếng gốc** của video trong lúc đọc tiếng Việt, đọc xong thì trả lại âm lượng cũ.

Chạy được với video thường và YouTube Shorts.

---

## 2. Cần những gì?

- Trình duyệt **Google Chrome bản 111 trở lên**, hoặc **Microsoft Edge**.
  - Xem phiên bản Chrome: gõ `chrome://settings/help` vào thanh địa chỉ rồi bấm Enter.
- Video phải **có phụ đề**. Phụ đề tự động của YouTube cũng được.
  - Cách nhận biết: dưới video có nút **CC**. Không có nút CC thì video đó không có phụ đề, tiện ích không dịch được.
- Máy phải **có mạng Internet** (để dịch).

---

## 3. Tải tiện ích về máy

Chỉ tải từ trang chính thức ở trên. Chọn **một** trong hai cách.

### Cách 1: Tải file zip ở mục Releases (dễ nhất)

1. Mở trang: **https://github.com/nguyenhongphong1803/youtube-dich-viet/releases**
2. Ở bản mới nhất, mục **Assets**, bấm vào file có tên dạng `YouTube-Dich-Viet-v1.0.0.zip` để tải về.

### Cách 2: Tải toàn bộ mã nguồn

1. Mở trang: **https://github.com/nguyenhongphong1803/youtube-dich-viet**
2. Bấm nút màu xanh **Code**.
3. Bấm **Download ZIP**.

### Giải nén (cả hai cách đều phải làm)

1. Tạo một thư mục cố định để giữ tiện ích, ví dụ `D:\TienIch\`.
2. Bấm chuột phải vào file zip vừa tải → chọn **Giải nén tất cả... (Extract All...)**.
3. Chọn nơi giải nén là thư mục `D:\TienIch\` → bấm **Giải nén (Extract)**.
4. Sau khi xong, bạn sẽ có thư mục `D:\TienIch\youtube-dich-viet`.

> **Quan trọng:**
> - **KHÔNG xóa, KHÔNG di chuyển, KHÔNG đổi tên** thư mục này sau khi cài. Chrome chạy tiện ích trực tiếp từ thư mục đó. Xóa đi là tiện ích ngừng chạy.
> - Đừng để trong thư mục **Downloads (Tải xuống)** vì bạn hay dọn thư mục đó.
> - Nếu tải bằng **Download ZIP** (cách 2), thư mục giải nén ra có thể tên là `youtube-dich-viet-main`. Như vậy vẫn được.
> - Khi chọn thư mục để cài (bước 4 bên dưới), phải chọn **đúng thư mục chứa trực tiếp file `manifest.json`**. Mở thư mục ra, nếu thấy ngay file `manifest.json` là đúng. Nếu chỉ thấy thêm một thư mục con nữa, hãy mở tiếp vào trong.

---

## 4. Cài vào Chrome hoặc Edge

### Với Google Chrome

1. Mở Chrome.
2. Gõ vào thanh địa chỉ: `chrome://extensions` rồi bấm **Enter**.
3. Ở **góc trên bên phải**, bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)**.
4. Một hàng nút mới hiện ra. Bấm **Tải tiện ích đã giải nén (Load unpacked)**.
5. Cửa sổ chọn thư mục hiện ra. Đi tới thư mục đã giải nén, ví dụ `D:\TienIch\youtube-dich-viet`.
6. Bấm vào thư mục đó **một lần** (không cần mở vào trong) → bấm **Chọn thư mục (Select Folder)**.
7. Thẻ **YouTube Dịch Việt** hiện ra trong danh sách là đã cài xong.
8. Ghim biểu tượng lên thanh công cụ cho dễ dùng:
   1. Bấm biểu tượng **mảnh ghép** (Tiện ích / Extensions) ở góc trên bên phải Chrome.
   2. Tìm **YouTube Dịch Việt**, bấm biểu tượng **ghim (Pin)** bên cạnh.

Nếu Chrome báo lỗi "Không tìm thấy tệp kê khai" (**Manifest file is missing or unreadable**): bạn chọn sai thư mục. Xem lại lưu ý về `manifest.json` ở mục 3.

### Với Microsoft Edge

1. Mở Edge.
2. Gõ vào thanh địa chỉ: `edge://extensions` rồi bấm **Enter**.
3. Ở **cột bên trái** (hoặc dưới cùng), bật công tắc **Chế độ nhà phát triển (Developer mode)**.
4. Bấm **Tải giải nén (Load unpacked)**.
5. Chọn thư mục đã giải nén (thư mục chứa `manifest.json`) → bấm **Chọn thư mục (Select Folder)**.
6. Ghim biểu tượng: bấm biểu tượng **mảnh ghép** (Tiện ích mở rộng / Extensions) → bấm biểu tượng **con mắt (Hiển thị trên thanh công cụ / Show in toolbar)** cạnh **YouTube Dịch Việt**.

---

## 5. Cài giọng đọc tiếng Việt cho Windows 10/11

Muốn tiện ích **đọc to** thì máy phải có giọng đọc tiếng Việt. Nhiều máy chưa có sẵn.

**Kiểm tra nhanh:** bấm biểu tượng tiện ích. Nếu thấy dòng cảnh báo **"Không tìm thấy giọng tiếng Việt trên máy"** thì cần làm các bước dưới đây.

### Windows 11

1. Bấm nút **Start** → **Cài đặt (Settings)**.
2. Chọn **Thời gian & ngôn ngữ (Time & language)** → **Ngôn ngữ & khu vực (Language & region)**.
3. Bấm **Thêm ngôn ngữ (Add a language)**.
4. Gõ tìm **Tiếng Việt (Vietnamese)** → chọn → bấm **Tiếp (Next)**.
5. **Tích chọn** ô **Chuyển văn bản thành giọng nói (Text-to-speech)**. Nếu có ô **Nhận dạng giọng nói / Giọng nói (Speech)** thì tích luôn.
6. Bấm **Cài đặt (Install)**. Chờ tải xong (cần mạng).

### Windows 10

1. Bấm nút **Start** → **Cài đặt (Settings)**.
2. Chọn **Thời gian & ngôn ngữ (Time & Language)** → **Ngôn ngữ (Language)**.
3. Bấm **Thêm ngôn ngữ (Add a language)**.
4. Chọn **Tiếng Việt (Vietnamese)** → bấm **Tiếp (Next)**.
5. **Tích chọn** ô **Chuyển văn bản thành giọng nói (Text-to-speech)** (và **Speech** nếu có).
6. Bấm **Cài đặt (Install)**. Chờ tải xong.

### Sau khi cài giọng (bắt buộc)

1. **Đóng hết mọi cửa sổ** Chrome (hoặc Edge). Chỉ đóng một tab là chưa đủ.
2. Mở lại trình duyệt.
3. Bấm biểu tượng tiện ích → mục **Giọng đọc** sẽ có giọng **Microsoft An**.
4. Bấm **Thử giọng** để nghe thử.

> **Mẹo:** Trình duyệt **Microsoft Edge** có sẵn giọng tiếng Việt **Natural** rất tự nhiên: **Microsoft HoaiMy Online (Natural)** (giọng nữ) và **Microsoft NamMinh Online (Natural)** (giọng nam). Nếu thấy giọng trên Chrome đọc cứng, hãy cài tiện ích vào Edge để dùng các giọng này. Giọng Natural cần có mạng.

---

## 6. Cách dùng hằng ngày

1. Mở một video trên YouTube.
2. Chờ vài giây. Tiện ích tự bật phụ đề, dịch và hiện phụ đề tiếng Việt dưới video.
   - Phụ đề gốc của YouTube sẽ được ẩn đi.
   - Có thể hiện thông báo "Đang dịch phụ đề sang tiếng Việt…" lúc đầu. Đó là bình thường.
3. Nếu bật **Đọc to**, mỗi câu sẽ được đọc khi video chạy tới câu đó.
   - Tạm dừng hoặc tua video thì tiện ích dừng đọc.
   - Khi đang chiếu **quảng cáo**, tiện ích không hiện phụ đề và không đọc.

### Bảng cài đặt

Bấm vào **biểu tượng tiện ích** trên thanh công cụ để mở bảng cài đặt. Mọi thay đổi có tác dụng ngay, không cần tải lại trang.

| Tùy chọn | Tác dụng | Mặc định |
|---|---|---|
| **Công tắc ở góc trên** (cạnh chữ "YouTube Dịch Việt") | Bật hoặc tắt toàn bộ tiện ích. Tắt thì YouTube trở lại như bình thường. | Bật |
| **Hiện phụ đề tiếng Việt** | Hiện dòng chữ tiếng Việt dưới video. Bỏ tích nếu chỉ muốn nghe đọc, không muốn thấy chữ. | Bật |
| **Hiện song ngữ (gốc + Việt)** | Hiện thêm câu gốc màu vàng phía trên câu tiếng Việt. Hợp để học ngoại ngữ. Chỉ dùng được khi đang bật "Hiện phụ đề tiếng Việt". | Tắt |
| **Cỡ chữ phụ đề** | Kéo thanh trượt để chữ to hoặc nhỏ (14px đến 48px). | 24px |
| **Đọc to bản dịch tiếng Việt** | Bật giọng máy đọc tiếng Việt. Bỏ tích nếu chỉ muốn đọc chữ. | Bật |
| **Tốc độ đọc** | Kéo để giọng đọc nhanh hoặc chậm (0.8× đến 2.0×). Câu dài mà thời gian ngắn thì tiện ích tự đọc nhanh hơn để theo kịp video. | 1.2× |
| **Âm lượng tiếng gốc khi đọc** | Mức tiếng gốc của video trong lúc đang đọc tiếng Việt. 0% là tắt hẳn tiếng gốc. 100% là giữ nguyên, không vặn nhỏ. | 20% |
| **Giọng đọc** | Chọn giọng tiếng Việt. Để **Tự động** thì tiện ích tự chọn giọng tốt nhất có trên máy. | Tự động |
| **Thử giọng** | Bấm để nghe thử giọng đang chọn. | |

---

## 7. Cập nhật lên bản mới

1. Tải bản mới về như ở **mục 3**.
2. Giải nén ra, rồi **chép đè** toàn bộ file mới vào **đúng thư mục cũ** (ví dụ `D:\TienIch\youtube-dich-viet`). Khi Windows hỏi, chọn **Thay thế các tệp ở đích (Replace the files in the destination)**.
   - Hoặc: xóa hết file trong thư mục cũ rồi chép file mới vào. Giữ nguyên tên và vị trí thư mục.
3. Mở `chrome://extensions` (hoặc `edge://extensions`).
4. Trên thẻ **YouTube Dịch Việt**, bấm nút **tải lại** hình mũi tên vòng (↻) (**Reload**).
5. Tải lại (F5) các tab YouTube đang mở.

Cài đặt của bạn (tốc độ, giọng, cỡ chữ...) vẫn được giữ.

Nếu lỡ để thư mục mới ở chỗ khác: vào `chrome://extensions`, bấm **Xóa (Remove)** trên thẻ cũ, rồi cài lại như **mục 4** với thư mục mới.

---

## 8. Xử lý sự cố

Trước tiên, thử cách chung này: **tải lại trang YouTube (F5)**. Nhiều lỗi sẽ hết.

| Hiện tượng | Cách xử lý |
|---|---|
| **Không hiện phụ đề tiếng Việt** | 1. Bấm F5 tải lại trang. 2. Bấm biểu tượng tiện ích, kiểm tra công tắc góc trên đang **bật** và ô **Hiện phụ đề tiếng Việt** đang được tích. 3. Vào `chrome://extensions`, xem thẻ **YouTube Dịch Việt** có đang bật không, có dòng báo lỗi màu đỏ không. 4. Kiểm tra video có nút **CC** không. 5. Kiểm tra mạng. |
| **Có chữ tiếng Việt nhưng không có tiếng đọc** | 1. Bấm biểu tượng tiện ích, kiểm tra ô **Đọc to bản dịch tiếng Việt** đang được tích. 2. Nếu thấy cảnh báo "Không tìm thấy giọng tiếng Việt", cài giọng theo **mục 5**, rồi **đóng hết** cửa sổ trình duyệt và mở lại. 3. Bấm **Thử giọng**. Nếu thử giọng cũng im lặng, kiểm tra loa và âm lượng Windows. 4. Ở mục **Giọng đọc**, thử chọn lại **Tự động**. 5. Khi dịch đang bị giới hạn, câu chưa dịch được hiện chữ nghiêng mờ và **không được đọc**; chờ một lúc là hết. |
| **Báo "Video này không có phụ đề để dịch"** | Video này không có phụ đề, kể cả phụ đề tự động. Tiện ích không dịch được video này. Hãy thử video khác. Video mới đăng có thể chưa có phụ đề tự động, chờ vài giờ rồi thử lại. |
| **Báo "Dịch đang bị giới hạn, thử lại sau…"** | Google Translate tạm chặn vì dịch quá nhiều trong thời gian ngắn. Tiện ích **tự thử lại** sau 5, 15, 30 giây. Bạn chỉ cần chờ. Trong lúc chờ, câu chưa dịch hiện bằng tiếng gốc (chữ nghiêng, mờ). Nếu bị lâu: nghỉ khoảng 15 đến 30 phút rồi thử lại, hoặc đổi mạng (ví dụ từ Wi-Fi sang 4G). |
| **Âm lượng video nhỏ bất thường** | Tiện ích vặn nhỏ tiếng gốc trong lúc đọc. Nếu bạn tự chỉnh âm lượng đúng lúc đó, tiện ích sẽ thôi không trả lại mức cũ. Cách sửa: 1. Kéo thanh âm lượng của YouTube lên lại. 2. Bấm F5 tải lại trang. 3. Nếu không muốn bị vặn nhỏ nữa: trong bảng cài đặt, kéo **Âm lượng tiếng gốc khi đọc** lên **100%**. |
| **Chrome hiện cảnh báo "Tắt tiện ích ở chế độ nhà phát triển" (Disable developer mode extensions)** | Đây là **chuyện bình thường** với mọi tiện ích cài thủ công (không qua Cửa hàng Chrome). Hãy bấm **Giữ lại (Keep)** hoặc bấm dấu **X** để đóng thông báo. **Đừng** bấm **Tắt (Disable)**. Nếu lỡ bấm Tắt: vào `chrome://extensions` và bật lại công tắc trên thẻ **YouTube Dịch Việt**. |
| **Tiện ích biến mất hoặc báo lỗi không tìm thấy** | Có thể thư mục tiện ích đã bị xóa hoặc di chuyển. Giải nén lại vào đúng chỗ cũ, hoặc cài lại theo **mục 4**. |
| **Phụ đề tiếng Việt trễ hơn hình 1 đến 3 giây** | Xảy ra khi tiện ích phải dịch trực tiếp chữ đang hiện trên màn hình (thông báo "Đang dịch trực tiếp phụ đề hiển thị trên video"). Đây là giới hạn của cách dịch này, không phải lỗi. |
| **Câu dài bị đọc dở thì chuyển câu khác** | Cố ý như vậy để giọng đọc luôn khớp hình. Có thể tăng **Tốc độ đọc** để đọc kịp hơn. |

### Cách xem nhật ký lỗi (log) để gửi cho người hỗ trợ

1. Mở tab YouTube đang bị lỗi.
2. Bấm phím **F12**. Một khung công cụ hiện ra.
3. Bấm thẻ **Console** (Bảng điều khiển).
4. Ở ô **Filter** (Lọc), gõ: `YT-Dịch`
5. Các dòng hiện ra là nhật ký của tiện ích. Chụp màn hình gửi cho người hỗ trợ.
6. Bấm **F12** lần nữa để đóng.

---

## 9. Quyền riêng tư và bảo mật

### Tiện ích làm gì với dữ liệu của bạn?

- Tiện ích **chỉ chạy trên trang youtube.com**. Các trang web khác nó không đụng tới.
- Để dịch, tiện ích **chỉ gửi nội dung phụ đề** (chữ trong video) tới Google Translate tại địa chỉ `translate.googleapis.com`. Khi gửi, tiện ích **không kèm cookie** hay thông tin đăng nhập của bạn.
- Tiện ích tải file phụ đề từ **chính YouTube** (giống như khi bạn bấm nút CC), không qua máy chủ nào khác.
- Tiện ích **không gửi** tài khoản, lịch sử xem, mật khẩu hay bất kỳ dữ liệu cá nhân nào. Không có máy chủ riêng nào nhận dữ liệu.
- Cài đặt của bạn (tốc độ, giọng, cỡ chữ...) được lưu ngay trong trình duyệt của bạn.
- Giọng đọc dùng giọng có sẵn trên máy. Riêng giọng **Online (Natural)** của Edge do Microsoft xử lý qua mạng, giống mọi tính năng đọc to của Edge.
- **Không cần đăng nhập**, **không có khóa API**, **không mất phí**.

### Tự bảo vệ mình

- **Chỉ tải tiện ích từ đúng trang chính thức:** https://github.com/nguyenhongphong1803/youtube-dich-viet
- **Không cài** bản do người lạ gửi qua Zalo, Facebook, email hay USB. Tiện ích chạy trong trình duyệt nên có thể đọc được nội dung trang web. Một bản bị sửa có thể ăn cắp thông tin của bạn.
- **Tự kiểm tra quyền** trước khi cài:
  1. Mở thư mục tiện ích, bấm chuột phải vào file `manifest.json` → **Mở bằng (Open with)** → **Notepad**.
  2. Tìm dòng `"permissions"`. Bản chính thức **chỉ có**: `"storage"` và `"tts"`.
  3. Tìm dòng `"host_permissions"`. Bản chính thức **chỉ có 2 địa chỉ**:
     - `https://www.youtube.com/*`
     - `https://translate.googleapis.com/*`
  4. Nếu thấy **thêm quyền lạ** (ví dụ `cookies`, `history`, `tabs`, `webRequest`, `<all_urls>`, hay địa chỉ trang web khác), **KHÔNG cài** bản đó.

Ý nghĩa các quyền:

| Quyền | Dùng để làm gì |
|---|---|
| `storage` | Lưu cài đặt của bạn (tốc độ, giọng, cỡ chữ...). |
| `tts` | Dùng giọng đọc của máy để đọc tiếng Việt. |
| `https://www.youtube.com/*` | Chạy trên trang YouTube để hiện phụ đề và đọc. |
| `https://translate.googleapis.com/*` | Gửi phụ đề tới Google Translate để dịch. |

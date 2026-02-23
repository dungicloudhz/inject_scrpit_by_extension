# PHẦN 1 - TƯ DUY CỐT LÕI
**Chrome Extension là gì?**
*Chrome Extension là một ứng dụng nhỏ chạy trong trình duyệt, có thể:*
- Đọc nội dung website
- Chỉnh sửa giao diện website
- Tự động thao tác
- Lưu dữ liệu
- Gửi request
- Tải file

Nhưng nó bị sandbox và phải khai báo quyền rõ ràng.

# PHẦN 2 - 3 THÀNH PHẦN BẮT BUỘC PHẢI HIỂU
## 1. Popup (UI layer)
- Hiển thị khi người dùng click icon
- Dùng để:
    - Start
    - Stop
    - Config
- Không truy cập trực tiếp DOM website
👉 Popup = controller UI
## 2 Background (Service Worker) - Trung tâm điều phối
- Không có DOM
- Không chạy liên tục
- Chỉ chạy khi có event

**Dùng để**:
- Quản lý logic chính
- Lưu dữ liệu
- Download file
- Mở tab mới
- Giao tiếp giữa các thành phần

👉 Background = server layer

## 3 Content Script - Chạy trong website
- Có quyền truy cập DOM
- Chạy bên trong trang web
- Có thể:
    - Đọc HTML
    - Click button
    - Scroll
    - Fill form

👉 Content = automation layer

# PHẦN 3 - MÔ HÌNH HOẠT ĐỘNG CHUNG
```code
User click extension
        ↓
      Popup
        ↓
    Gửi message
        ↓
    Content Script
        ↓
Thao tác với website
        ↓
    Gửi kết quả về
        ↓
  Background xử lý
```
# PHẦN 4 - CẤU TRÚC CHUNG CHO MỌI EXTENSION
```code
my-extension/
│
├── manifest.json
├── background.js
├── popup.html
├── popup.js
└── content.js
```
**Bạn có thể áp dụng cấu trúc này cho**:
- Tool scrape
- Tool tự động điền form
- Tool chỉnh sửa giao diện
- Tool lấy data
- Tool automation nội bộ công ty

# PHẦN 5 - CÁC LOẠI EXTENSION PHỔ BIẾN
## 1. Data Extractor
- Đọc DOM
- Lấy thông tin
- Xuất file

Ví dụ:
- Lấy email
- Lấy sản phẩm
- Lấy bảng dữ liệu

## 2. UI Modifier
- Thay đổi CSS
- Thêm nút mới
- Ẩn quảng cáo

## 3. Automation Bot
- Click tự động
- Fill form
- Scroll
- Chạy theo kịch bản

## 4. API Connector
- Gửi request tới server riêng
- Đồng bộ dữ liệu

# PHẦN 6 - QUYỀN (Permissions) HIỂU CHO ĐÚNG
**Có 2 loại**:
## 1. Chrome API permissions
Ví dụ:
- storage
- download
- tabs
- scripting

Cho phép dùng API của Chrome.

## 2. host_permissions
Ví dụ:
```code
https://*.example.com/*
```
Cho phép:
- Inject script
- Đọc DOM
- Gửi request tới domain đó
# PHẦN 7 - MESSAGE PASSING (CỰC KỲ QUAN TRỌNG)
Extension không thể gọi trực tiếp giữa các phần.
Phải dùng:
```code
chrome.runtime.sendMessage()
chrome.runtime.onMessage.addListener()
```
Đây là cơ chế IPC (inter-process communication).

# PHẦN 8 - KIẾN TRÚC TỔNG QUÁT ÁP DỤNG CHO MỌI CASE
**Level 1- Basic Tool**
```code
Popup → Content
```
**Level 2 - Có xử lý dữ liệu**
```code
Popup → Content → Background
```
**Level 3 - Automation nâng cao**
```code
Popup
   ↓
Background
   ↓
Mở tab
   ↓
Inject content
   ↓
Chạy flow
   ↓
Trả kết quả
```

# PHẦN 9 - KHI NÀO DÙNG EXTENSION?
| Trường hợp                   | Dùng extension?  |
| ---------------------------- | ---------------- |
| Cần tương tác như người dùng | ✅                |
| Cần login session hiện tại   | ✅                |
| Chỉ cần call API             | ❌ dùng backend   |
| Cần chạy 24/7 server         | ❌ dùng Puppeteer |

# PHẦN 10 - SO SÁNH EXTENSION vs PUPPETEER
| Extension                     | Puppeteer          |
| ----------------------------- | ------------------ |
| Chạy trong browser người dùng | Chạy headless      |
| Không dễ bị detect            | Dễ bị detect       |
| Dùng session thật             | Phải inject cookie |
| Không chạy 24/7               | Chạy server được   |

# PHẦN 11 - LỘ TRÌNH HỌC CHO NGƯỜI MỚI
**Tuần 1**
- Hiểu manifest
- Hiểu popup
- Hiểu content script

**Tuần 2**
- Hiểu message passing
- Hiểu background
- Làm tool đơn giản

**Tuần 3**
- Automation nâng cao
- Scroll
- Wait element
- Retry logic

**Tuần 4**
- Kiến trúc multi-tab
- Storage
- Export file
- Debug chuyên sâu

# CÔNG THỨC HỌC NHANH
**Mỗi khi làm extension mới, hãy trả lời 5 câu hỏi**:
1. UI có cần không?
2. Có cần background xử lý không?
3. Có cần đọc DOM không?
4. Có cần mở tab mới không?
5. Có cần lưu dữ liệu không?

**Trả lời xong là bạn vẽ được kiến trúc.**
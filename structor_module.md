Trước khi code phải có **khung module + workflow tư duy** rõ ràng.
Mình sẽ chia làm 3 phần:
**1.** Khung module chẩn chuản Chrome Extension (MV3)
**2.** Bảng mô tả vai trò từng file
**3.** Workflow tư duy viết code hợp lý (tránh spaghetti code)

# I. Khung module chuẩn của Chrome Extension (Manifest V3)
*Cấu trúc điển hình:*
```json
shopee-affiliate-extension/
│
├── manifest.json
│
├── background/
│   └── background.js
│
├── content/
│   └── content.js
│
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
│
├── utils/
│   ├── dom.js
│   ├── scraper.js
│   ├── excel.js
│   └── storage.js
│
└── icons/
```

# II. Bảng mô tả vai trò từng file
## 1. `manifest.json`
| Vai trò               | Ý nghĩa                  |
| --------------------- | ------------------------ |
| Khai báo cấu hình     | Là file bắt buộc         |
| Định nghĩa quyền      | tabs, scripting, storage |
| Khai báo background   | Service Worker           |
| Inject content script | Chạy trong trang web     |

👉 Đây là **file điều phối toàn bộ extension**

## 2. `background.js` (Service Worker)
- **Vai trò**
    - Trung tâm điều phối (orchestrator)
    - Quản lý tabs
    - Nhận message
    - Thực hiện tác vụ hệ thống
- **Khi nào dùng?**
    - Mở tab mới
    - Theo dõi tab update
    - Download file
    - Lưu global state
- **Ví dụ nhiệm vụ**
```js
chrome.runtime.onMessage.addListener(...)
chrome.tabs.create(...)
chrome.downloads.download(...)
```

*Tuy duy:* **Background = service của extension**

## 3. `content.js`
- **Vai trò**
    - Chạy trực tiếp trong trang web
    - Truy cập DOM
    - Click, scroll, scrape dữ liệu
- **Chỉ làm**:
    - Đọc HTML
    - Trigger hành vi user
    - Gửi data về background
- **Không nên làm**:
    - ❌ Không xử lý business logic lớn
    - ❌ Không export Excel
    - ❌ Không điều phối workflow nhiều tab
- *Tư duy*: **Content script = bot thao tác trong trang**

## 4. `popup.html + popup.js`
- **Vai trò**
    - UI cho người dùng
    - Nút Start / Stop
    - Cấu hình options
- **Ví dụ**
```js
document.getElementById("startBtn").onClink = () => {
    chrome.runtime.senMessage({action: "START_SCRAPE"})
}
```
- *Tư duy:* **Popup = control panel**

## 5. `utils/`
Đây là nơi chuyên nghiệp hóa code.
- Ví dụ:
    - **dom.js**
        - wait ForElement
        - clickAndWait
        - scrollToBottom
    - **scraper.js**
        - extractProduct
        - extractCommission
        - parsePrice
    - **excel.js**
        - convertToCSV
        - createExcelFile
    - **storage.js**
        - getConfig
        - saveConfig
- *Tuy duy:* **Mỗi file = 1 trách nhiệm duy nhất (Single Responsibiltity)**

# III. Workflow hoạt động của Extension
Ví dụ: Shopee Scraper
```js
User click START (popup)
   ↓
popup gửi message → background
   ↓
background lấy tab hiện tại
   ↓
background inject content.js (nếu cần)
   ↓
background gửi lệnh SCRAPE_PAGE
   ↓
content scrape DOM
   ↓
content gửi data về background
   ↓
background gom data
   ↓
background export file
```
# IV. Workflow tư duy viết code hợp lý
*Đây mới là phần quan trọng nhất.*
## BƯỚC 1 - Phân tích nghiệp vụ
*Trước khi code, trả lời:*
**1.** Dữ liệu lấy ở đâu
**2.** Cần click gì?
**3.** Có bao nhiêu trang?
**4.** Có cần mở tab mới không?
**5.** Output là gì?

*Ví dụ Shopee:*
- Lấy sản phẩm
- Lấy commission
- Xuất Excel

## BƯỚC 2 - Xác định vai trò từng module
| Tác vụ                | Module     |
| --------------------- | ---------- |
| Click page            | content    |
| Scrape DOM            | content    |
| Điều phối nhiều trang | background |
| Export file           | background |
| Lưu cấu hình          | storage    |

**👉 Không viết lẫn lộn.**
## BƯỚC 3 - Thiết kế luồng message rõ ràng
Ví dụ chuẩn:
```js
// popup → background
START_SCAPE

// background → content
SCRAPE_CURRENT_PAGE

// content → background
SCRAPE_DONE
```
*Đặt enum rõ ràng:*
```js
const ACTIONS = {
  START: "START",
  SCRAPE: "SCRAPE",
  DONE: "DONE"
};
```
## BƯỚC 4 - Viết theo thứ tự đúng
- **Sai lầm phổ biến:**
```js
// Viết content trước
// Viết popup sau
// Debug loạn
```
- **Đúng là phải:**
**1.** Viết content scrape trước (test bằng console)
**2.** Sau đó wrap vào extension
**3.** Sau đó mới thêm background orchestration
**4.** Cuối cùng mới làm UI

# V. Tuy duy kiến trúc tốt (Quan trọng)
- **1 file = 1 trách nhiệm**
Không làm kiểu:
```js
// content.js
- scrape
- export
- download
- mở tab
- lưu storage
```
*→ Sau này cực khóa bảo trì.*
- **Event-driven mindset**
    - Extension hoạt động theo:
        - Message
        - Event
        - Callback
    - Không phải kiểu chạy tuần tự như Node script.
- **State phải tập trung**
    - Không để:
        ```js
        let globalVar = ...
        ```
        Nằm rải rác.
    - Nên có:
        ```js
        background/state.js
        ```
# VI. Kiến trúc nâng cao (Pro Level)
Nếu bạn không muốn làm extension thương mại:
```js
core/
   workflow.js
   messageRouter.js
   stateManager.js

modules/
   scraper/
   exporter/
   affiliate/

infrastructure/
   chromeApi.js
   storage.js
```
*Đây là kiểu clean architecture cho extension.*

# VII. Lỗi kiến trúc thường gặp
- ❌ Content script tự mở tab
- ❌ Popup giữ state chính
- ❌ Không có message chuẩn
- ❌ Không phân tách scraper logic
- ❌ Gọi chrome API trực tiếp khắp nơi

# VIII. Tư duy chuẩn khi bắt đầu 1 tính năng mới
Hỏi:
**1.** Feature này thuộc UI hay hệ thống?
**2.** Có cần background tham gia không?
**3.** Có cần lưu state không?
**4.** Có thể tách thành module riêng không?

# IV. Tóm tắt cực ngắn
| Module     | Vai trò          |
| ---------- | ---------------- |
| manifest   | Cấu hình         |
| popup      | UI               |
| content    | Bot thao tác DOM |
| background | Orchestrator     |
| utils      | Business logic   |

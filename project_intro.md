Mình sẽ dạy bạn theo kiểu **mentor kỹ thuật thực chiến**:
- Có code đầy đủ
- Giải thích từng dòng
- Giải thích kiến trúc
- Giải thích vì sao làm vậy
- Áp dụng cho mọi website

# LEVEL 1 - ĐẾM SỐ LINK TRÊN TRANG
**Mục tiêu học được**:
- Hiểu manifest
- Hiểu popup
- Hiểu content script
- Hiểu message passing
- Hiểu event-driven model

## 1. CẤU TRÚC PROJECT
```code
my-extension/
│
├── manifest.json
├── popup.html
├── popup.js
└── content.js
```
## 2. `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Web Link Counter",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```
**Giải thích cặn kẽ**
- `"manifest_version": 3` 
Bắt buộc với Chrome hiện tại. 
Dùng cho service worker nếu có background.
- `"activeTab"` 
Cho phép truy cập tab hiện tại khi người dùng click extension. 
Nếu không có dòng này → bạn không inject được script.
- `"scripting"`
Cho phép dùng: **Javascript**
```js
chrome.scripting.executeScript()
```
- `"host_permissions": ["<all_urls>"]`
Cho phép chạy trên mọi website.
**Nếu chỉ muốn chạy 1 domain**:
```json
"https://example.com/*"
```
- `"action"`
Chỉ định file popup UI.
## 3. `popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      width: 220px;
      font-family: Arial;
      padding: 10px;
    }
    button {
      width: 100%;
      padding: 8px;
      margin-top: 10px;
    }
    #result {
      margin-top: 10px;
      font-weight: bold;
    }
  </style>
</head>
<body>

  <h3>Link Counter</h3>
  <button id="countBtn">Đếm số link</button>
  <div id="result"></div>

  <script src="popup.js"></script>
</body>
</html>
```
**Giải thích**
Popup:
- Có nút
- Có nơi hiển thị kết quả
- Không có quyền truy cập DOM trang web
## 4. `popup.js`
```js
document.getElementById("countBtn").addEventListener("click", async () => {

  // Lấy tab hiện tại
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  // Inject content script vào tab
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});
```
**Giải thích từng bước**
- **Bước 1 - Lấy tab hiện tại**
```js
chrome.tab.query()
```
Vì extension không biết tab nào đang active.
- **Bước 2 - Inject content script**
```js
chrome.scripting.executeScript()
```
Tại sao không khai báo content trong manifest?
Vì mình muốn inject khi cần, không chạy mọi lúc.
## 5. `content.js`
```js
// Đếm số thẻ <a>
const links = document.querySelectorAll("a");

// Hiển thị alert
alert("Trang này có " + links.length + " link.");

// Gửi kết quả về popup (nâng cao)
chrome.runtime.sendMessage({
  action: "LINK_COUNT",
  count: links.length
});
```
**Giải thích quan trọng**
- **document.querySelectorAll("a")**
    - Lấy tất cả thẻ link
    - NodeList
    - .length = số lượng

**Tại sao content script dùng được DOM?**
Vì nó chạy trong context của trang web.
Popup thì không.

## NÂNG CẤP: HIỂN THỊ KẾT QUẢ TRONG POPUP (CHUẨN HƠN)
Hiển thị alert chạy trong trang.
Giờ ta sửa lại để popup nhập dữ liệu.

**Sửa popup.js**
```js
document.getElementById("countBtn").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});

// Lắng nghe message
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "LINK_COUNT") {
    document.getElementById("result").innerText =
      "Số link: " + message.count;
  }
});
```
**Sửa content.js**
```js
const links = document.querySelectorAll("a");

chrome.runtime.sendMessage({
  action: "LINK_COUNT",
  count: links.length
});
```
## FLOW HOẠT ĐỘNG
```code
User click button
       ↓
popup.js
       ↓
Inject content.js
       ↓
Content đọc DOM
       ↓
Gửi message về popup
       ↓
Popup hiển thị kết quả
```

## KIẾN THỨC BẠN VỪA HỌC
| Kiến thức       | Ý nghĩa                   |
| --------------- | ------------------------- |
| Injection       | Chạy code trong trang     |
| DOM access      | Chỉ content script có     |
| Message passing | Giao tiếp giữa môi trường |
| Event driven    | Chỉ chạy khi click        |

## LỖI NGƯỜI MỚI HAY GẶP
1. Quên permissions
2. Quên host_permissions
3. Không reload extension sau khi sửa
4. Inject file sai đường dẫn
5. Popup đóng → mẫu listener

## CÁCH DEBUG
1. chrome://extensions
2. Click "Inspect views"
3. Debug popup console
4. Debug service worker nếu có

## BÀI TẬP MỞ RỘNG
Thử làm thêm:
1. Đếm số hình ảnh
2. Đếm số form
3. Tô đỏ tất cả link
4. Chỉ đếm link có chứa từ "login"

# LEVEL 2 TIẾP THEO BẠN SẼ HỌC
- Background script
- Download file
- Storage
- Async flow phức tạp hơn

**Nếu bạn muốn, mình sẽ dạy tiếp:**
- Level 2: Trích xuất dữ liệu và xuất file CSV
- Level 3: Dark mode toggle có lưu trạng thái
- Level 4: Auto scroll engine
- Level 5: Multi tab crawler
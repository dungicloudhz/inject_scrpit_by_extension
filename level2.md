Giờ ta bước vào **Level 2 - Trích xuất dữ liệu và xuất file CSV**.
Level này bạn sẽ hiểu sâu:
- Background (service worker)
- Message passing chuẩn kiến trúc
- Tạo file CSV đúng cách
- chrome.downloads API
- Phần tách trách nhiệm đúng chuẩn

# MỤC TIÊU LEVEL 2
Khi click nút:
1. Content script lấy dữ liệu từ trang
2. Gửi dữ liệu về background
3. Background tạo file CSV
4. Tự động tải file

## 1. CẤU TRÚC PROJECT
```text
my-extension/
│
├── manifest.json
├── popup.html
├── popup.js
├── content.js
└── background.js
```
## 2. `manifest.json`
```json
{
    "manifest_version": 3,
    "name": "Universal Data Extractor",
    "version": "2.0.0",
    "permission": [
        "activeTab",
        "scripting",
        "downloads",
    ],
    "host_permissions": [
        "<all_urls>"
    ],
    "action": {
        "default_popup": "popup.html"
    },
    "background": {
        "service_worker": "background.js"
    }
}
```

**Giải thích mới trong level 2**
- `"download"`
Cho phép dùng:
```js
chrome.downloads.download() // Không có dòng này → không tải file được.
```

- `"background": { service_worker }`
    - Giờ ta có background làm trung tâm xử lý.
    - Popup chỉ gửi lệnh.
    - Content chỉ lấy dữ liệu.
    - Background xử lý file.

## 3. `popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 220px; font-family: Arial; padding: 10px; }
    button { width: 100%; padding: 8px; }
  </style>
</head>
<body>

  <h3>Data Extractor</h3>
  <button id="exportBtn">Xuất CSV</button>

  <script src="popup.js"></script>
</body>
</html>
```
## 4. `popup.js`
```js
document.getElementById("exportBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    })

    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["content.js"]
    })
})
```
**Giải thích**
- Popup không xử lý dữ liệu.
- Popup chỉ inject content.
## 5. `content.js`
Ta sẽ trích xuất:
- Page title
- URL
- Tất cả link text + link URL
```js
function extractData() {
    const pageTitle = document.title;
    const pageUrl = window.location.href;

    const links = Array.from(document.querySelectorAll("a"))
        .map(link => ({
            text: link.innerText.trim(),
            href: link.href
        }))
        .filter(link => link.text !== "");

    chrome.runtime.sendMessage({
        action: "EXPORT_DATA",
        payload: {
            title: pageTitle,
            url: pageUrl,
            links: links
        }
    })
}

extractData();
```

**Giải thích quan trọng**
- **Vì sao dùng Array.form?**
    - `querySelectorAll` trả về NodeList.
    - NodeList không có `.map()`.
- **Vì sao filter text rỗng?**
    - Vì nhiều link không có text (icon, button...)

## 6. `background.js`
Đây là phần quan trọng nhất.
```js
function generateCSV(data) {

  let csvContent = "Page Title,Page URL,Link Text,Link URL\n";

  data.links.forEach(link => {

    const row = [
      `"${data.title}"`,
      `"${data.url}"`,
      `"${link.text.replace(/"/g, '""')}"`,
      `"${link.href}"`
    ];

    csvContent += row.join(",") + "\n";
  });

  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);

  chrome.downloads.download({
    url: dataUrl,
    filename: "extracted_data.csv",
    saveAs: true
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "EXPORT_DATA") {
    generateCSV(message.payload);
  }
});
```
**Giải thích sâu từng thành phần**
**1. Message listener**
```js
chrome.runtime.onMessage.addListener()
```
Background luôn lắng nghe.
**2. Tạo header CSV**
```js
let csvContent = "Page Title, Page URL, Link Text, Link URL\n";
```
CSV chuẩn:
- Phân cách bằng dấu phẩy
- Xuống dòng mỗi record

**3. Escape dấu "**
```js
link.text.replace(/"/g, '""')
```
CSV yêu cầu:
= Nếu chứa text `"`, phải đổi thành `""`.
- Nếu không → file hỏng.

**4. Blob**
```js
new Blob([csvContent], {type: "text/csv"})
```
Tạo file tạm trong memory.

**5. URL.createObjectURL**
Tạo URL nội bộ trỏ tới file đó.

**6. chrome.downloads.download**
Tải file xuống máy.
`saveAs: true` → hiện popup chọn nơi lưu.
## 🔄 FLOW HOẠT ĐỘNG LEVEL 2
```text
User click Export
        ↓
Popup inject content
        ↓
Content extract data
        ↓
Send message to background
        ↓
Background tạo CSV
        ↓
Download file
```
## KIẾN THỨC QUAN TRỌNG BẠN VỪA HỌC
| Thành phần    | Vai trò         |
| ------------- | --------------- |
| Popup         | Trigger         |
| Content       | Data extraction |
| Background    | File processing |
| Blob          | Tạo file        |
| downloads API | Tải file        |

## LỖI NGƯỜI MỚI HAY GẶP
1. Quên permission `"download"`
2. Quên reload extension
3. Popup đóng trước khi inject xong
4. Không escape dấu "

## BÀI TẬP NÂNG CAO
1. Chỉ xuất link chứa từ "login"
2. Xuất thêm số lượng link
3. Thêm timestamp vào tên file
4. Xuất định dạng TSV thay vì CSV
5. Xuất Excel (cần thư viện nâng cao)

## SAU LEVEL 2 BẠN ĐÃ ĐẠT
- Hiểu đúng kiến trúc MV3
- Biết phân chia trách nhiệm
- Biết tạo file động
- Biết flow message passing chuẩn

Tiếp theo bạn muốn:
- Level 3: Dark Mode Toggle có lưu trạng thái
- Level 4: Auto Scroll Engine (automation bắt đầu)
- Level 5: Multi-tab crawler (gần senior)
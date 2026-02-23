**Level 2 nâng cao**:
- Background script sâu hơn
- Download file chuẩn production
- Storage (lưu cấu hình + trạng thái)
- Async flow phức tạp hơp (Promise + callback đúng chuẩn MV3)

# MỤC TIÊU LEVEL 2 NÂNG CAO
Extension sẽ:
1. Popup có form nhập:
    - Tên file
    - Chỉ xuất link chứa từ khóa X
2. Lưu config vào `chrome.storage`
3. Inject content script
4. Content extract data
5. Background xử lý async
6. Xuất file CSV
7. Trả trạng thái thành công về popup

# CẤU TRÚC PROJECT
```text
my-extension/
│
├── manifest.json
├── popup.html
├── popup.js
├── content.js
└── background.js
```
## 1. manifest.json
```json
{
    "manifest_version": 3,
    "name": "Advanced Data Extractor",
    "version": "2.1.0",
    "permissions": [
        "activeTab",
        "scripting",
        "downloads",
        "storage"
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
**Giải thích mới**
- `"storage"`
Cho phép dùng:
```js
chrome.storage.local
```
Nếu không có dòng này → không lưu config được.

## 2. `popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 250px; font-family: Arial; padding: 10px; }
    input { width: 100%; margin-bottom: 8px; padding: 5px; }
    button { width: 100%; padding: 8px; }
    #status { margin-top: 10px; color: green; }
  </style>
</head>
<body>

  <h3>Advanced Export</h3>

  <input id="filename" placeholder="Tên file (không cần .csv)">
  <input id="keyword" placeholder="Chỉ xuất link chứa từ khóa">

  <button id="exportBtn">Export CSV</button>

  <div id="status"></div>

  <script src="popup.js"></script>
</body>
</html>
```
## 3. `popup.js`
```js
document.addEventListener("DOMContentLoaded", async () => {
    // Load config đã lưu
    const config = await chrome.storage.local.get(["filename", "keyword"]);

    if(config.filename)
        document.getElementById("filename").value = config.filename;

    if(config.keyword)
        document.getElementById("keyword").value = config.keyword;
})

document.getElementById("exportBtn").addEventListener("click", async () => {
    const fileName = document.getElementById("filename").value || "data";
    const keyword = document.getElementById("keyword").value || "";

    // Lưu config
    await chrome.storage.local.set({ filename, keyword });

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    })

    // Inject content
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
    })
})

// Nhận trạng thái từ background
chrome.runtime.onMessage.addListener((message) => {
    if(message.action === "EXPORT_DONE") {
        document.getElementById("status").innerText = "Xuất file thành công!";
    }
})
```
**Giải thích**
**Vì sao load config khi DOMContentLoaded?**
Popup đóng → mở lại → dữ liệu mất.
Phải đọc từ storage.

## 4. `content.js`
```js
async function extractData() {
    const config = await chrome.storage.local.get(["keyword"]);
    const keyword = config.keyword || "";

    const link = Array.from(document.querySelectorAll("a"))
        .map(link => ({
            text: link.innerText.trim(),
            href: link.href
        }))
        .filter(link => {
            link.text !== "" && link.href.includes(keyword)
        })

    chrome.runtime.sendMessage({
        action: "PROCESS_DATA",
        payload: links
    })
}

extractData();
```
**Async ở đây là gì?**
`chrome.storage.local.get()` trả về Promise.
Ta dùng `await`.
Đây là async flow thật sự.
## 5. `background.js` (PHẦN QUAN TRỌNG NHẤT)
```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PROCESS_DATA") {
        handleExport(message.payload)
            .then(() => {
                chrome.runtime.sendMessage({ action: "EXPORT_DONE" });
            })
            .catch(err => {
                console.error(err);
            })

        return true; // QUAN TRỌNG CHO ASYNC
    }
})

async function handleExport(links) {
    const config = await chrome.storage.local.get(["filename"]);
    const filename = (config.filename || "data") + ".csv";

    let csv = "Link Text, Link URL \n";

    links.forEach(link => {
        const row = [
            `"${link.text.replace(/"/g, '""')}"`,
            `"${link.href}"`
        ];
        csv += row.join(",") + "\n";
    });

    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
    })
}
```
**Giải thích `async` flow phức tạp**
- **Vì sao phải `return true` ?**
Trong MV3:
Nếu bạn dùng async bên trong listener mà không `return true` → message channel đóng sớm.
Đây là lỗi 80% dev mới mắc.

**Flow thực tế**
```text
Content gửi PROCESS_DATA
        ↓
Background nhận
        ↓
handleExport() async
        ↓
await storage
        ↓
await download
        ↓
Gửi EXPORT_DONE về popup
```
# KIẾN THỰC BẠN VỪA HỌC
| Chủ đề         | Hiểu được       |
| -------------- | --------------- |
| Storage        | Lưu cấu hình    |
| Async          | await + Promise |
| Background     | Xử lý trung tâm |
| Message flow   | Đa chiều        |
| Error handling | .catch          |

# LỖI NGUY HIỂM
1. Quên `return true`
2. Không await storage
3. Popup đóng → mất stage
4. Tên file có ký tự đặc biệt

## THỬ THÁCH NÂNG CAO
1. Thêm process indicator
2. Thêm timestamp vào tên file
3. Nếu không có link → báo lỗi
4. Tự động đóng popup sau khi export
5. Cho phép chọn delimeter (CSV/ TSV)

## Sau level này
Bạn sẽ hiểu:
- Background lifecycle
- Async trong MV3
- Storage persistence
- File generation chuẩn
- Event-driven architecture

Tiếp theo bạn muốn đi hướng nào?

- 🔵 Level 3: Dark Mode Toggle + MutationObserver
- 🟣 Level 4: Auto Scroll Engine + Retry logic
- 🔴 Level 5: Multi-tab crawler (kiến trúc gần automation framework)
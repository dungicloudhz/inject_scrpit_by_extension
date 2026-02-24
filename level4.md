Level 4 là bước bạn chuyển từ **extension đọc dữ liệu** sang **automation engine thự sự**.
Ở level này bạn sẽ học:
- Auto scroll thông minh
- Detect khi nào trang load thêm
- Retry khi lỗi
- Timeout control
- Even-driven + async nâng cao
- Kiến trúc automation có thể tái sử dụng cho mọi website

Không dùng Shopee. Làm generic cho mọi site dạng infinite scroll.


# LEVEL 4: Auto Scroll Engine + Retry Logic

**🎯 Mục tiêu**
*Tạo extension có thể:*
**1.** Tự động scroll xuống cuối trang
**2.** Chờ dữ liệu load thêm
**3.** Lặp lại cho đến khi:
    - Hết dữ liệu
    - Hoặc đặt số lượng mong muốn
**4.** Retry nếu scroll thất bại
**5.** Xuất file CSV

**🧠 Kiến trúc tổng thể**
```js
Popup
  ↓ gửi START_AUTOMATION
Background
  ↓ inject content script
Content Script
  ↓ AutoScrollEngine
  ↓ Collect Data
  ↓ Send result
Background
  ↓ Tạo file
  ↓ Download
```

**📁 Cấu trúc project**
```js
auto-scroll-extension/
│
├── manifest.json
├── popup.html
├── popup.js
├── background.js
└── content.js
```
## 1. `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "Auto Scroll Engine",
  "version": "1.0",
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "downloads"
  ],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

## 2. `popup.html`
```html
<!DOCTYPE html>
<html>
<body>
  <button id="start">Start Automation</button>
  <script src="popup.js"></script>
</body>
</html>
```
## 3. `popup.js`
```js
document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({
    action: "START_AUTOMATION",
    tabId: tab.id
  });
});
```
## 4. `background.js`
```js
chrome.runtime.onMessage.addListener(async (message, sender) => {

  if (message.action === "START_AUTOMATION") {

    await chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ["content.js"]
    });

  }

  if (message.action === "AUTOMATION_DONE") {

    const csv = generateCSV(message.data);

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url,
      filename: "auto_data.csv"
    });
  }
});


function generateCSV(data) {
  const header = "Title\n";
  const rows = data.map(item => item.title).join("\n");
  return header + rows;
}
```
## 5. `content.js`
Đây là trái tim của Level 4.

- **🧠 STEP 1 — Auto Scroll Engine**
```js
async function autoScroll({
    maxScroll = 20,
    delay = 1500,
    retryLimit = 3
}) {
    let lastHeight = 0;
    let retry = 0;
    for (let i = 0; i < maxScroll; i++) {
        window.scrollTo(0, document.body.scrollHeight);

        await wait(delay);

        const newHeight = document.body.scrollHeight;

        if (newHeight === lastHeight) {
            retry++;
            if (retry >= retryLimit) {
                console.log("No more content.");
                break;
            }
        } else {
            retry = 0;
            lastHeight = newHeight;
        }
    }
}
```

- **🧠 STEP 2 - Helper wait**
```js
function wait(ms) {
    return Promise(resolve => setTimeout(resolve, ms));
}
```
- **🧠 STEP 3 — Collect Data**
Generic ví dụ: lấy tất cả thẻ h2
```js
function collectData() {
    const elements = document.querySelectorAll("h2");

    return Array.from(elements).map(el => ({
        title: el.innerText.trim()
    }))
}
```
- **🧠 STEP 4 — Orchestrator**
```js
(async function runAutomation() {
    console.log("Automation started ...");

    await autoScroll({
        maxScroll: 30,
        delay: 2000,
        retryLimit: 2
    });

    const data = collectData();

    chrome.runtime.sendMessage({
        action: "AUTOMATION_DONE",
        data
    });
})()
```
# Bây giờ bạn đã có gì?
Bạn vừa xây:
- Infinite scroll engine
- Retry logic
- Async loop
- Content detection
- File export
- Background communication
- Full automation flow

# Phân tích chuyên sâu

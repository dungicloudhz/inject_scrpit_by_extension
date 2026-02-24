Giờ chúng ta vào **LEVEL 3 - Dark Mode Toggle + MutationObserver**
Level này bạn sẽ hiểu sâu:
- DOM manipulation thực chiến
- Inject CSS đúng cách
- chrome.storage để persist trạng thái
- MutationObserver để theo dõi thay đổi DOM
- Lifecycle của content script khi trang reload

# MỤC TIÊU LEVEL 
**Extension sẽ**:
1. Click icon
2. Bật Dark Mode cho trang hiện tại
3. Reload trang vẫn giữ Dark Mode
4. Nếu trang reload thêm nội dung động (SPA, infinite scroll) → vẫn giữ dark mode

# CẤU TRÚC PROJECT
```json
my-extension/
│
├── manifest.json
├── popup.html
├── popup.js
└── content.js
```
Level này không cần background.

# 1. `manifest.json`
```json
{
    "manifest_version": 3,
    "name": "Universal Dark Mode",
    "version": "3.0.0",
    "permissions": [
        "activeTab",
        "scripting",
        "storage"
    ],
    "host_permissions": [
        "<all_urls>"
    ],
    "action": {
        "default_popup": "popup.html"
    }
}
```
**Giải thích**
- `storage` → lưu trạng thái bật/tắt
- `activeTab + scripting` → inject content script

# 2. `popup.html`
```html
<!DOCTYPE html>
<html>
<head>
  <style>
    body { width: 200px; padding: 10px; font-family: Arial; }
    button { width: 100%; padding: 8px; }
  </style>
</head>
<body>

  <button id="toggleBtn">Toggle Dark Mode</button>

  <script src="popup.js"></script>
</body>
</html>
```
# 3. `popup.js`
```js
document.getElementById("toggleBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
    });

    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        files: ["content.js"]
    })
})
```
# 4. `content.js` (PHẦN QUAN TRỌNG)
```js
(async function () {
    const config = await chrome.storage.local.get(["darkMode"]);
    const isDark = config.darkMode || false;

    if(!isDark) {
        enableDarkMode();
        await chrome.storage.local.set({darkMode: true});
    } else {
        disableDarkMode();
        await chrome.storage.local.set({darkMode: false});
    }
})
```
**Giải thích**
Content script:
- Đọc trạng thái hiện tại
- Toggle
- Lưu lại

# 5. Hàm enable / disable
**Thêm dưới file `content.js`**:
```js
function enableDarkMode() {
    document.documentElement.classList.add("my-dark-mode");
    injectStyle();
    observeDom();
}
function disableDarkMode() {
    document.documentElement.classList.remove("my-dark-mode");
    const style = document.getElementById("dark-mode-style");
    if(style) style.remove();
    if(window.darkObserver)
        window.darkObserver.disconnect();
}
```
# 6. Inject CSS
```js
function injectStyle() {
    if (document.getElementById("dark-mode-style")) return.
    const style = document.createElement("style");
    style.id = "dark-mode-style";

    style.textContent = `
        .my-dark-mode {
        background-color: #121212 !important;
        color: #e0e0e0 !important;
        }

        .my-dark-mode * {
        background-color: transparent !important;
        color: inherit !important;
        border-color: #333 !important;
        }

        .my-dark-mode img {
        filter: brightness(0.8) contrast(1.2);
        }
    `;

    document.head.appendChild(style);
}
```

**Tại sao không sửa trực tiếp body?**
Vì nhiều site override CSS.
Ta thêm vào `<html>` → CSS specificity (tính đặc hiệu) mạnh hơn.

# 7. MutationObserver (PHẦN NÂNG CAO)
```js
function observeDOM() {
    const observer = new MutationObserver(() => {
        if(!document.documentElement.classList.contains("my-dark-mode")) return;
        injectStyle();
    })
    observer.observe(document.body, {
        childList: true,
        subtree: true
    })
    window.darkObserver = observer;

}
```

**TẠI SAO CẦN MutationObserver?**
Vì:
    - Trang SPA load nội dung động
    - Infinite scroll
    - React / Vue re-render
Nếu không theo dõi DOM → dark mode mất hiệu lực

# FLOW HOẠT ĐỘNG
```text
User click toggle
      ↓
Inject content.js
      ↓
Đọc storage
      ↓
Toggle trạng thái
      ↓
Inject CSS
      ↓
Theo dõi DOM thay đổi
```
# KIẾN THỨC BẠN VỪA HỌC
| Chủ đề              | Hiểu được      |
| ------------------- | -------------- |
| CSS Injection       | Tác động UI    |
| Storage persistence | Giữ trạng thái |
| MutationObserver    | Theo dõi DOM   |
| SPA behavior        | Trang động     |
| DOM lifecycle       | Re-render      |

# LỖI NGƯỜI MỚI
1. Inject CSS nhiều lần → trùng style
2. Không disconnect observer
3. Không dùng !important → site override
4. Không lưu trạng thái → reload sẽ mất

# THỬ THÁCH NÂNG CAO
- Chỉ dark mode một phần trang
- Thêm slider chỉnh độ sáng
- Tự động bật dark mode theo giờ
- Lưu dark mode theo domain (không global)
- Detect prefers-color-scheme

# Sau Level 3
Bạn đã hiểu:
- Manipulate DOM nâng cao
- Theo dõi DOM thay đổi
- Xử lý SPA
- Persist trạng thái UI
Tiếp theo bạn muốn:
- 🟣 Level 4: Auto Scroll Engine + Retry logic (automation thật sự)
- 🔴 Level 5: Multi-tab crawler (kiến trúc gần framework automation)
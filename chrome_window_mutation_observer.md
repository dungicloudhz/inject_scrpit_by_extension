Tổng hợp **toàn bộ kiến thức**: `window` + `MutationObserver` + `chrome API` theo hướng chuyên sâu, có kiến trúc, có luồng hoạt động, đúng với case bạn đang làm **Chrome Extension scraper (Shopee Affiliate)**

Mình sẽ chia làm 6 phần lớn:
1. Kiến trúc Chrome Extension (Manifest V3)
2. Toàn bộ nhóm `chrome.*` API quan trọng
3. `window` trong content script
4. `MutationObserver` cơ chế nội bộ
5. Cách chúng phối hợp với nhau
6. Mẫu kiến trúc production-ready cho scraper

# I. Kiến trúc Chrome Extension (Manifest V3)
Trong MV3, extension có 3 execution context:
| Thành phần                  | Có DOM trang web? | Có window? | Vai trò       |
| --------------------------- | ----------------- | ---------- | ------------- |
| Popup                       | ❌                 | ✔          | UI            |
| Service Worker (background) | ❌                 | ❌          | Điều phối     |
| Content Script              | ✔                 | ✔          | Tương tác DOM |

**Quan trọng**:
- `chrome.*` dùng để giao tiếp
- `window` đùng để lắng nghe event trang
- `MutationObserver` dùng để theo dõi DOM hoạt động

# II. Toàn bộ nhóm `chrome.*` API quan trọng
Chrome API hoạt động async (Promise-based trong MV3).
## 1. `chrome.tabs`
Dùng để thao tác với tab trình duyệt
- **Lấy tab hiện tại**
```js
const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
})
```
- **Gửi message đến content script**
```js
chrome.tabs.sendMessage(tab.id, {
    action: "SCRAPE"
})
```
## 2. `chrome.scripting`
Chỉ có trong MV3 → inject script
```js
await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    files: ["content.js"]
})
```
Hoặc inject function trực tiếp:
```js
await chrome.scripting.executeScript({
    target: {tabId: tab.id},
    func: () => console.log(document.title)
})
```
## 3. `chrome.runtime`
Giao tiếp giữa các môi trường.
- **Gửi message**
```js
chrome.runtime.sendMessage({
    action: "DATA",
    payload: data
})
```
- **Nhận message**
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if(msg.action === "DATA") console.log(msg.payload);
})
```
## 4. `chrome.storage`
Lưu config, state
```js
await chrome.storage.local.set({
    commission: 10
});
const data = await chrome.storage.local.get("commission");
```

## 5. `chrome.action`
*Badge extension* (Phần mở rộng của huy hiệu)
```js
chrome.action.setBadgeText({text: "5"});
```
## 6. `chrome.webNavigation`
Theo dõi chuyển sang SPA
```js
chrome.webNavigation.onCompleted.addListener((details) => {
    console.log("Navigation done", details.url)
})
```
# III. `window` trong Content Script
Trong content script, `window` là của trang nhưng chạy trong isolated world.
## 1. Lifecycle event
```js
window.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeunload", cleanup);
```
## 2. Scroll logic (infinite scroll)
```js
window.addEventListener("scroll", () => {
    const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight;
    if(bottom) console.log("Bottom reached");
})
```
Nên throttle:
```js
let timeout;
window.addEventListener("scroll", () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        console.log("Scroll stopped");
    }, 200)
});
```
## 3. SPA navigation detection
Shopee là SPA → không reload.
Giải pháp:
```js
const pushState = history.pushState;
history.pushState = function () {
    pushState.apply(this, arguments);
    window.dispatchEvent(new Event("routechange"));
}
```

# IV. MutationObserver - Cơ chế chuyên sâu
MutationObserver hoạt động trong microtask queue.
Nó không trigger ngay lập tức mà chờ call stack rỗng.

## 1. Cấu trúc
```js
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        console.log(mutation.type);
    })
})
```
## 2. Options đầy đủ
```js
observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true
})
```
## 4. MutationRecord chi tiết
| Thuộc tính    | Ý nghĩa                                |
| ------------- | -------------------------------------- |
| type          | childList / attributes / characterData |
| target        | node bị thay đổi                       |
| addedNodes    | node mới                               |
| removedNodes  | node bị xóa                            |
| attributeName | tên attribute đổi                      |

# V. Cách `chrome + window + MutationObserver` phối hợp
Flow chuẩn scaper SPA:
```js
Popup click
   ↓
chrome.tabs.query()
   ↓
chrome.scripting.executeScript()
   ↓
content.js chạy
   ↓
window DOMContentLoaded
   ↓
waitForElement()
   ↓
MutationObserver()
   ↓
Collect data
   ↓
chrome.runtime.sendMessage()
   ↓
background xử lý
```

# VI. Ví dụ Production-ready Scaper Architecture
**content.js**
## 1. Đợi container xuất hiện
```js
function waitForElement(selector) {
    return new Promise((resolve) => {
        const el = document.querySelector(selector);
        if(el) return resolve(el);

        const observer = new MutationObserver(() => {
            const el = document.querySelector(selector);
            if (el) {
                resolve(el);
                observer.disconnect();
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        })
    })
}
```
## Observer sản phẩm
```js
const seen = new Set();

function observerProducts(container) {
    const observer = new MutationObserver((mations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if(node.nodeType === 1) {
                    const link = node.querySelector("a")?.href;
                    if(link && !seen.has(link)) {
                        seen.add(link);
                        chrome.runtime.sendMessage({
                            action: "NEW_PRODUCT",
                            payload: link
                        })
                    }
                }
            })
        })
    })
    observer.observe(container, {
        childList: true
    });
}
```
# VII. Những lỗi phổ biến
- Inject script nhiều lần
- Observe toàn bộ document + subtree true
- Không disconnect observer
- Không dedupe data
- Không xử lý SPA route change

# VIII. Khi nào nên dùng cái gì?
| Trường hợp            | Dùng             |
| --------------------- | ---------------- |
| Lấy tab hiện tại      | chrome.tabs      |
| Inject content script | chrome.scripting |
| Gửi dữ liệu           | chrome.runtime   |
| Theo dõi DOM thay đổi | MutationObserver |
| Theo dõi scroll       | window.scroll    |
| Theo dõi SPA route    | history patch    |

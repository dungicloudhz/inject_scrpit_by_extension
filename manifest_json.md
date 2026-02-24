Mình sẽ tổng hợp **toàn bộ cấu trúc `manifest.json` trong Chrome Extension (Manifest V3)** theo hướng:
**1.** Tổng quan kiến trúc
**2.** Giải thích chi tiết từng field
**3.** Permissions (rất quan trọng với scraper)
**4.** Host permissions
**5.** Content scripts
**6.** Background service worker
**7.** Action (popup, icon)
**8.** Web accessible resources
**9.** CSP & bảo mật
**10.** Ví dụ manifest chuẩn cho Shopee Scraper

# I. Manifest là gì?
`manifest.json` là **file cấu hình trung tâm** của Chrome Extension.
- **Nó định nghĩa**:
    - Extension có quyền gì
    - Chạy script nào
    - Inject ở đâu
    - UI là gì
    - Background xử lý gì
- **Trong MV3**:
```json
{
    "manifest_version": 3
}
```
MV2 đã bị deprecated (không dùng nữa).

# II. Cấu trúc cơ bản tối thiểu
```json
{
    "manifest_version": 3,
    "name": "Shopee Scraper",
    "version": "1.0",
    "description": "Scrape Shopee products"
}
```

# III. Giải thích chi tiết từng field
## 1. `manifest_version`
```json
"manifest_version": 3
```
**Bắt buộc.**
**MV3 dùng**:
- Service worker thay background page
- scripting API thay tabs.executeScript
- CSP chặt chẽ hơn

## 2. `name`, `version`, `description`
Thông tin hiển thị trong `chrome://extensions`
## 3. `action`
Dùng để tạo popup khi click icon extension.
```json
"action": {
    "default_popup": "popup.html",
    "default_icon": {
        "16": "icons/16.png",
        "48": "icons/48.png",
        "128": "icons/128.png"
    }
}
```
**Giải thích:**
| Field         | Ý nghĩa           |
| ------------- | ----------------- |
| default_popup | UI khi click icon |
| default_icon  | Icon extension    |
| default_title | Tooltip           |

## 4. `background`
MV3 dùng service worker:
```json
"background": {
    "service_worker": "background.js"
}
```
Khác MV2:
- Không còn persistent background page
- Service worker sẽ sleep khi idle

👉 Quan trọng khi scrape dài.

## 5. `permissions`
Định nghĩa API extension được phép dùng.
Ví dụ:
```json
"permissions": [
    "tabs",
    "scripting",
    "storage",
    "downloads"
]
```
**Một số permission quan trọng**:
| Permission    | Dùng khi                       |
| ------------- | ------------------------------ |
| tabs          | Lấy tab                        |
| scripting     | Inject script                  |
| storage       | Lưu config                     |
| downloads     | Xuất file                      |
| activeTab     | Tạm quyền trên tab đang active |
| webNavigation | Theo dõi điều hướng            |
| webRequest    | Theo dõi network               |

## 6. `host_permissions`
Quyền truy cập vào domain cụ thể:
```json
"host_permissions": [
    "https://shopee.vn/*"
]
```
**Nếu không có**:
- Không inject được script
- Không đọc DOM

**Bạn có thể dùng**:
- Không inject được script
- Không đọc DOM

**Bạn có thể dùng**:
```json
"<all_urls>"
```
Nhưng không nên nếu không cần.

## 7. `content_scripts`
Inject tự động khi vào trang
```json
"content_scripts": [
    {
        "matches": ["https://shopee.vn/*"],
        "js": ["content.js"],
        "run_at": "document_idle"
    }
]
```
**run_at options**:
| Giá trị        | Khi nào chạy        |
| -------------- | ------------------- |
| document_start | Trước khi DOM parse |
| document_end   | DOM xong            |
| document_idle  | Sau khi load        |

👉 Scraper nên dùng `document_idle`.

## 8. `web_accessible_resource`
Cho phép page truy cập file extension.
```json
"web_accessible_resources": [
    {
        "resources": ["inject.js"],
        "matches": ["https://shopee.vn/*"]
    }
]
```
Dùng khi bạn inject trực tiếp vào page context.

## 9. `icons`
```json
"icons": {
  "16": "icons/16.png",
  "48": "icons/48.png",
  "128": "icons/128.png"
}
```

## 10. `options_page`
Trang cấu hình extension.
```json
"options_page": "options.html"
```
## 11. `content_security_policy`
MV3 mặc định:
- Không cho inline script
- Không cho eval

Ví dụ custom CSP:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self';"
}
```

# IV. So sánh `permissions` vs `host_permissions`
| Loại             | Dùng cho         |
| ---------------- | ---------------- |
| permissions      | Chrome API       |
| host_permissions | Truy cập website |

Bạn có thể:
```json
"permissions": ["scripting"],
"host_permissions": ["https://shopee.vn/*"]
```
# V. Ví dụ Manifest chuẩn cho Shopee Affiliate Scraper
```json
{
  "manifest_version": 3, 
  // Bắt buộc. Khai báo dùng Manifest V3 (service worker, scripting API, CSP chặt chẽ)

  "name": "Shopee Affiliate Scraper", 
  // Tên extension hiển thị trong chrome://extensions và Chrome Web Store

  "version": "1.0", 
  // Phiên bản extension (bắt buộc khi publish / update)

  "description": "Scrape Shopee products with commission",
  // Mô tả ngắn hiển thị trong trang quản lý extension

  "action": {
    "default_popup": "popup.html"
    // File UI mở ra khi người dùng click icon extension
    // Popup chạy trong môi trường riêng (không có DOM của trang)
  },

  "background": {
    "service_worker": "background.js"
    // Service Worker của MV3
    // Chạy nền để xử lý message, orchestration, export file...
    // Không persistent, sẽ sleep khi idle
  },

  "permissions": [
    "tabs",       
    // Cho phép dùng chrome.tabs (query, sendMessage, create tab...)

    "scripting",  
    // Cho phép dùng chrome.scripting.executeScript để inject JS vào tab

    "storage",    
    // Cho phép dùng chrome.storage.local để lưu config, commission...

    "downloads",  
    // Cho phép dùng chrome.downloads để export file Excel/CSV

    "activeTab"   
    // Cho phép truy cập tạm thời tab đang active khi user click extension
    // Tăng bảo mật so với host_permissions rộng
  ],

  "host_permissions": [
    "https://shopee.vn/*",
    // Cho phép extension đọc/ghi DOM hoặc inject script vào shopee.vn

    "https://affiliate.shopee.vn/*"
    // Cho phép truy cập trang affiliate để lấy commission
  ],

  "content_scripts": [
    {
      "matches": ["https://shopee.vn/*"],
      // Tự động inject content.js khi URL match pattern

      "js": ["content.js"],
      // File chạy trong context của trang web (có DOM access)

      "run_at": "document_idle"
      // Inject sau khi DOM load xong (an toàn cho scraper)
      // Các giá trị khác: document_start, document_end
    }
  ],

  "icons": {
    "16": "icons/16.png",
    // Icon nhỏ (toolbar, list view)

    "48": "icons/48.png",
    // Icon trung bình

    "128": "icons/128.png"
    // Icon lớn (Chrome Web Store)
  }
}
```
# VI. Flow hoạt động với manifest này
```js
User click icon
   ↓
popup.html mở
   ↓
popup gọi chrome.tabs.query
   ↓
background inject content.js
   ↓
content.js dùng window + MutationObserver
   ↓
chrome.runtime.sendMessage
   ↓
background xử lý + export
```
# VII. Nhũng lỗi phổ biến
- ❌ Quên host_permissions → inject thất bại
- ❌ Thiếu scripting permission → executeScript lỗi
- ❌ Dùng inline JS trong popup (MV3 cấm)
- ❌ Không hiểu service worker sleep
# VIII. Tối ưu Manifest cho production
- Không dùng `<all_urls>` nếu không cần
- Chỉ xin đúng permission cần thiết
- Tách logic vào background
- Không inject script thừa

# IX. Tổng kết toàn bộ hệ sinh thái extension
| Thành phần      | Khai báo ở đâu            |
| --------------- | ------------------------- |
| Popup           | action.default_popup      |
| Background      | background.service_worker |
| Content Script  | content_scripts           |
| Domain truy cập | host_permissions          |
| Chrome API      | permissions               |

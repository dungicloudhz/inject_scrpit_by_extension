# LEVEL 5 - Build Automation Framework (Reusable Engine)
Mục tiêu: `Viết 1 extension có thể chạy automation cho "nhiều website khác nhau" mà không phải sửa core logic`.

# Tư duy Level 5
- Thay vì viết:
```js
scroll()
collectShopee()
exportCSV()
```
- Ta sẽ viết:
```js
runAutomation(config)
```
- Và `config` quyết định:
  - Scroll như thế nào
  - Lấy selector nào
  - Stop khi nào
  - Xuất file gì

# Kiến trúc Framework
```js
Popup
  ↓ gửi CONFIG
Background
  ↓ inject runner
Content Script
  ↓ AutomationEngine(config)
      ↓ ScrollStrategy
      ↓ StopStrategy
      ↓ ExtractStrategy
  ↓ Send data
Background
  ↓ Export
```
# Cấu trúc project
```js
automation-framework/
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
  "name": "Automation Framework",
  "version": "1.0",
  "permissions": [
    "activeTab",
    "scripting",
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
## 2. `popup.js` - gửi config
```js
document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const config = {
    scroll: {
      maxScroll: 30,
      delay: 2000
    },
    stopCondition: {
      type: "itemCountStable",
      selector: "h2"
    },
    extract: {
      itemSelector: "h2",
      fields: {
        title: null
      }
    }
  };

  chrome.runtime.sendMessage({
    action: "RUN_AUTOMATION",
    tabId: tab.id,
    config
  });
});
```

## 3. `background.js`
```js
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "RUN_AUTOMATION") {
    await chrome.scripting.executeScript({
      target: {tabId: message.tabId},
      files: ["content.js"]
    });

    chrome.tabs.sendMessage(message.tabId, {
      action: "START_ENGINE",
      config: message.config
    });
  }

  if (message.action === "AUTOMATION_DONE") {
    const csv = generateCSV(message.data);

    const blob = new Blob([csv], {type: "text/csv"});
    const url = URL.createObjectUrl(blob);

    chrome.downloads.download({url, filename: "result.csv"})
  }
})

function generateCSV(data) {
  const header = "Title\n";
  const rows = data.map(x => x.title).join("\n");
  return header + rows;
}
```
## 4. `content.js` - Automation Engine
*Đây là phần quan trọng nhất.*
- **Engine Core**
```js
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.action === "START_ENGINE") {
    const engine = new AutomationEngine(message.config);
    const data = await engine.run();

    chrome.runtime.sendMessage({
      action: "AUTOMATION_DONE",
      data
    });
  }
});
```
- **AutomationEngine Class**
```js
class AutomationEngine {
  constructor(config) {
    this.config = config;
  }

  async run() {
    await this.runScroll();
    return this.extractData();
  }

  async runScroll() {
    const { maxScroll, delay } = this.config.scroll;
    let previousCount = 0;
    for (let i = 0; i < maxScroll; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await this.wait(delay);

      if(this.shouldStop(previousCount)) {
        break;
      }

      previousCount = this.getItemCount();
    }
  }

  shouldStop(previousCount) {
    const stopConfig = this.config.stopCondition;

    if(stopConfig.type === "itemCountStable") {
      const currentCount = document.querySelectorAll(stopConfig.selector).length;

      return currentCount = previousCount;
    }

    return false;
  }

  getItemCount() {
  return document.querySelectorAll(this.config.stopCondition.selector).length;
  }

  extractData() {
    const { itemSelector, fields } = this.config.extract;

    const items = document.querySelectorAll(itemSelector);

    return Array.from(items).map(item => {

      const result = {};

      for (let key in fields) {

        if (fields[key] === null) {
          result[key] = item.innerText.trim();
        } else {
          const child = item.querySelector(fields[key]);
          result[key] = child ? child.innerText.trim() : "";
        }
      }

      return result;
    });
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Điều gì vừa xảy rả?s
Bạn vừa:
- Tách scroll logic
- Tách stop logic
- Tách extract logic
- Cho phép thay đổi site bằng config
- Xây 1 framework mini

## Thử đổi sites
Ví dụ config cho trang blogs:
```js
const config = {
  scroll: {
    maxScroll: 20,
    delay: 1500
  },
  stopCondition: {
    type: "itemCountStable",
    selector: ".post"
  },
  extract: {
    itemSelector: ".post",
    fields: {
      title: "h3",
      summary: ".description"
    }
  }
};
```
*Không cần sửa engine.*

# Kiến thức nâng cấp bạn vừa học
- Strategy patterns
- Config-driven architectures
- Separation of concernss
- Reusable engine design
- Framework thinking

# Bạn vừa vượt khỏi mức script
Bạn đang xây: `Automation Infrastructure`.

# Bước tiếp theo đề suất
- *Giờ framework đã có.*
- *Bạn muốn:*
  - 🧩 Level 6: Chuyển toàn bộ sang JSON config thật sự (không hardcode JS)
  - 🧠 Level 6: MutationObserver để bỏ delay cứng
  - 🤖 Level 6: Action Queue (click → wait → type → scroll)
  - 🛡️ Level 6: Human-like behavior engine
  - ⚙️ Level 6: Multi-site profile manager
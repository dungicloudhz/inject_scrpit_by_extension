document.addEventListener("DOMContentLoaded", async () => {

  // Load config đã lưu
  const config = await chrome.storage.local.get(["filename", "keyword"]);

  if (config.filename)
    document.getElementById("filename").value = config.filename;

  if (config.keyword)
    document.getElementById("keyword").value = config.keyword;
});

document.getElementById("exportBtn").addEventListener("click", async () => {

  const filename = document.getElementById("filename").value || "data";
  const keyword = document.getElementById("keyword").value || "";

  // Lưu config
  await chrome.storage.local.set({ filename, keyword });

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  // Inject content
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });
});

// Nhận trạng thái từ background
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "EXPORT_DONE") {
    document.getElementById("status").innerText =
      "Xuất file thành công!";
  }
});
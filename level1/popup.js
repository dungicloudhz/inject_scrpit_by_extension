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
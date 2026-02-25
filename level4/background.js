chrome.runtime.onMessage.addListener(async (message, sender) => {

  if (message.action === "START_AUTOMATION") {

    await chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ["content.js"]
    });

  }

  if (message.action === "AUTOMATION_DONE") {

    const csv = generateCSV(message.data);

    // Convert sang base64 (an toàn cho service worker)
    const blob = new Blob([csv], { type: "text/csv" });
    const buffer = await blob.arrayBuffer();
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(buffer))
    );

    const dataUrl = `data:text/csv;base64,${base64}`;

    chrome.downloads.download({
      url: dataUrl,
      filename: "auto_data.csv",
      saveAs: true
    });
  }
});

function generateCSV(data) {
  const header = "Title;Address\n";
  const rows = data.map(item => `${item.title};${item.address}`).join("\n");
  return header + rows;
}
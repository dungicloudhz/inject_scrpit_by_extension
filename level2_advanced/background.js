chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "PROCESS_DATA") {

    handleExport(message.payload)
      .then(() => {
        chrome.runtime.sendMessage({ action: "EXPORT_DONE" });
      })
      .catch(err => {
        console.error(err);
      });

    return true; // giữ worker sống cho async
  }
});

async function handleExport(links) {

  const config = await chrome.storage.local.get(["filename"]);

  const filename = (config.filename || "data") + ".csv";

  let csv = "Link Text,Link URL\n";

  links.forEach(link => {

    const safeText = (link.text || "")
      .replace(/"/g, '""'); // escape quote

    const protectedText = /^[=+\-@]/.test(safeText)
      ? "'" + safeText   // chống CSV injection
      : safeText;

    const row = [
      `"${protectedText}"`,
      `"${link.href}"`
    ];

    csv += row.join(",") + "\n";
  });

  const dataUrl =
    "data:text/csv;charset=utf-8," + encodeURIComponent(csv);

  await chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
  });
}
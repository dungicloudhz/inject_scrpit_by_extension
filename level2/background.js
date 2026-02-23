function generateCSV(data) {

  let csvContent = "Page Title,Page URL,Link Text,Link URL\n";

  data.links.forEach(link => {

    const row = [
      `"${data.title}"`,
      `"${data.url}"`,
      `"${link.text.replace(/"/g, '""')}"`,
      `"${link.href}"`
    ];

    csvContent += row.join(",") + "\n";
  });

  const dataUrl = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);

  chrome.downloads.download({
    url: dataUrl,
    filename: "extracted_data.csv",
    saveAs: true
  });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === "EXPORT_DATA") {
    generateCSV(message.payload);
  }
});
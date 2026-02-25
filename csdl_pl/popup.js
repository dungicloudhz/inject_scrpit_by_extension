document.getElementById("run").addEventListener("click", async () => {

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  // Inject content.js
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"]
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    action: "GET_NHOM_VAN_BAN"
  });

  console.log("Dữ liệu nhận được từ content.js:", response);
  if (!response || !Array.isArray(response) || response.length === 0) {
    alert("Không có dữ liệu");
    return;
  }
  let finalData = response;

if (!Array.isArray(response)) {
  finalData = [response];
}

  exportToCSV(finalData);
});

function exportToCSV(data) {

  let csv = "Loai,Ten,Value,Checked\n";

  data.forEach(group => {

    // 👇 kiểm tra group hợp lệ
    if (!group || !Array.isArray(group.option)) return;

    group.option.forEach(item => {

      csv += `"${group.loai || ""}","${item.name || ""}",${item.value ?? ""},${item.checked ?? ""}\n`;

    });

  });

  const csvWithBOM = "\uFEFF" + csv;

  const encodedUri =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(csvWithBOM);

  chrome.downloads.download({
    url: encodedUri,
    filename: "filters.csv",
    saveAs: true
  });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "GET_NHOM_VAN_BAN") {

    const results = []; // 👈 dùng mảng thay vì 1 object

    // ==============================
    // 1️⃣ Xử lý h3 và h2 (div.mb-8)
    // ==============================
    const blocks = document.querySelectorAll("div.mb-8");

    blocks.forEach(block => {

      const titleEl = block.querySelector("h3");

      if (titleEl &&
          (titleEl.innerText.trim() === "Nhóm văn bản")) {

        const group = {
          loai: titleEl.innerText.trim(),
          option: []
        };

        const labels = block.querySelectorAll("label");

        labels.forEach((label, index) => {

          const span = label.querySelector("span");
          const input = label.querySelector("input[type='checkbox']");

          if (span && input) {
            group.option.push({
              name: span.innerText.replace(/\s+/g, " ").trim(),
              value: input.value && input.value !== "on"
                        ? input.value
                        : index + 1,
              checked: input.checked
            });
          }

        });

        results.push(group);
      }

    });


    // ===================================
// 2️⃣ Xử lý các nhóm dạng h2
// ===================================

const h2Titles = Array.from(document.querySelectorAll("h2"))
  .filter(h2 =>
    ["Cơ quan ban hành", "Lĩnh vực tra cứu"]
      .includes(h2.innerText.trim())
  );

h2Titles.forEach(titleEl => {

  const container = titleEl.nextElementSibling;

  if (!container) return;

  const group = {
    loai: titleEl.innerText.trim(),
    option: []
  };

  const labels = container.querySelectorAll("label");

  labels.forEach((label, index) => {

    const span = label.querySelector("span");
    const input = label.querySelector("input[type='checkbox']");

    if (span && input) {
      group.option.push({
        name: span.innerText.replace(/\s+/g, " ").trim(),
        value: input.value && input.value !== "on"
                  ? input.value
                  : index + 1,
        checked: input.checked
      });
    }

  });

  results.push(group);
});
console.log("Kết quả thu thập:", results);
    sendResponse(results);
  }

  return true;
});
async function autoScroll({
  maxScroll = 20,
  delay = 1500,
  retryLimit = 3,
  step = 800 // mỗi lần cuộn bao nhiêu px
}) {

  let lastHeight = 0;
  let retry = 0;

  for (let i = 0; i < maxScroll; i++) {

    console.log(`Scroll lần ${i + 1}`);

    // Scroll mượt để nhìn thấy chuyển động
    window.scrollBy({
      top: step,
      behavior: "smooth"
    });

    await wait(delay);

    const newHeight = document.body.scrollHeight;

    if (newHeight === lastHeight) {
      retry++;
      console.log("Không thấy nội dung mới...");

      if (retry >= retryLimit) {
        console.log("Đã hết nội dung.");
        break;
      }

    } else {
      retry = 0;
      lastHeight = newHeight;
    }
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function collectData() {
  const elements = document.querySelectorAll("a");

  return Array.from(elements).map(el => ({
    title: el.innerText.trim(),
    address: el.href
  }));
}

(async function runAutomation() {

  console.log("Automation started...");

  await autoScroll({
    maxScroll: 30,
    delay: 1500,
    retryLimit: 2,
    step: 1000
  });

  const data = collectData();

  chrome.runtime.sendMessage({
    action: "AUTOMATION_DONE",
    data
  });

})();
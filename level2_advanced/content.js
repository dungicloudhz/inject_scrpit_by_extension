async function extractData() {

  const config = await chrome.storage.local.get(["keyword"]);

  const keyword = config.keyword || "";

  const links = Array.from(document.querySelectorAll("a"))
    .map(link => ({
      text: link.innerText.trim(),
      href: link.href
    }))
    .filter(link =>
      link.text !== "" &&
      link.href.includes(keyword)
    );

  chrome.runtime.sendMessage({
    action: "PROCESS_DATA",
    payload: links
  });
}

extractData();
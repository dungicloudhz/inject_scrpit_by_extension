function extractData() {

  const pageTitle = document.title;
  const pageUrl = window.location.href;

  const links = Array.from(document.querySelectorAll("a"))
    .map(link => ({
      text: link.innerText.trim(),
      href: link.href
    }))
    .filter(link => link.text !== "");

  chrome.runtime.sendMessage({
    action: "EXPORT_DATA",
    payload: {
      title: pageTitle,
      url: pageUrl,
      links: links
    }
  });
}

extractData();
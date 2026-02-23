const links = document.querySelectorAll("a");

chrome.runtime.sendMessage({
  action: "LINK_COUNT",
  count: links.length
});
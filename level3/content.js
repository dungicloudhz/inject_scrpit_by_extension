(async function () {

  const config = await chrome.storage.local.get(["darkMode"]);

  const isDark = config.darkMode || false;

  if (!isDark) {
    enableDarkMode();
    await chrome.storage.local.set({ darkMode: true });
  } else {
    disableDarkMode();
    await chrome.storage.local.set({ darkMode: false });
  }

})();

function enableDarkMode() {

  document.documentElement.classList.add("my-dark-mode");

  injectStyle();
  observeDOM();
}

function disableDarkMode() {

  document.documentElement.classList.remove("my-dark-mode");

  const style = document.getElementById("dark-mode-style");
  if (style) style.remove();

  if (window.darkObserver)
    window.darkObserver.disconnect();
}

function injectStyle() {

  if (document.getElementById("dark-mode-style")) return;

  const style = document.createElement("style");
  style.id = "dark-mode-style";

  style.textContent = `
    .my-dark-mode {
      background-color: #121212 !important;
      color: #e0e0e0 !important;
    }

    .my-dark-mode * {
      background-color: transparent !important;
      color: inherit !important;
      border-color: #333 !important;
    }

    .my-dark-mode img {
      filter: brightness(0.8) contrast(1.2);
    }
  `;

  document.head.appendChild(style);
}

function observeDOM() {

  const observer = new MutationObserver(() => {

    if (!document.documentElement.classList.contains("my-dark-mode"))
      return;

    injectStyle();

  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.darkObserver = observer;
}
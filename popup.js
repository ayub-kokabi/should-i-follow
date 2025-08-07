document.addEventListener('DOMContentLoaded', () => {
  const blacklistTextarea = document.getElementById('blacklist');

  chrome.storage.local.get(['blacklist'], (result) => {
    if (result.blacklist) {
      blacklistTextarea.value = result.blacklist;
    }
  });

  blacklistTextarea.addEventListener('input', () => {
    chrome.storage.local.set({ blacklist: blacklistTextarea.value });
  });
});
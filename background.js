try {
  importScripts('./virastar.min.js');
} catch (e) {
  // Fail silently in production
}
const normalizer = Virastar();

const nitterInstances = [
  'nitter.tiekoetter.com',
  'nitter.privacyredirect.com',
  'nitter.kuuro.net'
];

async function fetchWithFallbacks(username, keyword) {
  for (const instance of nitterInstances) {
    const searchUrl = `https://${instance}/${username}/search?f=tweets&q="${encodeURIComponent(keyword)}"`;
    try {
      const response = await fetch(searchUrl, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (response.status === 429) continue;
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      return await response.text();
    } catch (error) {
      // Continue to next instance
    }
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab.id;
  switch (request.type) {
    case 'START_PROFILE_CHECK':
      checkBlacklist(request.username, tabId);
      break;
    case 'PERFORM_MANUAL_SEARCH':
      const normalizedTerm = normalizer.cleanup(request.term);
      performSearch(request.username, [normalizedTerm], tabId);
      break;
  }
  return true;
});

async function checkBlacklist(username, tabId) {
  const data = await chrome.storage.local.get(['blacklist']);
  const keywords = (data.blacklist || '')
    .split('\n')
    .filter(k => k.trim() !== '')
    .map(k => normalizer.cleanup(k.trim()));
  performSearch(username, keywords, tabId);
}

async function performSearch(username, keywords, tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'SHOW_LOADING_PANEL', username: username });

  if (keywords.length === 0) {
    chrome.tabs.sendMessage(tabId, { type: 'PROCESS_AND_DISPLAY', data: [], keywords: [] });
    return;
  }

  const searchPromises = keywords.map(keyword => {
    return fetchWithFallbacks(username, keyword)
      .then(htmlText => {
        if (htmlText === null) return null;
        return { keyword: keyword, htmlText: htmlText };
      });
  });

  const results = await Promise.all(searchPromises);
  const validResults = results.filter(r => r !== null);

  const storageData = await chrome.storage.local.get(['blacklist']);
  const fullBlacklistFromStorage = (storageData.blacklist || '')
    .split('\n')
    .filter(k => k.trim() !== '')
    .map(k => normalizer.cleanup(k.trim()));

  const combinedKeywords = [...fullBlacklistFromStorage, ...keywords];
  const uniqueKeywordsForHighlighting = [...new Set(combinedKeywords)];
  
  chrome.tabs.sendMessage(tabId, {
    type: 'PROCESS_AND_DISPLAY',
    data: validResults,
    keywords: uniqueKeywordsForHighlighting
  });
}
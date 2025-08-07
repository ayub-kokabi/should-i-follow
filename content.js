let currentUsernameForPanel = null;
let lastCheckedUsername = null;
const normalizer = Virastar();

const observer = new MutationObserver((mutations) => {
  const profileHeader = document.querySelector('div[data-testid="UserProfileHeader_Items"]');
  if (profileHeader) {
    const usernameFromUrl = window.location.pathname.split('/')[1];
    if (usernameFromUrl && usernameFromUrl !== lastCheckedUsername) {
      lastCheckedUsername = usernameFromUrl;
      chrome.runtime.sendMessage({ type: 'START_PROFILE_CHECK', username: usernameFromUrl });
    }
  } else {
    if (lastCheckedUsername !== null) {
      lastCheckedUsername = null;
      const panel = document.getElementById('blacklist-analyzer-panel');
      if (panel) panel.classList.remove('visible');
      const reopenBtn = document.getElementById('analyzer-reopen-btn');
      if (reopenBtn) reopenBtn.classList.remove('visible');
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

function isMostlyRtl(text, threshold = 0.6) {
    if (!text || !text.trim()) return false;
    const rtlCharsRegex = /[\u0600-\u06FF]/g;
    const rtlMatches = text.match(rtlCharsRegex);
    const rtlCount = rtlMatches ? rtlMatches.length : 0;
    const totalLength = text.replace(/\s/g, '').length;
    if (totalLength === 0) return false;
    return (rtlCount / totalLength) > threshold;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SHOW_LOADING_PANEL':
      currentUsernameForPanel = message.username;
      createOrShowPanel(`<h3>Loading tweets for @${message.username}...</h3>`);
      break;
    case 'PROCESS_AND_DISPLAY':
      createOrShowPanel();
      parseAndDisplayResults(message.data, message.keywords);
      break;
  }
});

function createOrShowPanel(initialContent = '') {
  let panel = document.getElementById('blacklist-analyzer-panel');
  if (!panel) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button id="analyzer-reopen-btn" class="analyzer-reopen-btn" title="Open Should I Follow">&#x1F50D;</button>
      <div id="blacklist-analyzer-panel">
        <div class="panel-header"><h3>Should I Follow</h3><button id="panel-close-btn">&times;</button></div>
        <div class="panel-search-wrapper"><input type="text" id="panel-search-input" placeholder="Enter new term to search..."><button id="panel-search-btn">Search</button></div>
        <div id="panel-results" class="panel-results">${initialContent}</div>
      </div>
    `;
    document.body.appendChild(wrapper);

    panel = document.getElementById('blacklist-analyzer-panel');
    const reopenBtn = document.getElementById('analyzer-reopen-btn');
    
    document.getElementById('panel-close-btn').addEventListener('click', () => {
      panel.classList.remove('visible');
      reopenBtn.classList.add('visible');
    });
    
    reopenBtn.addEventListener('click', () => {
      panel.classList.add('visible');
      reopenBtn.classList.remove('visible');
    });

    document.getElementById('panel-search-btn').addEventListener('click', triggerNewSearch);
    document.getElementById('panel-search-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerNewSearch(); });
  }

  document.getElementById('blacklist-analyzer-panel').classList.add('visible');
  document.getElementById('analyzer-reopen-btn').classList.remove('visible');
  
  if(initialContent) {
      document.getElementById('panel-results').innerHTML = initialContent;
  }
}

function parseAndDisplayResults(results, keywordsToHighlight) {
    const resultsContainer = document.getElementById('panel-results');
    resultsContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const parser = new DOMParser();
    let totalTweetsFound = 0;
    const highlightRegex = keywordsToHighlight.length > 0 ? new RegExp(keywordsToHighlight.map(k => k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|'), 'gi') : null;
    results.forEach(result => {
        const doc = parser.parseFromString(result.htmlText, "text/html");
        const tweetElements = doc.querySelectorAll('div.timeline-item');
        tweetElements.forEach(element => {
            const contentElement = element.querySelector('.tweet-content');
            if (contentElement) {
                totalTweetsFound++;
                const resultItem = document.createElement('div');
                resultItem.className = 'result-tweet-item';
                const tweetText = contentElement.innerText;
                if (isMostlyRtl(tweetText)) {
                    resultItem.classList.add('rtl-text');
                }
                let normalizedContent = normalizer.cleanup(contentElement.innerHTML);
                resultItem.innerHTML = highlightRegex ? normalizedContent.replace(highlightRegex, `<mark>$&</mark>`) : normalizedContent;
                fragment.appendChild(resultItem);
            }
        });
    });
    if (totalTweetsFound === 0) {
        resultsContainer.innerHTML = '<p class="no-results-message">No matching tweets found.</p>';
    } else {
        resultsContainer.appendChild(fragment);
    }
}

function triggerNewSearch() {
    const searchInput = document.getElementById('panel-search-input');
    const searchTerm = searchInput.value.trim();
    if (!searchTerm || !currentUsernameForPanel) return;
    const normalizedTerm = normalizer.cleanup(searchTerm);
    document.getElementById('panel-results').innerHTML = `<h3>Searching for "${searchTerm}"...</h3>`;
    chrome.runtime.sendMessage({
        type: 'PERFORM_MANUAL_SEARCH',
        term: normalizedTerm,
        username: currentUsernameForPanel
    });
}
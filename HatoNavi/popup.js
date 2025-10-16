// popup.js

-
  // ページ内にある、data-i18nという属性を持つ要素をすべて探し出す
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    // その要素のdata-i18n属性から、辞書の見出し語を取得する (例: "popupToggleLabel")
    const messageName = element.getAttribute('data-i18n');
    
    // 辞書からその見出し語に対応する言葉を持ってくる
    const message = chrome.i18n.getMessage(messageName);
    
    // 要素の中身を、辞書から持ってきた言葉に置き換える

      element.textContent = message;
    
  });




  const toggleSwitch = document.getElementById('clean-url-toggle');
  
  const historyButton = document.getElementById('history-button');

  chrome.storage.local.get('cleanUrlEnabled', (data) => {
    toggleSwitch.checked = data.cleanUrlEnabled !== false;
  });

  toggleSwitch.addEventListener('change', (event) => {
    const isEnabled = event.target.checked;
    chrome.storage.local.set({ cleanUrlEnabled: isEnabled });
  });
  
  // ★★★ ボタンがクリックされたら、history.htmlを新しいタブで開く ★★★
  historyButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'history.html' });
  });

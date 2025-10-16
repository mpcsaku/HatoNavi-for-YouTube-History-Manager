// background.js

// YouTubeの動画ページにマッチする正規表現
const YOUTUBE_VIDEO_URL_REGEX = /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/;

// URL変更を処理する共通の関数
function handleNavigation(details) {
  // YouTubeの動画ページで、かつメインフレームのナビゲーションのみを処理
  if (details.url && details.url.match(YOUTUBE_VIDEO_URL_REGEX) && details.frameId === 0) {
    // console.log(`[Background] Navigation detected: ${details.url}`);
    
    // content.jsにメッセージを送信する前に、タブが準備完了しているか少し待つ
    // これにより、content.jsがメッセージを受け取り損ねるのを防ぐ
    setTimeout(() => {
        chrome.tabs.sendMessage(details.tabId, { action: "urlChanged", url: details.url });
    }, 100);
  }
}

// ナビゲーション完了時 (ページ読み込み、戻る/進む、リンククリックなど)
chrome.webNavigation.onCompleted.addListener(handleNavigation);

// History APIによるURL変更時 (SPA内部の遷移)
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
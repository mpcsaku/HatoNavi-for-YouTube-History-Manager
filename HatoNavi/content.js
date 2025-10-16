// content.js (タイトル・チャンネル名保存 & 日別過去ログ機能【過去ログ軽量化＆フラグ対応版】)

let saveInterval = null;
let lastInitializedVideoId = null;
let observer = null;
let saveTimeout = null;

// --- ユーティリティ関数群 ---
function cleanUrlOfTimestamp() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('t')) {
    url.searchParams.delete('t');
    window.history.replaceState({}, '', url.toString());
  }
}
function getPlayer() {
  return document.querySelector('video');
}
function getVideoIdFromUrl(url) {
  try {
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get('v');
  } catch (e) {
    return null;
  }
}
function getyyyymmdd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

// --- データ保存/読み込み/削除 (Promise対応版) ---
function saveData(key, data) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [key]: data }, resolve);
  });
}
function loadData(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(result[key]);
    });
  });
}
function removeData(key) {
  return new Promise(resolve => {
    chrome.storage.local.remove(key, resolve);
  });
}

// --- UI表示 ---
function showResumeNotification(position) {
  const existing = document.getElementById('yt-resume-notification');
  if (existing) existing.remove();
  const div = document.createElement('div');
  div.id = 'yt-resume-notification';
  const minutes = Math.floor(position / 60);
  const seconds = Math.floor(position % 60);
  const timeString = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  //div.textContent = `れじゅ～む ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  div.textContent = chrome.i18n.getMessage("ResumeNotification", timeString);

  const container = document.querySelector('.html5-video-container');
  if (container) {
    container.style.position = 'relative';
    container.appendChild(div);
    setTimeout(() => { div.classList.add('show'); }, 50);
    setTimeout(() => {
      div.classList.remove('show');
      div.addEventListener('transitionend', () => div.remove(), { once: true });
    }, 3000);
  }
}

// --- 保存処理のコア ---
async function executeSave() {
  try {
    const player = getPlayer();
    if (player && lastInitializedVideoId) {
      const existingData = await loadData(lastInitializedVideoId) || {};
      const duration = player.duration;
      let positionToSave = Math.floor(player.currentTime);
      let percentage = 0;
      if (duration && !isNaN(duration) && duration > 0) {
        const intDuration = Math.floor(duration);
        percentage = intDuration > 0 ? Math.floor((positionToSave / intDuration) * 100) : 0;
        if (positionToSave >= intDuration * 0.95) {
          positionToSave = -1;
          percentage = 100;
        }
      }
      const dataToSave = {
        ...existingData,
        time: positionToSave,
        lastWatched: Date.now(),
        duration: duration ? Math.floor(duration) : 0,
        percentage: percentage,
      };
      await saveData(lastInitializedVideoId, dataToSave);
    }
  } catch (error) {
    if (!(error && error.message.includes('Extension context invalidated'))) {
      console.error("executeSaveで予期せぬエラー:", error);
    }
  }
}

// --- 保存の遅延実行 ---
function requestSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(executeSave, 100);
}

// --- 動画初期化処理の心臓部 ---
async function initializeVideoForResume(player, videoId) {
  if (!videoId || videoId === lastInitializedVideoId) return;
  lastInitializedVideoId = videoId;

  if (saveInterval) clearInterval(saveInterval);
  saveInterval = null;
  if (player._resumeListeners) {
    player.removeEventListener('play', player._resumeListeners.play);
    player.removeEventListener('pause', player._resumeListeners.pause);
    player.removeEventListener('ended', player._resumeListeners.ended);
    player.removeEventListener('timeupdate', player._resumeListeners.timeupdate);
  }

  try {
    let currentData = await loadData(videoId);
    const todayStr = getyyyymmdd(new Date());

    if (currentData && currentData.lastWatched && getyyyymmdd(new Date(currentData.lastWatched)) !== todayStr) {
      const oldDateStr = getyyyymmdd(new Date(currentData.lastWatched));
      const archiveKey = `${videoId}~${oldDateStr}`;
      
      // ★★★ ここが新しいロジック！ ★★★
      // 1. 軽量化した過去ログ用のデータを作る
      const archiveData = {
        lastWatched: currentData.lastWatched,
        title: currentData.title,
        author_name: currentData.author_name,
        isArchive: true // 将来のためのフラグ！
      };
      await saveData(archiveKey, archiveData);
      
      const newData = {
        ...currentData,
        time: currentData.time === -1 ? 0 : currentData.time,
        lastWatched: Date.now(),
      };
      
      await saveData(videoId, newData);
      currentData = newData;
    } 
    else {
      let footprintTime = currentData?.time || 0;
      if (footprintTime === -1) footprintTime = 0;
      
      let footprintData = {
        ...currentData,
        time: footprintTime,
        lastWatched: Date.now(),
        firstWatched: currentData?.firstWatched || Date.now()
      };

      if (!footprintData.title) {
        try {
          const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (response.ok) {
            const videoInfo = await response.json();
            footprintData.title = videoInfo.title;
            footprintData.author_name = videoInfo.author_name;
          }
        } catch(e) { /* ignore network error etc. */ }
      }
      
      await saveData(videoId, footprintData);
      currentData = footprintData;
    }

    const savedPosition = currentData?.time || 0;
    if (savedPosition > 0 && Math.abs(player.currentTime - savedPosition) > 5) {
      player.currentTime = savedPosition;
      player.play().catch(e => {});
      showResumeNotification(savedPosition);
    }

  } catch (e) { /* ignore context error */ }

  const startSavingInterval = () => { if (!saveInterval) { saveInterval = setInterval(executeSave, 10000); } };
  const stopSavingInterval = () => { if (saveInterval) { clearInterval(saveInterval); saveInterval = null; } };
  const handlePause = () => { stopSavingInterval(); executeSave(); };
  const handleVideoEnd = async () => { 
    stopSavingInterval(); 
    clearTimeout(saveTimeout); 
    try { 
      const existingData = await loadData(videoId) || {}; 
      await saveData(videoId, { ...existingData, time: -1, lastWatched: Date.now(), percentage: 100 }); 
    } catch (e) { /* ignore */ } 
  };
  const handleFirstTimeUpdate = () => { 
    startSavingInterval(); 
    player.removeEventListener('timeupdate', handleFirstTimeUpdate); 
  };
  
  player._resumeListeners = { play: startSavingInterval, pause: handlePause, ended: handleVideoEnd, timeupdate: handleFirstTimeUpdate };
  player.addEventListener('play', player._resumeListeners.play);
  player.addEventListener('pause', player._resumeListeners.pause);
  player.addEventListener('ended', player._resumeListeners.ended);
  player.addEventListener('timeupdate', player._resumeListeners.timeupdate, { once: true });
}

// --- ページナビゲーション監視 ---
function startObserver() { 
  if (observer) observer.disconnect(); 
  const targetNode = document.body; 
  const config = { childList: true, subtree: true }; 
  const callback = () => { 
    const player = getPlayer(); 
    if (player && player.readyState > 0) { 
      const currentVideoId = getVideoIdFromUrl(window.location.href); 
      if (currentVideoId && currentVideoId !== lastInitializedVideoId) { 
        initializeVideoForResume(player, currentVideoId); 
      } 
    } 
  }; 
  observer = new MutationObserver(callback); 
  observer.observe(targetNode, config); 
}
function handleUrlChange() { 
  chrome.storage.local.get('cleanUrlEnabled', (data) => { 
    if (data.cleanUrlEnabled !== false) cleanUrlOfTimestamp(); 
    if (saveInterval) { 
      clearInterval(saveInterval); 
      saveInterval = null; 
    } 
    lastInitializedVideoId = null; 
    const videoId = getVideoIdFromUrl(window.location.href); 
    if (videoId && window.location.pathname.includes('/watch')) { 
      setTimeout(startObserver, 500);
    } 
  }); 
}

// --- グローバルイベントリスナー ---
window.addEventListener('blur', requestSave);
window.addEventListener('mousedown', requestSave);
window.addEventListener('pagehide', requestSave);
chrome.runtime.onMessage.addListener((request) => { 
  if (request.action === "urlChanged") { 
    handleUrlChange(); 
  } 
});

// --- 初期実行 ---
handleUrlChange();
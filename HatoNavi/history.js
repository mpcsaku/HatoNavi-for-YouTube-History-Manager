// history.js (空白スペース修正版)

// --- グローバル変数 ---
let listContainer,
  filterSelect,
  deleteAllButton,
  exportButton,
  importButton,
  importFileInput,
  scrollTrigger;
let tagEditButton, tagManagerContainer;
let tagFilterContainer;
let fullVideoHistory = [];
let currentFilter = "all";
let selectedTags = [];
let selectedChannel = null;
let isAndFilter = true;
const PAGE_SIZE = 20;
let currentPage = 0;
let isLoading = false;
let observer;

// --- 初期化処理 ---
document.addEventListener("DOMContentLoaded", async () => {
  //タイトル翻訳
  document.title = chrome.i18n.getMessage("HistoryTitle");
  //多言語化定義
  translateWithin(document.body);
  
  listContainer = document.getElementById("history-list");
  scrollTrigger = document.getElementById("scroll-trigger");
  filterSelect = document.getElementById("filter-select");
  deleteAllButton = document.getElementById("delete-all-button");
  exportButton = document.getElementById("export-button");
  importButton = document.getElementById("import-button");
  importFileInput = document.getElementById("import-file-input");
  tagEditButton = document.getElementById("tag-edit-button");
  tagManagerContainer = document.getElementById("tag-manager-container");
  tagFilterContainer = document.getElementById("tag-filter-container");

  setupEventListeners();

  const savedSettings = await loadData([
    "historyFilter",
    "selectedTags",
    "selectedChannel",
    "isAndFilter",
  ]);
  filterSelect.value = savedSettings?.historyFilter || "all";
  currentFilter = filterSelect.value;
  selectedTags = savedSettings?.selectedTags || [];
  selectedChannel = savedSettings?.selectedChannel || null;
  isAndFilter = savedSettings?.isAndFilter === false ? false : true;

  await initializeHistory();
});

async function initializeHistory() {
  listContainer.innerHTML = "";
  scrollTrigger.textContent = "履歴を読み込んでいます...";
  scrollTrigger.style.display = "block";
  currentPage = 0;
  if (observer) observer.disconnect();

  await setupTagFilterBar();
  await loadFullHistory();

  if (fullVideoHistory.length === 0) {
    if (
      selectedTags.length > 0 ||
      currentFilter !== "all" ||
      selectedChannel !== null
    ) {
      scrollTrigger.textContent = chrome.i18n.getMessage("MessageNoMatchingVideos");
    } else {
      scrollTrigger.textContent = chrome.i18n.getMessage("NoHistory");
    }
    if (observer) observer.disconnect();
    return;
  }

  await initialLoadCheck();
}

async function loadFullHistory() {
  const allItems = await chrome.storage.local.get(null);
  let history = [];
  for (const key in allItems) {
    if (
      typeof allItems[key] === "object" &&
      allItems[key] !== null &&
      allItems[key].hasOwnProperty("lastWatched")
    ) {
      history.push({ id: key, data: allItems[key] });
    }
  }
  history.sort((a, b) => b.data.lastWatched - a.data.lastWatched);

  fullVideoHistory = history.filter((item) => {
    const isWatched = item.data.time === -1;
    const isFavorite = item.data.isFavorite === true;
    let typeMatch = false;
    if (item.id.includes("~")) {
      if (currentFilter === "all") typeMatch = true;
    } else {
      switch (currentFilter) {
        case "unwatched":
          typeMatch = !isWatched;
          break;
        case "watched":
          typeMatch = isWatched;
          break;
        case "favorites":
          typeMatch = isFavorite;
          break;
        default:
          typeMatch = true;
      }
    }

    const hasNoFilters = selectedTags.length === 0 && selectedChannel === null;
    if (hasNoFilters) {
      return typeMatch;
    }

    const videoTags = new Set(item.data.tags || []);
    const videoChannel = item.data.author_name;

    if (isAndFilter) {
      const tagMatch = selectedTags.every((tag) => videoTags.has(tag));
      const channelMatch = selectedChannel
        ? videoChannel === selectedChannel
        : true;
      return typeMatch && tagMatch && channelMatch;
    } else {
      const tagMatch =
        selectedTags.length > 0
          ? selectedTags.some((tag) => videoTags.has(tag))
          : false;
      const channelMatch = selectedChannel
        ? videoChannel === selectedChannel
        : false;
      const hasTagOrChannelFilter =
        selectedTags.length > 0 || selectedChannel !== null;
      return typeMatch && (!hasTagOrChannelFilter || tagMatch || channelMatch);
    }
  });
}

async function setupTagFilterBar() {
  const tagListElement = document.getElementById("tag-filter-list");
  if (!tagListElement) return;

  const tagData = await loadData("hatonavi_all_tags");
  const allTags = tagData?.hatonavi_all_tags || [];

  if (allTags.length === 0 && selectedChannel === null) {
    if (tagFilterContainer) tagFilterContainer.style.display = "none";
    return;
  } else {
    if (tagFilterContainer) tagFilterContainer.style.display = "flex";
  }

  const isFilterActive = selectedTags.length > 0 || selectedChannel !== null;
  const switchContainer = document.getElementById("and-or-switch-container");
  if (switchContainer) {
    // ★★★ ここを修正！ visibility から display に変更！ ★★★
    //一時的に削除　switchContainer.style.display = isFilterActive ? "flex" : "none";
    const checkbox = document.getElementById("and-or-toggle");
    if (checkbox) checkbox.checked = isAndFilter;
  }

  let tagButtonsHTML = "";
  const allBtnClass = !isFilterActive ? "is-active" : "";
  tagButtonsHTML += `<button class="tag-filter-button ${allBtnClass}" data-tag-name="all"  data-i18n="LabelAll">全ての動画</button>`;

  if (selectedChannel !== null) {
    tagButtonsHTML += `<button class="tag-filter-button is-active is-channel-tag" data-channel-name="${escapeHTML(
      selectedChannel
    )}">ch: ${escapeHTML(selectedChannel)}</button>`;
  }

  allTags.forEach((tag) => {
    const isActive = selectedTags.includes(tag);
    const tagColor = getTagColor(tag);
    const tagBtnClass = isActive ? "is-active" : "";
    // ★★★ ここを修正！ opacityの指定を完全に消し去る！ ★★★
    const style = `background-color: ${tagColor}; color: white; border-color: transparent;`;
    tagButtonsHTML += `<button class="tag-filter-button ${tagBtnClass}" data-tag-name="${escapeHTML(
      tag
    )}" style="${style}">${escapeHTML(tag)}</button>`;
  });
  tagListElement.innerHTML = tagButtonsHTML;


  // ★★★翻訳実行 ★★★
  translateWithin(tagListElement);
  
  enableDragToScroll(tagListElement);
}

function enableDragToScroll(element) {
  let isDown = false;
  let startX;
  let scrollLeft;
  element.addEventListener("mousedown", (e) => {
    isDown = true;
    element.style.cursor = "grabbing";
    startX = e.pageX - element.offsetLeft;
    scrollLeft = element.scrollLeft;
  });
  element.addEventListener("mouseleave", () => {
    isDown = false;
    element.style.cursor = "grab";
  });
  element.addEventListener("mouseup", () => {
    isDown = false;
    element.style.cursor = "grab";
  });
  element.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - element.offsetLeft;
    const walk = (x - startX) * 2;
    element.scrollLeft = scrollLeft - walk;
  });
}

function setupEventListeners() {

  // 使い方のポップアップ
  const infoButton = document.getElementById('info-popup-button');

  if (infoButton) {
    infoButton.addEventListener('click', (event) => {
      
      event.preventDefault();


      // 1. ブラウザの言語設定を取得する (例: "ja", "en-US", "en" など)
      const userLang = chrome.i18n.getUILanguage();

      // 2. 言語設定が「日本語(ja)」で始まってるかどうかをチェック
      const isJapanese = userLang.startsWith('ja');

      // 3. 言語に応じて、読み込むフォルダを決める！
      const langFolder = isJapanese ? 'ja' : 'en'; // 日本語じゃなければ、全部英語にしちゃう

      // 4. 最終的なURLを組み立てる！
      //    (元のhref "message/how-to-use.html" を分解して、間に言語フォルダを挟む感じ)
      const initialUrl = `message/${langFolder}/how-to-use.html`;

      // ★★★★★★★★★★★★★★★★★★★★★★★★★

      
      const container = document.getElementById('info-popup-container');
      container.innerHTML = `
        <div class="info-overlay"></div>
        <div class="info-iframe-wrapper">
          <iframe src="${initialUrl}"></iframe>
          <button class="info-close-button">&times;</button>
        </div>
      `;
      container.classList.add('show');
      document.body.classList.add('modal-open');

      // 3. 閉じるための処理
      const closePopup = () => {
        container.classList.remove('show');
        document.body.classList.remove('modal-open');
        container.innerHTML = ''; // 中身を空っぽにして後片付け
      };
      container.querySelector('.info-overlay').addEventListener('click', closePopup);
      container.querySelector('.info-close-button').addEventListener('click', closePopup);


      // ★★★ iframeの中のページ遷移を操る！ ★★★
      // ★★★★★★★★★★★★★★★★★★★★★★★★★
      const iframe = container.querySelector('iframe');
      // iframeの中身が読み込まれるたびに、実行される
      iframe.addEventListener('load', () => {
        // iframeの中のドキュメント（HTML）を取得
        const innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        
        // その中の、全てのリンク<a>を取得
        const links = innerDoc.querySelectorAll('a');

        // 全てのリンクに、新しい命令を上書きする
        links.forEach(link => {
          link.addEventListener('click', (e) => {
            // リンク本来の動きは、やっぱり止める！
            e.preventDefault();
                        // ★★★ ここを、ちょっとだけ賢くする！ ★★★
            // クリックされたリンクの「ファイル名」だけを取り出す (例: "privacy.html")
            const filename = link.href.split('/').pop();
            
            // 今のiframeのURLから、言語フォルダ部分を抜き出す (例: "ja")
            const currentUrl = new URL(iframe.src);
            const pathSegments = currentUrl.pathname.split('/');
            const langFolder = pathSegments[pathSegments.length - 2]; // 後ろから2番目が言語フォルダのはず
            
            // 正しい、次のページのURLを組み立てる！
            const nextUrl = `message/${langFolder}/${filename}`;
            
            // 組み立てたURLに、iframeを遷移させる！
            iframe.src = nextUrl;
          });
        });
      });
    });
  }







  // ★★★ ここからが追加ブロック！ ★★★
  const headerTitle = document.querySelector(".page-header h1");
  if (headerTitle) {
    headerTitle.addEventListener("click", () => {
      // 1. 全てのフィルター用変数を初期状態に戻す
      currentFilter = "all";
      selectedTags = [];
      selectedChannel = null;

      // 2. プルダウンの表示も「全ての動画」に戻す
      filterSelect.value = "all";

      // 3. リセットした状態を保存する
      saveData({
        historyFilter: "all",
        selectedTags: [],
        selectedChannel: null,
      });

      // 4. 画面を再描画する！
      initializeHistory();
    });
  }

  filterSelect.addEventListener("change", () => {
    currentFilter = filterSelect.value;
    saveData({ historyFilter: currentFilter });
    initializeHistory();
  });

  listContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("author-name")) {
      e.preventDefault();
      e.stopPropagation();

      const clickedChannel = e.target.dataset.channelName;
      if (!clickedChannel) return;

      selectedChannel =
        selectedChannel === clickedChannel ? null : clickedChannel;
      selectedTags = [];

      saveData({
        selectedTags: selectedTags,
        selectedChannel: selectedChannel,
      });
      initializeHistory();
    } else if (e.target.closest("a")) {
      e.preventDefault();
      const videoUrl = e.target.closest("a").href;
      if (videoUrl) {
        chrome.tabs.create({ url: videoUrl });
      }
    }
  });

  if (tagFilterContainer) {
    tagFilterContainer.addEventListener("click", (e) => {
      if (e.target.id === "and-or-toggle") {
        isAndFilter = e.target.checked;
        saveData({ isAndFilter: isAndFilter });
        initializeHistory();
        return;
      }

      if (e.target.classList.contains("tag-filter-button")) {
        const clickedTagName = e.target.dataset.tagName;
        const clickedChannelName = e.target.dataset.channelName;

        if (clickedTagName === "all") {
          selectedTags = [];
          selectedChannel = null;
        } else if (clickedChannelName) {
          selectedChannel = null;
        } else if (clickedTagName) {
          const index = selectedTags.indexOf(clickedTagName);
          if (index > -1) {
            selectedTags.splice(index, 1);
          } else {
            selectedTags.push(clickedTagName);
          }
        }

        saveData({
          selectedTags: selectedTags,
          selectedChannel: selectedChannel,
          isAndFilter: isAndFilter,
        });
        initializeHistory();
      }
    });
  }

  deleteAllButton.addEventListener("click", () => {
    if (
      //confirm("本当に全ての視聴履歴を削除しますか？\nこの操作は元に戻せません。")
      confirm(chrome.i18n.getMessage("confirmDeleteAll"))
    ) {
      chrome.storage.local.clear(() => {
        initializeHistory();
      });
    }
  });
  exportButton.addEventListener("click", handleExport);
  importButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        let isValidFile = false;
        for (const key in importedData) {
          if (
            key === "hatonavi_all_tags" ||
            (typeof importedData[key] === "object" &&
              importedData[key] !== null &&
              importedData[key].hasOwnProperty("lastWatched"))
          ) {
            isValidFile = true;
            break;
          }
        }
        if (!isValidFile) {
          alert(
            chrome.i18n.getMessage("ErrorInvalidBackupFile")
          );
          return;
        }
        const importCount = Object.keys(importedData).length;
        const currentCount = fullVideoHistory.length;
        const choice = prompt( chrome.i18n.getMessage("SelectImportMethod",[importCount,currentCount]),"1");
        if (choice === "1") {
          handleMerge(importedData);
        } else if (choice === "2") {
          handleReplace(importedData);
        }
      } catch (error) {
        alert(chrome.i18n.getMessage("FileLoadError"));
      } finally {
        importFileInput.value = "";
      }
    };
    reader.readAsText(file);
  });
  tagEditButton.addEventListener("click", showTagManager);
}

function createVideoElement(item, removeTimestamp) {
  const videoItem = document.createElement("div");
  videoItem.className = "video-item";
  const isArchive = item.id.includes("~");
  const realVideoId = isArchive ? item.id.split("~")[0] : item.id;
  if (item.data.time === -1 || item.data.time == null) {
    videoItem.classList.add("is-completed");
  }
  let url = `https://www.youtube.com/watch?v=${realVideoId}`;
  if (!isArchive && !removeTimestamp && item.data.time > 0) {
    url += `&t=${Math.floor(item.data.time)}s`;
  }
  const thumbnailLink = document.createElement("a");
  thumbnailLink.href = url;
  thumbnailLink.className = "thumbnail-link";
  const thumbnailWrapper = document.createElement("div");
  thumbnailWrapper.className = "thumbnail-wrapper";
  const thumbnail = document.createElement("img");
  thumbnail.className = "thumbnail";
  thumbnail.src = `https://i.ytimg.com/vi/${realVideoId}/hqdefault.jpg`;
  thumbnail.onerror = () => {
    thumbnail.remove();
    thumbnailWrapper.classList.add("thumbnail-error");
  };
  thumbnailWrapper.appendChild(thumbnail);
  thumbnailLink.appendChild(thumbnailWrapper);
  if (item.data.lastWatched) {
    const dateOverlay = document.createElement("div");
    dateOverlay.classList.add("date-overlay");
    const date = new Date(item.data.lastWatched);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const watchDate = new Date(item.data.lastWatched);
    watchDate.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - watchDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    let dateClass = "date-old";
    if (diffDays === 0) dateClass = "date-today";
    else if (diffDays === 1) dateClass = "date-yesterday";
    else if (diffDays <= 7) dateClass = "date-week";
    dateOverlay.classList.add(dateClass);
    const month = date.getMonth() + 1;
    const day = date.getDate().toString().padStart(2, "0");
    dateOverlay.innerHTML = `<span class="date-month">${month}</span><span class="date-day">${day}</span>`;
    thumbnailWrapper.appendChild(dateOverlay);
  }
  if (item.data.hasOwnProperty("percentage") && item.data.percentage > 0) {
    const progressBarContainer = document.createElement("div");
    progressBarContainer.className = "progress-bar-container";
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressBar.style.width = `${item.data.percentage}%`;
    progressBarContainer.appendChild(progressBar);
    thumbnailWrapper.appendChild(progressBarContainer);
  }
  const infoDiv = document.createElement("div");
  infoDiv.className = "info";
  const titleH3 = document.createElement("h3");
  titleH3.textContent = item.data.title || chrome.i18n.getMessage("TitleUnknown");
  const metaInfoDiv = document.createElement("div");
  metaInfoDiv.className = "meta-info";
  const authorP = document.createElement("p");
  authorP.className = "author-name";
  authorP.textContent = item.data.author_name || chrome.i18n.getMessage("ChannelUnknown");
  if (item.data.author_name) {
    authorP.dataset.channelName = item.data.author_name;
    authorP.title = `「${item.data.author_name}」の動画を絞り込み`;
  }
  const dateP = document.createElement("p");
  dateP.className = "last-watched-date";
  //視聴日の書式
  const d = new Date(item.data.lastWatched);
  const year = d.getFullYear();
  // 月は0から始まるから+1するのを忘れずに！
  const month = String(d.getMonth() + 1).padStart(2, '0'); 
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  dateP.textContent = `${year}/${month}/${day}/ ${hours}:${minutes}:${seconds}`;
  
  metaInfoDiv.appendChild(authorP);
  metaInfoDiv.appendChild(dateP);
  if (item.data.isArchive) videoItem.classList.add("is-archive");
  infoDiv.appendChild(titleH3);
  infoDiv.appendChild(metaInfoDiv);
  videoItem.appendChild(thumbnailLink);
  videoItem.appendChild(infoDiv);
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.textContent = "×";
  deleteButton.title = chrome.i18n.getMessage("ButtonDeleteHistory");
  deleteButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isArchive && item.data.isFavorite === true) {
      alert(
        chrome.i18n.getMessage("ErrorCannotDeleteFavorite")
      );
      return;
    }




    const title = item.data.title;

    let message;
    if (title) {
    // タイトルがある場合: ConfirmDeleteHistory キーを使い、タイトルをプレースホルダーとして渡す
    message = chrome.i18n.getMessage("DeleteHistory", [title]); 
    } else {
    // タイトルがない場合: 代替テキスト（"this video"）が組み込まれたメッセージキーを呼び出す
    message = chrome.i18n.getMessage("DeleteHistory");
    
  }
    if (
      confirm(message)
      ) {
      videoItem.style.transition = "opacity 0.3s ease";
      videoItem.style.opacity = "0";
      setTimeout(() => {
        chrome.storage.local.remove(item.id, () => {
          fullVideoHistory = fullVideoHistory.filter(
            (historyItem) => historyItem.id !== item.id
          );
          videoItem.remove();
          if (fullVideoHistory.length === 0) initializeHistory();
        });
      }, 300);
    }
  });
  videoItem.appendChild(deleteButton);
  if (!isArchive) {
    const favoriteButton = document.createElement("button");
    favoriteButton.className = "favorite-button";
    favoriteButton.textContent = "☆";
    if (item.data.isFavorite === true) {
      favoriteButton.classList.add("is-favorite");
      favoriteButton.title = chrome.i18n.getMessage("Unfavorite");
    } else {
      favoriteButton.title = chrome.i18n.getMessage("AddToFavorites");
    }
    let longPressTimer;
    favoriteButton.addEventListener("mousedown", (event) => {
      longPressTimer = setTimeout(() => {
        event.preventDefault();
        event.stopPropagation();
        showTagEditor(realVideoId, favoriteButton);
      }, 700);
    });
    const clearLongPressTimer = () => {
      clearTimeout(longPressTimer);
    };
    favoriteButton.addEventListener("mouseup", clearLongPressTimer);
    favoriteButton.addEventListener("mouseleave", clearLongPressTimer);
    favoriteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const newIsFavorite = !item.data.isFavorite;
      const updatedData = { ...item.data, isFavorite: newIsFavorite };
      saveData({ [realVideoId]: updatedData });
      item.data.isFavorite = newIsFavorite;
      favoriteButton.classList.toggle("is-favorite");
      favoriteButton.title = newIsFavorite
        ? chrome.i18n.getMessage("Unfavorite")
        : chrome.i18n.getMessage("AddToFavorites");
      if (currentFilter === "favorites" && !newIsFavorite) {
        videoItem.style.display = "none";
      }
    });
    videoItem.appendChild(favoriteButton);
    if (item.data.time >= 0) {
      const markWatchedButton = document.createElement("button");
      markWatchedButton.className = "mark-watched-button";
      markWatchedButton.textContent = "✓";
      markWatchedButton.title = chrome.i18n.getMessage("MarkAsWatchedButton");
      markWatchedButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const updatedData = { ...item.data, time: -1, percentage: 100 };
        saveData({ [realVideoId]: updatedData });
        item.data = updatedData;
        videoItem.classList.add("is-completed");
        markWatchedButton.remove();
        if (currentFilter === "unwatched") {
          videoItem.style.display = "none";
        }
      });
      videoItem.appendChild(markWatchedButton);
    }
  }
  if (item.data.tags && item.data.tags.length > 0) {
    updateVideoCardTags(videoItem, item.data.tags);
  }
  return videoItem;
}

function handleExport() {
  chrome.storage.local.get(null, (allItems) => {
    const allData = { ...allItems };
    const backupData = {};
    if (allData.hatonavi_all_tags) {
      backupData.hatonavi_all_tags = allData.hatonavi_all_tags;
      delete allData.hatonavi_all_tags;
    }
    Object.assign(backupData, allData);
    if (Object.keys(backupData).length === 0) {
      alert(chrome.i18n.getMessage("ErrorNoDataToExport"));
      return;
    }
    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    a.download = `hatonavi-backup-${dateString}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
async function handleReplace(importedData) {
  if (
    !confirm( chrome.i18n.getMessage("ImportOverwriteWarning"))
  ) {
    return;
  }
  const currentAllData = await chrome.storage.local.get(null);
  const keysToRemove = [];
  for (const key in currentAllData) {
    if (
      (typeof currentAllData[key] === "object" &&
        currentAllData[key] !== null &&
        currentAllData[key].hasOwnProperty("lastWatched")) ||
      key === "hatonavi_all_tags"
    ) {
      keysToRemove.push(key);
    }
  }
  if (keysToRemove.length > 0) {
    await chrome.storage.local.remove(keysToRemove);
  }
  const dataToSave = {};
  for (const key in importedData) {
    if (
      (typeof importedData[key] === "object" &&
        importedData[key] !== null &&
        importedData[key].hasOwnProperty("lastWatched")) ||
      key === "hatonavi_all_tags"
    ) {
      dataToSave[key] = importedData[key];
    }
  }
  await chrome.storage.local.set(dataToSave);
  alert(chrome.i18n.getMessage("StatusImportOverwriteComplete"));
  location.reload();
}
async function handleMerge(importedData) {
  const getyyyymmdd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };
  const currentAllData = await chrome.storage.local.get(null);
  let mergedData = { ...currentAllData };
  let addedCount = 0;
  let updatedCount = 0;
  for (const key in importedData) {
    const importedItem = importedData[key];
    if (
      !(
        typeof importedItem === "object" &&
        importedItem !== null &&
        importedItem.hasOwnProperty("lastWatched")
      )
    ) {
      if (key !== "hatonavi_all_tags") mergedData[key] = importedItem;
      continue;
    }
    const currentItem = currentAllData[key];
    if (key.includes("~")) {
      if (!currentItem) {
        mergedData[key] = importedItem;
        addedCount++;
      }
      continue;
    }
    if (!currentItem) {
      mergedData[key] = importedItem;
      addedCount++;
    } else {
      const currentDate = new Date(currentItem.lastWatched);
      const importedDate = new Date(importedItem.lastWatched);
      if (importedDate.getTime() === currentDate.getTime()) continue;
      const newerItem = {
        ...(importedDate > currentDate ? importedItem : currentItem),
      };
      const olderItem = {
        ...(importedDate > currentDate ? currentItem : importedItem),
      };
      const currentTags = new Set(currentItem.tags || []);
      const importedTags = new Set(importedItem.tags || []);
      const mergedTags = Array.from(
        new Set([...currentTags, ...importedTags])
      ).sort();
      if (mergedTags.length > 0) newerItem.tags = mergedTags;
      mergedData[key] = newerItem;
      if (newerItem === importedItem) updatedCount++;
      const olderDateStr = getyyyymmdd(new Date(olderItem.lastWatched));
      const newerDateStr = getyyyymmdd(new Date(newerItem.lastWatched));
      if (olderDateStr !== newerDateStr) {
        const archiveKey = `${key}~${olderDateStr}`;
        if (!currentAllData[archiveKey] && !importedData[archiveKey]) {
          mergedData[archiveKey] = olderItem;
        }
      }
    }
  }
  const currentTagsMaster = new Set(currentAllData.hatonavi_all_tags || []);
  const importedTagsMaster = new Set(importedData.hatonavi_all_tags || []);
  mergedData["hatonavi_all_tags"] = Array.from(
    new Set([...currentTagsMaster, ...importedTagsMaster])
  );//.sort();
  await chrome.storage.local.set(mergedData);
  alert(chrome.i18n.getMessage("StatusImportMergeComplete",[addedCount,updatedCount]));
  location.reload();
}
async function initialLoadCheck() {
  const isElementInViewport = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <=
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };
  if (
    isElementInViewport(scrollTrigger) &&
    currentPage * PAGE_SIZE < fullVideoHistory.length
  ) {
    await loadAndRenderPage();
    await initialLoadCheck();
  } else {
    setupIntersectionObserver();
  }
}
function setupIntersectionObserver() {
  if (observer) observer.disconnect();
  const options = { rootMargin: "200px" };
  observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      loadAndRenderPage();
    }
  }, options);
  if (scrollTrigger) {
    observer.observe(scrollTrigger);
  }
}
async function loadAndRenderPage() {
  if (isLoading) return;
  isLoading = true;
  if (scrollTrigger) scrollTrigger.textContent =  chrome.i18n.getMessage("Loading");;
  const start = currentPage * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = fullVideoHistory.slice(start, end);
  if (pageItems.length === 0) {
    if (currentPage > 0 && scrollTrigger) {
      scrollTrigger.textContent = chrome.i18n.getMessage("StatusLoadComplete");
    }
    if (observer) observer.disconnect();
    isLoading = false;
    return;
  }
  const itemsWithInfo = [];
  const itemsToFetch = [];
  pageItems.forEach((item) => {
    item.data.title && item.data.author_name
      ? itemsWithInfo.push(item)
      : itemsToFetch.push(item);
  });
  if (itemsToFetch.length > 0) {
    const videoInfoPromises = itemsToFetch.map((item) => {
      const realVideoId = item.id.includes("~")
        ? item.id.split("~")[0]
        : item.id;
      const serverUrl =
        "https://asia-northeast1-chromeextension0206.cloudfunctions.net/Get-Youtube-Info";
      return fetch(
        `${serverUrl}?videoId=${realVideoId}&fields=title,channelTitle`
      )
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);
    });
    const fetchedInfos = await Promise.all(videoInfoPromises);
    const updates = {};
    fetchedInfos.forEach((info, index) => {
      const item = itemsToFetch[index];
      if (info) {
        item.data.title = info.title;
        item.data.author_name = info.channelTitle;
        itemsWithInfo.push(item);
        updates[item.id] = item.data;
      } else {
        itemsWithInfo.push(item);
      }
    });
    if (Object.keys(updates).length > 0) {
      saveData(updates);
    }
  }
  itemsWithInfo.sort((a, b) => b.data.lastWatched - a.data.lastWatched);
  const settings = await loadData("cleanUrlEnabled");
  const removeTimestamp = settings?.cleanUrlEnabled !== false;
  itemsWithInfo.forEach((item) => {
    const videoElement = createVideoElement(item, removeTimestamp);
    listContainer.appendChild(videoElement);
  });
  currentPage++;
  isLoading = false;
}
async function showTagEditor(videoId, favoriteButtonElement) {
  if (document.querySelector(".tag-editor-overlay")) return;
  document.body.classList.add("modal-open");
  const tagData = await loadData("hatonavi_all_tags");
  const tagMaster = tagData?.hatonavi_all_tags || [];
  const videoDataResult = await loadData(videoId);
  const videoData = videoDataResult?.[videoId] || {};
  const currentVideoTags = new Set(videoData.tags || []);
  const overlay = document.createElement("div");
  overlay.className = "tag-editor-overlay";
  const popup = document.createElement("div");
  popup.className = "tag-editor-popup";
  const tagListDiv = document.createElement("div");
  tagListDiv.className = "tag-list";
  tagMaster.forEach((tag) => {
    const button = createTagButton(tag, currentVideoTags);
    tagListDiv.appendChild(button);
  });
  const addSection = document.createElement("div");
  addSection.className = "tag-add-section";
  const addButton = document.createElement("button");
  addButton.className = "add-tag-button";

  addButton.textContent = chrome.i18n.getMessage("FavoTagAdd");
  addButton.addEventListener("click", async () => {
    const newTagName = prompt(chrome.i18n.getMessage("FavoNewTagName"), "");
    if (newTagName && newTagName.trim() !== "") {
      const trimmedName = newTagName.trim();
      const currentTagData = await loadData("hatonavi_all_tags");
      const currentTagMaster = currentTagData?.hatonavi_all_tags || [];
      if (currentTagMaster.includes(trimmedName)) {
        alert(chrome.i18n.getMessage("TagInUse"));
        return;
      }
      const newButton = createTagButton(trimmedName, new Set([trimmedName]));
      tagListDiv.appendChild(newButton);
      const updatedTagMaster = [...currentTagMaster, trimmedName];//.sort();
      await saveData({ hatonavi_all_tags: updatedTagMaster });
    }
  });
  addSection.appendChild(addButton);
  popup.appendChild(tagListDiv);
  popup.appendChild(addSection);
  let isMouseDownOnOverlay = false;
  const closeAndSave = async () => {
    window.removeEventListener("keydown", handleEscKey);
    window.removeEventListener("mouseup", handleMouseUp);
    document.body.classList.remove("modal-open");
    const selectedTagElements = popup.querySelectorAll(
      ".tag-select-item.is-selected"
    );
    const newTags = Array.from(selectedTagElements).map(
      (btn) => btn.dataset.tagName
    );
    const updatedData = { ...videoData, tags: newTags };
    await saveData({ [videoId]: updatedData });
    const targetItem = fullVideoHistory.find((item) => item.id === videoId);
    if (targetItem) targetItem.data.tags = newTags;
    const videoCard = favoriteButtonElement.closest(".video-item");
    if (videoCard) updateVideoCardTags(videoCard, newTags);
    popup.classList.add("is-closing");
    overlay.classList.add("is-closing");
    setTimeout(() => {
      if (overlay) overlay.remove();
    }, 150);
  };
  const handleEscKey = (event) => {
    if (event.key === "Escape") closeAndSave();
  };
  const handleMouseUp = () => {
    if (isMouseDownOnOverlay) {
      closeAndSave();
    }
  };
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      isMouseDownOnOverlay = true;
    }
  });
  window.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("keydown", handleEscKey);
  popup.style.visibility = "hidden";
  document.body.appendChild(overlay);
  overlay.appendChild(popup);
  const btnRect = favoriteButtonElement.getBoundingClientRect();
  const popupHeight = popup.offsetHeight;
  const popupWidth = popup.offsetWidth;
  const spaceBelow = window.innerHeight - btnRect.bottom;
  let popupTop;
  if (spaceBelow < popupHeight && btnRect.top > popupHeight) {
    popupTop = btnRect.bottom - popupHeight;
    popup.classList.add("shows-above");
  } else {
    popupTop = btnRect.top;
  }
  const popupLeft = btnRect.right + 10;
  if (popupLeft + popupWidth > window.innerWidth) {
    popup.style.left = `${btnRect.left - popupWidth - 10}px`;
  } else {
    popup.style.left = `${popupLeft}px`;
  }
  popup.style.top = `${popupTop}px`;
  popup.style.visibility = "visible";
  popup.style.animation = "fadeIn 0.2s ease-out forwards";
}
function createTagButton(tag, selectedTagsSet) {
  const button = document.createElement("button");
  button.className = "tag-select-item";
  button.textContent = tag;
  button.dataset.tagName = tag;
  if (selectedTagsSet.has(tag)) button.classList.add("is-selected");
  button.addEventListener("click", () => {
    button.classList.toggle("is-selected");
  });
  return button;
}
function updateVideoCardTags(videoCard, tags) {
  const oldTagsContainer = videoCard.querySelector(".tags-container");
  if (oldTagsContainer) oldTagsContainer.remove();
  const oldToggleButton = videoCard.querySelector(".toggle-tags-button");
  if (oldToggleButton) oldToggleButton.remove();
  if (tags && tags.length > 0) {
    const infoDiv = videoCard.querySelector(".info");
    const dateP = videoCard.querySelector(".last-watched-date");
    if (!infoDiv || !dateP) return;
    const toggleButton = document.createElement("button");
    toggleButton.className = "toggle-tags-button";
    // ★★★ SVGコードはもう不要！空っぽでOK！ ★★★
    toggleButton.innerHTML = '';
    toggleButton.title = "タグの表示/非表示";
    dateP.appendChild(toggleButton);
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "tags-container";
    tags.forEach((tag) => {
      const tagElement = document.createElement("span");
      tagElement.className = "tag-item";
      tagElement.textContent = tag;
      tagElement.style.backgroundColor = getTagColor(tag);
      tagsContainer.appendChild(tagElement);
    });
    toggleButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      tagsContainer.classList.toggle("show");
      toggleButton.classList.toggle("toggled");
    });
    infoDiv.appendChild(tagsContainer);
  }
}
async function showTagManager() {
  document.body.classList.add("modal-open");
  const tagData = await loadData("hatonavi_all_tags");
  const originalTags = tagData?.hatonavi_all_tags || [];
  tagManagerContainer.classList.add("show");
  tagManagerContainer.innerHTML = /* html */ `<div id="tag-manager-overlay">
    <div id="tag-manager-popup">
      <h3 data-i18n="TagManagement">🏷️タグ管理</h3>
      <div class="tag-manager-list">
        ${originalTags
          .map(
            (tag) =>
              `<div class="tag-manager-item" data-original-tag="${escapeHTML(
                tag
              )}"><input type="text" value="${escapeHTML(
                tag
              )}"><button class="rename-btn" style="display:none;">✏️</button><button class="delete-btn">🗑️</button></div>`
          )
          .join("")}
      </div>
      <div class="tag-manager-controls">
        <div class="add-section">
          <input
            type="text"
            id="new-tag-input"
            data-i18n-placeholder="LabelNewTagName">

          <button id="add-tag-btn" data-i18n="TagAdd">＋追加</button>
        </div>
        <div class="action-buttons">
          <button id="cancel-tags-btn" data-i18n="TagCancel">キャンセル</button>
          <button id="save-tags-btn" data-i18n="TagSave">✓ 変更を保存</button>
        </div>
      </div>
    </div>
  </div>`;
  //タグ管理翻訳
  translateWithin(tagManagerContainer);


   
  

  const popup = document.getElementById("tag-manager-popup");
  const overlay = document.getElementById("tag-manager-overlay");
  const listElement = popup.querySelector(".tag-manager-list");
  const closeModal = () => {
    document.body.classList.remove("modal-open");
    tagManagerContainer.classList.remove("show");
    tagManagerContainer.innerHTML = "";
  };
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  popup.querySelector("#cancel-tags-btn").addEventListener("click", closeModal);
  popup.querySelector("#add-tag-btn").addEventListener("click", () => {
    const input = popup.querySelector("#new-tag-input");
    const newTagName = input.value.trim();
    // ★★★ ここからが、バグ修正ブロック！ ★★★
    if (newTagName) {
      // --- 1. 現在リストにある全てのタグ名を取得する ---
      const currentTagElements = listElement.querySelectorAll(
        ".tag-manager-item input"
      );
      // is-deletedクラスが付いていない（削除対象じゃない）タグだけをリストアップ
      const existingTagNames = Array.from(currentTagElements)
        .filter(
          (inputEl) =>
            !inputEl
              .closest(".tag-manager-item")
              .classList.contains("is-deleted")
        )
        .map((inputEl) => inputEl.value.trim());

      // --- 2. 新しいタグ名が、すでにリストにないかチェック！ ---
      if (existingTagNames.includes(newTagName)) {
        // （本当はここも多言語対応したいけど、今はアラートだけ！）
        alert("そのタグはすでにリストに存在します！");
        return; // ここで処理を中断！
      }
      // ★★★ バグ修正ブロックは、ここまで！ ★★★

      // --- 3. 問題なければ、新しい要素を追加する ---
      const newItem = document.createElement("div");
      newItem.className = "tag-manager-item";
      newItem.dataset.isNew = "true";
      newItem.innerHTML = `<input type="text" value="${escapeHTML(
        newTagName
      )}"><button class="rename-btn" style="display:none;">✏️</button><button class="delete-btn">🗑️</button>`;
      listElement.appendChild(newItem);
      input.value = "";
    }
  });
  listElement.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const item = e.target.closest(".tag-manager-item");
      item.classList.toggle("is-deleted");
    }
  });

  // ★★★★★★★★★★★★★★★★★★★★★
  // ★★★ ここからがドラッグ＆ドロップ ★★★
  // ★★★★★★★★★★★★★★★★★★★★★
  const tagItems = listElement.querySelectorAll('.tag-manager-item');

  // 全てのタグアイテムに、ドラッグできる属性を追加
  tagItems.forEach(item => {
    item.setAttribute('draggable', 'true');
    const input = item.querySelector('input');
    // input部分をドラッグのハンドル（持ち手）にする
    input.addEventListener('mousedown', () => {
      item.setAttribute('draggable', 'true');
    });
    // input以外をクリックした時は、ドラッグできないようにする
    item.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() !== 'input') {
            item.setAttribute('draggable', 'false');
        }
    });
  });

  let draggedItem = null;

  // ドラッグを開始した時のイベント
  listElement.addEventListener('dragstart', (e) => {
    draggedItem = e.target;
    // ちょっと遅れてクラスを付けると、スムーズに見える
    setTimeout(() => {
      e.target.classList.add('is-dragging');
    }, 0);
  });
  
  // ドラッグが終了した時のイベント（ドロップ成功でも失敗でも呼ばれる）
  listElement.addEventListener('dragend', (e) => {
    e.target.classList.remove('is-dragging');
  });

  // 他の要素の上を通過している時のイベント
  listElement.addEventListener('dragover', (e) => {
    e.preventDefault(); // これがないとドロップが機能しない！
    const afterElement = getDragAfterElement(listElement, e.clientY);
    const currentDragging = document.querySelector('.is-dragging');
    
    // 全ての要素から一旦 drag-over クラスを消す
    listElement.querySelectorAll('.tag-manager-item').forEach(item => {
      item.classList.remove('drag-over');
    });
    
    if (afterElement == null) {
      // どこにも重なってない（一番下）なら何もしない
    } else {
      // 重なってる要素にクラスを付けて、隙間を演出
      if(afterElement !== currentDragging) {
        afterElement.classList.add('drag-over');
      }
    }
  });

  // ドロップした瞬間のイベント
  listElement.addEventListener('drop', (e) => {
    e.preventDefault();
    const afterElement = getDragAfterElement(listElement, e.clientY);
     // 全ての要素から drag-over クラスを消す
    listElement.querySelectorAll('.tag-manager-item').forEach(item => {
      item.classList.remove('drag-over');
    });

    if (afterElement == null) {
      listElement.appendChild(draggedItem); // 一番下に移動
    } else {
      listElement.insertBefore(draggedItem, afterElement); // 特定の要素の前に移動
    }
  });

  // Y座標から、どの要素の前にドロップすべきかを計算する関数
  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.tag-manager-item:not(.is-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  // ★★★★★★★★★★★★★★★★★★★★★
  // ★★★ ドラッグ＆ドロップはここまで ★★★
  // ★★★★★★★★★★★★★★★★★★★★★




  popup.querySelector("#save-tags-btn").addEventListener("click", async () => {
    await saveTagChanges(originalTags, popup);
    closeModal();
    await initializeHistory();
  });
}
async function saveTagChanges(originalTags, popup) {
  console.log("タグの保存処理を開始します...");
  const allItems = await chrome.storage.local.get(null);
  const updates = {};
  const tagItems = popup.querySelectorAll(".tag-manager-item");
  const finalTags = [];
  const renamedTags = [];
  const deletedTags = new Set();
  tagItems.forEach((item) => {
    const input = item.querySelector('input[type="text"]');
    const newName = input.value.trim();
    if (item.classList.contains("is-deleted")) {
      if (!item.dataset.isNew) {
        deletedTags.add(item.dataset.originalTag);
      }
    } else if (newName) {
      finalTags.push(newName);
      if (!item.dataset.isNew && item.dataset.originalTag !== newName) {
        renamedTags.push({ old: item.dataset.originalTag, new: newName });
      }
    }
  });
  updates["hatonavi_all_tags"] = finalTags;//.sort();
  for (const key in allItems) {
    if (
      typeof allItems[key] === "object" &&
      allItems[key] !== null &&
      Array.isArray(allItems[key].tags)
    ) {
      let currentTags = allItems[key].tags;
      let needsUpdate = false;
      const tagsAfterDeletion = currentTags.filter((t) => !deletedTags.has(t));
      if (tagsAfterDeletion.length < currentTags.length) {
        needsUpdate = true;
      }
      const tagsAfterRename = tagsAfterDeletion.map((t) => {
        const found = renamedTags.find((r) => r.old === t);
        if (found) {
          needsUpdate = true;
          return found.new;
        }
        return t;
      });
      if (needsUpdate) {
        updates[key] = {
          ...allItems[key],
          tags: [...new Set(tagsAfterRename)],//.sort(),
        };
      }
    }
  }
  console.log("最終的な更新内容:", updates);
  if (Object.keys(updates).length > 0) {
    await saveData(updates);
    alert(chrome.i18n.getMessage("StatusTagUpdated"));
  } else {
    alert("変更はありませんでした。");
  }
}
function getTagColor(tagName) {
  let hash = 0;
  for (let i = 0; i < tagName.length; i++) {
    hash = tagName.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 45%)`;
}
function saveData(data) {
  return chrome.storage.local.set(data);
}
function loadData(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
}
function escapeHTML(str) {
  return str.replace(/[&<>"']/g, function (match) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[match];
  });
}

/**
 * 翻訳関数
 * @param {HTMLElement} container - 翻訳したい要素たちがいる、親のHTML要素（divとか）を渡す
 */
function translateWithin(container) {
  // 普通のテキスト (data-i18n) を探して翻訳する
  container.querySelectorAll('[data-i18n]').forEach(element => {
    const messageName = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(messageName);
    if (message) {
      element.textContent = message;
    }
  });

  // プレースホルダー (data-i18n-placeholder) を探して翻訳する
  container.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const messageName = element.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(messageName);
    if (message) {
      element.placeholder = message;
    }
  });
}
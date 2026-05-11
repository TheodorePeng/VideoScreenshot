// 默认设置
const defaultSettings = {
  fileType: 'png',
  shortcut: 'Alt+S',
  saveLocation: '',
  autoSave: false
};

const FRAME_REGISTRY_KEY = 'videoFrameRegistry';
const FRAME_STATUS_TTL = 15000;

// 监听扩展程序安装或更新事件
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.sync.get(defaultSettings, (settings) => {
    const newSettings = {};
    let settingsChanged = false;

    for (const key in defaultSettings) {
      if (settings[key] === undefined) {
        newSettings[key] = defaultSettings[key];
        settingsChanged = true;
      }
    }

    if (settingsChanged) {
      chrome.storage.sync.set(newSettings, () => {
        console.log('初始化默认设置:', newSettings);
      });
    }
  });

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: 'firstrun.html'
    });
  }
});

// 监听快捷键
chrome.commands.onCommand.addListener((command) => {
  if (command === 'take-screenshot') {
    chrome.storage.sync.get(defaultSettings, (settings) => {
      requestActiveTabScreenshot(settings).then(result => {
        if (!result.success) {
          console.warn('[background] 快捷键截图失败:', result.error);
        }
      });
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabFromRegistry(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    removeTabFromRegistry(tabId);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'videoStatus') {
    updateFrameStatus(message, sender).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'requestActiveTabScreenshot') {
    requestActiveTabScreenshot(message.settings).then(sendResponse);
    return true;
  }

  if (message.action === 'downloadScreenshot') {
    downloadScreenshot(message).then(sendResponse);
    return true;
  }

  return false;
});

async function requestActiveTabScreenshot(settingsOverride) {
  const settings = settingsOverride || await getSettings();
  const tabs = await queryTabs({ active: true, currentWindow: true });

  if (!tabs || tabs.length === 0) {
    return { success: false, error: '未找到当前标签页' };
  }

  const tab = tabs[0];
  await pingTabFrames(tab.id);

  const frame = await selectBestVideoFrame(tab.id);
  if (!frame) {
    return { success: false, error: '未检测到可截图视频' };
  }

  try {
    const response = await sendMessageToFrame(tab.id, frame.frameId, {
      action: 'takeScreenshot',
      settings
    });

    if (response && response.success) {
      return response;
    }

    return {
      success: false,
      error: response && response.error ? response.error : '截图失败'
    };
  } catch (error) {
    console.error('[background] 向视频 frame 发送截图请求失败:', error);
    await removeFrameFromRegistry(tab.id, frame.frameId);
    return { success: false, error: '视频页面暂时无法响应截图请求' };
  }
}

async function pingTabFrames(tabId) {
  try {
    await sendMessageToTab(tabId, { action: 'pingVideoStatus' });
  } catch (error) {
    // 正常页面可能没有内容脚本，后续注册表选择会给出明确结果。
  }

  await wait(300);
}

async function updateFrameStatus(message, sender) {
  if (!sender.tab || sender.frameId === undefined) return;

  const registry = await getFrameRegistry();
  const tabId = String(sender.tab.id);
  const frameId = String(sender.frameId);

  if (!registry[tabId]) {
    registry[tabId] = {};
  }

  if (!message.hasVideo) {
    delete registry[tabId][frameId];
    if (Object.keys(registry[tabId]).length === 0) {
      delete registry[tabId];
    }
    await setFrameRegistry(registry);
    return;
  }

  const rect = message.rect || {};
  registry[tabId][frameId] = {
    tabId: sender.tab.id,
    frameId: sender.frameId,
    frameUrl: message.frameUrl || sender.url || '',
    videoWidth: message.videoWidth || 0,
    videoHeight: message.videoHeight || 0,
    rect: {
      width: rect.width || 0,
      height: rect.height || 0,
      top: rect.top || 0,
      left: rect.left || 0
    },
    timestamp: message.timestamp || Date.now()
  };

  await setFrameRegistry(registry);
}

async function selectBestVideoFrame(tabId) {
  const registry = await getFrameRegistry();
  const frames = Object.values(registry[String(tabId)] || {});
  const now = Date.now();

  const validFrames = frames
    .filter(frame => now - frame.timestamp <= FRAME_STATUS_TTL)
    .filter(frame => frame.rect.width > 40 && frame.rect.height > 40)
    .sort((a, b) => {
      const aArea = a.rect.width * a.rect.height;
      const bArea = b.rect.width * b.rect.height;

      if (bArea !== aArea) return bArea - aArea;
      return b.timestamp - a.timestamp;
    });

  return validFrames[0] || null;
}

async function downloadScreenshot(message) {
  console.log('[background] 收到截图下载请求:', JSON.stringify({
    fileType: message.fileType,
    hasDataUrl: !!message.dataUrl
  }, null, 2));

  const settings = await getSettings();

  if (!message.dataUrl) {
    console.error('[background] 消息中缺少图像数据 (dataUrl)');
    return { success: false, error: '无效的图像数据' };
  }

  try {
    const fileType = message.fileType && ['png', 'jpg', 'webp'].includes(message.fileType)
      ? message.fileType
      : 'png';

    const baseFileName = createTimestampFilename(fileType);
    let finalFileName = baseFileName;

    if (settings.saveLocation && settings.saveLocation.trim() !== '') {
      const cleanLocation = settings.saveLocation.trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '');

      if (cleanLocation) {
        finalFileName = `${cleanLocation}/${baseFileName}`;
      }
    }

    const downloadOptions = {
      url: message.dataUrl,
      filename: finalFileName,
      saveAs: !settings.autoSave
    };

    const downloadId = await downloadFile(downloadOptions);

    if (downloadId === undefined && downloadOptions.saveAs) {
      return { success: false, error: '用户取消了保存' };
    }

    return { success: true, downloadId };
  } catch (error) {
    console.error('[background] 下载API出错:', error);
    return { success: false, error: getDownloadErrorMessage(error.message || '') };
  }
}

function createTimestampFilename(fileType) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `screenshot_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.${fileType}`;
}

function getDownloadErrorMessage(errorMessage) {
  if (errorMessage.includes('Invalid filename')) {
    return '截图保存失败：文件名或路径包含无效字符';
  }

  if (errorMessage.includes('filesystem')) {
    return '截图保存失败：无法访问文件系统或路径';
  }

  return '截图保存失败';
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(defaultSettings, resolve);
  });
}

function queryTabs(queryInfo) {
  return new Promise(resolve => {
    chrome.tabs.query(queryInfo, resolve);
  });
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function sendMessageToFrame(tabId, frameId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function downloadFile(downloadOptions) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(downloadOptions, downloadId => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(downloadId);
    });
  });
}

function wait(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}

function getFrameRegistry() {
  return new Promise(resolve => {
    chrome.storage.session.get({ [FRAME_REGISTRY_KEY]: {} }, result => {
      resolve(result[FRAME_REGISTRY_KEY] || {});
    });
  });
}

function setFrameRegistry(registry) {
  return new Promise(resolve => {
    chrome.storage.session.set({ [FRAME_REGISTRY_KEY]: registry }, resolve);
  });
}

async function removeFrameFromRegistry(tabId, frameId) {
  const registry = await getFrameRegistry();
  const tabKey = String(tabId);

  if (registry[tabKey]) {
    delete registry[tabKey][String(frameId)];

    if (Object.keys(registry[tabKey]).length === 0) {
      delete registry[tabKey];
    }

    await setFrameRegistry(registry);
  }
}

async function removeTabFromRegistry(tabId) {
  const registry = await getFrameRegistry();

  if (registry[String(tabId)]) {
    delete registry[String(tabId)];
    await setFrameRegistry(registry);
  }
}

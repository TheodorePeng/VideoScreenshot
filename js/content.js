// 默认设置
const defaultSettings = {
  fileType: 'png',
  saveLocation: '',
  autoSave: false
};

const PROTECTED_VIDEO_ERROR = '该视频源受浏览器保护，无法直接截图';
const MIN_VISIBLE_SIZE = 40;

let videoElement = null;
let screenshotButton = null;
let isFullscreen = false;
let buttonTimeout = null;
let resizeObserver = null;
let resizeHandler = null;
let scanTimeout = null;
let currentPlatform = 'generic';
let registeredHasVideo = false;

function init() {
  currentPlatform = detectPlatform();
  setupVideoDetection();

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

  window.addEventListener('pagehide', () => {
    reportVideoStatus(false);
  });
}

function detectPlatform() {
  const host = window.location.hostname;

  if (host.includes('youtube.com')) return 'youtube';
  if (host.includes('netflix.com')) return 'netflix';
  if (host.includes('vimeo.com')) return 'vimeo';
  if (host.includes('amazon')) return 'amazon';
  if (host.includes('hulu.com')) return 'hulu';
  if (host.includes('hbomax.com') || host.includes('max.com')) return 'hbo';
  if (host.includes('disneyplus.com')) return 'disney';
  if (host.includes('bilibili.com')) return 'bilibili';

  return 'generic';
}

function setupVideoDetection() {
  scanForBestVideo();

  const observer = new MutationObserver(scheduleVideoScan);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src', 'style', 'class']
  });

  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(scanForBestVideo, 1000);
  });

  setInterval(scanForBestVideo, 2000);
}

function scheduleVideoScan() {
  clearTimeout(scanTimeout);
  scanTimeout = setTimeout(scanForBestVideo, 150);
}

function scanForBestVideo() {
  const bestVideo = findBestVideo();

  if (bestVideo && bestVideo !== videoElement) {
    setVideoElement(bestVideo);
    return;
  }

  if (bestVideo && bestVideo === videoElement) {
    reportVideoStatus(true);
    ensureButtonVisible();
    return;
  }

  clearVideoElement();
}

function findBestVideo() {
  const videos = Array.from(document.querySelectorAll(getVideoSelector(currentPlatform)));
  const candidates = videos
    .map(video => ({ video, score: scoreVideo(video) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  return candidates.length > 0 ? candidates[0].video : null;
}

function getVideoSelector(platform) {
  if (platform === 'youtube') {
    return 'video.html5-main-video, video';
  }

  return 'video';
}

function scoreVideo(video) {
  if (!video || !document.documentElement.contains(video)) return 0;

  const rect = video.getBoundingClientRect();
  const style = getComputedStyle(video);
  const area = rect.width * rect.height;
  const hasIntrinsicSize = video.videoWidth > 0 && video.videoHeight > 0;
  const isReady = video.readyState >= 2;
  const isVisible = (
    rect.width > MIN_VISIBLE_SIZE &&
    rect.height > MIN_VISIBLE_SIZE &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0
  );

  if (!isVisible) return 0;

  let score = area;
  if (hasIntrinsicSize) score += 100000000;
  if (isReady) score += 10000000;
  if (!video.paused) score += 1000000;

  return score;
}

function setVideoElement(video) {
  cleanupCurrentButton();
  videoElement = video;
  injectScreenshotButton(currentPlatform);
  reportVideoStatus(true);
}

function clearVideoElement() {
  if (!videoElement && !registeredHasVideo) return;

  cleanupCurrentButton();
  videoElement = null;
  reportVideoStatus(false);
}

function cleanupCurrentButton() {
  clearTimeout(buttonTimeout);

  if (videoElement) {
    videoElement.removeEventListener('mouseenter', showButtonOnHover);
    videoElement.removeEventListener('mouseleave', dimButtonAfterHover);
  }

  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (screenshotButton && screenshotButton.parentNode) {
    screenshotButton.remove();
  }

  screenshotButton = null;
}

function reportVideoStatus(hasVideo) {
  registeredHasVideo = hasVideo;

  const payload = {
    action: 'videoStatus',
    hasVideo,
    frameUrl: window.location.href,
    timestamp: Date.now()
  };

  if (hasVideo && videoElement) {
    const rect = videoElement.getBoundingClientRect();
    payload.videoWidth = videoElement.videoWidth || 0;
    payload.videoHeight = videoElement.videoHeight || 0;
    payload.rect = {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left
    };
  }

  try {
    chrome.runtime.sendMessage(payload);
  } catch (error) {
    console.warn('[VideoScreenshot] 无法上报视频状态:', error);
  }
}

function handleFullscreenChange() {
  isFullscreen = !!document.fullscreenElement || !!document.webkitFullscreenElement;

  if (videoElement) {
    injectScreenshotButton(currentPlatform);

    if (isFullscreen && screenshotButton) {
      screenshotButton.style.opacity = '0.2';
      setTimeout(() => {
        if (screenshotButton && document.documentElement.contains(screenshotButton)) {
          positionButtonInsideVideo(screenshotButton, videoElement);
        }
      }, 500);
    }
  }
}

function ensureButtonVisible() {
  if (!videoElement) return;

  if (!screenshotButton || !document.documentElement.contains(screenshotButton)) {
    injectScreenshotButton(currentPlatform);
    return;
  }

  positionButtonInsideVideo(screenshotButton, videoElement);
}

function injectScreenshotButton(platform) {
  if (!videoElement) return;

  cleanupCurrentButton();

  screenshotButton = document.createElement('div');
  screenshotButton.className = 'screenshotBtn';
  screenshotButton.title = '截取视频截图';
  screenshotButton.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="white">
      <path d="M12 8.8a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4z"/>
      <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
    </svg>
  `;

  const videoContainer = findVideoContainer(videoElement, platform);
  if (!videoContainer) {
    return;
  }

  if (getComputedStyle(videoContainer).position === 'static') {
    videoContainer.style.position = 'relative';
  }

  videoContainer.appendChild(screenshotButton);
  screenshotButton.addEventListener('click', () => {
    takeScreenshot();
  });

  videoElement.addEventListener('mouseenter', showButtonOnHover);
  videoElement.addEventListener('mouseleave', dimButtonAfterHover);

  resizeHandler = () => {
    if (screenshotButton && videoElement) {
      clearTimeout(buttonTimeout);
      buttonTimeout = setTimeout(() => {
        positionButtonInsideVideo(screenshotButton, videoElement);
        reportVideoStatus(true);
      }, 100);
    }
  };

  window.addEventListener('resize', resizeHandler);

  resizeObserver = new ResizeObserver(resizeHandler);
  resizeObserver.observe(videoElement);

  positionButtonInsideVideo(screenshotButton, videoElement);
}

function showButtonOnHover() {
  if (screenshotButton) {
    screenshotButton.style.opacity = '0.5';
  }
}

function dimButtonAfterHover() {
  if (screenshotButton) {
    screenshotButton.style.opacity = isFullscreen ? '0.2' : '0.25';
  }
}

function findVideoContainer(video, platform) {
  if (!video || !video.parentNode) return null;

  if (platform === 'youtube') {
    return document.querySelector('.html5-video-container') ||
           document.querySelector('.ytp-player-content') ||
           video.parentNode;
  }

  if (platform === 'bilibili') {
    return document.querySelector('.bilibili-player-video-wrap') ||
           document.querySelector('.bpx-player-video-area') ||
           video.parentNode;
  }

  if (platform === 'netflix') {
    return document.querySelector('.video-container') ||
           document.querySelector('.nf-player-container') ||
           video.parentNode;
  }

  let container = video.parentNode;

  while (container && container !== document.body && container !== document.documentElement) {
    const position = getComputedStyle(container).position;

    if (position === 'relative' || position === 'absolute' || position === 'fixed') {
      return container;
    }

    container = container.parentNode;
  }

  return video.parentNode;
}

function positionButtonInsideVideo(button, video) {
  if (!button || !video) return;

  const videoRect = video.getBoundingClientRect();
  const isVisible = (
    videoRect.top < window.innerHeight &&
    videoRect.bottom > 0 &&
    videoRect.width > MIN_VISIBLE_SIZE &&
    videoRect.height > MIN_VISIBLE_SIZE
  );

  if (!isVisible) {
    button.style.display = 'none';
    return;
  }

  button.style.display = 'flex';

  const smallVideo = videoRect.width < 400 || videoRect.height < 300;

  if (smallVideo) {
    button.style.width = '16px';
    button.style.height = '16px';
    button.style.right = '6px';
    button.style.top = '6px';
  } else {
    button.style.width = '20px';
    button.style.height = '20px';
    button.style.right = '8px';
    button.style.top = '8px';
  }

  button.style.position = 'absolute';
  button.style.zIndex = '2147483647';
}

async function takeScreenshot(settingsOverride) {
  const settings = settingsOverride || await getSettings();

  if (!videoElement || !document.documentElement.contains(videoElement)) {
    scanForBestVideo();
  }

  if (!videoElement) {
    return finishScreenshot({ success: false, error: '截图失败：未找到视频元素' });
  }

  if (!videoElement.videoWidth || !videoElement.videoHeight) {
    return finishScreenshot({ success: false, error: '截图失败：视频画面尚未准备好' });
  }

  try {
    if (screenshotButton) {
      screenshotButton.style.opacity = '0';
    }

    prepareScreenshotEnvironment();

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('无法创建截图画布');
    }

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    restoreScreenshotEnvironment();

    const fileType = settings.fileType || 'png';
    const result = await processScreenshot(canvas, fileType);

    return finishScreenshot(result);
  } catch (error) {
    restoreScreenshotEnvironment();
    console.error('截图过程出错:', error);

    const protectedErrorNames = ['SecurityError', 'NotSupportedError'];
    const errorMessage = protectedErrorNames.includes(error.name)
      ? PROTECTED_VIDEO_ERROR
      : (error.message || '截图失败，请重试');

    return finishScreenshot({ success: false, error: errorMessage });
  }
}

function finishScreenshot(result) {
  if (screenshotButton) {
    screenshotButton.style.opacity = isFullscreen ? '0.2' : '0.25';

    if (result.success) {
      animateButtonSuccess();
    }
  }

  showNotification(
    result.success ? getSuccessMessage(result) : (result.error || '截图失败，请重试'),
    result.success ? 'success' : 'fail'
  );

  return result;
}

function getSuccessMessage(result) {
  if (result.clipboard) return '截图已复制到剪贴板';
  return '截图已保存';
}

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(defaultSettings, resolve);
  });
}

function animateButtonSuccess() {
  if (!screenshotButton) return;

  screenshotButton.classList.add('screenshot-success');

  setTimeout(() => {
    screenshotButton.classList.remove('screenshot-success');
  }, 300);
}

function prepareScreenshotEnvironment() {
  document.body.classList.add('taking-screenshot');

  if (videoElement) {
    videoElement.classList.add('video-element');
  }
}

function restoreScreenshotEnvironment() {
  document.body.classList.remove('taking-screenshot');

  if (videoElement) {
    videoElement.classList.remove('video-element');
  }
}

function processScreenshot(canvas, fileType) {
  if (fileType === 'clipboard') {
    return copyCanvasToClipboard(canvas);
  }

  return downloadCanvas(canvas, fileType);
}

function copyCanvasToClipboard(canvas) {
  return new Promise(resolve => {
    if (!navigator.clipboard || !window.ClipboardItem) {
      resolve({ success: false, error: '您的浏览器不支持复制到剪贴板' });
      return;
    }

    canvas.toBlob(blob => {
      if (!blob) {
        resolve({ success: false, error: PROTECTED_VIDEO_ERROR });
        return;
      }

      navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob
        })
      ]).then(() => {
        resolve({ success: true, clipboard: true });
      }).catch(error => {
        console.error('复制到剪贴板失败:', error);
        resolve({ success: false, error: '复制到剪贴板失败' });
      });
    }, 'image/png');
  });
}

function downloadCanvas(canvas, fileType) {
  return new Promise(resolve => {
    let mimeType = 'image/png';
    if (fileType === 'jpg') mimeType = 'image/jpeg';
    if (fileType === 'webp') mimeType = 'image/webp';

    let dataUrl;
    try {
      dataUrl = canvas.toDataURL(mimeType);
    } catch (error) {
      console.error('生成截图数据失败:', error);
      resolve({ success: false, error: PROTECTED_VIDEO_ERROR });
      return;
    }

    chrome.runtime.sendMessage({
      action: 'downloadScreenshot',
      dataUrl,
      fileType
    }, response => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message || '截图保存失败' });
        return;
      }

      if (response && response.success) {
        resolve(response);
      } else {
        resolve({
          success: false,
          error: response && response.error ? response.error : '截图保存失败'
        });
      }
    });
  });
}

function showNotification(message, type) {
  const existingNotification = document.querySelector('.screenshotNotification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'screenshotNotification';

  const content = document.createElement('div');
  content.className = `content ${type}`;
  content.textContent = message;

  notification.appendChild(content);
  document.body.appendChild(notification);

  setTimeout(() => {
    if (notification && document.body.contains(notification)) {
      notification.remove();
    }
  }, 3000);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'takeScreenshot') {
    takeScreenshot(message.settings).then(sendResponse);
    return true;
  }

  if (message.action === 'pingVideoStatus') {
    scanForBestVideo();
    sendResponse({ success: true, hasVideo: !!videoElement });
    return true;
  }

  return false;
});

init();

// 设置选项
const fileTypeOptions = [
  { value: 'png', label: '.png' },
  { value: 'jpg', label: '.jpg' },
  { value: 'webp', label: '.webp' },
  { value: 'clipboard', label: '复制到剪贴板' }
];

// 默认设置
const defaultSettings = {
  fileType: 'png',
  shortcut: 'Alt+S',
  saveLocation: '',
  autoSave: false
};

// 按键映射表（用于在Windows和Mac之间显示不同按键名称）
const keyMap = {
  // 修饰键
  'Control': { win: 'Ctrl', mac: '⌃' },
  'Alt': { win: 'Alt', mac: '⌥' },
  'Shift': { win: 'Shift', mac: '⇧' },
  'Meta': { win: 'Win', mac: '⌘' },
  // 特殊键
  'ArrowUp': { win: '↑', mac: '↑' },
  'ArrowDown': { win: '↓', mac: '↓' },
  'ArrowLeft': { win: '←', mac: '←' },
  'ArrowRight': { win: '→', mac: '→' },
  'Escape': { win: 'Esc', mac: 'Esc' },
  'Enter': { win: 'Enter', mac: 'Return' },
  'Backspace': { win: 'Backspace', mac: 'Delete' },
  'Delete': { win: 'Delete', mac: 'Del' },
  'Tab': { win: 'Tab', mac: 'Tab' },
  'CapsLock': { win: 'CapsLock', mac: 'CapsLock' },
  'Home': { win: 'Home', mac: 'Home' },
  'End': { win: 'End', mac: 'End' },
  'PageUp': { win: 'PgUp', mac: 'PgUp' },
  'PageDown': { win: 'PgDn', mac: 'PgDn' },
  'Insert': { win: 'Insert', mac: 'Insert' },
  'Space': { win: 'Space', mac: 'Space' }
};

// 检测是否是Mac系统
const isMac = navigator.platform.includes('Mac');

// 初始化弹出窗口
document.addEventListener('DOMContentLoaded', () => {
  // 确保字符编码正确
  document.querySelector('html').setAttribute('lang', 'zh-CN');
  
  // 创建并加载设置控件
  createFileTypeControl();
  setupSaveLocationControl();
  setupShortcutDisplay();
  
  // 从存储中加载设置
  loadSettings();
  
  // 设置截图按钮点击事件
  document.getElementById('takeScreenshot').addEventListener('click', requestScreenshot);
});

// 请求当前标签页截图
function requestScreenshot() {
  const button = document.getElementById('takeScreenshot');

  if (button.classList.contains('disabled')) return;

  setScreenshotStatus('正在截图...', '');
  button.classList.add('disabled');

  chrome.storage.sync.get(defaultSettings, (settings) => {
    chrome.runtime.sendMessage({
      action: 'requestActiveTabScreenshot',
      settings: settings
    }, response => {
      button.classList.remove('disabled');

      if (chrome.runtime.lastError) {
        setScreenshotStatus(chrome.runtime.lastError.message || '截图失败', 'fail');
        return;
      }

      if (response && response.success) {
        setScreenshotStatus(response.clipboard ? '截图已复制到剪贴板' : '截图已保存', 'success');
        setTimeout(() => {
          window.close();
        }, 500);
        return;
      }

      setScreenshotStatus(response && response.error ? response.error : '截图失败', 'fail');
    });
  });
}

// 设置截图状态提示
function setScreenshotStatus(message, type) {
  const status = document.getElementById('screenshotStatus');
  status.textContent = message;
  status.className = `screenshot-status ${type || ''}`.trim();
}

// 创建文件类型控件
function createFileTypeControl() {
  const select = document.createElement('select');
  select.id = 'fileType';
  
  fileTypeOptions.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.appendChild(optionElement);
  });
  
  select.addEventListener('change', () => {
    saveSettings({ fileType: select.value });
  });
  
  document.getElementById('fileTypeControl').appendChild(select);
}

// 设置快捷键显示
function setupShortcutDisplay() {
  const openShortcutPageButton = document.getElementById('openShortcutPage');
  
  // 点击按钮打开Chrome扩展快捷键设置页面
  openShortcutPageButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    window.close(); // 关闭弹出窗口
  });
  
  // 查询当前扩展的命令信息
  chrome.commands.getAll(commands => {
    const takeScreenshotCommand = commands.find(cmd => cmd.name === 'take-screenshot');
    const shortcutSpan = document.getElementById('currentShortcut');
    
    if (takeScreenshotCommand && takeScreenshotCommand.shortcut) {
      shortcutSpan.textContent = formatShortcutForDisplay(takeScreenshotCommand.shortcut.split('+'));
    } else {
      shortcutSpan.textContent = '未设置';
    }
  });
}

// 格式化显示快捷键
function formatShortcutForDisplay(keys) {
  return keys.map(key => {
    // 检查是否是需要映射的键
    if (keyMap[key]) {
      return keyMap[key][isMac ? 'mac' : 'win'];
    } 
    // F1-F12 和 A-Z 直接返回
    else if (key.match(/^F\d+$/) || key.match(/^[A-Z0-9]$/)) {
      return key;
    } 
    // 其他键直接返回
    else {
      return key;
    }
  }).join(' + ');
}

// 设置保存位置控件
function setupSaveLocationControl() {
  const saveLocationInput = document.getElementById('saveLocation');
  const autoSaveCheckbox = document.getElementById('autoSave');
  
  // 添加输入事件监听器
  saveLocationInput.addEventListener('input', () => {
    saveSettings({ saveLocation: saveLocationInput.value });
  });
  
  // 修正路径格式（替换不合法字符和反斜杠）
  saveLocationInput.addEventListener('blur', () => {
    let location = saveLocationInput.value.trim();
    
    // 替换不合法的文件路径字符
    location = location.replace(/[\\/:*?"<>|]/g, '_');
    
    // 确保Mac和Windows路径兼容
    location = location.replace(/\\/g, '/');
    
    // 移除开头和结尾的斜杠
    location = location.replace(/^\/+|\/+$/g, '');
    
    // 更新输入框和设置
    saveLocationInput.value = location;
    saveSettings({ saveLocation: location });
  });
  
  // 设置自动保存复选框
  autoSaveCheckbox.addEventListener('change', () => {
    saveSettings({ autoSave: autoSaveCheckbox.checked });
  });
}

// 加载设置
function loadSettings() {
  chrome.storage.sync.get(defaultSettings, (settings) => {
    // 设置文件类型选择
    const fileTypeSelect = document.getElementById('fileType');
    fileTypeSelect.value = settings.fileType;
    
    // 设置保存位置
    const saveLocationInput = document.getElementById('saveLocation');
    saveLocationInput.value = settings.saveLocation || '';
    
    // 设置自动保存选项
    const autoSaveCheckbox = document.getElementById('autoSave');
    autoSaveCheckbox.checked = settings.autoSave || false;
  });
}

// 保存设置到存储
function saveSettings(newSettings) {
  console.log('正在保存新设置:', newSettings); // 调试日志
  
  chrome.storage.sync.get(defaultSettings, (currentSettings) => {
    console.log('获取到的当前设置:', currentSettings); // 调试日志
    
    // 合并当前设置和新设置
    const updatedSettings = { ...currentSettings, ...newSettings };
    console.log('合并后的设置:', updatedSettings); // 调试日志
    
    // 使用chrome.storage.sync持久化保存设置
    chrome.storage.sync.set(updatedSettings, () => {
      console.log('设置已保存:', updatedSettings);
      
      // 立即读取设置以验证保存是否成功
      chrome.storage.sync.get(null, (savedSettings) => {
        console.log('验证保存的设置:', savedSettings); // 调试日志
      });
    });
  });
} 

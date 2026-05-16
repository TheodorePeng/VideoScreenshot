// 设置选项
const fileTypeOptions = [
  { value: 'png', label: '.png' },
  { value: 'jpg', label: '.jpg' },
  { value: 'webp', label: '.webp' },
  { value: 'clipboard', label: '复制到剪贴板' }
];

// 默认设置
const defaultSettings = {
  fileType: 'clipboard',
  autoSave: true
};

// 初始化设置页面
document.addEventListener('DOMContentLoaded', () => {
  // 确保字符编码正确
  document.querySelector('html').setAttribute('lang', 'zh-CN');
  
  // 创建并加载设置控件
  createFileTypeControl();
  
  // 从存储中加载设置
  loadSettings();
});

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

// 加载设置
function loadSettings() {
  chrome.storage.sync.get(defaultSettings, (settings) => {
    // 设置文件类型选择
    const fileTypeSelect = document.getElementById('fileType');
    fileTypeSelect.value = settings.fileType;
  });
}

// 保存设置到存储
function saveSettings(newSettings) {
  chrome.storage.sync.get(defaultSettings, (currentSettings) => {
    // 合并当前设置和新设置
    const updatedSettings = { ...currentSettings, ...newSettings };
    
    // 使用chrome.storage.sync持久化保存设置
    chrome.storage.sync.set(updatedSettings, () => {
      console.log('设置已保存:', updatedSettings);
    });
  });
}

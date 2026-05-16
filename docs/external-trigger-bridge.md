# VideoScreenshot External Trigger Bridge

这个扩展支持从当前网页 dispatch `CustomEvent` 来触发「截取视频截图」。设计目标是配合 macOS Keyboard Maestro：通过 AppleScript 在当前 Chromium 浏览器的 active tab 执行 JavaScript，然后由扩展 content script 接收事件并截图。

这个入口不依赖扩展 id，不依赖 `chrome://extensions/shortcuts`，也不会打开新标签页或修改当前网页 URL。

## 触发协议

- 命令事件名：`VIDEO_SCREENSHOT_EXTERNAL_COMMAND`
- 结果事件名：`VIDEO_SCREENSHOT_EXTERNAL_COMMAND_RESULT`
- action：`take-screenshot`
- payload：`{}` 或省略

成功结果示例：

```json
{
  "ok": true,
  "action": "take-screenshot",
  "requestId": "test-123",
  "result": {
    "success": true,
    "clipboard": true
  }
}
```

失败结果示例：

```json
{
  "ok": false,
  "action": "take-screenshot",
  "requestId": "test-123",
  "error": {
    "code": "SCREENSHOT_FAILED",
    "message": "未检测到可截图视频"
  }
}
```

## DevTools Console 测试代码

在有视频的普通网页中打开 DevTools Console，运行：

```javascript
window.addEventListener("VIDEO_SCREENSHOT_EXTERNAL_COMMAND_RESULT", (event) => {
  console.log("Video screenshot command result:", event.detail);
});

window.dispatchEvent(new CustomEvent("VIDEO_SCREENSHOT_EXTERNAL_COMMAND", {
  detail: {
    action: "take-screenshot",
    payload: {},
    requestId: "test-" + Date.now()
  }
}));
```

默认情况下截图会复制到剪贴板。若设置中改成 PNG / JPG / WebP，则按当前设置下载或保存。

## Keyboard Maestro AppleScript

运行前请在当前 Chromium 浏览器中开启 **Allow JavaScript from Apple Events**。

```applescript
set commandEventName to "VIDEO_SCREENSHOT_EXTERNAL_COMMAND"
set resultEventName to "VIDEO_SCREENSHOT_EXTERNAL_COMMAND_RESULT"
set actionName to "take-screenshot"
set requestIdPrefix to "km-"

tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
end tell

set jsCode to "(() => { const commandEventName = '" & commandEventName & "'; const resultEventName = '" & resultEventName & "'; const actionName = '" & actionName & "'; const requestId = '" & requestIdPrefix & "' + Date.now(); window.addEventListener(resultEventName, (event) => { console.log('Video screenshot command result:', event.detail); }, { once: true }); window.dispatchEvent(new CustomEvent(commandEventName, { detail: { action: actionName, payload: {}, requestId } })); })();"

try
  using terms from application "Google Chrome"
    tell application frontApp
      if not (exists front window) then return
      tell active tab of front window
        execute javascript jsCode
      end tell
    end tell
  end using terms from
on error errMsg number errNum
  display notification errMsg with title "Video Screenshot Trigger Failed"
end try
```

## 失败排查

- 重新加载扩展后，需要刷新当前网页，让 content script 重新注入。
- `chrome://`、`edge://`、Chrome Web Store、浏览器内置页面等受限页面无法注入 content script。
- 如果没有收到结果事件，通常是当前页面没有注入 content script，或者页面还未刷新。
- 如果返回 `INVALID_ACTION`，确认 action 精确为 `take-screenshot`。
- 如果返回 `INVALID_PAYLOAD`，使用 `{}` 或省略 `payload`。
- 如果返回 `SCREENSHOT_FAILED` 且提示未检测到视频，请先播放视频，或等待扩展右上角相机按钮出现。
- 部分 DRM 视频会阻止 canvas 读取画面，扩展会返回受保护视频相关错误。
- 若 Keyboard Maestro 报错，确认最前方应用是 Chromium 风格浏览器，并已开启 **Allow JavaScript from Apple Events**。

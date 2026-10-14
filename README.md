# TT Android 模板兼容扩展

适用目标：TauriTavern v2.3.0 Android。它用于处理第三方扩展的 HTML 模板响应中混入 Tauri IPC 初始化脚本，导致 Handlebars 把 `@typedef {{callback: ...}}` 当成模板语法并报错的情况。

## 做了什么

- 在其他第三方扩展之前安装一个 `fetch` 包装函数。
- 只检查当前站点的 `/scripts/extensions/third-party/*.html` 响应。
- 只移除同时包含 `@typedef {{callback: string, error: string, data: *}}` 和 `__TAURI_INTERNALS__` 的 `<script>` 块；其他 HTML 原样保留。
- 在 TT Android 中把数组原型上可枚举的键临时设为不可枚举，避免提示词模板用 `for…in` 遍历装饰器数组时把这些键误当成装饰器。方法本身仍可调用。
- 关闭或删除本扩展时恢复原先的 `fetch` 函数（若没有其他扩展在之后替换它）。
- 关闭或删除本扩展时恢复它改过的数组原型属性（若没有其他扩展在之后替换它们）。
- 在普通浏览器和非 Android 环境中不启用。

这是独立扩展，不修改 TauriTavern、ST-Prompt-Template 或其他扩展的源代码。

## 安装

在 TT Android 中打开扩展管理，选择安装第三方扩展，填写：

```text
https://github.com/yu555-ux/TT-
```

安装时 TT 会从本仓库根目录读取 `manifest.json` 和 `index.js`。

1. 确认本扩展和 `ST-Prompt-Template` 都已启用，完整退出并重新打开 TT。
2. 打开扩展设置页面，检查“提示词模板”设置区域是否出现。它原本显示在扩展设置里，不一定有聊天栏按钮。

安装后如仍报 `Error rendering template`，请复制新的前端日志。只有日志中出现 `[TT Template Compat] Removed injected Tauri IPC script from`，才表示本扩展确实处理到了对应响应。若没有这条记录，需要核对手机返回的实际 HTML 内容或扩展加载顺序。

针对 `this.decorators[e].includes is not a function`，前端日志会记录 `[TT Template Compat] Hidden enumerable Array.prototype keys:` 及实际处理的键。如果列表为空而错误仍出现，请连同 `[TT Template Compat] Remaining inherited enumerable array keys:` 的记录一起反馈。

## 关闭和回退

在扩展管理中禁用或删除“TT Android 模板兼容”，然后重新启动 TT。此扩展不写入聊天记录或设置数据。它依赖 TT v2.3.0 当前的模板读取路径和 Tauri 脚本特征；升级 TT 后应重新验证是否还需要。

## 已验证与未验证

本地测试覆盖：目标脚本移除、普通模板保留、仅第三方 HTML 请求受影响、非 Android 环境不启用、可枚举数组原型键隐藏与恢复、加载顺序早于提示词模板。尚未在你的手机上安装和测试，因此不能保证实际 Tauri 返回内容与测试样本完全一致。

相关源码：

- TauriTavern v2.3.0 `src/scripts/templates.js`
- TauriTavern v2.3.0 `src/scripts/extensions.js`
- Tauri v2.11.5 `crates/tauri/scripts/ipc.js`


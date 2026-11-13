# otools-fanyi（翻译集合）

OTools 独立插件：9 个在线翻译站聚合入口——Tabs 切换、iframe 内嵌可嵌站点、DeepL/Google 走系统浏览器、站点可配置启停、统一输入栏一次输入多站预填复用。

## 构建

```bash
node scripts/build-web.mjs   # web/ → dist/
```

本地预览：`node scripts/serve-dist.mjs 6547`，浏览器打开 `http://127.0.0.1:6547`。

## 手动验证清单（UI 装配后，留待用户验收）

先 `node scripts/build-web.mjs`，再按环境各过一遍：纯浏览器（serve-dist）与 OTools 宿主（面板打开）。

1. **Tabs**：渲染 9 站、按内置清单顺序（baidu→google）；当前站高亮；DeepL/Google Tab 带 ↗ 外链图标；溢出横向可滚动。
2. **9 站逐个点过**：百度/腾讯/有道/搜狗/必应/彩云/CNKI 7 站 iframe 渲染且可交互输入；DeepL/Google 出提示卡片（站点名 + 原因 + 状态 + 可复制预填 URL + 重试按钮）。
3. **keep-alive**：在某站内做一次操作 → 切走再切回，页面状态保留（不重新加载）。
4. **输入栏**：输入文本点「翻译」/ 按 Enter——有预填模板的站（百度/搜狗/必应/DeepL/Google）按预填 URL 重载或跳浏览器；无模板站原样重载；Shift+Enter 换行；**空输入点翻译不崩**（按原 URL 打开）。
5. **复制**：「复制」复制输入栏文本；卡片「复制链接」复制完整预填 URL；iframe 右上角「浏览器打开」可拉起系统浏览器，失败时链接进剪贴板（toast「已复制链接」）。
6. **管理弹层**：逐站开关、「恢复默认」全开；关闭弹层生效；**刷新页面后配置保留**；关闭当前站自动切到剩余首站；全部关闭出引导页（「请在管理中启用至少一个站点」），重新启用后恢复。
7. **绝不静默**：系统浏览器打开失败的场景（可临时断网/拦 window.open 验证）下，DeepL/Google 卡片仍展示完整可复制预填 URL。
8. **spike 三项复验（宿主内）**：百度/必应 iframe 可交互翻译、无验证码死循环；「浏览器打开」拉起系统浏览器，记录命中策略（sdk-shell / sdk-flat / tauri / window）。

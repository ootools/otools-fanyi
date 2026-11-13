# otools-fanyi（翻译集合）

OTools v0.1.0 网页翻译聚合插件：9 个站点入口、Tabs 切换、站点启停管理。**当前只确认百度、搜狗、必应支持统一输入自动预填**；其他站点需要用户复制后粘贴，DeepL/Google 使用浏览器入口。

## 特性与限制

- 百度、腾讯、有道、搜狗、必应、彩云、CNKI 保留 iframe 入口，首次打开才加载，切走后保留页面状态；禁用会销毁该站 iframe。
- 默认 9 站启用；管理弹层可逐站开关、恢复默认。localStorage 可用时保存配置与上次站点，不保存输入或翻译历史。
- 统一输入只处理当前站。点击“翻译”或按 Enter 提交，Shift+Enter 换行；空输入不拼参数。
- 百度/搜狗/必应使用已证实的 URL 预填模板。腾讯/有道/彩云/CNKI 暂无证实模板，点击“翻译”会提示复制后粘贴，不静默重载页面。
- DeepL/Google 不内嵌，也不自动带入输入：用户明确点击 Tab、“翻译”或“重试打开”访问原 URL；启动恢复只显示卡片，不自动打开。卡片保留可复制链接。
- iframe 常驻“浏览器打开”兜底；如果使用已支持站点的预填链接，它会携带输入。跨域 iframe 无法可靠自动判断第三方页面是否成功渲染，用户可主动切换到浏览器。
- 不直连/逆向翻译 API，不做多引擎同屏对比；网站防嵌策略、cookie/验证码、网络环境变化都可能影响使用。

### 已核验范围（2026-11-13）

以下来自 2026-11-13 在 **ZCode 内置浏览器**打开 `http://127.0.0.1:6547` 的页面快照，**不是 OTools 真宿主验收**。

| 范围 | 本次结论 |
| --- | --- |
| 6 站 iframe 界面 | 百度、腾讯、有道、搜狗、必应、彩云实际显示翻译界面；“界面已渲染”不代表每站完成翻译。腾讯 API 关闭 banner 不代表网页关闭。 |
| 3 站预填 | 百度、搜狗、必应确认输入 `Hello world 你好` 并取得实际译文；保留对应 hash/path/query 模板。 |
| CNKI | 两次快照仅为空 iframe，未完成加载；保留 embed 入口与浏览器兜底，网络/站点可用性待复验。 |
| DeepL / Google | 外部顶层网页可加载/可达，但未取得预填成功证据，生产 `prefill: null`。Google 仍在“正在获取翻译…”；不能写成当前网络不可达。 |
| 真宿主 / 安装 | macOS OTools WKWebView iframe、native `openExternal` 和市场安装均未实测，手动待验证。 |

完整逐站证据、**以页面实际源文和译文而非拼 URL 判定**的标准，以及未启用备选见 [docs/PREFILL.md](docs/PREFILL.md)。这不是“9 站全部可用”的承诺。

## 构建、测试与打包

原生 HTML/CSS/JavaScript ES modules，无 npm 依赖、无打包器；使用 **Node.js 22**，无需 `npm install`。在本仓库根运行。

```bash
node --test tests/                         # 全量插件测试
node --test tests/prefill.test.js          # 单独复验预填/回退逻辑
node scripts/build-web.mjs                 # web/ → dist/
node scripts/pack-plugin.mjs               # dist-pack/otools-fanyi-0.1.0.oplg
node scripts/verify-plugin.mjs dist-pack   # 参数为发布目录，而不是 .oplg 文件
```

`pack` 同时生成生产 `plugin.json`、`logo.svg`、`SHA256SUMS` 和 `meta.json`，生产清单去掉 `devUrl` / `quickDev`。模板构建可能提示缺少游戏手势 `vendor/`；本插件不用手势。verify 提示纯前端没有 `.wasm` 也属正常，不需要为此安装 Rust 或额外 npm 包。包结构校验不等于宿主/市场安装验收。

如果当前 shell 由 nvm 管理 Node，先 `source "$HOME/.nvm/nvm.sh" && nvm use 22` 再执行上述命令。

### 本地预览

```bash
node scripts/build-web.mjs
node scripts/serve-dist.mjs 6547
```

浏览器打开 `http://127.0.0.1:6547`；纯浏览器环境的外开 fallback 是 `window.open`，可能受弹窗拦截影响。本地预览不会验证真正 OTools 的 WKWebView 或 native 打开通道。

## 手动复验与宿主验收清单

下面是**待执行的复验清单，不是完成记录**。纯浏览器与 OTools 面板应分别记录日期、版本、网络及实际结果，不沿用另一环境的结论。

1. **Tabs 与逐站渲染**：按百度→腾讯→有道→搜狗→必应→彩云→CNKI→DeepL→Google 顺序逐个检查。7 个 embed 入口分别记录加载、输入框与交互结果；CNKI 尤其要确认是否完成加载。DeepL/Google 检查提示卡片及浏览器入口。
2. **预填三站**：以非敏感样例 `Hello world 你好` 逐站主动点击“翻译”，检查实际源文和实际译文；不能仅凭 URL 或加载提示判定。百度本次 hash 成功不保证所有重定向/宿主策略永远不影响。
3. **无模板六站**：腾讯/有道/彩云/CNKI 的“翻译”仅提示复制，不自动重载；DeepL/Google 的显式 Tab/翻译/重试打开原 URL。确认输入没有附加到这些访问链接，手动复制后粘贴。
4. **输入与切站**：Enter 提交、Shift+Enter 换行、输入法确认不误提交；空文本不崩，有模板站返回原 URL。一次点击只处理当前站，不群发其他服务；在 iframe 做操作后切走/切回检查 keep-alive。
5. **管理与持久化**：逐站开关、关闭当前站转剩余首站、全部关闭出现引导、重新启用、恢复默认；刷新后配置与上次站点恢复。存储被拒绝时页面仍可使用，但不承诺刷新后持久化；若上次为 DeepL/Google，启动不自动外开。
6. **复制与兜底**：“复制”复制统一输入；卡片“复制链接”复制显示的完整链接，无模板时应为原 URL。iframe“浏览器打开”与卡片“重试打开”检查真实浏览器是否出现。
7. **失败与异步状态**：在可控制的桥拒绝/不可用或弹窗拦截环境确认失败提示与可复制链接保留；单纯断网不代表浏览器打开通道失败。连续点击与切站时，迟到响应不能覆盖当前卡片。
8. **真宿主三项重点（未实测）**：macOS WKWebView 内百度/必应实际交互翻译、cookie/验证码是否循环；native 打开系统浏览器，记录 SDK shell/flat、Tauri 或 window 实际通道；逐站复验预填。Node 假桥测试不能替代此项。
9. **安装（未实测）**：由发布/验收流程在 OTools 本地安装或市场安装 `.oplg` 后检查面板启动、站点与配置。不要把 `verify` 通过写成市场安装已通过。

## 隐私

插件不收集遥测、不保存翻译输入或历史。统一输入不会在键入或切站时后台发送；仅在用户点击“翻译”等明确提交操作时，经已启用模板交给**所选目标服务**。主动“浏览器打开”预填链接也可能携带该站输入；无模板站只打开原 URL，由用户复制文本后手动粘贴。打开第三方网页会产生正常网络请求，目标站的 cookie 与文本处理遵循各服务自己的政策。

## 文档

- [逐站核验与复验方法](docs/PREFILL.md)
- [真实实现说明](docs/SPEC.md)
- [v0.1.0 Release notes](docs/RELEASE_NOTES.md)

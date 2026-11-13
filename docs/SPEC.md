# 翻译集合 v0.1.0 实现说明

## 定位与插件清单

OTools 纯静态网页翻译聚合插件，不直连或逆向翻译 API，不实现翻译历史或多引擎同屏对比。

- `uuid` / `packid`：`otools-fanyi`；版本：`0.1.0`。
- 入口：`dist/index.html`；`openMode: "panel"`。
- 开发预览：`http://127.0.0.1:6547`，源码清单启用 `quickDev`。
- 原生 HTML/CSS/JavaScript ES modules，无 npm 依赖、无打包器，无 Rust/WASM/native 库。
- 打包脚本生成生产清单，去除 `devUrl` / `quickDev`，不改源码清单。

## 目录与模块职责

| 路径 | 职责 |
| --- | --- |
| `plugin.json`、`logo.svg` | 插件元数据与图标。 |
| `web/index.html`、`web/style.css` | 页面骨架、OTools 桥声明与深色样式。入口桥声明不是网站预填证据。 |
| `web/js/data/sites.js` | 9 站数据：`{ id, name, url, type, prefill, note }`；顺序固定为百度、腾讯、有道、搜狗、必应、彩云、CNKI、DeepL、Google。 |
| `web/js/core/prefill.js` | `buildSiteUrl(site, text)`：空文本或 `prefill: null` 返回原 URL；支持 hash/query/path 模板；孤立代理项替换为 U+FFFD，按 Unicode 代码点截断至 8000，再 `encodeURIComponent`。 |
| `web/js/core/config-store.js` | `otools-fanyi.config.v1` 存站点启停。缺省全开；损坏 JSON、无效结构或读取失败回退默认；忽略未知 id，仅严格 `false` 关闭；恢复默认删除配置键。 |
| `web/js/core/tab-manager.js` | iframe 懒创建、切站隐藏/复用、禁用销毁、关闭当前站转剩余首站、全关闭引导态；browser 类型不创建 iframe。 |
| `web/js/core/host.js` | `createHostBridge(win)` 提供能力探测、浏览器打开与复制；测试注入假 window，不依赖真实宿主。 |
| `web/js/ui/app.js` | Tabs、输入栏、管理弹层、浏览器卡片、兜底按钮的装配；另外以 `otools-fanyi.lastSite.v1` 记住站点，不保存输入文本。 |
| `tests/` | Node 内置测试；`tests/index.js` 聚合全量插件用例。 |
| `scripts/` | 沿用插件模板的构建、预览、打包与校验脚本；本插件使用 web 模式，不改模板语义。 |
| `docs/PREFILL.md` | 逐站页面证据、未验证备选、复验标准与宿主待验证清单。 |

## 当前行为

- 默认 9 站启用，管理弹层可逐站关闭/恢复默认，配置保存在本机 localStorage；存储不可用时允许当前运行继续，不保证跨刷新持久化。
- 7 站保留 `embed` 入口；DeepL、Google 为 `browser` 入口。入口策略不代表每站已通过渲染、预填或宿主测试。
- 统一输入在切站时保留在本次页面内存；点击“翻译”只处理当前站，不批量向其他引擎提交。Enter 提交，Shift+Enter 换行，输入法组合中的 Enter 不提交。
- **百度、搜狗、必应**启用已证实模板；当前 iframe 经“翻译”重载为预填 URL。空输入返回原 URL。
- **腾讯、有道、彩云、CNKI**无已证实模板：`prefill: null`，统一“翻译”提示复制后粘贴，不静默重载 iframe。
- **DeepL、Google**同样 `prefill: null`：用户明确点击站点 Tab、“翻译”或“重试打开”才打开原 URL；启动恢复仅展示卡片与链接，不自动外开。用户需复制文本后自行粘贴。
- embed 内容区保留“浏览器打开”兜底；browser 卡片始终提供完整可复制访问链接。无模板时链接只有原 URL，不承诺自动带入文本。
- 浏览器卡片异步状态仅允许最新请求更新，离开该站后的迟到结果不覆盖当前界面；此项有 Node 回归测试，不等于已在宿主实测。

## 宿主桥契约与边界

打开链按可用能力逐级尝试：

1. SDK `window.otools.shell.openExternal(url)`，或 flat `window.otools.shellOpenExternal(url)`。
2. Tauri `invoke('otools_shell_open_external', { url })`，查找 window / parent / top 的可用 `invoke`。
3. 纯浏览器 fallback `window.open(url, '_blank')`。

逐级异常会降级；`window.open` 返回空值视为失败。SDK/Tauri 不抛且调用兑现仅代表桥调用成功，不能据此证明真实系统浏览器已拉起。全链失败时 UI 保留复制链接路径。复制优先使用 `navigator.clipboard.writeText`，失败再尝试 `execCommand('copy')`。

macOS OTools WKWebView iframe、native 打开通道及市场安装 **未实测，手动待验证**；Node 假件只验证分支、参数与失败处理。

## 实测现状与限制（2026-11-13）

证据为 2026-11-13 在 ZCode 内置浏览器 `http://127.0.0.1:6547` 的页面快照，**不是 OTools 宿主 spike 通过记录**。

- 6 站 iframe 出现翻译界面：百度、腾讯、有道、搜狗、必应、彩云。
- 3 站实际预填并得到译文：百度、搜狗、必应。
- CNKI 两次快照仍为空 iframe，未完成加载，保留入口与浏览器兜底，不标为已通过。
- DeepL 顶层网页可加载，但旧 hash 留在 URL 时源文仍空；cookie 声明未成功操作，未确认预填。
- Google 顶层网页可达，但持续“正在获取翻译…”，没有实际源文本框/译文证据；不再使用“当前网络不可达”的结论。
- 腾讯 API 关闭提示不代表网页关闭；网站界面仍显示。

站点策略、网络、cookie、验证码与宿主环境可能改变结果。唯一预填启用标准是 **页面实际源文和译文，而不是拼 URL**；完整证据与未启用备选见 [PREFILL.md](PREFILL.md)。

## 隐私

插件不收集遥测，不保存翻译输入或历史，不后台探测用户文本。统一输入只在用户点击“翻译”等明确提交操作时，经已启用模板传给所选目标翻译服务；主动“浏览器打开”预填链接也可能携带该站文本。无模板站不向访问 URL 附加输入，由用户复制后手动粘贴。打开第三方网页本身会产生正常网络请求，其 cookie 与文本处理受目标服务自身政策约束。

## 开发验证

在仓库根使用 Node.js 22，无需 `npm install`。

```bash
node --test tests/
node scripts/build-web.mjs
node scripts/pack-plugin.mjs
node scripts/verify-plugin.mjs dist-pack
```

构建为 `web/` → `dist/`；打包生成 `dist-pack/otools-fanyi-0.1.0.oplg` 及清单、摘要。verify 接收发布目录 `dist-pack`，不是 `.oplg` 文件路径。模板可能输出缺少游戏手势 `vendor/`、纯前端无 `.wasm` 的提示，本插件不依赖两者。

自动测试覆盖站点数据、生产 null 回退、fixture 协议编码、Unicode/超长输入、配置异常、Tab 生命周期、桥降级及 UI 请求状态等逻辑。打包校验只验证包结构、摘要、CRC、生产清单和入口，不验证第三方站点或市场安装；真实浏览器与 OTools 手动清单见 [README](../README.md) 和 [PREFILL.md](PREFILL.md)。

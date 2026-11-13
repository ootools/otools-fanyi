# 站点渲染与预填核验

## 核验范围与证据来源

- 日期：2026-11-13。
- 环境：在 **ZCode 内置浏览器**打开本地插件页 `http://127.0.0.1:6547`，逐站查看页面快照；统一测试输入为 `Hello world 你好`。
- 本文忠实记录该次快照，不将响应头、导航 URL 或 Node 假桥测试当作实际翻译证据。
- **这不是 OTools 真宿主验收**。macOS WKWebView 内的 iframe、native `openExternal`、市场包安装均未实测。
- 已看到翻译网页界面的 iframe 共 **6 站**：百度、腾讯、有道、搜狗、必应、彩云；其中 **3 站**确认预填与译文：百度、搜狗、必应。CNKI 未完成加载；DeepL、Google 只检查了外部顶层网页。

## 判断标准

**判断标准是页面实际源文和译文，而不是拼 URL。**

1. **渲染成功**：快照实际出现站点的翻译界面或输入框；不等于该站已完成翻译。
2. **预填确认**：通过插件统一输入触发模板导航后，页面中实际源文与测试输入一致，并出现实际译文；URL 保留 `{text}` 替换结果、HTTP 状态或“正在翻译”提示均不能单独证明生效。
3. **未确认**：源文为空、仅见输入提示、仍在加载或无法取得源文/译文证据时，生产 `prefill` 一律为 `null`。这不等于站点永久不支持预填。
4. **宿主确认**：必须在真正 OTools 环境独立完成。浏览器快照和 Node 注入假件只能证明各自范围内的行为。

## 逐站结果

`type` 是产品入口策略，不是“已可用”标记。无模板站保留原站 URL，并由用户复制文本后手动粘贴。

| id / 站点 | 入口策略与原 URL | 生产 `prefill` | 2026-11-13 页面快照事实与结论 |
| --- | --- | --- | --- |
| `baidu` 百度翻译 | `embed` · `https://fanyi.baidu.com` | `#auto/zh/{text}` | iframe 渲染成功。统一输入后点击“翻译”，frame 源文为 `Hello world 你好`，译文为 `Hello world, hello`；hash 模板在该浏览器本次核验有效。不能据此绝对断言 302 链路的 `deny` 在所有浏览器、宿主或未来版本均无影响。 |
| `tencent` 腾讯交互翻译 | `embed` · `https://fanyi.qq.com` | `null` | iframe 显示输入文本区域与 2000 字限制；没有已证实的 URL 预填模板。页面上的 API 关闭 banner 只涉及 API，网页界面仍显示，不能写成全站关闭。 |
| `youdao` 有道翻译 | `embed` · `https://fanyi.youdao.com` | `null` | iframe 显示 AI 翻译界面与“请输入想要翻译的文本”；未证实 URL 预填，也未取得本次测试文本的译文证据。 |
| `sogou` 搜狗翻译 | `embed` · `https://fanyi.sogou.com` | `/text?keyword={text}&transfrom=auto&transto=zh-CHS&model=general` | iframe 渲染成功。原有路径/query 模板有效，实际源文为 `Hello world 你好`，译文为“你好世界你好”。 |
| `bing` 必应翻译 | `embed` · `https://cn.bing.com/translator` | `?text={text}` | iframe 渲染成功，`?text=` 预填成功，测试输入得到译文“你好，世界 你好”。 |
| `caiyun` 彩云小译 | `embed` · `https://fanyi.caiyunapp.com` | `null` | iframe 显示文字翻译输入框；未证实 URL 预填，不能把界面出现当作预填成功。 |
| `cnki` CNKI 学术翻译 | `embed` · `https://dict.cnki.net/index` | `null` | 两次快照均仅见空 iframe，未完成加载。保留 embed 入口与“浏览器打开”兜底；网络/站点可用性仍需复验，不能写为已通过，也不据此断言永久不可达。 |
| `deepl` DeepL 翻译 | `browser` · `https://www.deepl.com/translator` | `null` | 外部顶层网页可以加载。旧 `#auto/zh/{text}` 参数留在 URL，但源文仍空；cookie 声明未成功操作，未证明预填生效，也不能猜测其因果关系。产品使用浏览器入口，提示该站限制内嵌，并引导复制文本后粘贴。 |
| `google` Google 翻译 | `browser` · `https://translate.google.com` | `null` | 带 `?sl=auto&tl=zh-CN&text=…&op=translate` 的顶层网页可达，但持续显示“正在获取翻译…”，未取得实际源文本框/译文证据。不能再声称本次网络不可达；提示为“使用系统浏览器，网络可用性依环境而异；当前未确认自动预填”。 |

## 未验证备选，不启用

以下是历史配置或本次尝试过、**尚未验证通过**的备选参数，仅保留线索供后续人工复验，不进入生产 `SITES`。

| 站点 | 未验证通过的备选 | 当前决定 |
| --- | --- | --- |
| DeepL | `#auto/zh/{text}` | URL 保留参数不代表源文已填入；`prefill: null`，复制文本后粘贴。 |
| Google | `?sl=auto&tl=zh-CN&text={text}&op=translate` | 顶层页面可达但没有实际源文/译文证据；`prefill: null`。 |

不追加猜测参数，不以通用 URL 拼接单测替代站点核验。`tests/prefill.test.js` 用 `example.test` 的 hash/query **fixture**保留两种协议的编码与参数测试，并明确断言生产 DeepL/Google 不把输入附加到访问链接。fixture 不会访问网站；上述备选也不会替用户自动打开或发送任何文本。

## 复验方法

1. 使用 Node.js 22，在插件仓库执行 `node scripts/build-web.mjs`，再运行 `node scripts/serve-dist.mjs 6547`；打开 `http://127.0.0.1:6547`。记录日期、浏览器/宿主版本、网络环境与是否登录，避免混淆不同环境。
2. 使用无敏感信息的固定样例 `Hello world 你好`。逐站切换，分别记录界面是否真正渲染、是否需要登录/验证码、加载是否完成；对已启用模板的站，输入样例后主动点击“翻译”。
3. 查看 iframe 内实际源文和译文，保存页面快照；顶层浏览器同样查看实际输入框和结果。只记录 URL、空 iframe 或持续加载提示的站仍为“未确认”。百度必须在目标浏览器/宿主复验，不能沿用本次成功去保证所有重定向策略均无影响。
4. 对 `prefill: null` 的站，先验证原网页和用户主动复制/粘贴流程。若需尝试备选，用测试 fixture 构造链接后由验证者明确手动打开，不在生产清单启用无证据模板，不用用户的真实文本后台探测。
5. 只有取得实际源文和译文证据后才更新 `sites.js`、本表与回归测试；保留 browser/embed 入口与兜底的区别。站点改版、网络变化或防嵌策略变化时重新验证。

下面的命令只离线生成当前生产清单中已启用模板的样例 URL，**不发网络请求，也不证明预填成功**。

```bash
node --input-type=module -e '
import { SITES } from "./web/js/data/sites.js";
import { buildSiteUrl } from "./web/js/core/prefill.js";
for (const site of SITES.filter((site) => site.prefill !== null)) {
  console.log(site.id, buildSiteUrl(site, "Hello world 你好"));
}
'
```

## OTools 宿主与安装：手动待验证

- [ ] macOS OTools WKWebView 内逐个加载 7 个 embed 入口；实际检查输入、翻译、cookie/验证码及切站状态保留。CNKI 单独确认是否能完成加载。
- [ ] 在宿主 iframe 内复验百度、搜狗、必应的源文与译文；不能直接沿用 ZCode 浏览器的成功结论。
- [ ] native 系统浏览器打开链：SDK `shell.openExternal` / `shellOpenExternal`、Tauri `otools_shell_open_external`、最后 `window.open`；记录真实命中通道和系统浏览器是否实际拉起。
- [ ] 浏览器打开失败时卡片仍展示完整可复制链接；无模板站复制文本后手动粘贴可用。失败场景要用实际不可用/拒绝的桥或弹窗拦截复验，单纯断网不等于打开通道失败。
- [ ] OTools 市场/本地安装 `.oplg` 后面板可打开，站点配置可保存与恢复；**市场安装尚未实测**。

`node --test` 的假桥断言、打包校验识别入口中的 OTools 桥声明，都不是以上宿主实证，更不是网站预填证据。

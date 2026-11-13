/**
 * 内置站点清单（数据驱动，顺序即默认 Tab 顺序）。
 * ------------------------------------------------------------------
 * prefill 仅启用有页面实际源文与译文证据的模板；`{text}` 由 buildSiteUrl
 * encodeURIComponent 后替换。2026-11-13 的核验来自 ZCode 内置浏览器
 * http://127.0.0.1:6547 的页面快照，不代表 OTools 真宿主已通过。
 * 渲染、预填与宿主能力分别记录；逐站证据、未验证备选与复验方法见
 * docs/PREFILL.md。站点或网络策略可能变化，始终保留浏览器兜底。
 *
 * @type {Array<{id: string, name: string, url: string, type: 'embed'|'browser', prefill: string|null, note: string}>}
 */
export const SITES = [
  {
    id: 'baidu',
    name: '百度翻译',
    url: 'https://fanyi.baidu.com',
    type: 'embed',
    prefill: '#auto/zh/{text}',
    note: '2026-11-13 内置浏览器 iframe 渲染与 hash 预填成功；宿主及后续站点策略仍需复验',
  },
  {
    id: 'tencent',
    name: '腾讯交互翻译',
    url: 'https://fanyi.qq.com',
    type: 'embed',
    prefill: null,
    note: '内置浏览器 iframe 显示网页输入区；API 关闭提示不代表网页关闭，未确认自动预填，可复制后粘贴',
  },
  {
    id: 'youdao',
    name: '有道翻译',
    url: 'https://fanyi.youdao.com',
    type: 'embed',
    prefill: null,
    note: '内置浏览器 iframe 显示 AI 翻译输入界面；未确认自动预填，可复制后粘贴',
  },
  {
    id: 'sogou',
    name: '搜狗翻译',
    url: 'https://fanyi.sogou.com',
    type: 'embed',
    prefill: '/text?keyword={text}&transfrom=auto&transto=zh-CHS&model=general',
    note: '2026-11-13 内置浏览器 iframe 渲染与 keyword 预填成功；宿主仍需复验',
  },
  {
    id: 'bing',
    name: '必应翻译',
    url: 'https://cn.bing.com/translator',
    type: 'embed',
    prefill: '?text={text}',
    note: '2026-11-13 内置浏览器 iframe 渲染与 text 预填成功；宿主仍需复验',
  },
  {
    id: 'caiyun',
    name: '彩云小译',
    url: 'https://fanyi.caiyunapp.com',
    type: 'embed',
    prefill: null,
    note: '内置浏览器 iframe 显示文字翻译输入框；未确认自动预填，可复制后粘贴',
  },
  {
    id: 'cnki',
    name: 'CNKI 学术翻译',
    url: 'https://dict.cnki.net/index',
    type: 'embed',
    prefill: null,
    note: '本次 iframe 未完成加载；网络或站点可用性需复验，可尝试浏览器打开，未确认自动预填',
  },
  {
    id: 'deepl',
    name: 'DeepL 翻译',
    url: 'https://www.deepl.com/translator',
    type: 'browser',
    prefill: null,
    note: '该站限制内嵌，使用系统浏览器；当前未确认自动预填，请复制文本后粘贴',
  },
  {
    id: 'google',
    name: 'Google 翻译',
    url: 'https://translate.google.com',
    type: 'browser',
    prefill: null,
    note: '使用系统浏览器，网络可用性依环境而异；当前未确认自动预填',
  },
];

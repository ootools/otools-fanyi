/**
 * 内置站点清单（数据驱动，顺序即默认 Tab 顺序）。
 * ------------------------------------------------------------------
 * URL / prefill 初值逐字段照抄 spec「内置站点清单」表。prefill 模板形态
 * （hash / query / path）逐站不同，`{text}` 为 encodeURIComponent 后的
 * 文本占位符（Task 4 的 buildSiteUrl 负责替换）；防嵌头 / 代理结论来自
 * Task 2 spike，未实测的站 prefill 在 note 标注，Task 9 实测后定稿
 * （结论记录 docs/PREFILL.md）。
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
    note: '最终页无防嵌头，302 链路 deny 不影响；预填模板待实测',
  },
  {
    id: 'tencent',
    name: '腾讯交互翻译',
    url: 'https://fanyi.qq.com',
    type: 'embed',
    prefill: null,
    note: '预填待实测',
  },
  {
    id: 'youdao',
    name: '有道翻译',
    url: 'https://fanyi.youdao.com',
    type: 'embed',
    prefill: null,
    note: '预填待实测',
  },
  {
    id: 'sogou',
    name: '搜狗翻译',
    url: 'https://fanyi.sogou.com',
    type: 'embed',
    prefill: '/text?keyword={text}&transfrom=auto&transto=zh-CHS&model=general',
    note: '预填模板待实测',
  },
  {
    id: 'bing',
    name: '必应翻译',
    url: 'https://cn.bing.com/translator',
    type: 'embed',
    prefill: '?text={text}',
    note: '预填模板待实测',
  },
  {
    id: 'caiyun',
    name: '彩云小译',
    url: 'https://fanyi.caiyunapp.com',
    type: 'embed',
    prefill: null,
    note: '预填待实测',
  },
  {
    id: 'cnki',
    name: 'CNKI 学术翻译',
    url: 'https://dict.cnki.net/index',
    type: 'embed',
    prefill: null,
    note: '预填待实测',
  },
  {
    id: 'deepl',
    name: 'DeepL 翻译',
    url: 'https://www.deepl.com/translator',
    type: 'browser',
    prefill: '#auto/zh/{text}',
    note: "CSP frame-ancestors 'self' 拒绝内嵌",
  },
  {
    id: 'google',
    name: 'Google 翻译',
    url: 'https://translate.google.com',
    type: 'browser',
    prefill: '?sl=auto&tl=zh-CN&text={text}&op=translate',
    note: '大陆网络不可达需代理',
  },
];

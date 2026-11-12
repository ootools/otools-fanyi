/**
 * 预填 URL 生成器（纯函数，无 DOM，可被 node --test 直接 import）。
 * ------------------------------------------------------------------
 * 按站点清单（sites.js）的 prefill 模板把输入文本拼进站点 URL：
 * - 模板以 `#` / `?` 开头（hash / query 形态）→ 直接追加到 site.url 尾部；
 * - 模板以 `/` 开头（路径式形态）→ 去掉 site.url 尾部斜杠后拼接。
 * 文本先清理孤立代理项（损坏输入兜底，替换为 U+FFFD），再按代码点截断到
 * MAX_PREFILL_CHARS 后 encodeURIComponent（UTF-16 code unit 截断可能把增补
 * 平面字符劈成孤立代理项，令 encodeURIComponent 抛 URIError），`{text}` 为
 * 占位符。空文本或站点无模板（prefill 为 null）时返回站点原 URL（不拼参数）。
 */

/** 预填文本上限（超长截断，按代码点计）。 */
export const MAX_PREFILL_CHARS = 8000;

/**
 * 清理孤立代理项：成对代理（完整增补平面字符）保留，孤立的高位 / 低位
 * 代理替换为 U+FFFD，保证后续 encodeURIComponent 不抛 URIError。
 *
 * @param {string} text 任意字符串（可能来自剪贴板等，含损坏编码）
 * @returns {string} 无孤立代理项的字符串
 */
function stripLoneSurrogates(text) {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '\uFFFD',
  );
}

/**
 * 由站点对象与待翻译文本生成预填 URL。
 *
 * @param {{ url: string, prefill: string|null }} site SITES 元素
 * @param {string|null} text 待翻译文本
 * @returns {string} 预填 URL；空文本 / 无模板时为 site.url 原样
 */
export function buildSiteUrl(site, text) {
  if (!text || !site.prefill) {
    return site.url;
  }
  const cleaned = stripLoneSurrogates(text);
  const encoded = encodeURIComponent([...cleaned].slice(0, MAX_PREFILL_CHARS).join(''));
  const base = site.prefill.startsWith('/') ? site.url.replace(/\/+$/, '') : site.url;
  return base + site.prefill.replace('{text}', encoded);
}

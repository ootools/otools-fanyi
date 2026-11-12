/**
 * 预填 URL 生成器（纯函数，无 DOM，可被 node --test 直接 import）。
 * ------------------------------------------------------------------
 * 按站点清单（sites.js）的 prefill 模板把输入文本拼进站点 URL：
 * - 模板以 `#` / `?` 开头（hash / query 形态）→ 直接追加到 site.url 尾部；
 * - 模板以 `/` 开头（路径式形态）→ 去掉 site.url 尾部斜杠后拼接。
 * 文本先截断到 MAX_PREFILL_CHARS 再 encodeURIComponent，`{text}` 为占位符。
 * 空文本或站点无模板（prefill 为 null）时返回站点原 URL（不拼参数）。
 */

/** 预填文本上限（超长截断）。 */
export const MAX_PREFILL_CHARS = 8000;

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
  const encoded = encodeURIComponent(text.slice(0, MAX_PREFILL_CHARS));
  const base = site.prefill.startsWith('/') ? site.url.replace(/\/+$/, '') : site.url;
  return base + site.prefill.replace('{text}', encoded);
}

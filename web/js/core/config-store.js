/**
 * 站点开关配置存储（纯逻辑、无 DOM，storage 注入式）。
 * ------------------------------------------------------------------
 * localStorage key 固定 `otools-fanyi.config.v1`，存储形态
 * `{ enabled: { [siteId]: boolean } }`。`storage` 为
 * `{ getItem, setItem, removeItem }` 注入式适配（宿主 localStorage
 * 或测试内存版），便于 node --test 直接 import。
 *
 * 合并规则（spec 修订版）：值严格 `=== false` 视为关闭，
 * 其余（含缺失、字符串 "false"、0、null 等非布尔值）一律视为开启——
 * 只有明确写下的 `false` 才会关闭站点，损坏数据宁可多开不误关。
 */

/** @type {string} localStorage / storage 中的配置 key */
export const CONFIG_KEY = 'otools-fanyi.config.v1';

/**
 * 默认配置：全部已知站点开启。
 * @param {Array<{id: string}>} sites
 * @returns {{ enabled: { [id: string]: boolean } }}
 */
function defaultConfig(sites) {
  const enabled = {};
  for (const site of sites) enabled[site.id] = true;
  return { enabled };
}

/**
 * 读取配置：损坏 JSON / 缺 `enabled` 对象 → 默认全开；
 * 未知站点 id 忽略；仅严格 `=== false` 视为关闭。
 * @param {{ getItem: (k: string) => string|null }} storage
 * @param {Array<{id: string}>} sites
 * @returns {{ enabled: { [id: string]: boolean } }}
 */
export function loadConfig(storage, sites) {
  const defaults = defaultConfig(sites);
  let raw = null;
  try {
    raw = storage.getItem(CONFIG_KEY);
  } catch {
    return defaults;
  }
  if (!raw) return defaults;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults; // 损坏 JSON → 回退默认，不抛错
  }
  const stored = parsed && typeof parsed === 'object' ? parsed.enabled : null;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return defaults;

  const enabled = {};
  for (const site of sites) {
    // 严格 === false 才关闭；缺失 / 非布尔（含字符串 "false"）一律开启。
    enabled[site.id] = stored[site.id] === false ? false : true;
  }
  return { enabled };
}

/**
 * 保存配置（JSON.stringify 形态 `{ enabled }`）。
 * @param {{ setItem: (k: string, v: string) => void }} storage
 * @param {{ [id: string]: boolean }} enabled
 */
export function saveConfig(storage, enabled) {
  storage.setItem(CONFIG_KEY, JSON.stringify({ enabled }));
}

/**
 * 重置配置：删除存储 key 即回到默认全开。
 * @param {{ removeItem: (k: string) => void }} storage
 * @param {Array<{id: string}>} sites 未直接使用，保持签名与 loadConfig 对称
 */
export function resetConfig(storage, sites) {
  void sites;
  storage.removeItem(CONFIG_KEY);
}

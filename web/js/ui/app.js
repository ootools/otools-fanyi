/**
 * UI 装配入口（Task 8）：Tabs 栏 / 输入栏 / 管理弹层 / 特殊站卡片 / 引导页。
 * ------------------------------------------------------------------
 * 只做装配，无业务逻辑：全部消费已实现的逻辑层模块——
 *   sites.js         站点清单（SITES 顺序即 Tab 顺序）
 *   prefill.js       buildSiteUrl（空文本 / 无模板 → 原样 URL）
 *   config-store.js  localStorage 启停配置（损坏回退默认全开）
 *   tab-manager.js   Tab 状态机（懒创建 / keep-alive / 禁用销毁 / 全禁引导）
 *   host.js          宿主桥（三级 openExternal 链 + 剪贴板）
 *
 * 约定：
 * - TabManager 以 el.hidden 属性藏 iframe 包装层，本层样式不加 !important
 *   覆盖 display，style.css 的 [hidden] 全局规则保证属性语义生效；
 * - openExternal 全链失败绝不静默：卡片展示可复制完整预填 URL；iframe 区
 *   「浏览器打开」按钮失败时降级 copyText（toast「已复制链接」）。
 */

import { SITES } from '../data/sites.js';
import { buildSiteUrl } from '../core/prefill.js';
import { loadConfig, saveConfig, resetConfig } from '../core/config-store.js';
import { TabManager } from '../core/tab-manager.js';
import { createHostBridge } from '../core/host.js';

const storage = window.localStorage;
const host = createHostBridge(window);

/** 记住上次所在站点（独立 key，与 config-store 解耦；读写失败静默忽略）。 */
const LAST_SITE_KEY = 'otools-fanyi.lastSite.v1';

const $ = (id) => document.getElementById(id);
const els = {
  tabs: $('tabs'),
  btnManage: $('btn-manage'),
  input: $('input-text'),
  btnTranslate: $('btn-translate'),
  btnCopy: $('btn-copy'),
  content: $('content'),
  card: $('browser-card'),
  cardTitle: $('card-title'),
  cardNote: $('card-note'),
  cardStatus: $('card-status'),
  cardUrl: $('card-url'),
  cardCopy: $('card-copy'),
  cardRetry: $('card-retry'),
  guide: $('guide'),
  btnGuideManage: $('btn-guide-manage'),
  overlay: $('modal-overlay'),
  modalList: $('modal-list'),
  btnModalClose: $('btn-modal-close'),
  btnModalDone: $('btn-modal-done'),
  btnReset: $('btn-reset'),
  toast: $('toast'),
};

const siteById = new Map(SITES.map((s) => [s.id, s]));
/** site.id → { wrap, iframe, destroy }（本层索引；TabManager 另管生命周期）。 */
const frames = new Map();

let tabManager = null;
let enabled = null; // 当前启停表（loadConfig / 管理弹层写回）
let lastBrowserUrl = ''; // 特殊站卡片上展示 / 复制的预填 URL

/* ---------------------------------------------------------------- toast */

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2000);
}

/* ------------------------------------------------------------ 输入栏 */

function inputText() {
  return els.input.value;
}

/** 1–2 行自适应：随内容长高，封顶 2 行（CSS max-height）后内部滚动。 */
function fitInput() {
  els.input.style.height = 'auto';
  els.input.style.height = Math.min(els.input.scrollHeight, 60) + 'px';
}

/* ------------------------------------------------------- Tab 渲染 / 同步 */

function rememberSite(id) {
  try { storage.setItem(LAST_SITE_KEY, id); } catch (e) { /* 存不进就忽略 */ }
}

function readLastSite() {
  try { return storage.getItem(LAST_SITE_KEY); } catch (e) { return null; }
}

/** 渲染启用站 Tabs（SITES 顺序，browser 站加外链图标），高亮当前站。 */
function renderTabs() {
  const cur = tabManager.currentId();
  els.tabs.textContent = '';
  for (const site of SITES) {
    if (enabled[site.id] === false) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab' + (site.id === cur ? ' active' : '');
    btn.dataset.id = site.id;
    btn.title = site.type === 'browser' ? site.name + '（系统浏览器打开）' : site.name;
    const label = document.createElement('span');
    label.textContent = site.name;
    btn.appendChild(label);
    if (site.type === 'browser') {
      const icon = document.createElement('span');
      icon.className = 'tab-ext-icon';
      icon.textContent = '↗';
      btn.appendChild(icon);
    }
    btn.addEventListener('click', () => {
      tabManager.select(site.id);
      const cur2 = tabManager.currentId();
      if (cur2) rememberSite(cur2);
      sync();
    });
    els.tabs.appendChild(btn);
  }
  if (cur) {
    const active = els.tabs.querySelector('.tab.active');
    if (active && active.scrollIntoView) {
      try { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* 老实现无参数形态 */ }
    }
  }
}

/** 每次 TabManager 操作后调用：读 currentId() 刷新 Tab 高亮与内容区视图。 */
function sync() {
  renderTabs();
  const cur = tabManager.currentId();
  if (cur === null) {
    // 全禁用：隐藏卡片（帧已由 TabManager 全部隐藏），展示引导页。
    els.card.hidden = true;
    els.guide.hidden = false;
    return;
  }
  els.guide.hidden = true;
  const site = siteById.get(cur);
  if (site.type === 'embed') {
    // 当前帧已由 TabManager 显示；特殊站卡片只在 browser 站展示。
    els.card.hidden = true;
  }
  // browser 站：卡片内容与状态由 onBrowserSite 回调负责，这里不动。
}

/* ------------------------------------------------- iframe 帧工厂（hook） */

function createFrame(site) {
  const wrap = document.createElement('div');
  wrap.className = 'frame-wrap';
  wrap.dataset.site = site.id;

  const iframe = document.createElement('iframe');
  iframe.className = 'site-frame';
  iframe.title = site.name + '（内嵌）';
  // 初始加载站点原 URL（此刻输入栏尚无文本）；不设 sandbox 属性——任何
  // 限制性 allow-list 都会破坏第三方站点功能，嵌入可行性由站点响应头决定。
  iframe.src = site.url;

  // 右上角悬浮兜底按钮：系统浏览器打开（含输入栏预填）；openExternal 全链
  // 失败时降级 copyText 把 URL 放进剪贴板（toast「已复制链接」），绝不静默。
  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'frame-open-btn';
  openBtn.title = '在系统浏览器打开' + site.name + '（含输入栏预填）';
  openBtn.textContent = '⧉ 浏览器打开';
  openBtn.addEventListener('click', async () => {
    const url = buildSiteUrl(site, inputText());
    try {
      await host.openExternal(url);
      toast('已在系统浏览器打开');
    } catch (e) {
      const copied = await host.copyText(url);
      toast(copied ? '已复制链接' : '打开失败：' + url);
    }
  });

  wrap.append(iframe, openBtn);
  els.content.appendChild(wrap);
  const frame = {
    wrap,
    iframe,
    destroy() {
      wrap.remove();
      frames.delete(site.id);
    },
  };
  frames.set(site.id, frame);
  return { el: wrap, destroy: frame.destroy };
}

/* --------------------------------------------- 特殊站（browser）卡片流程 */

const STATUS_TEXT = {
  opening: '正在打开系统浏览器…',
  opened: '已在系统浏览器打开 ✓',
  failed: '打开失败：系统浏览器不可用。可复制下方链接，手动粘贴访问。',
};

function setCardStatus(status) {
  els.cardStatus.className = 'card-status ' + status;
  els.cardStatus.textContent = STATUS_TEXT[status] || '';
}

/** 展示特殊站卡片（站点名 / 原因 note / 状态 / 可复制完整预填 URL / 重试）。 */
function showCard(site, url, status) {
  els.cardTitle.textContent = site.name;
  els.cardNote.textContent = '原因：' + site.note;
  els.cardUrl.textContent = url;
  lastBrowserUrl = url;
  setCardStatus(status);
  els.guide.hidden = true;
  els.card.hidden = false;
}

/**
 * onBrowserSite 回调（Tab 点击 / 自动切站到 browser 站时触发）：
 * openExternal(预填 URL) → 成功「已打开」/ 失败「打开失败」卡片，
 * 两种状态都展示可复制的完整预填 URL，绝不静默。
 */
function openBrowserSite(site) {
  const url = buildSiteUrl(site, inputText());
  showCard(site, url, 'opening');
  host.openExternal(url)
    .then(() => setCardStatus('opened'))
    .catch(() => setCardStatus('failed'));
}

/* ------------------------------------------------------------ 翻译 / 复制 */

/** 「翻译」点击 / textarea Enter：当前站按预填重载或跳系统浏览器。 */
function translate() {
  const cur = tabManager.currentId();
  if (!cur) {
    toast('请先在管理中启用站点');
    return;
  }
  const site = siteById.get(cur);
  if (site.type === 'browser') {
    // 空文本 / 无模板时 buildSiteUrl 返回原 URL，openExternal 语义不变。
    openBrowserSite(site);
    return;
  }
  const frame = frames.get(site.id);
  if (!frame) return; // 防御：帧不存在（不应发生）
  // 空文本或无预填模板 → buildSiteUrl 给原 URL，等价原样重载；
  // 有文本有模板 → 仅重载当前站 iframe，其余站保持 keep-alive 不动。
  frame.iframe.src = buildSiteUrl(site, inputText());
}

els.btnTranslate.addEventListener('click', translate);

els.input.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  // Shift+Enter 换行；输入法组词中的 Enter（isComposing / keyCode 229）不触发。
  if (e.shiftKey || e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  translate();
});
els.input.addEventListener('input', fitInput);

els.btnCopy.addEventListener('click', async () => {
  const ok = await host.copyText(inputText());
  toast(ok ? '已复制' : '复制失败');
});

/* ------------------------------------------------------------ 管理弹层 */

/** 9 站全序列出（browser 站标注「浏览器打开」），勾选态来自当前 enabled。 */
function openModal() {
  els.modalList.textContent = '';
  for (const site of SITES) {
    const row = document.createElement('label');
    row.className = 'site-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = site.id;
    cb.checked = enabled[site.id] !== false;
    const name = document.createElement('span');
    name.textContent = site.name;
    row.append(cb, name);
    if (site.type === 'browser') {
      const badge = document.createElement('span');
      badge.className = 'site-badge';
      badge.textContent = '浏览器打开';
      row.appendChild(badge);
    }
    els.modalList.appendChild(row);
  }
  els.overlay.hidden = false;
}

function readModalEnabled() {
  const map = {};
  for (const cb of els.modalList.querySelectorAll('input[type="checkbox"]')) {
    map[cb.dataset.id] = cb.checked;
  }
  return map;
}

/** 关闭弹层 = saveConfig（storage 异常仅 toast，不中断）+ TabManager.setEnabled。 */
function closeModal() {
  if (els.overlay.hidden) return;
  els.overlay.hidden = true;
  enabled = readModalEnabled();
  try {
    saveConfig(storage, enabled);
  } catch (e) {
    toast('配置保存失败：' + (e && e.message ? e.message : e));
  }
  applyEnabled();
}

function applyEnabled() {
  tabManager.setEnabled(enabled);
  // 防御：从全禁恢复启用后 TabManager 已自动切站；极端场景 currentId 仍为
  // null 时由 UI 自行落到首个启用站（计划 Task 8 启动/恢复语义）。
  let cur = tabManager.currentId();
  if (cur === null) {
    const first = SITES.find((s) => enabled[s.id] !== false);
    if (first) {
      tabManager.select(first.id);
      cur = tabManager.currentId();
    }
  }
  if (cur) rememberSite(cur);
  sync();
}

els.btnManage.addEventListener('click', openModal);
els.btnGuideManage.addEventListener('click', openModal);
els.btnModalClose.addEventListener('click', closeModal);
els.btnModalDone.addEventListener('click', closeModal);
els.overlay.addEventListener('click', (e) => {
  if (e.target === els.overlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.overlay.hidden) closeModal();
});

els.btnReset.addEventListener('click', () => {
  try {
    resetConfig(storage, SITES); // 删 key 即回默认全开
  } catch (e) { /* 删除失败不致命：关闭弹层时仍按勾选保存 */ }
  for (const cb of els.modalList.querySelectorAll('input[type="checkbox"]')) {
    cb.checked = true;
  }
  toast('已恢复默认（全部启用）');
});

/* ------------------------------------------------------------ 特殊站卡片按钮 */

els.cardCopy.addEventListener('click', async () => {
  const ok = await host.copyText(lastBrowserUrl);
  toast(ok ? '已复制链接' : '复制失败');
});

els.cardRetry.addEventListener('click', () => {
  const cur = tabManager.currentId();
  const site = cur && siteById.get(cur);
  if (site && site.type === 'browser') openBrowserSite(site);
});

/* ------------------------------------------------------------ 启动 */

tabManager = new TabManager(SITES, {
  createFrame,
  onBrowserSite: openBrowserSite,
  onAllDisabled: () => sync(),
});

enabled = loadConfig(storage, SITES).enabled;
tabManager.setEnabled(enabled);

// 有启用站则选中「上次记住的站」，否则首个启用站；全禁则由 sync 展示引导页。
const last = readLastSite();
if (last && siteById.has(last) && enabled[last] !== false) {
  tabManager.select(last);
}
if (tabManager.currentId() === null) {
  const first = SITES.find((s) => enabled[s.id] !== false);
  if (first) tabManager.select(first.id);
}
if (tabManager.currentId()) rememberSite(tabManager.currentId());

fitInput();
sync();

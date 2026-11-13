import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITES } from '../web/js/data/sites.js';
import { CONFIG_KEY } from '../web/js/core/config-store.js';

const LAST_SITE_KEY = 'otools-fanyi.lastSite.v1';
let runId = 0;

/** 仅实现 app.js 用到的 DOM 接口；src 写入记录代表 iframe 导航。 */
class MemoryElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.className = '';
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.scrollHeight = 36;
    this.srcWrites = [];
    this.listeners = new Map();
    this._text = '';
  }

  get textContent() {
    return this._text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._text = String(value);
  }

  get src() { return this.srcWrites.at(-1) || ''; }
  set src(value) { this.srcWrites.push(String(value)); }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  append(...children) { for (const child of children) this.appendChild(child); }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, fields = {}) {
    const event = { target: this, preventDefault() {}, ...fields };
    for (const handler of this.listeners.get(type) || []) handler(event);
  }

  click() { this.dispatch('click'); }

  querySelectorAll(selector) {
    const matches = (el) => {
      if (selector === '.tab.active') return el.className.split(' ').includes('tab') && el.className.split(' ').includes('active');
      if (selector === 'input[type="checkbox"]') return el.tagName === 'INPUT' && el.type === 'checkbox';
      if (selector === 'iframe') return el.tagName === 'IFRAME';
      throw new Error('未实现的测试选择器：' + selector);
    };
    const found = [];
    for (const child of this.children) {
      if (matches(child)) found.push(child);
      found.push(...child.querySelectorAll(selector));
    }
    return found;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function memoryStorage(initial) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** 等待真实宿主桥的 async/fallback 链完成，不用计时延迟猜测顺序。 */
function settle() {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 顺序导入真实 app.js；仅替换 DOM、存储与宿主 I/O，结束后还原全局。 */
async function startApp(t, { blockedStorage = false, lastSite, enabled } = {}) {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  const nodes = new Map();
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const el = new MemoryElement(match[1]);
    el.hidden = /\bhidden\b/.test(match[2]);
    nodes.set(match[3], el);
  }
  const doc = new MemoryElement('document');
  doc.getElementById = (id) => nodes.get(id) || null;
  doc.createElement = (tag) => new MemoryElement(tag);
  doc.getElementById('content').append(doc.getElementById('browser-card'), doc.getElementById('guide'));

  const initial = {};
  if (lastSite) initial[LAST_SITE_KEY] = lastSite;
  if (enabled) initial[CONFIG_KEY] = JSON.stringify({ enabled });
  const requests = [];
  const win = {
    document: doc,
    otools: {
      shell: {
        openExternal(url) {
          const request = { url, ...deferred() };
          requests.push(request);
          return request.promise;
        },
      },
    },
    open() { return null; }, // SDK 拒绝后，全链失败而非实际弹出窗口。
  };
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (blockedStorage) throw new DOMException('Storage access denied', 'SecurityError');
      return storage;
    },
  });
  const storage = memoryStorage(initial);
  const originals = new Map(['window', 'document', 'setTimeout'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const timers = new Set();
  const realSetTimeout = globalThis.setTimeout;
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.setTimeout = (...args) => {
    const timer = realSetTimeout(...args);
    timers.add(timer);
    return timer;
  };
  t.after(async () => {
    for (const request of requests) request.resolve();
    await settle();
    for (const timer of timers) clearTimeout(timer);
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  await import(new URL('../web/js/ui/app.js?ui-test=' + (++runId), import.meta.url));
  const $ = (id) => doc.getElementById(id);
  return {
    $, requests,
    tab: (id) => $('tabs').children.find((btn) => btn.dataset.id === id),
    checkboxes: () => $('modal-list').querySelectorAll('input[type="checkbox"]'),
  };
}

test('UI：localStorage getter 抛 SecurityError 仍可启动、保存与重置（仅本次运行有效）', async (t) => {
  let ui;
  await assert.doesNotReject(async () => {
    ui = await startApp(t, { blockedStorage: true });
  }, '存储获取失败不应中断真实 UI 装配');
  assert.equal(ui.$('tabs').children.length, 9);
  assert.equal(ui.tab('baidu').className, 'tab active');
  assert.equal(ui.$('content').querySelector('iframe').src, 'https://fanyi.baidu.com');
  ui.$('btn-manage').click();
  ui.checkboxes().find((cb) => cb.dataset.id === 'baidu').checked = false;
  ui.$('btn-modal-done').click();
  assert.equal(ui.tab('baidu'), undefined);
  assert.equal(ui.$('toast').hidden, true, '内存回退保存不应报错');
  ui.$('btn-manage').click();
  assert.equal(ui.checkboxes().find((cb) => cb.dataset.id === 'baidu').checked, false);
  ui.$('btn-reset').click();
  ui.$('btn-modal-done').click();
  assert.equal(ui.$('tabs').children.length, 9);
  assert.equal(ui.$('toast').textContent, '已恢复默认（全部启用）');
});

test('UI：DeepL 晚成功不能覆盖已失败的 Google 卡片', async (t) => {
  const ui = await startApp(t);
  ui.tab('deepl').click();
  ui.tab('google').click();
  assert.deepEqual(ui.requests.map((request) => request.url), ['https://www.deepl.com/translator', 'https://translate.google.com']);
  ui.requests[1].reject(new Error('Google unavailable'));
  await settle();
  assert.equal(ui.$('card-status').className, 'card-status failed');
  ui.requests[0].resolve();
  await settle();
  assert.equal(ui.$('card-title').textContent, 'Google 翻译');
  assert.equal(ui.$('card-url').textContent, 'https://translate.google.com');
  assert.equal(ui.$('card-status').className, 'card-status failed', '旧站成功不得刷新当前卡片');
});

test('UI：DeepL 晚失败不能覆盖已成功的 Google 卡片', async (t) => {
  const ui = await startApp(t);
  ui.tab('deepl').click();
  ui.tab('google').click();
  ui.requests[1].resolve();
  await settle();
  assert.equal(ui.$('card-status').className, 'card-status opened');
  ui.requests[0].reject(new Error('DeepL unavailable'));
  await settle();
  assert.equal(ui.$('card-status').className, 'card-status opened', '旧站失败不得刷新当前卡片');
});

for (const [label, button] of [['翻译', 'btn-translate'], ['重试', 'card-retry']]) {
  test('UI：同一站连点' + label + '仅最新请求可刷新卡片', async (t) => {
    const ui = await startApp(t);
    ui.tab('deepl').click();
    ui.$('input-text').value = 'old';
    ui.$(button).click();
    ui.$('input-text').value = 'new';
    ui.$(button).click();
    assert.equal(ui.requests.length, 3);
    const latestUrl = ui.$('card-url').textContent;
    ui.requests[2].reject(new Error('Latest unavailable'));
    await settle();
    assert.equal(ui.$('card-status').className, 'card-status failed');
    ui.requests[1].resolve();
    ui.requests[0].resolve();
    await settle();
    assert.equal(ui.$('card-url').textContent, latestUrl);
    assert.equal(ui.$('card-status').className, 'card-status failed', '同站旧请求也必须失效');
  });
}

for (const leave of ['embed', 'all-disabled']) {
  test('UI：切到 ' + leave + ' 后浏览器请求不得更新隐藏卡片', async (t) => {
    const ui = await startApp(t);
    ui.tab('deepl').click();
    const previousStatus = ui.$('card-status').textContent;
    if (leave === 'embed') {
      ui.tab('baidu').click();
    } else {
      ui.$('btn-manage').click();
      for (const cb of ui.checkboxes()) cb.checked = false;
      ui.$('btn-modal-done').click();
    }
    assert.equal(ui.$('browser-card').hidden, true);
    assert.equal(ui.$('guide').hidden, leave !== 'all-disabled');
    ui.requests[0].resolve();
    await settle();
    assert.equal(ui.$('card-status').textContent, previousStatus, '离开 browser 视图即取消旧 UI 更新');
  });
}

for (const site of SITES.filter((site) => site.type === 'browser')) {
  for (const restored of [true, false]) {
    test('UI：启动' + (restored ? '恢复 ' : '仅启用 ') + site.id + ' 不外开，显式 Tab/翻译/重试才打开', async (t) => {
      const ui = await startApp(t, restored
        ? { lastSite: site.id }
        : { enabled: Object.fromEntries(SITES.map((s) => [s.id, s.id === site.id])) });
      assert.equal(ui.requests.length, 0, '启动选中 browser 站不得打开系统浏览器');
      assert.equal(ui.tab(site.id).className, 'tab active');
      assert.equal(ui.$('browser-card').hidden, false);
      assert.equal(ui.$('guide').hidden, true);
      assert.equal(ui.$('card-title').textContent, site.name);
      assert.equal(ui.$('card-url').textContent, site.url);
      assert.equal(ui.$('card-status').className, 'card-status ready');
      assert.match(ui.$('card-status').textContent, /点击.*(?:翻译|重试)/);
      for (const [index, button] of [ui.tab(site.id), ui.$('btn-translate'), ui.$('card-retry')].entries()) {
        button.click();
        assert.equal(ui.requests.length, index + 1);
        assert.equal(ui.requests[index].url, site.url);
        assert.equal(ui.$('card-status').className, 'card-status opening');
        ui.requests[index].resolve();
        await settle();
        assert.equal(ui.$('card-status').className, 'card-status opened');
      }
    });
  }
}

test('UI：无预填站统一翻译提示复制粘贴，不静默重载 iframe', async (t) => {
  const site = SITES.find((s) => s.type === 'embed' && !s.prefill);
  if (!site) return t.skip('当前清单没有无预填 embed 站');
  const ui = await startApp(t, { lastSite: site.id });
  const iframe = ui.$('content').querySelector('iframe');
  ui.$('input-text').value = 'hello';
  ui.$('btn-translate').click();
  assert.equal(ui.$('toast').hidden, false);
  assert.equal(ui.$('toast').textContent, '该站不支持自动预填，请复制文本后粘贴');
  assert.deepEqual(iframe.srcWrites, [site.url], '没有预填模板时不应重载当前帧');
});

test('UI：无预填 browser 站翻译提示复制粘贴，仍由用户点击打开原 URL', async (t) => {
  const site = SITES.find((s) => s.type === 'browser' && !s.prefill);
  if (!site) return t.skip('当前清单没有无预填 browser 站');
  const ui = await startApp(t, { lastSite: site.id });
  assert.equal(ui.requests.length, 0);
  ui.$('input-text').value = 'hello';
  ui.$('btn-translate').click();
  assert.equal(ui.$('toast').hidden, false);
  assert.equal(ui.$('toast').textContent, '该站不支持自动预填，请复制文本后粘贴');
  assert.equal(ui.requests.length, 1, '显式翻译仍可打开系统浏览器');
  assert.equal(ui.requests[0].url, site.url, '无模板时打开原 URL');
  ui.requests[0].resolve();
  await settle();
  assert.equal(ui.$('card-status').className, 'card-status opened');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { SITES } from '../web/js/data/sites.js';
import { TabManager } from '../web/js/core/tab-manager.js';

/**
 * 假 hooks 工厂：createFrame 计数 + 假 el 记录 hidden 状态。
 * 假 el 提供 setHidden(bool) 可断言接口（TabManager 操纵 el 隐藏的约定入口），
 * destroy 只计数不真正回收，便于断言「禁用即销毁」。
 */
function makeFakeHooks() {
  const calls = { create: [], destroyed: [], browser: [], allDisabled: 0 };
  const els = new Map(); // site.id → 该站当前（最新一次创建）的假 el
  const hooks = {
    createFrame(site) {
      calls.create.push(site.id);
      const el = { hidden: false };
      el.setHidden = (value) => {
        el.hidden = value;
      };
      els.set(site.id, el);
      return { el, destroy() { calls.destroyed.push(site.id); } };
    },
    onBrowserSite(site) {
      calls.browser.push(site);
    },
    onAllDisabled() {
      calls.allDisabled += 1;
    },
  };
  return { hooks, calls, els };
}

/** 全 true 的 enabled 映射，overrides 覆盖指定站。 */
function enabledMap(overrides = {}) {
  return Object.fromEntries(SITES.map((s) => [s.id, overrides[s.id] ?? true]));
}

/** 全禁 enabled 映射。 */
function enabledNone() {
  return Object.fromEntries(SITES.map((s) => [s.id, false]));
}

/** 仅启用指定站的 enabled 映射（其余全 false）。 */
function enabledOnly(id) {
  return Object.fromEntries(SITES.map((s) => [s.id, s.id === id]));
}

test('① 首次 select(baidu) → createFrame 调 1 次（懒创建），currentId 为 baidu', () => {
  const { hooks, calls } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  assert.equal(tm.currentId(), null, '初始未选中');
  tm.select('baidu');
  assert.deepEqual(calls.create, ['baidu']);
  assert.equal(tm.currentId(), 'baidu');
});

test('② 再 select(baidu) → 仍只 1 次（keep-alive 复用，不重建）', () => {
  const { hooks, calls } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.select('baidu');
  assert.equal(calls.create.length, 1);
  assert.equal(tm.currentId(), 'baidu');
});

test('③ select(bing) → bing 新建 1 次，baidu 的 el 被隐藏', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.select('bing');
  assert.deepEqual(calls.create, ['baidu', 'bing'], 'bing 新建 1 次');
  assert.equal(els.get('baidu').hidden, true, '切走的 baidu 应被隐藏');
  assert.equal(els.get('bing').hidden, false, '当前 bing 应可见');
});

test('④ 回 select(baidu) → createFrame 总数仍 2（切回复用原 frame）', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.select('bing');
  tm.select('baidu');
  assert.equal(calls.create.length, 2, '不重建');
  assert.equal(els.get('baidu').hidden, false, '切回应重新显示');
  assert.equal(els.get('bing').hidden, true, '切走的 bing 应被隐藏');
  assert.equal(tm.currentId(), 'baidu');
});

test('⑤ setEnabled 关掉当前站 baidu → destroy 调 1 次，currentId 落到剩余首站 tencent', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.setEnabled(enabledMap({ baidu: false }));
  assert.deepEqual(
    calls.destroyed.filter((id) => id === 'baidu'),
    ['baidu'],
    'baidu frame 应恰好 destroy 1 次',
  );
  assert.equal(tm.currentId(), 'tencent', '落到 SITES 顺序里剩余启用站的首个');
  assert.deepEqual(calls.create, ['baidu', 'tencent'], '自动切到 tencent（懒创建其 frame）');
  assert.equal(els.get('baidu').hidden, true, '禁用站 el 保持隐藏（无悬挂可见帧）');
  assert.equal(els.get('tencent').hidden, false);
});

test('⑥ 全部禁用 → onAllDisabled 调 1 次，全部 frame 销毁，currentId 归 null', () => {
  const { hooks, calls } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.select('bing');
  tm.setEnabled(enabledNone());
  assert.equal(calls.allDisabled, 1);
  assert.equal(tm.currentId(), null);
  assert.deepEqual([...calls.destroyed].sort(), ['baidu', 'bing'], '禁用即销毁');
});

test('⑦ select(deepl)（browser 站）→ 不建 frame、onBrowserSite(deepl) 1 次、其余 frame 隐藏', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.select('deepl');
  assert.deepEqual(calls.create, ['baidu'], 'browser 站不调 createFrame');
  assert.equal(calls.browser.length, 1);
  assert.equal(calls.browser[0].id, 'deepl', 'onBrowserSite 收到 site 对象');
  assert.equal(els.get('baidu').hidden, true, '其余 frame 全部隐藏');
  assert.equal(tm.currentId(), 'deepl');
});

test('⑧ 重新启用已销毁的站 → 再 select 时重新 createFrame', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.setEnabled(enabledMap({ baidu: false }));
  tm.setEnabled(enabledMap());
  tm.select('baidu');
  assert.deepEqual(
    calls.create.filter((id) => id === 'baidu'),
    ['baidu', 'baidu'],
    'baidu 应重新 createFrame（共 2 次）',
  );
  assert.equal(els.get('baidu').hidden, false, '重建后可见');
  assert.equal(tm.currentId(), 'baidu');
});

test('⑨ 全禁 map 重复 setEnabled 三次 → onAllDisabled 恰 1 次（幂等）', () => {
  const { hooks, calls } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.select('baidu');
  tm.setEnabled(enabledNone());
  tm.setEnabled(enabledNone());
  tm.setEnabled(enabledNone());
  assert.equal(calls.allDisabled, 1, '全禁状态下重复 setEnabled 不得重复回调');
  assert.equal(tm.currentId(), null);
});

test('⑩ 启动即全禁仍触发 1 次；恢复一站启用 → currentId 落到该站；再次全禁 → 共 2 次', () => {
  const { hooks, calls, els } = makeFakeHooks();
  const tm = new TabManager(SITES, hooks);
  tm.setEnabled(enabledNone());
  assert.equal(calls.allDisabled, 1, '启动即全禁（首次进入）必须触发');
  tm.setEnabled(enabledOnly('caiyun'));
  assert.equal(tm.currentId(), 'caiyun', '退出全禁自动切到唯一启用站');
  assert.deepEqual(calls.create, ['caiyun'], '按 select 语义懒创建');
  assert.equal(els.get('caiyun').hidden, false);
  tm.setEnabled(enabledNone());
  assert.equal(calls.allDisabled, 2, '再次进入全禁须重新触发');
  assert.equal(tm.currentId(), null);
});

test('⑪ hooks 无 createFrame → select 不抛错、currentId 不切换、后续 select（含 hideAll）不抛', () => {
  let browserCalls = 0;
  const tm = new TabManager(SITES, {
    onBrowserSite() {
      browserCalls += 1;
    },
    onAllDisabled() {},
  });
  tm.select('baidu'); // 缺 createFrame：防御分支
  assert.equal(tm.currentId(), null, '帧创建失败不得切换 currentId');
  tm.select('bing'); // #hideAll 空帧表不得抛
  assert.equal(tm.currentId(), null);
  tm.select('deepl'); // browser 站不受影响
  assert.equal(browserCalls, 1);
  assert.equal(tm.currentId(), 'deepl');
});

test('⑫ createFrame 返回 undefined → 同样安全降级（不进帧表、不切换、hideAll 不抛）', () => {
  const tm = new TabManager(SITES, {
    createFrame() {
      return undefined;
    },
    onBrowserSite() {},
    onAllDisabled() {},
  });
  tm.select('baidu');
  assert.equal(tm.currentId(), null);
  tm.select('sogou'); // #hideAll 空帧表不得抛
  assert.equal(tm.currentId(), null);
});

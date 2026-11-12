/**
 * Tab 状态机（纯逻辑，无 DOM；DOM 全部经由注入的 hooks 操纵，可被 node --test 直接 import）。
 * ------------------------------------------------------------------
 * 职责：
 * - embed 站懒创建：首次 select 才调 hooks.createFrame(site)；
 * - keep-alive：切走只隐藏不销毁，切回复用同一 frame；
 * - 禁用即销毁：setEnabled 关掉的站立即调 frame.destroy()；
 * - browser 站不建 frame：select 时隐藏全部 frame 并回调 onBrowserSite(site)；
 * - 全部禁用：currentId 归 null 并回调 onAllDisabled()；当前站被禁用时
 *   自动落到 SITES 顺序里剩余启用站的首个（按 select 语义懒创建）。
 *
 * hooks = { createFrame(site) → { el, destroy() }, onBrowserSite(site), onAllDisabled() }。
 * el 隐藏约定：优先调 el.setHidden(bool)（测试假件 / 包装层提供的可断言接口），
 * 普通对象（如真 DOM el）回退写 el.hidden 属性。
 */

/** 标记 el 的隐藏状态：优先 setHidden(bool)，回退 el.hidden。 */
function setElHidden(el, hidden) {
  if (typeof el?.setHidden === 'function') el.setHidden(hidden);
  else el.hidden = hidden;
}

export class TabManager {
  #sites;
  #siteById;
  #hooks;
  /** site.id → { el, destroy() }，keep-alive 的存活帧。 */
  #frames = new Map();
  /** 严格 === false 视为关闭（与 config-store 合并规则一致），其余一律开启。 */
  #disabledIds = new Set();
  #current = null;

  constructor(sites, hooks) {
    this.#sites = sites;
    this.#siteById = new Map(sites.map((site) => [site.id, site]));
    this.#hooks = hooks;
  }

  /** 当前选中站 id；未选中 / 全禁用为 null。 */
  currentId() {
    return this.#current;
  }

  /** 切换到指定站。embed 懒创建 / 复用，browser 走 onBrowserSite；未知或已禁用的 id 忽略。 */
  select(id) {
    const site = this.#siteById.get(id);
    if (!site || this.#disabledIds.has(id)) return;
    this.#hideAll();
    if (site.type === 'browser') {
      this.#current = id;
      this.#hooks.onBrowserSite?.(site);
      return;
    }
    let frame = this.#frames.get(id);
    if (!frame) {
      frame = this.#hooks.createFrame?.(site);
      this.#frames.set(id, frame);
    }
    setElHidden(frame.el, false);
    this.#current = id;
  }

  /**
   * 更新站点开关（合并语义：只覆盖传入的 id；值严格 === false 视为关闭）。
   * 被禁用的站立即销毁 frame；当前站被禁用时自动切到 SITES 顺序里剩余启用
   * 站的首个；无可启用站则 currentId 归 null 并回调 onAllDisabled()。
   */
  setEnabled(enabled) {
    const prev = this.#current;
    for (const [id, value] of Object.entries(enabled ?? {})) {
      if (value === false) this.#disabledIds.add(id);
      else this.#disabledIds.delete(id);
    }
    for (const site of this.#sites) {
      if (this.#disabledIds.has(site.id)) this.#destroyFrame(site.id);
    }
    const next = this.#sites.find((site) => !this.#disabledIds.has(site.id)) ?? null;
    if (!next) {
      this.#hideAll();
      this.#current = null;
      this.#hooks.onAllDisabled?.();
      return;
    }
    if (prev !== null && this.#disabledIds.has(prev)) this.select(next.id);
  }

  /** 内部：隐藏全部存活帧（切走 / browser 站 / 全禁用时）。 */
  #hideAll() {
    for (const frame of this.#frames.values()) setElHidden(frame.el, true);
  }

  /** 内部：销毁并移除指定站的 frame（幂等，无帧时为空操作）。先隐藏再 destroy，避免宿主异步摘除期间残留可见帧。 */
  #destroyFrame(id) {
    const frame = this.#frames.get(id);
    if (!frame) return;
    this.#frames.delete(id);
    setElHidden(frame.el, true);
    frame.destroy?.();
  }
}

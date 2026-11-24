/* Placement recognition: turns an adapter's markers into eligible, correctly sized placements. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const ATTR = 'data-cs-claimed';
  const MIN_W = 120;
  const MIN_H = 50;
  const MAX_W = 2560; // full-width mastheads on large screens (e.g. IGN's takeover banner)
  const MAX_H = 1050;

  function px(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) && /px$|^\d+(\.\d+)?$/.test(String(v).trim()) ? n : 0;
  }

  function isHidden(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    }
    return false;
  }

  /** The size the publisher reserved for the slot, used when the ad itself never loaded. */
  function declaredSize(el) {
    const s = el.style || {};
    let w = px(s.width) || px(el.getAttribute('width')) || px(s.minWidth);
    let h = px(s.height) || px(el.getAttribute('height')) || px(s.minHeight);
    const iframe = el.querySelector && el.querySelector('iframe[width][height]');
    if ((!w || !h) && iframe) {
      w = w || px(iframe.getAttribute('width'));
      h = h || px(iframe.getAttribute('height'));
    }
    const parent = el.parentElement;
    const parentW = parent ? parent.getBoundingClientRect().width : 0;
    if (!w) w = Math.min(parentW, 970);
    if (!h && w) h = w >= 600 ? 90 : 250; // responsive slot: leaderboard on wide columns, rectangle otherwise
    if (parentW && w > parentW) w = parentW;
    return { w: Math.round(w), h: Math.round(h) };
  }

  function sizeOk(w, h) {
    // Narrow slots only qualify as full skyscrapers (120x600, 160x600); small odd sizes are usually widgets.
    if (w < 160 && h < 400) return false;
    return w >= MIN_W && h >= MIN_H && w <= MAX_W && h <= MAX_H;
  }

  /** Pick the element to claim for a matched marker (iframes are claimed through their container). */
  function containerFor(el, adapter) {
    if (el.tagName !== 'IFRAME') return el;
    const r = el.getBoundingClientRect();
    const area = Math.max(1, r.width * r.height);
    const c = el.parentElement && el.parentElement.closest(adapter.containers);
    if (c) {
      const cr = c.getBoundingClientRect();
      if (cr.width * cr.height <= area * 1.8 || cr.width * cr.height === 0) return c;
    }
    return el.parentElement;
  }

  function claimedNearby(el) {
    if (el.closest('[' + ATTR + '], creatorspot-promo')) return true;
    return !!el.querySelector('[' + ATTR + '], creatorspot-promo');
  }

  /**
   * @param adapter  site adapter
   * @param opts     {compat: boolean}
   * @returns Placement[] {el, mode:'inside'|'beside', w, h}
   */
  function find(adapter, opts) {
    const out = [];
    const seen = new Set();
    const consider = (el, strong) => {
      const target = containerFor(el, adapter);
      if (!target || seen.has(target) || target === document.body || target === document.documentElement) return;
      seen.add(target);
      if (claimedNearby(target)) return;

      const cs = getComputedStyle(target);
      const r = target.getBoundingClientRect();
      if (cs.position === 'fixed' && r.height > 150) return; // never turn interstitials into promos
      const hidden = isHidden(target);

      if (!hidden && sizeOk(r.width, r.height)) {
        if (!strong && (target.innerText || '').length > 300) return; // probably real content
        out.push({ el: target, mode: 'inside', w: Math.round(Math.min(r.width, MAX_W)), h: Math.round(r.height), strong });
        return;
      }
      if (!strong) return;

      if (!hidden && r.height < MIN_H) {
        // Empty slot (the ad never loaded, e.g. because ad requests are blocked).
        const d = declaredSize(target);
        if (sizeOk(d.w, d.h)) out.push({ el: target, mode: 'inside', w: d.w, h: d.h, strong });
        return;
      }
      if (hidden && opts.compat) {
        // Another blocker (e.g. Brave Shields) hid the slot. Place the promo beside it, only if the
        // surrounding layout is visible, so we never surface something the site itself hid.
        const parent = target.parentElement;
        if (!parent || isHidden(parent)) return;
        const d = declaredSize(target);
        if (sizeOk(d.w, d.h)) out.push({ el: target, mode: 'beside', w: d.w, h: d.h, strong });
      }
    };

    adapter.strong.forEach((sel) => document.querySelectorAll(sel).forEach((el) => consider(el, true)));
    adapter.weak.forEach((sel) => document.querySelectorAll(sel).forEach((el) => consider(el, false)));

    // A loosely named wrapper ("weak") that contains a real ad slot ("strong") yields to the real slot.
    const precise = out.filter((q) => q.strong || !out.some((p) => p !== q && p.strong && q.el.contains(p.el)));
    // Otherwise drop placements nested inside other placements (keep the outermost).
    return precise.filter((p) => !precise.some((q) => q !== p && q.el.contains(p.el)));
  }

  CS.detector = { find, ATTR, declaredSize, sizeOk };
})(typeof globalThis !== 'undefined' ? globalThis : self);

/* Content script orchestration: detect placements -> ask the background for a promotion -> render -> measure. */
(function () {
  'use strict';
  const CS = globalThis.CreatorSpot;
  if (!CS || CS.contentLoaded || window.top !== window) return; // top frame only; ads in sub-frames are handled via their container
  CS.contentLoaded = true;

  const ATTR = CS.detector.ATTR;
  const host = location.hostname.replace(/^www\./, '');
  const adapter = CS.sites.forHost(location.hostname);
  const mounted = []; // {host, target, mode, creatorId, campaignId, name, ro, io}
  let ctx = null;
  let eligibleSeen = 0;
  let scanTimer = null;
  let companion = null;
  let observer = null;
  let generation = 0; // bumped on teardown so in-flight fills are discarded

  const send = (msg) => CS.api.runtime.sendMessage(msg).catch(() => null);

  function compatOn() {
    if (!ctx) return false;
    return ctx.compatMode === 'on' || (ctx.compatMode === 'auto' && CS.isBrave());
  }

  function makeHost(w, h) {
    const el = document.createElement('creatorspot-promo');
    el.style.cssText =
      'all:initial;display:block;position:relative;box-sizing:border-box;margin:0 auto;' +
      // Fixed width (capped by the container) so shrink-to-fit slots do not collapse to zero.
      'width:' + w + 'px;max-width:100%;height:' + h + 'px;';
    return el;
  }

  function trackImpression(m) {
    // A display counts only when at least half of the promotion is on screen for one full second.
    let timer = null;
    m.io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.intersectionRatio >= 0.5 && document.visibilityState === 'visible') {
            if (!timer) timer = setTimeout(() => {
              send({ type: 'event', event: 'impression', campaignId: m.campaignId, creatorId: m.creatorId });
              m.io.disconnect();
            }, 1000);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        });
      },
      { threshold: [0, 0.5, 1] }
    );
    m.io.observe(m.host);
  }

  function bindClicks(m) {
    const onClick = (e) => {
      if (e.type === 'auxclick' && e.button !== 1) return;
      send({ type: 'event', event: 'click', campaignId: m.campaignId, creatorId: m.creatorId });
    };
    m.view.shadow.addEventListener('click', onClick);
    m.view.shadow.addEventListener('auxclick', onClick);
  }

  async function fill(p) {
    const gen = generation;
    const shownOnPage = mounted.map((m) => m.creatorId);
    const payload = await send({ type: 'promo', size: { w: p.w, h: p.h }, shownOnPage });
    if (payload && payload.tiktok && mounted.filter((m) => m.tiktok).length >= 2) payload.tiktok = null;
    if (gen !== generation) return;
    if (!payload || !document.contains(p.el)) {
      p.el.setAttribute(ATTR, 'skip');
      return;
    }
    const el = makeHost(p.w, p.h);
    if (p.mode === 'inside') {
      p.el.setAttribute(ATTR, 'inside');
      p.el.insertBefore(el, p.el.firstChild);
    } else {
      p.el.setAttribute(ATTR, 'beside');
      p.el.parentElement.insertBefore(el, p.el);
    }
    const m = { host: el, target: p.el, mode: p.mode, creatorId: payload.creator.id, campaignId: payload.campaign.id, name: payload.creator.name, tiktok: !!payload.tiktok };
    m.view = CS.render.mount(el, payload, { w: p.w, h: p.h });
    bindClicks(m);
    trackImpression(m);
    m.ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) m.view.relayout(r.width, r.height);
    });
    m.ro.observe(el);
    if (p.mode === 'inside') guardSlot(m);
    mounted.push(m);
    send({ type: 'count', count: mounted.length });
  }

  /**
   * Keep the original ad hidden. Some sites (e.g. IGN) re-show their ad with inline !important styles or
   * turn it into a sticky bar when you scroll, which beats a stylesheet rule. We hide each original child
   * inline and re-apply whenever the site changes it. Original inline values are restored on teardown.
   */
  function guardSlot(m) {
    m.hidden = new Map();
    const hide = () => {
      for (const ch of m.target.children) {
        if (ch === m.host) continue;
        if (!m.hidden.has(ch)) m.hidden.set(ch, { value: ch.style.getPropertyValue('display'), prio: ch.style.getPropertyPriority('display') });
        if (ch.style.getPropertyValue('display') !== 'none' || ch.style.getPropertyPriority('display') !== 'important') {
          ch.style.setProperty('display', 'none', 'important');
        }
      }
    };
    hide();
    m.guard = new MutationObserver(hide);
    m.guard.observe(m.target, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  }

  function unguard(m) {
    if (m.guard) m.guard.disconnect();
    if (m.hidden) {
      m.hidden.forEach((prev, ch) => {
        if (prev.value) ch.style.setProperty('display', prev.value, prev.prio);
        else ch.style.removeProperty('display');
      });
    }
  }

  let scanning = false;
  let rescan = false;
  async function scan() {
    scanTimer = null;
    if (!ctx || !ctx.active) return;
    if (scanning) {
      rescan = true; // never run two scans at once; run again when this one finishes
      return;
    }
    scanning = true;
    try {
      await scanOnce();
    } finally {
      scanning = false;
      if (rescan) {
        rescan = false;
        scheduleScan();
      }
    }
  }

  async function scanOnce() {
    // Sites like YouTube swap pages without reloading and throw our old promos away; forget those so
    // they don't count toward the per-page limit.
    for (let i = mounted.length - 1; i >= 0; i--) {
      const m = mounted[i];
      if (document.contains(m.host)) continue;
      m.io && m.io.disconnect();
      m.ro && m.ro.disconnect();
      m.guard && m.guard.disconnect();
      if (m.target && document.contains(m.target)) m.target.removeAttribute(ATTR);
      mounted.splice(i, 1);
    }
    // Fill top-to-bottom so readers meet the rotation in order.
    const placements = CS.detector
      .find(adapter, { compat: compatOn() })
      .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const p of placements) {
      if (!ctx || !ctx.active) return;
      if (mounted.length >= ctx.maxPerPage) break;
      eligibleSeen += 1;
      // Replacement frequency: replace the configured share of eligible placements, evenly spread.
      const due = Math.floor((eligibleSeen * ctx.replaceRate) / 100) > Math.floor(((eligibleSeen - 1) * ctx.replaceRate) / 100);
      if (!due) {
        p.el.setAttribute(ATTR, 'skip');
        continue;
      }
      p.el.setAttribute(ATTR, 'pending');
      await fill(p);
    }
    if (adapter.videoAdPlaying) checkVideoAd();
  }

  function scheduleScan(delay) {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, delay == null ? 200 : delay);
  }

  // ---- YouTube: adjacent creator card while a video ad plays (the ad itself is left untouched) ----
  async function checkVideoAd() {
    if (!ctx || !ctx.active || !ctx.youtubeCompanion) return removeCompanion();
    const playing = adapter.videoAdPlaying();
    if (playing && !companion) {
      const anchor = adapter.companionAnchor();
      if (!anchor) return;
      companion = { pending: true };
      const w = Math.round(anchor.width);
      const h = w >= 600 ? 120 : 200;
      const payload = await send({ type: 'promo', size: { w, h }, shownOnPage: mounted.map((m) => m.creatorId) });
      if (!payload || !adapter.videoAdPlaying()) {
        companion = null;
        return;
      }
      payload.label = 'Shown alongside this ad · CreatorSpot';
      const el = makeHost(w, h);
      el.style.marginBottom = '12px';
      el.setAttribute('data-cs-companion', '');
      anchor.parent.insertBefore(el, anchor.parent.firstChild);
      const m = { host: el, creatorId: payload.creator.id, campaignId: payload.campaign.id, name: payload.creator.name, companion: true };
      m.view = CS.render.mount(el, payload, { w, h });
      bindClicks(m);
      trackImpression(m);
      companion = m;
    } else if (!playing && companion && !companion.pending) {
      removeCompanion();
    }
  }

  function removeCompanion() {
    if (companion && companion.host) {
      companion.io && companion.io.disconnect();
      companion.host.remove();
    }
    companion = null;
  }

  function teardown() {
    generation += 1;
    mounted.splice(0).forEach((m) => {
      m.io && m.io.disconnect();
      m.ro && m.ro.disconnect();
      unguard(m);
      m.host.remove();
    });
    document.querySelectorAll('[' + ATTR + ']').forEach((el) => el.removeAttribute(ATTR));
    removeCompanion();
    eligibleSeen = 0;
    send({ type: 'count', count: 0 });
  }

  async function refreshContext() {
    const next = await send({ type: 'context', host });
    const wasActive = ctx && ctx.active;
    ctx = next;
    if (!ctx) return;
    if (!ctx.active && wasActive) teardown();
    if (ctx.active) scheduleScan(0);
  }

  function start() {
    refreshContext();
    observer = new MutationObserver((records) => {
      if (!ctx || !ctx.active) return;
      for (const r of records) {
        if (r.type === 'attributes' || r.addedNodes.length) return scheduleScan();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ad-status'] });
    setInterval(() => adapter.videoAdPlaying && ctx && ctx.active && checkVideoAd(), 1000);
    CS.api.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) {
        teardown();
        refreshContext();
      }
    });
    CS.api.runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg && msg.type === 'tab-status') {
        const names = [...new Set(mounted.concat(companion && companion.host ? [companion] : []).map((m) => m.name))];
        reply({ host, active: !!(ctx && ctx.active), enabled: !!(ctx && ctx.enabled), siteEnabled: !!(ctx && ctx.siteEnabled), count: mounted.length + (companion && companion.host ? 1 : 0), names, adapter: adapter.id });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

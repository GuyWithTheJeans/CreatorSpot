/* Promotion renderer: five formats x five size-aware layouts, inside Shadow DOM.
 * Shared by the content script (real placements) and the dashboard (live previews). */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const esc = CS.escapeHtml;

  function layoutFor(w, h) {
    if (h < 70 || (w / h >= 2.5 && h < 130)) return h < 60 || w < 400 ? 'strip strip-sm' : 'strip';
    if (h / w >= 1.5) return 'tall';
    if (w >= 560 && h >= 200) return 'wide';
    return 'card';
  }

  function readableOn(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const [r, g, b] = m.slice(1).map((x) => {
      const c = parseInt(x, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return L > 0.35 ? '#0B0B12' : '#FFFFFF';
  }

  const CSS = `
:host { all: initial; display: block; position: relative; contain: content;
  width: 100%; height: 100%; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.cs { --accent: #7C5CFF; --plat: #9146FF; --plat-ink: #fff; --name-size: clamp(14px, 7.5cqmin, 30px);
  position: absolute; inset: 0; display: block; overflow: hidden; border-radius: 12px; container-type: size;
  color: #F5F5FA; text-decoration: none; cursor: pointer; isolation: isolate;
  font: 500 14px/1.35 Inter, "Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Roboto, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; background: #0E0E16; text-align: left;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.cs:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
.bg, .bg-img, video.bg-video, .shade { position: absolute; inset: 0; z-index: -1; }
.bg { background:
  radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 60%),
  radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--plat) 35%, transparent) 0%, transparent 65%),
  linear-gradient(160deg, #15151F, #0B0B12); }
.bg-img { background-size: cover; background-position: center; }
video.bg-video { width: 100%; height: 100%; object-fit: cover; }
.shade { background: linear-gradient(180deg, rgba(8,8,14,.15) 0%, rgba(8,8,14,.55) 45%, rgba(8,8,14,.92) 100%); }

.content { position: relative; height: 100%; display: flex; gap: clamp(8px, 4cqmin, 18px);
  padding: clamp(10px, 6cqmin, 24px); }
.avatar { position: relative; flex: none; width: clamp(36px, 26cqmin, 96px); aspect-ratio: 1; border-radius: 50%;
  padding: 3px; background: conic-gradient(from 200deg, var(--accent), var(--plat), var(--accent)); container-type: inline-size; }
.avatar img, .avatar .mono { width: 100%; height: 100%; border-radius: 50%; display: block; object-fit: cover;
  border: 2px solid #0E0E16; }
.avatar .mono { display: grid; place-items: center; font-weight: 800; letter-spacing: .02em; color: #fff;
  font-size: 36cqi;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 40%, #000)); }
.plat-dot { position: absolute; right: -2px; bottom: -2px; width: 42%; max-width: 26px; min-width: 16px; aspect-ratio: 1;
  border-radius: 50%; display: grid; place-items: center; background: var(--plat); color: var(--plat-ink);
  border: 2px solid #0E0E16; }
.plat-dot svg { width: 64%; height: 64%; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em;
  text-transform: uppercase; color: rgba(245,245,250,.72); white-space: nowrap; overflow: hidden; }
.eyebrow svg { width: 13px; height: 13px; color: var(--plat); flex: none; }
.live-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 5px;
  background: #E91916; color: #fff; letter-spacing: .08em; }
.live-pill i { width: 6px; height: 6px; border-radius: 50%; background: #fff; }
.name { font-size: var(--name-size); font-weight: 800; line-height: 1.1; letter-spacing: -.01em; color: #fff;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.name.wrap { white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.headline { font-size: clamp(12px, 5.2cqmin, 19px); font-weight: 650; color: #fff; line-height: 1.25;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.msg { font-size: clamp(12px, 4.4cqmin, 15px); color: rgba(245,245,250,.78); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.cta { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;
  padding: clamp(6px, 2.6cqmin, 11px) clamp(10px, 4.5cqmin, 18px); border-radius: 999px;
  background: var(--plat); color: var(--plat-ink); font-weight: 750; font-size: clamp(12px, 4.4cqmin, 15px);
  box-shadow: 0 6px 18px -6px color-mix(in srgb, var(--plat) 70%, transparent); transition: transform .15s ease, filter .15s ease; }
.cta svg { width: 1.05em; height: 1.05em; }
.cs:hover .cta { transform: translateY(-1px); filter: brightness(1.08); }
.label { position: absolute; top: 6px; right: 8px; z-index: 2; font-size: 10px; font-weight: 600; letter-spacing: .04em;
  color: rgba(245,245,250,.75); background: rgba(8,8,14,.55); padding: 2px 6px; border-radius: 4px;
  backdrop-filter: blur(4px); white-space: nowrap; }

/* ---------- Layouts ---------- */
.card .content { flex-direction: column; justify-content: space-between; }
.card .content { padding-top: 28px; }
.card .top { display: flex; gap: clamp(8px, 4cqmin, 14px); align-items: center; min-width: 0; }
.card .text { flex: 1; }
.card .name { font-size: clamp(15px, 8cqmin, 24px); }
.card .headline { font-size: clamp(14px, 6.4cqmin, 20px); }
.card .msg, .card .cta { font-size: clamp(13px, 5.4cqmin, 16px); }
.card .avatar { width: clamp(40px, 22cqmin, 72px); }
.card .body { display: flex; flex-direction: column; gap: 6px; min-height: 0; }

.tall .content { flex-direction: column; align-items: center; text-align: center; justify-content: center; gap: clamp(10px, 5cqw, 18px);
  padding-top: 30px; }
.tall .top { display: flex; flex-direction: column; align-items: center; gap: 10px; min-width: 0; width: 100%; }
.tall .avatar { width: clamp(56px, 52cqw, 120px); }
.tall .text, .tall .body { align-items: center; text-align: center; }
.tall .body { display: flex; flex-direction: column; gap: 8px; }
.tall .cta { align-self: center; padding-left: 12px; padding-right: 12px; max-width: 100%; white-space: normal; text-align: center; justify-content: center; }
.tall .text { width: 100%; }
.tall .name { font-size: clamp(14px, 12cqw, 26px); }
.tall .msg { -webkit-line-clamp: 6; }
.tall .headline { -webkit-line-clamp: 4; font-size: clamp(13px, 9cqw, 20px); }

.wide .content { max-width: 1240px; margin: 0 auto; align-items: center; gap: clamp(14px, 4cqw, 36px); padding: clamp(16px, 7cqh, 40px); }
.wide .avatar { width: clamp(72px, 50cqh, 150px); }
.wide .top { display: contents; }
.wide .text { flex: 0 1 auto; max-width: 38%; }
.wide .body { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
.wide .name { font-size: clamp(20px, 12cqh, 34px); }
.wide .headline { font-size: clamp(15px, 8cqh, 24px); }
.wide .msg { font-size: clamp(13px, 5.5cqh, 17px); }
.wide .cta { align-self: center; font-size: clamp(13px, 6cqh, 17px); }
.wide .cols { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }

.strip .content { align-items: center; padding: 6px clamp(8px, 2cqw, 16px); gap: clamp(8px, 1.6cqw, 16px); }
.strip .avatar { width: clamp(34px, 72cqh, 72px); padding: 2px; }
.strip .top { display: contents; }
.strip .text { flex: none; max-width: 38%; gap: 1px; }
.strip .body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.strip .name { font-size: clamp(13px, 26cqh, 22px); }
.strip .eyebrow { font-size: 10px; }
.strip .headline { -webkit-line-clamp: 1; font-size: clamp(12px, 20cqh, 17px); }
.strip .msg { -webkit-line-clamp: 1; font-size: clamp(11px, 15cqh, 14px); }
.strip .cta { align-self: center; flex: none; font-size: clamp(11px, 17cqh, 14px); padding: 6px 12px; }
.strip .label { top: auto; bottom: 3px; right: 6px; font-size: 9px; padding: 1px 5px; }
.strip-sm .body, .strip-sm .label { display: none; }
.strip-sm .text { flex: 1; max-width: none; }
.strip-sm .eyebrow { font-size: 10px; letter-spacing: .04em; }
.strip-sm .plat-dot { display: none; }
@container (max-width: 420px) { .strip .msg { display: none; } .strip .text { max-width: 45%; } }
@container (max-width: 340px) { .strip .body { display: none; } .strip .text { max-width: none; flex: 1; } }
@container (max-height: 200px) { .card .msg { display: none; } .card .eyebrow { display: none; } }
@container (max-height: 150px) { .card .headline { -webkit-line-clamp: 1; } }
@container (max-height: 290px) { .card .msg { -webkit-line-clamp: 2; } }
@container (max-width: 220px) { .card .top { padding-right: 0; padding-top: 14px; } }

/* ---------- Formats ---------- */
.f-gaming .bg { background:
  repeating-linear-gradient(115deg, rgba(255,255,255,.045) 0 2px, transparent 2px 18px),
  radial-gradient(80% 120% at 100% 0%, color-mix(in srgb, var(--plat) 70%, transparent), transparent 60%),
  linear-gradient(135deg, color-mix(in srgb, var(--accent) 85%, #000) 0%, #1A0B3D 55%, #07070C 100%); }
.f-gaming .name { text-transform: uppercase; letter-spacing: .01em; font-weight: 900; font-style: italic; padding-right: .15em; }
.f-gaming .cta { border-radius: 8px; transform: skewX(-6deg); }
.f-gaming:hover .cta { transform: skewX(-6deg) translateY(-1px); }

.f-live .bg { background:
  radial-gradient(100% 100% at 0% 100%, color-mix(in srgb, var(--plat) 55%, transparent), transparent 60%),
  linear-gradient(200deg, #1B1230, #0A0A10); }
.f-live.is-live { box-shadow: inset 0 0 0 2px #E91916; }

.f-motion::before { content: ""; position: absolute; inset: -50%; z-index: -2;
  background: conic-gradient(from 0deg, var(--accent), var(--plat), #FBBF24, var(--accent)); }
.f-motion .bg { inset: 2px; border-radius: inherit;
  background: radial-gradient(90% 90% at 50% 0%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 70%), #0E0E16; }
.f-motion .cta { background-image: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.35) 50%, transparent 65%);
  background-size: 250% 100%; background-color: var(--plat); }

.f-video .bg { display: none; }

/* ---------- Motion (respects user + OS preferences) ---------- */
.anim .content { animation: cs-in .5s cubic-bezier(.2,.8,.2,1) both; }
.anim .live-pill i { animation: cs-pulse 1.4s ease-in-out infinite; }
.anim.f-motion::before { animation: cs-spin 6s linear infinite; }
.anim.f-motion .cta { animation: cs-shine 3.2s ease-in-out infinite; }
.anim.f-motion .avatar, .anim.f-spotlight .avatar { animation: cs-float 5s ease-in-out infinite; }
.anim.f-gaming .bg { animation: cs-drift 14s linear infinite; background-size: 140% 140%; }
@keyframes cs-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes cs-pulse { 50% { opacity: .35; } }
@keyframes cs-spin { to { transform: rotate(360deg); } }
@keyframes cs-shine { 0%, 60% { background-position: 120% 0; } 100% { background-position: -60% 0; } }
@keyframes cs-float { 50% { transform: translateY(-3px); } }
@keyframes cs-drift { to { background-position: 140% 0; } }
@media (prefers-reduced-motion: reduce) { .anim *, .anim::before, .anim .bg { animation: none !important; } }
`;

  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3 1.4-1.4Z"/></svg>';

  /** Build the promotion markup. `p` is the payload produced by the background service. */
  function html(p, w, h) {
    const layout = layoutFor(w, h);
    const plat = CS.platforms.get(p.platform.type);
    const isLive = !!(p.live && p.live.live);
    const format = p.campaign.format === 'video' && !p.campaign.videoUrl ? 'gaming' : p.campaign.format;
    const verb = p.campaign.cta || (format === 'live' && isLive ? 'Watch live' : format === 'spotlight' ? plat.followVerb : plat.verb);

    let eyebrow = plat.icon ? CS.platforms.icon(plat.id, 13) + '<span>' + esc(plat.label) + (p.creator.category ? ' · ' + esc(p.creator.category) : '') + '</span>' : '';
    if (isLive) eyebrow = '<span class="live-pill"><i></i>LIVE</span><span>on ' + esc(plat.label) + '</span>';
    // Tiny banners have no room for the corner label, so the disclosure moves into the text.
    if (layout.includes('strip-sm')) eyebrow = (isLive ? '<span class="live-pill"><i></i>LIVE</span>' : '') + '<span>Creator promo</span>';

    let headline = p.campaign.headline;
    let message = p.campaign.message || p.creator.bio;
    if (format === 'live' && isLive) {
      headline = p.live.title || headline;
      message = p.live.game ? 'Playing ' + p.live.game : message;
    }

    const avatar = p.creator.avatarUrl
      ? '<img alt="" src="' + esc(p.creator.avatarUrl) + '">'
      : '<span class="mono">' + esc(CS.initials(p.creator.name)) + '</span>';

    let media = '<div class="bg"></div>';
    if (format === 'video') media = '<video class="bg-video" muted loop playsinline preload="metadata" src="' + esc(p.campaign.videoUrl) + '"></video><div class="shade"></div>';
    else if (p.campaign.imageUrl) media = '<div class="bg"></div><div class="bg-img" style="background-image:url(&quot;' + esc(p.campaign.imageUrl) + '&quot;)"></div><div class="shade"></div>';

    const classes = ['cs', 'f-' + format, layout, isLive ? 'is-live' : '', p.animations ? 'anim' : ''].join(' ');
    const label = p.label || 'Creator promo · CreatorSpot';
    const aria = p.creator.name + ' on ' + plat.label + '. ' + (headline || '') + ' ' + label;

    return (
      '<style>' + CSS + '</style>' +
      '<a class="' + classes + '" href="' + esc(p.platform.url) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(aria) + '"' +
      ' style="--accent:' + esc(p.creator.accent) + ';--plat:' + plat.color + ';--plat-ink:' + readableOn(plat.color) + '">' +
      media +
      '<span class="label">' + label + '</span>' +
      '<div class="content">' +
      '<div class="top"><div class="avatar">' + avatar + '<span class="plat-dot">' + CS.platforms.icon(plat.id, 14) + '</span></div>' +
      '<div class="text"><div class="eyebrow">' + eyebrow + '</div><div class="name">' + esc(p.creator.name) + '</div></div></div>' +
      '<div class="body">' +
      (headline ? '<div class="headline">' + esc(headline) + '</div>' : '') +
      (message ? '<div class="msg">' + esc(message) + '</div>' : '') +
      '</div>' +
      '<span class="cta">' + esc(verb) + ARROW + '</span>' +
      '</div></a>'
    );
  }

  /** Shrink the creator name until it fits on one line (never below 12px); wrap to two lines if it still doesn't. */
  function fitName(shadow) {
    const name = shadow.querySelector('.name');
    if (!name || !name.clientWidth) return;
    name.classList.remove('wrap');
    name.style.fontSize = '';
    let size = parseFloat(getComputedStyle(name).fontSize);
    // Measure the laid-out text itself (ellipsis is paint-only, so this is the true width).
    const range = document.createRange();
    range.selectNodeContents(name);
    const over = () => {
      const cs = getComputedStyle(name);
      const avail = name.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return range.getBoundingClientRect().width > avail + 0.5;
    };
    for (let i = 0; i < 40 && over() && size > 12; i++) {
      size -= 1;
      name.style.fontSize = size + 'px';
    }
    if (over()) name.classList.add('wrap');
  }

  /** Render into a host element. Returns {shadow, relayout(w,h)}. */
  function mount(host, payload, size) {
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    let w = size.w;
    let h = size.h;
    let videoObserver = null;
    function paint() {
      shadow.innerHTML = html(payload, w, h);
      const img = shadow.querySelector('.avatar img');
      if (img) {
        img.addEventListener('error', () => {
          const mono = document.createElement('span');
          mono.className = 'mono';
          mono.textContent = CS.initials(payload.creator.name);
          img.replaceWith(mono);
        });
      }
      const video = shadow.querySelector('video');
      if (videoObserver) videoObserver.disconnect();
      if (video && 'IntersectionObserver' in root) {
        videoObserver = new IntersectionObserver((entries) => {
          entries.forEach((e) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause()));
        });
        videoObserver.observe(host);
      }
      fitName(shadow);
    }
    paint();
    return {
      shadow,
      relayout(nw, nh) {
        if (layoutFor(nw, nh) !== layoutFor(w, h)) {
          w = nw;
          h = nh;
          paint();
        } else {
          fitName(shadow);
        }
      },
    };
  }

  CS.render = { mount, html, layoutFor, CSS };
})(typeof globalThis !== 'undefined' ? globalThis : self);

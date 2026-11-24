(function () {
  'use strict';
  const CS = globalThis.CreatorSpot;
  const { ui, api, store } = CS;
  const esc = CS.escapeHtml;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let view = $('#view');

  const SIZES = [
    { id: '300x250', w: 300, h: 250, label: 'Rectangle' },
    { id: '728x90', w: 728, h: 90, label: 'Leaderboard' },
    { id: '160x600', w: 160, h: 600, label: 'Skyscraper' },
    { id: '970x250', w: 970, h: 250, label: 'Billboard' },
    { id: '320x50', w: 320, h: 50, label: 'Mobile banner' },
  ];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const PRIORITY = { 1: 'Lowest', 2: 'Low', 3: 'Normal', 4: 'High', 5: 'Highest' };

  let S = { settings: null, creators: [], campaigns: [], stats: {} };
  let current = 'overview';
  let overviewTimer = null;

  async function reload() {
    const all = await store.getAll();
    S = Object.assign(all, { stats: await store.getStats() });
    ui.applyTheme(S.settings.theme);
    renderSideStatus();
  }

  const creatorById = (id) => S.creators.find((c) => c.id === id);
  // Creators with a CreatorSpot account (and the featured creators) are synced: everyone sees the same
  // profile, and only its owner can change it, after signing in with Twitch.
  const synced = (c) => !!c && (!!c.cloudId || !!c.featured);
  const mine = (c) => !!c && !!c.cloudId && !!c.isOwn;
  const locked = (cp) => {
    const c = creatorById(cp.creatorId);
    return synced(c) && !mine(c);
  };

  /** Save creators and campaigns. Changes to your own synced profile are saved online first, for everyone. */
  async function persist(creators, campaigns) {
    const me = creators.find(mine);
    if (me) {
      const before = JSON.stringify([S.creators.find((c) => c.id === me.id), S.campaigns.filter((x) => x.creatorId === me.id)]);
      const after = JSON.stringify([me, campaigns.filter((x) => x.creatorId === me.id)]);
      if (before !== after) {
        const r = await api.runtime.sendMessage({ type: 'cloud-save', creator: me, campaigns }).catch(() => null);
        if (!r || r.ok === false) {
          ui.toast('Could not save online: ' + ((r && r.message) || 'check your internet connection.'), true);
          return false;
        }
      }
    }
    await store.saveProfiles(creators, campaigns);
    return true;
  }

  function renderSideStatus() {
    const on = S.settings.enabled;
    const mode = CS.MODES.find((m) => m.id === S.settings.mode);
    $('#sideStatus').innerHTML =
      '<span class="badge ' + (on ? 'ok' : 'warn') + '"><span class="pip"></span>' + (on ? 'Active' : 'Paused') + '</span>' +
      '<div class="subtle" style="margin-top:8px">Mode: ' + esc(mode.label) + '</div>';
  }

  // ---------- Previews ----------
  async function previewInto(container, creator, campaign, w, h, maxW) {
    const payload = await CS.buildPayload(creator, campaign, S.settings, ui.media.bind(ui), null);
    container.innerHTML = '';
    if (!payload) {
      container.innerHTML = '<div class="subtle">Add a valid platform link to preview this campaign.</div>';
      return;
    }
    const scale = Math.min(1, (maxW || w) / w);
    const outer = document.createElement('div');
    outer.className = 'preview-box';
    outer.style.cssText = 'width:' + w * scale + 'px;height:' + h * scale + 'px;';
    const host = document.createElement('div');
    host.style.cssText = 'width:' + w + 'px;height:' + h + 'px;transform:scale(' + scale + ');transform-origin:0 0;';
    outer.appendChild(host);
    container.appendChild(outer);
    const mounted = CS.render.mount(host, payload, { w, h });
    // Previews should not navigate away from the dashboard by accident.
    mounted.shadow.addEventListener('click', (e) => e.preventDefault());
  }

  // ---------- Dialog helpers ----------
  function confirmDialog(title, text, okLabel) {
    const d = $('#confirm');
    $('#confirmTitle').textContent = title;
    $('#confirmText').textContent = text;
    $('#confirmOk').textContent = okLabel || 'Confirm';
    d.returnValue = '';
    d.showModal();
    return new Promise((resolve) => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
  }

  let editorSave = null;
  function openEditor(title, html, onMount, onSave, saveLabel) {
    const d = $('#editor');
    $('#editorTitle').textContent = title;
    $('#editorBody').innerHTML = html;
    $('#editorSave').textContent = saveLabel || 'Save';
    editorSave = onSave;
    d.showModal();
    onMount($('#editorBody'));
    const first = $('#editorBody input:not([type=hidden]):not([type=file]), #editorBody select, #editorBody textarea');
    if (first) first.focus();
  }
  $('#editorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = e.submitter ? e.submitter.value : 'save';
    if (action !== 'save') return $('#editor').close();
    try {
      const ok = await editorSave($('#editorBody'));
      if (ok !== false) $('#editor').close();
    } catch (err) {
      ui.toast(err.message || 'Something went wrong.', true);
    }
  });
  $('#editor').addEventListener('close', () => {
    if (/\/new$/.test(location.hash)) history.replaceState(null, '', location.hash.replace(/\/new$/, ''));
  });

  // ---------- Overview ----------
  function totals(days) {
    const cutoff = CS.dayKey(Date.now() - (days - 1) * 86400000);
    let i = 0;
    let c = 0;
    Object.entries(S.stats).forEach(([day, rows]) => {
      if (day < cutoff) return;
      Object.values(rows).forEach((r) => {
        i += r.i;
        c += r.c;
      });
    });
    return { i, c };
  }

  function activePool() {
    return CS.rotation.effectivePool(S.settings, S.creators, S.campaigns, Date.now()).pool;
  }

  async function renderOverview() {
    const t = totals(7);
    const pool = activePool();
    const live = S.campaigns.filter((c) => c.enabled);
    view.innerHTML =
      '<div class="page-head"><div><h1>Overview</h1><p class="muted">Your creator promotions at a glance.</p></div></div>' +
      '<section class="card hero"><div>' +
      '<span class="badge ' + (S.settings.enabled ? 'ok' : 'warn') + '"><span class="pip"></span>' + (S.settings.enabled ? 'Promotions are active' : 'CreatorSpot is paused') + '</span>' +
      '<h2 style="margin-top:14px">Ad slots, turned into <span class="grad-text">creator spotlights</span>.</h2>' +
      '<p class="muted" style="margin-top:10px">CreatorSpot finds standard ad placements on the sites you visit and shows promotions for independent creators instead. ' +
      (pool.length ? 'Right now, ' + pool.length + (pool.length === 1 ? ' creator is' : ' creators are') + ' in your rotation.' : 'Add a creator and a campaign to get started.') + '</p>' +
      '<div class="actions"><a class="btn primary" href="#campaigns/new">' + ui.icon('plus') + 'New campaign</a><a class="btn" href="#creators/new">Add creator</a><a class="btn ghost" href="#rotation">Rotation settings</a></div>' +
      '</div><div class="preview-stage"><div id="ovPreview"></div><div class="preview-caption" id="ovCaption"></div></div></section>' +
      '<section class="section kpis">' +
      kpi('eye', 'Displays (7 days)', ui.number(t.i)) +
      kpi('cursor', 'Clicks (7 days)', ui.number(t.c)) +
      kpi('chart', 'Click rate', ui.percent(t.c, t.i)) +
      kpi('megaphone', 'Active campaigns', ui.number(live.length)) +
      '</section>' +
      '<section class="section"><h3>In your rotation</h3><div class="creator-grid" id="ovPool"></div></section>';

    const poolEl = $('#ovPool');
    if (!pool.length) poolEl.outerHTML = '<div class="empty"><h3>No one is in rotation yet</h3><p>Add a creator profile and give it an active campaign.</p></div>';
    else {
      poolEl.innerHTML = (await Promise.all(pool.map(async (p) => creatorCard(p.creator, true)))).join('');
    }

    // Cycle through active campaigns in the hero preview.
    const list = live.filter((c) => creatorById(c.creatorId));
    let idx = 0;
    const show = async () => {
      if (current !== 'overview' || !list.length || !$('#ovPreview')) return;
      const camp = list[idx % list.length];
      const cr = creatorById(camp.creatorId);
      await previewInto($('#ovPreview'), cr, camp, 336, 280, 336);
      $('#ovCaption').textContent = 'Preview: ' + cr.name + ' · ' + (CS.FORMATS.find((f) => f.id === camp.format) || {}).label;
      idx += 1;
    };
    clearInterval(overviewTimer);
    if (list.length) {
      await show();
      overviewTimer = setInterval(show, 4500);
    } else {
      $('#ovPreview').innerHTML = '<div class="empty" style="width:336px">No active campaigns to preview.</div>';
    }
  }

  function kpi(icon, label, value) {
    return '<div class="card kpi"><div class="label">' + ui.icon(icon) + esc(label) + '</div><div class="value">' + esc(value) + '</div></div>';
  }

  // ---------- Creators ----------
  async function creatorCard(c, compact) {
    const camps = S.campaigns.filter((x) => x.creatorId === c.id);
    const links = c.platforms
      .map((p) => '<a class="link-chip" href="' + esc(p.url) + '" target="_blank" rel="noopener noreferrer">' + CS.platforms.icon(p.type, 14) + esc(p.handle || CS.platforms.get(p.type).label) + '</a>')
      .join('');
    const badges = [
      c.isOwn ? '<span class="badge brand">You</span>' : '',
      c.participates ? '<span class="badge">In rotation</span>' : '<span class="badge warn">Not in rotation</span>',
    ].join('');
    const featuredBadge = c.featured ? '<span class="badge brand">Featured</span>' : '';
    return (
      '<article class="card creator-card" data-id="' + esc(c.id) + '">' +
      '<div class="head">' + ui.avatar(c, await ui.media(c.avatar), 'lg') +
      '<div class="grow"><div class="name">' + esc(c.name) + '</div><div class="row wrap" style="gap:6px;margin-top:6px">' + featuredBadge + badges + '</div></div></div>' +
      '<p class="bio">' + esc(c.bio || 'No bio yet.') + '</p>' +
      '<div class="links">' + links + '</div>' +
      (compact
        ? ''
        : '<div class="subtle">' + camps.length + (camps.length === 1 ? ' campaign' : ' campaigns') + ' · ' + esc(c.category) + '</div>' +
          (mine(c)
            ? '<div class="card-actions"><button class="btn sm primary" data-edit="' + esc(c.id) + '">' + ui.icon('edit') + 'Edit my profile</button>' +
              tiktokButton(c) +
              '<a class="btn sm" href="#campaigns/new?creator=' + encodeURIComponent(c.id) + '">' + ui.icon('plus') + 'Campaign</a>' +
              '<span class="subtle" style="margin-left:auto">Synced to everyone</span></div>'
            : synced(c)
            ? '<div class="card-actions"><span class="subtle">' + (c.featured ? 'Featured · synced from CreatorSpot' : 'Synced from CreatorSpot') + '</span>' +
              (account && account.featured && !c.featured && c.cloudId
                ? '<button class="btn sm ghost danger" data-hide="' + esc(c.cloudId) + '" data-name="' + esc(c.name) + '" style="margin-left:auto">' + ui.icon('trash') + 'Remove from CreatorSpot</button>'
                : '') + '</div>'
            : '<div class="card-actions"><button class="btn sm" data-edit="' + esc(c.id) + '">' + ui.icon('edit') + 'Edit</button>' + tiktokButton(c) +
              '<a class="btn sm" href="#campaigns/new?creator=' + encodeURIComponent(c.id) + '">' + ui.icon('plus') + 'Campaign</a>' +
              '<button class="btn sm ghost danger" data-remove="' + esc(c.id) + '" style="margin-left:auto">' + ui.icon('trash') + 'Remove</button></div>')) +
      '</article>'
    );
  }

  async function renderCreators() {
    view.innerHTML =
      '<div class="page-head"><div><h1>Creators</h1><p class="muted">Profiles that can appear in promotions. Each one can link to several platforms.</p></div>' +
      '<button class="btn primary" id="addCreator">' + ui.icon('plus') + 'Add creator</button></div>' +
      '<div class="card account-card" id="accountCard" style="margin-bottom:16px"></div>' +
      '<div class="creator-grid" id="creatorGrid"></div>';
    await loadAccount();
    renderAccountCard();
    const grid = $('#creatorGrid');
    if (!S.creators.length) {
      grid.outerHTML = '<div class="empty"><h3>No creators yet</h3><p>Add your own channel, or creators you want to support.</p></div>';
    } else {
      grid.innerHTML = (await Promise.all(S.creators.map((c) => creatorCard(c, false)))).join('');
    }
    $('#addCreator').addEventListener('click', () => editCreator(null));
    view.addEventListener('click', onCreatorAction);
  }

  // ---------- Account (Sign in with Twitch) ----------
  let account = null;
  let syncMeta = {};
  async function loadAccount() {
    const r = await api.runtime.sendMessage({ type: 'account' }).catch(() => null);
    account = (r && r.account) || null;
    syncMeta = (r && r.meta) || {};
  }

  function renderAccountCard() {
    const box = $('#accountCard');
    if (!box) return;
    const when = syncMeta.syncedAt ? new Date(syncMeta.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'not yet';
    const status =
      '<div class="subtle" style="margin-top:6px">' + (syncMeta.count ? syncMeta.count + ' creators on CreatorSpot · ' : '') + 'Last synced: ' + esc(when) +
      (syncMeta.ok === false ? ' · <span class="badge warn">Could not connect</span>' : '') + '</div>';
    box.innerHTML = account
      ? '<div class="row wrap" style="gap:12px;align-items:center"><div class="grow"><strong>Signed in as ' + esc(account.name || account.login) + '</strong>' +
        (account.featured ? ' <span class="badge brand">Admin</span>' : '') +
        '<div class="muted">Your profile, campaigns and pictures sync to everyone who uses CreatorSpot. Changes show up for others within a few minutes.</div>' + status + '</div>' +
        '<button class="btn sm" id="syncNow">Sync now</button>' +
        (account.featured ? '<button class="btn sm" id="removedList">Removed creators</button>' : '') +
        '<button class="btn sm ghost" id="signOut">Sign out</button></div>'
      : '<div class="row wrap" style="gap:12px;align-items:center"><div class="grow"><strong>Join CreatorSpot</strong>' +
        '<div class="muted">Sign in with Twitch to put your channel in everyone\'s rotation. Your profile, campaigns and pictures sync to every CreatorSpot.</div>' + status + '</div>' +
        '<button class="btn sm" id="syncNow">Sync now</button>' +
        '<button class="btn primary" id="signIn">' + CS.platforms.icon('twitch', 16) + 'Sign in with Twitch</button></div>';
    const on = (id, fn) => $(id) && $(id).addEventListener('click', fn);
    on('#signIn', async () => {
      $('#signIn').disabled = true;
      const r = await api.runtime.sendMessage({ type: 'sign-in' }).catch((e) => ({ ok: false, message: String(e && e.message) }));
      await reload();
      if (r && r.ok) ui.toast('Signed in. Welcome to CreatorSpot, ' + (r.account.name || r.account.login) + '!');
      else ui.toast((r && r.message) || 'Sign-in did not finish.', true);
      route();
    });
    on('#signOut', async () => {
      if (!(await confirmDialog('Sign out?', 'Your profile stays on CreatorSpot. You can sign back in any time to change it.', 'Sign out'))) return;
      await api.runtime.sendMessage({ type: 'sign-out' }).catch(() => null);
      await reload();
      ui.toast('Signed out.');
      route();
    });
    on('#syncNow', async () => {
      $('#syncNow').disabled = true;
      const r = await api.runtime.sendMessage({ type: 'sync-now' }).catch(() => null);
      await reload();
      ui.toast(r && r.sync && r.sync.ok ? 'Everything is up to date.' : 'Could not connect. Try again later.', !(r && r.sync && r.sync.ok));
      route();
    });
    on('#removedList', showRemoved);
  }

  async function showRemoved() {
    const r = await api.runtime.sendMessage({ type: 'admin-list' }).catch(() => null);
    if (!r || !r.ok) return ui.toast((r && r.message) || 'Could not load the list.', true);
    const rows = r.list.length
      ? r.list.map((x) => '<div class="row between" style="padding:8px 0"><span>' + esc(x.name) + ' <span class="subtle">twitch.tv/' + esc(x.twitch_login) + '</span></span><button class="btn sm" data-restore="' + esc(x.id) + '">Restore</button></div>').join('')
      : '<p class="muted">Nobody has been removed.</p>';
    openEditor('Removed creators', '<div class="stack">' + rows + '</div>', (body) => {
      body.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-restore]');
        if (!b) return;
        b.disabled = true;
        const res = await api.runtime.sendMessage({ type: 'admin-hide', cloudId: b.dataset.restore, value: false }).catch(() => null);
        if (res && res.ok) {
          b.textContent = 'Restored';
          await reload();
        } else ui.toast((res && res.message) || 'Could not restore.', true);
      });
    }, async () => {
      route();
    }, 'Done');
  }

  // ---------- My TikToks: pick the TikToks that play behind a creator's promos ----------
  const tiktoksOf = (creatorId) => [...new Set(S.campaigns.filter((cp) => cp.creatorId === creatorId).flatMap((cp) => cp.tiktok || []))];
  function tiktokButton(c) {
    const n = tiktoksOf(c.id).length;
    return '<button class="btn sm" data-tiktoks="' + esc(c.id) + '">' + CS.platforms.icon('tiktok', 14) + 'My TikToks' + (n ? ' (' + n + ')' : '') + '</button>';
  }

  function editTikToks(c) {
    let ids = tiktoksOf(c.id);
    const html =
      '<p class="muted" style="margin-bottom:6px">Pick the TikToks that play behind your promos. They play muted, and viewers can tap a button to turn the sound on.</p>' +
      '<div class="tt-steps"><span>1. Open a TikTok on tiktok.com</span><span>2. Click <b>Share</b>, then <b>Copy link</b></span><span>3. Paste it here and click <b>Add</b></span></div>' +
      '<div class="tt-add"><input class="input" id="ttLink" placeholder="https://www.tiktok.com/@yourname/video/7312345678901234567" autocomplete="off"><button type="button" class="btn primary" id="ttAddBtn">' + ui.icon('plus') + 'Add</button></div>' +
      '<span class="error-text hidden" id="ttErr"></span>' +
      '<div id="ttList"></div>';
    openEditor('My TikToks', html, (body) => {
      const list = $('#ttList', body);
      const err = $('#ttErr', body);
      const draw = () => {
        list.innerHTML = ids.length
          ? '<div class="tt-grid">' + ids.map((id) =>
              '<div class="tt-tile"><iframe allow="autoplay; encrypted-media" title="TikTok video" src="' + esc(CS.tiktok.playerUrl(id)) + '"></iframe>' +
              '<button type="button" class="tt-remove" data-ttremove="' + esc(id) + '" aria-label="Remove this TikTok" title="Remove">\u2715</button></div>').join('') + '</div>'
          : '<div class="tt-empty">No TikToks yet. Paste a link above and they show up here, playing.</div>';
      };
      const add = () => {
        const input = $('#ttLink', body);
        const found = input.value.split(/\s+/).filter(Boolean).map((x) => CS.tiktok.idFrom(x));
        const good = found.filter(Boolean);
        err.classList.toggle('hidden', good.length > 0 || !input.value.trim());
        if (!good.length) {
          if (input.value.trim()) err.textContent = 'That is not a TikTok video link. On tiktok.com, open the video, click Share, then Copy link. (Short vm.tiktok.com links from the phone app do not work. Open the video in your browser instead.)';
          return;
        }
        ids = [...new Set(ids.concat(good))].slice(0, 10);
        if (ids.length === 10) ui.toast('You can pick up to 10 TikToks.');
        input.value = '';
        draw();
      };
      $('#ttAddBtn', body).addEventListener('click', add);
      $('#ttLink', body).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      });
      list.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-ttremove]');
        if (!rm) return;
        ids = ids.filter((x) => x !== rm.dataset.ttremove);
        draw();
      });
      draw();
    }, async () => {
      let campaigns = S.campaigns.map((cp) => (cp.creatorId === c.id ? Object.assign({}, cp, { tiktok: ids.slice() }) : cp));
      if (!campaigns.some((cp) => cp.creatorId === c.id)) {
        campaigns = campaigns.concat({ id: CS.uid('cp'), creatorId: c.id, name: 'My TikToks', headline: 'Come watch me!', message: c.bio || '', format: 'spotlight', platformIndex: 0, priority: 3, enabled: true, schedule: { start: '', end: '', days: [] }, media: {}, tiktok: ids.slice() });
      }
      if (!(await persist(S.creators, campaigns))) return false;
      ui.toast(ids.length ? 'Saved. Your promos now play ' + (ids.length === 1 ? 'this TikTok.' : 'these ' + ids.length + ' TikToks.') : 'Saved. Your promos no longer play TikToks.');
      await reload();
      route();
    }, 'Save my TikToks');
  }

  async function onCreatorAction(e) {
    const hide = e.target.closest('[data-hide]');
    if (hide) {
      const ok = await confirmDialog('Remove ' + hide.dataset.name + ' from CreatorSpot?', 'Their promos stop showing for everyone within a few minutes. You can restore them later from "Removed creators".', 'Remove');
      if (!ok) return;
      const r = await api.runtime.sendMessage({ type: 'admin-hide', cloudId: hide.dataset.hide, value: true }).catch(() => null);
      if (!r || r.ok === false) return ui.toast((r && r.message) || 'Could not remove.', true);
      ui.toast(hide.dataset.name + ' was removed from CreatorSpot.');
      await reload();
      return route();
    }
    const tt = e.target.closest('[data-tiktoks]');
    if (tt) return editTikToks(creatorById(tt.dataset.tiktoks));
    const edit = e.target.closest('[data-edit]');
    const remove = e.target.closest('[data-remove]');
    if (edit) editCreator(creatorById(edit.dataset.edit));
    if (remove) {
      const c = creatorById(remove.dataset.remove);
      const n = S.campaigns.filter((x) => x.creatorId === c.id).length;
      const ok = await confirmDialog('Remove ' + c.name + '?', 'This removes the profile' + (n ? ' and its ' + n + (n === 1 ? ' campaign' : ' campaigns') : '') + '. Analytics already collected are kept.', 'Remove');
      if (!ok) return;
      await persist(S.creators.filter((x) => x.id !== c.id), S.campaigns.filter((x) => x.creatorId !== c.id));
      const settings = S.settings;
      await store.saveSettings({
        excluded: settings.excluded.filter((id) => id !== c.id),
        circle: Object.assign({}, settings.circle, { members: settings.circle.members.filter((id) => id !== c.id) }),
      });
      ui.toast(c.name + ' was removed.');
      await reload();
      route();
    }
  }

  function platformRow(p) {
    const opts = CS.platforms.all().map((x) => '<option value="' + x.id + '"' + (x.id === p.type ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('');
    return (
      '<div class="platform-row"><select class="input" data-ptype aria-label="Platform">' + opts + '</select>' +
      '<div><input class="input" data-purl type="url" placeholder="' + esc(CS.platforms.get(p.type).placeholder) + '" value="' + esc(p.url || '') + '" aria-label="Channel link"><div class="error-text hidden"></div></div>' +
      '<button type="button" class="btn icon ghost" data-premove aria-label="Remove link">' + ui.icon('trash') + '</button></div>'
    );
  }

  function editCreator(existing) {
    const c = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: '', name: '', avatar: null, accent: '#7C5CFF', category: 'Gaming', bio: '', isOwn: S.creators.every((x) => !x.isOwn), participates: true, weight: 1, platforms: [{ type: 'twitch', url: '' }] };
    const html =
      '<div class="form-grid">' +
      '<label class="field">Creator name<input class="input" name="name" maxlength="40" required value="' + esc(c.name) + '" placeholder="Your display name"><span class="error-text hidden" data-err="name"></span></label>' +
      '<label class="field">Category<input class="input" name="category" maxlength="30" value="' + esc(c.category) + '" placeholder="Gaming, Music, Art…"></label>' +
      '<label class="field full">Short bio<textarea class="input" name="bio" maxlength="160" placeholder="One or two sentences about what you create.">' + esc(c.bio) + '</textarea><span class="hint">Shown on promotions when a campaign has no message. Up to 160 characters.</span></label>' +
      '<div class="field full"><span>Profile picture</span><div class="upload"><span id="avPreview"></span>' +
      '<label class="btn sm">' + ui.icon('upload') + 'Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="avFile"></label>' +
      '<button type="button" class="btn sm ghost" id="avClear">Remove</button>' +
      '<label class="field" style="flex-direction:row;align-items:center;gap:8px;margin-left:auto">Accent color<input class="input" type="color" name="accent" value="' + esc(c.accent) + '" style="width:56px"></label></div>' +
      '<span class="hint">Square images work best. Without a picture, a monogram in your accent color is used.</span></div>' +
      '<div class="field full"><span>Channels and links</span><div class="platform-rows" id="pRows">' + c.platforms.map(platformRow).join('') + '</div>' +
      '<div><button type="button" class="btn sm" id="pAdd">' + ui.icon('plus') + 'Add another platform</button></div>' +
      '<span class="error-text hidden" data-err="platforms"></span>' +
      '<span class="hint">Paste a link and the platform is detected automatically. The first link is the default destination.</span></div>' +
      (c.cloudId ? '' : '<div class="toggle-line full"><div><div class="title">This is my channel</div><div class="desc">Used by “Promote myself” and “Mixed” modes.</div></div><label class="switch"><input type="checkbox" name="isOwn"' + (c.isOwn ? ' checked' : '') + '><span></span></label></div>' +
      '<div class="toggle-line full"><div><div class="title">Include in creator rotation</div><div class="desc">' + (c.featured ? 'Featured creators are always in the rotation.' : 'Lets this creator appear in the shared rotation.') + '</div></div><label class="switch"><input type="checkbox" name="participates"' + (c.participates || c.featured ? ' checked' : '') + (c.featured ? ' disabled' : '') + '><span></span></label></div>') +
      '</div>';

    openEditor(existing ? 'Edit creator' : 'Add creator', html, (body) => {
      const refreshAvatar = async () => {
        $('#avPreview', body).innerHTML = ui.avatar({ name: $('[name=name]', body).value || '?', accent: $('[name=accent]', body).value }, await ui.media(c.avatar), 'lg');
      };
      refreshAvatar();
      $('[name=name]', body).addEventListener('input', refreshAvatar);
      $('[name=accent]', body).addEventListener('input', refreshAvatar);
      $('#avFile', body).addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          c.avatar = await store.putMedia(await ui.readFile(file, 256));
          refreshAvatar();
        } catch (err) {
          ui.toast(err.message, true);
        }
      });
      $('#avClear', body).addEventListener('click', () => {
        c.avatar = null;
        refreshAvatar();
      });
      $('#pAdd', body).addEventListener('click', () => {
        if ($$('.platform-row', body).length >= 10) return ui.toast('You can add up to 10 links.', true);
        $('#pRows', body).insertAdjacentHTML('beforeend', platformRow({ type: 'youtube', url: '' }));
      });
      body.addEventListener('click', (e) => {
        const rm = e.target.closest('[data-premove]');
        if (rm) rm.closest('.platform-row').remove();
      });
      body.addEventListener('input', (e) => {
        if (!e.target.matches('[data-purl]')) return;
        const found = CS.platforms.detect(e.target.value);
        if (found && found.type !== 'website') e.target.closest('.platform-row').querySelector('[data-ptype]').value = found.type;
      });
      body.addEventListener('change', (e) => {
        if (e.target.matches('[data-ptype]')) e.target.closest('.platform-row').querySelector('[data-purl]').placeholder = CS.platforms.get(e.target.value).placeholder;
      });
    }, async (body) => {
      let valid = true;
      const setErr = (key, msg) => {
        const el = $('[data-err="' + key + '"]', body);
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
        if (msg) valid = false;
      };
      const name = $('[name=name]', body).value.trim();
      setErr('name', name ? '' : 'Enter a name for this creator.');
      $('[name=name]', body).setAttribute('aria-invalid', String(!name));
      const platforms = [];
      $$('.platform-row', body).forEach((row) => {
        const input = $('[data-purl]', row);
        const err = $('.error-text', row);
        if (!input.value.trim()) {
          row.remove();
          return;
        }
        const norm = CS.platforms.normalise({ type: $('[data-ptype]', row).value, url: input.value });
        err.textContent = norm ? '' : 'Enter a full link that starts with https://';
        err.classList.toggle('hidden', !!norm);
        input.setAttribute('aria-invalid', String(!norm));
        if (!norm) valid = false;
        else platforms.push(norm);
      });
      setErr('platforms', platforms.length || !valid ? '' : 'Add at least one channel link.');
      if (!valid) return false;

      const next = Object.assign(c, {
        id: c.id || CS.uid('cr'),
        name,
        category: $('[name=category]', body).value.trim() || 'Gaming',
        bio: $('[name=bio]', body).value.trim(),
        accent: $('[name=accent]', body).value,
        isOwn: c.cloudId ? true : $('[name=isOwn]', body).checked,
        participates: c.cloudId ? true : $('[name=participates]', body).checked,
        platforms,
      });
      const creators = existing ? S.creators.map((x) => (x.id === next.id ? next : x)) : S.creators.concat(next);
      // Keep campaign destinations valid if links were removed.
      const campaigns = S.campaigns.map((cp) => (cp.creatorId === next.id && cp.platformIndex >= platforms.length ? Object.assign({}, cp, { platformIndex: 0 }) : cp));
      if (!(await persist(creators, campaigns))) return false;
      ui.toast(existing ? 'Changes saved.' : name + ' was added.');
      await reload();
      if (!existing && !S.campaigns.some((x) => x.creatorId === next.id)) {
        setTimeout(() => editCampaign(null, next.id), 50);
      }
      route();
    }, existing ? 'Save changes' : 'Add creator');
  }

  // ---------- Campaigns ----------
  async function renderCampaigns() {
    view.innerHTML =
      '<div class="page-head"><div><h1>Campaigns</h1><p class="muted">Each campaign is one promotion design. Creators can have several, and they rotate automatically.</p></div>' +
      '<button class="btn primary" id="addCampaign"' + (S.creators.length ? '' : ' disabled') + '>' + ui.icon('plus') + 'New campaign</button></div>' +
      '<div class="campaign-list" id="campList"></div>';
    $('#addCampaign').addEventListener('click', () => editCampaign(null));
    const list = $('#campList');
    if (!S.campaigns.length) {
      list.outerHTML = '<div class="empty"><h3>No campaigns yet</h3><p>' + (S.creators.length ? 'Create a campaign to start promoting a creator.' : 'Add a creator first, then create a campaign for them.') + '</p></div>';
      return;
    }
    list.innerHTML = S.campaigns
      .map((cp) => {
        const cr = creatorById(cp.creatorId);
        const fmt = CS.FORMATS.find((f) => f.id === cp.format);
        const p = cr && (cr.platforms[cp.platformIndex] || cr.platforms[0]);
        const sched = scheduleText(cp);
        return (
          '<article class="card campaign-row' + (cp.enabled ? '' : ' off') + '" data-id="' + esc(cp.id) + '">' +
          '<div class="thumb" data-thumb="' + esc(cp.id) + '"></div>' +
          '<div><div class="title">' + esc(cp.name) + '</div><div class="muted" style="margin-top:4px">' + esc(cr ? cr.name : 'Unknown creator') + ' · ' + esc(cp.headline || 'No headline') + '</div>' +
          '<div class="meta"><span class="badge brand">' + esc(fmt.label) + '</span>' +
          (p ? '<span class="badge">' + CS.platforms.icon(p.type, 12) + esc(CS.platforms.get(p.type).label) + '</span>' : '') +
          '<span class="badge">Priority: ' + PRIORITY[cp.priority] + '</span>' + (sched ? '<span class="badge">' + esc(sched) + '</span>' : '') + '</div></div>' +
          '<div class="row-actions">' + (locked(cp) ? '<span class="badge brand">' + (cp.enabled ? 'On' : 'Paused') + '</span>' : '<label class="switch" title="' + (cp.enabled ? 'Enabled' : 'Disabled') + '"><input type="checkbox" data-toggle="' + esc(cp.id) + '"' + (cp.enabled ? ' checked' : '') + ' aria-label="Campaign enabled"><span></span></label>') +
          '<div class="row">' + (locked(cp) ? '<span class="subtle">Synced</span>' : '<button class="btn sm" data-cedit="' + esc(cp.id) + '">' + ui.icon('edit') + 'Edit</button>') + (locked(cp) ? '' : '<button class="btn sm ghost danger" data-cremove="' + esc(cp.id) + '" aria-label="Delete campaign">' + ui.icon('trash') + '</button>') + '</div></div>' +
          '</article>'
        );
      })
      .join('');
    for (const cp of S.campaigns) {
      const cr = creatorById(cp.creatorId);
      if (cr) previewInto($('[data-thumb="' + cp.id + '"]'), cr, cp, 300, 250, 180);
    }
    list.addEventListener('click', async (e) => {
      const ed = e.target.closest('[data-cedit]');
      const rm = e.target.closest('[data-cremove]');
      if (ed) editCampaign(S.campaigns.find((x) => x.id === ed.dataset.cedit));
      if (rm) {
        const cp = S.campaigns.find((x) => x.id === rm.dataset.cremove);
        if (!(await confirmDialog('Delete “' + cp.name + '”?', 'This campaign will stop appearing. This cannot be undone.', 'Delete'))) return;
        await persist(S.creators, S.campaigns.filter((x) => x.id !== cp.id));
        ui.toast('Campaign deleted.');
        await reload();
        route();
      }
    });
    list.addEventListener('change', async (e) => {
      const t = e.target.closest('[data-toggle]');
      if (!t) return;
      const campaigns = S.campaigns.map((x) => (x.id === t.dataset.toggle ? Object.assign({}, x, { enabled: t.checked }) : x));
      await persist(S.creators, campaigns);
      await reload();
      t.closest('.campaign-row').classList.toggle('off', !t.checked);
      ui.toast(t.checked ? 'Campaign enabled.' : 'Campaign paused.');
    });
  }

  function scheduleText(cp) {
    const s = cp.schedule || {};
    const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const parts = [];
    if (s.start && s.end) parts.push(fmt(s.start) + ' to ' + fmt(s.end));
    else if (s.start) parts.push('From ' + fmt(s.start));
    else if (s.end) parts.push('Until ' + fmt(s.end));
    if (s.days && s.days.length && s.days.length < 7) parts.push(s.days.slice().sort().map((d) => DAYS[d]).join(', '));
    return parts.join(' · ');
  }

  function editCampaign(existing, presetCreator) {
    if (!S.creators.length) return ui.toast('Add a creator before creating a campaign.', true);
    const cp = existing
      ? JSON.parse(JSON.stringify(existing))
      : { id: '', creatorId: presetCreator || (S.creators.find((c) => c.isOwn) || S.creators.find((c) => !synced(c)) || S.creators[0]).id, name: '', headline: '', message: '', cta: '', format: 'spotlight', platformIndex: 0, priority: 3, enabled: true, schedule: { start: '', end: '', days: [] }, media: {}, tiktok: [] };
    let size = SIZES[0];

    const creatorOpts = S.creators.filter((c) => !synced(c) || mine(c) || c.id === cp.creatorId).map((c) => '<option value="' + esc(c.id) + '"' + (c.id === cp.creatorId ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
    const formatCards = CS.FORMATS.map(
      (f) => '<button type="button" class="choice" role="radio" data-format="' + f.id + '" aria-checked="' + (f.id === cp.format) + '"><span class="title">' + esc(f.label) + '</span><span class="desc">' + esc(f.description) + '</span></button>'
    ).join('');
    const prioOpts = Object.entries(PRIORITY).map(([v, l]) => '<option value="' + v + '"' + (Number(v) === cp.priority ? ' selected' : '') + '>' + l + '</option>').join('');
    const dayChecks = DAYS.map((d, i) => '<label><input type="checkbox" value="' + i + '"' + ((cp.schedule.days || []).includes(i) ? ' checked' : '') + '><span>' + d + '</span></label>').join('');

    const html =
      '<div class="editor-split"><div class="stack lg">' +
      '<div class="form-grid">' +
      '<label class="field">Creator<select class="input" name="creatorId">' + creatorOpts + '</select></label>' +
      '<label class="field">Campaign name<input class="input" name="name" maxlength="50" value="' + esc(cp.name) + '" placeholder="For example: Weekend streams"><span class="hint">Only you see this name.</span></label>' +
      '<label class="field full">Headline<input class="input" name="headline" maxlength="60" value="' + esc(cp.headline) + '" placeholder="Watch me live on Twitch!"><span class="error-text hidden" data-err="headline"></span></label>' +
      '<label class="field full">Message<textarea class="input" name="message" maxlength="140" placeholder="Tell viewers what makes your channel worth a visit.">' + esc(cp.message) + '</textarea><span class="hint"><span id="msgCount">0</span>/140 characters</span></label>' +
      '<label class="field">Destination<select class="input" name="platformIndex"></select></label>' +
      '<label class="field">Button text<input class="input" name="cta" maxlength="24" value="' + esc(cp.cta) + '" placeholder="Automatic"><span class="hint">Leave blank to use the platform’s default, such as “Watch on Twitch”.</span></label>' +
      '</div>' +
      '<div class="field"><span>Format</span><div class="format-grid" role="radiogroup" aria-label="Format" id="formats">' + formatCards + '</div><span class="hint" id="formatHint"></span></div>' +
      '<div class="form-grid">' +
      '<div class="field"><span>Background image</span><div class="upload"><label class="btn sm">' + ui.icon('upload') + 'Upload<input type="file" accept="image/png,image/jpeg,image/webp" id="imgFile"></label><button type="button" class="btn sm ghost" id="imgClear">Remove</button><span class="subtle" id="imgName"></span></div><span class="hint">Optional. Used behind your text. Wide images look best.</span></div>' +
      '<label class="field full">Background TikTok videos<textarea class="input" name="tiktok" rows="3" placeholder="https://www.tiktok.com/@yourname/video/7312345678901234567">' + esc((cp.tiktok || []).map(CS.tiktok.videoUrl).join('\n')) + '</textarea>' +
      '<span class="hint">Paste links to your TikToks, one per line (up to 10). Each promo plays one of them behind your design, muted, with a sound button. On TikTok: open the video, click <b>Share</b>, then <b>Copy link</b>.</span><span class="error-text hidden" data-err="tiktok"></span></label>' +
      '<div class="field" id="videoField"><span>Promotional video</span><div class="upload"><label class="btn sm">' + ui.icon('upload') + 'Upload<input type="file" accept="video/mp4,video/webm" id="vidFile"></label><button type="button" class="btn sm ghost" id="vidClear">Remove</button><span class="subtle" id="vidName"></span></div><span class="hint">MP4 or WebM, up to 8 MB. Plays muted and on a loop.</span></div>' +
      '<label class="field">Priority<select class="input" name="priority">' + prioOpts + '</select><span class="hint">How often this campaign is used compared with this creator’s other campaigns.</span></label>' +
      '<div class="toggle-line" style="align-self:start"><div><div class="title">Enabled</div><div class="desc">Paused campaigns are never shown.</div></div><label class="switch"><input type="checkbox" name="enabled"' + (cp.enabled ? ' checked' : '') + '><span></span></label></div>' +
      '<label class="field">Start date<input class="input" type="date" name="start" value="' + esc(cp.schedule.start) + '"></label>' +
      '<label class="field">End date<input class="input" type="date" name="end" value="' + esc(cp.schedule.end) + '"><span class="error-text hidden" data-err="dates"></span></label>' +
      '<div class="field full"><span>Days of the week</span><div class="days" id="days">' + dayChecks + '</div><span class="hint">Leave all unselected to run every day.</span></div>' +
      '</div></div>' +
      '<aside class="editor-preview"><div class="row between"><strong>Preview</strong><select class="input" id="pvSize" style="width:auto;padding:6px 10px">' +
      SIZES.map((s) => '<option value="' + s.id + '">' + s.label + ' (' + s.id.replace('x', '×') + ')</option>').join('') +
      '</select></div><div class="stage" id="pvStage"></div><p class="subtle">The design adapts to every placement size automatically.</p></aside></div>';

    openEditor(existing ? 'Edit campaign' : 'New campaign', html, (body) => {
      const fillDest = () => {
        const cr = creatorById($('[name=creatorId]', body).value);
        $('[name=platformIndex]', body).innerHTML = cr.platforms
          .map((p, i) => '<option value="' + i + '"' + (i === cp.platformIndex ? ' selected' : '') + '>' + esc(CS.platforms.get(p.type).label + ' · ' + (p.handle || p.url)) + '</option>')
          .join('');
      };
      const collect = () => {
        cp.creatorId = $('[name=creatorId]', body).value;
        cp.name = $('[name=name]', body).value.trim();
        cp.headline = $('[name=headline]', body).value.trim();
        cp.message = $('[name=message]', body).value.trim();
        cp.cta = $('[name=cta]', body).value.trim();
        cp.platformIndex = Number($('[name=platformIndex]', body).value) || 0;
        cp.priority = Number($('[name=priority]', body).value);
        cp.enabled = $('[name=enabled]', body).checked;
        cp.schedule = { start: $('[name=start]', body).value, end: $('[name=end]', body).value, days: $$('#days input:checked', body).map((i) => Number(i.value)) };
        const ttLines = $('[name=tiktok]', body).value.split(/\s+/).map((x) => x.trim()).filter(Boolean);
        cp.tiktok = CS.tiktok.ids(ttLines);
        cp.tiktokBad = ttLines.filter((x) => !CS.tiktok.idFrom(x));
      };
      const formatHint = () => {
        const hints = {
          live: 'The LIVE badge only appears when a live-status integration confirms the stream is live. Otherwise it shows “Watch on Twitch”.',
          video: cp.media.videoId ? '' : 'Upload a video below. Until then, the Gaming Promotion design is used.',
        };
        $('#formatHint', body).textContent = hints[cp.format] || '';
        $('#imgName', body).textContent = cp.media.imageId ? 'Image added' : '';
        $('#vidName', body).textContent = cp.media.videoId ? 'Video added' : '';
      };
      let pending = null;
      const refresh = () => {
        collect();
        formatHint();
        $('#msgCount', body).textContent = cp.message.length;
        clearTimeout(pending);
        pending = setTimeout(() => {
          const cr = creatorById(cp.creatorId);
          const preview = Object.assign({}, cp, { headline: cp.headline || 'Your headline appears here' });
          previewInto($('#pvStage', body), cr, preview, size.w, size.h, 328);
        }, 120);
      };
      fillDest();
      refresh();
      $('[name=creatorId]', body).addEventListener('change', () => {
        cp.platformIndex = 0;
        fillDest();
        refresh();
      });
      body.addEventListener('input', refresh);
      body.addEventListener('change', (e) => {
        if (e.target.id === 'pvSize') size = SIZES.find((s) => s.id === e.target.value);
        refresh();
      });
      $('#formats', body).addEventListener('click', (e) => {
        const b = e.target.closest('[data-format]');
        if (!b) return;
        cp.format = b.dataset.format;
        $$('#formats [data-format]', body).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        refresh();
      });
      const upload = (inputId, key, maxDim) =>
        $(inputId, body).addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            cp.media[key] = await store.putMedia(await ui.readFile(file, maxDim));
            refresh();
          } catch (err) {
            ui.toast(err.message, true);
          }
        });
      upload('#imgFile', 'imageId', 1200);
      upload('#vidFile', 'videoId', 0);
      $('#imgClear', body).addEventListener('click', () => {
        cp.media.imageId = null;
        refresh();
      });
      $('#vidClear', body).addEventListener('click', () => {
        cp.media.videoId = null;
        refresh();
      });
    }, async (body) => {
      let valid = true;
      const setErr = (key, msg) => {
        const el = $('[data-err="' + key + '"]', body);
        el.textContent = msg || '';
        el.classList.toggle('hidden', !msg);
        if (msg) valid = false;
      };
      setErr('headline', cp.headline ? '' : 'Add a headline. It is the main line viewers read.');
      setErr('tiktok', cp.tiktokBad && cp.tiktokBad.length ? 'These are not TikTok video links: ' + cp.tiktokBad.slice(0, 2).join(', ') + '. Use the full link from Share > Copy link on tiktok.com (short vm.tiktok.com links do not work).' : '');
      delete cp.tiktokBad;
      setErr('dates', cp.schedule.start && cp.schedule.end && cp.schedule.end < cp.schedule.start ? 'The end date must be after the start date.' : '');
      if (!valid) return false;
      cp.name = cp.name || cp.headline;
      cp.id = cp.id || CS.uid('cp');
      const campaigns = existing ? S.campaigns.map((x) => (x.id === cp.id ? cp : x)) : S.campaigns.concat(cp);
      if (!(await persist(S.creators, campaigns))) return false;
      ui.toast(existing ? 'Campaign saved.' : 'Campaign created.');
      await reload();
      route();
    }, existing ? 'Save campaign' : 'Create campaign');
  }

  // ---------- Rotation ----------
  async function renderRotation() {
    const s = S.settings;
    const modeCards = CS.MODES.map(
      (m) => '<button class="choice" role="radio" data-mode="' + m.id + '" aria-checked="' + (s.mode === m.id) + '"><span class="dot"></span><span><span class="title">' + esc(m.label) + '</span><br><span class="desc">' + esc(m.description) + '</span></span></button>'
    ).join('');
    const avatars = new Map();
    for (const c of S.creators) avatars.set(c.id, ui.avatar(c, await ui.media(c.avatar), 'sm'));

    const memberRows = S.creators
      .filter((c) => !c.featured)
      .map((c) => {
        const inCircle = s.circle.members.includes(c.id);
        const w = s.circle.weights[c.id] || 1;
        return (
          '<div class="member-row"><input type="checkbox" data-member="' + esc(c.id) + '"' + (inCircle ? ' checked' : '') + ' aria-label="Include ' + esc(c.name) + '">' +
          '<div class="row">' + avatars.get(c.id) + '<strong>' + esc(c.name) + '</strong></div>' +
          '<select class="input" data-weight="' + esc(c.id) + '" aria-label="Share for ' + esc(c.name) + '"' + (inCircle ? '' : ' disabled') + '>' +
          [1, 2, 3].map((n) => '<option value="' + n + '"' + (n === w ? ' selected' : '') + '>' + ['Standard share', 'Double share', 'Triple share'][n - 1] + '</option>').join('') +
          '</select></div>'
        );
      })
      .join('');
    const excludeRows = S.creators
      .filter((c) => !c.isOwn && !c.featured)
      .map((c) => '<div class="member-row" style="grid-template-columns:auto 1fr"><input type="checkbox" data-exclude="' + esc(c.id) + '"' + (s.excluded.includes(c.id) ? ' checked' : '') + ' aria-label="Never show ' + esc(c.name) + '"><div class="row">' + avatars.get(c.id) + '<strong>' + esc(c.name) + '</strong></div></div>')
      .join('');

    view.innerHTML =
      '<div class="page-head"><div><h1>Rotation</h1><p class="muted">Decide who gets promoted and how often. Changes apply to new placements right away.</p></div></div>' +
      '<section class="mode-cards" id="modeCards" role="radiogroup" aria-label="Rotation mode">' + modeCards + '</section>' +
      '<section class="section card ' + (s.mode === 'mixed' ? '' : 'hidden') + '" id="mixedCard"><div class="card-title"><h3>Mixed promotion share</h3><span class="badge brand" id="shareVal">' + s.mixedOwnShare + '% you</span></div>' +
      '<input type="range" min="0" max="100" step="5" value="' + s.mixedOwnShare + '" id="share" aria-label="Share of placements for your own profiles">' +
      '<div class="row between subtle" style="margin-top:6px"><span>All other creators</span><span>Only you</span></div></section>' +
      '<section class="section card ' + (s.mode === 'circle' ? '' : 'hidden') + '" id="circleCard"><div class="card-title"><h3>Creator circle</h3></div>' +
      '<label class="field" style="margin-bottom:12px">Circle name<input class="input" id="circleName" maxlength="40" value="' + esc(s.circle.name) + '"></label>' +
      (memberRows || '<p class="muted">Add more creators to build a circle.</p>') +
      '<p class="subtle" style="margin-top:10px">Featured creators are always included as well.</p></section>' +
      '<section class="section settings-grid">' +
      '<div class="card"><div class="card-title"><h3>Frequency</h3></div>' +
      '<div class="setting"><div class="grow"><div class="title">Placements to replace</div><div class="desc">Share of eligible ad slots that show a promotion. The rest stay as they are.</div><input type="range" min="10" max="100" step="10" id="replaceRate" value="' + s.replaceRate + '" style="margin-top:10px" aria-label="Placements to replace"></div><span class="badge brand" id="rateVal">' + s.replaceRate + '%</span></div>' +
      '<div class="setting"><div><div class="title">Promotions per page</div><div class="desc">Upper limit on a single page.</div></div><input class="input" type="number" min="1" max="30" id="maxPerPage" value="' + s.maxPerPage + '" style="width:90px"></div>' +
      '<div class="setting"><div><div class="title">Per creator, per hour</div><div class="desc">Frequency cap so no one is overexposed.</div></div><input class="input" type="number" min="1" max="1000" id="maxPerHour" value="' + s.maxPerCreatorPerHour + '" style="width:90px"></div>' +
      '<div class="setting"><div><div class="title">Avoid back-to-back repeats</div><div class="desc">Show a different creator next whenever possible.</div></div><label class="switch"><input type="checkbox" id="avoidRepeat"' + (s.avoidRepeat ? ' checked' : '') + '><span></span></label></div>' +
      '</div>' +
      '<div class="card"><div class="card-title"><h3>Fairness preview</h3><button class="btn sm" id="simAgain">Run again</button></div>' +
      '<p class="subtle" style="margin-bottom:12px">The next 12 placements with your current settings, followed by the expected share over 300 placements. Nothing is recorded.</p>' +
      '<div class="sim" id="sim"></div><div class="share-bar section" id="simShare"></div></div>' +
      '</section>' +
      '<section class="section settings-grid">' +
      '<div class="card"><div class="card-title"><h3>Never show</h3></div><p class="subtle" style="margin-bottom:8px">Excluded creators are skipped in every mode.</p>' + (excludeRows || '<p class="muted">No other creators yet.</p>') + '</div>' +
      '<div class="card"><div class="card-title"><h3>Categories</h3></div><p class="subtle" style="margin-bottom:8px">Only show other creators in these categories. Leave empty to show every category. Your own profiles are always included.</p>' +
      '<input class="input" id="categories" placeholder="For example: Gaming, Music" value="' + esc(s.categories.join(', ')) + '"></div>' +
      '</section>';

    const save = async (patch, quiet) => {
      await store.saveSettings(patch);
      await reload();
      simulate();
      if (!quiet) ui.toast('Rotation updated.');
    };
    $('#modeCards').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      $$('#modeCards [data-mode]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      $('#mixedCard').classList.toggle('hidden', b.dataset.mode !== 'mixed');
      $('#circleCard').classList.toggle('hidden', b.dataset.mode !== 'circle');
      await save({ mode: b.dataset.mode });
    });
    $('#share').addEventListener('input', (e) => ($('#shareVal').textContent = e.target.value + '% you'));
    $('#share').addEventListener('change', (e) => save({ mixedOwnShare: Number(e.target.value) }));
    $('#replaceRate').addEventListener('input', (e) => ($('#rateVal').textContent = e.target.value + '%'));
    $('#replaceRate').addEventListener('change', (e) => save({ replaceRate: Number(e.target.value) }));
    $('#maxPerPage').addEventListener('change', (e) => save({ maxPerPage: Number(e.target.value) }));
    $('#maxPerHour').addEventListener('change', (e) => save({ maxPerCreatorPerHour: Number(e.target.value) }));
    $('#avoidRepeat').addEventListener('change', (e) => save({ avoidRepeat: e.target.checked }));
    $('#categories').addEventListener('change', (e) => save({ categories: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }));
    $('#circleName') && $('#circleName').addEventListener('change', (e) => save({ circle: Object.assign({}, S.settings.circle, { name: e.target.value }) }));
    view.addEventListener('change', (e) => {
      if (e.target.matches('[data-member]')) {
        const id = e.target.dataset.member;
        const members = S.settings.circle.members.filter((x) => x !== id);
        if (e.target.checked) members.push(id);
        $('[data-weight="' + id + '"]').disabled = !e.target.checked;
        save({ circle: Object.assign({}, S.settings.circle, { members }) });
      }
      if (e.target.matches('[data-weight]')) {
        const weights = Object.assign({}, S.settings.circle.weights, { [e.target.dataset.weight]: Number(e.target.value) });
        save({ circle: Object.assign({}, S.settings.circle, { weights }) });
      }
      if (e.target.matches('[data-exclude]')) {
        const id = e.target.dataset.exclude;
        const excluded = S.settings.excluded.filter((x) => x !== id);
        if (e.target.checked) excluded.push(id);
        save({ excluded });
      }
    });
    $('#simAgain').addEventListener('click', simulate);
    simulate();

    async function simulate() {
      const state0 = await store.getRotation();
      const settings = Object.assign({}, S.settings, { maxPerCreatorPerHour: Infinity });
      let state = state0;
      const seq = [];
      const counts = {};
      for (let i = 0; i < 300; i++) {
        const r = CS.rotation.pick({ settings, creators: S.creators, campaigns: S.campaigns, state, now: Date.now() + i * 1000 });
        state = r.state;
        if (!r.decision) break;
        if (i < 12) seq.push(r.decision.creatorId);
        counts[r.decision.creatorId] = (counts[r.decision.creatorId] || 0) + 1;
      }
      if (!seq.length) {
        $('#sim').innerHTML = '<p class="muted">No creator is eligible with these settings. Check that the selected mode has creators with active campaigns.</p>';
        $('#simShare').innerHTML = '';
        return;
      }
      $('#sim').innerHTML = seq.map((id, i) => '<div class="step">' + avatars.get(id) + '<small>#' + (i + 1) + '</small></div>').join('');
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      $('#simShare').innerHTML = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => '<div class="share-row"><span>' + esc((creatorById(id) || {}).name || id) + '</span><div class="bar"><i style="width:' + (n / total) * 100 + '%"></i></div><span class="num">' + Math.round((n / total) * 100) + '%</span></div>')
        .join('');
    }
  }

  // ---------- Analytics ----------
  let range = 7;
  function renderAnalytics() {
    const days = [];
    for (let i = range - 1; i >= 0; i--) days.push(CS.dayKey(Date.now() - i * 86400000));
    const byCreator = {};
    const byCampaign = {};
    let ti = 0;
    let tc = 0;
    const daily = days.map((d) => {
      const rows = S.stats[d] || {};
      let i = 0;
      let c = 0;
      Object.entries(rows).forEach(([cid, r]) => {
        i += r.i;
        c += r.c;
        const k = r.cr || 'unknown';
        byCreator[k] = byCreator[k] || { i: 0, c: 0 };
        byCreator[k].i += r.i;
        byCreator[k].c += r.c;
        byCampaign[cid] = byCampaign[cid] || { i: 0, c: 0, cr: r.cr };
        byCampaign[cid].i += r.i;
        byCampaign[cid].c += r.c;
      });
      ti += i;
      tc += c;
      return { d, i, c };
    });
    const max = Math.max(1, ...daily.map((x) => x.i));
    const fmtDay = (d) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const creatorRows = Object.entries(byCreator)
      .sort((a, b) => b[1].i - a[1].i)
      .map(([id, r]) => '<tr><td>' + esc((creatorById(id) || {}).name || 'Removed creator') + '</td><td class="num">' + ui.number(r.i) + '</td><td class="num">' + ui.number(r.c) + '</td><td class="num">' + ui.percent(r.c, r.i) + '</td><td class="num">' + ui.percent(r.i, ti) + '</td></tr>')
      .join('');
    const campaignRows = Object.entries(byCampaign)
      .sort((a, b) => b[1].i - a[1].i)
      .map(([id, r]) => {
        const cp = S.campaigns.find((x) => x.id === id);
        return '<tr><td>' + esc(cp ? cp.name : 'Deleted campaign') + '</td><td>' + esc((creatorById(r.cr) || {}).name || '—') + '</td><td class="num">' + ui.number(r.i) + '</td><td class="num">' + ui.number(r.c) + '</td><td class="num">' + ui.percent(r.c, r.i) + '</td></tr>';
      })
      .join('');

    view.innerHTML =
      '<div class="page-head"><div><h1>Analytics</h1><p class="muted">Counted on this device only. A display is recorded when at least half of a promotion is visible for one second.</p></div>' +
      '<div class="row"><div class="segmented" id="range">' + [7, 30, 90].map((n) => '<button data-range="' + n + '" aria-pressed="' + (n === range) + '">' + n + ' days</button>').join('') + '</div>' +
      '<button class="btn sm" id="exportCsv">Export CSV</button></div></div>' +
      '<section class="kpis">' + kpi('eye', 'Displays', ui.number(ti)) + kpi('cursor', 'Clicks', ui.number(tc)) + kpi('chart', 'Click rate', ui.percent(tc, ti)) + kpi('users', 'Creators shown', String(Object.keys(byCreator).length)) + '</section>' +
      '<section class="section card"><div class="card-title"><h3>Daily activity</h3><div class="legend"><span><i></i>Displays</span><span><i class="clicks"></i>Clicks</span></div></div>' +
      '<div class="chart">' + daily.map((x) => '<div class="col" data-tip="' + esc(fmtDay(x.d) + ': ' + x.i + ' displays, ' + x.c + ' clicks') + '"><i style="height:' + (x.i / max) * 100 + '%"></i>' + (x.c ? '<i class="clicks" style="height:' + Math.max(2, (x.c / max) * 100) + '%"></i>' : '') + '</div>').join('') + '</div>' +
      '<div class="chart-axis"><span>' + fmtDay(days[0]) + '</span><span>' + fmtDay(days[days.length - 1]) + '</span></div></section>' +
      '<section class="section settings-grid">' +
      '<div class="card"><div class="card-title"><h3>By creator</h3></div>' + (creatorRows ? '<table class="table"><thead><tr><th>Creator</th><th class="num">Displays</th><th class="num">Clicks</th><th class="num">Click rate</th><th class="num">Share</th></tr></thead><tbody>' + creatorRows + '</tbody></table>' : '<p class="muted">No displays in this period yet.</p>') + '</div>' +
      '<div class="card"><div class="card-title"><h3>By campaign</h3></div>' + (campaignRows ? '<table class="table"><thead><tr><th>Campaign</th><th>Creator</th><th class="num">Displays</th><th class="num">Clicks</th><th class="num">Rate</th></tr></thead><tbody>' + campaignRows + '</tbody></table>' : '<p class="muted">No displays in this period yet.</p>') + '</div>' +
      '</section>' +
      '<section class="section"><button class="btn sm ghost danger" id="resetStats">' + ui.icon('trash') + 'Reset analytics</button></section>';

    $('#range').addEventListener('click', (e) => {
      const b = e.target.closest('[data-range]');
      if (!b) return;
      range = Number(b.dataset.range);
      renderAnalytics();
    });
    $('#exportCsv').addEventListener('click', () => {
      const lines = [['date', 'campaign', 'creator', 'displays', 'clicks'].join(',')];
      days.forEach((d) =>
        Object.entries(S.stats[d] || {}).forEach(([cid, r]) => {
          const cp = S.campaigns.find((x) => x.id === cid);
          const cr = creatorById(r.cr);
          const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
          lines.push([d, q(cp ? cp.name : cid), q(cr ? cr.name : r.cr), r.i, r.c].join(','));
        })
      );
      download('creatorspot-analytics-' + CS.dayKey() + '.csv', lines.join('\n'), 'text/csv');
    });
    $('#resetStats').addEventListener('click', async () => {
      if (!(await confirmDialog('Reset analytics?', 'All displays and clicks recorded on this device will be deleted. This cannot be undone.', 'Reset'))) return;
      await api.runtime.sendMessage({ type: 'reset-stats' });
      await reload();
      renderAnalytics();
      ui.toast('Analytics reset.');
    });
  }

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = S.settings;
    const toggle = (id, title, desc, on) =>
      '<div class="setting"><div><div class="title">' + title + '</div><div class="desc">' + desc + '</div></div><label class="switch"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span></span></label></div>';
    view.innerHTML =
      '<div class="page-head"><div><h1>Settings</h1><p class="muted">These settings stay in this browser. Only creator profiles are shared, when a creator signs in.</p></div></div>' +
      '<section class="settings-grid">' +
      '<div class="card"><div class="card-title"><h3>General</h3></div>' +
      toggle('enabled', 'CreatorSpot is on', 'Turn off to stop showing promotions everywhere.', s.enabled) +
      '<div class="setting"><div><div class="title">Theme</div><div class="desc">Applies to the dashboard and popup.</div></div><div class="segmented" id="theme">' +
      ['system', 'light', 'dark'].map((t) => '<button data-theme="' + t + '" aria-pressed="' + (s.theme === t) + '">' + t[0].toUpperCase() + t.slice(1) + '</button>').join('') + '</div></div>' +
      toggle('animations', 'Animations', 'Subtle motion in promotions. Reduced-motion system settings are always respected.', s.animations) +
      '</div>' +
      '<div class="card"><div class="card-title"><h3>Ads and websites</h3></div>' +
      toggle('blockAdRequests', 'Stop ad networks from loading', 'Extra privacy: ads are never downloaded. Some sites then collapse their ad slots, so fewer promotions appear. When this is off, ads may still load but stay hidden and are never recorded as viewed.', s.blockAdRequests) +
      toggle('tiktokVideos', 'Play creators\u2019 TikTok videos', 'Promos can play one of the creator\u2019s TikToks in the background, muted, with a button to turn the sound on. This loads TikTok\u2019s own player from tiktok.com.', s.tiktokVideos) +
      toggle('youtubeCompanion', 'YouTube companion card', 'While YouTube plays a video ad, show a creator card next to the player. The video ad itself is not changed.', s.youtubeCompanion) +
      '<div class="setting"><div><div class="title">Ad-blocker compatibility</div><div class="desc">For browsers that hide ad slots themselves, such as Brave. “Automatic” turns this on in Brave only.</div></div>' +
      '<select class="input" id="compatMode" style="width:auto">' + [['auto', 'Automatic'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => '<option value="' + v + '"' + (s.compatMode === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '</div>' +
      '<div class="card"><div class="card-title"><h3>Paused websites</h3></div><p class="subtle" style="margin-bottom:12px">CreatorSpot leaves these sites, and their subdomains, untouched.</p>' +
      '<div class="row"><input class="input" id="siteInput" placeholder="example.com"><button class="btn" id="siteAdd">Add</button></div>' +
      '<div class="chip-list section" style="margin-top:12px" id="siteList">' + (s.disabledSites.length ? s.disabledSites.map((h) => '<span class="chip">' + esc(h) + '<button data-site="' + esc(h) + '" aria-label="Remove ' + esc(h) + '">' + ui.icon('close') + '</button></span>').join('') : '<span class="subtle">No paused websites.</span>') + '</div></div>' +
      '<div class="card"><div class="card-title"><h3>Twitch live status</h3><span class="badge">Optional</span></div>' +
      '<p class="subtle" style="margin-bottom:12px">Lets the Live Now format show a verified LIVE badge, stream title and game. Create an application at dev.twitch.tv, then paste its Client ID and an app access token. CreatorSpot only contacts api.twitch.tv after you grant access.</p>' +
      '<div class="stack"><label class="field">Client ID<input class="input" id="twClient" autocomplete="off" value="' + esc(s.integrations.twitch.clientId) + '"></label>' +
      '<label class="field">App access token<input class="input" id="twToken" type="password" autocomplete="off" value="' + esc(s.integrations.twitch.token) + '"></label>' +
      '<div class="row wrap"><button class="btn" id="twSave">Save and grant access</button><input class="input" id="twTest" placeholder="Channel to test" style="flex:1;min-width:140px"><button class="btn" id="twTestBtn">Test</button></div>' +
      '<div class="subtle" id="twResult" role="status"></div></div></div>' +
      '<div class="card"><div class="card-title"><h3>Backup and reset</h3></div>' +
      '<p class="subtle" style="margin-bottom:12px">Move your creators and campaigns to another browser, or start over with the default creators. Exports never include your Twitch credentials.</p>' +
      '<div class="row wrap"><button class="btn" id="export">Export backup</button><label class="btn">Import backup<input type="file" accept="application/json" id="import" hidden></label><button class="btn ghost danger" id="resetDemo">Restore defaults</button></div></div>' +
      '<div class="card"><div class="card-title"><h3>About</h3></div><p class="muted">CreatorSpot ' + esc(CS.VERSION) + '</p><p class="subtle" style="margin-top:6px">Built to help independent creators find new audiences. <a href="../privacy.html" target="_blank">Read the privacy policy</a> or <a href="../onboarding/welcome.html">replay the welcome tour</a>.</p></div>' +
      '</section>';

    const save = async (patch, msg) => {
      await store.saveSettings(patch);
      await reload();
      ui.toast(msg || 'Settings saved.');
    };
    ['enabled', 'animations', 'blockAdRequests', 'youtubeCompanion', 'tiktokVideos'].forEach((id) => $('#' + id).addEventListener('change', (e) => save({ [id]: e.target.checked })));
    $('#compatMode').addEventListener('change', (e) => save({ compatMode: e.target.value }));
    $('#theme').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-theme]');
      if (!b) return;
      $$('#theme button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      await save({ theme: b.dataset.theme }, 'Theme updated.');
    });
    const addSite = async () => {
      let v = $('#siteInput').value.trim().toLowerCase();
      try {
        if (v.includes('/')) v = new URL(v.includes('://') ? v : 'https://' + v).hostname;
      } catch (e) {
        /* fall through to validation */
      }
      v = v.replace(/^www\./, '');
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v)) return ui.toast('Enter a website such as example.com.', true);
      if (S.settings.disabledSites.includes(v)) return ui.toast(v + ' is already paused.');
      await save({ disabledSites: S.settings.disabledSites.concat(v) }, v + ' paused.');
      renderSettings();
    };
    $('#siteAdd').addEventListener('click', addSite);
    $('#siteInput').addEventListener('keydown', (e) => e.key === 'Enter' && addSite());
    $('#siteList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-site]');
      if (!b) return;
      await save({ disabledSites: S.settings.disabledSites.filter((h) => h !== b.dataset.site) }, b.dataset.site + ' resumed.');
      renderSettings();
    });
    $('#twSave').addEventListener('click', async () => {
      const clientId = $('#twClient').value.trim();
      const token = $('#twToken').value.trim();
      let granted = true;
      if (clientId && token) {
        try {
          granted = await api.permissions.request({ origins: ['https://api.twitch.tv/*'] });
        } catch (e) {
          granted = false;
        }
      }
      await save({ integrations: { twitch: { clientId, token } } }, clientId && token ? (granted ? 'Twitch connected.' : 'Saved, but access to api.twitch.tv was not granted.') : 'Twitch details cleared.');
    });
    $('#twTestBtn').addEventListener('click', async () => {
      $('#twResult').textContent = 'Checking…';
      const r = await api.runtime.sendMessage({ type: 'live-test', handle: $('#twTest').value });
      $('#twResult').textContent = (r && r.message) || 'Could not check right now.';
    });
    $('#export').addEventListener('click', async () => {
      download('creatorspot-backup-' + CS.dayKey() + '.json', JSON.stringify(await store.exportConfig(), null, 2), 'application/json');
    });
    $('#import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await store.importConfig(JSON.parse(await file.text()));
        ui._media.clear();
        await reload();
        ui.toast('Backup imported.');
        renderSettings();
      } catch (err) {
        ui.toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message, true);
      }
    });
    $('#resetDemo').addEventListener('click', async () => {
      if (!(await confirmDialog('Restore defaults?', 'Your creators, campaigns and rotation settings will be replaced with the default featured creators. Analytics are kept.', 'Restore'))) return;
      await api.runtime.sendMessage({ type: 'reset-demo' });
      ui._media.clear();
      await reload();
      ui.toast('Defaults restored.');
      renderSettings();
    });
  }

  // ---------- Router ----------
  const VIEWS = { overview: renderOverview, creators: renderCreators, campaigns: renderCampaigns, rotation: renderRotation, analytics: renderAnalytics, settings: renderSettings };

  /** Render the current view. `openSub` is only true for navigation, so saving never reopens an editor. */
  function route(openSub) {
    const hash = location.hash.replace(/^#/, '') || 'overview';
    const [path, query] = hash.split('?');
    const [name, sub] = path.split('/');
    current = VIEWS[name] ? name : 'overview';
    clearInterval(overviewTimer);
    // Re-create the view node so old listeners never stack up.
    const fresh = view.cloneNode(false);
    view.replaceWith(fresh);
    view = fresh;
    $$('#nav a').forEach((a) => (a.dataset.view === current ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    document.title = (current[0].toUpperCase() + current.slice(1)) + ' · CreatorSpot';
    VIEWS[current]();
    if (openSub === true && sub === 'new') {
      const params = new URLSearchParams(query || '');
      if (current === 'campaigns') editCampaign(null, params.get('creator'));
      if (current === 'creators') editCreator(null);
    }
  }
  window.addEventListener('hashchange', () => {
    if ($('#editor').open) $('#editor').close();
    route(true);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => ui.applyTheme(S.settings.theme));
  // Live updates: when another creator's profile changes (synced in the background), redraw the page,
  // unless you're in the middle of editing something.
  let liveTimer = null;
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || $('#editor').open) return;
    if (changes.stats && current === 'analytics') reload().then(renderAnalytics);
    if ((changes.creators || changes.campaigns || changes.account) && ['overview', 'creators', 'campaigns', 'rotation'].includes(current)) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(() => !$('#editor').open && reload().then(() => route()), 300);
    }
  });

  reload().then(() => route(true));
  // Opening the dashboard always fetches the latest profiles.
  api.runtime.sendMessage({ type: 'sync-soon' }).catch(() => null);
})();

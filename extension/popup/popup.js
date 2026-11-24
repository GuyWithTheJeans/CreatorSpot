(function () {
  'use strict';
  const CS = globalThis.CreatorSpot;
  const { ui, api, store } = CS;
  const esc = CS.escapeHtml;
  const $ = (s) => document.querySelector(s);

  let data = null;
  let tab = null;
  let tabStatus = null;

  function listNames(names) {
    if (names.length <= 1) return names.join('');
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function renderStatus() {
    const s = data.settings;
    const dot = $('#statusDot');
    const title = $('#statusTitle');
    const sub = $('#statusSub');
    const siteRow = $('#siteRow');
    $('#master').checked = s.enabled;
    $('#master').setAttribute('aria-label', s.enabled ? 'CreatorSpot is on' : 'CreatorSpot is off');
    document.body.classList.toggle('disabled', !s.enabled);

    if (!s.enabled) {
      dot.className = 'status-dot off';
      title.textContent = 'CreatorSpot is paused';
      sub.textContent = 'Turn it on to see creator promotions.';
      siteRow.classList.add('hidden');
      return;
    }
    if (!tabStatus) {
      dot.className = 'status-dot off';
      title.textContent = 'Not available on this page';
      sub.textContent = 'Browser pages and extension stores cannot show promotions.';
      siteRow.classList.add('hidden');
      return;
    }
    siteRow.classList.remove('hidden');
    $('#siteName').textContent = tabStatus.host || 'this site';
    $('#siteToggle').checked = tabStatus.siteEnabled;
    if (!tabStatus.siteEnabled) {
      dot.className = 'status-dot off';
      title.textContent = 'Paused on ' + tabStatus.host;
      sub.textContent = 'This site is left exactly as it is.';
    } else if (tabStatus.count > 0) {
      dot.className = 'status-dot on';
      title.textContent = tabStatus.count === 1 ? '1 promotion on this page' : tabStatus.count + ' promotions on this page';
      sub.textContent = 'Showing ' + listNames(tabStatus.names) + '.';
    } else {
      dot.className = 'status-dot idle';
      title.textContent = 'Active on ' + tabStatus.host;
      sub.textContent = 'No eligible ad placements on this page yet.';
    }
  }

  function renderModes() {
    const s = data.settings;
    const short = {
      self: 'Only your own profiles.',
      network: 'Fair share for every creator.',
      circle: 'A group you choose.',
      mixed: 'Mostly you, plus others.',
    };
    $('#modes').innerHTML = CS.MODES.map(
      (m) =>
        '<button class="choice" role="radio" data-mode="' + m.id + '" aria-checked="' + (s.mode === m.id) + '">' +
        '<span class="dot"></span><span><span class="title">' + esc(m.label) + '</span><br><span class="desc">' + esc(short[m.id]) + '</span></span></button>'
    ).join('');
    const mode = CS.MODES.find((m) => m.id === s.mode);
    $('#modeBadge').textContent = s.mode === 'mixed' ? s.mixedOwnShare + '% you' : mode.label;
  }

  async function renderPool() {
    const { settings, creators, campaigns } = data;
    const { pool, fallback } = CS.rotation.effectivePool(settings, creators, campaigns, Date.now());
    $('#poolCount').textContent = pool.length === 1 ? '1 creator' : pool.length + ' creators';
    if (!pool.length) {
      $('#pool').innerHTML = '<div class="empty">No creators have an active campaign yet. Open the dashboard to add one.</div>';
      return;
    }
    const note = fallback
      ? '<div class="notice">' +
        esc(settings.mode === 'circle' ? 'Your creator circle is empty, so everyone in the rotation is shown for now.' : 'You haven’t added your own channel yet, so everyone in the rotation is shown for now.') +
        '</div>'
      : '';
    const onPage = new Set((tabStatus && tabStatus.names) || []);
    const rows = await Promise.all(
      pool.slice(0, 5).map(async (p) => {
        const c = p.creator;
        const plat = CS.platforms.get((c.platforms[0] || {}).type);
        return (
          '<div class="pool-item">' + ui.avatar(c, await ui.media(c.avatar), 'sm') +
          '<div class="grow"><div class="name">' + esc(c.name) + '</div>' +
          '<div class="meta">' + CS.platforms.icon(plat.id, 12) + esc(plat.label) + (c.isOwn ? ' · You' : '') + '</div></div>' +
          (onPage.has(c.name) ? '<span class="badge ok"><span class="pip"></span>On this page</span>' : '') +
          '</div>'
        );
      })
    );
    if (pool.length > 5) rows.push('<div class="subtle">And ' + (pool.length - 5) + ' more.</div>');
    $('#pool').innerHTML = note + rows.join('');
  }

  /** "New version" banner, from the GitHub Releases check the background runs every few hours. */
  async function renderUpdate() {
    const box = $('#update');
    const { updateMeta = {} } = await api.storage.local.get('updateMeta');
    const u = updateMeta.update;
    if (!u || CS.shared.compareVersions(u.version, api.runtime.getManifest().version) <= 0) return box.classList.add('hidden');
    box.classList.remove('hidden');
    box.innerHTML =
      '<strong>CreatorSpot ' + esc(u.version) + ' is out.</strong> Double-click <b>Update CreatorSpot</b> in your CreatorSpot folder, then click the reload arrow on CreatorSpot in your extensions page.' +
      '<div class="row" style="gap:6px;margin-top:8px"><button class="btn sm primary" id="reloadExt">Open extensions page</button>' +
      '<a class="btn sm" href="' + esc(u.download) + '" target="_blank" rel="noopener noreferrer">Download</a></div>';
    $('#reloadExt').addEventListener('click', () => api.tabs.create({ url: 'chrome://extensions/?id=' + api.runtime.id }));
  }

  async function load() {
    data = await store.getAll();
    ui.applyTheme(data.settings.theme);
    renderStatus();
    renderModes();
    await renderPool();
    await renderUpdate();
  }

  async function init() {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab && typeof tab.id === 'number') {
      try {
        tabStatus = await api.tabs.sendMessage(tab.id, { type: 'tab-status' });
      } catch (e) {
        tabStatus = null;
      }
    }
    await load();

    $('#master').addEventListener('change', async (e) => {
      await store.saveSettings({ enabled: e.target.checked });
      await load();
    });

    $('#siteToggle').addEventListener('change', async (e) => {
      const host = tabStatus && tabStatus.host;
      if (!host) return;
      const list = data.settings.disabledSites.filter((h) => h !== host);
      if (!e.target.checked) list.push(host);
      await store.saveSettings({ disabledSites: list });
      tabStatus.siteEnabled = e.target.checked;
      if (!e.target.checked) tabStatus.count = 0;
      await load();
      if (e.target.checked && tab) setTimeout(refreshTab, 900);
    });

    $('#modes').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      await store.saveSettings({ mode: btn.dataset.mode });
      await load();
      setTimeout(refreshTab, 900);
    });

    $('#openDashboard').addEventListener('click', () => {
      api.runtime.openOptionsPage();
      window.close();
    });
    $('#openCampaigns').addEventListener('click', () => {
      api.tabs.create({ url: api.runtime.getURL('dashboard/dashboard.html#campaigns/new') });
      window.close();
    });
  }

  async function refreshTab() {
    if (!tab) return;
    try {
      tabStatus = await api.tabs.sendMessage(tab.id, { type: 'tab-status' });
    } catch (e) {
      /* page may have navigated */
    }
    renderStatus();
    renderPool();
  }

  init();
})();

(function () {
  'use strict';
  const CS = globalThis.CreatorSpot;
  const { ui, store, api } = CS;
  const esc = CS.escapeHtml;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let step = 0;
  let data = null;
  let mode = 'network';
  let timers = [];

  async function showcase(el, sizes) {
    const list = data.campaigns.filter((c) => c.enabled && data.creators.some((x) => x.id === c.creatorId));
    if (!list.length) {
      el.innerHTML = '';
      return;
    }
    let i = 0;
    const paint = async () => {
      const camp = list[i % list.length];
      const cr = data.creators.find((x) => x.id === camp.creatorId);
      const blocks = await Promise.all(
        sizes.map(async (s) => {
          const payload = await CS.buildPayload(cr, camp, data.settings, ui.media.bind(ui), null);
          return { s, payload };
        })
      );
      el.innerHTML = '';
      blocks.forEach(({ s, payload }) => {
        if (!payload) return;
        const host = document.createElement('div');
        host.style.cssText = 'width:' + s.w + 'px;height:' + s.h + 'px;max-width:100%';
        el.appendChild(host);
        CS.render.mount(host, payload, s).shadow.addEventListener('click', (e) => e.preventDefault());
      });
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.textContent = 'Example promotion for ' + cr.name;
      el.appendChild(cap);
      i += 1;
    };
    await paint();
    timers.push(setInterval(paint, 4000));
  }

  function renderModes() {
    const hasOwn = data.creators.some((c) => c.isOwn);
    $('#obModes').innerHTML = CS.MODES.filter((m) => m.id !== 'circle')
      .map((m) => {
        const needsOwn = (m.id === 'self' || m.id === 'mixed') && !hasOwn;
        return (
          '<button class="choice" role="radio" data-mode="' + m.id + '" aria-checked="' + (mode === m.id) + '"' + (needsOwn ? ' aria-disabled="true"' : '') + '>' +
          '<span class="dot"></span><span><span class="title">' + esc(m.label) + (m.id === 'network' ? ' (recommended)' : '') + '</span><br>' +
          '<span class="desc">' + esc(m.description) + (needsOwn ? ' Add your channel in the previous step to use this.' : '') + '</span></span></button>'
        );
      })
      .join('') + '<p class="subtle">Creator circles, where you pick a group of friends to rotate, are available in the dashboard.</p>';
  }

  function go(n) {
    step = n;
    $$('.step').forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    $$('#steps li').forEach((li, i) => {
      li.classList.toggle('active', i === n);
      li.classList.toggle('done', i < n);
    });
    $('#back').style.visibility = n === 0 ? 'hidden' : 'visible';
    $('#skip').classList.toggle('hidden', n !== 1);
    $('#next').textContent = ['Get started', 'Continue', 'Continue', 'Open the dashboard'][n];
    if (n === 2) renderModes();
    if (n === 3) {
      timers.forEach(clearInterval);
      timers = [];
      showcase($('#showcase2'), [{ w: 300, h: 250 }]);
      $('#braveTip').classList.toggle('hidden', !CS.isBrave());
    }
  }

  async function saveChannel() {
    const name = $('#obName').value.trim();
    const link = $('#obLink').value.trim();
    const err = $('#obError');
    err.classList.add('hidden');
    if (!name && !link) return true; // optional step
    const found = CS.platforms.detect(link);
    if (!name || !found) {
      err.textContent = !name ? 'Enter your creator name, or skip this step.' : 'Enter a full channel link, such as https://www.twitch.tv/yourchannel.';
      err.classList.remove('hidden');
      return false;
    }
    const existing = data.creators.find((c) => c.isOwn && c.platforms.some((p) => p.url === found.url));
    if (!existing) {
      const id = CS.uid('cr');
      const creator = { id, name, accent: '#7C5CFF', category: 'Gaming', bio: '', isOwn: true, participates: true, weight: 1, platforms: [found] };
      const campaign = {
        id: CS.uid('cp'),
        creatorId: id,
        name: 'My first campaign',
        headline: found.type === 'twitch' || found.type === 'kick' ? 'Come hang out on my stream!' : 'Check out my channel!',
        message: 'Thanks for stopping by. I’d love to see you there!',
        cta: '',
        format: 'spotlight',
        platformIndex: 0,
        priority: 3,
        enabled: true,
        schedule: { start: '', end: '', days: [] },
        media: {},
      };
      await store.saveProfiles(data.creators.concat(creator), data.campaigns.concat(campaign));
      data = await store.getAll();
    }
    return true;
  }

  async function init() {
    await store.init();
    data = await store.getAll();
    mode = data.settings.mode;
    ui.applyTheme(data.settings.theme);
    go(0);
    showcase($('#showcase'), [{ w: 336, h: 280 }, { w: 468, h: 60 }]);

    $('#obLink').addEventListener('input', (e) => {
      const f = CS.platforms.detect(e.target.value);
      $('#obDetected').textContent = f ? 'Detected: ' + CS.platforms.get(f.type).label + (f.handle ? ' · ' + f.handle : '') : 'Twitch, YouTube, TikTok, Kick, Discord or any website.';
    });
    $('#obModes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      mode = b.dataset.mode;
      $$('#obModes [data-mode]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    $('#back').addEventListener('click', () => go(Math.max(0, step - 1)));
    $('#skip').addEventListener('click', () => {
      $('#obName').value = '';
      $('#obLink').value = '';
      go(2);
    });
    $('#next').addEventListener('click', async () => {
      if (step === 1 && !(await saveChannel())) return;
      if (step === 2) {
        const hasOwn = data.creators.some((c) => c.isOwn);
        if (hasOwn && mode === 'mixed') await store.saveSettings({ mode, mixedOwnShare: 70, onboarded: true });
        else await store.saveSettings({ mode, onboarded: true });
        data = await store.getAll();
      }
      if (step === 3) {
        await store.saveSettings({ onboarded: true });
        location.href = api.runtime.getURL('dashboard/dashboard.html#overview');
        return;
      }
      go(step + 1);
    });
  }

  init();
})();

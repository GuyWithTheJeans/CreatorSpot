/* Shared helpers for extension pages (popup, dashboard, onboarding). */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const esc = CS.escapeHtml;

  const ICONS = {
    plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
    edit: '<path d="M4 17.2V20h2.8l8.3-8.3-2.8-2.8L4 17.2Zm13.7-7.6a1 1 0 0 0 0-1.4l-1.9-1.9a1 1 0 0 0-1.4 0l-1.5 1.5 2.8 2.8 2-1Z"/>',
    trash: '<path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z"/>',
    external: '<path d="M14 4h6v6h-2V7.4l-7.3 7.3-1.4-1.4L16.6 6H14V4ZM5 6h6v2H6v10h10v-5h2v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z"/>',
    home: '<path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5L12 3Z"/>',
    users: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6H2Zm15.5 0c0-1.9-.7-3.6-1.9-4.9 3.4.1 6.4 2.2 6.4 4.9h-4.5Z"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h2l1 5h3l-1-5h1l8 4V5l-8 4H4a1 1 0 0 0-1 1Zm18 2a3 3 0 0 0-1.5-2.6v5.2A3 3 0 0 0 21 12Z"/>',
    rotate: '<path d="M12 4a8 8 0 0 1 7.4 5H17v2h6V5h-2v2.3A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Zm8 8a8 8 0 0 1-15.4 3H7v-2H1v6h2v-2.3A10 10 0 0 0 22 12h-2Z"/>',
    chart: '<path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z"/>',
    gear: '<path d="m19.4 13 .1-1-.1-1 2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-1.7-1L15 3h-4l-.3 2.9a7 7 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11l-.1 1 .1 1-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.3-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5-2.1-1.6ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"/>',
    upload: '<path d="M11 16V7.8L8.4 10.4 7 9l5-5 5 5-1.4 1.4L13 7.8V16h-2Zm-6 2h14v2H5v-2Z"/>',
    check: '<path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/>',
    close: '<path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3Z"/>',
    eye: '<path d="M12 5c5 0 9 4.5 10 7-1 2.5-5 7-10 7S3 14.5 2 12c1-2.5 5-7 10-7Zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/>',
    cursor: '<path d="m5 3 14 7-6 1.5L16 18l-2.5 1.5-3-6.5L5 17V3Z"/>',
  };

  const ui = {
    icon: (name) => '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (ICONS[name] || '') + '</svg>',

    applyTheme(theme) {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    },

    toast(message, isError) {
      let t = document.querySelector('.toast');
      if (!t) {
        t = document.createElement('div');
        t.className = 'toast';
        t.setAttribute('role', 'status');
        document.body.appendChild(t);
      }
      t.textContent = message;
      t.classList.toggle('error', !!isError);
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 2600);
    },

    /** Avatar markup. `mediaUrl` is the resolved data URL (or null). */
    avatar(creator, mediaUrl, size) {
      const cls = 'avatar' + (size ? ' ' + size : '');
      const bg = 'background:linear-gradient(135deg,' + esc(creator.accent || '#7C5CFF') + ',color-mix(in srgb,' + esc(creator.accent || '#7C5CFF') + ' 45%,#000))';
      if (mediaUrl) return '<span class="' + cls + '"><img alt="" src="' + esc(mediaUrl) + '"></span>';
      return '<span class="' + cls + '" style="' + bg + '">' + esc(CS.initials(creator.name)) + '</span>';
    },

    /** Read a File as a data URL; images are downscaled to keep storage small. */
    readFile(file, maxDim) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('That file could not be read.'));
        reader.onload = () => {
          const url = reader.result;
          if (!maxDim || !/^data:image\/(png|jpeg|webp)/.test(url)) return resolve(url);
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            if (scale === 1) return resolve(url);
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * scale);
            c.height = Math.round(img.height * scale);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/webp', 0.88));
          };
          img.onerror = () => reject(new Error('That image could not be opened.'));
          img.src = url;
        };
        reader.readAsDataURL(file);
      });
    },

    /** Media lookup with a small cache (pages read storage directly). */
    _media: new Map(),
    async media(id) {
      if (!id) return null;
      if (!ui._media.has(id)) ui._media.set(id, await CS.store.getMedia(id));
      return ui._media.get(id);
    },

    number: (n) => new Intl.NumberFormat().format(n || 0),
    percent: (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '0%'),
  };

  CS.ui = ui;
})(typeof globalThis !== 'undefined' ? globalThis : self);

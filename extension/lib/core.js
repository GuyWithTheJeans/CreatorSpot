/* CreatorSpot core: namespace, cross-browser API shim and shared helpers.
 * Loaded first in every context (service worker, content script, extension pages, Node tests). */
(function (root) {
  'use strict';
  const CS = (root.CreatorSpot = root.CreatorSpot || {});

  // Chromium (Chrome, Brave, Edge, Opera) exposes `chrome`; Firefox exposes `browser`.
  // Both return promises from MV3 APIs, so one code path works everywhere.
  CS.api = root.browser && root.browser.runtime ? root.browser : root.chrome;

  CS.VERSION = '0.1.3';

  CS.uid = function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rand;
  };

  /** Only allow http(s) destinations; returns a normalised URL string or null. */
  CS.safeUrl = function safeUrl(value) {
    if (typeof value !== 'string') return null;
    let v = value.trim();
    if (!v) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
    try {
      const u = new URL(v);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      if (!u.hostname || !u.hostname.includes('.')) return null;
      return u.toString();
    } catch (e) {
      return null;
    }
  };

  CS.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  CS.dayKey = function dayKey(date) {
    const d = date ? new Date(date) : new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  };

  CS.escapeHtml = function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  CS.initials = function initials(name) {
    const clean = String(name || '?').replace(/[^\p{L}\p{N} _-]/gu, '').trim();
    const parts = clean.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    // Split camel case: "GuyWithTheJeans" -> "GW"
    const caps = clean.match(/[A-Z]/g);
    if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
    return clean.slice(0, 2).toUpperCase() || '?';
  };

  CS.isBrave = function isBrave() {
    return typeof navigator !== 'undefined' && !!navigator.brave;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CS;
})(typeof globalThis !== 'undefined' ? globalThis : self);

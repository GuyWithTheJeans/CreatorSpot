/* GitHub: where new versions of CreatorSpot are published. Every install checks the version number there
 * every 10 minutes (and whenever the popup opens) and installs new versions automatically. (Creator profiles sync through accounts: lib/cloud.js.) */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  // The GitHub repository that hosts CreatorSpot. Change this one line if the repository moves.
  CS.GITHUB_REPO = 'GuyWithTheJeans/CreatorSpot';
  const BRANCH = 'main';

  const shared = {
    UPDATE_EVERY_MS: 10 * 60 * 1000,
    configured: () => !/^OWNER\//.test(CS.GITHUB_REPO),
    rawUrl: (file) => 'https://raw.githubusercontent.com/' + CS.GITHUB_REPO + '/' + BRANCH + '/' + file,
    manifestUrl: () => shared.rawUrl('extension/manifest.json'),
    /** Permanent link to the newest ready-to-install ZIP (works for Chrome, Brave and Edge). */
    downloadUrl: () => 'https://github.com/' + CS.GITHUB_REPO + '/raw/' + BRANCH + '/downloads/CreatorSpot-for-Chrome.zip',

    /** Compare dotted versions: 1 if a > b, -1 if a < b, 0 if equal. */
    compareVersions(a, b) {
      const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
      const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
      }
      return 0;
    },
  };

  CS.shared = shared;
  if (typeof module !== 'undefined' && module.exports) module.exports = shared;
})(typeof globalThis !== 'undefined' ? globalThis : self);

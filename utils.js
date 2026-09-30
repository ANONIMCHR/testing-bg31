/**
 * utils.js
 * Isomorphic helper utilities (no secrets, no GitHub calls).
 * Used by github.js and every /api/*.js handler on the server,
 * and by app.js / dashboard.js / users.js / music.js / leaderboard.js /
 * deploy.js / settings.js in the browser.
 */
(function (root) {
  const patternCache = {};

  /** Build (and cache) the regex that matches "<prefix>.json", "<prefix>2.json", ... */
  function getFilePattern(prefix) {
    if (!patternCache[prefix]) {
      patternCache[prefix] = new RegExp("^" + prefix + "(\\d+)?\\.json$", "i");
    }
    return patternCache[prefix];
  }

  /**
   * Returns the numeric index of a discovered data file, or null if the
   * filename does not match the prefix pattern.
   * users.json  -> 1
   * users2.json -> 2
   * users3.json -> 3
   */
  function parseFileIndex(filename, prefix) {
    const match = getFilePattern(prefix).exec(filename);
    if (!match) return null;
    return match[1] ? parseInt(match[1], 10) : 1;
  }

  /** Inverse of parseFileIndex: index 1 -> "users.json", index 2 -> "users2.json" */
  function buildFileName(prefix, index) {
    return index <= 1 ? prefix + ".json" : prefix + index + ".json";
  }

  function sortByIndex(files) {
    return files.slice().sort(function (a, b) {
      return a.index - b.index;
    });
  }

  function isFull(count, max) {
    return count >= max;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  /** true if expiresAt is a date strictly before today */
  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    return String(expiresAt) < todayISO();
  }

  function formatClock(date) {
    const d = date ? new Date(date) : new Date();
    return d.toTimeString().slice(0, 8);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(ctx, args);
      }, wait);
    };
  }

  const utils = {
    getFilePattern,
    parseFileIndex,
    buildFileName,
    sortByIndex,
    isFull,
    todayISO,
    isExpired,
    formatClock,
    escapeHtml,
    debounce
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = utils;
  } else {
    root.Utils = utils;
  }
})(typeof window !== "undefined" ? window : globalThis);

/**
 * config.js
 * Shared, non-secret configuration for FELIX PANEL REMOTE.
 * Loaded BOTH in the browser (via <script src="config.js">) and on the
 * server (via require('./config') from github.js and /api/*.js).
 *
 * IMPORTANT: this file must never contain GITHUB_TOKEN or any other secret,
 * because it is shipped as-is to the browser.
 *
 * The GITHUB_BRANCH default below reads process.env only when it exists
 * (i.e. on the server). In the browser, `process` is undefined, so we guard
 * the lookup instead of touching process.env directly.
 */
const config = {
  APP_NAME: "FELIX PANEL REMOTE",
  PROJECT_BY: "PROJECT BY CHRIS",
  USERS_FILE_PREFIX: "users",
  MUSIC_FILE_PREFIX: "music",
  MAX_USERS_PER_FILE: 15,
  MAX_MUSIC_PER_FILE: 15,
  GITHUB_BRANCH:
    (typeof process !== "undefined" && process.env && process.env.GITHUB_BRANCH) ||
    "main",
  ROLES: ["Owner", "Moderator", "Member"]
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = config;
} else if (typeof window !== "undefined") {
  window.APP_CONFIG = config;
}

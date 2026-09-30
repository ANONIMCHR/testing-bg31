/**
 * config-api.js
 * -----------------------------------------------------------------------
 * SERVER-SIDE ONLY. This is where all secrets / API keys live.
 * Never require() this from anything that ships to the browser
 * (index.html never <script>-includes it, same rule as github.js).
 *
 * Locally: copy .env.example to .env, fill in the real values, and
 * `vercel dev` / your Node process will load them automatically.
 *
 * On Vercel: set the SAME variable names under
 * Project -> Settings -> Environment Variables (Production + Preview).
 * Never commit real values — .env is already in .gitignore.
 * -----------------------------------------------------------------------
 */
const config = require("./config");

class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = "MISSING_ENV";
    this.status = 500;
  }
}

/**
 * Reads and validates every secret / API key the server needs.
 * Add new keys here (and to .env.example) rather than scattering
 * process.env.* reads across other files.
 */
function getApiConfig() {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || config.GITHUB_BRANCH || "main";

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new ConfigError(
      "Server is missing GitHub configuration. Set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO."
    );
  }

  return {
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_BRANCH
    // Add more API keys/secrets here as the project grows, e.g.:
    // SOME_OTHER_API_KEY: process.env.SOME_OTHER_API_KEY,
  };
}

module.exports = { getApiConfig, ConfigError };

/**
 * github.js
 * -----------------------------------------------------------------------
 * SERVER-SIDE ONLY. This file is never <script>-included by index.html.
 * It is only ever require()-d from files inside /api, which run as
 * Vercel serverless functions on Node.js.
 *
 * This is the single module that talks to the GitHub REST API and holds
 * ALL business logic around discovering, reading and safely rewriting
 * the users*.json and music*.json files (auto file discovery, capacity
 * rotation, duplicate checks, SHA-safe read-modify-write, retries).
 *
 * GITHUB_TOKEN is read from process.env here and is NEVER returned to a
 * caller, logged, or embedded in any response.
 * -----------------------------------------------------------------------
 */
const Utils = require("./utils");
const config = require("./config");
const { getApiConfig } = require("./config-api");

const API_BASE = "https://api.github.com";

/** Typed error that is safe to show to the client (message contains no secrets). */
class AppError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status || 400;
  }
}

function getEnv() {
  try {
    const cfg = getApiConfig();
    return {
      token: cfg.GITHUB_TOKEN,
      owner: cfg.GITHUB_OWNER,
      repo: cfg.GITHUB_REPO,
      branch: cfg.GITHUB_BRANCH
    };
  } catch (e) {
    const missing = ["GITHUB_TOKEN", "GITHUB_OWNER", "GITHUB_REPO"].filter((k) => !process.env[k]);
    // eslint-disable-next-line no-console
    console.error("FELIX PANEL REMOTE config error. Missing env vars:", missing.join(", ") || "(none, see error)", e && e.message);
    throw new AppError(
      "Server is missing GitHub configuration. Please check environment variables.",
      "MISSING_ENV",
      500
    );
  }
}

async function ghRequest(path, options = {}) {
  const { token, owner, repo } = getEnv();
  const url = API_BASE + "/repos/" + owner + "/" + repo + path;
  let res;
  try {
    res = await fetch(url, {
      method: options.method || "GET",
      headers: Object.assign(
        {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        options.body ? { "Content-Type": "application/json" } : {},
        options.headers || {}
      ),
      body: options.body
    });
  } catch (networkErr) {
    throw new AppError("Network error while contacting GitHub. Please try again.", "NETWORK_ERROR", 502);
  }
  return res;
}

// ---------------------------------------------------------------------
// Low-level content operations
// ---------------------------------------------------------------------

async function getRepositoryContents(path) {
  const { branch } = getEnv();
  const res = await ghRequest("/contents/" + (path || "") + "?ref=" + encodeURIComponent(branch));
  if (res.status === 404) {
    throw new AppError("Repository or path not found. Check GITHUB_OWNER/GITHUB_REPO.", "REPO_NOT_FOUND", 404);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError("Permission denied by GitHub. Check the token's permissions.", "PERMISSION_DENIED", 403);
  }
  if (!res.ok) {
    throw new AppError("Unable to reach GitHub. Please try again.", "GITHUB_ERROR", res.status);
  }
  return res.json();
}

async function getSingleFile(path) {
  const { branch } = getEnv();
  const res = await ghRequest("/contents/" + encodeURIComponent(path) + "?ref=" + encodeURIComponent(branch));
  if (res.status === 404) {
    const err = new AppError("File not found: " + path, "FILE_NOT_FOUND", 404);
    err.path = path;
    throw err;
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError("Permission denied by GitHub. Check the token's permissions.", "PERMISSION_DENIED", 403);
  }
  if (!res.ok) {
    throw new AppError("Unable to reach GitHub. Please try again.", "GITHUB_ERROR", res.status);
  }
  return res.json();
}

async function getJsonFile(path) {
  const file = await getSingleFile(path);
  let data;
  try {
    const decoded = Buffer.from(file.content, "base64").toString("utf-8");
    data = decoded.trim() ? JSON.parse(decoded) : [];
  } catch (e) {
    throw new AppError("Invalid JSON in file: " + path, "INVALID_JSON", 500);
  }
  if (!Array.isArray(data)) data = [];
  return { data: data, sha: file.sha };
}

async function putJsonFile(path, dataArray, message, sha) {
  const { branch } = getEnv();
  const body = {
    message: message,
    content: Buffer.from(JSON.stringify(dataArray, null, 2), "utf-8").toString("base64"),
    branch: branch
  };
  if (sha) body.sha = sha;
  const res = await ghRequest("/contents/" + encodeURIComponent(path), {
    method: "PUT",
    body: JSON.stringify(body)
  });
  if (res.status === 409 || res.status === 422) {
    throw new AppError("GitHub file changed by another request. Please try again.", "SHA_CONFLICT", 409);
  }
  if (res.status === 401 || res.status === 403) {
    throw new AppError("Permission denied by GitHub. Check the token's permissions.", "PERMISSION_DENIED", 403);
  }
  if (!res.ok) {
    throw new AppError("Failed to update GitHub.", "GITHUB_ERROR", res.status);
  }
  return res.json();
}

function createJsonFile(path, dataArray, message) {
  return putJsonFile(path, dataArray, message, null);
}

function updateJsonFile(path, dataArray, sha, message) {
  return putJsonFile(path, dataArray, message, sha);
}

async function testConnection() {
  try {
    await getRepositoryContents("");
    return true;
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------------
// Dynamic file discovery (section 6/12): reads the real repo root,
// never hard-codes a maximum suffix, never assumes a gap file exists.
// ---------------------------------------------------------------------

async function listFilesByPrefix(prefix) {
  const contents = await getRepositoryContents("");
  if (!Array.isArray(contents)) {
    throw new AppError("Repository root is not a directory.", "REPO_ERROR", 500);
  }
  const files = [];
  for (const item of contents) {
    if (item.type !== "file") continue;
    const idx = Utils.parseFileIndex(item.name, prefix);
    if (idx !== null) files.push({ name: item.name, index: idx });
  }
  return Utils.sortByIndex(files);
}

function getAllUserFiles() {
  return listFilesByPrefix(config.USERS_FILE_PREFIX);
}

function getAllMusicFiles() {
  return listFilesByPrefix(config.MUSIC_FILE_PREFIX);
}

async function loadAllRecords(files) {
  const result = [];
  for (const f of files) {
    const { data, sha } = await getJsonFile(f.name);
    result.push({ name: f.name, index: f.index, data: data, sha: sha, count: data.length });
  }
  return result;
}

async function getAllUsers() {
  const files = await getAllUserFiles();
  const loaded = await loadAllRecords(files);
  const users = [];
  for (const f of loaded) {
    f.data.forEach((u, i) => users.push(Object.assign({}, u, { __file: f.name, __index: i })));
  }
  return { users, files: loaded };
}

async function getAllMusic() {
  const files = await getAllMusicFiles();
  const loaded = await loadAllRecords(files);
  const music = [];
  for (const f of loaded) {
    f.data.forEach((m, i) => music.push(Object.assign({}, m, { __file: f.name, __index: i })));
  }
  return { music, files: loaded };
}

/**
 * Finds the FIRST file (in ascending numeric order) with spare capacity.
 * Only if every existing file is full does it propose the next safe,
 * never-used index (max existing index + 1) — it never fills a gap by
 * inventing a filename that doesn't exist yet unless all are full.
 */
function findAvailableFile(loadedFiles, prefix, max) {
  const sorted = Utils.sortByIndex(loadedFiles);
  for (const f of sorted) {
    if (f.count < max) return { name: f.name, sha: f.sha, data: f.data, isNew: false };
  }
  const maxIndex = sorted.length ? Math.max.apply(null, sorted.map((f) => f.index)) : 0;
  const nextIndex = maxIndex + 1;
  return { name: Utils.buildFileName(prefix, nextIndex), sha: null, data: [], isNew: true };
}

// ---------------------------------------------------------------------
// Users: rotation-aware add / edit / delete, with SHA-conflict retries
// ---------------------------------------------------------------------

async function addUserWithRotation(newUser, attempt) {
  attempt = attempt || 1;
  const files = await getAllUserFiles();
  const loaded = await loadAllRecords(files);

  const lower = newUser.username.toLowerCase();
  for (const f of loaded) {
    if (f.data.some((u) => u.username && String(u.username).toLowerCase() === lower)) {
      throw new AppError("Username already exists.", "DUPLICATE_USERNAME", 409);
    }
  }

  const target = findAvailableFile(loaded, config.USERS_FILE_PREFIX, config.MAX_USERS_PER_FILE);
  const updatedData = target.data.concat([newUser]);

  try {
    if (target.isNew) {
      await createJsonFile(target.name, updatedData, "Add user " + newUser.username + " to " + target.name);
    } else {
      await updateJsonFile(
        target.name,
        updatedData,
        target.sha,
        "Add user " + newUser.username + " to " + target.name
      );
    }
    return { file: target.name, user: newUser };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return addUserWithRotation(newUser, attempt + 1);
    }
    throw err;
  }
}

async function editUser(username, updates, attempt) {
  attempt = attempt || 1;
  const files = await getAllUserFiles();
  const loaded = await loadAllRecords(files);
  const lower = username.toLowerCase();

  let targetFile = null;
  let idx = -1;
  for (const f of loaded) {
    const i = f.data.findIndex((u) => u.username && String(u.username).toLowerCase() === lower);
    if (i !== -1) {
      targetFile = f;
      idx = i;
      break;
    }
  }
  if (!targetFile) throw new AppError("User not found.", "NOT_FOUND", 404);

  const original = targetFile.data[idx];
  const updatedRecord = Object.assign({}, original, updates, { username: original.username });
  const newData = targetFile.data.slice();
  newData[idx] = updatedRecord;

  try {
    await updateJsonFile(targetFile.name, newData, targetFile.sha, "Update user " + username + " in " + targetFile.name);
    return { file: targetFile.name, user: updatedRecord };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return editUser(username, updates, attempt + 1);
    }
    throw err;
  }
}

async function deleteUser(username, attempt) {
  attempt = attempt || 1;
  const files = await getAllUserFiles();
  const loaded = await loadAllRecords(files);
  const lower = username.toLowerCase();

  let targetFile = null;
  let idx = -1;
  for (const f of loaded) {
    const i = f.data.findIndex((u) => u.username && String(u.username).toLowerCase() === lower);
    if (i !== -1) {
      targetFile = f;
      idx = i;
      break;
    }
  }
  if (!targetFile) throw new AppError("User not found.", "NOT_FOUND", 404);

  const newData = targetFile.data.filter((_, i) => i !== idx);

  try {
    // Note: file is kept even if newData is empty (never delete the JSON file itself).
    await updateJsonFile(targetFile.name, newData, targetFile.sha, "Delete user " + username + " from " + targetFile.name);
    return { file: targetFile.name };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return deleteUser(username, attempt + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Music: rotation-aware add / edit / delete, with SHA-conflict retries
// ---------------------------------------------------------------------

async function addMusicWithRotation(newMusic, attempt) {
  attempt = attempt || 1;
  const files = await getAllMusicFiles();
  const loaded = await loadAllRecords(files);

  const target = findAvailableFile(loaded, config.MUSIC_FILE_PREFIX, config.MAX_MUSIC_PER_FILE);
  const updatedData = target.data.concat([newMusic]);

  try {
    if (target.isNew) {
      await createJsonFile(target.name, updatedData, 'Add music "' + newMusic.title + '" to ' + target.name);
    } else {
      await updateJsonFile(target.name, updatedData, target.sha, 'Add music "' + newMusic.title + '" to ' + target.name);
    }
    return { file: target.name, music: newMusic };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return addMusicWithRotation(newMusic, attempt + 1);
    }
    throw err;
  }
}

/** original = { originalTitle, originalUrl } used to re-locate the row if index has shifted. */
async function editMusic(fileName, index, updates, original, attempt) {
  attempt = attempt || 1;
  const files = await getAllMusicFiles();
  const found = files.find((f) => f.name === fileName);
  if (!found) throw new AppError("Music file not found.", "FILE_NOT_FOUND", 404);

  const { data, sha } = await getJsonFile(fileName);
  let targetIndex = index;
  const matches = (row) => row && row.title === original.originalTitle && row.url === original.originalUrl;
  if (!matches(data[targetIndex])) {
    targetIndex = data.findIndex(matches);
  }
  if (targetIndex === -1 || targetIndex === undefined) {
    throw new AppError("Music entry not found.", "NOT_FOUND", 404);
  }

  const newData = data.slice();
  newData[targetIndex] = { title: updates.title, url: updates.url };

  try {
    await updateJsonFile(fileName, newData, sha, "Update music in " + fileName);
    return { file: fileName };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return editMusic(fileName, index, updates, original, attempt + 1);
    }
    throw err;
  }
}

async function deleteMusic(fileName, index, original, attempt) {
  attempt = attempt || 1;
  const files = await getAllMusicFiles();
  const found = files.find((f) => f.name === fileName);
  if (!found) throw new AppError("Music file not found.", "FILE_NOT_FOUND", 404);

  const { data, sha } = await getJsonFile(fileName);
  let targetIndex = index;
  const matches = (row) => row && row.title === original.originalTitle && row.url === original.originalUrl;
  if (!matches(data[targetIndex])) {
    targetIndex = data.findIndex(matches);
  }
  if (targetIndex === -1 || targetIndex === undefined) {
    throw new AppError("Music entry not found.", "NOT_FOUND", 404);
  }

  const newData = data.filter((_, i) => i !== targetIndex);

  try {
    await updateJsonFile(fileName, newData, sha, "Delete music from " + fileName);
    return { file: fileName };
  } catch (err) {
    if (err.code === "SHA_CONFLICT" && attempt < 3) {
      return deleteMusic(fileName, index, original, attempt + 1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------
// Auth: credentials are validated against the GitHub-stored users*.json
// data itself (there is no separate secrets store). Every mutating
// request re-validates credentials — nothing is trusted from the client.
// ---------------------------------------------------------------------

async function authenticateUser(username, password) {
  const { users } = await getAllUsers();
  const lower = String(username || "").toLowerCase();
  const found = users.find((u) => u.username && String(u.username).toLowerCase() === lower);
  if (!found || found.password !== password) {
    throw new AppError("Invalid username or password.", "INVALID_CREDENTIALS", 401);
  }
  if (found.active === false) {
    throw new AppError("This account is inactive.", "INACTIVE_ACCOUNT", 403);
  }
  if (Utils.isExpired(found.expiresAt)) {
    throw new AppError("This account has expired.", "EXPIRED_ACCOUNT", 403);
  }
  const allowedRoles = ["owner", "moderator"];
  if (!allowedRoles.includes(String(found.role || "").toLowerCase())) {
    throw new AppError("Only Owner or Moderator accounts can log in.", "FORBIDDEN", 403);
  }
  return { username: found.username, name: found.name, role: found.role };
}

function parseBasicAuth(req) {
  const header = (req.headers && req.headers["authorization"]) || "";
  if (header.indexOf("Basic ") !== 0) {
    throw new AppError("Authentication required.", "UNAUTHORIZED", 401);
  }
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf-8");
  const idx = decoded.indexOf(":");
  if (idx === -1) throw new AppError("Invalid authentication header.", "UNAUTHORIZED", 401);
  return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
}

async function requireAuth(req) {
  const { username, password } = parseBasicAuth(req);
  return authenticateUser(username, password);
}

function requireRole(user, roles) {
  const current = String(user.role || "").toLowerCase();
  if (!roles.some((r) => String(r).toLowerCase() === current)) {
    throw new AppError("Insufficient permissions.", "FORBIDDEN", 403);
  }
}

// ---------------------------------------------------------------------
// Maps an internal error into a { status, message } pair that is always
// safe to send to the browser (no stack traces, no tokens, no internals).
// ---------------------------------------------------------------------
const SAFE_CODES = new Set([
  "DUPLICATE_USERNAME",
  "INVALID_CREDENTIALS",
  "INACTIVE_ACCOUNT",
  "EXPIRED_ACCOUNT",
  "NOT_FOUND",
  "FILE_NOT_FOUND",
  "REPO_NOT_FOUND",
  "REPO_ERROR",
  "PERMISSION_DENIED",
  "SHA_CONFLICT",
  "MISSING_ENV",
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "INVALID_JSON",
  "NETWORK_ERROR",
  "GITHUB_ERROR"
]);

function toSafeError(err) {
  if (err && err.code && SAFE_CODES.has(err.code)) {
    return { status: err.status || 400, message: err.message };
  }
  // eslint-disable-next-line no-console
  console.error("Unexpected FELIX PANEL REMOTE error:", err);
  return { status: 500, message: "Something went wrong. Please try again." };
}

module.exports = {
  AppError,
  getRepositoryContents,
  getSingleFile,
  getJsonFile,
  createJsonFile,
  updateJsonFile,
  testConnection,
  getAllUserFiles,
  getAllMusicFiles,
  getAllUsers,
  getAllMusic,
  findAvailableFile,
  addUserWithRotation,
  editUser,
  deleteUser,
  addMusicWithRotation,
  editMusic,
  deleteMusic,
  authenticateUser,
  requireAuth,
  requireRole,
  toSafeError
};

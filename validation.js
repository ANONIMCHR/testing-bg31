/**
 * validation.js
 * Isomorphic validation rules, reused by the frontend forms (users.js, music.js)
 * for instant feedback, and by the /api handlers (source of truth) before any
 * GitHub write happens.
 */
(function (root) {
  const USERNAME_RE = /^[a-zA-Z0-9_.]{3,32}$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ROLES = ["Owner", "Moderator", "Member"];

  function validateUsername(u) {
    if (!u || typeof u !== "string") return "Username is required.";
    if (!USERNAME_RE.test(u)) {
      return "Username must be 3-32 characters (letters, numbers, dot or underscore only).";
    }
    return null;
  }

  function validatePassword(p) {
    if (!p || typeof p !== "string" || p.length < 3) {
      return "Password must be at least 3 characters.";
    }
    return null;
  }

  function validateName(n) {
    if (!n || typeof n !== "string" || !n.trim()) return "Name is required.";
    return null;
  }

  function validateRole(r) {
    if (ROLES.indexOf(r) === -1) return "Role must be Owner, Moderator, or Member.";
    return null;
  }

  function validateExpiresAt(d) {
    if (!d) return "Expired date is required.";
    if (!DATE_RE.test(d) || isNaN(new Date(d).getTime())) {
      return "Expired date must be in YYYY-MM-DD format.";
    }
    return null;
  }

  function validateMusicTitle(t) {
    if (!t || typeof t !== "string" || !t.trim()) return "Title is required.";
    return null;
  }

  function validateMusicUrl(u) {
    if (!u || typeof u !== "string") return "URL is required.";
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Please enter a valid http(s) URL.";
      }
    } catch (e) {
      return "Please enter a valid http(s) URL.";
    }
    return null;
  }

  function firstError(list) {
    for (let i = 0; i < list.length; i++) {
      if (list[i]) return list[i];
    }
    return null;
  }

  function validateUserInput(body) {
    body = body || {};
    return [
      validateUsername(body.username),
      validatePassword(body.password),
      validateName(body.name),
      validateRole(body.role),
      validateExpiresAt(body.expiresAt)
    ].filter(Boolean);
  }

  function validateUserUpdate(body) {
    body = body || {};
    const errors = [];
    if (body.password !== undefined) {
      const e = validatePassword(body.password);
      if (e) errors.push(e);
    }
    if (body.name !== undefined) {
      const e = validateName(body.name);
      if (e) errors.push(e);
    }
    if (body.role !== undefined) {
      const e = validateRole(body.role);
      if (e) errors.push(e);
    }
    if (body.expiresAt !== undefined) {
      const e = validateExpiresAt(body.expiresAt);
      if (e) errors.push(e);
    }
    return errors;
  }

  function validateMusicInput(body) {
    body = body || {};
    return [validateMusicTitle(body.title), validateMusicUrl(body.url)].filter(Boolean);
  }

  const validation = {
    ROLES,
    validateUsername,
    validatePassword,
    validateName,
    validateRole,
    validateExpiresAt,
    validateMusicTitle,
    validateMusicUrl,
    validateUserInput,
    validateUserUpdate,
    validateMusicInput,
    firstError
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = validation;
  } else {
    root.Validation = validation;
  }
})(typeof window !== "undefined" ? window : globalThis);

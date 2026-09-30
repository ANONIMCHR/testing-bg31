/**
 * app.js
 * Application shell: galaxy background animation, session/auth handling,
 * the API client (attaches Basic Auth to every request), hash router,
 * toast notifications, a small modal helper, and the mobile drawer.
 *
 * Page modules (dashboard.js, users.js, music.js, leaderboard.js, deploy.js,
 * settings.js) register themselves on window.Pages.<route> = async function(container){...}
 */
(function () {
  const SESSION_KEY = "felixSession";
  const ROUTES = ["dashboard", "users", "music", "leaderboard", "deploy", "settings"];

  // ------------------------------------------------------------------
  // Galaxy background: stars, drifting particles, occasional shooting star
  // ------------------------------------------------------------------
  function initGalaxy() {
    const canvas = document.getElementById("galaxy-bg");
    const ctx = canvas.getContext("2d");
    let w, h, stars, particles, shootingStar = null;
    const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const starCount = Math.min(160, Math.floor((w * h) / 9000));
      stars = new Array(starCount).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.3,
        tw: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.005
      }));
      const particleCount = Math.min(36, Math.floor(w / 40));
      particles = new Array(particleCount).fill(0).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 2 + 1,
        vy: -(Math.random() * 0.15 + 0.05),
        vx: (Math.random() - 0.5) * 0.08,
        hue: [270, 200, 320][Math.floor(Math.random() * 3)],
        alpha: Math.random() * 0.35 + 0.1
      }));
    }

    function maybeSpawnShootingStar() {
      if (shootingStar || Math.random() > 0.004) return;
      shootingStar = {
        x: Math.random() * w * 0.6,
        y: Math.random() * h * 0.3,
        vx: 7 + Math.random() * 4,
        vy: 3 + Math.random() * 2,
        life: 1
      };
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      stars.forEach((s) => {
        s.tw += s.speed;
        const alpha = 0.45 + Math.sin(s.tw) * 0.35;
        ctx.beginPath();
        ctx.fillStyle = "rgba(230,225,255," + Math.max(0.15, alpha) + ")";
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      particles.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y < -10) p.y = h + 10;
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.fillStyle = "hsla(" + p.hue + ",90%,70%," + p.alpha + ")";
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!prefersReducedMotion) maybeSpawnShootingStar();
      if (shootingStar) {
        const s = shootingStar;
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255," + s.life + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 6, s.y - s.vy * 6);
        ctx.stroke();
        ctx.restore();
        s.x += s.vx * 4;
        s.y += s.vy * 4;
        s.life -= 0.02;
        if (s.life <= 0 || s.x > w + 50 || s.y > h + 50) shootingStar = null;
      }

      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", Utils.debounce(resize, 200));
    if (prefersReducedMotion) {
      draw(); // draw one static-ish frame, animation loop still runs but spawns no shooting stars
    } else {
      requestAnimationFrame(draw);
    }
  }

  // ------------------------------------------------------------------
  // Session
  // ------------------------------------------------------------------
  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ------------------------------------------------------------------
  // API client: attaches Basic Auth using the session's credentials.
  // Credentials are re-validated server-side against GitHub data on
  // every single call (see github.js#authenticateUser) — nothing here
  // is trusted blindly by the backend.
  // ------------------------------------------------------------------
  async function parseApiResponse(res) {
    try {
      return await res.json();
    } catch (e) {
      throw new Error(
        "API route is unavailable or returned an invalid response (HTTP " + res.status + "). Run with Vercel dev or check the deployment."
      );
    }
  }

  async function apiFetch(path, options) {
    options = options || {};
    const session = getSession();
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (session) {
      headers["Authorization"] = "Basic " + btoa(session.username + ":" + session.password);
    }
    let res, data;
    try {
      res = await fetch(path, {
        method: options.method || "GET",
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (e) {
      throw new Error("Network error. Please check your connection and try again.");
    }
    data = await parseApiResponse(res);
    if (res.status === 401) {
      clearSession();
      showLoginView();
      throw new Error(data.message || "Session expired. Please sign in again.");
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.message || "Something went wrong. Please try again.");
    }
    return data;
  }

  window.FelixApp = {
    getSession,
    apiFetch,
    showToast,
    openModal,
    closeModal,
    escapeHtml: Utils.escapeHtml
  };

  // ------------------------------------------------------------------
  // Toasts
  // ------------------------------------------------------------------
  function showToast(type, message) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = "toast glass toast-" + type;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 3600);
  }

  // ------------------------------------------------------------------
  // Modal helper
  // ------------------------------------------------------------------
  let activeModalBackdrop = null;
  function openModal(innerHtml) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = '<div class="modal glass neon">' + innerHtml + "</div>";
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    document.body.appendChild(backdrop);
    activeModalBackdrop = backdrop;
    return backdrop;
  }
  function closeModal() {
    if (activeModalBackdrop) {
      activeModalBackdrop.remove();
      activeModalBackdrop = null;
    }
  }

  // ------------------------------------------------------------------
  // Router
  // ------------------------------------------------------------------
  const PAGE_TITLES = {
    dashboard: "Dashboard",
    users: "Users",
    music: "Music",
    leaderboard: "Leaderboard",
    deploy: "Deploy Center",
    settings: "Settings"
  };

  async function navigate(route) {
    if (ROUTES.indexOf(route) === -1) route = "dashboard";
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-route") === route);
    });
    document.getElementById("page-title").textContent = PAGE_TITLES[route];
    closeSidebarDrawer();

    const container = document.getElementById("page-content");
    container.innerHTML = '<div class="empty-state">Loading ' + PAGE_TITLES[route] + "...</div>";
    try {
      if (window.Pages && typeof window.Pages[route] === "function") {
        await window.Pages[route](container);
      } else {
        container.innerHTML = '<div class="empty-state">This page is not available.</div>';
      }
    } catch (err) {
      container.innerHTML = '<div class="empty-state">' + Utils.escapeHtml(err.message || "Failed to load this page.") + "</div>";
    }
  }

  function currentRoute() {
    return (location.hash || "#dashboard").replace("#", "");
  }

  window.addEventListener("hashchange", () => navigate(currentRoute()));

  // ------------------------------------------------------------------
  // Sidebar drawer (mobile)
  // ------------------------------------------------------------------
  function openSidebarDrawer() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebar-overlay").classList.add("open");
  }
  function closeSidebarDrawer() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-overlay").classList.remove("open");
  }

  // ------------------------------------------------------------------
  // View switching: login vs app shell
  // ------------------------------------------------------------------
  function showLoginView() {
    document.getElementById("app-shell").classList.add("hidden");
    document.getElementById("login-view").classList.remove("hidden");
  }

  function showAppShell(session) {
    document.getElementById("login-view").classList.add("hidden");
    document.getElementById("app-shell").classList.remove("hidden");
    document.getElementById("sidebar-username").textContent = session.name || session.username;
    document.getElementById("sidebar-role").textContent = session.role || "";
    navigate(currentRoute());
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  function wireStaticEvents() {
    document.getElementById("nav-list").addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item");
      if (!item) return;
      location.hash = "#" + item.getAttribute("data-route");
    });

    document.getElementById("hamburger-btn").addEventListener("click", openSidebarDrawer);
    document.getElementById("sidebar-overlay").addEventListener("click", closeSidebarDrawer);

    document.getElementById("logout-btn").addEventListener("click", () => {
      clearSession();
      location.hash = "#dashboard";
      showLoginView();
    });

    document.getElementById("refresh-btn").addEventListener("click", () => navigate(currentRoute()));

    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;
      const errorEl = document.getElementById("login-error");
      const submitBtn = document.getElementById("login-submit");
      errorEl.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Signing in...";
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await parseApiResponse(res);
        if (!res.ok || !data.success) {
          throw new Error(data.message || "Invalid username or password.");
        }
        setSession({ username: data.user.username, password: password, name: data.user.name, role: data.user.role });
        showAppShell(getSession());
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In";
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initGalaxy();
    wireStaticEvents();

    const session = getSession();
    setTimeout(() => {
      document.getElementById("loading-screen").classList.add("hidden");
      if (session) {
        showAppShell(session);
      } else {
        showLoginView();
      }
    }, 900);
  });
})();

/**
 * users.js
 * Renders the Users management page: search, add (with a live "will be
 * deployed to <file>" rotation preview), edit and delete. The rotation
 * preview below is informational only — the server (github.js) is the
 * single source of truth and re-computes the real target file itself.
 */
(function () {
  window.Pages = window.Pages || {};

  let allUsers = [];
  let searchTerm = "";

  function canManage(session) {
    return session && (session.role === "Owner" || session.role === "Moderator");
  }

  function roleBadgeClass(role) {
    if (role === "Owner") return "badge-role-owner";
    if (role === "Moderator") return "badge-role-moderator";
    return "badge-role-member";
  }

  function statusBadge(user) {
    const today = Utils.todayISO();
    if (user.active === false) return '<span class="badge badge-danger">Inactive</span>';
    if (user.expiresAt && String(user.expiresAt) < today) return '<span class="badge badge-warning">Expired</span>';
    return '<span class="badge badge-success">Active</span>';
  }

  /** Mirrors github.js#findAvailableFile purely for the UI preview shown before a deploy. */
  function previewTargetFile(users) {
    const grouped = {};
    users.forEach((u) => {
      grouped[u.__file] = (grouped[u.__file] || 0) + 1;
    });
    const files = Object.keys(grouped).map((name) => ({
      name,
      index: Utils.parseFileIndex(name, APP_CONFIG.USERS_FILE_PREFIX) || 1,
      count: grouped[name]
    }));
    const sorted = Utils.sortByIndex(files);
    for (const f of sorted) {
      if (f.count < APP_CONFIG.MAX_USERS_PER_FILE) return f.name;
    }
    const maxIndex = sorted.length ? Math.max.apply(null, sorted.map((f) => f.index)) : 0;
    return Utils.buildFileName(APP_CONFIG.USERS_FILE_PREFIX, maxIndex + 1);
  }

  function renderTable(session) {
    const filtered = allUsers.filter((u) => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return (
        (u.username || "").toLowerCase().includes(s) ||
        (u.name || "").toLowerCase().includes(s) ||
        (u.role || "").toLowerCase().includes(s)
      );
    });

    if (!filtered.length) {
      return '<div class="empty-state">No users found.</div>';
    }

    const rows = filtered
      .map((u) => {
        const actions = canManage(session)
          ? '<button class="btn" data-action="edit" data-username="' +
            Utils.escapeHtml(u.username) +
            '" style="padding:6px 12px; margin-right:6px;">Edit</button>' +
            '<button class="btn btn-danger" data-action="delete" data-username="' +
            Utils.escapeHtml(u.username) +
            '" style="padding:6px 12px;">Delete</button>'
          : '<span class="muted">View only</span>';
        return (
          "<tr>" +
          "<td>" + Utils.escapeHtml(u.username) + "</td>" +
          "<td>" + Utils.escapeHtml(u.name) + "</td>" +
          '<td><span class="badge ' + roleBadgeClass(u.role) + '">' + Utils.escapeHtml(u.role) + "</span></td>" +
          "<td>" + statusBadge(u) + "</td>" +
          "<td>" + Utils.escapeHtml(u.expiresAt || "-") + "</td>" +
          '<td><span class="muted" style="font-size:0.78rem;">' + Utils.escapeHtml(u.__file) + "</span></td>" +
          "<td>" + actions + "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Expires</th><th>File</th><th>Actions</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>"
    );
  }

  function userFormHtml(prefill) {
    prefill = prefill || {};
    const isEdit = !!prefill.username;
    return (
      "<h3>" +
      (isEdit ? "Edit User" : "Add User") +
      "</h3>" +
      '<form id="user-form">' +
      '<div class="field"><label>Username</label><input name="username" value="' +
      Utils.escapeHtml(prefill.username || "") +
      '" ' +
      (isEdit ? "readonly" : "required") +
      " /></div>" +
      '<div class="field"><label>Password' +
      (isEdit ? " (leave blank to keep unchanged)" : "") +
      '</label><input name="password" type="password" ' +
      (isEdit ? "" : "required") +
      " /></div>" +
      '<div class="field"><label>Name</label><input name="name" value="' +
      Utils.escapeHtml(prefill.name || "") +
      '" required /></div>' +
      '<div class="field"><label>Role</label><select name="role">' +
      Validation.ROLES.map(
        (r) => '<option value="' + r + '"' + (prefill.role === r ? " selected" : "") + ">" + r + "</option>"
      ).join("") +
      "</select></div>" +
      '<div class="field"><label>Expired Date</label><input name="expiresAt" type="date" value="' +
      Utils.escapeHtml(prefill.expiresAt || "") +
      '" required /></div>' +
      '<div class="field" style="display:flex; align-items:center; gap:8px;">' +
      '<input type="checkbox" name="active" style="width:auto;" ' +
      (prefill.active === false ? "" : "checked") +
      " /> <label style='margin:0;'>Active</label></div>" +
      '<div id="user-form-note" class="muted" style="font-size:0.8rem;"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="user-form-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary" id="user-form-submit">' +
      (isEdit ? "Save Changes" : "Deploy User") +
      "</button>" +
      "</div>" +
      "</form>"
    );
  }

  function openAddModal(refresh) {
    const backdrop = FelixApp.openModal(userFormHtml());
    const note = backdrop.querySelector("#user-form-note");
    const usernameInput = backdrop.querySelector('[name="username"]');

    function updateNote() {
      const val = usernameInput.value.trim().toLowerCase();
      const dup = val && allUsers.some((u) => (u.username || "").toLowerCase() === val);
      if (dup) {
        note.innerHTML = '<span style="color:var(--danger);">This username already exists.</span>';
      } else {
        note.textContent = "This user will be deployed to " + previewTargetFile(allUsers);
      }
    }
    updateNote();
    usernameInput.addEventListener("input", updateNote);

    backdrop.querySelector("#user-form-cancel").addEventListener("click", FelixApp.closeModal);
    backdrop.querySelector("#user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        username: fd.get("username").trim(),
        password: fd.get("password"),
        name: fd.get("name").trim(),
        role: fd.get("role"),
        expiresAt: fd.get("expiresAt"),
        active: fd.get("active") === "on"
      };
      const errors = Validation.validateUserInput(body);
      if (errors.length) {
        note.innerHTML = '<span style="color:var(--danger);">' + Utils.escapeHtml(errors[0]) + "</span>";
        return;
      }
      const submitBtn = backdrop.querySelector("#user-form-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Deploying...";
      try {
        const res = await FelixApp.apiFetch("/api/users", { method: "POST", body });
        FelixApp.showToast("success", res.message);
        FelixApp.closeModal();
        refresh();
      } catch (err) {
        note.innerHTML = '<span style="color:var(--danger);">' + Utils.escapeHtml(err.message) + "</span>";
        submitBtn.disabled = false;
        submitBtn.textContent = "Deploy User";
      }
    });
  }

  function openEditModal(username, refresh) {
    const user = allUsers.find((u) => u.username === username);
    if (!user) return;
    const backdrop = FelixApp.openModal(userFormHtml(user));
    backdrop.querySelector("#user-form-cancel").addEventListener("click", FelixApp.closeModal);
    backdrop.querySelector("#user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const password = fd.get("password");
      const body = {
        username: username,
        name: fd.get("name").trim(),
        role: fd.get("role"),
        expiresAt: fd.get("expiresAt"),
        active: fd.get("active") === "on"
      };
      if (password) body.password = password;
      const errors = Validation.validateUserUpdate(body);
      if (errors.length) {
        FelixApp.showToast("error", errors[0]);
        return;
      }
      const submitBtn = backdrop.querySelector("#user-form-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
      try {
        const res = await FelixApp.apiFetch("/api/users", { method: "PUT", body });
        FelixApp.showToast("success", res.message);
        FelixApp.closeModal();
        refresh();
      } catch (err) {
        FelixApp.showToast("error", err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Save Changes";
      }
    });
  }

  function openDeleteModal(username, refresh) {
    const backdrop = FelixApp.openModal(
      "<h3>Delete User</h3>" +
        '<p class="muted">Are you sure you want to delete <strong>' +
        Utils.escapeHtml(username) +
        "</strong>? This cannot be undone.</p>" +
        '<div class="modal-actions">' +
        '<button type="button" class="btn btn-ghost" id="delete-cancel">Cancel</button>' +
        '<button type="button" class="btn btn-danger" id="delete-confirm">Delete</button>' +
        "</div>"
    );
    backdrop.querySelector("#delete-cancel").addEventListener("click", FelixApp.closeModal);
    backdrop.querySelector("#delete-confirm").addEventListener("click", async () => {
      const btn = backdrop.querySelector("#delete-confirm");
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        const res = await FelixApp.apiFetch("/api/users", { method: "DELETE", body: { username } });
        FelixApp.showToast("success", res.message);
        FelixApp.closeModal();
        refresh();
      } catch (err) {
        FelixApp.showToast("error", err.message);
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
  }

  window.Pages.users = async function (container) {
    const session = FelixApp.getSession();

    async function load() {
      const data = await FelixApp.apiFetch("/api/users");
      allUsers = data.users;
      render();
    }

    function render() {
      container.innerHTML =
        '<div class="toolbar">' +
        '<div class="toolbar-left"><input id="user-search" placeholder="Search username, name or role..." value="' +
        Utils.escapeHtml(searchTerm) +
        '" /></div>' +
        (canManage(session) ? '<button class="btn btn-primary" id="add-user-btn">+ Add User</button>' : "") +
        "</div>" +
        '<div class="glass card">' +
        renderTable(session) +
        "</div>";

      container.querySelector("#user-search").addEventListener(
        "input",
        Utils.debounce((e) => {
          searchTerm = e.target.value;
          render();
        }, 200)
      );

      const addBtn = container.querySelector("#add-user-btn");
      if (addBtn) addBtn.addEventListener("click", () => openAddModal(load));

      if (sessionStorage.getItem("felixAutoOpen") === "add-user" && canManage(session)) {
        sessionStorage.removeItem("felixAutoOpen");
        openAddModal(load);
      }

      container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
        btn.addEventListener("click", () => openEditModal(btn.getAttribute("data-username"), load));
      });
      container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener("click", () => openDeleteModal(btn.getAttribute("data-username"), load));
      });
    }

    await load();
  };
})();

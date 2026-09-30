/**
 * music.js
 * Renders the Music management page: search, add (with rotation preview),
 * edit, delete, and a non-autoplay HTML5 audio preview per row.
 */
(function () {
  window.Pages = window.Pages || {};

  let allMusic = [];
  let searchTerm = "";

  function canManage(session) {
    return session && (session.role === "Owner" || session.role === "Moderator");
  }

  /** Mirrors github.js#findAvailableFile purely for the UI preview shown before a deploy. */
  function previewTargetFile(music) {
    const grouped = {};
    music.forEach((m) => {
      grouped[m.__file] = (grouped[m.__file] || 0) + 1;
    });
    const files = Object.keys(grouped).map((name) => ({
      name,
      index: Utils.parseFileIndex(name, APP_CONFIG.MUSIC_FILE_PREFIX) || 1,
      count: grouped[name]
    }));
    const sorted = Utils.sortByIndex(files);
    for (const f of sorted) {
      if (f.count < APP_CONFIG.MAX_MUSIC_PER_FILE) return f.name;
    }
    const maxIndex = sorted.length ? Math.max.apply(null, sorted.map((f) => f.index)) : 0;
    return Utils.buildFileName(APP_CONFIG.MUSIC_FILE_PREFIX, maxIndex + 1);
  }

  function renderTable(session) {
    const filtered = allMusic.filter((m) => {
      if (!searchTerm) return true;
      return (m.title || "").toLowerCase().includes(searchTerm.toLowerCase());
    });

    if (!filtered.length) {
      return '<div class="empty-state">No music found.</div>';
    }

    const rows = filtered
      .map((m, i) => {
        const audioId = "audio-preview-" + i;
        const actions = canManage(session)
          ? '<button class="btn" data-action="edit" data-idx="' +
            i +
            '" style="padding:6px 12px; margin-right:6px;">Edit</button>' +
            '<button class="btn btn-danger" data-action="delete" data-idx="' +
            i +
            '" style="padding:6px 12px;">Delete</button>'
          : '<span class="muted">View only</span>';
        return (
          "<tr>" +
          "<td>" + Utils.escapeHtml(m.title) + "</td>" +
          '<td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' +
          Utils.escapeHtml(m.url) +
          "</td>" +
          '<td><span class="muted" style="font-size:0.78rem;">' + Utils.escapeHtml(m.__file) + "</span></td>" +
          "<td>" +
          '<audio id="' + audioId + '" controls preload="none" style="height:32px; max-width:200px;" src="' +
          Utils.escapeHtml(m.url) +
          '"></audio>' +
          "</td>" +
          "<td>" + actions + "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<div class="table-wrap"><table>' +
      "<thead><tr><th>Title</th><th>URL</th><th>File</th><th>Preview</th><th>Actions</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div>"
    );
  }

  function musicFormHtml(prefill) {
    prefill = prefill || {};
    const isEdit = prefill.__isEdit;
    return (
      "<h3>" +
      (isEdit ? "Edit Music" : "Add Music") +
      "</h3>" +
      '<form id="music-form">' +
      '<div class="field"><label>Title</label><input name="title" value="' +
      Utils.escapeHtml(prefill.title || "") +
      '" required /></div>' +
      '<div class="field"><label>URL</label><input name="url" type="url" value="' +
      Utils.escapeHtml(prefill.url || "") +
      '" required /></div>' +
      '<div id="music-form-note" class="muted" style="font-size:0.8rem;"></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" id="music-form-cancel">Cancel</button>' +
      '<button type="submit" class="btn btn-primary" id="music-form-submit">' +
      (isEdit ? "Save Changes" : "Deploy Music") +
      "</button>" +
      "</div>" +
      "</form>"
    );
  }

  function openAddModal(refresh) {
    const backdrop = FelixApp.openModal(musicFormHtml());
    const note = backdrop.querySelector("#music-form-note");
    note.textContent = "This track will be deployed to " + previewTargetFile(allMusic);

    backdrop.querySelector("#music-form-cancel").addEventListener("click", FelixApp.closeModal);
    backdrop.querySelector("#music-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { title: fd.get("title").trim(), url: fd.get("url").trim() };
      const errors = Validation.validateMusicInput(body);
      if (errors.length) {
        note.innerHTML = '<span style="color:var(--danger);">' + Utils.escapeHtml(errors[0]) + "</span>";
        return;
      }
      const submitBtn = backdrop.querySelector("#music-form-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Deploying...";
      try {
        const res = await FelixApp.apiFetch("/api/music", { method: "POST", body });
        FelixApp.showToast("success", res.message);
        FelixApp.closeModal();
        refresh();
      } catch (err) {
        note.innerHTML = '<span style="color:var(--danger);">' + Utils.escapeHtml(err.message) + "</span>";
        submitBtn.disabled = false;
        submitBtn.textContent = "Deploy Music";
      }
    });
  }

  function openEditModal(item, refresh) {
    const backdrop = FelixApp.openModal(musicFormHtml(Object.assign({}, item, { __isEdit: true })));
    backdrop.querySelector("#music-form-cancel").addEventListener("click", FelixApp.closeModal);
    backdrop.querySelector("#music-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        file: item.__file,
        index: item.__index,
        originalTitle: item.title,
        originalUrl: item.url,
        title: fd.get("title").trim(),
        url: fd.get("url").trim()
      };
      const errors = Validation.validateMusicInput(body);
      if (errors.length) {
        FelixApp.showToast("error", errors[0]);
        return;
      }
      const submitBtn = backdrop.querySelector("#music-form-submit");
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";
      try {
        const res = await FelixApp.apiFetch("/api/music", { method: "PUT", body });
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

  function openDeleteModal(item, refresh) {
    const backdrop = FelixApp.openModal(
      "<h3>Delete Music</h3>" +
        '<p class="muted">Are you sure you want to delete <strong>' +
        Utils.escapeHtml(item.title) +
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
        const res = await FelixApp.apiFetch("/api/music", {
          method: "DELETE",
          body: { file: item.__file, index: item.__index, originalTitle: item.title, originalUrl: item.url }
        });
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

  window.Pages.music = async function (container) {
    const session = FelixApp.getSession();

    async function load() {
      const data = await FelixApp.apiFetch("/api/music");
      allMusic = data.music;
      render();
    }

    function render() {
      container.innerHTML =
        '<div class="toolbar">' +
        '<div class="toolbar-left"><input id="music-search" placeholder="Search title..." value="' +
        Utils.escapeHtml(searchTerm) +
        '" /></div>' +
        (canManage(session) ? '<button class="btn btn-primary" id="add-music-btn">+ Add Music</button>' : "") +
        "</div>" +
        '<div class="glass card">' +
        renderTable(session) +
        "</div>";

      container.querySelector("#music-search").addEventListener(
        "input",
        Utils.debounce((e) => {
          searchTerm = e.target.value;
          render();
        }, 200)
      );

      container.querySelectorAll("audio").forEach((audioEl) => {
        audioEl.addEventListener("error", () => {
          const wrap = document.createElement("div");
          wrap.className = "muted";
          wrap.style.fontSize = "0.78rem";
          wrap.textContent = "Unable to load audio";
          audioEl.replaceWith(wrap);
        });
      });

      const addBtn = container.querySelector("#add-music-btn");
      if (addBtn) addBtn.addEventListener("click", () => openAddModal(load));

      if (sessionStorage.getItem("felixAutoOpen") === "add-music" && canManage(session)) {
        sessionStorage.removeItem("felixAutoOpen");
        openAddModal(load);
      }

      const filtered = allMusic.filter((m) => !searchTerm || (m.title || "").toLowerCase().includes(searchTerm.toLowerCase()));
      container.querySelectorAll('[data-action="edit"]').forEach((btn) => {
        btn.addEventListener("click", () => openEditModal(filtered[parseInt(btn.getAttribute("data-idx"), 10)], load));
      });
      container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
        btn.addEventListener("click", () => openDeleteModal(filtered[parseInt(btn.getAttribute("data-idx"), 10)], load));
      });
    }

    await load();
  };
})();

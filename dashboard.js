/**
 * dashboard.js
 * Renders the Dashboard page. All numbers come straight from
 * GET /api/dashboard, which reads every users*.json / music*.json file
 * in the repository — nothing here is a placeholder or dummy number.
 */
(function () {
  window.Pages = window.Pages || {};

  function statCard(label, value, small) {
    return (
      '<div class="glass card stat-card">' +
      '<div class="stat-label">' + label + "</div>" +
      '<div class="stat-value' + (small ? " small" : "") + '">' + value + "</div>" +
      "</div>"
    );
  }

  function fileStatusList(files) {
    if (!files.length) {
      return '<div class="empty-state">No files detected yet.</div>';
    }
    return (
      '<div class="file-status-list">' +
      files
        .map((f) => {
          const pct = Math.min(100, Math.round((f.count / f.max) * 100));
          return (
            '<div class="file-status-row">' +
            "<span>" + Utils.escapeHtml(f.name) + "</span>" +
            '<div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
            "<span>" +
            f.count +
            "/" +
            f.max +
            " " +
            (f.full
              ? '<span class="badge badge-danger">Full</span>'
              : '<span class="badge badge-success">Available</span>') +
            "</span>" +
            "</div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  window.Pages.dashboard = async function (container) {
    const data = await FelixApp.apiFetch("/api/dashboard");
    const t = data.totals;

    container.innerHTML =
      '<div class="grid grid-4">' +
      statCard("Total Users", t.totalUsers) +
      statCard("Active Users", t.activeUsers) +
      statCard("Expired Users", t.expiredUsers) +
      statCard("Inactive Users", t.inactiveUsers) +
      "</div>" +
      '<div class="grid grid-4 mt-16">' +
      statCard("Total Music", t.totalMusic) +
      statCard("Owner", t.owner, true) +
      statCard("Moderator", t.moderator, true) +
      statCard("Member", t.member, true) +
      "</div>" +
      '<div class="grid grid-2 mt-16">' +
      '<div class="glass card">' +
      '<h3 class="section-title">User Files &mdash; ' +
      data.userFiles.length +
      " files detected</h3>" +
      fileStatusList(data.userFiles) +
      "</div>" +
      '<div class="glass card">' +
      '<h3 class="section-title">Music Files &mdash; ' +
      data.musicFiles.length +
      " files detected</h3>" +
      fileStatusList(data.musicFiles) +
      "</div>" +
      "</div>" +
      '<div class="muted mt-16" style="font-size:0.8rem;">Last synced: ' +
      new Date(data.syncedAt).toLocaleTimeString() +
      "</div>";
  };
})();

/**
 * settings.js
 * Renders the read-only Settings page. The GitHub token is never
 * requested from, or returned by, the server for this page.
 */
(function () {
  window.Pages = window.Pages || {};

  function row(label, value) {
    return (
      '<div class="file-status-row" style="justify-content:flex-start; gap:16px;">' +
      '<span class="muted" style="min-width:180px;">' +
      Utils.escapeHtml(label) +
      "</span><span>" +
      value +
      "</span></div>"
    );
  }

  window.Pages.settings = async function (container) {
    const data = await FelixApp.apiFetch("/api/settings");
    const statusBadgeClass = data.githubStatus === "Connected" ? "badge-success" : "badge-danger";

    container.innerHTML =
      '<div class="glass card">' +
      '<h3 class="section-title">Connection</h3>' +
      '<div class="file-status-list">' +
      row("GitHub Status", '<span class="badge ' + statusBadgeClass + '">' + data.githubStatus + "</span>") +
      row("Repository", Utils.escapeHtml(data.repository)) +
      row("Branch", Utils.escapeHtml(data.branch)) +
      "</div></div>" +
      '<div class="glass card mt-16">' +
      '<h3 class="section-title">File Discovery</h3>' +
      '<div class="file-status-list">' +
      row("User File Pattern", Utils.escapeHtml(data.userFilePattern)) +
      row("Music File Pattern", Utils.escapeHtml(data.musicFilePattern)) +
      row("Maximum Users Per File", data.maxUsersPerFile) +
      row("Maximum Music Per File", data.maxMusicPerFile) +
      "</div></div>" +
      '<div class="glass card mt-16">' +
      '<h3 class="section-title">Branding</h3>' +
      '<div class="file-status-list">' +
      row("App Name", Utils.escapeHtml(data.appName)) +
      row("Project By", Utils.escapeHtml(data.projectBy)) +
      "</div></div>";
  };
})();

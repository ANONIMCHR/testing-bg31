/**
 * deploy.js
 * Renders the Deploy Center page: connection/repo/branch status and the
 * two big deploy buttons. "Deploying" here always happens through the
 * same rotation-aware Add User / Add Music flow (users.js / music.js) —
 * these buttons just take you straight there with the form open.
 */
(function () {
  window.Pages = window.Pages || {};

  window.Pages.deploy = async function (container) {
    const data = await FelixApp.apiFetch("/api/deploy");
    const statusBadgeClass = data.githubStatus === "Connected" ? "badge-success" : "badge-danger";

    container.innerHTML =
      '<div class="deploy-buttons">' +
      '<button class="btn btn-primary btn-big" id="deploy-user-btn">DEPLOY USER</button>' +
      '<button class="btn btn-primary btn-big" id="deploy-music-btn">DEPLOY MUSIC</button>' +
      "</div>" +
      '<div class="glass card">' +
      '<h3 class="section-title">GitHub Status</h3>' +
      '<div class="grid grid-2">' +
      statRow("Status", '<span class="badge ' + statusBadgeClass + '">' + data.githubStatus + "</span>") +
      statRow("Repository", Utils.escapeHtml(data.repository)) +
      statRow("Branch", Utils.escapeHtml(data.branch)) +
      statRow("User Files Detected", data.userFilesDetected) +
      statRow("Music Files Detected", data.musicFilesDetected) +
      "</div>" +
      "</div>";

    container.querySelector("#deploy-user-btn").addEventListener("click", () => {
      sessionStorage.setItem("felixAutoOpen", "add-user");
      location.hash = "#users";
    });
    container.querySelector("#deploy-music-btn").addEventListener("click", () => {
      sessionStorage.setItem("felixAutoOpen", "add-music");
      location.hash = "#music";
    });
  };

  function statRow(label, value) {
    return (
      '<div><div class="muted" style="font-size:0.78rem; margin-bottom:4px;">' +
      label +
      "</div><div>" +
      value +
      "</div></div>"
    );
  }
})();

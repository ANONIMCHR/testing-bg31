/**
 * leaderboard.js
 * Renders the Leaderboard page. Never invents fake scores: if no user
 * record currently has a numeric "score" field, it shows an honest
 * empty state. The moment a "score" field is added to any user JSON
 * record, this page (and api/leaderboard.js) will pick it up automatically.
 */
(function () {
  window.Pages = window.Pages || {};

  function medal(rank) {
    if (rank === 1) return '<span class="badge badge-role-owner">#1</span>';
    if (rank === 2) return '<span class="badge badge-role-moderator">#2</span>';
    if (rank === 3) return '<span class="badge badge-warning">#3</span>';
    return "#" + rank;
  }

  window.Pages.leaderboard = async function (container) {
    const data = await FelixApp.apiFetch("/api/leaderboard");

    if (!data.available) {
      container.innerHTML =
        '<div class="glass card empty-state">' +
        "<p>" + Utils.escapeHtml(data.message) + "</p>" +
        '<p class="muted" style="font-size:0.8rem;">Add a numeric "score" field to a user record in users*.json to enable the leaderboard — no code changes required.</p>' +
        "</div>";
      return;
    }

    const rows = data.leaderboard
      .map(
        (u) =>
          "<tr><td>" +
          medal(u.rank) +
          "</td><td>" +
          Utils.escapeHtml(u.username) +
          "</td><td>" +
          Utils.escapeHtml(u.name || "-") +
          "</td><td>" +
          Utils.escapeHtml(String(u.score)) +
          "</td></tr>"
      )
      .join("");

    container.innerHTML =
      '<div class="glass card"><div class="table-wrap"><table>' +
      "<thead><tr><th>Rank</th><th>Username</th><th>Name</th><th>Score</th></tr></thead>" +
      "<tbody>" +
      rows +
      "</tbody></table></div></div>";
  };
})();

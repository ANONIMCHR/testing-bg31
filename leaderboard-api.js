const github = require("./github");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  try {
    await github.requireAuth(req);
    const { users } = await github.getAllUsers();
    const withScore = users.filter((u) => typeof u.score === "number");

    if (withScore.length === 0) {
      return res.status(200).json({
        success: true,
        available: false,
        message: "No leaderboard score data available."
      });
    }

    const ranked = withScore
      .slice()
      .sort((a, b) => b.score - a.score)
      .map(({ password, ...rest }, i) => Object.assign({ rank: i + 1 }, rest));

    return res.status(200).json({ success: true, available: true, leaderboard: ranked });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

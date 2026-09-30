const github = require("./github");
const config = require("./config");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  try {
    await github.requireAuth(req);
    const connected = await github.testConnection();

    res.status(200).json({
      success: true,
      githubStatus: connected ? "Connected" : "Disconnected",
      repository: (process.env.GITHUB_OWNER || "?") + "/" + (process.env.GITHUB_REPO || "?"),
      branch: config.GITHUB_BRANCH,
      userFilePattern: config.USERS_FILE_PREFIX + ".json, " + config.USERS_FILE_PREFIX + "2.json, " + config.USERS_FILE_PREFIX + "3.json, ...",
      musicFilePattern: config.MUSIC_FILE_PREFIX + ".json, " + config.MUSIC_FILE_PREFIX + "2.json, " + config.MUSIC_FILE_PREFIX + "3.json, ...",
      maxUsersPerFile: config.MAX_USERS_PER_FILE,
      maxMusicPerFile: config.MAX_MUSIC_PER_FILE,
      appName: config.APP_NAME,
      projectBy: config.PROJECT_BY
    });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

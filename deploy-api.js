const github = require("./github");
const config = require("./config");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  try {
    await github.requireAuth(req);
    const connected = await github.testConnection();
    const [userFiles, musicFiles] = await Promise.all([github.getAllUserFiles(), github.getAllMusicFiles()]);

    res.status(200).json({
      success: true,
      githubStatus: connected ? "Connected" : "Disconnected",
      repository: (process.env.GITHUB_OWNER || "?") + "/" + (process.env.GITHUB_REPO || "?"),
      branch: config.GITHUB_BRANCH,
      userFilesDetected: userFiles.length,
      musicFilesDetected: musicFiles.length
    });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

const github = require("./github");
const validation = require("./validation");

module.exports = async function handler(req, res) {
  try {
    const authedUser = await github.requireAuth(req);

    if (req.method === "GET") {
      const { music } = await github.getAllMusic();
      return res.status(200).json({ success: true, music });
    }

    // Music can be managed by Owner and Moderator; Members are read-only.
    github.requireRole(authedUser, ["Owner", "Moderator"]);

    if (req.method === "POST") {
      const body = req.body || {};
      const errors = validation.validateMusicInput(body);
      if (errors.length) {
        return res.status(400).json({ success: false, message: errors[0] });
      }
      const newMusic = { title: String(body.title).trim(), url: String(body.url).trim() };
      const result = await github.addMusicWithRotation(newMusic);
      return res.status(200).json({
        success: true,
        message: "Music deployed successfully to " + result.file,
        file: result.file
      });
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      if (!body.file || body.index === undefined || !body.originalTitle || !body.originalUrl) {
        return res.status(400).json({ success: false, message: "Missing reference to the music entry being edited." });
      }
      const errors = validation.validateMusicInput(body);
      if (errors.length) {
        return res.status(400).json({ success: false, message: errors[0] });
      }
      const result = await github.editMusic(
        body.file,
        body.index,
        { title: String(body.title).trim(), url: String(body.url).trim() },
        { originalTitle: body.originalTitle, originalUrl: body.originalUrl }
      );
      return res.status(200).json({ success: true, message: "Music updated in " + result.file, file: result.file });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      if (!body.file || body.index === undefined || !body.originalTitle || !body.originalUrl) {
        return res.status(400).json({ success: false, message: "Missing reference to the music entry being deleted." });
      }
      const result = await github.deleteMusic(body.file, body.index, {
        originalTitle: body.originalTitle,
        originalUrl: body.originalUrl
      });
      return res.status(200).json({ success: true, message: "Music removed from " + result.file, file: result.file });
    }

    return res.status(405).json({ success: false, message: "Method not allowed." });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

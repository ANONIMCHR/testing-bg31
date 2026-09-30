const github = require("./github");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  try {
    const body = req.body || {};
    const { username, password } = body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }
    const user = await github.authenticateUser(username, password);
    return res.status(200).json({ success: true, user: user });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    return res.status(status).json({ success: false, message });
  }
};

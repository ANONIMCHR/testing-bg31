const github = require("./github");
const validation = require("./validation");

module.exports = async function handler(req, res) {
  try {
    const authedUser = await github.requireAuth(req);

    if (req.method === "GET") {
      const { users } = await github.getAllUsers();
      const safeUsers = users.map(({ password, ...rest }) => rest);
      return res.status(200).json({ success: true, users: safeUsers });
    }

    // Only Owner/Moderator may add, edit or delete users.
    github.requireRole(authedUser, ["Owner", "Moderator"]);

    if (req.method === "POST") {
      const body = req.body || {};
      const errors = validation.validateUserInput(body);
      if (errors.length) {
        return res.status(400).json({ success: false, message: errors[0] });
      }
      const newUser = {
        username: String(body.username).trim(),
        password: body.password,
        name: String(body.name).trim(),
        role: body.role,
        active: body.active !== undefined ? !!body.active : true,
        expiresAt: body.expiresAt
      };
      const result = await github.addUserWithRotation(newUser);
      return res.status(200).json({
        success: true,
        message: "User deployed successfully to " + result.file,
        file: result.file
      });
    }

    if (req.method === "PUT") {
      const body = req.body || {};
      if (!body.username) {
        return res.status(400).json({ success: false, message: "Username is required." });
      }
      const errors = validation.validateUserUpdate(body);
      if (errors.length) {
        return res.status(400).json({ success: false, message: errors[0] });
      }
      const updates = {};
      ["password", "name", "role", "active", "expiresAt"].forEach((k) => {
        if (body[k] !== undefined) updates[k] = body[k];
      });
      const result = await github.editUser(body.username, updates);
      return res.status(200).json({
        success: true,
        message: "User updated in " + result.file,
        file: result.file
      });
    }

    if (req.method === "DELETE") {
      const body = req.body || {};
      if (!body.username) {
        return res.status(400).json({ success: false, message: "Username is required." });
      }
      const result = await github.deleteUser(body.username);
      return res.status(200).json({
        success: true,
        message: "User removed from " + result.file,
        file: result.file
      });
    }

    return res.status(405).json({ success: false, message: "Method not allowed." });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

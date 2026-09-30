const github = require("./github");
const config = require("./config");
const Utils = require("./utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method not allowed." });
  }
  try {
    await github.requireAuth(req);

    const [{ users, files: userFiles }, { music, files: musicFiles }] = await Promise.all([
      github.getAllUsers(),
      github.getAllMusic()
    ]);

    const today = Utils.todayISO();
    let active = 0,
      expired = 0,
      inactive = 0,
      owner = 0,
      moderator = 0,
      member = 0;

    users.forEach((u) => {
      if (u.active === false) {
        inactive++;
      } else if (u.expiresAt && String(u.expiresAt) < today) {
        expired++;
      } else {
        active++;
      }
      if (u.role === "Owner") owner++;
      else if (u.role === "Moderator") moderator++;
      else if (u.role === "Member") member++;
    });

    res.status(200).json({
      success: true,
      totals: {
        totalUsers: users.length,
        activeUsers: active,
        expiredUsers: expired,
        inactiveUsers: inactive,
        totalMusic: music.length,
        owner,
        moderator,
        member
      },
      userFiles: userFiles.map((f) => ({
        name: f.name,
        count: f.count,
        max: config.MAX_USERS_PER_FILE,
        full: Utils.isFull(f.count, config.MAX_USERS_PER_FILE)
      })),
      musicFiles: musicFiles.map((f) => ({
        name: f.name,
        count: f.count,
        max: config.MAX_MUSIC_PER_FILE,
        full: Utils.isFull(f.count, config.MAX_MUSIC_PER_FILE)
      })),
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    const { status, message } = github.toSafeError(err);
    res.status(status).json({ success: false, message });
  }
};

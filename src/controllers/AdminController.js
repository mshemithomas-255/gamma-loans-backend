// controllers/adminController.js
const ActivityLog = require("../models/ActivityLogs.js");
const LoanStat = require("../models/LoanStat.js");
const Notification = require("../models/Notification.js");
const User = require("../models/User.js");
const Loan = require("../models/Loan.js");

// Fetch summary data
exports.getSummary = async (req, res) => {
  try {
    const totalBorrowed = await Loan.aggregate([
      { $group: { _id: null, total: { $sum: "$loanAmount" } } },
    ]);
    // Total users registered (excluding admins)
    const totalUsers = await User.countDocuments({ role: { $ne: "admin" } });
    const totalInterest = await Loan.aggregate([
      { $group: { _id: null, total: { $sum: "$interest" } } },
    ]);

    res.status(200).json({
      totalBorrowed: totalBorrowed[0]?.total || 0,
      totalUsers,
      totalInterest: totalInterest[0]?.total || 0,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch summary data." });
  }
};

// Fetch all loans with filtering
exports.getLoans = async (req, res) => {
  try {
    const { filter } = req.query;
    const now = new Date();
    let query = {};

    switch (filter) {
      case "day":
        query.createdAt = { $gte: startOfDay(now), $lte: endOfDay(now) };
        break;
      case "week":
        query.createdAt = { $gte: startOfWeek(now), $lte: endOfWeek(now) };
        break;
      case "month":
        query.createdAt = { $gte: startOfMonth(now), $lte: endOfMonth(now) };
        break;
      default:
        break;
    }

    const loans = await Loan.find(query).populate("userId", "fullName");
    res.status(200).json(loans);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch loans." });
  }
};

// Fetch activity logs
exports.getActivityLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find().populate("userId", "fullName");
    res.status(200).json(logs);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity logs." });
  }
};

// Fetch loan statistics
exports.getLoanStats = async (req, res) => {
  try {
    const stats = await Loan.findOne();
    res.status(200).json(stats || { approved: 0, pending: 0, fullyPaid: 0 });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch loan statistics." });
  }
};

// Fetch all users
exports.getUsers = async (req, res) => {
  //  -removed from filter below isActive
  try {
    const users = await User.find({});
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch users." });
  }
};

// Toggle user status (block/unblock)
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({ message: "User status updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle user status." });
  }
};

// Fetch notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find().sort({ timestamp: -1 });
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch notifications." });
  }
};

// Update admin credentials
exports.updateCredentials = async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await User.findOne({ role: "admin" });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    admin.username = username;
    admin.password = password;
    await admin.save();

    res
      .status(200)
      .json({ message: "Admin credentials updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to update admin credentials." });
  }
};

// Delete User
exports.deleteUser = async (req, res) => {
  const { id } = req.params;
  await User.findByIdAndDelete(id);
  res.json({ message: "User deleted successfully" });
};

// exports.deleteAll
exports.deleteAllForUser = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log(`Deleting user ${userId} and associated loans`);

    const loanResult = await Loan.deleteMany({ userId });
    console.log(`Deleted ${loanResult.deletedCount} loans`);

    const userResult = await User.findByIdAndDelete(userId);
    console.log(`Deleted user:`, userResult);

    if (!userResult) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      message: "User and all associated data deleted successfully.",
      deletedUserId: userId,
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({
      error: error.message || "An error occurred while deleting.",
    });
  }
};

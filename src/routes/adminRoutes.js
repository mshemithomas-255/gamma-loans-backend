// routes/adminRoutes.js
const express = require("express");
const adminController = require("../controllers/AdminController");
const authMiddleware = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/authenticate");

const router = express.Router();

// Secure all routes with authentication and admin authorization
router.use(authMiddleware, isAdmin);

router.get("/summary", adminController.getSummary);
router.get("/loans", adminController.getLoans);
router.get("/activity-logs", adminController.getActivityLogs);
router.get("/loan-stats", adminController.getLoanStats);
router.get("/users", adminController.getUsers);
router.delete("/users/delete/:id", adminController.deleteAllForUser);
router.put("/toggle-user-status/:userId", adminController.toggleUserStatus);
router.get("/notifications", adminController.getNotifications);
router.put("/change-credentials", adminController.updateCredentials);

module.exports = router;

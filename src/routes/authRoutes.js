const express = require("express");
const {
  registerUser,
  loginUser,
  getUserProfile,
  validateToken,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/profile", protect, getUserProfile);
router.get("/validate-token", protect, validateToken);

module.exports = router;

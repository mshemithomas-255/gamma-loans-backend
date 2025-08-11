const express = require("express");
const axios = require("axios");
const router = express.Router();
const User = require("../models/User");
const Loan = require("../models/Loan");
const bcrypt = require("bcryptjs");
const authMiddleware = require("../middleware/authMiddleware");

// Submit a cleanup request
router.post("/request-cleanup", async (req, res) => {
  try {
    const { fullName, phoneNumber, location } = req.body;

    // Validate input
    if (!fullName || !phoneNumber || !location) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Save the request to the database
    const newRequest = new CleanUpRequest({ fullName, phoneNumber, location });
    await newRequest.save();

    res
      .status(201)
      .json({ message: "Request submitted successfully!", newRequest });
  } catch (error) {
    console.error("Error submitting request:", error);
    res.status(500).json({ message: "Failed to submit request." });
  }
});

// Fetch current user profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user profile
router.put("/update-profile", authMiddleware, async (req, res) => {
  const {
    fullName,
    email,
    mobileNumber,
    alternateMobileNumber,
    profilePhoto,
    idFrontPhoto,
    idBackPhoto,
    idNumber,
  } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        fullName,
        email,
        mobileNumber,
        alternateMobileNumber,
        profilePhoto,
        idFrontPhoto,
        idBackPhoto,
        idNumber,
      },
      { new: true }
    ).select("-password");

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Change password
router.put("/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    // Find the user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Verify the current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );
    if (!isPasswordValid) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the user's password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred. Please try again." });
  }
});

// Route 1: Verify ID Number
router.post("/forgot-password/verify-id", async (req, res) => {
  const { idNumber } = req.body;

  try {
    const user = await User.findOne({ idNumber });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "ID verified", userId: user._id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Route 2: Update Password
router.put("/forgot-password/update-password", async (req, res) => {
  const { userId, newPassword, confirmPassword } = req.body;

  try {
    // Validate password length
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    // Validate password match
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    // Find the user by ID
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the user's password
    user.password = hashedPassword;

    // Save the updated user
    await user.save();

    console.log("Password updated successfully for user:", user._id); // Debugging
    res
      .status(200)
      .json({ message: "You have updated the password successfully" });
  } catch (error) {
    console.error("Error updating password:", error); // Detailed error logging
    res.status(500).json({ message: "Server error" });
  }
});

// pay loan

module.exports = router;

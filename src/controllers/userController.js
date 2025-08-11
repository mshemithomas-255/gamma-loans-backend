const User = require("../models/Collector");
const asyncHandler = require("express-async-handler");

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({}).select("-password");
  res.json(users);
});

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Create a user
// @route   POST /api/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
  const { name, email, mobile, password, role } = req.body;

  const userExists = await User.findOne({ $or: [{ email }, { mobile }] });
  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const user = await User.create({
    name,
    email,
    mobile,
    password,
    role,
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      role: user.role,
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    user.mobile = req.body.mobile || user.mobile;
    user.role = req.body.role || user.role;

    if (req.body.password) {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      mobile: updatedUser.mobile,
      role: updatedUser.role,
    });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const requestingUser = req.user; // Logged-in user from auth middleware

  // Find target user
  const targetUser = await User.findById(id);
  if (!targetUser) {
    res.status(404);
    throw new Error("User not found");
  }

  // Authorization checks
  if (id === requestingUser._id.toString()) {
    res.status(403);
    throw new Error("You cannot delete yourself");
  }

  if (requestingUser.role === "admin" && targetUser.role === "superadmin") {
    res.status(403);
    throw new Error("Admins cannot delete superadmins");
  }

  if (requestingUser.role === "admin" && targetUser.role === "admin") {
    res.status(403);
    throw new Error("Admins cannot delete other admins");
  }

  // Cleanup references (if needed)
  await Plot.updateMany({ users: id }, { $pull: { users: id } });

  // Delete user
  await User.deleteOne({ _id: id });
  res.json({ message: "User deleted successfully" });
});

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};

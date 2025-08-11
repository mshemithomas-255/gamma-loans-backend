const Plot = require("../models/Plot");
const Location = require("../models/Location");
const User = require("../models/Collector");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

// @desc    Get all plots with populated location and users
// @route   GET /api/plots
// @access  Private/Admin
const getPlots = asyncHandler(async (req, res) => {
  const plots = await Plot.find({})
    .populate("location", "name")
    .populate("users", "name email mobile");
  res.status(200).json(plots);
});

// @desc    Create new plot and update location
// @route   POST /api/plots
// @access  Private/Admin
const createPlot = asyncHandler(async (req, res) => {
  try {
    const { plotNumber, bagsRequired, location } = req.body;

    // Validate required fields
    if (!plotNumber || !bagsRequired || !location) {
      res.status(400);
      throw new Error(
        "Please provide all required fields: plotNumber, bagsRequired, location"
      );
    }

    // Check if plot already exists
    const plotExists = await Plot.findOne({ plotNumber });
    if (plotExists) {
      res.status(400);
      throw new Error("Plot already exists");
    }

    // Verify location exists and is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(location)) {
      res.status(400);
      throw new Error("Invalid location ID format");
    }

    const locationExists = await Location.findById(location);
    if (!locationExists) {
      res.status(404);
      throw new Error("Location not found");
    }

    // Create new plot
    const plot = await Plot.create({
      plotNumber,
      bagsRequired,
      location,
    });

    if (!plot) {
      res.status(400);
      throw new Error("Failed to create plot");
    }

    // Update location with new plot reference
    locationExists.plots.push(plot._id);
    await locationExists.save();

    res.status(201).json({
      success: true,
      data: plot,
    });
  } catch (error) {
    console.error("Error creating plot:", error.message);
    res.status(res.statusCode === 200 ? 500 : res.statusCode).json({
      success: false,
      error: error.message || "Something went wrong",
    });
  }
});

// @desc    Update plot details
// @route   PUT /api/plots/:id
// @access  Private/Admin
const updatePlot = asyncHandler(async (req, res) => {
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    res.status(404);
    throw new Error("Plot not found");
  }

  // Update plot fields
  plot.plotNumber = req.body.plotNumber || plot.plotNumber;
  plot.bagsRequired = req.body.bagsRequired || plot.bagsRequired;
  plot.location = req.body.location || plot.location;

  const updatedPlot = await plot.save();
  res.status(200).json(updatedPlot);
});

// @desc    Delete plot
// @route   DELETE /api/plots/:id
// @access  Private/Admin
const deletePlot = asyncHandler(async (req, res) => {
  try {
    const plot = await Plot.findById(req.params.id);

    if (!plot) {
      return res.status(404).json({
        success: false,
        message: "Plot not found",
      });
    }

    // Remove plot from location
    if (plot.location) {
      await Location.findByIdAndUpdate(
        plot.location,
        { $pull: { plots: plot._id } },
        { new: true }
      );
    }

    // Remove plot from all assigned users if there are any
    if (plot.users && plot.users.length > 0) {
      await User.updateMany(
        { _id: { $in: plot.users } },
        { $pull: { plots: plot._id } }
      );
    }

    // Delete the plot
    await Plot.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Plot deleted successfully",
      data: {
        id: req.params.id,
      },
    });
  } catch (error) {
    console.error("Error deleting plot:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete plot",
      error: error.message,
    });
  }
});

// @desc    Replace all users assigned to plot
// @route   PUT /api/plots/:id/assign
// @access  Private/Admin
const assignUsersToPlot = asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    res.status(404);
    throw new Error("Plot not found");
  }

  // Verify all users exist
  const users = await User.find({ _id: { $in: userIds } });
  if (users.length !== userIds.length) {
    res.status(400);
    throw new Error("One or more users not found");
  }

  // Remove plot from current users
  await User.updateMany(
    { _id: { $in: plot.users } },
    { $pull: { plots: plot._id } }
  );

  // Assign new users
  plot.users = userIds;
  await plot.save();

  // Add plot to new users
  await User.updateMany(
    { _id: { $in: userIds } },
    { $addToSet: { plots: plot._id } }
  );

  // Return populated plot data
  const updatedPlot = await Plot.findById(plot._id)
    .populate("location", "name")
    .populate("users", "name email mobile");

  res.status(200).json(updatedPlot);
});

// @desc    Add users to plot without removing existing ones
// @route   PUT /api/plots/:id/add-users
// @access  Private/Admin
const addUsersToPlot = asyncHandler(async (req, res) => {
  const { userIds } = req.body;
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    res.status(404);
    throw new Error("Plot not found");
  }

  // Verify all users exist
  const users = await User.find({ _id: { $in: userIds } });
  if (users.length !== userIds.length) {
    res.status(400);
    throw new Error("One or more users not found");
  }

  // Add users to plot (using addToSet to prevent duplicates)
  userIds.forEach((userId) => plot.users.addToSet(userId));
  await plot.save();

  // Add plot to users
  await User.updateMany(
    { _id: { $in: userIds } },
    { $addToSet: { plots: plot._id } }
  );

  // Return populated plot data
  const updatedPlot = await Plot.findById(plot._id)
    .populate("location", "name")
    .populate("users", "name email mobile");

  res.status(200).json(updatedPlot);
});

// @desc    Remove specific user from plot
// @route   PUT /api/plots/:id/remove-user
// @access  Private/Admin
const removeUserFromPlot = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const plot = await Plot.findById(req.params.id);

  if (!plot) {
    res.status(404);
    throw new Error("Plot not found");
  }

  // Remove user from plot
  plot.users.pull(userId);
  await plot.save();

  // Remove plot from user
  await User.findByIdAndUpdate(userId, {
    $pull: { plots: plot._id },
  });

  // Return populated plot data
  const updatedPlot = await Plot.findById(plot._id)
    .populate("location", "name")
    .populate("users", "name email mobile");

  res.status(200).json(updatedPlot);
});

module.exports = {
  getPlots,
  createPlot,
  updatePlot,
  deletePlot,
  assignUsersToPlot,
  addUsersToPlot,
  removeUserFromPlot,
};

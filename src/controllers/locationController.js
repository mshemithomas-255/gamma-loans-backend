const Location = require("../models/Location");
const asyncHandler = require("express-async-handler");

// @desc    Get all locations
// @route   GET /api/locations
// @access  Private/Admin
const getLocations = asyncHandler(async (req, res) => {
  const locations = await Location.find({});
  res.json(locations);
});

// @desc    Create a location
// @route   POST /api/locations
// @access  Private/Admin
const createLocation = asyncHandler(async (req, res) => {
  const { name } = req.body;

  const locationExists = await Location.findOne({ name });
  if (locationExists) {
    res.status(400);
    throw new Error("Location already exists");
  }

  const location = await Location.create({
    name,
  });

  if (location) {
    res.status(201).json(location);
  } else {
    res.status(400);
    throw new Error("Invalid location data");
  }
});

// @desc    Update location
// @route   PUT /api/locations/:id
// @access  Private/Admin
const updateLocation = asyncHandler(async (req, res) => {
  const location = await Location.findById(req.params.id);

  if (location) {
    location.name = req.body.name || location.name;

    const updatedLocation = await location.save();

    res.json(updatedLocation);
  } else {
    res.status(404);
    throw new Error("Location not found");
  }
});

// @desc    Delete location
// @route   DELETE /api/locations/:id
// @access  Private/Admin
const deleteLocation = asyncHandler(async (req, res) => {
  const location = await Location.findById(req.params.id);

  if (location) {
    await location.remove();
    res.json({ message: "Location removed" });
  } else {
    res.status(404);
    throw new Error("Location not found");
  }
});

module.exports = {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
};

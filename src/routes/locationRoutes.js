const express = require("express");
const { protect, admin } = require("../middleware/auth");
const {
  getLocations,
  createLocation,
  updateLocation,
  deleteLocation,
} = require("../controllers/locationController");

const router = express.Router();

router
  .route("/")
  .get(protect, admin, getLocations)
  .post(protect, admin, createLocation);

router
  .route("/:id")
  .put(protect, admin, updateLocation)
  .delete(protect, admin, deleteLocation);

module.exports = router;

const express = require("express");
const { protect, admin } = require("../middleware/auth");
const {
  getPlots,
  createPlot,
  updatePlot,
  deletePlot,
  assignUsersToPlot,
  addUsersToPlot,
  removeUserFromPlot,
} = require("../controllers/plotController");

const router = express.Router();

// @desc create a plot
// @route POST /api/plots/create
router.post("/create", protect, admin, createPlot);

// @desc get all plots
// @route GET /api/plots/all
router.get("/all", protect, admin, getPlots);

// Base plot routes
// router
//   .route("/")
//   .get(protect, admin, getPlots)
//   .post(protect, admin, createPlot);

router
  .route("/:id")
  .put(protect, admin, updatePlot)
  .delete(protect, admin, deletePlot);

// User assignment routes
router.route("/:id/assign").put(protect, admin, assignUsersToPlot); // Replace all users
router.route("/:id/add-users").put(protect, admin, addUsersToPlot); // Add users incrementally
router.route("/:id/remove-user").put(protect, admin, removeUserFromPlot); // Remove specific user

module.exports = router;

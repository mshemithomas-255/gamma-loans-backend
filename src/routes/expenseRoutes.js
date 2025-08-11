const express = require("express");
const {
  createExpense,
  getAllExpenses,
  getExpenseSummary,
  updateExpense,
  deleteExpense,
  exportExpenses,
} = require("../controllers/expenseController");
const { protect, admin } = require("../middleware/auth");

const router = express.Router();

router
  .route("/")
  .post(protect, admin, createExpense)
  .get(protect, admin, getAllExpenses);

router.route("/summary/:month/:year").get(protect, admin, getExpenseSummary);

router.route("/export/:format").get(protect, admin, exportExpenses);

router
  .route("/:id")
  .put(protect, admin, updateExpense)
  .delete(protect, admin, deleteExpense);

module.exports = router;

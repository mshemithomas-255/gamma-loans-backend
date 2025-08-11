const Expense = require("../models/Expense");
const asyncHandler = require("express-async-handler");
const moment = require("moment");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");
const { ObjectId } = require("mongodb");

// @desc    Create new expense
// @route   POST /api/expenses
// @access  Private/Admin
const createExpense = asyncHandler(async (req, res) => {
  const { description, amount, category, date } = req.body;

  if (!description || !amount || !category || !date) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required fields: description, amount, category, or date",
    });
  }

  try {
    const expenseDate = moment(date);
    const expense = await Expense.create({
      description,
      amount: parseFloat(amount),
      category,
      date: expenseDate.toDate(),
      month: expenseDate.format("MMMM"),
      year: expenseDate.format("YYYY"),
      addedBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: await expense.populate("addedBy", "name email"),
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        messages,
      });
    }
    console.error(`Error creating expense: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while creating expense",
    });
  }
});

// @desc    Get all expenses with advanced filtering
// @route   GET /api/expenses
// @access  Private/Admin
const getAllExpenses = asyncHandler(async (req, res) => {
  try {
    const {
      month,
      year,
      category,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = "date",
      sortOrder = "desc",
    } = req.query;

    const query = {};
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Date filtering
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    } else if (month && year) {
      const start = moment(`${year}-${month}`, "YYYY-MMMM").startOf("month");
      const end = moment(start).endOf("month");
      query.date = { $gte: start.toDate(), $lte: end.toDate() };
    }

    // Category filtering
    if (category) {
      query.category = Array.isArray(category) ? { $in: category } : category;
    }

    // Amount range filtering
    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    // Add user filter if not admin (example)
    // if (!req.user.isAdmin) {
    //   query.addedBy = req.user._id;
    // }

    const expenses = await Expense.find(query)
      .collation({ locale: "en" }) // For case-insensitive sorting
      .sort(sort)
      .populate("addedBy", "name email")
      .lean(); // Using lean() for better performance

    res.json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error(`Error fetching expenses: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while fetching expenses",
    });
  }
});

// @desc    Get expense summary with more detailed analytics
// @route   GET /api/expenses/summary/:month/:year
// @access  Private/Admin
const getExpenseSummary = asyncHandler(async (req, res) => {
  try {
    const { month, year } = req.params;
    const { compareWithPrevious } = req.query;

    // Validate month and year
    if (!moment(`${year}-${month}`, "YYYY-MMMM").isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid month or year format",
      });
    }

    const start = moment(`${year}-${month}`, "YYYY-MMMM").startOf("month");
    const end = moment(start).endOf("month");

    // Main aggregation pipeline
    const pipeline = [
      {
        $match: {
          date: { $gte: start.toDate(), $lte: end.toDate() },
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                totalAmount: { $sum: "$amount" },
                averageAmount: { $avg: "$amount" },
                count: { $sum: 1 },
                maxExpense: { $max: "$amount" },
                minExpense: { $min: "$amount" },
              },
            },
          ],
          byCategory: [
            {
              $group: {
                _id: "$category",
                totalAmount: { $sum: "$amount" },
                count: { $sum: 1 },
                averageAmount: { $avg: "$amount" },
              },
            },
            { $sort: { totalAmount: -1 } },
          ],
          dailyTrend: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                totalAmount: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
      {
        $project: {
          summary: { $arrayElemAt: ["$summary", 0] },
          byCategory: 1,
          dailyTrend: 1,
        },
      },
    ];

    // Optional comparison with previous period
    if (compareWithPrevious === "true") {
      const prevStart = moment(start).subtract(1, "month");
      const prevEnd = moment(prevStart).endOf("month");

      pipeline[0].$match.$or = [
        { date: { $gte: start.toDate(), $lte: end.toDate() } },
        { date: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() } },
      ];

      pipeline[0].$facet.previousPeriod = [
        {
          $match: {
            date: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ];

      pipeline[1].$project.previousPeriod = {
        $arrayElemAt: ["$previousPeriod", 0],
      };
    }

    const [result] = await Expense.aggregate(pipeline);

    if (!result.summary) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalAmount: 0,
            averageAmount: 0,
            count: 0,
            maxExpense: 0,
            minExpense: 0,
          },
          byCategory: [],
          dailyTrend: [],
          comparison: null,
        },
      });
    }

    // Calculate percentages for categories
    const byCategoryWithPercentage = result.byCategory.map((cat) => ({
      ...cat,
      percentage: (cat.totalAmount / result.summary.totalAmount) * 100,
    }));

    // Prepare comparison data if available
    let comparison = null;
    if (result.previousPeriod) {
      const changeAmount =
        result.summary.totalAmount - result.previousPeriod.totalAmount;
      const changePercentage =
        (changeAmount / result.previousPeriod.totalAmount) * 100;
      const changeCount = result.summary.count - result.previousPeriod.count;

      comparison = {
        previousTotal: result.previousPeriod.totalAmount,
        totalChange: {
          amount: changeAmount,
          percentage: changePercentage,
          direction: changeAmount >= 0 ? "up" : "down",
        },
        countChange: {
          amount: changeCount,
          direction: changeCount >= 0 ? "up" : "down",
        },
      };
    }

    res.json({
      success: true,
      data: {
        summary: result.summary,
        byCategory: byCategoryWithPercentage,
        dailyTrend: result.dailyTrend,
        comparison,
      },
    });
  } catch (error) {
    console.error(`Error generating expense summary: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while generating expense summary",
    });
  }
});

// @desc    Update expense with transaction support
// @route   PUT /api/expenses/:id
// @access  Private/Admin
const updateExpense = asyncHandler(async (req, res) => {
  const session = await Expense.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { description, amount, category, date } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID format",
      });
    }

    const expense = await Expense.findById(id).session(session);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user has permission to update (example)
    // if (!expense.addedBy.equals(req.user._id) && !req.user.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Not authorized to update this expense"
    //   });
    // }

    const updates = {};
    if (description) updates.description = description;
    if (amount) updates.amount = parseFloat(amount);
    if (category) updates.category = category;

    if (date) {
      const newDate = moment(date);
      updates.date = newDate.toDate();
      updates.month = newDate.format("MMMM");
      updates.year = newDate.format("YYYY");
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true, session }
    ).populate("addedBy", "name email");

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      data: updatedExpense,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        success: false,
        messages,
      });
    }

    console.error(`Error updating expense: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while updating expense",
    });
  }
});

// @desc    Delete expense with transaction support
// @route   DELETE /api/expenses/:id
// @access  Private/Admin
const deleteExpense = asyncHandler(async (req, res) => {
  const session = await Expense.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID format",
      });
    }

    const expense = await Expense.findById(id).session(session);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    // Check if user has permission to delete (example)
    // if (!expense.addedBy.equals(req.user._id) && !req.user.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Not authorized to delete this expense"
    //   });
    // }

    await Expense.findByIdAndDelete(id).session(session);

    // Here you could add any related cleanup operations
    // For example, updating related reports or summaries

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      data: { id },
      message: "Expense deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`Error deleting expense: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Server error while deleting expense",
    });
  }
});

// @desc    Export expenses with improved error handling and streaming for large datasets
// @route   GET /api/expenses/export/:format
// @access  Private/Admin
const exportExpenses = asyncHandler(async (req, res) => {
  try {
    const { format } = req.params;
    const { month, year, category, startDate, endDate } = req.query;

    if (!["csv", "excel"].includes(format)) {
      return res.status(400).json({
        success: false,
        message: "Invalid export format. Use csv or excel",
      });
    }

    // Build the same query as getAllExpenses
    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    } else if (month && year) {
      const start = moment(`${year}-${month}`, "YYYY-MMMM").startOf("month");
      const end = moment(start).endOf("month");
      query.date = { $gte: start.toDate(), $lte: end.toDate() };
    }
    if (category) {
      query.category = category;
    }

    const expensesCursor = Expense.find(query)
      .sort({ date: -1 })
      .populate("addedBy", "name email")
      .cursor(); // Using cursor for memory efficiency

    if (format === "csv") {
      // CSV export with streaming for large datasets
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=expenses-${month || "all"}-${year || "all"}.csv`
      );

      const fields = [
        { label: "Date", value: "date" },
        { label: "Description", value: "description" },
        { label: "Category", value: "category" },
        { label: "Amount", value: "amount" },
        { label: "Added By", value: "addedBy.name" },
      ];

      const json2csv = new Parser({ fields });

      // Write header
      res.write(json2csv.parse([]).split("\n")[0] + "\n");

      // Stream expenses one by one
      for await (const expense of expensesCursor) {
        const row = {
          date: moment(expense.date).format("YYYY-MM-DD"),
          description: expense.description,
          category: expense.category,
          amount: expense.amount,
          "addedBy.name": expense.addedBy?.name || "System",
        };
        res.write(json2csv.parse([row]).split("\n")[1] + "\n");
      }

      res.end();
    } else if (format === "excel") {
      // Excel export with streaming for better memory usage
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=expenses-${month || "all"}-${year || "all"}.xlsx`
      );

      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: res,
        useStyles: true,
        useSharedStrings: true,
      });

      const worksheet = workbook.addWorksheet("Expenses");

      // Add headers with styles
      worksheet.columns = [
        { header: "Date", key: "date", width: 15 },
        { header: "Description", key: "description", width: 40 },
        { header: "Category", key: "category", width: 20 },
        {
          header: "Amount",
          key: "amount",
          width: 15,
          style: { numFmt: "$#,##0.00" },
        },
        { header: "Added By", key: "addedBy", width: 20 },
      ];

      // Write header row with styling
      worksheet.getRow(1).font = { bold: true };

      // Stream expenses to Excel
      let rowNumber = 1;
      for await (const expense of expensesCursor) {
        rowNumber++;
        worksheet
          .addRow({
            date: moment(expense.date).format("YYYY-MM-DD"),
            description: expense.description,
            category: expense.category,
            amount: expense.amount,
            addedBy: expense.addedBy?.name || "System",
          })
          .commit();
      }

      await workbook.commit();
    }
  } catch (error) {
    console.error(`Export error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Error exporting expenses",
        error: error.message,
      });
    }
  }
});

module.exports = {
  createExpense,
  getAllExpenses,
  getExpenseSummary,
  updateExpense,
  deleteExpense,
  exportExpenses,
};

const express = require("express");
const router = express.Router();
const Loan = require("../models/Loan");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { endOfMonth } = require("date-fns");

// Helper function to get date ranges
const getDateRange = (filter) => {
  const now = new Date();
  switch (filter) {
    case "today":
      return {
        start: new Date(now.setHours(0, 0, 0, 0)),
        end: new Date(now.setHours(23, 59, 59, 999)),
      };
    case "thisWeek":
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      return {
        start: new Date(startOfWeek.setHours(0, 0, 0, 0)),
        end: new Date(now.setHours(23, 59, 59, 999)),
      };
    case "thisMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    default:
      return {};
  }
};

// Get all cleanup requests
router.get("/requests", authMiddleware, async (req, res) => {
  try {
    const { sort, filter, search } = req.query;
    let query = {};

    // Apply date filter if specified
    if (filter) {
      const { start, end } = getDateRange(filter);
      if (start && end) query.createdAt = { $gte: start, $lt: end };
    }

    // Apply search if specified
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    // Apply sorting
    const sortQuery = {};
    if (sort === "asc") sortQuery.createdAt = 1;
    if (sort === "desc") sortQuery.createdAt = -1;

    const requests = await CleanUpRequest.find(query).sort(sortQuery);
    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: "Failed to fetch requests." });
  }
});

// Register admin
router.post("/register", async (req, res) => {
  try {
    const { email, password, ...userData } = req.body;

    // Check if email exists
    if (await User.findOne({ email })) {
      return res.status(400).json({ error: "Email already in use." });
    }

    // Create admin user
    const user = new User({
      ...userData,
      email,
      password: await bcrypt.hash(password, 10),
      role: "admin",
    });

    await user.save();
    res.status(201).json({ message: "Admin registered successfully!" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login admin
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Loan summary data
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const [
      totalBorrowed,
      totalUsers,
      totalInterest,
      pendingLoans,
      approvedLoans,
      fullyPaidLoans,
    ] = await Promise.all([
      Loan.aggregate([
        { $group: { _id: null, total: { $sum: "$loanAmount" } } },
      ]),
      User.countDocuments({ role: { $ne: "admin" } }),
      Loan.aggregate([{ $group: { _id: null, total: { $sum: "$interest" } } }]),
      Loan.countDocuments({ status: "pending" }),
      Loan.countDocuments({ status: "approved" }),
      Loan.countDocuments({ status: "fully paid" }),
    ]);

    res.json({
      totalBorrowed: totalBorrowed[0]?.total || 0,
      totalUsers,
      totalInterest: totalInterest[0]?.total || 0,
      pendingLoans,
      approvedLoans,
      fullyPaidLoans,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch summary data." });
  }
});

// Loan operations
router.get("/loans", authMiddleware, async (req, res) => {
  try {
    const loans = await Loan.find().populate("userId", "fullName email");
    res.json(loans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch loans." });
  }
});

router.put("/approve-loan/:id", authMiddleware, async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    );
    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to approve loan." });
  }
});

router.put("/reject-loan/:id", authMiddleware, async (req, res) => {
  try {
    const loan = await Loan.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    res.json({ message: "Loan rejected successfully", loan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reject loan" });
  }
});

router.put("/mark-paid/:id", authMiddleware, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ error: "Loan not found." });

    loan.paidAmount = loan.totalRepayment;
    loan.remainingBalance = 0;
    loan.status = "fully paid";
    await loan.save();

    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to mark loan as paid." });
  }
});

router.put("/partial-payment/:id", authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) return res.status(404).json({ error: "Loan not found." });
    if (amount <= 0 || amount > loan.remainingBalance) {
      return res.status(400).json({ error: "Invalid payment amount." });
    }

    loan.paidAmount += Number(amount);
    loan.remainingBalance = loan.totalRepayment - loan.paidAmount;
    loan.status = loan.remainingBalance === 0 ? "fully paid" : "partially paid";

    await loan.save();
    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process payment." });
  }
});

// add collected interest to the loan
// this is used when the loan is fully paid
router.put("/extend-repayment/:id", authMiddleware, async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found." });

    const currentRepaymentDate = new Date(loan.repaymentDate);
    const newRepaymentDate = new Date(
      currentRepaymentDate.setMonth(currentRepaymentDate.getMonth() + 1)
    );

    loan.repaymentDate = newRepaymentDate;
    loan.extensionCount += 1;
    loan.extensionMonth = format(new Date(), "yyyy-MM"); // Add this line
    await loan.save();

    res.json({ message: "Repayment date extended successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to extend repayment date." });
  }
});

router.put("/assign-category/:id", authMiddleware, async (req, res) => {
  try {
    const { category } = req.body;
    if (!["permanent", "casual"].includes(category)) {
      return res.status(400).json({ message: "Invalid category" });
    }

    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found" });
    if (loan.status !== "approved") {
      return res.status(400).json({
        message: "Loan must be approved to assign a category",
      });
    }

    loan.category = category;
    await loan.save();

    res.json({ message: "Category assigned successfully", loan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to assign category." });
  }
});

router.put("/mark-defaulted/:id", authMiddleware, async (req, res) => {
  try {
    const { reason, extensionCount } = req.body;
    const loan = await Loan.findById(req.params.id);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    loan.status = "defaulted";
    loan.isDefaulted = true;
    loan.defaultedAt = new Date();
    loan.defaultReason = reason || "Repayment period exceeded";
    loan.extensionCount = extensionCount || loan.extensionCount;

    await loan.save();
    res.json({ message: "Loan marked as defaulted", loan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to mark loan as defaulted." });
  }
});

// User management
router.get("/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "admin" } });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
});

router.delete("/delete/:id", authMiddleware, async (req, res) => {
  try {
    await Promise.all([
      Loan.deleteMany({ id: req.params.id }),
      User.findByIdAndDelete(req.params.id),
    ]);
    res.json({ message: "User and associated loans deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete user." });
  }
});

// Loan limit management
router.put("/users/:userId/loan-limits", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      maxTotalLoanAmount,
      maxActiveLoans,
      maxLoanAmountPerRequest,
      changeReason,
    } = req.body;
    const adminUser = req.user;

    // Validate at least one limit is provided
    if (!maxTotalLoanAmount && !maxActiveLoans && !maxLoanAmountPerRequest) {
      return res
        .status(400)
        .json({ message: "At least one limit value must be provided" });
    }

    // Get current limits
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found." });

    // Prepare updates and history
    const updates = {};
    const historyRecords = [];

    const addLimitUpdate = (field, value) => {
      if (value !== undefined) {
        updates[`loanLimits.${field}`] = value;
        historyRecords.push({
          limitType: field,
          oldValue: user.loanLimits?.[field] || 0,
          newValue: value,
          changedBy: adminUser._id,
          changeReason: changeReason || "No reason provided",
        });
      }
    };

    addLimitUpdate("maxTotalLoanAmount", maxTotalLoanAmount);
    addLimitUpdate("maxActiveLoans", maxActiveLoans);
    addLimitUpdate("maxLoanAmountPerRequest", maxLoanAmountPerRequest);

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          ...updates,
          "loanLimits.lastUpdated": new Date(),
          "loanLimits.updatedBy": adminUser._id,
        },
        $push: { limitHistory: { $each: historyRecords } },
      },
      { new: true }
    );

    res.json({
      message: "Loan limits updated successfully",
      user: updatedUser,
      changes: historyRecords,
    });
  } catch (error) {
    console.error("Error updating loan limits:", error);
    res
      .status(500)
      .json({ message: "Failed to update loan limits.", error: error.message });
  }
});

// router.get("/users/:userId/loan-limits", authMiddleware, async (req, res) => {
//   try {
//     const user = await User.findById(req.params.userId)
//       .select("loanLimits limitHistory")
//       .populate("limitHistory.changedBy", "fullName");

//     if (!user) return res.status(404).json({ message: "User not found." });

//     res.json({
//       limits: user.loanLimits,
//       history: user.limitHistory,
//     });
//   } catch (error) {
//     console.error("Error fetching loan limits:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to fetch loan limits.", error: error.message });
//   }
// });

router.post(
  "/users/:userId/check-eligibility",
  authMiddleware,
  async (req, res) => {
    try {
      const { requestedAmount } = req.body;
      const user = await User.findById(req.params.userId);
      if (!user) return res.status(404).json({ message: "User not found." });

      const activeLoans = await Loan.find({
        userId: user._id,
        status: { $in: ["approved", "partially paid"] },
      });

      const totalOutstanding = activeLoans.reduce(
        (sum, loan) => sum + loan.remainingBalance,
        0
      );
      const activeLoanCount = activeLoans.length;

      const violations = [];

      const checkLimit = (type, value, limit) => {
        if (limit > 0 && value > limit) {
          violations.push({
            limitType: type,
            limitValue: limit,
            currentValue: value,
          });
        }
      };

      checkLimit(
        "maxLoanAmountPerRequest",
        requestedAmount,
        user.loanLimits?.maxLoanAmountPerRequest || 0
      );
      checkLimit(
        "maxActiveLoans",
        activeLoanCount,
        user.loanLimits?.maxActiveLoans || 0
      );
      checkLimit(
        "maxTotalLoanAmount",
        totalOutstanding + requestedAmount,
        user.loanLimits?.maxTotalLoanAmount || 0
      );

      res.json({
        eligible: violations.length === 0,
        violations,
        currentUsage: {
          totalOutstanding,
          activeLoanCount,
        },
        limits: user.loanLimits,
      });
    } catch (error) {
      console.error("Error checking eligibility:", error);
      res.status(500).json({
        message: "Failed to check eligibility.",
        error: error.message,
      });
    }
  }
);

// Get loans organized by month and status
router.get("/loans/organized-by-month", authMiddleware, async (req, res) => {
  try {
    const { year, month } = req.query;

    // Build date filter if specific month/year is requested
    let dateFilter = {};
    if (year && month) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      dateFilter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const loans = await Loan.find(dateFilter)
      .populate("userId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    // Organize loans by month and status
    const organizedLoans = {};

    loans.forEach((loan) => {
      const loanDate = new Date(loan.createdAt);
      const monthYear = `${loanDate.getFullYear()}-${(loanDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      const monthName = loanDate.toLocaleString("default", {
        month: "long",
        year: "numeric",
      });

      if (!organizedLoans[monthYear]) {
        organizedLoans[monthYear] = {
          month: monthName,
          monthKey: monthYear,
          approved: [],
          partiallyPaid: [],
          fullyPaid: [],
          defaulted: [],
          pending: [],
          rejected: [],
        };
      }

      // Categorize by status
      if (loan.status === "approved") {
        organizedLoans[monthYear].approved.push(loan);
      } else if (loan.status === "partially paid") {
        organizedLoans[monthYear].partiallyPaid.push(loan);
      } else if (loan.status === "fully paid") {
        organizedLoans[monthYear].fullyPaid.push(loan);
      } else if (loan.status === "defaulted") {
        organizedLoans[monthYear].defaulted.push(loan);
      } else if (loan.status === "pending") {
        organizedLoans[monthYear].pending.push(loan);
      } else if (loan.status === "rejected") {
        organizedLoans[monthYear].rejected.push(loan);
      }
    });

    res.status(200).json(organizedLoans);
  } catch (error) {
    console.error("Error fetching organized loans:", error);
    res.status(500).json({ message: "Failed to fetch organized loans" });
  }
});

// Get user loan history with payments
router.get("/users/:userId/loan-history", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    const loans = await Loan.find({ userId })
      .populate("userId", "fullName email phoneNumber")
      .sort({ createdAt: -1 });

    // Format the response to include payment details
    const loanHistory = loans.map((loan) => ({
      _id: loan._id,
      loanAmount: loan.loanAmount,
      totalRepayment: loan.totalRepayment,
      paidAmount: loan.paidAmount,
      remainingBalance: loan.remainingBalance,
      status: loan.status,
      repaymentDate: loan.repaymentDate,
      createdAt: loan.createdAt,
      category: loan.category,
      payments: loan.payments.map((payment) => ({
        amount: payment.amount,
        date: payment.date,
        reference: payment.reference,
        phone: payment.phone,
        transactionDate: payment.transactionDate,
      })),
    }));

    res.status(200).json(loanHistory);
  } catch (error) {
    console.error("Error fetching user loan history:", error);
    res.status(500).json({ message: "Failed to fetch user loan history" });
  }
});

// Add this route with your other loan operation routes
router.put("/edit-repayment-date/:id", authMiddleware, async (req, res) => {
  try {
    const { repaymentDate } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Validate the loan status allows date editing
    if (!["approved", "partially paid"].includes(loan.status)) {
      return res.status(400).json({
        message:
          "Repayment date can only be edited for approved or partially paid loans",
      });
    }

    // Validate the new date is in the future
    const newDate = new Date(repaymentDate);
    if (newDate <= new Date()) {
      return res.status(400).json({
        message: "Repayment date must be in the future",
      });
    }

    // Update the repayment date
    loan.repaymentDate = newDate;
    await loan.save();

    res.json({
      message: "Repayment date updated successfully",
      loan,
    });
  } catch (error) {
    console.error("Error updating repayment date:", error);
    res.status(500).json({
      message: "Failed to update repayment date",
      error: error.message,
    });
  }
});

// Change from edit-repayment-date to edit-application-date
router.put("/edit-application-date/:id", authMiddleware, async (req, res) => {
  try {
    const { applicationDate } = req.body;
    const loan = await Loan.findById(req.params.id);

    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    const newDate = new Date(applicationDate);
    // const now = new Date();

    // Validate the new date is not in the future
    // if (newDate > now) {
    //   return res.status(400).json({
    //     message: "Application date cannot be in the future",
    //   });
    // }

    // Calculate new repayment date (end of month)
    const newRepaymentDate = endOfMonth(newDate);

    // Update both dates
    loan.createdAt = newDate;
    loan.repaymentDate = newRepaymentDate;
    await loan.save();

    res.json({
      message:
        "Application date updated and repayment date adjusted to end of month",
      loan,
    });
  } catch (error) {
    console.error("Error updating application date:", error);
    res.status(500).json({
      message: "Failed to update application date",
      error: error.message,
    });
  }
});

// Monthly Summary Endpoint
router.get("/loans/cummulative", authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const start = startOfMonth(now);
    const end = endOfMonth(now);

    const [
      totalLoans,
      totalAmount,
      totalInterest,
      repaymentData,
      defaultedLoans,
      categoryData,
    ] = await Promise.all([
      Loan.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      Loan.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: "$loanAmount" } } },
      ]),
      Loan.aggregate([
        { $match: { status: { $in: ["fully paid", "partially paid"] } } },
        { $group: { _id: null, total: { $sum: "$interest" } } },
      ]),
      Loan.aggregate([
        { $match: { status: { $in: ["fully paid", "partially paid"] } } },
        {
          $group: {
            _id: null,
            totalRepaid: { $sum: "$paidAmount" },
            totalExpected: { $sum: "$totalRepayment" },
          },
        },
      ]),
      Loan.countDocuments({
        status: "defaulted",
        defaultedAt: { $gte: start, $lte: end },
      }),
      Loan.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
    ]);

    const repaymentRate = repaymentData[0]?.totalExpected
      ? (repaymentData[0].totalRepaid / repaymentData[0].totalExpected) * 100
      : 0;

    const defaultRate = totalLoans ? (defaultedLoans / totalLoans) * 100 : 0;

    // Convert category data to object
    const categories = {
      permanent:
        categoryData.find((item) => item._id === "permanent")?.count || 0,
      casual: categoryData.find((item) => item._id === "casual")?.count || 0,
    };

    res.json({
      totalLoans,
      totalAmount: totalAmount[0]?.total || 0,
      totalInterest: totalInterest[0]?.total || 0,
      repaymentRate,
      defaultRate,
      ...categories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

// Trend Data Endpoint
router.get("/loans/trend", authMiddleware, async (req, res) => {
  try {
    const monthsBack = parseInt(req.query.months) || 6;
    const endDate = new Date();
    const startDate = subMonths(endDate, monthsBack);

    const monthsInRange = eachMonthOfInterval({
      start: startDate,
      end: endDate,
    }).map((date) => format(date, "MMM yyyy"));

    const trendData = await Loan.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          loanCount: { $sum: 1 },
          totalAmount: { $sum: "$loanAmount" },
          repaidAmount: { $sum: "$paidAmount" },
          expectedAmount: { $sum: "$totalRepayment" },
          defaultedCount: {
            $sum: { $cond: [{ $eq: ["$status", "defaulted"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Initialize with all months
    const result = monthsInRange.map((month) => ({
      month,
      loanCount: 0,
      loanAmount: 0,
      repaymentRate: 0,
      defaultRate: 0,
    }));

    // Fill with actual data
    trendData.forEach((item) => {
      const monthIndex = monthsInRange.indexOf(
        format(new Date(item._id.year, item._id.month - 1), "MMM yyyy")
      );
      if (monthIndex !== -1) {
        result[monthIndex].loanCount = item.loanCount;
        result[monthIndex].loanAmount = item.totalAmount;
        result[monthIndex].repaymentRate =
          item.expectedAmount > 0
            ? (item.repaidAmount / item.expectedAmount) * 100
            : 0;
        result[monthIndex].defaultRate =
          item.loanCount > 0 ? (item.defaultedCount / item.loanCount) * 100 : 0;
      }
    });

    res.json({
      months: result.map((item) => item.month),
      loanCounts: result.map((item) => item.loanCount),
      loanAmounts: result.map((item) => item.loanAmount),
      repaymentRates: result.map((item) => item.repaymentRate),
      defaultRates: result.map((item) => item.defaultRate),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate trend data" });
  }
});

// Monthly Performance Summary
router.get("/monthly-performance", async (req, res) => {
  try {
    const { month } = req.query; // Format: 'yyyy-MM'

    if (!month) {
      return res
        .status(400)
        .json({ error: "Month parameter is required (yyyy-MM)" });
    }

    const startDate = startOfMonth(parseISO(`${month}-01`));
    const endDate = endOfMonth(parseISO(`${month}-01`));

    // Main aggregation pipeline
    const results = await Loan.aggregate([
      {
        $match: {
          $or: [
            { createdAt: { $gte: startDate, $lte: endDate } },
            { repaymentDate: { $gte: startDate, $lte: endDate } },
            { "payments.date": { $gte: startDate, $lte: endDate } },
          ],
        },
      },
      {
        $facet: {
          // Summary statistics
          summary: [
            {
              $group: {
                _id: null,
                totalLoans: { $sum: 1 },
                totalAmountDisbursed: { $sum: "$loanAmount" },
                totalInterestEarned: { $sum: "$interest" },
                totalRepaid: { $sum: "$paidAmount" },
                totalExpected: { $sum: "$totalRepayment" },
                avgLoanSize: { $avg: "$loanAmount" },
                defaultedAmount: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", "defaulted"] },
                      "$remainingBalance",
                      0,
                    ],
                  },
                },
              },
            },
          ],

          // Loans by status
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                totalAmount: { $sum: "$loanAmount" },
              },
            },
          ],

          // Payments timeline
          paymentsTimeline: [
            { $unwind: "$payments" },
            {
              $match: {
                "payments.date": { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$payments.date" },
                },
                dailyTotal: { $sum: "$payments.amount" },
                paymentCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],

          // Category breakdown
          byCategory: [
            {
              $group: {
                _id: "$category",
                count: { $sum: 1 },
                totalAmount: { $sum: "$loanAmount" },
              },
            },
          ],

          // Default analysis
          defaultsAnalysis: [
            {
              $match: {
                status: "defaulted",
                defaultedAt: { $gte: startDate, $lte: endDate },
              },
            },
            {
              $group: {
                _id: "$defaultReason",
                count: { $sum: 1 },
                totalAmount: { $sum: "$remainingBalance" },
              },
            },
          ],
        },
      },
      {
        $project: {
          summary: { $arrayElemAt: ["$summary", 0] },
          byStatus: "$byStatus",
          paymentsTimeline: "$paymentsTimeline",
          byCategory: "$byCategory",
          defaultsAnalysis: "$defaultsAnalysis",
          month: month,
        },
      },
    ]);

    res.json(results[0] || {});
  } catch (error) {
    console.error("Error fetching monthly performance:", error);
    res.status(500).json({ error: "Failed to fetch monthly performance data" });
  }
});

// Available Months with Loan Data
router.get("/available-months", async (req, res) => {
  try {
    const months = await Loan.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
      {
        $project: {
          _id: 0,
          value: {
            $dateToString: {
              format: "%Y-%m",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                  day: 1,
                },
              },
            },
          },
          label: {
            $dateToString: {
              format: "%b %Y",
              date: {
                $dateFromParts: {
                  year: "$_id.year",
                  month: "$_id.month",
                  day: 1,
                },
              },
            },
          },
        },
      },
    ]);

    res.json(months);
  } catch (error) {
    console.error("Error fetching available months:", error);
    res.status(500).json({ error: "Failed to fetch available months" });
  }
});

// Admin credentials
router.put("/change-credentials", authMiddleware, async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await User.findById(req.user.id);
    if (!admin) return res.status(404).json({ error: "Admin not found." });

    admin.username = username;
    if (password) admin.password = await bcrypt.hash(password, 10);

    await admin.save();
    res.json({ message: "Admin credentials updated successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to update credentials." });
  }
});

module.exports = router;

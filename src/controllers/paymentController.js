const Payment = require("../models/Payment");
const Expense = require("../models/Expense");
const Plot = require("../models/Plot");
const asyncHandler = require("express-async-handler");
const moment = require("moment");

// @desc    Get all payments for a plot
// @route   GET /api/payments/plot/:plotId
// @access  Private/Admin
const getPaymentsByPlot = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ plot: req.params.plotId }).sort({
    dueDate: 1,
  });
  res.json(payments);
});

// @desc    Create a payment schedule
// @route   POST /api/payments
// @access  Private/Admin
const createPayment = asyncHandler(async (req, res) => {
  const { plot, expectedAmount, dueDate } = req.body;

  const plotExists = await Plot.findById(plot);
  if (!plotExists) {
    res.status(400);
    throw new Error("Plot not found");
  }

  const month = moment(dueDate).format("MMMM");
  const year = moment(dueDate).format("YYYY");

  const payment = await Payment.create({
    plot,
    expectedAmount,
    paidAmount: 0,
    dueDate,
    month,
    year,
  });

  if (payment) {
    // Add payment to plot
    plotExists.paymentSchedules.push(payment._id);
    await plotExists.save();

    res.status(201).json(payment);
  } else {
    res.status(400);
    throw new Error("Invalid payment data");
  }
});

// @desc    Update payment schedule
// @route   PUT /api/payments/:id
// @access  Private/Admin
const updatePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (payment) {
    payment.expectedAmount = req.body.expectedAmount || payment.expectedAmount;
    payment.paidAmount = req.body.paidAmount || payment.paidAmount;
    payment.dueDate = req.body.dueDate || payment.dueDate;
    payment.isPaid =
      req.body.isPaid !== undefined ? req.body.isPaid : payment.isPaid;

    if (req.body.dueDate) {
      payment.month = moment(req.body.dueDate).format("MMMM");
      payment.year = moment(req.body.dueDate).format("YYYY");
    }

    const updatedPayment = await payment.save();

    res.json(updatedPayment);
  } else {
    res.status(404);
    throw new Error("Payment not found");
  }
});

// @desc    Delete payment schedule
// @route   DELETE /api/payments/:id
// @access  Private/Admin
// @desc    Delete a payment
// @route   DELETE /api/payments/:id
// @access  Private/Admin
const deletePayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error("Payment not found");
  }

  try {
    // Remove payment from plot's paymentSchedules array
    await Plot.findByIdAndUpdate(
      payment.plot,
      { $pull: { paymentSchedules: payment._id } },
      { new: true }
    );

    // Delete the payment document
    await Payment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Payment removed successfully",
    });
  } catch (error) {
    res.status(500);
    throw new Error("Error deleting payment");
  }
});

// @desc    Transfer payments to next month (create duplicates with paidAmount=0)
// @route   POST /api/payments/transfer/:plotId
// @access  Private/Admin
const transferPayments = asyncHandler(async (req, res) => {
  try {
    const plot = await Plot.findById(req.params.plotId);
    if (!plot) {
      res.status(404);
      throw new Error("Plot not found");
    }

    // Calculate next month details
    const nextMonthDate = new Date();
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const nextMonthName = nextMonthDate.toLocaleString("default", {
      month: "long",
    });
    const nextMonthYear = nextMonthDate.getFullYear().toString();

    // Find current active payments (non-transferred)
    const currentPayments = await Payment.find({
      plot: plot._id,
      carriedOver: { $ne: true },
    });

    if (currentPayments.length === 0) {
      res.status(400);
      throw new Error("No payments available to transfer");
    }

    // Create transferred payments
    const transferredPayments = await Promise.all(
      currentPayments.map(async (payment) => {
        // Create new payment with all original fields except:
        // - Reset paidAmount to 0
        // - Set carriedOver to true
        // - Set isPaid to false
        // - Add previousPayment reference
        const paymentData = {
          ...payment.toObject(), // Copy all existing fields
          _id: undefined, // Let MongoDB generate new ID
          paidAmount: 0,
          isPaid: false,
          carriedOver: true,
          previousPayment: payment._id,
          month: nextMonthName,
          year: nextMonthYear,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const newPayment = await Payment.create(paymentData);

        // Mark original as transferred (optional)
        payment.transferred = true;
        await payment.save();

        return newPayment;
      })
    );

    res.status(200).json({
      success: true,
      count: transferredPayments.length,
      month: `${nextMonthName} ${nextMonthYear}`,
      data: transferredPayments,
      plotNumber: plot.plotNumber, // Include plot number for reference
    });
  } catch (error) {
    console.error("Payment transfer error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Payment transfer failed",
    });
  }
});

// @desc    Transfer ALL payments to next month (for all plots)
// @route   POST /api/payments/transfer-all
// @access  Private/Admin
const transferAllPayments = asyncHandler(async (req, res) => {
  const nextMonth = moment().add(1, "month");
  const nextMonthName = nextMonth.format("MMMM");
  const nextMonthYear = nextMonth.format("YYYY");

  // Get all plots with active payments
  const plotsWithPayments = await Plot.find().populate("paymentSchedules");

  let totalTransferred = 0;
  const results = [];

  // Process each plot
  for (const plot of plotsWithPayments) {
    if (plot.paymentSchedules.length === 0) continue;

    const paymentsToTransfer = await Payment.find({
      plot: plot._id,
      carriedOver: { $ne: true },
    });

    if (paymentsToTransfer.length === 0) continue;

    // Delete existing payments for this plot in next month
    await Payment.deleteMany({
      plot: plot._id,
      month: nextMonthName,
      year: nextMonthYear,
      carriedOver: true,
    });

    const newPayments = await Promise.all(
      paymentsToTransfer.map(async (payment) => {
        const newPayment = await Payment.create({
          plot: plot._id,
          expectedAmount: payment.expectedAmount,
          paidAmount: 0,
          dueDate: nextMonth.toDate(),
          month: nextMonthName,
          year: nextMonthYear,
          carriedOver: true,
          previousPayment: payment._id,
        });

        payment.transferred = true;
        await payment.save();

        plot.paymentSchedules.push(newPayment._id);
        return newPayment;
      })
    );

    await plot.save();
    totalTransferred += newPayments.length;
    results.push({
      plotId: plot._id,
      plotNumber: plot.plotNumber,
      transferredCount: newPayments.length,
    });
  }

  if (totalTransferred === 0) {
    res.status(400);
    throw new Error("No payments available to transfer");
  }

  res.json({
    success: true,
    totalTransferred,
    month: `${nextMonthName} ${nextMonthYear}`,
    results,
  });
});

// @desc    Get monthly summary
// @route   GET /api/payments/summary/:month/:year
// @access  Private/Admin
const getMonthlySummary = asyncHandler(async (req, res) => {
  const { month, year } = req.params;

  // Convert to numbers
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  // Validate inputs
  if (isNaN(monthNum)) {
    return res.status(400).json({ message: "Month must be a number (1-12)" });
  }
  if (isNaN(yearNum)) {
    return res.status(400).json({ message: "Year must be a number" });
  }
  if (monthNum < 1 || monthNum > 12) {
    return res.status(400).json({ message: "Month must be between 1 and 12" });
  }

  try {
    const startDate = new Date(yearNum, monthNum - 1, 1);
    const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

    // Get payment summary
    const [paymentSummary, expenseSummary] = await Promise.all([
      Payment.aggregate([
        {
          $match: {
            dueDate: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalExpected: { $sum: "$expectedAmount" },
            totalPaid: { $sum: "$paidAmount" },
            paymentCount: { $sum: 1 },
            paidCount: {
              $sum: { $cond: [{ $eq: ["$isPaid", true] }, 1, 0] },
            },
            partiallyPaidCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gt: ["$paidAmount", 0] },
                      { $lt: ["$paidAmount", "$expectedAmount"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            unpaidCount: {
              $sum: {
                $cond: [{ $eq: ["$paidAmount", 0] }, 1, 0],
              },
            },
          },
        },
      ]),
      Expense.aggregate([
        {
          $match: {
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: "$amount" },
            expenseCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const paymentResult = paymentSummary[0] || {
      totalExpected: 0,
      totalPaid: 0,
      outstandingAmount: 0,
      paymentCount: 0,
      paidCount: 0,
      partiallyPaidCount: 0,
      unpaidCount: 0,
    };

    const expenseResult = expenseSummary[0] || {
      totalExpenses: 0,
      expenseCount: 0,
    };

    const netProfit = paymentResult.totalPaid - expenseResult.totalExpenses;

    res.json({
      ...paymentResult,
      ...expenseResult,
      netProfit,
      month: monthNum,
      year: yearNum,
      monthName: startDate.toLocaleString("default", { month: "long" }),
    });
  } catch (error) {
    console.error("Error fetching monthly summary:", error);
    res.status(500).json({
      message: "Server error while fetching summary",
      error: error.message,
    });
  }
});

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private/Admin
const getAllPayments = asyncHandler(async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate("plot", "plotNumber location")
      .populate({
        path: "plot",
        populate: {
          path: "location",
          select: "name",
        },
      })
      .populate({
        path: "plot",
        populate: {
          path: "users",
          select: "name mobile",
        },
      })
      .sort({ dueDate: 1 });

    res.json(payments);
  } catch (error) {
    console.error("Error fetching all payments:", error);
    res.status(500).json({
      message: "Server error while fetching payments",
      error: error.message,
    });
  }
});

const getPaymentsByMonth = asyncHandler(async (req, res) => {
  const { month, year } = req.params;

  // Convert month name to number if needed
  let monthNum;
  if (isNaN(month)) {
    monthNum = new Date(`${month} 1, 2020`).getMonth() + 1;
  } else {
    monthNum = parseInt(month);
  }

  const yearNum = parseInt(year);

  const payments = await Payment.find({
    $expr: {
      $and: [
        { $eq: [{ $month: "$dueDate" }, monthNum] },
        { $eq: [{ $year: "$dueDate" }, yearNum] },
      ],
    },
  })
    .populate("plot", "plotNumber location")
    .populate({
      path: "plot",
      populate: {
        path: "location",
        select: "name",
      },
    })
    .sort({ dueDate: 1 });

  res.json(payments);
});

module.exports = {
  getPaymentsByPlot,
  getPaymentsByMonth,
  createPayment,
  updatePayment,
  deletePayment,
  transferPayments,
  transferAllPayments,
  getMonthlySummary,
  getAllPayments,
};

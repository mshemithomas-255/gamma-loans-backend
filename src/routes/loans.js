const express = require("express");
const router = express.Router();
const Loan = require("../models/Loan.js");
const User = require("../models/User.js");
const authMiddleware = require("../middleware/authMiddleware.js");

// Apply for a loan with limit checks
router.post("/apply", authMiddleware, async (req, res) => {
  const { loanAmount } = req.body;
  const userId = req.user.id;

  try {
    // Validate input
    if (!loanAmount) {
      return res.status(400).json({
        message: "Loan amount is required",
        code: "MISSING_FIELDS",
      });
    }

    // Get user with loan limits
    const user = await User.findById(userId).select("+loanLimits");
    if (!user) {
      return res.status(404).json({
        message: "User not found",
        code: "USER_NOT_FOUND",
      });
    }

    // Check active loans
    const activeLoan = await Loan.findOne({
      userId,
      status: { $nin: ["fully paid", "rejected", "defaulted"] },
    });

    if (activeLoan) {
      return res.status(400).json({
        message: "You already have an active loan",
        code: "ACTIVE_LOAN_EXISTS",
        limitInfo: user.loanLimits,
      });
    }

    // Check loan amount against user limits
    if (
      user.loanLimits?.maxLoanAmountPerRequest > 0 &&
      loanAmount > user.loanLimits.maxLoanAmountPerRequest
    ) {
      return res.status(400).json({
        message: `Loan amount exceeds your per-loan limit of ${user.loanLimits.maxLoanAmountPerRequest}`,
        code: "LOAN_LIMIT_EXCEEDED",
        limitInfo: user.loanLimits,
      });
    }

    // Check total outstanding against user limits
    const totalOutstanding = await Loan.aggregate([
      {
        $match: {
          userId: user._id,
          status: { $in: ["approved", "partially paid"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$remainingBalance" },
        },
      },
    ]);

    const currentOutstanding = totalOutstanding[0]?.total || 0;
    if (
      user.loanLimits?.maxTotalLoanAmount > 0 &&
      currentOutstanding + parseFloat(loanAmount) >
        user.loanLimits.maxTotalLoanAmount
    ) {
      return res.status(400).json({
        message: `Loan amount would exceed your total outstanding limit of ${user.loanLimits.maxTotalLoanAmount}`,
        code: "TOTAL_LIMIT_EXCEEDED",
        limitInfo: user.loanLimits,
        currentOutstanding,
      });
    }

    // Calculate loan details
    const interestRate = 0.2; // 20% interest
    const interest = parseFloat(loanAmount) * interestRate;
    const totalRepayment = parseFloat(loanAmount) + interest;

    // Set repayment date to 30 days from now
    const repaymentDate = new Date();
    repaymentDate.setDate(repaymentDate.getDate() + 30);

    // Create new loan
    const loan = new Loan({
      userId,
      loanAmount: parseFloat(loanAmount),
      repaymentDate,
      interest,
      totalRepayment,
      remainingBalance: totalRepayment,
      status: "pending",
    });

    await loan.save();

    // Add loan reference to user's loans array
    await User.findByIdAndUpdate(userId, { $push: { loans: loan._id } });

    res.status(201).json({
      message: "Loan application submitted successfully!",
      loan: {
        ...loan.toObject(),
        interestRate: "20%",
        limitInfo: user.loanLimits,
      },
    });
  } catch (error) {
    console.error("Loan application error:", error);
    res.status(500).json({
      message: "An error occurred while processing your loan application",
      code: "SERVER_ERROR",
      error: error.message,
    });
  }
});

// Enhanced get all loans with limit info
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const [loans, user] = await Promise.all([
      Loan.find({ userId: req.user.id }),
      User.findById(req.user.id).select("loanLimits"),
    ]);

    res.json({
      loans,
      limitInfo: user.loanLimits,
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: "FETCH_ERROR",
    });
  }
});

// Update a pending loan
router.put("/update/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { loanAmount, repaymentDate } = req.body;

    // Find the loan
    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Allow editing only if the loan is pending or rejected
    if (loan.status !== "pending" && loan.status !== "rejected") {
      return res
        .status(400)
        .json({ message: "Only pending or rejected loans can be edited." });
    }

    // Update the loan
    loan.loanAmount = loanAmount;
    loan.repaymentDate = repaymentDate;
    loan.status = "pending"; // Reset status to pending after editing
    await loan.save();

    res.status(200).json({ message: "Loan updated successfully", loan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update loan" });
  }
});

// Delete a pending loan
// DELETE /api/loans/delete/:loanId
router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find the loan
    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found" });
    }

    // Allow deleting only if the loan is pending or rejected
    if (loan.status !== "pending" && loan.status !== "rejected") {
      return res
        .status(400)
        .json({ message: "Only pending or rejected loans can be deleted." });
    }

    // Delete the loan
    await Loan.findByIdAndDelete(id);

    res.status(200).json({ message: "Loan deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete loan" });
  }
});

// Make a partial payment
router.post("/pay", authMiddleware, async (req, res) => {
  const { loanId, amount } = req.body;

  try {
    // Validate payment amount
    if (!amount || isNaN(amount) || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Please enter a valid payment amount." });
    }

    // Find the loan
    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ message: "Loan not found." });
    }

    // Check if the loan is approved
    if (loan.status !== "approved") {
      return res
        .status(400)
        .json({ message: "Only approved loans can be paid." });
    }

    // Check if the payment amount exceeds the remaining balance
    if (amount > loan.remainingBalance) {
      return res
        .status(400)
        .json({ message: "Payment amount exceeds remaining balance." });
    }

    // Update paidAmount and remainingBalance
    loan.paidAmount += amount;
    loan.remainingBalance -= amount;

    // Update loan status
    if (loan.remainingBalance === 0) {
      loan.status = "fully paid";
    } else {
      loan.status = "partially paid";
    }

    await loan.save();
    res.status(200).json({ message: "Payment successful.", loan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred. Please try again." });
  }
});

module.exports = router;

const User = require("../models/User");
const Loan = require("../models/Loan");
const asyncHandler = require("express-async-handler");

const checkLoanLimits = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  // Get active loans
  const activeLoans = await Loan.find({
    userId,
    status: { $in: ["approved", "partially paid"] },
  });

  const totalOutstanding = activeLoans.reduce(
    (sum, loan) => sum + loan.remainingBalance,
    0
  );
  const activeLoanCount = activeLoans.length;

  // Check limits
  if (
    user.loanLimits.maxLoanAmountPerRequest > 0 &&
    amount > user.loanLimits.maxLoanAmountPerRequest
  ) {
    res.status(400);
    throw new Error(
      `Requested amount exceeds your per-loan limit of ${user.loanLimits.maxLoanAmountPerRequest}`
    );
  }

  if (
    user.loanLimits.maxActiveLoans > 0 &&
    activeLoanCount >= user.loanLimits.maxActiveLoans
  ) {
    res.status(400);
    throw new Error(
      `You already have ${activeLoanCount} active loans (limit: ${user.loanLimits.maxActiveLoans})`
    );
  }

  if (
    user.loanLimits.maxTotalLoanAmount > 0 &&
    totalOutstanding + amount > user.loanLimits.maxTotalLoanAmount
  ) {
    res.status(400);
    throw new Error(
      `This loan would exceed your total outstanding limit of ${user.loanLimits.maxTotalLoanAmount}`
    );
  }

  next();
});

module.exports = { checkLoanLimits };

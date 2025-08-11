// controllers/payment.controller.js
const Loan = require("../models/Loan");
const mpesaService = require("../services/mpesa.services");

exports.initiateSTKPush = async (req, res) => {
  try {
    // 1. Validate request data
    const { phone, amount, loanId } = req.body;
    const userId = req.user._id;

    if (!phone || !amount || !loanId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (phone, amount, or loanId)",
      });
    }

    // 2. Validate loan ID format
    // if (
    //   !mongoose.Types.ObjectId.isValid(loanId) ||
    //   !mongoose.Types.ObjectId.isValid(userId)
    // ) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid ID format",
    //     loanId,
    //     userId,
    //   });
    // }

    // 3. Database connection check
    // if (mongoose.connection.readyState !== 1) {
    //   return res.status(503).json({
    //     success: false,
    //     message: "Database connection error",
    //   });
    // }

    // 4. Find loan with proper error handling
    // const loan = await Loan.findOne({
    //   _id: new mongoose.Types.ObjectId(loanId),
    //   userId: new mongoose.Types.ObjectId(userId),
    // }).select("loanAmount remainingBalance status userId");

    const loan = Loan.findOne({ _id: loanId });
    if (!loan) {
      // Diagnostic check
      const existsWithoutUser = await Loan.exists({ _id: loanId });

      return res.status(404).json({
        success: false,
        message: existsWithoutUser
          ? "Loan doesn't belong to current user"
          : "Loan not found in system",
        loanId,
        userId,
      });
    }

    // 5. Validate amount
    if (amount > loan.remainingBalance) {
      return res.status(400).json({
        success: false,
        message: `Amount exceeds remaining balance of ${loan.remainingBalance}`,
        remainingBalance: loan.remainingBalance,
      });
    }

    // 6. Initiate payment (rest of your existing code)
    const accountReference = `LOAN-${loanId}-${Date.now()
      .toString()
      .slice(-4)}`;
    const stkResponse = await mpesaService.initiateSTKPush(
      phone,
      amount,
      accountReference,
      `Loan payment for ${loanId.slice(-6)}`
    );

    // 7. Record payment request
    await Loan.updateOne(
      { _id: loan._id },
      {
        $push: {
          paymentRequests: {
            checkoutRequestID: stkResponse.CheckoutRequestID,
            amount,
            phone,
            status: "pending",
          },
        },
      }
    );

    return res.json({
      success: true,
      message: "Payment initiated",
      data: {
        checkoutRequestID: stkResponse.CheckoutRequestID,
        merchantRequestID: stkResponse.MerchantRequestID,
        amount,
        loanId,
      },
    });
  } catch (error) {
    console.error("Payment initiation failed:", {
      error: error.message,
      stack: error.stack,
      body: req.body,
      user: req.user,
    });

    return res.status(500).json({
      success: false,
      message: "Payment initiation failed",
      error: error.message,
    });
  }
};

// This endpoint will be called by M-Pesa when payment is complete
exports.mpesaCallback = async (req, res) => {
  try {
    const callbackData = req.body;
    const result = mpesaService.handleCallback(callbackData);

    if (!result.success) {
      return res.status(200).json({ message: "Payment failed" });
    }

    const checkoutRequestID = callbackData.Body.stkCallback.CheckoutRequestID;

    // Find and update the loan in one atomic operation
    const updatedLoan = await Loan.findOneAndUpdate(
      {
        "paymentRequests.checkoutRequestID": checkoutRequestID,
        "paymentRequests.status": "pending", // Only match pending requests
      },
      {
        $inc: { paidAmount: result.amount },
        $set: {
          remainingBalance: {
            $subtract: [
              "$totalRepayment",
              { $add: ["$paidAmount", result.amount] },
            ],
          },
          status: {
            $cond: {
              if: {
                $lte: [
                  {
                    $subtract: [
                      "$totalRepayment",
                      { $add: ["$paidAmount", result.amount] },
                    ],
                  },
                  0,
                ],
              },
              then: "fully paid",
              else: "partially paid",
            },
          },
          "paymentRequests.$[elem].status": "completed",
          "paymentRequests.$[elem].processedAt": new Date(),
        },
        $push: {
          payments: {
            amount: result.amount,
            reference: result.mpesaReceiptNumber,
            phone: result.phoneNumber,
            transactionDate: result.transactionDate,
            checkoutRequestID,
          },
        },
      },
      {
        new: true,
        arrayFilters: [{ "elem.checkoutRequestID": checkoutRequestID }],
      }
    );

    if (!updatedLoan) {
      console.error("Loan not found for checkoutRequestID:", checkoutRequestID);
      return res.status(200).json({ message: "Loan not found" });
    }

    res.status(200).json({ message: "Callback processed" });
  } catch (error) {
    console.error("Callback error:", error);
    res.status(500).json({ message: "Error processing callback" });
  }
};

const getAccessToken = async () => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  try {
    const url =
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
    const encodedCredentials = Buffer.from(
      `${consumerKey}: ${consumerSecret}`
    ).toString("base64");
    console.log(`my credentials: ${encodedCredentials}`);

    const headers = { Authorization: `Basic ${encodedCredentials}` };

    const response = await axios.get(url, { headers });
    return response.data.access_token;
  } catch (error) {
    throw new Error("Failed to get access token");
  }
};

// middleware to generate token
const generateToken = async (req, res, next) => {
  try {
    const token = await getAccessToken();
    req.token = token;
    next();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};

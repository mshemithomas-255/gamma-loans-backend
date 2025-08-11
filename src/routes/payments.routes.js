// routes/payment.routes.js
const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const authMiddleware = require("../middleware/authMiddleware");

// Initiate STK Push
router.post("/stkpush", authMiddleware, paymentController.initiateSTKPush);

// M-Pesa callback URL (no auth needed - called by Safaricom)
router.post("/callback", paymentController.mpesaCallback);

module.exports = router;

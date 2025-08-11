const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    checkoutRequestID: {
      type: String,
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    processedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    reference: { type: String, required: true },
    phone: { type: String, required: true },
    transactionDate: { type: String },
    checkoutRequestID: { type: String },
  },
  { _id: false }
);

const loanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  loanAmount: {
    type: Number,
    required: true,
  },
  interest: {
    type: Number,
    required: true,
  },
  totalRepayment: {
    type: Number,
    required: true,
  },
  paidAmount: {
    type: Number,
    default: 0,
  },
  remainingBalance: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: [
      "pending",
      "approved",
      "rejected",
      "partially paid",
      "fully paid",
      "defaulted",
    ],
    default: "pending",
  },
  isDefaulted: {
    type: Boolean,
    default: false,
  },
  defaultedAt: {
    type: Date,
  },
  defaultReason: {
    type: String,
  },
  extensionCount: {
    type: Number,
    default: 0,
  },
  extensionMonth: {
    type: String, // Will store format "yyyy-MM"
    default: null,
  },
  category: {
    type: String,
    enum: ["permanent", "casual"],
    default: "permanent",
  },
  repaymentDate: {
    type: Date,
    required: true,
  },
  payments: [paymentSchema],
  paymentRequests: [paymentRequestSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Add compound index for better query performance
loanSchema.index({
  "paymentRequests.checkoutRequestID": 1,
  "paymentRequests.status": 1,
});

// Remove this line - it's causing the duplicate index
// loanSchema.index({ 'paymentRequests.checkoutRequestID': 1 });

module.exports = mongoose.model("Loan", loanSchema);

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    alternateMobileNumber: { type: String, required: true },
    profilePhoto: { type: String, required: true }, // Firebase Storage URL
    idFrontPhoto: { type: String, required: true }, // Firebase Storage URL
    idBackPhoto: { type: String, required: true }, // Firebase Storage URL
    idNumber: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    loans: [{ type: mongoose.Schema.Types.ObjectId, ref: "Loan" }],
    loanLimits: {
      maxTotalLoanAmount: { type: Number, default: 50000 },
      maxActiveLoans: { type: Number, default: 1 },
      maxLoanAmountPerRequest: { type: Number, default: 20000 },
      lastUpdated: { type: Date },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    limitHistory: [
      {
        limitType: String,
        oldValue: Number,
        newValue: Number,
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        changeReason: String,
        changedAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);

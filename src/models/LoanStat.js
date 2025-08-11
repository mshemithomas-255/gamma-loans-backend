// models/LoanStat.js
const mongoose = require("mongoose");

const loanStatSchema = new mongoose.Schema({
  approved: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  fullyPaid: { type: Number, default: 0 },
});

module.exports = mongoose.model("LoanStat", loanStatSchema);

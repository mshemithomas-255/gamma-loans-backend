// models/PaymentGroup.js
const mongoose = require("mongoose");

const paymentGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  location: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Location",
    required: true,
  },
  expectedAmount: { type: Number, required: true },
  description: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PaymentGroup", paymentGroupSchema);

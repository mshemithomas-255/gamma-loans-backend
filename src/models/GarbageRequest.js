// models/GarbageRequest.js
const mongoose = require("mongoose");

const garbageRequestSchema = new mongoose.Schema({
  plotCode: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  numberOfBags: { type: Number, required: true },
  amountPaid: { type: Number, required: true, default: 0 },
  expectedAmount: { type: Number, required: true },
  status: {
    type: String,
    enum: ["pending", "partial", "paid"],
    default: "pending",
  },
  location: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
  paymentGroup: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentGroup" },
  month: { type: String, required: true }, // Format: "YYYY-MM"
  carriedForwardFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "GarbageRequest",
  },
  paymentHistory: [
    {
      amount: Number,
      date: { type: Date, default: Date.now },
      paymentMethod: String,
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

garbageRequestSchema.index({ plotCode: 1 });
garbageRequestSchema.index({ month: 1 });
garbageRequestSchema.index({ location: 1 });

module.exports = mongoose.model("GarbageRequest", garbageRequestSchema);

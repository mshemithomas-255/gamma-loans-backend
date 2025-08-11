const mongoose = require("mongoose");

const garbageRequestSchema = new mongoose.Schema({
  plotCode: { type: String, required: true },
  fullName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  numberOfBags: { type: Number, required: true },
  amountPaid: { type: Number, required: true },
  expectedAmount: { type: Number, required: true },
  status: { type: String, enum: ["pending", "paid"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

// Index for sorting by plotCode
garbageRequestSchema.index({ plotCode: 1 });

module.exports = mongoose.model("GarbageRequest", garbageRequestSchema);

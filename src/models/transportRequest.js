const mongoose = require("mongoose");

const transportRequestSchema = new mongoose.Schema({
  pickupLocation: { type: String, required: true },
  destination: { type: String, required: true },
  itemDescription: { type: String, required: true },
  dateTime: { type: Date, required: true },
  contactInfo: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "completed"],
    default: "pending",
  },
});

module.exports = mongoose.model("TransportRequest", transportRequestSchema);

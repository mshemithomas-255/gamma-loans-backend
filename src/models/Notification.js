// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  message: { type: String, required: true }, // e.g., "New loan application", "Overdue loan"
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);

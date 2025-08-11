const mongoose = require("mongoose");
const moment = require("moment");

const expenseSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, "Please add a description"],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, "Please add an amount"],
      min: [0, "Amount cannot be negative"],
    },
    category: {
      type: String,
      required: [true, "Please select a category"],
      enum: [
        "Fuel",
        "Maintenance",
        "Salaries",
        "Supplies",
        "Utilities",
        "Other",
      ],
    },
    date: {
      type: Date,
      required: [true, "Please add a date"],
    },
    month: {
      type: String,
    },
    year: {
      type: String,
    },
    receipt: {
      type: String, // URL to uploaded receipt
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

// Set month and year before saving
expenseSchema.pre("save", function (next) {
  this.month = moment(this.date).format("MMMM");
  this.year = moment(this.date).format("YYYY");
  next();
});

module.exports = mongoose.model("Expense", expenseSchema);

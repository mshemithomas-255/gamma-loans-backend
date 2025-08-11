const mongoose = require("mongoose");

const PaymentScheduleSchema = new mongoose.Schema(
  {
    plot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plot",
      required: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },
    expectedAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    owner: {
      type: String,
      required: true,
      trim: true,
    },
    ownerContact: {
      type: String,
      trim: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    payments: [
      {
        amount: {
          type: Number,
          required: true,
          min: 0,
        },
        paymentDate: {
          type: Date,
          default: Date.now,
        },
        recordedAt: {
          type: Date,
          default: Date.now,
        },
        paymentMethod: {
          type: String,
          enum: ["cash", "bank", "mobile", "other"],
          default: "cash",
        },
        recordedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "partial", "paid", "cancelled"],
      default: "pending",
    },
    notes: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    carriedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentSchedule",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for remaining balance
PaymentScheduleSchema.virtual("remainingBalance").get(function () {
  return this.expectedAmount - this.paidAmount;
});

// Compound index to ensure unique combination of plot, month, year and owner
PaymentScheduleSchema.index(
  { plot: 1, month: 1, year: 1, owner: 1 },
  { unique: true }
);

// Update status before saving
PaymentScheduleSchema.pre("save", function (next) {
  if (this.status === "cancelled") {
    return next();
  }

  if (this.paidAmount >= this.expectedAmount) {
    this.status = "paid";
    this.paidAt = this.paidAt || new Date();
  } else if (this.paidAmount > 0) {
    this.status = "partial";
  } else {
    this.status = "pending";
  }

  this.updatedAt = new Date();
  next();
});

// Query helper for active schedules
PaymentScheduleSchema.query.active = function () {
  return this.where({ isActive: true });
};

// Static method to find by period and plot
PaymentScheduleSchema.statics.findByPeriodAndPlot = function (
  plotId,
  month,
  year
) {
  return this.find({ plot: plotId, month, year });
};

// Instance method to add payment
PaymentScheduleSchema.methods.addPayment = function (paymentData) {
  this.payments.push(paymentData);
  this.paidAmount += paymentData.amount;
  return this.save();
};

module.exports = mongoose.model("PaymentSchedule", PaymentScheduleSchema);

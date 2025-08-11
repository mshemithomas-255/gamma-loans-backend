const mongoose = require("mongoose");

const plotSchema = new mongoose.Schema(
  {
    plotNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    bagsRequired: {
      type: Number,
      required: true,
      min: 1,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
      required: true,
    },
    users: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Collector",
          validate: {
            validator: async function (userId) {
              // Check if user is already assigned to another plot
              const existingPlot = await mongoose.model("Plot").findOne({
                users: userId,
                _id: { $ne: this._id }, // Exclude current plot during updates
              });
              return !existingPlot;
            },
            message: "User is already assigned to another plot",
          },
        },
      ],
      default: [],
      validate: [arrayLimit, "Maximum 10 users per plot"],
    },
    paymentSchedules: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Validate maximum users per plot
function arrayLimit(val) {
  return val.length <= 10;
}

// Create compound index to enforce unique user assignments
plotSchema.index(
  { users: 1 },
  {
    unique: true,
    partialFilterExpression: {
      "users.0": { $exists: true }, // Only enforce when users array is not empty
    },
  }
);

// Middleware to clean user array before saving
plotSchema.pre("save", function (next) {
  if (this.isModified("users")) {
    // Remove duplicates
    this.users = [...new Set(this.users.map((id) => id.toString()))];
  }
  next();
});

// Query middleware to populate commonly used fields
plotSchema.pre(/^find/, function (next) {
  this.populate("users", "name mobile email").populate("location", "name");
  next();
});

module.exports = mongoose.model("Plot", plotSchema);

// routes/garbageRoutes.js
const express = require("express");
const router = express.Router();
const GarbageRequest = require("../models/GarbageRequest");
const Location = require("../models/Location");
const auth = require("../middleware/auth");
const paymentGroup = require("../models/paymentGroup");

// Helper function to get current month in YYYY-MM format
const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

// Get all requests with filters
router.get("/", auth, async (req, res) => {
  try {
    const {
      sort = "desc",
      filter = "",
      search = "",
      month = getCurrentMonth(),
      location,
    } = req.query;

    let query = {};
    let sortOption = { createdAt: -1 };

    if (month) query.month = month;
    if (location) query.location = location;

    if (filter === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: today };
    } else if (filter === "thisWeek") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      query.createdAt = { $gte: oneWeekAgo };
    } else if (filter === "thisMonth") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      query.createdAt = { $gte: oneMonthAgo };
    }

    if (search) {
      query.$or = [
        { plotCode: { $regex: search, $options: "i" } },
        { fullName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    if (sort === "asc") sortOption = { createdAt: 1 };
    else if (sort === "plotCodeAsc") sortOption = { plotCode: 1 };
    else if (sort === "plotCodeDesc") sortOption = { plotCode: -1 };

    const requests = await GarbageRequest.find(query)
      .populate("location")
      .populate("paymentGroup")
      .sort(sortOption);

    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new request
router.post("/", auth, async (req, res) => {
  try {
    const { month = getCurrentMonth(), ...requestData } = req.body;
    const newRequest = new GarbageRequest({
      ...requestData,
      month,
      status:
        requestData.amountPaid >= requestData.expectedAmount
          ? "paid"
          : requestData.amountPaid > 0
          ? "partial"
          : "pending",
    });
    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Forward payment to next month
router.post("/:id/forward", auth, async (req, res) => {
  try {
    const originalRequest = await GarbageRequest.findById(req.params.id);
    if (!originalRequest) {
      return res.status(404).json({ message: "Request not found" });
    }

    // Calculate next month
    const [year, month] = originalRequest.month.split("-").map(Number);
    const nextMonth =
      month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;

    const newRequest = new GarbageRequest({
      ...originalRequest.toObject(),
      _id: undefined,
      month: nextMonth,
      amountPaid: 0,
      status: "pending",
      carriedForwardFrom: originalRequest._id,
      paymentHistory: [],
    });

    await newRequest.save();
    res.status(201).json(newRequest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Make payment (full or partial)
router.patch("/:id/pay", auth, async (req, res) => {
  try {
    const { amount, paymentMethod = "cash" } = req.body;
    const request = await GarbageRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const newAmountPaid = request.amountPaid + amount;
    let status = "partial";
    if (newAmountPaid >= request.expectedAmount) {
      status = "paid";
    } else if (newAmountPaid > 0) {
      status = "partial";
    } else {
      status = "pending";
    }

    request.amountPaid = newAmountPaid;
    request.status = status;
    request.paymentHistory.push({
      amount,
      paymentMethod,
    });

    await request.save();
    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get monthly summary
router.get("/summary", auth, async (req, res) => {
  try {
    const { month = getCurrentMonth(), location } = req.query;

    const match = { month };
    if (location) match.location = location;

    const summary = await GarbageRequest.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: "$expectedAmount" },
          totalPaid: { $sum: "$amountPaid" },
          pendingCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
            },
          },
          partialCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "partial"] }, 1, 0],
            },
          },
          paidCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "paid"] }, 1, 0],
            },
          },
        },
      },
    ]);

    res.json(
      summary[0] || {
        totalExpected: 0,
        totalPaid: 0,
        pendingCount: 0,
        partialCount: 0,
        paidCount: 0,
      }
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Location routes
router.get("/locations", auth, async (req, res) => {
  try {
    const locations = await Location.find().sort({ name: 1 });
    res.json(locations);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/locations", auth, async (req, res) => {
  try {
    const location = new Location(req.body);
    await location.save();
    res.status(201).json(location);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Payment group routes
router.get("/payment-groups", auth, async (req, res) => {
  try {
    const groups = await paymentGroup.find().populate("location");
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/payment-groups", auth, async (req, res) => {
  try {
    const group = new paymentGroup(req.body);
    await group.save();
    res.status(201).json(group);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;

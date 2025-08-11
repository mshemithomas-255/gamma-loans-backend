const express = require("express");
const CleanUpRequest = require("../models/CleanUpRequest.js");

const router = express.Router();

router.get("/requests", async (req, res) => {
  try {
    const { sort, filter, search } = req.query;

    let query = {};

    // Filter by date (today, this week, this month)
    if (filter) {
      const now = new Date();
      switch (filter) {
        case "today":
          query.createdAt = {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lt: new Date(now.setHours(23, 59, 59, 999)),
          };
          break;
        case "thisWeek":
          const startOfWeek = new Date(
            now.setDate(now.getDate() - now.getDay())
          );
          query.createdAt = {
            $gte: new Date(startOfWeek.setHours(0, 0, 0, 0)),
            $lt: new Date(now.setHours(23, 59, 59, 999)),
          };
          break;
        case "thisMonth":
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          query.createdAt = {
            $gte: startOfMonth,
            $lt: new Date(now.getFullYear(), now.getMonth() + 1, 0),
          };
          break;
        default:
          break;
      }
    }

    // Search by name, phone number, or location
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { plotCode: { $regex: search, $options: "i" } },
      ];
    }

    // Sort by creation date
    let sortQuery = {};
    if (sort === "asc") {
      sortQuery.createdAt = 1;
    } else if (sort === "desc") {
      sortQuery.createdAt = -1;
    }

    const requests = await CleanUpRequest.find(query).sort(sortQuery);
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({ message: "Error fetching requests", error });
  }
});

module.exports = router;
